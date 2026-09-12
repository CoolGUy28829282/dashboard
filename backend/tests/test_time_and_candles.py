from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from premarket.candles import bucket_open, candle_close_time, resample
from premarket.timeutil import NY, at, is_globex_open, next_milestone, seconds_between, session_range, trading_date_for


def make_1m(start: datetime, minutes: int) -> pd.DataFrame:
    idx = pd.date_range(start, periods=minutes, freq="1min")
    px = pd.Series(range(minutes), index=idx, dtype="float64") + 100
    return pd.DataFrame({"open": px, "high": px + 1, "low": px - 1, "close": px + 0.5, "volume": 1.0}, index=idx.tz_convert("UTC"))


def test_sessions_belong_to_trading_day():
    s, e = session_range("20:00", "02:00", date(2026, 9, 11))
    assert s == at(date(2026, 9, 10), "20:00") and e == at(date(2026, 9, 11), "02:00")
    s, e = session_range("02:00", "05:00", date(2026, 9, 11))
    assert s == at(date(2026, 9, 11), "02:00")


def test_trading_date_flips_at_1700():
    assert trading_date_for(at(date(2026, 9, 10), "16:59")) == date(2026, 9, 10)
    assert trading_date_for(at(date(2026, 9, 10), "17:00")) == date(2026, 9, 11)


def test_globex_clock():
    assert not is_globex_open(at(date(2026, 9, 12), "10:00"))  # Saturday
    assert not is_globex_open(at(date(2026, 9, 13), "17:59"))  # Sunday before open
    assert is_globex_open(at(date(2026, 9, 13), "18:00"))
    assert not is_globex_open(at(date(2026, 9, 9), "17:30"))  # daily halt
    assert not is_globex_open(at(date(2026, 9, 11), "17:00"))  # Friday close


def test_countdown_never_counts_into_closed_session():
    m = next_milestone(at(date(2026, 9, 12), "10:00"), ["09:00", "09:30", "12:00"])
    assert m.at == at(date(2026, 9, 14), "09:00")
    m = next_milestone(at(date(2026, 9, 11), "08:00"), ["09:00", "09:30", "12:00"])
    assert m.label.startswith("9:00") and m.seconds == 3600
    m = next_milestone(at(date(2026, 9, 11), "09:10"), ["09:00", "09:30", "12:00"])
    assert m.label.startswith("9:30")


@pytest.mark.parametrize("d", [date(2026, 3, 8), date(2026, 11, 1)])
def test_dst_transition_sessions_and_countdown(d):
    # session windows keep their wall-clock times across the transition day
    s, e = session_range("20:00", "02:00", d)
    assert s.astimezone(NY).strftime("%H:%M") == "20:00" and e.astimezone(NY).strftime("%H:%M") == "02:00"
    hours = seconds_between(s, e) / 3600
    assert hours == (6 if d.month == 3 else 7)  # 02:00 does not exist in March (→ 03:00 EDT); November gains an hour
    # Sunday 01:30 → Monday 09:00; the countdown is measured in real seconds, not wall-clock differences
    m = next_milestone(at(d, "01:30"), ["09:00", "09:30", "12:00"])
    assert m.at == at(d + timedelta(days=1), "09:00")
    assert m.seconds == seconds_between(at(d, "01:30"), at(d + timedelta(days=1), "09:00"))
    assert m.seconds == (31.5 - (1 if d.month == 3 else -1)) * 3600


def test_bucket_open_4h_forex_and_exchange():
    ts = at(date(2026, 9, 11), "07:02")
    assert bucket_open(ts, "4h", "forex") == at(date(2026, 9, 11), "05:00")
    assert bucket_open(ts, "4h", "exchange") == at(date(2026, 9, 11), "06:00")
    assert bucket_open(at(date(2026, 9, 11), "00:30"), "4h", "forex") == at(date(2026, 9, 10), "21:00")
    assert bucket_open(ts, "1d", "forex") == at(date(2026, 9, 10), "17:00")
    assert bucket_open(ts, "1d", "exchange") == at(date(2026, 9, 10), "18:00")
    assert candle_close_time(at(date(2026, 9, 11), "05:00"), "4h") == at(date(2026, 9, 11), "09:00")


@pytest.mark.parametrize("d", [date(2026, 3, 8), date(2026, 11, 1), date(2026, 9, 11)])
def test_resample_alignment_across_dst(d):
    bars = make_1m(at(d - timedelta(days=1), "17:00"), 24 * 60 + 120)
    for tf, opens in (
        ("15m", {"01:00", "01:15", "05:00", "09:00", "09:45"}),
        ("30m", {"01:00", "01:30", "09:00", "09:30"}),
        ("1h", {"01:00", "05:00", "09:00", "10:00"}),
    ):
        out = resample(bars, tf, "forex")
        got = {t.tz_convert(NY).strftime("%H:%M") for t in out.index}
        assert opens <= got, (tf, sorted(got)[:10])
        # every candle opens on the grid
        m = {"15m": 15, "30m": 30, "1h": 60}[tf]
        assert all(t.tz_convert(NY).minute % m == 0 for t in out.index)
    h4 = resample(bars, "4h", "forex")
    got4 = {t.tz_convert(NY).strftime("%H:%M") for t in h4.index}
    assert {"21:00", "01:00", "05:00", "09:00"} <= got4
    h4x = resample(bars, "4h", "exchange")
    two = "03:00" if d == date(2026, 3, 8) else "02:00"  # 2 AM does not exist on the spring-forward day
    assert {"22:00", two, "06:00", "10:00"} <= {t.tz_convert(NY).strftime("%H:%M") for t in h4x.index}
    first = h4[h4.index == at(d, "01:00").astimezone(h4.index.tz)]
    assert not first.empty
    # the 1 AM candle covers 1:00–5:00 wall time (3 or 5 hours of bars on a DST day, 4 otherwise)
    seg = bars[(bars.index >= at(d, "01:00")) & (bars.index < at(d, "05:00"))]
    assert float(first["high"].iloc[0]) == float(seg["high"].max())


def test_resample_ohlc_values():
    bars = make_1m(at(date(2026, 9, 11), "09:00"), 30)
    out = resample(bars, "15m")
    assert len(out) == 2
    assert out["open"].iloc[0] == 100 and out["close"].iloc[0] == 114.5 and out["high"].iloc[0] == 115 and out["low"].iloc[0] == 99
