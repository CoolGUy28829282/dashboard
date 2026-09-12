"""Configuration: YAML files in config/ plus environment overrides."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def data_dir() -> Path:
    raw = os.environ.get("DATA_DIR", str(ROOT / "data"))
    p = Path(raw)
    if not p.is_absolute():
        p = (ROOT / "backend" / p).resolve()
    return p


def config_dir() -> Path:
    return Path(os.environ.get("CONFIG_DIR", str(ROOT / "config")))


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@lru_cache(maxsize=32)
def _load(name: str, mtime: float) -> dict[str, Any]:
    with open(config_dir() / f"{name}.yaml", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load(name: str) -> dict[str, Any]:
    """Load config/<name>.yaml (cached, invalidated on file change)."""
    path = config_dir() / f"{name}.yaml"
    return _load(name, path.stat().st_mtime if path.exists() else 0.0)


def save(name: str, data: dict[str, Any]) -> None:
    with open(config_dir() / f"{name}.yaml", "w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)
    _load.cache_clear()


def anchor() -> str:
    return env("CANDLE_ANCHOR", str(load("sessions").get("candle_anchor", "forex")))
