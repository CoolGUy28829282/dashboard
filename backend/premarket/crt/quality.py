"""Setup quality score (0–100) from config/crt.yaml."""

from __future__ import annotations

from datetime import datetime

from .. import config
from ..models import Stat
from ..timeutil import parse_hhmm


def score(
    *,
    on_context_level: bool,
    key_time: bool,
    displacement: bool,
    smt: bool,
    aligned_bias: bool,
    aligned_pd: bool,
    reach_eq: Stat,
    orange_within_30m: bool,
    sweep_pct: float | None,
    confirmation_at: datetime | None,
) -> tuple[int, list[str]]:
    q = config.load("crt")["quality"]
    crt = config.load("crt")
    total = float(q["base"])
    reasons: list[str] = []

    def add(flag: bool, key: str, text: str) -> None:
        nonlocal total
        if flag:
            total += float(q[key])
            reasons.append(f"{text} ({q[key]:+d})")

    add(on_context_level, "context_level", "Swept level is a context-range level")
    add(key_time, "key_time", "Sweep at a key time")
    add(displacement, "displacement", "Displacement on the reclaim")
    add(smt, "smt", "SMT divergence with the partner")
    add(aligned_bias, "aligned_bias", "Aligned with the window bias")
    add(aligned_pd, "aligned_premium_discount", "From discount (long) / premium (short)")
    if reach_eq.value is not None and reach_eq.n >= 30 and reach_eq.value > 0.5:
        bonus = round(float(q["odds_bonus_max"]) * (reach_eq.value - 0.5) / 0.5)
        total += bonus
        reasons.append(f"Measured P(reach EQ) {reach_eq.value:.0%} on n={reach_eq.n} ({bonus:+d})")
    add(orange_within_30m, "penalty_orange_within_30m", "Orange-folder event within 30 minutes")
    add(sweep_pct is not None and sweep_pct > float(crt["max_sweep_pct"]), "penalty_deep_sweep", f"Sweep deeper than {crt['max_sweep_pct']}% of the range")
    late = confirmation_at is not None and confirmation_at.time() >= parse_hhmm(crt["late_confirmation_after"])
    add(late, "penalty_late_confirmation", "Confirmation lands after 11:30")
    return max(0, min(100, round(total))), reasons
