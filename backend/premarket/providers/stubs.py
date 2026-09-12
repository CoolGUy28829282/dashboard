"""Stubs for paid price providers. They implement PriceProvider and explain what is missing."""

from __future__ import annotations

from datetime import datetime

import pandas as pd

from ..candles import empty_bars
from .base import Health, Quote


class StubPrices:
    delay_min = 0

    def __init__(self, kind: str):
        self.name = kind

    def get_bars(self, symbol: str, interval: str, start: datetime, end: datetime) -> pd.DataFrame:
        return empty_bars()

    def get_last(self, symbol: str) -> Quote:
        return Quote(None, None, 0)

    def health(self) -> Health:
        return Health(False, None, 0, f"{self.name} provider is a stub: implement get_bars/get_last in providers/stubs.py", self.name)
