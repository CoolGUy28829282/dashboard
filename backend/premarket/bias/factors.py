"""Directional factors. Each returns FactorResult(score∈[-1,1], condition, reason, inputs) or None when inputs are missing."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import pandas as pd

from ..candles import between
from ..crt.detect import RangeState
from ..market import MarketData
from ..models import Levels, SessionStat
from ..timeutil import at

LABELS = {
    "overnight_structure": "Overnight structure",
    "htf_context": "Higher-timeframe context",
    "crt_state": "CRT state of the 1 / 5 / 9 AM and daily ranges",
    "intermarket": "Intermarket",
    "news_sentiment": "News sentiment",
    "weekday_tendency": "Weekday tendency",
}


@dataclass
class FactorResult:
    id: str
    score: float
    condition: str | None
    reason: str
    inputs: dict[str, Any] = field(default_factory=dict)


def _clamp(x: float) -> float:
    return max(-1.0, min(1.0, x))


# ---- overnight structure -------------------------------------------------------------------


def overnight_condition(px: float, pdh: float, pdl: float, on_high: float, on_low: float) -> str:
    swept_h, swept_l = on_high > pdh, on_low < pdl
    if swept_l and px > pdl:
        return "swept_pdl_reclaimed"
    if swept_h and px < pdh:
        return "swept_pdh_reclaimed"
    if px > pdh:
        return "holding_above_pdh"
    if px < pdl:
        return "holding_below_pdl"
    mid = (pdh + pdl) / 2
    return "inside_upper_half" if px >= mid else "inside_lower_half"


def overnight_structure(md: MarketData, lv: Levels, sessions: dict[str, SessionStat]) -> FactorResult | None:
    px = md.quote.price if md.quote else None
    if px is None or lv.pdh is None or lv.pdl is None:
        return None
    on = between(md.fine, at(md.trading_date - timedelta(days=1), "17:00"), md.asof)
    if on.empty:
        return None
    on_h, on_l = float(on["high"].max()), float(on["low"].min())
    cond = overnight_condition(px, lv.pdh, lv.pdl, on_h, on_l)
    asia = sessions.get("asia")
    lon = sessions.get("london")
    parts = []
    score = {
        "swept_pdl_reclaimed": 0.6,
        "swept_pdh_reclaimed": -0.6,
        "holding_above_pdh": 0.4,
        "holding_below_pdl": -0.4,
        "inside_upper_half": 0.15,
        "inside_lower_half": -0.15,
    }[cond]
    for name, s in (("Asia", asia), ("London", lon)):
        if s and s.direction in ("up", "down"):
            score += 0.1 if s.direction == "up" else -0.1
            parts.append(f"{name} closed {s.direction}")
    mo = lv.midnight_open
    if mo is not None:
        score += 0.1 if px > mo else -0.1 if px < mo else 0
        parts.append(f"price is {'above' if px > mo else 'below'} the midnight open")
    text = {
        "swept_pdl_reclaimed": "the overnight swept yesterday's low and reclaimed it",
        "swept_pdh_reclaimed": "the overnight swept yesterday's high and fell back inside",
        "holding_above_pdh": "price is holding above yesterday's high",
        "holding_below_pdl": "price is holding below yesterday's low",
        "inside_upper_half": "price sits in the upper half of yesterday's range",
        "inside_lower_half": "price sits in the lower half of yesterday's range",
    }[cond]
    reason = text[0].upper() + text[1:] + ("; " + ", ".join(parts) if parts else "") + "."
    return FactorResult(
        "overnight_structure",
        _clamp(score),
        cond,
        reason,
        {
            "price": px,
            "pdh": lv.pdh,
            "pdl": lv.pdl,
            "overnight_high": on_h,
            "overnight_low": on_l,
            "midnight_open": mo,
            "asia": asia.direction if asia else None,
            "london": lon.direction if lon else None,
        },
    )


# ---- HTF context ---------------------------------------------------------------------------


def htf_context(md: MarketData, lv: Levels) -> FactorResult | None:
    px = md.quote.price if md.quote else None
    d1 = md.d1
    if px is None or d1.empty or lv.pwh is None or lv.pwl is None:
        return None
    last20 = d1.tail(20)
    dh, dl = float(last20["high"].max()), float(last20["low"].min())
    d_pos = (px - dl) / max(dh - dl, 1e-9)
    w_pos = (px - lv.pwl) / max(lv.pwh - lv.pwl, 1e-9)
    daily_pd = "discount" if d_pos < 0.5 else "premium"
    weekly_pd = "discount" if w_pos < 0.5 else "premium"
    cond = f"daily_{daily_pd}_weekly_{weekly_pd}"
    score = (0.5 - d_pos) * 0.8 + (0.5 - w_pos) * 0.6  # discount → bullish lean
    prev = d1.iloc[-2] if len(d1) > 1 else None
    struct = ""
    if prev is not None:
        up = float(prev["close"]) > float(prev["open"])
        score += 0.15 if up else -0.15
        struct = f"yesterday's daily candle closed {'up' if up else 'down'}"
    for _name, ref in (("weekly open", lv.weekly_open), ("monthly open", lv.monthly_open)):
        if ref is not None:
            score += 0.1 if px > ref else -0.1
    reason = (
        f"Price is in {daily_pd} of the 20-day dealing range ({d_pos:.0%} up from its low) and {weekly_pd} of last week's range"
        + (f"; {struct}" if struct else "")
        + "."
    )
    return FactorResult(
        "htf_context",
        _clamp(score),
        cond,
        reason,
        {
            "price": px,
            "dealing_high": dh,
            "dealing_low": dl,
            "pwh": lv.pwh,
            "pwl": lv.pwl,
            "weekly_open": lv.weekly_open,
            "monthly_open": lv.monthly_open,
            "daily_position": round(d_pos, 3),
            "weekly_position": round(w_pos, 3),
        },
    )


# ---- CRT state -----------------------------------------------------------------------------


def crt_condition(ctx: dict[str, RangeState], px: float) -> tuple[str, str]:
    s5 = ctx.get("h4_0500")
    if s5 and s5.sweeps:
        sw = s5.sweeps[-1]
        if sw.closed_inside:
            return ("5am_swept_low_reclaimed" if sw.side == "low" else "5am_swept_high_reclaimed"), f"the 5 AM candle's {sw.side} was swept and reclaimed"
        if sw.closed_inside is False:
            return (
                "5am_expansion_down" if sw.side == "low" else "5am_expansion_up"
            ), f"price expanded {'below' if sw.side == 'low' else 'above'} the 5 AM candle"
    s1 = ctx.get("h4_0100")
    if s1 and s1.sweeps and s1.sweeps[-1].closed_inside:
        sw = s1.sweeps[-1]
        return ("1am_swept_low_reclaimed" if sw.side == "low" else "1am_swept_high_reclaimed"), f"the 1 AM candle's {sw.side} was swept and reclaimed"
    if s5:
        return (
            "5am_intact_upper" if px >= s5.spec.eq else "5am_intact_lower"
        ), f"the 5 AM candle is intact and price is in its {'upper' if px >= s5.spec.eq else 'lower'} half"
    return "no_context", "no 4H context candle available"


def crt_state(md: MarketData, ctx: dict[str, RangeState], odds: dict[str, Any]) -> FactorResult | None:
    px = md.quote.price if md.quote else None
    if px is None or not ctx:
        return None
    cond, text = crt_condition(ctx, px)
    base = {
        "5am_swept_low_reclaimed": 0.6,
        "5am_swept_high_reclaimed": -0.6,
        "5am_expansion_down": -0.3,
        "5am_expansion_up": 0.3,
        "1am_swept_low_reclaimed": 0.4,
        "1am_swept_high_reclaimed": -0.4,
        "5am_intact_upper": 0.15,
        "5am_intact_lower": -0.15,
        "no_context": 0.0,
    }[cond]
    # measured odds scale the magnitude when they exist (P(reach EQ | confirmed) on the 15m)
    tf = odds.get("by_timeframe", {}).get("15m", {})
    r = tf.get("reach_eq") if tf else None
    inputs: dict[str, Any] = {"condition": cond, "price": px}
    if r is not None:
        rv = r if isinstance(r, dict) else r.model_dump(by_alias=True)
        inputs["p_reach_eq_15m"] = rv
        if rv.get("n", 0) >= 30 and rv.get("value") is not None and "reclaimed" in cond:
            base = base * (0.5 + rv["value"])  # 0.5..1.5 scaling around the measured odds
            text += f"; measured P(reach EQ | confirmed) on the 15m is {rv['value']:.0%} (n={rv['n']})"
    s5 = ctx.get("h4_0500")
    if s5:
        inputs.update({"h4_0500": {"h": s5.spec.h, "l": s5.spec.l, "eq": s5.spec.eq, "phase": s5.phase}})
    dp = ctx.get("daily_prev")
    if dp and dp.sweeps:
        sw = dp.sweeps[-1]
        inputs["daily_prev_sweep"] = {"side": sw.side, "closed_inside": sw.closed_inside}
        if sw.closed_inside:
            base += 0.2 if sw.side == "low" else -0.2
            text += f"; yesterday's {sw.side} was swept and reclaimed on the 15m"
    reason = text[0].upper() + text[1:] + "."
    return FactorResult("crt_state", _clamp(base), cond, reason, inputs)


# ---- intermarket ---------------------------------------------------------------------------


def _chg_since(bars: pd.DataFrame, since, asof) -> tuple[float | None, float | None]:
    seg = between(bars, since, asof)
    if seg.empty:
        return None, None
    o, c = float(seg["open"].iloc[0]), float(seg["close"].iloc[-1])
    return c - o, (c - o) / o * 100 if o else None


def intermarket(md: MarketData, real_yield_chg: float | None = None) -> FactorResult | None:
    since = at(md.trading_date - timedelta(days=1), "17:00")
    chg: dict[str, float | None] = {}
    for sym, bars in md.inter.items():
        chg[sym] = _chg_since(bars, since, md.asof)[1]
    if all(v is None for v in chg.values()):
        return None
    score = 0.0
    parts = []

    def take(sym: str, sign: float, thresh: float, label: str) -> None:
        nonlocal score
        v = chg.get(sym)
        if v is None:
            return
        contrib = sign * max(-1.0, min(1.0, v / thresh))
        score += contrib
        parts.append(f"{label} {v:+.2f}%")

    if md.instrument in ("ES", "NQ"):
        take("^VIX", -1.0, 6.0, "VIX")
        take("^TNX", -0.6, 2.0, "10Y")
        take("DX-Y.NYB", -0.4, 0.5, "DXY")
        for s, lab in (("^N225", "Nikkei"), ("^GDAXI", "DAX"), ("^FTSE", "FTSE")):
            take(s, 0.3, 1.0, lab)
        take("YM=F", 0.4, 0.6, "YM")
        take("ES=F" if md.instrument == "NQ" else "NQ=F", 0.5, 0.6, "ES" if md.instrument == "NQ" else "NQ")
        n = 8
    else:
        take("DX-Y.NYB", -1.0, 0.4, "DXY")
        take("^TNX", -0.6, 2.0, "10Y")
        take("SI=F", 0.5, 1.5, "Silver")
        take("CL=F", 0.2, 2.0, "Oil")
        take("^VIX", 0.3, 6.0, "VIX")
        if real_yield_chg is not None:
            score += -max(-1.0, min(1.0, real_yield_chg / 0.05))
            parts.append(f"10Y real yield {real_yield_chg:+.2f}")
        n = 5
    score = _clamp(score / (n * 0.5))
    cond = "risk_on" if score > 0.2 else "risk_off" if score < -0.2 else "mixed"
    if md.instrument == "GC":
        cond = {"risk_on": "dollar_down", "risk_off": "dollar_up", "mixed": "mixed"}[cond]
    reason = (
        ("Intermarket leans " + ("supportive" if score > 0.2 else "against" if score < -0.2 else "mixed") + " since 5 PM: " + ", ".join(parts) + ".")
        if parts
        else "No intermarket data."
    )
    return FactorResult("intermarket", score, cond, reason, {"pct_change_since_1700": chg})


# ---- news sentiment ------------------------------------------------------------------------


def news_sentiment(score: float | None, n_headlines: int, source: str) -> FactorResult | None:
    if score is None or n_headlines == 0:
        return None
    cond = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
    reason = f"{n_headlines} relevant headlines in the last 18 hours read {cond} ({score:+.2f}) by {source}."
    return FactorResult("news_sentiment", _clamp(score), cond, reason, {"score": score, "headlines": n_headlines, "source": source})


# ---- weekday tendency ----------------------------------------------------------------------


def weekday_tendency(wstats: dict[str, Any], d: date) -> FactorResult | None:
    names = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    if d.weekday() >= 5:
        return None
    w = wstats.get("by_weekday", {}).get(names[d.weekday()])
    if not w or not w.get("n"):
        return None
    p = w["p_up"]
    pv = p if isinstance(p, dict) else p.model_dump(by_alias=True)
    if pv["value"] is None:
        return None
    score = _clamp((pv["value"] - 0.5) * 2)
    reason = f"{names[d.weekday()]}s closed the window higher {pv['value']:.0%} of the time (n={pv['n']}, {pv['from']} to {pv['to']}); average move {w['avg_move']['value']:+.1f} pts."
    return FactorResult("weekday_tendency", score, names[d.weekday()], reason, {"p_up": pv, "avg_move": w["avg_move"]})


def historical_conditions(m5: pd.DataFrame, d: date) -> dict[str, str]:
    """Conditions recomputable from bars alone for past mornings (for the evidence tables)."""
    cut = at(d, "08:55")
    pdb = between(m5, at(d - timedelta(days=2), "17:00"), at(d - timedelta(days=1), "17:00"))
    on = between(m5, at(d - timedelta(days=1), "17:00"), cut)
    if pdb.empty or on.empty:
        return {}
    px = float(on["close"].iloc[-1])
    out = {
        "overnight_structure": overnight_condition(px, float(pdb["high"].max()), float(pdb["low"].min()), float(on["high"].max()), float(on["low"].min())),
        "weekday_tendency": ["Mon", "Tue", "Wed", "Thu", "Fri"][d.weekday()],
    }
    c5 = between(m5, at(d, "05:00"), cut)
    c1 = between(m5, at(d, "01:00"), at(d, "05:00"))
    if not c5.empty and not c1.empty:
        h1, l1 = float(c1["high"].max()), float(c1["low"].min())
        # simplified: did the 5 AM candle so far sweep the 1 AM range and come back inside?
        if float(c5["low"].min()) < l1 and px > l1:
            out["crt_state"] = "1am_swept_low_reclaimed"
        elif float(c5["high"].max()) > h1 and px < h1:
            out["crt_state"] = "1am_swept_high_reclaimed"
        else:
            eq5 = (float(c5["high"].max()) + float(c5["low"].min())) / 2
            out["crt_state"] = "5am_intact_upper" if px >= eq5 else "5am_intact_lower"
    last20 = between(m5, at(d - timedelta(days=30), "17:00"), at(d - timedelta(days=1), "17:00"))
    if not last20.empty:
        dh, dl = float(last20["high"].max()), float(last20["low"].min())
        monday = d - timedelta(days=d.weekday())
        pw = between(m5, at(monday - timedelta(days=8), "17:00"), at(monday - timedelta(days=1), "17:00"))
        if not pw.empty:
            d_pos = (px - dl) / max(dh - dl, 1e-9)
            w_pos = (px - float(pw["low"].min())) / max(float(pw["high"].max()) - float(pw["low"].min()), 1e-9)
            out["htf_context"] = f"daily_{'discount' if d_pos < 0.5 else 'premium'}_weekly_{'discount' if w_pos < 0.5 else 'premium'}"
    return out
