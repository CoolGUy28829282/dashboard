"""Weighted scorecard → bias, confidence, scenarios, flip conditions, no-trade list."""

from __future__ import annotations

from datetime import date
from typing import Any

from .. import config
from ..models import Bias, Excluded, Factor, Modifier, Scenario, Setup, SimilarMornings
from . import evidence
from .factors import LABELS, FactorResult


def weights_for(instrument: str) -> dict[str, float]:
    cfg = config.load("bias_weights")
    w = dict(cfg["default"])
    w.update(cfg.get("overrides", {}).get(instrument, {}))
    return w


def score(
    instrument: str,
    results: dict[str, FactorResult | None],
    ev_tables: dict[str, Any],
    modifiers: list[Modifier],
    similar: SimilarMornings | None,
    missing_reasons: dict[str, str],
) -> Bias:
    cfg = config.load("bias_weights")
    w = weights_for(instrument)
    k = float(cfg["evidence"]["shrink_k"])
    min_n = int(cfg["evidence"]["min_n"])
    factors: list[Factor] = []
    excluded: list[Excluded] = []
    for fid, weight in w.items():
        r = results.get(fid)
        if r is None:
            excluded.append(Excluded(id=fid, label=LABELS[fid], why=missing_reasons.get(fid, "inputs unavailable")))
            continue
        ev = evidence.lookup(ev_tables, fid, r.condition)
        src = "heuristic"
        s = r.score
        p_hat = None
        n = None
        reason = r.reason
        if ev and ev.get("n", 0) >= min_n and ev.get("p") is not None:
            n = int(ev["n"])
            p_hat = evidence.shrink(float(ev["p"]), n, k)
            s = 2 * p_hat - 1
            src = "evidence"
            reason = f"{r.reason.rstrip('.')}: on {n} similar mornings the window closed higher {ev['p']:.0%} of the time (shrunk to {p_hat:.0%}, k={k:g})."
        elif ev and ev.get("n", 0) > 0:
            n = int(ev["n"])
            reason = f"{r.reason.rstrip('.')} (heuristic score: only {n} past mornings with this condition, {min_n} needed for evidence)."
        else:
            reason = f"{r.reason.rstrip('.')} (heuristic score: no evidence table for this condition yet)."
        factors.append(
            Factor(
                id=fid,
                label=LABELS[fid],
                score=round(s, 3),
                weight=weight,
                weight_raw=weight,
                source=src,
                condition=r.condition,
                p_hat=round(p_hat, 3) if p_hat is not None else None,
                n=n,
                reason=reason,
                inputs=r.inputs,
            )
        )
    total_w = sum(f.weight_raw for f in factors)
    if total_w > 0:
        for f in factors:
            f.weight = round(f.weight_raw / total_w, 4)
    S = sum(f.weight * f.score for f in factors)
    th = cfg["thresholds"]
    label = "Bullish" if S >= th["bullish"] else "Bearish" if S <= th["bearish"] else "Neutral"
    c = cfg["confidence"]
    conf_raw = c["base"] + c["slope"] * abs(S)
    heavy = sorted(factors, key=lambda f: -f.weight)[:2]
    agree_pen = 0.0
    if len(heavy) == 2 and heavy[0].score * heavy[1].score < 0 and abs(heavy[0].score) > 0.1 and abs(heavy[1].score) > 0.1:
        agree_pen = float(c["disagreement_penalty"])
    mod_total = sum(m.penalty for m in modifiers)
    conf = max(0.0, min(float(c["cap"]), conf_raw - agree_pen - mod_total))
    math = (
        "S = Σ wᵢ·scoreᵢ = " + " + ".join(f"{f.weight:.2f}×{f.score:+.2f}" for f in factors) + f" = {S:+.3f}; "
        f"label: {label} (bullish ≥ {th['bullish']:+.2f}, bearish ≤ {th['bearish']:+.2f}); "
        f"confidence = {c['base']} + {c['slope']}×|S| = {conf_raw:.1f}"
        + (f" − {agree_pen:g} (two heaviest factors disagree)" if agree_pen else "")
        + "".join(f" − {m.penalty:g} ({m.id})" for m in modifiers)
        + f" = {conf:.1f}, capped at {c['cap']}"
    )
    return Bias(
        label=label,
        score=round(S, 4),
        confidence=int(round(conf)),
        confidence_raw=round(conf_raw, 2),
        confidence_math=math,
        factors=factors,
        excluded=excluded,
        modifiers=modifiers,
        similar_mornings=similar,
        narrative="",
        narrative_source="template",
        scenarios={"primary": None, "alternate": None},
        no_trade=[],
        flip_if=[],
        thresholds={"bullish": th["bullish"], "bearish": th["bearish"]},
        agreement_penalty=agree_pen,
    )


def finalize(
    bias: Bias, ideas: list[Setup], setups: list[Setup], window_end: str, levels_ctx: dict[str, Any], rating_label: str, orange_texts: list[str]
) -> Bias:
    """Attach scenarios, flip conditions and no-trade list once the CRT setups exist."""
    primary = next((s for s in setups if s.scenario == "primary"), None)
    alternate = next((s for s in setups if s.scenario == "alternate"), None)

    def sc(s: Setup, name: str) -> Scenario:
        return Scenario(
            name=name,
            direction=s.direction,
            trigger=s.trigger,
            confirmation=s.confirmation,
            entry_zone=f"{s.entry_zone[0]:,.2f}–{s.entry_zone[1]:,.2f}"
            if len(s.entry_zone) == 2 and s.entry_zone[0] != s.entry_zone[1]
            else f"{s.entry_zone[0]:,.2f}",
            target=f"{s.t1:,.2f} (EQ) then {s.t2:,.2f}" + (f" then {s.t3:,.2f}" if s.t3 else ""),
            invalidation=s.invalidation,
            valid=f"Inside the window until {window_end}",
            setup_id=s.id,
        )

    bias.scenarios = {"primary": sc(primary, "Primary") if primary else None, "alternate": sc(alternate, "Alternate") if alternate else None}
    flips: list[str] = []
    s5 = levels_ctx.get("h4_0500")
    if s5:
        if bias.label == "Bullish":
            flips.append(f"A 30m close below the 5 AM low ({s5['l']:,.2f})")
        elif bias.label == "Bearish":
            flips.append(f"A 30m close above the 5 AM high ({s5['h']:,.2f})")
        else:
            flips.append(f"A 30m close outside the 5 AM candle ({s5['l']:,.2f}–{s5['h']:,.2f}) sets the direction")
    dp = levels_ctx.get("daily_prev")
    if dp:
        if bias.label == "Bullish":
            flips.append(f"A sweep of PDH ({dp['h']:,.2f}) that closes back inside on the 15m")
        elif bias.label == "Bearish":
            flips.append(f"A sweep of PDL ({dp['l']:,.2f}) that closes back inside on the 15m")
        else:
            flips.append(f"A reclaimed sweep of PDH ({dp['h']:,.2f}) or PDL ({dp['l']:,.2f}) on the 15m")
    bias.flip_if = flips[:2]
    nt = [f"Stand down at {window_end}", "No entry while an execution candle that swept a level is still open"]
    if rating_label == "No trade":
        nt.insert(0, "Today is rated No trade: nothing is presented as a setup")
    nt.extend(f"Be flat into {t}" for t in orange_texts)
    if bias.confidence < 50:
        nt.append(f"Confidence {bias.confidence}% is below 50")
    bias.no_trade = nt
    return bias


def as_date(s: str) -> date:
    return date.fromisoformat(s)
