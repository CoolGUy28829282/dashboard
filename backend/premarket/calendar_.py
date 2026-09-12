"""Days to trade: today's events, week strip, month view, structural days (spec 5.3)."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from . import config, instruments
from .models import Calendar, CalEventOut, DayCard, Stat  # noqa: F401
from .providers.base import CalEvent
from .rating import orange_events_in_window, red_folder_events
from .timeutil import iso, parse_hhmm

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def static_holidays() -> tuple[dict[str, str], dict[str, str]]:
    p = config.data_dir() / "static" / "cme_holidays_2026.json"
    if not p.exists():
        return {}, {}
    d = json.loads(p.read_text())
    return {h["date"]: h["name"] for h in d.get("holidays", [])}, {e["date"]: e["name"] for e in d.get("early_closes", [])}


def holiday_for(d: date, events: list[CalEvent]) -> tuple[str | None, str | None]:
    hol, early = static_holidays()
    name = hol.get(d.isoformat())
    if name is None:
        name = next((e.name for e in events if e.impact == "holiday" and e.date == d.isoformat() and e.currency == "USD"), None)
    return name, early.get(d.isoformat())


def to_out(e: CalEvent) -> CalEventOut:
    lo, hi = config.load("rating")["orange_window"]
    return CalEventOut(
        date=e.date,
        time=e.when.strftime("%H:%M") if e.when else None,
        when=iso(e.when),
        name=e.name,
        impact=e.impact,  # type: ignore[arg-type]
        currency=e.currency,
        consensus=e.consensus,
        previous=e.previous,
        actual=e.actual,
        in_window=bool(e.when and parse_hhmm(lo) <= e.when.time() <= parse_hhmm(hi)),
    )


def day_card(instrument: str, d: date, today: date, events: list[CalEvent], wstats: dict[str, Any], bias_conf: int | None = None) -> DayCard:
    evs = [e for e in events if e.date == d.isoformat() and (e.currency == "USD" or e.impact in ("high", "holiday"))]
    hol, early = holiday_for(d, events)
    reasons: list[str] = []
    label = "Trade"
    reds = red_folder_events(events, d)
    if reds:
        label = "No trade"
        reasons.append(f"Red-folder: {', '.join(e.name for e in reds[:2])} at {reds[0].when.strftime('%H:%M') if reds[0].when else 'all day'}")
    elif hol:
        label = "No trade"
        reasons.append(f"CME holiday: {hol}")
    elif early:
        label = "No trade"
        reasons.append(f"Early close: {early}")
    if d.weekday() >= 5:
        label = "No trade"
        reasons.append("Weekend")
    structural = instruments.structural_flags(instrument, d)
    oranges = orange_events_in_window(events, d)
    if label != "No trade":
        for e in oranges:
            label = "Caution"
            reasons.append(f"Orange-folder {e.name} at {e.when.strftime('%H:%M') if e.when else ''}")
        for s in structural:
            if s["id"] in ("roll", "expiry", "quarterly_opex"):
                label = "Caution"
                reasons.append(s["text"])
    wd = WEEKDAYS[d.weekday()]
    ws = wstats.get("by_weekday", {}).get(wd, {})
    stats: dict[str, Stat] = {}
    for key in ("avg_range", "median_range", "p_up", "p_trend", "swept_pdh", "swept_pdl"):
        v = ws.get(key)
        if v is not None:
            stats[key] = v if isinstance(v, Stat) else Stat(**v)
    if label == "Trade" and not reasons:
        ar = stats.get("avg_range")
        reasons.append("No red-folder events and no structural flags")
        if ar and ar.value is not None:
            reasons.append(f"{wd} window averages {ar.value:.0f} pts (n={ar.n})")
    if d == today and bias_conf is not None and label != "No trade":
        reasons.append(f"Today's bias confidence {bias_conf}%")
    return DayCard(
        date=d.isoformat(),
        weekday=wd,
        label=label,
        reasons=reasons[:3],
        events=[to_out(e) for e in evs],
        structural=structural,
        stats=stats,
        is_today=d == today,
        rank=None,
    )  # type: ignore[arg-type]


def rank_cards(cards: list[DayCard]) -> list[DayCard]:
    """Red-folder / holiday days first as No trade; the rest ranked by weekday range, structural flags and oranges."""

    def key(c: DayCard) -> float:
        ar = c.stats.get("avg_range")
        base = ar.value if ar and ar.value is not None else 0.0
        pen = 0.35 * sum(1 for e in c.events if e.impact == "medium" and e.in_window) + 0.5 * sum(
            1 for s in c.structural if s["id"] in ("roll", "expiry", "quarterly_opex")
        )
        return base * (1 - min(pen, 0.9))

    ranked = sorted([c for c in cards if c.label != "No trade"], key=key, reverse=True)
    for i, c in enumerate(ranked):
        c.rank = i + 1
    return cards


def week_and_month(instrument: str, today: date, events: list[CalEvent], wstats: dict[str, Any], bias_conf: int | None) -> tuple[list[DayCard], list[DayCard]]:
    monday = today - timedelta(days=today.weekday())
    week = rank_cards([day_card(instrument, monday + timedelta(days=i), today, events, wstats, bias_conf) for i in range(5)])
    first = today.replace(day=1)
    nxt = first.replace(month=first.month % 12 + 1, year=first.year + (first.month == 12))
    month = rank_cards(
        [
            day_card(instrument, first + timedelta(days=i), today, events, wstats, bias_conf)
            for i in range((nxt - first).days)
            if (first + timedelta(days=i)).weekday() < 5
        ]
    )
    return week, month


def structural_summary(instrument: str, today: date) -> dict[str, Any]:
    fc = instruments.front_contract(instrument, today)
    monday = today - timedelta(days=today.weekday())
    week_flags = {WEEKDAYS[i]: instruments.structural_flags(instrument, monday + timedelta(days=i)) for i in range(5)}
    return {"front": fc.code, "front_long": fc.code_long, "roll": fc.roll.isoformat(), "expiry": fc.expiry.isoformat(), "week": week_flags}


def as_dt(e: CalEvent) -> datetime | None:
    return e.when
