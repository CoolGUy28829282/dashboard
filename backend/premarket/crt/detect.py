"""Sweep / manipulation / distribution detection on fine bars, reported on the execution timeframe."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta

import pandas as pd

from .. import config
from ..candles import INTERVAL_MIN, between, candle_close_time
from ..timeutil import NY, UTC, at, iso, parse_hhmm, seconds_between


@dataclass
class RangeSpec:
    id: str
    label: str
    kind: str  # context | session | execution
    h: float
    l: float
    start: datetime  # range candle open
    end: datetime  # range candle close = when it becomes tradeable as a range
    o: float | None = None
    c: float | None = None
    timeframe: str | None = None  # execution timeframe the sweep is evaluated on
    live: bool = False

    @property
    def eq(self) -> float:
        return (self.h + self.l) / 2

    @property
    def size(self) -> float:
        return self.h - self.l


@dataclass
class SweepResult:
    side: str
    at: datetime
    extreme: float
    depth_ticks: float
    pct: float
    key_time: bool
    exec_candle_open: datetime
    exec_candle_close: datetime
    closed_inside: bool | None  # None = candle still open (pending)
    reclaimed_at: datetime | None
    reclaim_candles: int = 0  # 0 = the sweeping candle itself closed inside; k = the k-th later candle did
    reached_eq_at: datetime | None = None
    reached_opposite_at: datetime | None = None
    invalidated_at: datetime | None = None
    minutes_to_eq: float | None = None
    minutes_to_opposite: float | None = None


@dataclass
class RangeState:
    spec: RangeSpec
    sweeps: list[SweepResult] = field(default_factory=list)
    phase: str = "range"
    readable: bool = True

    @property
    def active(self) -> SweepResult | None:
        """The sweep that defines the range's state: the latest confirmed one that was not invalidated, else the latest."""
        if not self.sweeps:
            return None
        confirmed = [s for s in self.sweeps if s.closed_inside and s.invalidated_at is None]
        return confirmed[-1] if confirmed else self.sweeps[-1]


def is_key_time(ts: datetime, tf: str, key_times: list[dict], first_minutes: int) -> bool:
    t = ts.astimezone(NY)
    minutes_into = (t.hour * 60 + t.minute) % INTERVAL_MIN[tf]
    if minutes_into < first_minutes:
        return True
    clock = t.time()
    for k in key_times:
        if "start" in k and parse_hhmm(k["start"]) <= clock <= parse_hhmm(k["end"]):
            return True
    return False


def _exec_candle(ts: datetime, tf: str) -> tuple[datetime, datetime]:
    t = ts.astimezone(NY)
    m = INTERVAL_MIN[tf]
    total = t.hour * 60 + t.minute
    start_min = total - total % m
    o = at(t.date(), time(start_min // 60, start_min % 60))
    return o, candle_close_time(o, tf)


def detect(
    spec: RangeSpec,
    fine: pd.DataFrame,
    tf_bars: pd.DataFrame,
    asof: datetime,
    tick: float,
    tf: str,
    cutoff: datetime | None = None,
    allow_later_reclaim: int = 0,
) -> RangeState:
    """Scan fine bars after the range close for sweeps of either side and follow each through the phases.

    `tf_bars` are the execution-timeframe candles used to decide "closed back inside".
    `cutoff` caps distribution tracking (12:00 stand-down).
    """
    crt = config.load("crt")
    sess = config.load("sessions")
    min_ticks = float(crt.get("min_sweep_ticks", 2))
    first_minutes = int(crt.get("key_time_first_minutes", 15))
    state = RangeState(spec=spec)
    end = min(asof, cutoff) if cutoff else asof
    bars = between(fine, spec.end, end)
    if bars.empty or spec.size <= 0:
        return state
    swept_high = swept_low = False
    i = 0
    idx = list(bars.index)
    while i < len(idx):
        ts = idx[i]
        row = bars.iloc[i]
        side = None
        if row["high"] >= spec.h + min_ticks * tick and not swept_high:
            side = "high"
        if row["low"] <= spec.l - min_ticks * tick and not swept_low:
            side = "low" if side is None else side
        if side is None:
            i += 1
            continue
        ts_dt = ts.to_pydatetime()
        c_open, c_close = _exec_candle(ts_dt, tf)
        # the sweep candle on the execution timeframe: extreme within the candle
        cand = between(bars, c_open, c_close)
        extreme = float(cand["high"].max()) if side == "high" else float(cand["low"].min())
        depth = (extreme - spec.h) if side == "high" else (spec.l - extreme)
        closed_inside: bool | None
        tf_key = c_open.astimezone(UTC)
        if c_close <= end and tf_key in tf_bars.index:
            close_px = float(tf_bars.loc[tf_key, "close"])
            closed_inside = spec.l <= close_px <= spec.h
        elif c_close <= end and not cand.empty:
            closed_inside = spec.l <= float(cand["close"].iloc[-1]) <= spec.h
        else:
            closed_inside = None
        reclaim_k = 0
        confirm_close = c_close
        if closed_inside is False and allow_later_reclaim > 0:
            # accumulation after the sweep: a later candle on this timeframe may close back inside
            k_open = c_open
            for k in range(1, allow_later_reclaim + 1):
                k_open = candle_close_time(k_open, tf)
                k_close = candle_close_time(k_open, tf)
                kc = between(bars, k_open, k_close)
                if kc.empty:
                    break
                lo_k, hi_k = float(kc["low"].min()), float(kc["high"].max())
                if side == "low" and lo_k < extreme:
                    extreme = lo_k
                if side == "high" and hi_k > extreme:
                    extreme = hi_k
                if k_close > end:
                    closed_inside = None
                    confirm_close = k_close
                    reclaim_k = k
                    break
                kk = k_open.astimezone(UTC)
                close_px = float(tf_bars.loc[kk, "close"]) if kk in tf_bars.index else float(kc["close"].iloc[-1])
                if spec.l <= close_px <= spec.h:
                    closed_inside = True
                    confirm_close = k_close
                    reclaim_k = k
                    break
            depth = (extreme - spec.h) if side == "high" else (spec.l - extreme)
        after = bars[bars.index > ts]
        inside = after[(after["close"] <= spec.h) & (after["close"] >= spec.l)]
        reclaimed_at = inside.index[0].to_pydatetime() if not inside.empty else None
        sw = SweepResult(
            side=side,
            at=ts_dt,
            extreme=extreme,
            depth_ticks=round(depth / tick, 1),
            pct=round(100 * depth / spec.size, 1),
            key_time=is_key_time(ts_dt, tf, sess.get("key_times", []), first_minutes),
            exec_candle_open=c_open,
            exec_candle_close=confirm_close,
            closed_inside=closed_inside,
            reclaimed_at=reclaimed_at,
            reclaim_candles=reclaim_k,
        )
        if side == "high":
            swept_high = True
        else:
            swept_low = True
        if closed_inside:
            _follow_distribution(sw, spec, bars[bars.index >= confirm_close.astimezone(UTC)], end)
        state.sweeps.append(sw)
        # continue scanning after this execution candle for the other side
        i = next((k for k, t2 in enumerate(idx) if t2 >= confirm_close.astimezone(UTC)), len(idx))
    state.readable = not (swept_high and swept_low)
    state.phase = _phase(state)
    return state


def _follow_distribution(sw: SweepResult, spec: RangeSpec, after: pd.DataFrame, end: datetime) -> None:
    eq = spec.eq
    for ts, row in after.iterrows():
        t = ts.to_pydatetime()
        if sw.side == "low":
            if sw.invalidated_at is None and row["low"] < sw.extreme:
                sw.invalidated_at = t
                break
            if sw.reached_eq_at is None and row["high"] >= eq:
                sw.reached_eq_at = t
                sw.minutes_to_eq = seconds_between(sw.exec_candle_close, t) / 60
            if sw.reached_opposite_at is None and row["high"] >= spec.h:
                sw.reached_opposite_at = t
                sw.minutes_to_opposite = seconds_between(sw.exec_candle_close, t) / 60
                break
        else:
            if sw.invalidated_at is None and row["high"] > sw.extreme:
                sw.invalidated_at = t
                break
            if sw.reached_eq_at is None and row["low"] <= eq:
                sw.reached_eq_at = t
                sw.minutes_to_eq = seconds_between(sw.exec_candle_close, t) / 60
            if sw.reached_opposite_at is None and row["low"] <= spec.l:
                sw.reached_opposite_at = t
                sw.minutes_to_opposite = seconds_between(sw.exec_candle_close, t) / 60
                break


def _phase(state: RangeState) -> str:
    sw = state.active
    if sw is None:
        return "range"
    if sw.closed_inside is None:
        return "manipulation"
    if sw.closed_inside is False:
        return "expansion"
    if sw.invalidated_at:
        return "invalidated"
    if sw.reached_opposite_at:
        return "complete"
    if sw.reached_eq_at:
        return "distribution"
    return "manipulation_confirmed"


def setup_state(sw: SweepResult | None) -> str:
    if sw is None:
        return "watch"
    if sw.closed_inside is None:
        return "pending"
    if sw.closed_inside is False:
        return "invalidated"
    if sw.invalidated_at:
        return "invalidated"
    if sw.reached_opposite_at:
        return "done"
    if sw.reached_eq_at:
        return "active"
    return "confirmed"


def three_candle_sequence(tf_bars: pd.DataFrame, asof: datetime, tick: float) -> str:
    """Label the Range → Manipulation → Distribution sequence over the last three closed candles."""
    closed = tf_bars[tf_bars.index < asof.astimezone(UTC)]
    if len(closed) < 2:
        return "range"
    c1, c2 = closed.iloc[-2], closed.iloc[-1]
    swept_low = c2["low"] < c1["low"] - tick
    swept_high = c2["high"] > c1["high"] + tick
    inside = c1["low"] <= c2["close"] <= c1["high"]
    if not swept_low and not swept_high:
        return "inside" if c2["high"] <= c1["high"] and c2["low"] >= c1["low"] else "range"
    if inside:
        return "manipulation_confirmed"
    return "expansion"


def sweep_to_model(sw: SweepResult) -> dict:
    return {
        "side": sw.side,
        "at": iso(sw.at),
        "depth_ticks": sw.depth_ticks,
        "pct": sw.pct,
        "key_time": sw.key_time,
        "closed_inside": sw.closed_inside,
        "reclaimed_at": iso(sw.reclaimed_at),
        "candle_close_at": iso(sw.exec_candle_close),
        "extreme": sw.extreme,
        "reclaim_candles": sw.reclaim_candles,
    }


def minutes_between(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 60


def window_cutoff(trading_date, end_hhmm: str = "12:00") -> datetime:
    return at(trading_date, end_hhmm)


def tf_delta(tf: str) -> timedelta:
    return timedelta(minutes=INTERVAL_MIN[tf])
