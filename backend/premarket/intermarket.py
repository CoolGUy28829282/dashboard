"""Intermarket table and real yields (spec 5.6)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from .candles import between
from .market import MarketData
from .models import Intermarket, IntermarketRow
from .providers.base import SeriesProvider
from .timeutil import at, iso

NAMES = {
    "ES=F": "ES",
    "NQ=F": "NQ",
    "YM=F": "YM",
    "GC=F": "Gold",
    "SI=F": "Silver",
    "DX-Y.NYB": "DXY",
    "^TNX": "10Y yield",
    "^VIX": "VIX",
    "CL=F": "Crude",
    "^N225": "Nikkei",
    "^GDAXI": "DAX",
    "^FTSE": "FTSE",
}


def _read(sym: str, pct: float | None, instrument: str) -> str:
    if pct is None:
        return "unavailable"
    up = pct > 0
    if instrument == "GC":
        if sym == "DX-Y.NYB":
            return f"DXY {pct:+.2f}%: {'headwind' if up else 'tailwind'} for GC"
        if sym == "^TNX":
            return f"10Y {pct:+.2f}%: {'headwind' if up else 'tailwind'} for GC"
        if sym == "SI=F":
            return f"Silver {pct:+.2f}%: {'confirms' if up else 'does not confirm'} metals strength"
        if sym == "^VIX":
            return f"VIX {pct:+.2f}%: {'safe-haven bid possible' if up else 'calm tape'}"
        return f"{NAMES.get(sym, sym)} {pct:+.2f}%"
    if sym == "^VIX":
        return f"VIX {pct:+.2f}%: {'risk-off' if up else 'risk-on'} lean"
    if sym == "^TNX":
        return f"10Y {pct:+.2f}%: {'pressure on growth' if up else 'relief for growth'}"
    if sym == "DX-Y.NYB":
        return f"DXY {pct:+.2f}%: {'mild headwind' if up else 'mild tailwind'} for equities"
    if sym in ("^N225", "^GDAXI", "^FTSE"):
        return f"{NAMES[sym]} {pct:+.2f}% overnight: {'supportive' if up else 'soft'}"
    return f"{NAMES.get(sym, sym)} {pct:+.2f}%: {'confirms' if up else 'diverges from'} the index tape"


def build(md: MarketData, series: SeriesProvider) -> Intermarket:
    since = at(md.trading_date - timedelta(days=1), "17:00")
    midnight = at(md.trading_date, "00:00")
    rows: list[IntermarketRow] = []
    for sym, bars in md.inter.items():
        seg = between(bars, since, md.asof)
        seg_m = between(bars, midnight, md.asof)
        last = float(seg["close"].iloc[-1]) if not seg.empty else None
        o17 = float(seg["open"].iloc[0]) if not seg.empty else None
        o0 = float(seg_m["open"].iloc[0]) if not seg_m.empty else None
        d = md.inter_daily.get(sym)
        spark = [float(x) for x in d["close"].tail(5)] if d is not None and not d.empty else []
        pct = (last - o17) / o17 * 100 if last is not None and o17 else None
        rows.append(
            IntermarketRow(
                symbol=sym,
                name=NAMES.get(sym, sym),
                last=last,
                chg_since_1700=(last - o17) if last is not None and o17 is not None else None,
                chg_since_midnight=(last - o0) if last is not None and o0 is not None else None,
                pct_since_1700=round(pct, 3) if pct is not None else None,
                sparkline=spark,
                read=_read(sym, pct, md.instrument),
                as_of=iso(seg.index[-1].to_pydatetime()) if not seg.empty else None,
            )
        )
    ry = _series(series, "DFII10", md)
    be = _series(series, "T10YIE", md)
    return Intermarket(rows=rows, real_yield=ry, breakeven=be, as_of=iso(md.asof))


def _series(series: SeriesProvider, sid: str, md: MarketData) -> dict[str, Any] | None:
    s = series.get_series(sid, md.asof - timedelta(days=30), md.asof)
    if s is None or s.empty:
        return {"id": sid, "value": None, "change": None, "as_of": None, "status": "unavailable"}
    s = s[s.index <= md.asof]
    if s.empty:
        return {"id": sid, "value": None, "change": None, "as_of": None, "status": "unavailable"}
    v = float(s.iloc[-1])
    prev = float(s.iloc[-2]) if len(s) > 1 else None
    return {"id": sid, "value": v, "change": (v - prev) if prev is not None else None, "as_of": s.index[-1].date().isoformat(), "status": "ok"}
