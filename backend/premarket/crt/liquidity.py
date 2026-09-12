"""Liquidity map: pools above and below the live price, sorted by distance."""

from __future__ import annotations

from datetime import timedelta

import pandas as pd

from .. import config
from ..candles import between
from ..market import MarketData
from ..models import LevelRow, Levels
from ..timeutil import at, iso


def equal_extremes(bars15: pd.DataFrame, tick: float, tol_ticks: int, side: str, lookback: int = 96) -> list[tuple[float, str]]:
    """Relative equal highs/lows on 15m: two swing extremes within tolerance."""
    seg = bars15.tail(lookback)
    if len(seg) < 5:
        return []
    col = "high" if side == "high" else "low"
    vals = seg[col].to_numpy()
    idx = seg.index
    swings = []
    for i in range(2, len(vals) - 2):
        if side == "high" and vals[i] >= max(vals[i - 2 : i]) and vals[i] >= max(vals[i + 1 : i + 3]):
            swings.append((float(vals[i]), idx[i]))
        if side == "low" and vals[i] <= min(vals[i - 2 : i]) and vals[i] <= min(vals[i + 1 : i + 3]):
            swings.append((float(vals[i]), idx[i]))
    out = []
    used = set()
    for a in range(len(swings)):
        for b in range(a + 1, len(swings)):
            if b in used or a in used:
                continue
            if abs(swings[a][0] - swings[b][0]) <= tol_ticks * tick:
                px = max(swings[a][0], swings[b][0]) if side == "high" else min(swings[a][0], swings[b][0])
                out.append((px, iso(swings[b][1].to_pydatetime()) or ""))
                used.update({a, b})
    return out


def build(md: MarketData, lv: Levels, tick: float) -> list[LevelRow]:
    last = md.quote.price if md.quote and md.quote.price is not None else None
    if last is None:
        return []
    crt = config.load("crt")
    rows: list[LevelRow] = list(lv.above) + list(lv.below)
    seen = {r.id for r in rows}
    for side in ("high", "low"):
        for px, _when in equal_extremes(md.m15, tick, int(crt.get("equal_highs_tolerance_ticks", 4)), side):
            rid = f"eq_{side}_{px}"
            if rid in seen:
                continue
            seen.add(rid)
            rows.append(LevelRow(id=rid, name=f"Equal {side}s", price=px, distance=round(px - last, 2), kind="equal", state="untested"))
    # swept state for rows without one: did price trade through since 17:00?
    day_start = at(md.trading_date - timedelta(days=1), "17:00")
    seg = between(md.fine, day_start, md.asof)
    for r in rows:
        if r.state == "untested" and not seg.empty:
            hit = seg[seg["high"] >= r.price] if r.distance >= 0 else seg[seg["low"] <= r.price]
            if not hit.empty and r.kind in ("equal",):
                r.state, r.swept_at = "swept", iso(hit.index[0].to_pydatetime())
    rows.sort(key=lambda r: abs(r.distance))
    return rows
