"""Provider interfaces. Everything external implements one of these."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import pandas as pd


@dataclass
class Health:
    ok: bool
    as_of: str | None
    delay_min: int | None = None
    error: str | None = None
    source: str = ""


@dataclass
class Quote:
    price: float | None
    as_of: datetime | None
    delay_min: int | None = None


@dataclass
class CalEvent:
    when: datetime | None  # None = all-day
    date: str  # YYYY-MM-DD (NY)
    name: str
    impact: str  # high | medium | low | holiday
    currency: str
    consensus: str | None = None
    previous: str | None = None
    actual: str | None = None
    source: str = ""


@dataclass
class Headline:
    title: str
    url: str
    published: datetime | None
    source: str
    feed_id: str
    summary: str = ""


@dataclass
class LLMResult:
    ok: bool
    data: dict[str, Any] = field(default_factory=dict)
    source: str = "rules"
    error: str | None = None


class PriceProvider(Protocol):
    name: str
    delay_min: int

    def get_bars(self, symbol: str, interval: str, start: datetime, end: datetime) -> pd.DataFrame: ...

    def get_last(self, symbol: str) -> Quote: ...

    def health(self) -> Health: ...


class CalendarProvider(Protocol):
    name: str

    def get_events(self, start: datetime, end: datetime) -> list[CalEvent]: ...

    def health(self) -> Health: ...


class NewsProvider(Protocol):
    name: str

    def get_headlines(self, since: datetime) -> list[Headline]: ...

    def feed_health(self) -> list[dict]: ...


class SeriesProvider(Protocol):
    name: str

    def get_series(self, series_id: str, start: datetime, end: datetime) -> pd.Series | None: ...


class LLMProvider(Protocol):
    name: str

    def complete_json(self, system: str, user: str, json_schema: dict[str, Any]) -> LLMResult: ...
