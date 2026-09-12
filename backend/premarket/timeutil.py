"""New York time helpers. Store UTC, display New York, never naive."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
UTC = UTC


def now_utc() -> datetime:
    return datetime.now(tz=UTC)


def ny(dt: datetime | None = None) -> datetime:
    """Current (or given) time in New York."""
    return (dt or now_utc()).astimezone(NY)


def to_ny(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("naive datetime")
    return dt.astimezone(NY)


def ny_date(dt: datetime | None = None) -> date:
    return ny(dt).date()


def parse_hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def at(d: date, hhmm: str | time) -> datetime:
    """Wall-clock New York time on date d (DST-aware, returns aware datetime)."""
    t = parse_hhmm(hhmm) if isinstance(hhmm, str) else hhmm
    return datetime.combine(d, t, tzinfo=NY)


def seconds_between(a: datetime, b: datetime) -> float:
    """b - a in seconds. Aware datetimes sharing one tzinfo subtract by wall clock, so go through UTC."""
    return (b.astimezone(UTC) - a.astimezone(UTC)).total_seconds()


def iso(dt: datetime | None) -> str | None:
    return None if dt is None else dt.astimezone(NY).isoformat()


def hhmm(dt: datetime) -> str:
    return dt.astimezone(NY).strftime("%H:%M")


def window_range(start: str, end: str, d: date) -> tuple[datetime, datetime]:
    """A same-day (or overnight, if end <= start) window on trading date d."""
    s, e = at(d, start), at(d, end)
    if e <= s:
        s = s - timedelta(days=1)
    return s, e


def session_range(start: str, end: str, trading_day: date) -> tuple[datetime, datetime]:
    """Session that belongs to `trading_day`. Sessions starting after 17:00 belong to the next day."""
    st = parse_hhmm(start)
    en = parse_hhmm(end)
    if st >= time(17, 0):  # e.g. Asia 20:00–02:00: starts the evening before
        s = at(trading_day - timedelta(days=1), st)
    else:
        s = at(trading_day, st)
    e = at(trading_day, en)
    if e <= s:
        e = at(trading_day, en)
        if e <= s:
            e = e + timedelta(days=1)
    return s, e


# ---- Globex trading-week clock ------------------------------------------------------------


def is_globex_open(dt: datetime, cfg: dict | None = None) -> bool:
    """CME Globex equity/metals: Sun 18:00 → Fri 17:00 ET with a daily 17:00–18:00 halt."""
    cfg = cfg or {"open_dow": 6, "open": "18:00", "close_dow": 4, "close": "17:00"}
    t = ny(dt)
    dow = t.weekday()
    clock = t.time()
    halt_start, halt_end = parse_hhmm(cfg.get("halt_start", "17:00")), parse_hhmm(cfg.get("halt_end", "18:00"))
    if dow == 5:  # Saturday
        return False
    if dow == 6:
        return clock >= parse_hhmm(cfg["open"])
    if dow == 4 and clock >= parse_hhmm(cfg["close"]):
        return False
    return not (halt_start <= clock < halt_end)


def next_globex_open(dt: datetime) -> datetime:
    t = ny(dt)
    probe = t.replace(second=0, microsecond=0)
    for _ in range(60 * 24 * 4):
        if is_globex_open(probe):
            return probe
        probe += timedelta(minutes=1)
    raise RuntimeError("no Globex open found")


@dataclass
class Milestone:
    label: str
    at: datetime
    seconds: int


def next_milestone(dt: datetime, milestones: list[str], trading_days: set[date] | None = None) -> Milestone:
    """The next 9:00 / 9:30 / 12:00 that lies inside an open Globex session.

    Never counts into a closed session: on Saturday it points at Monday 9:00 (or the next
    trading day if a set of trading days is supplied).
    """
    t = ny(dt)
    for day_offset in range(0, 8):
        d = t.date() + timedelta(days=day_offset)
        if trading_days is not None and d not in trading_days:
            continue
        if d.weekday() >= 5:
            continue
        for m in milestones:
            target = at(d, m)
            if target > t and is_globex_open(target):
                return Milestone(label=f"{_label(m)}", at=target, seconds=int(seconds_between(t, target)))
    raise RuntimeError("no milestone within a week")


def _label(m: str) -> str:
    return {"09:00": "9:00 window open", "09:30": "9:30 RTH open", "12:00": "12:00 stand down"}.get(m, m)


def trading_date_for(dt: datetime, daily_open: str = "17:00") -> date:
    """Trading date under the chosen daily anchor: after 17:00 ET the bar belongs to tomorrow."""
    t = ny(dt)
    if t.time() >= parse_hhmm(daily_open):
        return t.date() + timedelta(days=1)
    return t.date()


def dst_offset_hours(d: date) -> int:
    return int(at(d, "12:00").utcoffset().total_seconds() // 3600)  # type: ignore[union-attr]
