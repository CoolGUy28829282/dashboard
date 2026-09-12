from datetime import date, timedelta

import pandas as pd

from premarket.candles import resample
from premarket.crt.detect import RangeSpec, detect, setup_state
from premarket.timeutil import at


def bars_from(points, d=date(2026, 9, 11)):
    """5m bars with close at each (HH:MM, price) point; high/low = open/close extremes."""
    rows = []
    prev = points[0][1]
    for hhmm, px in points:
        ts = at(d, hhmm)
        o, c = prev, px
        rows.append((ts, o, max(o, c), min(o, c), c, 1.0))
        prev = c
    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"]).set_index("ts")
    df.index = df.index.tz_convert("UTC")
    return df


def grid(start, end, fn, d=date(2026, 9, 11)):
    out = []
    t = at(d, start)
    while t <= at(d, end):
        out.append((t.strftime("%H:%M"), fn(t)))
        t += timedelta(minutes=5)
    return out


def test_sweep_reclaim_distribution_on_30m():
    # range 09:00–09:30 = 100..110; 09:40 sweeps the low to 97, 30m 09:30 candle closes back inside at 104,
    # then price reaches EQ (105) at 10:10 and the opposite side (110) at 10:30.
    def px(t):
        m = t.hour * 60 + t.minute
        if m < 9 * 60 + 30:
            return 100 + (m - 540) / 25 * 10  # 100 → 110 over the range candle
        if m == 9 * 60 + 40:
            return 97
        if m < 10 * 60:
            return 104
        if m < 10 * 60 + 10:
            return 104.5
        if m < 10 * 60 + 30:
            return 106
        return 111

    bars = bars_from(grid("09:00", "10:40", px))
    spec = RangeSpec("r", "9:00 30m", "execution", 110.0, 100.0, at(date(2026, 9, 11), "09:00"), at(date(2026, 9, 11), "09:30"), timeframe="30m")
    st = detect(spec, bars, resample(bars, "30m"), at(date(2026, 9, 11), "10:45"), 0.25, "30m")
    sw = st.sweeps[0]  # the later touch of 110 is recorded as a sweep of the high, but the confirmed low sweep stays active
    assert sw.side == "low" and sw.at == at(date(2026, 9, 11), "09:40") and sw.extreme == 97
    assert sw.depth_ticks == 12 and sw.closed_inside is True
    assert sw.reclaimed_at == at(date(2026, 9, 11), "09:45")
    assert sw.exec_candle_close == at(date(2026, 9, 11), "10:00")
    assert sw.reached_eq_at == at(date(2026, 9, 11), "10:10") and sw.reached_opposite_at == at(date(2026, 9, 11), "10:30")
    assert st.phase == "complete" and setup_state(sw) == "done"
    assert sw.key_time  # 09:40 is within the first 15 minutes of the 09:30 30m candle


def test_pending_then_expansion():
    def px(t):
        m = t.hour * 60 + t.minute
        return 100 if m < 570 else 96

    bars = bars_from(grid("09:00", "09:40", px))
    spec = RangeSpec("r", "9:00 30m", "execution", 101.0, 99.0, at(date(2026, 9, 11), "09:00"), at(date(2026, 9, 11), "09:30"), timeframe="30m")
    st = detect(spec, bars, resample(bars, "30m"), at(date(2026, 9, 11), "09:45"), 0.25, "30m")
    assert st.phase == "manipulation" and setup_state(st.active) == "pending"
    bars2 = bars_from(grid("09:00", "10:05", px))
    st2 = detect(spec, bars2, resample(bars2, "30m"), at(date(2026, 9, 11), "10:10"), 0.25, "30m")
    assert st2.phase == "expansion" and setup_state(st2.active) == "invalidated"


def test_invalidation_after_confirmation():
    def px(t):
        m = t.hour * 60 + t.minute
        if m < 570:
            return 100
        if m == 575:
            return 96
        if m < 600:
            return 100.5
        return 95  # trades back through the sweep extreme

    bars = bars_from(grid("09:00", "10:10", px))
    spec = RangeSpec("r", "r", "execution", 101.0, 99.0, at(date(2026, 9, 11), "09:00"), at(date(2026, 9, 11), "09:30"), timeframe="30m")
    st = detect(spec, bars, resample(bars, "30m"), at(date(2026, 9, 11), "10:15"), 0.25, "30m")
    assert st.phase == "invalidated" and st.active.invalidated_at == at(date(2026, 9, 11), "10:00")


def test_later_reclaim_for_context_ranges():
    # 15m sweeping candle closes outside, the next 15m closes back inside → confirmed with reclaim_candles=1
    def px(t):
        m = t.hour * 60 + t.minute
        if m < 570:
            return 100
        if m < 585:
            return 96
        return 100.5

    bars = bars_from(grid("09:00", "09:55", px))
    spec = RangeSpec("h4", "5 AM candle", "context", 101.0, 99.0, at(date(2026, 9, 11), "05:00"), at(date(2026, 9, 11), "09:00"), timeframe="15m")
    strict = detect(spec, bars, resample(bars, "15m"), at(date(2026, 9, 11), "10:00"), 0.25, "15m")
    assert strict.phase == "expansion"
    loose = detect(spec, bars, resample(bars, "15m"), at(date(2026, 9, 11), "10:00"), 0.25, "15m", allow_later_reclaim=3)
    assert loose.phase == "manipulation_confirmed" and loose.active.reclaim_candles == 1
    assert loose.active.exec_candle_close == at(date(2026, 9, 11), "10:00")  # close of the candle that reclaimed
