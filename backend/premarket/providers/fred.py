"""FRED series (DFII10 real yield, T10YIE breakeven). Needs FRED_API_KEY; otherwise returns None → 'unavailable'."""

from __future__ import annotations

from datetime import datetime

import httpx
import pandas as pd

from .. import config
from ..cache import fetch_json


class FredSeries:
    name = "fred"

    def get_series(self, series_id: str, start: datetime, end: datetime) -> pd.Series | None:
        key = config.env("FRED_API_KEY")
        if not key:
            return None

        def fn() -> dict:
            r = httpx.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params={"series_id": series_id, "api_key": key, "file_type": "json", "observation_start": start.date().isoformat()},
                timeout=20,
            )
            r.raise_for_status()
            return {o["date"]: o["value"] for o in r.json()["observations"] if o["value"] != "."}

        res = fetch_json(f"fred:{series_id}:{start.date()}", fn, ttl_min=360)
        if not res.value:
            return None
        return pd.Series({pd.Timestamp(k, tz="UTC"): float(v) for k, v in res.value.items()}).sort_index()
