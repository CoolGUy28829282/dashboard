"""Today's rating: deterministic rubric from config/rating.yaml, applied in order (spec 5.2)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from . import config
from .models import Rating, RatingReason
from .providers.base import CalEvent
from .timeutil import parse_hhmm


@dataclass
class RatingInputs:
    date: date
    events: list[CalEvent]
    holiday: str | None
    early_close: str | None
    confidence: int | None
    bias_label: str | None
    sources_down: list[str]
    structural: list[dict[str, Any]]
    overnight_pct: float | None
    es_nq_conflict: str | None
    weekday_bottom_quartile: bool
    no_readable_range: bool
    contract: str


def red_folder_events(events: list[CalEvent], d: date, cfg: dict[str, Any] | None = None) -> list[CalEvent]:
    cfg = cfg or config.load("rating")["red_folder"]
    cur = set(cfg.get("currencies", ["USD"]))
    scope = cfg.get("scope", "any_time")
    out = []
    for e in events:
        if e.impact != "high" or e.currency not in cur or e.date != d.isoformat():
            continue
        if scope == "before_1200" and e.when is not None and e.when.time() >= parse_hhmm("12:00"):
            continue
        out.append(e)
    return out


def orange_events_in_window(events: list[CalEvent], d: date) -> list[CalEvent]:
    lo, hi = config.load("rating")["orange_window"]
    return [
        e
        for e in events
        if e.impact == "medium" and e.date == d.isoformat() and e.when is not None and parse_hhmm(lo) <= e.when.time() <= parse_hhmm(hi) and e.currency == "USD"
    ]


def _t(e: CalEvent) -> str:
    return e.when.strftime("%H:%M") if e.when else "all day"


def rate(inp: RatingInputs) -> Rating:
    cfg = config.load("rating")
    reasons: list[RatingReason] = []
    checked: list[str] = []
    # --- no trade
    for e in red_folder_events(inp.events, inp.date, cfg["red_folder"]):
        reasons.append(RatingReason(id="red_folder_event", tier="no_trade", text=f"Red-folder {e.currency} event: {e.name} at {_t(e)}"))
    checked.append("red_folder_event")
    if inp.holiday:
        reasons.append(RatingReason(id="cme_holiday", tier="no_trade", text=f"CME holiday: {inp.holiday}"))
    checked.append("cme_holiday")
    if inp.early_close:
        reasons.append(RatingReason(id="early_close", tier="no_trade", text=f"Early close: {inp.early_close}"))
    checked.append("early_close")
    min_conf = next((r.get("min_confidence", 50) for r in cfg["no_trade"] if r["id"] == "low_confidence"), 50)
    if inp.confidence is not None and inp.confidence < min_conf:
        reasons.append(RatingReason(id="low_confidence", tier="no_trade", text=f"Bias confidence {inp.confidence}% is below {min_conf}"))
    checked.append("low_confidence")
    for s in inp.sources_down:
        reasons.append(RatingReason(id="source_unavailable", tier="no_trade", text=f"{s} source unavailable at scan time"))
    checked.append("source_unavailable")
    # --- caution
    oranges = orange_events_in_window(inp.events, inp.date)
    for e in oranges:
        reasons.append(RatingReason(id="orange_event", tier="caution", text=f"Orange-folder {e.name} at {_t(e)} is inside 8:30–12:00"))
    checked.append("orange_event")
    for flag in inp.structural:
        if flag["id"] in ("roll", "expiry"):
            reasons.append(RatingReason(id="roll_or_expiry", tier="caution", text=flag["text"]))
        if flag["id"] == "quarterly_opex":
            reasons.append(RatingReason(id="quarterly_opex", tier="caution", text="Quarterly OPEX"))
    checked.extend(["roll_or_expiry", "quarterly_opex"])
    rule = next((r for r in cfg["caution"] if r["id"] == "overnight_range"), {"low_pct": 40, "high_pct": 150})
    if inp.overnight_pct is not None and (inp.overnight_pct < rule["low_pct"] or inp.overnight_pct > rule["high_pct"]):
        reasons.append(RatingReason(id="overnight_range", tier="caution", text=f"Overnight range is {inp.overnight_pct:.0f}% of its 20-day average"))
    checked.append("overnight_range")
    if inp.es_nq_conflict:
        reasons.append(RatingReason(id="es_nq_conflict", tier="caution", text=f"ES and NQ disagree: {inp.es_nq_conflict}"))
    checked.append("es_nq_conflict")
    if inp.bias_label == "Neutral":
        reasons.append(RatingReason(id="neutral_bias", tier="caution", text="Bias is neutral"))
    checked.append("neutral_bias")
    if inp.weekday_bottom_quartile:
        reasons.append(RatingReason(id="weekday_bottom_quartile", tier="caution", text=f"{inp.date.strftime('%A')} 9–12 range is in its bottom quartile"))
    checked.append("weekday_bottom_quartile")
    if inp.no_readable_range:
        reasons.append(RatingReason(id="no_readable_range", tier="caution", text="Every tracked execution range is already swept on both sides"))
    checked.append("no_readable_range")
    tiers = {r.tier for r in reasons}
    if "no_trade" in tiers:
        label = "No trade"
    elif "caution" in tiers:
        label = "Caution"
    elif inp.confidence is not None and inp.confidence >= cfg["trade"]["min_confidence"]:
        label = "Trade"
    else:
        label = "Caution"
        reasons.append(
            RatingReason(
                id="confidence_below_trade",
                tier="caution",
                text=f"Confidence {inp.confidence}% is below the {cfg['trade']['min_confidence']}% needed for Trade",
            )
        )
    checked.append("trade_min_confidence")
    top = (
        next((r.text for r in reasons if r.tier == "no_trade"), None)
        or next((r.text for r in reasons if r.tier == "caution"), None)
        or "No red-folder events, no structural flags, confidence is high enough"
    )
    return Rating(label=label, top_reason=top, reasons=reasons, plan="", rules_checked=checked)  # type: ignore[arg-type]
