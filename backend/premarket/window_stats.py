"""Weekday statistics for the 9:00–12:00 window from stored 5m bars (spec 5.3)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd

from . import config
from .candles import between
from .models import Stat
from .timeutil import at

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]


def _stat(vals: list[float], dates: list[date], unit: str = "") -> dict[str, Any]:
    if not vals:
        return Stat(value=None, n=0, unit=unit).model_dump(by_alias=True)
    return Stat(value=float(pd.Series(vals).mean()), n=len(vals), from_=min(dates).isoformat(), to=max(dates).isoformat(), unit=unit).model_dump(by_alias=True)


def _median(vals: list[float], dates: list[date], unit: str = "") -> dict[str, Any]:
    if not vals:
        return Stat(value=None, n=0, unit=unit).model_dump(by_alias=True)
    return Stat(value=float(pd.Series(vals).median()), n=len(vals), from_=min(dates).isoformat(), to=max(dates).isoformat(), unit=unit).model_dump(
        by_alias=True
    )


def day_record(m5: pd.DataFrame, d: date, tick: float, trend_pct: float = 0.2) -> dict[str, Any] | None:
    ws, we = at(d, "09:00"), at(d, "12:00")
    w = between(m5, ws, we)
    if len(w) < 12:
        return None
    o = float(w["open"].iloc[0])
    c = float(w["close"].iloc[-1])
    h, l = float(w["high"].max()), float(w["low"].min())
    rng = h - l
    hi_t = w["high"].idxmax().tz_convert("America/New_York")
    lo_t = w["low"].idxmin().tz_convert("America/New_York")
    pre = between(m5, at(d, "05:00"), at(d, "09:30"))
    c5 = between(m5, at(d, "05:00"), at(d, "09:00"))
    prev = between(m5, at(d - timedelta(days=1), "17:00"), at(d, "17:00") - timedelta(days=1))
    pd_ = between(m5, at(d - timedelta(days=2), "17:00"), at(d - timedelta(days=1), "17:00"))
    full = between(m5, at(d - timedelta(days=1), "17:00"), at(d, "17:00"))
    rec: dict[str, Any] = {
        "date": d,
        "weekday": d.weekday(),
        "range": rng,
        "move": c - o,
        "up": c > o,
        "trend": rng > 0 and (abs(c - l) <= trend_pct * rng or abs(h - c) <= trend_pct * rng),
        "high_bin": f"{hi_t.hour:02d}:{(hi_t.minute // 30) * 30:02d}",
        "low_bin": f"{lo_t.hour:02d}:{(lo_t.minute // 30) * 30:02d}",
        "swept_pre_high": bool(not pre.empty and h >= float(pre["high"].max()) + tick),
        "swept_pre_low": bool(not pre.empty and l <= float(pre["low"].min()) - tick),
        "swept_5am_high": bool(not c5.empty and h >= float(c5["high"].max()) + tick),
        "swept_5am_low": bool(not c5.empty and l <= float(c5["low"].min()) - tick),
        "swept_pdh": bool(not pd_.empty and h >= float(pd_["high"].max()) + tick),
        "swept_pdl": bool(not pd_.empty and l <= float(pd_["low"].min()) - tick),
        "day_high_in_window": bool(not full.empty and float(full["high"].max()) <= h),
        "day_low_in_window": bool(not full.empty and float(full["low"].min()) >= l),
    }
    _ = prev
    return rec


def compute(m5: pd.DataFrame, end_date: date, tick: float, excluded: set[date], months: int = 12) -> dict[str, Any]:
    cfg = config.load("crt")["stats"]
    months = int(cfg.get("lookback_months", months))
    if m5.empty:
        return {"by_weekday": {}, "lookback": {"days": 0}}
    ny = m5.index.tz_convert("America/New_York")
    start = end_date - timedelta(days=30 * months)
    days = sorted({d for d in ny.date if start <= d < end_date and d.weekday() < 5 and d not in excluded})
    recs = [r for r in (day_record(m5, d, tick) for d in days) if r]
    df = pd.DataFrame(recs)
    out: dict[str, Any] = {
        "lookback": {
            "months": months,
            "days": len(recs),
            "from": days[0].isoformat() if days else None,
            "to": days[-1].isoformat() if days else None,
            "excluded_red_folder": len(excluded),
        },
        "by_weekday": {},
    }
    if df.empty:
        return out
    all_ranges = df["range"]
    for wd in range(5):
        g = df[df["weekday"] == wd]
        if g.empty:
            out["by_weekday"][WEEKDAYS[wd]] = {"n": 0}
            continue
        dates = list(g["date"])
        hb = g["high_bin"].value_counts()
        lb = g["low_bin"].value_counts()
        out["by_weekday"][WEEKDAYS[wd]] = {
            "avg_range": _stat(list(g["range"]), dates, "pts"),
            "median_range": _median(list(g["range"]), dates, "pts"),
            "avg_move": _stat(list(g["move"]), dates, "pts"),
            "p_up": _stat(list(g["up"].astype(float)), dates, "p"),
            "p_trend": _stat(list(g["trend"].astype(float)), dates, "p"),
            "high_time": {k: int(v) for k, v in hb.items()},
            "low_time": {k: int(v) for k, v in lb.items()},
            "swept_pre_high": _stat(list(g["swept_pre_high"].astype(float)), dates, "p"),
            "swept_pre_low": _stat(list(g["swept_pre_low"].astype(float)), dates, "p"),
            "swept_5am_high": _stat(list(g["swept_5am_high"].astype(float)), dates, "p"),
            "swept_5am_low": _stat(list(g["swept_5am_low"].astype(float)), dates, "p"),
            "swept_pdh": _stat(list(g["swept_pdh"].astype(float)), dates, "p"),
            "swept_pdl": _stat(list(g["swept_pdl"].astype(float)), dates, "p"),
            "day_high_in_window": _stat(list(g["day_high_in_window"].astype(float)), dates, "p"),
            "day_low_in_window": _stat(list(g["day_low_in_window"].astype(float)), dates, "p"),
            "range_quartile": int(pd.Series(all_ranges).rank(pct=True)[g.index].mean() * 4) + 1 if len(all_ranges) > 4 else None,
            "n": len(g),
        }
    out["all"] = {"avg_range": _stat(list(df["range"]), list(df["date"]), "pts"), "range_q1": float(all_ranges.quantile(0.25))}
    return out
