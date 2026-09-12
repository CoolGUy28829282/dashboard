"""yfinance price provider. Delayed quotes; limits: 1m ≈ 7 days, 5m/15m/30m ≈ 60 days, 1h ≈ 2 years."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from ..candles import empty_bars, normalise
from ..timeutil import UTC, iso, now_utc
from .base import Health, Quote

MAX_LOOKBACK = {"1m": timedelta(days=7), "5m": timedelta(days=59), "15m": timedelta(days=59), "30m": timedelta(days=59), "1h": timedelta(days=729), "1d": None}


class YFinancePrices:
    name = "yfinance"
    delay_min = 15

    def __init__(self) -> None:
        self._last_error: str | None = None
        self._last_ok: str | None = None

    def get_bars(self, symbol: str, interval: str, start: datetime, end: datetime) -> pd.DataFrame:
        import yfinance as yf

        lim = MAX_LOOKBACK.get(interval)
        s = start.astimezone(UTC)
        if lim is not None:
            s = max(s, now_utc() - lim + timedelta(minutes=5))
        try:
            df = yf.download(symbol, start=s, end=end.astimezone(UTC), interval=interval, progress=False, auto_adjust=False, prepost=True)
        except Exception as exc:  # noqa: BLE001
            self._last_error = str(exc)
            return empty_bars()
        if df is None or df.empty:
            return empty_bars()
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [c[0] for c in df.columns]
        df = df.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"})
        self._last_ok = iso(now_utc())
        return normalise(df[["open", "high", "low", "close", "volume"]])

    def get_last(self, symbol: str) -> Quote:
        df = self.get_bars(symbol, "1m", now_utc() - timedelta(days=2), now_utc())
        if df.empty:
            return Quote(None, None, self.delay_min)
        return Quote(float(df["close"].iloc[-1]), df.index[-1].to_pydatetime(), self.delay_min)

    def health(self) -> Health:
        return Health(self._last_error is None, self._last_ok, self.delay_min, self._last_error, "yfinance")
