"""Parquet history store: data/history/<INSTR>/<interval>.parquet, deduplicated by timestamp."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from . import config
from .candles import empty_bars, normalise


def _path(symbol: str, interval: str, root: Path | None = None) -> Path:
    safe = symbol.replace("=", "").replace("^", "").replace(".", "_").replace("-", "_")
    d = (root or config.data_dir() / "history") / safe
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{interval}.parquet"


def load(symbol: str, interval: str, root: Path | None = None) -> pd.DataFrame:
    p = _path(symbol, interval, root)
    if not p.exists():
        return empty_bars()
    return normalise(pd.read_parquet(p))


def append(symbol: str, interval: str, bars: pd.DataFrame, root: Path | None = None) -> int:
    """Merge new bars in; returns the number of new rows."""
    new = normalise(bars)
    if new.empty:
        return 0
    old = load(symbol, interval, root)
    merged = normalise(pd.concat([old, new]))
    merged.to_parquet(_path(symbol, interval, root))
    return len(merged) - len(old)


def coverage(symbol: str, interval: str, root: Path | None = None) -> dict:
    df = load(symbol, interval, root)
    if df.empty:
        return {"rows": 0, "from": None, "to": None}
    return {"rows": len(df), "from": df.index[0].isoformat(), "to": df.index[-1].isoformat()}
