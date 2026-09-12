"""Assemble the CRT panel: ranges → detection → setups → templates → liquidity."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from .. import config, instruments
from ..candles import atr, between, candle_close_time
from ..market import MarketData
from ..models import CRT, ContextRange, ExecutionTF, LevelRow, Levels, Odds, Setup, Stat, Template, TFState
from ..timeutil import at, iso, parse_hhmm, seconds_between
from . import liquidity as liq
from . import quality, smt
from .detect import RangeSpec, RangeState, detect, setup_state, sweep_to_model, tf_delta, three_candle_sequence
from .ranges import context_ranges, current_execution_range, execution_ranges, premarket_ranges_for_window, tf_bars
from .stats import WEEKDAYS, odds_for

TF_TEMPLATE = {"1h": "T3", "30m": "T4", "15m": "T1"}


@dataclass
class CRTInputs:
    bias_direction: str | None  # long | short | None
    orange_times: list[datetime]
    stats: dict[str, Any]
    levels: Levels
    is_orange_day: bool


def _to_model(st: RangeState, by_tf: dict[str, RangeState] | None = None) -> ContextRange:
    s = st.spec
    sw = st.active
    tfmap = {tf: TFState(phase=x.phase, sweeps=[sweep_to_model(y) for y in x.sweeps]) for tf, x in (by_tf or {}).items()}  # type: ignore[arg-type]
    return ContextRange(
        id=s.id,
        label=s.label,
        kind=s.kind,
        timeframe=s.timeframe,
        o=s.o,
        h=s.h,
        l=s.l,
        c=s.c,
        eq=s.eq,
        start=iso(s.start),
        end=iso(s.end),
        live=s.live,
        sweeps=[sweep_to_model(x) for x in st.sweeps],  # type: ignore[arg-type]
        phase=st.phase,
        readable=st.readable,  # type: ignore[arg-type]
        reached_eq_at=iso(sw.reached_eq_at) if sw else None,
        reached_opposite_at=iso(sw.reached_opposite_at) if sw else None,
        invalidated_at=iso(sw.invalidated_at) if sw else None,
        by_timeframe=tfmap,
    )


def _odds(stats: dict[str, Any], tf: str, hour: int | None, weekday: str) -> tuple[Odds, str]:
    o, scope = odds_for(stats, tf, hour, weekday)
    return Odds(**{k: (o[k] if isinstance(o[k], Stat) else Stat(**o[k])) for k in Odds.model_fields}), scope


def premium_discount(price: float | None, ranges: list[RangeSpec]) -> dict[str, str]:
    out: dict[str, str] = {}
    if price is None:
        return out
    for r in ranges:
        if r.id in ("h4_0500", "daily_cur", "daily_prev", "weekly_prev"):
            key = {"h4_0500": "h4_0500", "daily_cur": "daily", "daily_prev": "daily_prev", "weekly_prev": "weekly"}[r.id]
            out[key] = "discount" if price < r.eq else "premium" if price > r.eq else "equilibrium"
    return out


def _context_level_hit(level: float, ctx: list[RangeSpec], tick: float, tol_ticks: int = 8) -> str | None:
    for r in ctx:
        if abs(r.h - level) <= tol_ticks * tick:
            return f"{r.label} high"
        if abs(r.l - level) <= tol_ticks * tick:
            return f"{r.label} low"
    return None


def _next_pool(rows: list[LevelRow], direction: str, beyond: float) -> float | None:
    cands = [r.price for r in rows if (r.price > beyond if direction == "long" else r.price < beyond)]
    if not cands:
        return None
    return min(cands) if direction == "long" else max(cands)


def build_setup(
    md: MarketData,
    spec: RangeSpec,
    st: RangeState | None,
    side: str,
    tf: str,
    inputs: CRTInputs,
    ctx: list[RangeSpec],
    pools: list[LevelRow],
    tick: float,
    ins: instruments.Instrument,
    scenario: str,
) -> Setup:
    """A setup for sweeping `side` of `spec` on `tf`: pending/confirmed/... when a sweep exists, else 'watch'."""
    crt = config.load("crt")
    sw = st.active if st and st.active and st.active.side == side else None
    direction = "long" if side == "low" else "short"
    state = setup_state(sw)
    level = spec.l if side == "low" else spec.h
    extreme = sw.extreme if sw else level
    buffer = float(crt["stop_buffer_ticks"]) * tick
    a_tf = atr(tf_bars(md, tf), 14) or 0.0
    if sw is None:
        # no sweep yet: assume a typical sweep depth of half an ATR of this timeframe
        extreme = level - 0.5 * a_tf if direction == "long" else level + 0.5 * a_tf
    stop = extreme - buffer if direction == "long" else extreme + buffer
    t1 = spec.eq
    t2 = spec.h if direction == "long" else spec.l
    t3 = _next_pool(pools, direction, t2)
    # entry model: close of the confirming candle, or the FVG/OB left by the displacement
    entry_px = level + 0.25 * a_tf if direction == "long" else level - 0.25 * a_tf
    if sw is None:
        entry_px = min(entry_px, t1) if direction == "long" else max(entry_px, t1)
    displacement = False
    entry_note = f"Enter at the close of the {tf} candle that closes back inside (estimated {entry_px:,.2f}; stop assumes a sweep of about half an ATR14 {a_tf:.2f} beyond the level)"
    if sw and sw.closed_inside:
        tfb = tf_bars(md, tf)
        key = sw.exec_candle_open.astimezone(md.asof.tzinfo)
        a = atr(tfb, 14)
        k = sw.exec_candle_open
        k = sw.exec_candle_close - tf_delta(tf)  # open of the confirming candle
        if k.astimezone(tfb.index.tz) in tfb.index:  # type: ignore[union-attr]
            row = tfb.loc[k.astimezone(tfb.index.tz)]  # type: ignore[union-attr]
            body = abs(float(row["close"]) - float(row["open"]))
            entry_px = float(row["close"])
            displacement = bool(a and body >= float(crt["displacement_k"]) * a)
            if displacement:
                entry_note = f"Displacement body {body:.2f} ≥ {crt['displacement_k']}×ATR14 {a:.2f}: enter at the close or on the retest of the gap it left"
            else:
                entry_note = f"No displacement (body {body:.2f} < {crt['displacement_k']}×ATR14 {a:.2f}): enter at the close {entry_px:,.2f}"
        _ = key
    entry_zone = sorted([round(entry_px, 2), round(level, 2)])
    risk = abs(entry_px - stop)
    rr = round(abs(t2 - entry_px) / risk, 2) if risk > 0 else None
    weekday = WEEKDAYS[md.trading_date.weekday()] if md.trading_date.weekday() < 5 else "Mon"
    hour = sw.exec_candle_open.astimezone(md.asof.tzinfo).hour if sw else None
    odds, scope = _odds(inputs.stats, tf, hour, weekday)
    smt_res = smt.check(md, spec.start, spec.end, side, sw.at, ins.smt_partner, ins.smt_tiebreak) if sw else None
    pd_map = premium_discount(md.quote.price if md.quote else None, ctx)
    ref_pd = pd_map.get("h4_0500") or pd_map.get("daily")
    aligned_pd = (direction == "long" and ref_pd == "discount") or (direction == "short" and ref_pd == "premium")
    confirm_at = sw.exec_candle_close if sw else None
    orange_near = any(abs(seconds_between(t, sw.at)) <= 1800 for t in inputs.orange_times) if sw else False
    ctx_hit = (
        _context_level_hit(level, [r for r in ctx if r.id != spec.id], tick)
        if spec.kind == "execution"
        else spec.label + (" low" if side == "low" else " high")
    )
    q, q_reasons = quality.score(
        on_context_level=ctx_hit is not None,
        key_time=bool(sw and sw.key_time),
        displacement=displacement,
        smt=bool(smt_res and smt_res.divergent),
        aligned_bias=inputs.bias_direction == direction,
        aligned_pd=aligned_pd,
        reach_eq=odds.reach_eq,
        orange_within_30m=orange_near,
        sweep_pct=sw.pct if sw else None,
        confirmation_at=confirm_at,
    )
    counter = inputs.bias_direction is not None and inputs.bias_direction != direction
    when = "after 9:30" if md.asof < at(md.trading_date, "09:30") else "now"
    tfs = tf if spec.kind == "execution" else f"{tf}"
    lvl_name = f"{spec.label} {'low' if side == 'low' else 'high'}"
    close_txt = sw.exec_candle_close.astimezone(md.asof.tzinfo).strftime("%H:%M") if sw else None
    if state == "watch":
        forming = (
            f", still forming until {spec.end.astimezone(md.asof.tzinfo).strftime('%H:%M') if not spec.live else candle_close_time(spec.start, '4h').strftime('%H:%M') if spec.id.startswith('h4') else '9:30'}"
            if spec.live
            else ""
        )
        sentence = f"Watch for a sweep of the {lvl_name} ({level:,.2f}{forming}) {when} that closes back inside on the {tfs}; target {t1:,.2f} (EQ) then {t2:,.2f} ({spec.label} {'high' if direction == 'long' else 'low'}). Stand down at 12:00."
        trigger = f"Price trades below {level:,.2f}" if side == "low" else f"Price trades above {level:,.2f}"
        confirmation = f"The {tfs} candle that swept it closes back inside the range"
    elif state == "pending":
        sentence = f"{lvl_name} ({level:,.2f}) swept at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')}: if the {tfs} candle closes back inside by {close_txt}, {'buy' if direction == 'long' else 'sell'} toward {t1:,.2f} (EQ) then {t2:,.2f}. Invalid on a close beyond {extreme:,.2f}."  # type: ignore[union-attr]
        trigger = f"Swept {level:,.2f} at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')} (depth {sw.depth_ticks:g} ticks)"  # type: ignore[union-attr]
        confirmation = f"Waiting for the {tfs} close at {close_txt} back inside {spec.l:,.2f}–{spec.h:,.2f}"
    else:
        later = (
            f" (on the {sw.reclaim_candles + 1}{'nd' if sw.reclaim_candles == 1 else 'rd' if sw.reclaim_candles == 2 else 'th'} candle after the sweep)"
            if sw and sw.reclaim_candles
            else ""
        )  # type: ignore[union-attr]
        sentence = f"{lvl_name} swept at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')} and the {tfs} closed back inside at {close_txt}{later}: {'long' if direction == 'long' else 'short'} from {entry_px:,.2f}, stop {stop:,.2f}, target {t1:,.2f} then {t2:,.2f}."  # type: ignore[union-attr]
        trigger = f"Swept {level:,.2f} at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')} (depth {sw.depth_ticks:g} ticks, {sw.pct:g}% of range)"  # type: ignore[union-attr]
        confirmation = f"{tfs} closed back inside at {close_txt}" + (
            f"; first 5m close inside at {sw.reclaimed_at.astimezone(md.asof.tzinfo).strftime('%H:%M')}" if sw and sw.reclaimed_at else ""
        )  # type: ignore[union-attr]
    valid_until = at(md.trading_date, config.load("sessions")["trading_window"]["end"])
    inval = f"A {tfs} close beyond {extreme:,.2f}" + (" (the sweep low)" if direction == "long" else " (the sweep high)")
    return Setup(
        id=f"{spec.id}:{side}:{tf}",
        timeframe=tf,
        template=TF_TEMPLATE.get(tf, "T1") if spec.kind == "execution" else ("T5" if spec.id == "daily_prev" else "T1" if spec.id == "h4_0500" else "T2"),  # type: ignore[arg-type]
        scenario=scenario,
        state=state,
        direction=direction,
        range_id=spec.id,
        range_label=spec.label,
        sweep_side=side,  # type: ignore[arg-type]
        sweep_level=round(level, 2),
        sweep_at=iso(sw.at) if sw else None,
        reclaim_at=iso(sw.reclaimed_at) if sw else None,
        candle_close_at=iso(sw.exec_candle_close) if sw else None,
        earliest_entry_at=iso(sw.exec_candle_close) if sw and sw.closed_inside else None,
        trigger=trigger,
        confirmation=confirmation,
        entry_zone=entry_zone,
        entry_note=entry_note,
        stop=round(stop, 2),
        t1=round(t1, 2),
        t2=round(t2, 2),
        t3=round(t3, 2) if t3 else None,
        rr_t2=rr,
        quality=q,
        quality_reasons=q_reasons,
        odds=odds,
        odds_scope=scope,
        valid_until=iso(valid_until) or "",
        invalidation=inval,
        smt=smt_res.model_dump() if smt_res else None,
        premium_discount=ref_pd,
        counter_bias=counter,
        warning="Counter-bias setup: only from " + ("discount" if direction == "long" else "premium") if counter else None,
        sentence=sentence,
    )


def build(md: MarketData, inputs: CRTInputs) -> tuple[CRT, list[Setup]]:
    ins = instruments.get(md.instrument)
    tick = ins.tick
    sess = config.load("sessions")
    tfs = list(sess.get("execution_timeframes", ["15m", "30m", "1h"]))
    cutoff = at(md.trading_date, sess["trading_window"]["end"])
    ctx_specs = context_ranges(md, inputs.is_orange_day)
    # context ranges are watched on every execution timeframe; a later candle may provide the close back inside
    ctx_by_tf: dict[str, dict[str, RangeState]] = {}
    for spec in ctx_specs:
        cut = cutoff if (spec.kind != "context" or spec.id.startswith("h4")) else None
        ctx_by_tf[spec.id] = {tf: detect(spec, md.fine, tf_bars(md, tf), md.asof, tick, tf, cutoff=cut, allow_later_reclaim=3) for tf in tfs}
    ctx_states: list[RangeState] = [ctx_by_tf[spec.id]["15m" if "15m" in tfs else tfs[0]] for spec in ctx_specs]
    exec_out: dict[str, ExecutionTF] = {}
    exec_states: dict[str, list[RangeState]] = {}
    for tf in tfs:
        specs = execution_ranges(md, tf) if md.asof >= at(md.trading_date, "09:00") else premarket_ranges_for_window(md, tf)
        states = [detect(s, md.fine, tf_bars(md, tf), md.asof, tick, tf, cutoff=cutoff) for s in specs]
        exec_states[tf] = states
        cur, closes_at = current_execution_range(md, tf)
        cur_state = detect(cur, md.fine, tf_bars(md, tf), md.asof, tick, tf, cutoff=cutoff) if cur is not None else None
        seq = three_candle_sequence(tf_bars(md, tf), md.asof, tick)
        if md.asof < at(md.trading_date, "09:00"):
            note = f"Before 9:00 the {tf} ranges that matter are the pre-market candles the 9:00 and 9:30 candles will interact with; the 5 AM 4H candle is the reference range until then."
        elif cur_state is None:
            note = f"No closed {tf} candle yet today."
        else:
            sw = cur_state.active
            note = (
                f"{cur.label} is the live range ({cur.l:,.2f}–{cur.h:,.2f}); the candle now forming closes at {closes_at.strftime('%H:%M')}."  # type: ignore[union-attr]
                if sw is None
                else f"{cur.label} {sw.side} swept at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')}; {'closed back inside' if sw.closed_inside else 'waiting for the close at ' + closes_at.strftime('%H:%M') if sw.closed_inside is None else 'closed outside (expansion)'}."  # type: ignore[union-attr]
            )
        exec_out[tf] = ExecutionTF(
            timeframe=tf,
            range=_to_model(cur_state) if cur_state else None,
            state=setup_state(cur_state.active) if cur_state else None,
            closes_at=iso(closes_at),
            sequence_phase=seq,
            note=note,
        )  # type: ignore[arg-type]
    pools = liq.build(md, inputs.levels, tick)
    price = md.quote.price if md.quote else None
    window_open = at(md.trading_date, "09:00")
    candidates: list[Setup] = []
    # 1) context-range sweeps inside the window with a close back inside (or pending) on each timeframe
    for spec in ctx_specs:
        for tf, st in ctx_by_tf[spec.id].items():
            sw = st.active
            if sw and sw.at >= window_open and sw.closed_inside is not False and sw.invalidated_at is None and sw.reached_opposite_at is None:
                candidates.append(build_setup(md, spec, st, sw.side, tf, inputs, ctx_specs, pools, tick, ins, "primary"))
    # 2) execution-range sweeps inside the window (freshest per timeframe)
    for tf, states in exec_states.items():
        live = [
            s for s in states if s.active and s.active.closed_inside is not False and s.active.invalidated_at is None and s.active.reached_opposite_at is None
        ]
        if live:
            st = live[-1]
            sw = st.active
            assert sw is not None
            candidates.append(build_setup(md, st.spec, st, sw.side, tf, inputs, ctx_specs, pools, tick, ins, "primary"))
    # 3) watch setups: bias × unswept context levels × liquidity, for timeframes still without a live setup
    if price is not None:
        direction = inputs.bias_direction or "long"
        side = "low" if direction == "long" else "high"
        reach = 3 * (atr(md.h1, 14) or 0.0) or float("inf")
        cand = [r for r in ctx_specs if r.id in ("h4_0500", "h4_0100", "daily_prev", "session_premarket", "session_london", "session_asia")]
        cand = [r for r in cand if not any(x.side == side for x in ctx_by_tf[r.id]["15m" if "15m" in tfs else tfs[0]].sweeps)]
        cand = [r for r in cand if (price - reach <= r.l < price if side == "low" else price < r.h <= price + reach)]
        cand.sort(key=lambda r: abs((r.l if side == "low" else r.h) - price))
        live_tfs = {c.timeframe for c in candidates if c.state != "watch"}
        for i, tf in enumerate(["30m", "15m", "1h"]):
            if tf not in tfs or tf in live_tfs or not cand:
                continue
            spec = cand[min(i, len(cand) - 1)] if tf == "1h" else cand[0]
            candidates.append(build_setup(md, spec, ctx_by_tf[spec.id][tf], side, tf, inputs, ctx_specs, pools, tick, ins, "primary"))
    rank = {"active": 0, "confirmed": 1, "pending": 2, "watch": 3, "done": 4, "invalidated": 5}
    tf_pref = {"30m": 0, "15m": 1, "1h": 2}
    candidates.sort(key=lambda s: (rank.get(s.state, 9), s.counter_bias, tf_pref.get(s.timeframe, 3) if s.state == "watch" else 0, -s.quality))
    setups: list[Setup] = []
    seen_tf: set[str] = set()
    for c in candidates:
        if c.timeframe in seen_tf:
            continue
        seen_tf.add(c.timeframe)
        setups.append(c)
    ideas = setups[:3]
    # alternate scenario: the opposite side of the primary's range on the same timeframe
    if setups:
        p = setups[0]
        alt_spec: RangeSpec | None = next((r for r in ctx_specs if r.id == p.range_id), None)
        st_alt = ctx_by_tf[alt_spec.id][p.timeframe] if alt_spec is not None else None
        if alt_spec is None:
            for st in exec_states.get(p.timeframe, []):
                if st.spec.id == p.range_id:
                    alt_spec, st_alt = st.spec, st
        if alt_spec is not None:
            alt = build_setup(md, alt_spec, st_alt, "high" if p.sweep_side == "low" else "low", p.timeframe, inputs, ctx_specs, pools, tick, ins, "alternate")
            setups.append(alt)
    templates = evaluate_templates(md, ctx_states, exec_states, inputs.stats)
    smt_out = next((smt.SMT(**s.smt) for s in setups if s.smt), None)
    atrs = {tf: atr(tf_bars(md, tf), 14) for tf in tfs}
    crt = CRT(
        context=[_to_model(ctx_states[i], ctx_by_tf[spec.id]) for i, spec in enumerate(ctx_specs)],
        execution=exec_out,
        setups=setups,
        smt=smt_out,
        premium_discount=premium_discount(price, ctx_specs),
        liquidity=pools,
        templates=templates,
        atr={k: (round(v, 2) if v else None) for k, v in atrs.items()},
        as_of=iso(md.asof),
    )
    return crt, ideas


TEMPLATES = {
    "T1": ("1–5–9", "1 AM range, 5 AM sweep and reclaim, delivery inside the 9 AM candle"),
    "T2": ("Opening sweep", "The 9:30 candle sweeps the pre-market or 5 AM high/low within 30 minutes and reverses in the 9:50–10:10 window"),
    "T3": ("Hourly sequence", "9:00 range, 10:00 sweep and reclaim, 11:00 delivery (and 8:00 → 9:00 → 10:00)"),
    "T4": ("Half-hour sequence", "9:30 range, 10:00 sweep and reclaim, 10:30 delivery, and each later triplet until 12:00"),
    "T5": ("Daily turtle soup", "PDH or PDL swept and reclaimed inside the window; target EQ and the opposite side of yesterday"),
    "T6": ("Orange-folder range", "The 8:30–9:00 (or 9:30–10:00) range as the range for the candle after the print"),
}


def evaluate_templates(md: MarketData, ctx: list[RangeState], ex: dict[str, list[RangeState]], stats: dict[str, Any]) -> list[Template]:
    by_id = {s.spec.id: s for s in ctx}
    out = []
    tf_stats = stats.get("by_timeframe", {})

    def hit(tf: str) -> Stat:
        b = tf_stats.get(tf)
        if not b:
            return Stat(value=None, n=0, unit="p")
        v = b["reach_eq"]
        return v if isinstance(v, Stat) else Stat(**v)

    def by_wd(tf: str) -> dict[str, Stat]:
        res = {}
        for wd in WEEKDAYS:
            b = stats.get("by_weekday", {}).get(f"{tf}@{wd}")
            if b:
                v = b["reach_eq"]
                res[wd] = v if isinstance(v, Stat) else Stat(**v)
        return res

    # T1
    s5 = by_id.get("h4_0500")
    s1 = by_id.get("h4_0100")
    t1_state = "pending"
    live = False
    if s1 and s5:
        sw5 = [x for x in s5.sweeps]
        one_sw = [x for x in s1.sweeps if x.at < at(md.trading_date, "09:00")]
        if one_sw and one_sw[-1].closed_inside:
            t1_state = f"5 AM candle swept the 1 AM {one_sw[-1].side} and reclaimed; delivery due in the 9 AM candle"
            live = True
        elif one_sw:
            t1_state = f"1 AM {one_sw[-1].side} swept at {one_sw[-1].at.astimezone(md.asof.tzinfo).strftime('%H:%M')}, not reclaimed"
        else:
            t1_state = "1 AM range not yet swept"
        _ = sw5
    out.append(
        Template(id="T1", name=TEMPLATES["T1"][0], definition=TEMPLATES["T1"][1], live=live, state=t1_state, hit_rate=hit("15m"), by_weekday=by_wd("15m"))
    )
    # T2
    pre = by_id.get("session_premarket")
    t2_live = False
    t2_state = "pending until 9:30"
    if md.asof >= at(md.trading_date, "09:30"):
        for st in (pre, s5):
            for sw in st.sweeps if st else []:
                if st is not None and at(md.trading_date, "09:30") <= sw.at <= at(md.trading_date, "10:00"):
                    t2_live = True
                    t2_state = f"{st.spec.label} {sw.side} swept at {sw.at.astimezone(md.asof.tzinfo).strftime('%H:%M')}; {'closed back inside' if sw.closed_inside else 'closed outside' if sw.closed_inside is False else 'candle still open'}"
        if not t2_live:
            t2_state = "No sweep of the pre-market or 5 AM range in the first 30 minutes"
    out.append(
        Template(id="T2", name=TEMPLATES["T2"][0], definition=TEMPLATES["T2"][1], live=t2_live, state=t2_state, hit_rate=hit("30m"), by_weekday=by_wd("30m"))
    )
    # T3 / T4 from execution sequences
    for tid, tf in (("T3", "1h"), ("T4", "30m")):
        states = ex.get(tf, [])
        live_s = [s for s in states if s.active and s.active.closed_inside]
        lv = bool(live_s)
        last_sw = live_s[-1].active if live_s else None
        st_txt = (
            f"{live_s[-1].spec.label} {last_sw.side if last_sw else ''} swept and reclaimed; phase {live_s[-1].phase}"
            if lv
            else ("pending: no reclaimed sweep on the " + tf + " yet" if md.asof >= at(md.trading_date, "09:00") else "pending until 9:00")
        )  # type: ignore[union-attr]
        out.append(Template(id=tid, name=TEMPLATES[tid][0], definition=TEMPLATES[tid][1], live=lv, state=st_txt, hit_rate=hit(tf), by_weekday=by_wd(tf)))
    # T5
    dp = by_id.get("daily_prev")
    t5_live = bool(dp and dp.sweeps and dp.sweeps[-1].at >= at(md.trading_date, "09:00") and dp.sweeps[-1].closed_inside)
    t5_state = (
        f"PD{'L' if dp.sweeps[-1].side == 'low' else 'H'} swept at {dp.sweeps[-1].at.astimezone(md.asof.tzinfo).strftime('%H:%M')}; phase {dp.phase}"
        if dp and dp.sweeps
        else "PDH/PDL untouched inside the window"
    )  # type: ignore[union-attr]
    out.append(
        Template(id="T5", name=TEMPLATES["T5"][0], definition=TEMPLATES["T5"][1], live=t5_live, state=t5_state, hit_rate=hit("15m"), by_weekday=by_wd("15m"))
    )
    r8 = by_id.get("range_0830_0900")
    out.append(
        Template(
            id="T6",
            name=TEMPLATES["T6"][0],
            definition=TEMPLATES["T6"][1],
            live=bool(r8 and r8.sweeps),
            state=("8:30–9:00 range in play; phase " + r8.phase) if r8 else "No orange-folder event today",
            hit_rate=hit("30m"),
            by_weekday=by_wd("30m"),
        )
    )
    return out


def orange_times_today(events: list[Any], trading_date) -> list[datetime]:
    out = []
    for e in events:
        if e.impact == "medium" and e.when is not None and e.when.date() == trading_date:
            out.append(e.when)
    return out


def _unused(*_: Any) -> None:  # keep imports referenced for mypy when optional paths are unused
    between, candle_close_time, parse_hhmm, timedelta  # noqa: B018
