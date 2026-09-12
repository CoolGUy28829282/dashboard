"""Evidence tables: P(12:00 close > 9:00 open | condition) per (instrument, factor, condition), with shrinkage."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

from .. import config
from ..candles import between
from ..timeutil import at, now_utc


def shrink(p: float, n: int, k: float, prior: float = 0.5) -> float:
    return (k * prior + n * p) / (k + n)


def window_outcome(m5: pd.DataFrame, d: date) -> bool | None:
    w = between(m5, at(d, "09:00"), at(d, "12:00"))
    if len(w) < 12:
        return None
    return bool(float(w["close"].iloc[-1]) > float(w["open"].iloc[0]))


def _path(instrument: str):
    p = config.data_dir() / "evidence"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{instrument}.json"


def load(instrument: str) -> dict[str, Any]:
    p = _path(instrument)
    if not p.exists():
        return {"computed_at": None, "tables": {}}
    return json.loads(p.read_text())


def is_stale(tbl: dict[str, Any], days: int) -> bool:
    if not tbl.get("computed_at"):
        return True
    return now_utc() - datetime.fromisoformat(tbl["computed_at"]) > timedelta(days=days)


def build(instrument: str, m5: pd.DataFrame, conditions_by_day: dict[date, dict[str, str]], excluded: set[date]) -> dict[str, Any]:
    """conditions_by_day: {date: {factor_id: condition}} for past mornings; outcome from the same bars."""
    rows: list[tuple[str, str, bool, date]] = []
    for d, conds in conditions_by_day.items():
        if d in excluded:
            continue
        y = window_outcome(m5, d)
        if y is None:
            continue
        for f, c in conds.items():
            if c:
                rows.append((f, c, y, d))
    tables: dict[str, dict[str, Any]] = {}
    for f, c, y, d in rows:
        t = tables.setdefault(f, {}).setdefault(c, {"n": 0, "up": 0, "from": d.isoformat(), "to": d.isoformat()})
        t["n"] += 1
        t["up"] += int(y)
        t["from"] = min(t["from"], d.isoformat())
        t["to"] = max(t["to"], d.isoformat())
    for ftab in tables.values():
        for cond in ftab.values():
            cond["p"] = cond["up"] / cond["n"] if cond["n"] else None
    out = {"computed_at": now_utc().isoformat(), "instrument": instrument, "tables": tables, "excluded_red_folder": sorted(x.isoformat() for x in excluded)}
    _path(instrument).write_text(json.dumps(out, indent=1))
    return out


def lookup(tbl: dict[str, Any], factor: str, condition: str | None) -> dict[str, Any] | None:
    if not condition:
        return None
    return tbl.get("tables", {}).get(factor, {}).get(condition)
