"""Disk cache with TTL for every network call. Keeps last-good values so a dead feed degrades gracefully."""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import config
from .timeutil import iso, now_utc


@dataclass
class CacheResult:
    value: Any
    ok: bool
    as_of: str | None  # iso NY time of the last successful fetch
    error: str | None = None
    from_cache: bool = False


def _path(key: str) -> Path:
    d = config.data_dir() / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d / (hashlib.sha1(key.encode()).hexdigest() + ".json")


def fetch_json(key: str, fn: Callable[[], Any], ttl_min: float | None = None) -> CacheResult:
    """Return cached value if fresh; else call fn. On failure return last-good with ok=False."""
    ttl = (ttl_min if ttl_min is not None else float(config.env("CACHE_TTL_MIN", "10"))) * 60
    p = _path(key)
    cached: dict | None = None
    if p.exists():
        try:
            cached = json.loads(p.read_text())
        except Exception:
            cached = None
    if cached and time.time() - cached["fetched"] < ttl:
        return CacheResult(cached["value"], True, cached["as_of"], from_cache=True)
    try:
        value = fn()
        p.write_text(json.dumps({"fetched": time.time(), "as_of": iso(now_utc()), "value": value}, default=str))
        return CacheResult(value, True, iso(now_utc()))
    except Exception as exc:  # noqa: BLE001 - any provider failure degrades, never raises to the UI
        if cached:
            return CacheResult(cached["value"], False, cached["as_of"], error=str(exc), from_cache=True)
        return CacheResult(None, False, None, error=str(exc))
