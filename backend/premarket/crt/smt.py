"""SMT divergence at sweeps: NQ vs ES (YM tiebreak); GC vs SI and vs inverse DXY."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from ..candles import between
from ..market import MarketData
from ..models import SMT
from ..timeutil import iso


def _partner_range(bars: pd.DataFrame, start: datetime, end: datetime, inverse: bool) -> tuple[float, float] | None:
    seg = between(bars, start, end)
    if seg.empty:
        return None
    h, l = float(seg["high"].max()), float(seg["low"].min())
    return (-l, -h) if inverse else (h, l)


def check(md: MarketData, range_start: datetime, range_end: datetime, sweep_side: str, sweep_at: datetime, partner: str, tiebreak: str | None) -> SMT:
    """Did the partner make the same new extreme in the 15 minutes around the sweep? If not → divergence."""
    inverse = partner == "DXY_INVERSE"
    bars = md.partner.get(partner)
    if bars is None or bars.empty:
        return SMT(pair=partner, tiebreak=tiebreak, divergent=False, side=None, at=None, detail=f"{partner} bars unavailable")
    pr = _partner_range(bars, range_start, range_end, inverse)
    if pr is None:
        return SMT(pair=partner, tiebreak=tiebreak, divergent=False, side=None, at=None, detail=f"{partner} has no bars for the range")
    ph, pl = pr
    win = between(bars, sweep_at - timedelta(minutes=5), sweep_at + timedelta(minutes=15))
    if win.empty:
        return SMT(pair=partner, tiebreak=tiebreak, divergent=False, side=None, at=None, detail=f"{partner} has no bars at the sweep")
    if inverse:
        wh, wl = -float(win["low"].min()), -float(win["high"].max())
    else:
        wh, wl = float(win["high"].max()), float(win["low"].min())
    confirmed = wh > ph if sweep_side == "high" else wl < pl
    divergent = not confirmed
    label = partner.replace("DXY_INVERSE", "inverse DXY")
    detail = (
        f"{md.instrument} swept its {sweep_side} at {sweep_at.astimezone(md.asof.tzinfo).strftime('%H:%M')} but {label} did not make a new {sweep_side}"
        if divergent
        else f"{label} also made a new {sweep_side} at the sweep: no divergence"
    )
    return SMT(
        pair=label, tiebreak=tiebreak, divergent=divergent, side=sweep_side if divergent else None, at=iso(sweep_at) if divergent else None, detail=detail
    )
