"""CRT statistics for the window from stored bars: by execution timeframe, by hour, by weekday.

Every value is a Stat {value, n, from, to}. Red-folder days are excluded when configured.
Computation: for each past trading day and each execution timeframe, every candle from 09:00 to 11:xx
is a range; the next candle either sweeps its high/low/both/neither; if it sweeps and closes back
inside we follow delivery to EQ / opposite side / invalidation until 12:00.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

from .. import config, history
from ..candles import INTERVAL_MIN, between, candle_close_time, resample
from ..models import Stat
from ..timeutil import UTC, at

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]


def _stat(values: list[float], dates: list[date], unit: str = "") -> dict[str, Any]:
    if not values:
        return Stat(value=None, n=0, unit=unit).model_dump(by_alias=True)
    return Stat(value=float(sum(values) / len(values)), n=len(values), from_=min(dates).isoformat(), to=max(dates).isoformat(), unit=unit).model_dump(
        by_alias=True
    )


def _median(values: list[float], dates: list[date], unit: str = "min") -> dict[str, Any]:
    if not values:
        return Stat(value=None, n=0, unit=unit).model_dump(by_alias=True)
    return Stat(value=float(pd.Series(values).median()), n=len(values), from_=min(dates).isoformat(), to=max(dates).isoformat(), unit=unit).model_dump(
        by_alias=True
    )


def trading_days(m5: pd.DataFrame, end_date: date, months: int) -> list[date]:
    if m5.empty:
        return []
    start = end_date - timedelta(days=30 * months)
    ny = m5.index.tz_convert("America/New_York")
    days = sorted({d for d in ny.date if start <= d < end_date and d.weekday() < 5})
    return days


def candle_events(m5: pd.DataFrame, tf: str, d: date, tick: float, anchor: str) -> list[dict[str, Any]]:
    """Events for one day: each window candle as range, followed until 12:00."""
    ws, we = at(d, "09:00"), at(d, "12:00")
    day5 = between(m5, at(d, "08:00"), we)
    if day5.empty:
        return []
    tf_bars = resample(day5, tf, anchor)
    m = INTERVAL_MIN[tf]
    out = []
    opens = [o for o in tf_bars.index if at(d, "08:00").astimezone(UTC) <= o and o + pd.Timedelta(minutes=m) < we.astimezone(UTC)]
    for o in opens:
        r = tf_bars.loc[o]
        nxt = o + pd.Timedelta(minutes=m)
        if nxt not in tf_bars.index or nxt < ws.astimezone(UTC):
            continue
        c2 = tf_bars.loc[nxt]
        h, l = float(r["high"]), float(r["low"])
        eq = (h + l) / 2
        sh = c2["high"] >= h + 2 * tick
        sl = c2["low"] <= l - 2 * tick
        ev: dict[str, Any] = {"date": d, "tf": tf, "hour": nxt.tz_convert("America/New_York").hour, "sweep_high": bool(sh), "sweep_low": bool(sl)}
        side = "low" if sl and not sh else "high" if sh and not sl else ("low" if sl and c2["close"] > eq else "high" if sh else None)
        ev["side"] = side
        if side:
            ev["closed_inside"] = bool(l <= c2["close"] <= h)
            if ev["closed_inside"]:
                extreme = float(c2["low"]) if side == "low" else float(c2["high"])
                close_t = candle_close_time(nxt.to_pydatetime(), tf)
                after = day5[(day5.index >= close_t.astimezone(UTC))]
                ev.update({"reached_eq": False, "reached_opposite": False, "invalidated": False, "min_to_eq": None, "min_to_opp": None})
                for ts, row in after.iterrows():
                    mins = (ts.to_pydatetime() - close_t).total_seconds() / 60
                    if side == "low":
                        if row["low"] < extreme:
                            ev["invalidated"] = True
                            break
                        if not ev["reached_eq"] and row["high"] >= eq:
                            ev["reached_eq"], ev["min_to_eq"] = True, mins
                        if row["high"] >= h:
                            ev["reached_opposite"], ev["min_to_opp"] = True, mins
                            break
                    else:
                        if row["high"] > extreme:
                            ev["invalidated"] = True
                            break
                        if not ev["reached_eq"] and row["low"] <= eq:
                            ev["reached_eq"], ev["min_to_eq"] = True, mins
                        if row["low"] <= l:
                            ev["reached_opposite"], ev["min_to_opp"] = True, mins
                            break
        out.append(ev)
    return out


def compute(symbol: str, tick: float, end_date: date, excluded_dates: set[date], anchor: str = "forex", m5: pd.DataFrame | None = None) -> dict[str, Any]:
    cfg = config.load("crt")["stats"]
    months = int(cfg.get("lookback_months", 12))
    bars = m5 if m5 is not None else history.load(symbol, "5m")
    days = [d for d in trading_days(bars, end_date, months) if d not in excluded_dates]
    events: list[dict[str, Any]] = []
    for tf in ("15m", "30m", "1h"):
        for d in days:
            events.extend(candle_events(bars, tf, d, tick, anchor))
    df = pd.DataFrame(events)
    result: dict[str, Any] = {
        "lookback": {
            "months": months,
            "days": len(days),
            "from": days[0].isoformat() if days else None,
            "to": days[-1].isoformat() if days else None,
            "excluded_red_folder": len([d for d in excluded_dates if days and days[0] <= d <= days[-1]]),
        }
    }
    if df.empty:
        result["by_timeframe"] = {}
        result["by_hour"] = {}
        result["by_weekday"] = {}
        return result

    def group_stats(g: pd.DataFrame) -> dict[str, Any]:
        dates = list(g["date"])
        swept = g[g["side"].notna()]
        conf = swept[swept["closed_inside"] == True]  # noqa: E712
        out: dict[str, Any] = {
            "sweep_high": _stat(list((g["sweep_high"] & ~g["sweep_low"]).astype(float)), dates, "p"),
            "sweep_low": _stat(list((g["sweep_low"] & ~g["sweep_high"]).astype(float)), dates, "p"),
            "sweep_both": _stat(list((g["sweep_high"] & g["sweep_low"]).astype(float)), dates, "p"),
            "sweep_neither": _stat(list((~g["sweep_high"] & ~g["sweep_low"]).astype(float)), dates, "p"),
            "close_inside_given_sweep": _stat(list(swept["closed_inside"].astype(float)), list(swept["date"]), "p"),
            "reach_eq": _stat(list(conf["reached_eq"].astype(float)), list(conf["date"]), "p"),
            "reach_opposite": _stat(list(conf["reached_opposite"].astype(float)), list(conf["date"]), "p"),
            "invalidated": _stat(list(conf["invalidated"].astype(float)), list(conf["date"]), "p"),
            "median_min_to_t1": _median([float(x) for x in conf["min_to_eq"].dropna()], list(conf[conf["min_to_eq"].notna()]["date"])),
            "median_min_to_t2": _median([float(x) for x in conf["min_to_opp"].dropna()], list(conf[conf["min_to_opp"].notna()]["date"])),
        }
        return out

    result["by_timeframe"] = {tf: group_stats(g) for tf, g in df.groupby("tf")}
    result["by_hour"] = {f"{tf}@{int(h):02d}": group_stats(g) for (tf, h), g in df.groupby(["tf", "hour"])}
    result["by_weekday"] = {f"{tf}@{WEEKDAYS[wd]}": group_stats(g) for (tf, wd), g in df.groupby(["tf", df["date"].map(lambda x: x.weekday())]) if wd < 5}
    return result


def odds_for(stats: dict[str, Any], tf: str, hour: int | None, weekday: str | None) -> tuple[dict[str, Any], str]:
    """Pick the most specific odds bucket with n >= 30, else fall back to the timeframe bucket."""
    for key, scope in (
        (f"{tf}@{hour:02d}" if hour is not None else None, f"{tf} at {hour}:00"),
        (f"{tf}@{weekday}" if weekday else None, f"{tf} on {weekday}s"),
    ):
        if key and key in stats.get("by_hour", {}) and stats["by_hour"][key]["reach_eq"]["n"] >= 30:
            return stats["by_hour"][key], scope
        if key and key in stats.get("by_weekday", {}) and stats["by_weekday"][key]["reach_eq"]["n"] >= 30:
            return stats["by_weekday"][key], scope
    tfb = stats.get("by_timeframe", {}).get(tf)
    if tfb:
        return tfb, f"{tf}, all hours"
    empty = Stat(value=None, n=0).model_dump(by_alias=True)
    return {
        k: dict(empty) for k in ("reach_eq", "reach_opposite", "invalidated", "close_inside_given_sweep", "median_min_to_t1", "median_min_to_t2")
    }, f"{tf}, no history"


def context_sweep_stats(m5: pd.DataFrame, days: list[date], anchor: str, tick: float) -> dict[str, Any]:
    """P(window sweeps pre-market H/L or 5 AM candle H/L in first 30/60 min); P(reversal after)."""
    rows = []
    for d in days:
        pre = between(m5, at(d, "05:00"), at(d, "09:30"))
        c5 = between(m5, at(d, "05:00"), at(d, "09:00"))
        if pre.empty or c5.empty:
            continue
        ph, pl = float(pre["high"].max()), float(pre["low"].min())
        h5, l5 = float(c5["high"].max()), float(c5["low"].min())
        for label, minutes in (("30", 30), ("60", 60)):
            w = between(m5, at(d, "09:30"), at(d, "09:30") + timedelta(minutes=minutes))
            if w.empty:
                continue
            sp = bool(w["high"].max() >= ph + 2 * tick or w["low"].min() <= pl - 2 * tick)
            s5 = bool(w["high"].max() >= h5 + 2 * tick or w["low"].min() <= l5 - 2 * tick)
            rev = None
            if sp or s5:
                side = "high" if (w["high"].max() >= ph + 2 * tick or w["high"].max() >= h5 + 2 * tick) else "low"
                rest = between(m5, at(d, "09:30") + timedelta(minutes=minutes), at(d, "12:00"))
                if not rest.empty:
                    mid = (ph + pl) / 2
                    rev = bool(rest["low"].min() <= mid) if side == "high" else bool(rest["high"].max() >= mid)
            rows.append({"date": d, "win": label, "sweep_pre": sp, "sweep_5am": s5, "reversal": rev})
    if not rows:
        return {}
    df = pd.DataFrame(rows)
    out: dict[str, Any] = {}
    for label, g in df.groupby("win"):
        dates = list(g["date"])
        rv = g[g["reversal"].notna()]
        out[f"first_{label}"] = {
            "sweep_premarket": _stat(list(g["sweep_pre"].astype(float)), dates, "p"),
            "sweep_5am": _stat(list(g["sweep_5am"].astype(float)), dates, "p"),
            "reversal_after_sweep": _stat(list(rv["reversal"].astype(float)), list(rv["date"]), "p"),
        }
    return out


def as_of_date(dt: datetime) -> date:
    return dt.astimezone(UTC).date()
