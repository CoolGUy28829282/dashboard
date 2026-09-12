"""Resample 1m/5m bars into 15m / 30m / 1h / 4H candles anchored to the configured daily open.

Bars are a DataFrame indexed by tz-aware UTC timestamps (bar open), columns open/high/low/close/volume.
Resampling is done in New York wall time so that DST does not shift the candle grid: a 4H candle
opens at 01:00 ET on both sides of a transition.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

import pandas as pd

from .timeutil import NY, UTC, at, parse_hhmm

ANCHOR_OPEN = {"forex": "17:00", "exchange": "18:00"}
INTERVAL_MIN = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440}


def empty_bars() -> pd.DataFrame:
    idx = pd.DatetimeIndex([], tz="UTC", name="ts")
    return pd.DataFrame({c: pd.Series(dtype="float64") for c in ["open", "high", "low", "close", "volume"]}, index=idx)


def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Lower-case columns, UTC index named ts, sorted, deduplicated."""
    if df.empty:
        return empty_bars()
    d = df.copy()
    d.columns = [str(c).lower() for c in d.columns]
    if "ts" in d.columns:
        d = d.set_index("ts")
    idx = pd.DatetimeIndex(d.index)
    idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    d.index = idx
    d.index.name = "ts"
    keep = [c for c in ["open", "high", "low", "close", "volume"] if c in d.columns]
    d = d[keep].astype("float64")
    if "volume" not in d.columns:
        d["volume"] = 0.0
    d = d[~d.index.duplicated(keep="last")].sort_index()
    return d


def bucket_open(ts: datetime, interval: str, anchor: str = "forex") -> datetime:
    """The New York wall-clock open of the candle containing `ts`."""
    t = ts.astimezone(NY)
    minutes = INTERVAL_MIN[interval]
    if interval == "1d":
        origin_t = parse_hhmm(ANCHOR_OPEN[anchor])
        d = t.date() if t.time() < origin_t else t.date() + timedelta(days=1)
        return at(d - timedelta(days=1), origin_t)
    if interval == "4h":
        origin_t = parse_hhmm(ANCHOR_OPEN[anchor])
        origin = at(t.date(), origin_t)
        if origin > t:
            origin = at(t.date() - timedelta(days=1), origin_t)
        # count whole 4h wall-clock steps from the origin (DST-safe: walk by wall time)
        step = 0
        while True:
            nxt = at(origin.date(), time((origin_t.hour + 4 * (step + 1)) % 24, 0)) + timedelta(days=(origin_t.hour + 4 * (step + 1)) // 24)
            if nxt > t:
                break
            step += 1
        hours = origin_t.hour + 4 * step
        return at(origin.date() + timedelta(days=hours // 24), time(hours % 24, 0))
    # intraday ≤ 1h: align to wall-clock multiples within the hour/day
    total = t.hour * 60 + t.minute
    start = total - (total % minutes)
    return at(t.date(), time(start // 60, start % 60))


def resample(bars: pd.DataFrame, interval: str, anchor: str = "forex") -> pd.DataFrame:
    """Resample source bars (1m or 5m) into `interval`. Index of the result = candle open (UTC)."""
    if bars.empty:
        return empty_bars()
    src = normalise(bars)
    ny_idx = src.index.tz_convert(NY)
    if interval in ("15m", "30m", "1h"):
        # wall-clock floor using each row's own UTC offset: correct through both DST transitions
        # (the repeated 1 AM hour in November and the missing 2 AM hour in March)
        offsets = pd.to_timedelta([t.utcoffset() for t in ny_idx])
        wall = src.index.tz_localize(None) + offsets
        floored = pd.DatetimeIndex(wall).floor(f"{INTERVAL_MIN[interval]}min")
        keys = pd.DatetimeIndex(floored - offsets).tz_localize("UTC")
    else:
        keys = pd.DatetimeIndex([bucket_open(ts.to_pydatetime(), interval, anchor) for ts in src.index])
    g = src.groupby(keys)
    out = pd.DataFrame(
        {
            "open": g["open"].first(),
            "high": g["high"].max(),
            "low": g["low"].min(),
            "close": g["close"].last(),
            "volume": g["volume"].sum(),
        }
    )
    out = out[out.index.notna()]
    out.index = pd.DatetimeIndex(out.index).tz_convert(UTC)
    out.index.name = "ts"
    return out.sort_index()


def candle_close_time(open_ts: datetime, interval: str, anchor: str = "forex") -> datetime:
    if interval == "1d":
        return at(open_ts.astimezone(NY).date() + timedelta(days=1), ANCHOR_OPEN[anchor])
    if interval == "4h":
        o = open_ts.astimezone(NY)
        h = o.hour + 4
        return at(o.date() + timedelta(days=h // 24), time(h % 24, 0))
    return open_ts + timedelta(minutes=INTERVAL_MIN[interval])


def slot_candle(bars4h: pd.DataFrame, trading_day, slot_hhmm: str) -> pd.Series | None:
    """The 4H candle opening at slot_hhmm (NY) on trading_day (slots ≥ 17:00 belong to the prior calendar day)."""
    st = parse_hhmm(slot_hhmm)
    d = trading_day - timedelta(days=1) if st >= time(17, 0) else trading_day
    key = at(d, st).astimezone(UTC)
    if key in bars4h.index:
        return bars4h.loc[key]
    return None


def between(bars: pd.DataFrame, start: datetime, end: datetime) -> pd.DataFrame:
    """Bars with open in [start, end)."""
    if bars.empty:
        return bars
    return bars[(bars.index >= start.astimezone(UTC)) & (bars.index < end.astimezone(UTC))]


def ohlc(df: pd.DataFrame) -> dict | None:
    if df is None or df.empty:
        return None
    return {
        "o": float(df["open"].iloc[0]),
        "h": float(df["high"].max()),
        "l": float(df["low"].min()),
        "c": float(df["close"].iloc[-1]),
        "start": df.index[0].to_pydatetime(),
        "end": df.index[-1].to_pydatetime(),
    }


def atr(df: pd.DataFrame, n: int = 14) -> float | None:
    if df is None or len(df) < 2:
        return None
    prev_close = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()], axis=1).max(axis=1)
    v = tr.tail(n).mean()
    return None if pd.isna(v) else float(v)
