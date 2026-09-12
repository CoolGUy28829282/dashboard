"""Journal and calibration (spec 5.7): post-session grading and scoreboard."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from . import config, instruments
from .candles import between
from .models import Snapshot
from .timeutil import at, iso


def jdir() -> Path:
    p = config.data_dir() / "journal"
    p.mkdir(parents=True, exist_ok=True)
    return p


def path(d: str, instrument: str) -> Path:
    return jdir() / f"{d}_{instrument}.json"


def load_day(d: str, instrument: str) -> dict[str, Any]:
    p = path(d, instrument)
    if p.exists():
        return json.loads(p.read_text())
    return {"date": d, "instrument": instrument, "notes": "", "checklist": {}, "grade": None}


def save_day(d: str, instrument: str, data: dict[str, Any]) -> None:
    cur = load_day(d, instrument)
    cur.update({k: v for k, v in data.items() if k in ("notes", "checklist", "grade")})
    path(d, instrument).write_text(json.dumps(cur, indent=1, default=str))


def _first_touch(bars: pd.DataFrame, level: float, side: str, start: datetime, end: datetime) -> datetime | None:
    seg = between(bars, start, end)
    hit = seg[seg["high"] >= level] if side == "up" else seg[seg["low"] <= level]
    return hit.index[0].to_pydatetime() if not hit.empty else None


def grade(snapshot: Snapshot, bars: pd.DataFrame) -> dict[str, Any]:
    """What did the window actually do, and was the morning's call right?"""
    d = date.fromisoformat(snapshot.meta.trading_date)
    ws, we = at(d, snapshot.meta.window["start"]), at(d, snapshot.meta.window["end"])
    w = between(bars, ws, we)
    if len(w) < 6:
        return {"status": "incomplete", "reason": "not enough window bars"}
    o, c = float(w["open"].iloc[0]), float(w["close"].iloc[-1])
    h, l = float(w["high"].max()), float(w["low"].min())
    ht, lt = w["high"].idxmax().to_pydatetime(), w["low"].idxmin().to_pydatetime()
    direction_actual = "up" if c > o else "down" if c < o else "flat"
    bias = snapshot.bias.label
    bias_dir = {"Bullish": "up", "Bearish": "down"}.get(bias)
    bias_correct = None if bias_dir is None else bias_dir == direction_actual
    # delivery: bias-side liquidity target (PDH for bullish, PDL for bearish) before the opposite invalidation
    lv = snapshot.levels
    delivery = None
    if bias_dir and lv.pdh and lv.pdl:
        tgt = _first_touch(bars, lv.pdh if bias_dir == "up" else lv.pdl, bias_dir, ws, we)
        inv = _first_touch(bars, lv.pdl if bias_dir == "up" else lv.pdh, "down" if bias_dir == "up" else "up", ws, we)
        delivery = bool(tgt and (inv is None or tgt < inv))
    # scenarios
    scen: dict[str, Any] = {}
    for name, s in (
        ("primary", snapshot.ideas[0] if snapshot.ideas else None),
        ("alternate", next((x for x in snapshot.crt.setups if x.scenario == "alternate"), None)),
    ):
        if s is None:
            continue
        side = "down" if s.sweep_side == "low" else "up"
        trig = _first_touch(bars, s.sweep_level, side, ws, we)
        first = None
        if trig:
            t2 = _first_touch(bars, s.t2, "up" if s.direction == "long" else "down", trig, we)
            t1 = _first_touch(bars, s.t1, "up" if s.direction == "long" else "down", trig, we)
            inv = _first_touch(bars, s.stop, "down" if s.direction == "long" else "up", trig, we)
            cands = [(x, n) for x, n in ((t2, "t2"), (inv, "invalidation")) if x]
            first = min(cands, key=lambda x: x[0])[1] if cands else "neither"
            scen[name] = {"triggered_at": iso(trig), "t1_at": iso(t1), "t2_at": iso(t2), "invalidated_at": iso(inv), "first": first}
        else:
            scen[name] = {"triggered_at": None, "first": "not triggered"}
    # context levels swept
    swept = []
    for row in snapshot.levels.above + snapshot.levels.below:
        t = _first_touch(bars, row.price, "up" if row.distance >= 0 else "down", ws, we)
        if t:
            swept.append({"id": row.id, "name": row.name, "at": iso(t)})
    # execution sweeps: re-run detection on the full window bars
    from .candles import resample
    from .crt.detect import detect
    from .crt.ranges import RangeSpec

    ins = instruments.get(snapshot.meta.instrument)
    exec_results = []
    for tf in ("15m", "30m", "1h"):
        tfb = resample(between(bars, at(d, "08:00"), we), tf, snapshot.meta.anchor)
        for ts, r in tfb.iterrows():
            o_ = ts.to_pydatetime()
            from .candles import candle_close_time

            c_ = candle_close_time(o_, tf)
            if c_ >= we:
                continue
            spec = RangeSpec(
                f"{tf}_{o_.astimezone(ws.tzinfo).strftime('%H%M')}",
                f"{tf} {o_.astimezone(ws.tzinfo).strftime('%H:%M')}",
                "execution",
                float(r["high"]),
                float(r["low"]),
                o_,
                c_,
                float(r["open"]),
                float(r["close"]),
                tf,
            )
            st = detect(spec, bars, tfb, we, ins.tick, tf, cutoff=we)
            for sw in st.sweeps:
                if sw.closed_inside:
                    exec_results.append(
                        {
                            "tf": tf,
                            "range": spec.label,
                            "side": sw.side,
                            "sweep_at": iso(sw.at),
                            "confirmed_at": iso(sw.exec_candle_close),
                            "reached_eq": sw.reached_eq_at is not None,
                            "reached_opposite": sw.reached_opposite_at is not None,
                            "invalidated": sw.invalidated_at is not None,
                        }
                    )
    prim = scen.get("primary", {})
    return {
        "status": "graded",
        "graded_at": iso(datetime.now(tz=ws.tzinfo)),
        "window": {"open": o, "close": c, "high": h, "low": l, "high_at": iso(ht), "low_at": iso(lt), "range": h - l, "move": c - o},
        "direction_actual": direction_actual,
        "bias": bias,
        "confidence": snapshot.bias.confidence,
        "bias_correct": bias_correct,
        "bias_delivery": delivery,
        "rating": snapshot.rating.label,
        "red_folder": any(r.id == "red_folder_event" for r in snapshot.rating.reasons),
        "scenarios": scen,
        "primary_hit": prim.get("first") == "t2",
        "context_swept": swept,
        "execution_sweeps": exec_results,
        "weekday": snapshot.meta.weekday,
    }


def scoreboard(instrument: str) -> dict[str, Any]:
    rows = []
    for p in sorted(jdir().glob(f"*_{instrument}.json")):
        j = json.loads(p.read_text())
        g = j.get("grade")
        if g and g.get("status") == "graded":
            rows.append(g | {"date": j["date"]})
    if not rows:
        return {"n": 0, "windows": {}, "by_weekday": {}, "by_confidence": {}, "by_timeframe": {}, "rating": {}}
    df = pd.DataFrame(rows)

    def block(g: pd.DataFrame) -> dict[str, Any]:
        dirs = g[g["bias_correct"].notna()]
        return {
            "n": int(len(g)),
            "from": str(g["date"].min()),
            "to": str(g["date"].max()),
            "bias_accuracy": {
                "value": float(dirs["bias_correct"].mean()) if len(dirs) else None,
                "n": int(len(dirs)),
                "from": str(g["date"].min()),
                "to": str(g["date"].max()),
            },
            "delivery": {
                "value": float(g["bias_delivery"].dropna().mean()) if g["bias_delivery"].notna().any() else None,
                "n": int(g["bias_delivery"].notna().sum()),
                "from": str(g["date"].min()),
                "to": str(g["date"].max()),
            },
            "primary_hit": {"value": float(g["primary_hit"].mean()), "n": int(len(g)), "from": str(g["date"].min()), "to": str(g["date"].max())},
            "avg_range": {
                "value": float(g["window"].map(lambda w: w["range"]).mean()),
                "n": int(len(g)),
                "from": str(g["date"].min()),
                "to": str(g["date"].max()),
                "unit": "pts",
            },
        }

    out: dict[str, Any] = {"n": int(len(df)), "windows": {}, "by_weekday": {}, "by_confidence": {}, "by_timeframe": {}, "rating": {}}
    for n in (20, 60, 120):
        out["windows"][str(n)] = block(df.tail(n))
    for wd, g in df.groupby("weekday"):
        out["by_weekday"][str(wd)] = block(g)
    bins = pd.cut(df["confidence"], [0, 55, 65, 75, 100], labels=["50–55", "56–65", "66–75", "76+"])
    for b, g in df.groupby(bins, observed=True):
        out["by_confidence"][str(b)] = block(g)
    ex = [e | {"date": r["date"]} for r in rows for e in r.get("execution_sweeps", [])]
    if ex:
        edf = pd.DataFrame(ex)
        for tf, g in edf.groupby("tf"):
            out["by_timeframe"][str(tf)] = {
                "n": int(len(g)),
                "reach_eq": {"value": float(g["reached_eq"].mean()), "n": int(len(g)), "from": str(g["date"].min()), "to": str(g["date"].max())},
                "reach_opposite": {"value": float(g["reached_opposite"].mean()), "n": int(len(g)), "from": str(g["date"].min()), "to": str(g["date"].max())},
                "invalidated": {"value": float(g["invalidated"].mean()), "n": int(len(g)), "from": str(g["date"].min()), "to": str(g["date"].max())},
            }
    for lab, g in df.groupby("rating"):
        out["rating"][str(lab)] = block(g)
    if df["red_folder"].any():
        out["rating"]["Red-folder days (skipped)"] = block(df[df["red_folder"]])
    return out


def as_timedelta(minutes: int) -> timedelta:
    return timedelta(minutes=minutes)
