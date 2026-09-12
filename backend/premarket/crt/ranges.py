"""Context and execution ranges for the trading day."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from .. import config
from ..candles import INTERVAL_MIN, between, candle_close_time, ohlc, slot_candle
from ..market import MarketData
from ..timeutil import UTC, at, session_range
from .detect import RangeSpec

SLOT_LABEL = {"21:00": "9 PM candle", "01:00": "1 AM candle", "05:00": "5 AM candle", "09:00": "9 AM candle"}


def context_ranges(md: MarketData, orange_day: bool = False) -> list[RangeSpec]:
    out: list[RangeSpec] = []
    d1 = md.d1
    today_open = at(md.trading_date - timedelta(days=1), "17:00")
    prev = d1[d1.index < today_open.astimezone(UTC)]
    if not prev.empty:
        p = prev.iloc[-1]
        po = prev.index[-1].to_pydatetime()
        out.append(
            RangeSpec("daily_prev", "Previous day", "context", float(p["high"]), float(p["low"]), po, today_open, float(p["open"]), float(p["close"]), "15m")
        )
    cur = between(md.fine, today_open, md.asof)
    o = ohlc(cur)
    if o:
        out.append(RangeSpec("daily_cur", "Current day", "context", o["h"], o["l"], today_open, md.asof, o["o"], o["c"], "15m", live=True))
    monday = md.trading_date - timedelta(days=md.trading_date.weekday())
    pw = d1[(d1.index >= at(monday - timedelta(days=8), "17:00").astimezone(UTC)) & (d1.index < at(monday - timedelta(days=1), "17:00").astimezone(UTC))]
    if not pw.empty:
        out.append(
            RangeSpec(
                "weekly_prev",
                "Previous week",
                "context",
                float(pw["high"].max()),
                float(pw["low"].min()),
                pw.index[0].to_pydatetime(),
                at(monday - timedelta(days=1), "17:00"),
                float(pw["open"].iloc[0]),
                float(pw["close"].iloc[-1]),
                "1h",
            )
        )
    for slot in config.load("sessions").get("context_slots", ["21:00", "01:00", "05:00", "09:00"]):
        c = slot_candle(md.h4, md.trading_date, slot)
        if c is None:
            continue
        st = at(md.trading_date - timedelta(days=1), slot) if slot >= "17:00" else at(md.trading_date, slot)
        en = candle_close_time(st, "4h")
        live = en > md.asof
        out.append(
            RangeSpec(
                f"h4_{slot.replace(':', '')}",
                SLOT_LABEL.get(slot, slot),
                "context",
                float(c["high"]),
                float(c["low"]),
                st,
                min(en, md.asof) if live else en,
                float(c["open"]),
                float(c["close"]),
                "15m",
                live=live,
            )
        )
    for name, w in config.load("sessions")["sessions"].items():
        if name == "rth":
            continue
        s, e = session_range(w["start"], w["end"], md.trading_date)
        seg = between(md.fine, s, min(e, md.asof))
        o = ohlc(seg)
        if o:
            live = e > md.asof
            out.append(
                RangeSpec(
                    f"session_{name}",
                    f"{name.capitalize()} session",
                    "session",
                    o["h"],
                    o["l"],
                    s,
                    min(e, md.asof) if live else e,
                    o["o"],
                    o["c"],
                    "15m",
                    live=live,
                )
            )
    if orange_day:
        s, e = at(md.trading_date, "08:30"), at(md.trading_date, "09:00")
        o = ohlc(between(md.fine, s, min(e, md.asof)))
        if o:
            out.append(RangeSpec("range_0830_0900", "8:30–9:00 range", "session", o["h"], o["l"], s, e, o["o"], o["c"], "15m", live=e > md.asof))
    return out


def tf_bars(md: MarketData, tf: str) -> pd.DataFrame:
    return {"15m": md.m15, "30m": md.m30, "1h": md.h1}[tf]


def execution_ranges(md: MarketData, tf: str, since_hhmm: str = "08:00") -> list[RangeSpec]:
    """Every closed candle on `tf` from 08:00 today onward, each a range for the candle that follows it."""
    bars = tf_bars(md, tf)
    start = at(md.trading_date, since_hhmm).astimezone(UTC)
    seg = bars[(bars.index >= start) & (bars.index < md.asof.astimezone(UTC))]
    out = []
    for ts, r in seg.iterrows():
        o = ts.to_pydatetime()
        c = candle_close_time(o, tf)
        if c > md.asof:
            continue
        out.append(
            RangeSpec(
                f"{tf}_{o.astimezone(md.asof.tzinfo).strftime('%H%M')}",
                f"{tf} {o.astimezone(md.asof.tzinfo).strftime('%H:%M')} candle",
                "execution",
                float(r["high"]),
                float(r["low"]),
                o,
                c,
                float(r["open"]),
                float(r["close"]),
                tf,
            )
        )
    return out


def current_execution_range(md: MarketData, tf: str) -> tuple[RangeSpec | None, datetime]:
    """The last closed candle on tf (the range) and the close time of the candle now forming."""
    m = INTERVAL_MIN[tf]
    t = md.asof
    total = t.hour * 60 + t.minute
    cur_open = at(t.date(), "00:00") + timedelta(minutes=total - total % m)
    cur_close = cur_open + timedelta(minutes=m)
    bars = tf_bars(md, tf)
    prev_open = (cur_open - timedelta(minutes=m)).astimezone(UTC)
    if prev_open in bars.index:
        r = bars.loc[prev_open]
        po = prev_open.astimezone(md.asof.tzinfo)
        return RangeSpec(
            f"{tf}_{po.strftime('%H%M')}",
            f"{tf} {po.strftime('%H:%M')} candle",
            "execution",
            float(r["high"]),
            float(r["low"]),
            po,
            cur_open,
            float(r["open"]),
            float(r["close"]),
            tf,
        ), cur_close
    return None, cur_close


def premarket_ranges_for_window(md: MarketData, tf: str) -> list[RangeSpec]:
    """Before 9:00: the pre-market candles the 9:00 and 9:30 candles will interact with."""
    out = []
    bars = tf_bars(md, tf)
    for hhmm in ("08:00", "08:30", "08:45", "08:15"):
        o = at(md.trading_date, hhmm)
        key = o.astimezone(UTC)
        if key in bars.index and candle_close_time(o, tf) <= md.asof:
            r = bars.loc[key]
            out.append(
                RangeSpec(
                    f"{tf}_{hhmm.replace(':', '')}",
                    f"{tf} {hhmm} candle",
                    "execution",
                    float(r["high"]),
                    float(r["low"]),
                    o,
                    candle_close_time(o, tf),
                    float(r["open"]),
                    float(r["close"]),
                    tf,
                )
            )
    return out
