"""Sessions, opening prices, previous day/week levels and the above/below list."""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from . import config
from .candles import between, ohlc, slot_candle
from .market import MarketData
from .models import LevelRow, Levels, Range, SessionStat, Stat
from .timeutil import UTC, at, iso, session_range


def _rng(o: dict | None, start: datetime | None = None, end: datetime | None = None) -> Range:
    if not o:
        return Range()
    return Range(h=o["h"], l=o["l"], o=o["o"], c=o["c"], eq=(o["h"] + o["l"]) / 2, start=iso(start or o["start"]), end=iso(end or o["end"]))


def open_at(md: MarketData, when: datetime) -> float | None:
    """First bar open at/after `when` (within 10 minutes), from the finest bars."""
    df = md.fine
    if df.empty:
        return None
    w = when.astimezone(UTC)
    seg = df[(df.index >= w) & (df.index < w + timedelta(minutes=10))]
    if seg.empty:
        return None
    return float(seg["open"].iloc[0])


def previous_trading_day(md: MarketData) -> date | None:
    d1 = md.d1
    if d1.empty:
        return None
    # daily candle index = candle open (17:00 ET prior day); the candle for trading day T opens on T-1 17:00
    today_open = at(md.trading_date - timedelta(days=1), "17:00").astimezone(UTC)
    prev = d1[d1.index < today_open]
    if prev.empty:
        return None
    return prev.index[-1].tz_convert("America/New_York").date() + timedelta(days=1)


def compute(md: MarketData) -> tuple[Levels, dict[str, SessionStat]]:
    cfg = config.load("sessions")
    d1 = md.d1
    lv = Levels()
    today_open = at(md.trading_date - timedelta(days=1), "17:00").astimezone(UTC)
    prev = d1[d1.index < today_open]
    if not prev.empty:
        p = prev.iloc[-1]
        lv.pdh, lv.pdl, lv.pdc = float(p["high"]), float(p["low"]), float(p["close"])
    # previous week: Monday..Friday daily candles of last week
    monday = md.trading_date - timedelta(days=md.trading_date.weekday())
    pw_start = at(monday - timedelta(days=8), "17:00").astimezone(UTC)
    pw_end = at(monday - timedelta(days=1), "17:00").astimezone(UTC)
    pw = d1[(d1.index >= pw_start) & (d1.index < pw_end)]
    if not pw.empty:
        lv.pwh, lv.pwl = float(pw["high"].max()), float(pw["low"].min())
    # opens
    lv.daily_open = open_at(md, at(md.trading_date - timedelta(days=1), "18:00"))
    lv.midnight_open = open_at(md, at(md.trading_date, "00:00"))
    lv.open_0830 = open_at(md, at(md.trading_date, "08:30"))
    lv.open_0900 = open_at(md, at(md.trading_date, "09:00"))
    lv.open_0930 = open_at(md, at(md.trading_date, "09:30"))
    lv.weekly_open = open_at(md, at(monday - timedelta(days=1), "18:00"))
    first = md.trading_date.replace(day=1)
    while first.weekday() >= 5:
        first += timedelta(days=1)
    lv.monthly_open = open_at(md, at(first - timedelta(days=1), "18:00"))
    if lv.monthly_open is None and not d1.empty:
        m = d1[d1.index >= at(first - timedelta(days=1), "17:00").astimezone(UTC)]
        lv.monthly_open = float(m["open"].iloc[0]) if not m.empty else None
    # sessions
    sessions: dict[str, SessionStat] = {}
    for name, w in cfg["sessions"].items():
        s, e = session_range(w["start"], w["end"], md.trading_date)
        seg = between(md.fine, s, min(e, md.asof))
        o = ohlc(seg)
        lv.sessions[name] = _rng(o, s, e)
        sessions[name] = SessionStat(
            range=None if not o else o["h"] - o["l"],
            avg20=session_avg20(md, w["start"], w["end"]),
            pct_of_avg=None,
            start=iso(s),
            end=iso(e),
            direction=None if not o else ("up" if o["c"] > o["o"] else "down" if o["c"] < o["o"] else "flat"),
        )
        st = sessions[name]
        if st.range is not None and st.avg20.value:
            st.pct_of_avg = round(100 * st.range / st.avg20.value, 1)
    # 4H slots (context ranges) live in crt; here only the above/below list
    lv.above, lv.below = above_below(md, lv)
    return lv, sessions


def session_avg20(md: MarketData, start: str, end: str) -> Stat:
    vals = []
    dates = []
    for k in range(1, 40):
        d = md.trading_date - timedelta(days=k)
        if d.weekday() >= 5:
            continue
        s, e = session_range(start, end, d)
        seg = between(md.m5, s, e)
        if seg.empty:
            continue
        vals.append(float(seg["high"].max() - seg["low"].min()))
        dates.append(d)
        if len(vals) == 20:
            break
    if not vals:
        return Stat(value=None, n=0, unit="pts")
    return Stat(value=float(pd.Series(vals).mean()), n=len(vals), from_=min(dates).isoformat(), to=max(dates).isoformat(), unit="pts")


def _swept_since(md: MarketData, price: float, side: str, since: datetime) -> str | None:
    seg = between(md.fine, since, md.asof)
    if seg.empty:
        return None
    hit = seg[seg["high"] >= price] if side == "high" else seg[seg["low"] <= price]
    return iso(hit.index[0].to_pydatetime()) if not hit.empty else None


def above_below(md: MarketData, lv: Levels) -> tuple[list[LevelRow], list[LevelRow]]:
    last = md.quote.price if md.quote and md.quote.price is not None else None
    if last is None:
        return [], []
    day_start = at(md.trading_date - timedelta(days=1), "17:00")
    monday = md.trading_date - timedelta(days=md.trading_date.weekday())
    week_start = at(monday - timedelta(days=1), "18:00")
    # (id, name, price, kind, formed_at): a level counts as swept only after it formed
    cands: list[tuple[str, str, float | None, str, datetime | None]] = [
        ("pwh", "PWH", lv.pwh, "week", week_start),
        ("pwl", "PWL", lv.pwl, "week", week_start),
        ("pdh", "PDH", lv.pdh, "day", day_start),
        ("pdl", "PDL", lv.pdl, "day", day_start),
        ("pdc", "PDC", lv.pdc, "open", day_start),
        ("midnight_open", "Midnight open", lv.midnight_open, "open", at(md.trading_date, "00:00")),
        ("daily_open", "5 PM open", lv.daily_open, "open", day_start),
        ("weekly_open", "Weekly open", lv.weekly_open, "open", week_start),
        ("open_0830", "8:30 open", lv.open_0830, "open", at(md.trading_date, "08:30")),
        ("open_0900", "9:00 open", lv.open_0900, "open", at(md.trading_date, "09:00")),
    ]
    for name, r in lv.sessions.items():
        if r.h is not None and r.end is not None:
            formed = datetime.fromisoformat(r.end)
            cands.append((f"{name}_h", f"{name.capitalize()} high", r.h, "session", formed))
            cands.append((f"{name}_l", f"{name.capitalize()} low", r.l, "session", formed))
    for slot in ("21:00", "01:00", "05:00"):
        c = slot_candle(md.h4, md.trading_date, slot)
        if c is not None:
            lab = {"21:00": "9 PM", "01:00": "1 AM", "05:00": "5 AM"}[slot]
            st = at(md.trading_date - timedelta(days=1), slot) if slot >= "17:00" else at(md.trading_date, slot)
            formed = st + timedelta(hours=4)
            cands.append((f"h4_{slot.replace(':', '')}_h", f"{lab} high", float(c["high"]), "slot", formed))
            cands.append((f"h4_{slot.replace(':', '')}_l", f"{lab} low", float(c["low"]), "slot", formed))
    above: list[LevelRow] = []
    below: list[LevelRow] = []
    for lid, name, price, kind, formed_at in cands:
        if price is None:
            continue
        dist = price - last
        side = "high" if dist >= 0 else "low"
        swept_at = _swept_since(md, price, side, formed_at) if formed_at is not None and formed_at < md.asof and kind != "open" else None
        row = LevelRow(id=lid, name=name, price=price, distance=round(dist, 2), state="swept" if swept_at else "untested", swept_at=swept_at, kind=kind)
        (above if dist >= 0 else below).append(row)
    above.sort(key=lambda r: r.distance)
    below.sort(key=lambda r: -r.distance)
    return above, below
