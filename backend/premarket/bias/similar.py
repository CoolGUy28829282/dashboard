"""Similar mornings: feature vector at 8:55, k nearest past mornings, what the window did."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..candles import between
from ..models import SimilarMornings
from ..timeutil import at

FEATURES = ["asia_pct", "london_pct", "pos_pdh_pdl", "pos_midnight", "swept_pdh", "swept_pdl", "reclaimed", "c5_pos", "vix_chg", "dxy_chg"]


@dataclass
class Morning:
    date: date
    vec: np.ndarray
    up: bool | None
    move: float | None
    reached_pdh: bool
    reached_pdl: bool


def features_for(
    m5: pd.DataFrame,
    d: date,
    asof_hhmm: str = "08:55",
    vix_chg: float = 0.0,
    dxy_chg: float = 0.0,
    avg_asia: float | None = None,
    avg_london: float | None = None,
) -> np.ndarray | None:
    cut = at(d, asof_hhmm)
    asia = between(m5, at(d - timedelta(days=1), "20:00"), at(d, "02:00"))
    lon = between(m5, at(d, "02:00"), at(d, "05:00"))
    pdb = between(m5, at(d - timedelta(days=2), "17:00"), at(d - timedelta(days=1), "17:00"))
    on = between(m5, at(d - timedelta(days=1), "17:00"), cut)
    c5 = between(m5, at(d, "05:00"), min(cut, at(d, "09:00")))
    if asia.empty or lon.empty or pdb.empty or on.empty or c5.empty:
        return None
    pdh, pdl = float(pdb["high"].max()), float(pdb["low"].min())
    px = float(on["close"].iloc[-1])
    rng = max(pdh - pdl, 1e-9)
    pos = (px - pdl) / rng
    mid = between(m5, at(d, "00:00"), at(d, "00:10"))
    mo = float(mid["open"].iloc[0]) if not mid.empty else float(on["open"].iloc[0])
    swept_pdh = float(on["high"].max()) > pdh
    swept_pdl = float(on["low"].min()) < pdl
    reclaimed = (swept_pdl and px > pdl) or (swept_pdh and px < pdh)
    c5r = max(float(c5["high"].max()) - float(c5["low"].min()), 1e-9)
    c5pos = (float(c5["close"].iloc[-1]) - float(c5["low"].min())) / c5r
    ar = float(asia["high"].max() - asia["low"].min())
    lr = float(lon["high"].max() - lon["low"].min())
    return np.array(
        [
            ar / avg_asia if avg_asia else 1.0,
            lr / avg_london if avg_london else 1.0,
            pos,
            (px - mo) / rng,
            float(swept_pdh),
            float(swept_pdl),
            float(reclaimed),
            c5pos,
            vix_chg / 10.0,
            dxy_chg,
        ]
    )


def outcome(m5: pd.DataFrame, d: date) -> tuple[bool | None, float | None, bool, bool]:
    w = between(m5, at(d, "09:00"), at(d, "12:00"))
    pdb = between(m5, at(d - timedelta(days=2), "17:00"), at(d - timedelta(days=1), "17:00"))
    if len(w) < 12 or pdb.empty:
        return None, None, False, False
    o, c = float(w["open"].iloc[0]), float(w["close"].iloc[-1])
    return c > o, c - o, bool(float(w["high"].max()) >= float(pdb["high"].max())), bool(float(w["low"].min()) <= float(pdb["low"].min()))


def distance(a: np.ndarray, b: np.ndarray, scale: np.ndarray) -> float:
    return float(np.sqrt(np.sum(((a - b) / scale) ** 2)))


def find(
    m5: pd.DataFrame, today: date, today_vec: np.ndarray | None, k: int = 10, lookback_days: int = 365, excluded: set[date] | None = None
) -> SimilarMornings | None:
    if today_vec is None or m5.empty:
        return None
    excluded = excluded or set()
    ny = m5.index.tz_convert("America/New_York")
    days = sorted({d for d in ny.date if today - timedelta(days=lookback_days) <= d < today and d.weekday() < 5 and d not in excluded})
    past: list[Morning] = []
    for d in days:
        v = features_for(m5, d)
        if v is None:
            continue
        up, mv, rh, rl = outcome(m5, d)
        if up is None:
            continue
        past.append(Morning(d, v, up, mv, rh, rl))
    if len(past) < 3:
        return None
    mat = np.array([m.vec for m in past])
    scale = mat.std(axis=0)
    scale[scale == 0] = 1.0
    ranked = sorted(past, key=lambda m: distance(m.vec, today_vec, scale))[:k]
    ups = sum(1 for m in ranked if m.up)
    moves = [m.move for m in ranked if m.move is not None]
    med = float(np.median(moves)) if moves else None
    n = len(ranked)
    text = f"On the {n} most similar past mornings the window closed higher {ups} times and lower {n - ups}; median move {med:+.1f} pts; PDH reached {sum(m.reached_pdh for m in ranked)} times, PDL {sum(m.reached_pdl for m in ranked)} times."
    return SimilarMornings(
        n=n,
        up=ups,
        down=n - ups,
        median_move=med,
        reached_pdh=sum(m.reached_pdh for m in ranked),
        reached_pdl=sum(m.reached_pdl for m in ranked),
        dates=[m.date.isoformat() for m in ranked],
        text=text,
    )
