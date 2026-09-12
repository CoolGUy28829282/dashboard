"""MarketData: every bar series the engines need for one instrument, cut at the as-of time."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import pandas as pd

from . import config, history, instruments
from .candles import between, empty_bars, normalise, resample
from .providers.base import PriceProvider, Quote
from .timeutil import UTC, at, trading_date_for


@dataclass
class MarketData:
    instrument: str
    symbol: str
    asof: datetime
    trading_date: date
    anchor: str
    m5: pd.DataFrame  # 5m bars up to asof (the detection resolution when 1m is absent)
    m1: pd.DataFrame  # 1m bars up to asof (may be empty)
    h1: pd.DataFrame
    m15: pd.DataFrame
    m30: pd.DataFrame
    h4: pd.DataFrame
    d1: pd.DataFrame
    partner: dict[str, pd.DataFrame] = field(default_factory=dict)  # SMT partners' 5m bars
    inter: dict[str, pd.DataFrame] = field(default_factory=dict)  # intermarket 1h bars
    inter_daily: dict[str, pd.DataFrame] = field(default_factory=dict)
    quote: Quote | None = None
    fetched: dict[str, int] = field(default_factory=dict)  # rows appended to history per interval

    @property
    def fine(self) -> pd.DataFrame:
        """Finest bars available for exact timestamps: 1m when present, else 5m."""
        return self.m1 if not self.m1.empty else self.m5

    @property
    def fine_interval(self) -> str:
        return "1m" if not self.m1.empty else "5m"


def _pull(provider: PriceProvider, symbol: str, interval: str, start: datetime, end: datetime, store: bool) -> tuple[pd.DataFrame, int]:
    fresh = provider.get_bars(symbol, interval, start, end)
    added = history.append(symbol, interval, fresh) if store and not fresh.empty else 0
    stored = history.load(symbol, interval) if store else empty_bars()
    merged = normalise(pd.concat([stored, fresh])) if not stored.empty else normalise(fresh)
    return between(merged, start, end), added


def load(instrument: str, provider: PriceProvider, asof: datetime, store: bool = True, days: int = 45) -> MarketData:
    ins = instruments.get(instrument)
    anchor = config.anchor()
    tdate = trading_date_for(asof, "17:00" if anchor == "forex" else "18:00")
    start = at(tdate - timedelta(days=days), "17:00")
    end = asof
    m5, a5 = _pull(provider, ins.yf, "5m", start, end, store)
    m1, a1 = _pull(provider, ins.yf, "1m", at(tdate - timedelta(days=8), "17:00"), end, store)
    d1, ad = _pull(provider, ins.yf, "1d", at(tdate - timedelta(days=420), "17:00"), end, store)
    base = m1 if not m1.empty and len(m5) == 0 else m5
    h1 = resample(base, "1h", anchor)
    m15 = resample(base, "15m", anchor)
    m30 = resample(base, "30m", anchor)
    h4 = resample(base, "4h", anchor)
    # daily from intraday when we have it (anchored), else provider daily
    d1_anchored = resample(base, "1d", anchor) if not base.empty else empty_bars()
    daily = d1_anchored if len(d1_anchored) >= 10 else d1
    partner: dict[str, pd.DataFrame] = {}
    for p in (ins.smt_partner, ins.smt_tiebreak):
        sym = _partner_symbol(p)
        if sym:
            partner[p], _ = _pull(provider, sym, "5m", at(tdate - timedelta(days=5), "17:00"), end, store)
    inter: dict[str, pd.DataFrame] = {}
    inter_daily: dict[str, pd.DataFrame] = {}
    for sym in ins.intermarket:
        inter[sym], _ = _pull(provider, sym, "1h", at(tdate - timedelta(days=8), "17:00"), end, store)
        inter_daily[sym], _ = _pull(provider, sym, "1d", at(tdate - timedelta(days=30), "17:00"), end, store)
    quote = provider.get_last(ins.yf)
    if quote.price is None and not base.empty:
        quote = Quote(float(base["close"].iloc[-1]), base.index[-1].to_pydatetime(), provider.delay_min)
    elif quote.as_of is not None and quote.as_of > asof.astimezone(UTC) and not base.empty:
        quote = Quote(float(base["close"].iloc[-1]), base.index[-1].to_pydatetime(), provider.delay_min)
    return MarketData(
        instrument=instrument,
        symbol=ins.yf,
        asof=asof,
        trading_date=tdate,
        anchor=anchor,
        m5=m5,
        m1=m1,
        h1=h1,
        m15=m15,
        m30=m30,
        h4=h4,
        d1=daily,
        partner=partner,
        inter=inter,
        inter_daily=inter_daily,
        quote=quote,
        fetched={"5m": a5, "1m": a1, "1d": ad},
    )


def _partner_symbol(p: str) -> str | None:
    return {"ES": "ES=F", "NQ": "NQ=F", "YM": "YM=F", "SI": "SI=F", "DXY_INVERSE": "DX-Y.NYB"}.get(p)
