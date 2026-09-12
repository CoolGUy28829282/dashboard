"""Mock providers reading data/fixtures/. Used in tests and when PROVIDER_*=mock."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from .. import config
from ..candles import empty_bars, normalise
from ..timeutil import UTC, iso, ny
from .base import CalEvent, Headline, Health, LLMResult, Quote


def fixtures_dir() -> Path:
    return config.data_dir() / "fixtures"


def fixture_meta() -> dict[str, Any]:
    p = fixtures_dir() / "meta.json"
    return json.loads(p.read_text()) if p.exists() else {}


def _safe(symbol: str) -> str:
    return symbol.replace("=", "").replace("^", "").replace(".", "_").replace("-", "_")


class MockPrices:
    name = "mock"
    delay_min = 0

    def __init__(self, root: Path | None = None):
        self.root = root or fixtures_dir() / "bars"

    def get_bars(self, symbol: str, interval: str, start: datetime, end: datetime) -> pd.DataFrame:
        p = self.root / f"{_safe(symbol)}_{interval}.parquet"
        if not p.exists():
            return empty_bars()
        df = normalise(pd.read_parquet(p))
        return df[(df.index >= start.astimezone(UTC)) & (df.index < end.astimezone(UTC))]

    def get_last(self, symbol: str) -> Quote:
        for interval in ("1m", "5m", "1h", "1d"):
            p = self.root / f"{_safe(symbol)}_{interval}.parquet"
            if p.exists():
                df = normalise(pd.read_parquet(p))
                if not df.empty:
                    return Quote(float(df["close"].iloc[-1]), df.index[-1].to_pydatetime(), 0)
        return Quote(None, None, None)

    def health(self) -> Health:
        meta = fixture_meta()
        return Health(True, meta.get("frozen_at") or iso(ny()), 0, source=meta.get("source", "mock"))


class MockCalendar:
    name = "mock"

    def get_events(self, start: datetime, end: datetime) -> list[CalEvent]:
        p = fixtures_dir() / "calendar.json"
        if not p.exists():
            return []
        out = []
        for e in json.loads(p.read_text())["events"]:
            when = datetime.fromisoformat(e["when"]) if e.get("when") else None
            d = e["date"]
            if start.astimezone(UTC).date().isoformat() <= d <= end.astimezone(UTC).date().isoformat():
                out.append(CalEvent(when, d, e["name"], e["impact"], e["currency"], e.get("consensus"), e.get("previous"), e.get("actual"), "mock"))
        return out

    def health(self) -> Health:
        p = fixtures_dir() / "calendar.json"
        return Health(p.exists(), fixture_meta().get("frozen_at"), source="mock")


class MockNews:
    name = "mock"

    def get_headlines(self, since: datetime) -> list[Headline]:
        p = fixtures_dir() / "headlines.json"
        if not p.exists():
            return []
        out = []
        for h in json.loads(p.read_text())["headlines"]:
            pub = datetime.fromisoformat(h["published"]) if h.get("published") else None
            out.append(Headline(h["title"], h["url"], pub, h["source"], h["feed_id"], h.get("summary", "")))
        return out

    def feed_health(self) -> list[dict]:
        p = fixtures_dir() / "headlines.json"
        n = len(json.loads(p.read_text())["headlines"]) if p.exists() else 0
        return [{"id": "mock", "name": "Fixture headlines", "ok": p.exists(), "as_of": fixture_meta().get("frozen_at"), "count": n}]


class MockSeries:
    name = "mock"

    def get_series(self, series_id: str, start: datetime, end: datetime) -> pd.Series | None:
        p = fixtures_dir() / "series.json"
        if not p.exists():
            return None
        data = json.loads(p.read_text()).get(series_id)
        if not data:
            return None
        s = pd.Series({pd.Timestamp(k, tz="UTC"): float(v) for k, v in data.items()}).sort_index()
        return s


class MockLLM:
    name = "mock"

    def complete_json(self, system: str, user: str, json_schema: dict[str, Any]) -> LLMResult:
        return LLMResult(False, {}, "mock", "mock LLM returns nothing; rules fallback is used")
