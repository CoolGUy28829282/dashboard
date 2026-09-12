"""run_premarket_scan(instrument): fetch → compute → write data/snapshots/YYYY-MM-DD_<INSTR>.json."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from . import calendar_, config, history, instruments, intermarket, levels, market, narrative, news, providers, rating, window_stats
from .bias import engine as bias_engine
from .bias import evidence, factors, similar
from .crt import engine as crt_engine
from .crt import stats as crt_stats
from .crt.detect import detect
from .crt.ranges import context_ranges, tf_bars
from .models import Brief, Meta, Modifier, Price, Snapshot, SourceHealth, Stats
from .providers.base import CalEvent
from .providers.mock import fixture_meta
from .timeutil import NY, at, iso, now_utc, ny, seconds_between


def snapshot_dir() -> Path:
    p = config.data_dir() / "snapshots"
    p.mkdir(parents=True, exist_ok=True)
    return p


def snapshot_path(d: date, instrument: str) -> Path:
    return snapshot_dir() / f"{d.isoformat()}_{instrument}.json"


def default_asof() -> datetime:
    """Now in NY; with mock prices, the fixture's frozen time so the mock snapshot is self-consistent."""
    if config.env("PROVIDER_PRICES", "yfinance") == "mock":
        fa = fixture_meta().get("frozen_at")
        if fa:
            return datetime.fromisoformat(fa).astimezone(NY)
    return ny()


def red_folder_dates(events: list[CalEvent]) -> set[date]:
    cfg = config.load("rating")["red_folder"]
    return {date.fromisoformat(e.date) for e in events if e.impact == "high" and e.currency in cfg.get("currencies", ["USD"])}


def _ensure_evidence(instrument: str, md: market.MarketData, excluded: set[date]) -> dict[str, Any]:
    cfg = config.load("bias_weights")["evidence"]
    tbl = evidence.load(instrument)
    if not evidence.is_stale(tbl, int(cfg.get("recompute_days", 7))):
        return tbl
    m5 = history.load(md.symbol, "5m")
    if m5.empty:
        m5 = md.m5
    ny_idx = m5.index.tz_convert(NY)
    days = sorted({d for d in ny_idx.date if d < md.trading_date and d.weekday() < 5})
    conds = {d: factors.historical_conditions(m5, d) for d in days}
    return evidence.build(instrument, m5, conds, excluded if cfg.get("exclude_red_folder", True) else set())


def run_premarket_scan(instrument: str, asof: datetime | None = None, write: bool = True) -> Snapshot:
    asof = (asof or default_asof()).astimezone(NY)
    ins = instruments.get(instrument)
    sess_cfg = config.load("sessions")
    prices = providers.prices()
    cal = providers.calendar()
    newsp = providers.news()
    seriesp = providers.series()
    llm = providers.llm()
    store = config.env("PROVIDER_PRICES", "yfinance") != "mock"
    md = market.load(instrument, prices, asof, store=store)
    tdate = md.trading_date
    # calendar
    events = cal.get_events(at(tdate - timedelta(days=45), "00:00"), at(tdate + timedelta(days=40), "00:00"))
    cal_health = cal.health()
    events_today = [e for e in events if e.date == tdate.isoformat()]
    red_dates = red_folder_dates(events)
    orange_today = rating.orange_events_in_window(events, tdate)
    # levels & sessions
    lv, sessions = levels.compute(md)
    # stats from the store
    hist5 = history.load(md.symbol, "5m") if store else prices.get_bars(ins.yf, "5m", at(tdate - timedelta(days=400), "17:00"), asof)
    if hist5.empty:
        hist5 = md.m5
    excl = red_dates if config.load("crt")["stats"].get("exclude_red_folder", True) else set()
    wstats = window_stats.compute(hist5, tdate, ins.tick, excl)
    cstats = crt_stats.compute(md.symbol, ins.tick, tdate, excl, md.anchor, m5=hist5)
    days_for_ctx = [d for d in crt_stats.trading_days(hist5, tdate, int(config.load("crt")["stats"]["lookback_months"])) if d not in excl]
    cstats["context"] = crt_stats.context_sweep_stats(hist5, days_for_ctx, md.anchor, ins.tick)
    # context detection for the bias (before setups exist)
    ctx_specs = context_ranges(md, bool(orange_today))
    ctx_states = {s.id: detect(s, md.fine, tf_bars(md, "15m"), md.asof, ins.tick, "15m", allow_later_reclaim=3) for s in ctx_specs}
    # news
    news_out, news_score, n_rel = news.build(instrument, newsp, asof)
    # intermarket
    im = intermarket.build(md, seriesp)
    ry_chg = im.real_yield.get("change") if im.real_yield else None
    # factors
    results: dict[str, factors.FactorResult | None] = {
        "overnight_structure": factors.overnight_structure(md, lv, sessions),
        "htf_context": factors.htf_context(md, lv),
        "crt_state": factors.crt_state(md, ctx_states, cstats),
        "intermarket": factors.intermarket(md, ry_chg),
        "news_sentiment": factors.news_sentiment(news_score, n_rel, news_out.summary_source if news_out.sentiment_score is None else "lexicon"),
        "weekday_tendency": factors.weekday_tendency(wstats, tdate),
    }
    missing = {
        "overnight_structure": "no price, PDH/PDL or overnight bars",
        "htf_context": "no daily bars or previous-week levels",
        "crt_state": "no 4H context candles",
        "intermarket": "no intermarket bars",
        "news_sentiment": "no relevant headlines (feeds down or empty)",
        "weekday_tendency": "no stored windows for this weekday yet (n=0)",
    }
    ev_tables = _ensure_evidence(instrument, md, excl)
    # modifiers
    mods: list[Modifier] = []
    bw = config.load("bias_weights")["modifiers"]
    if orange_today:
        mods.append(
            Modifier(
                id="calendar_risk",
                penalty=float(bw["calendar_risk"]["penalty"]),
                reason="Orange-folder " + ", ".join(f"{e.name} at {e.when.strftime('%H:%M')}" for e in orange_today if e.when) + " inside 8:30–12:00",
            )
        )
    ph = prices.health()
    stale_sources = []
    for name, hth in (("prices", ph), ("calendar", cal_health)):
        if not hth.ok:
            stale_sources.append(name)
        elif hth.as_of and seconds_between(datetime.fromisoformat(hth.as_of), asof) > 60 * float(bw["data_quality"]["stale_minutes"]) and store:
            stale_sources.append(name)
    if stale_sources:
        mods.append(
            Modifier(
                id="data_quality",
                penalty=float(bw["data_quality"]["penalty_per_source"]) * len(stale_sources),
                reason="Stale or missing: " + ", ".join(stale_sources),
            )
        )
    # similar mornings
    asia_avg = sessions["asia"].avg20.value if "asia" in sessions else None
    lon_avg = sessions["london"].avg20.value if "london" in sessions else None
    vix = next((r.pct_since_1700 for r in im.rows if r.symbol == "^VIX"), None) or 0.0
    dxy = next((r.pct_since_1700 for r in im.rows if r.symbol == "DX-Y.NYB"), None) or 0.0
    vec = similar.features_for(md.m5, tdate, "08:55" if asof >= at(tdate, "08:55") else asof.strftime("%H:%M"), vix, dxy, asia_avg, lon_avg)
    sm_cfg = config.load("bias_weights")["similar_mornings"]
    sim = similar.find(hist5, tdate, vec, int(sm_cfg["k"]), int(sm_cfg["lookback_days"]), excl)
    bias = bias_engine.score(instrument, results, ev_tables, mods, sim, missing)
    # CRT
    inputs = crt_engine.CRTInputs(
        bias_direction={"Bullish": "long", "Bearish": "short"}.get(bias.label),
        orange_times=[e.when for e in orange_today if e.when],
        stats=cstats,
        levels=lv,
        is_orange_day=bool(orange_today),
    )
    crt, ideas = crt_engine.build(md, inputs)
    # rating
    hol, early = calendar_.holiday_for(tdate, events)
    struct = instruments.structural_flags(instrument, tdate)
    on_pct = None
    if (
        "asia" in sessions
        and "london" in sessions
        and sessions["asia"].range is not None
        and sessions["london"].range is not None
        and sessions["asia"].avg20.value
        and sessions["london"].avg20.value
    ):
        on_pct = 100 * (sessions["asia"].range + sessions["london"].range) / (sessions["asia"].avg20.value + sessions["london"].avg20.value)
    wd_stats = wstats.get("by_weekday", {}).get(["Mon", "Tue", "Wed", "Thu", "Fri"][tdate.weekday()] if tdate.weekday() < 5 else "Mon", {})
    bottom_q = wd_stats.get("range_quartile") == 1 if wd_stats else False
    sources_down = [n for n, h in (("Price", ph), ("Calendar", cal_health)) if not h.ok and h.as_of is None]
    conflict = _es_nq_conflict(instrument, tdate, bias.label, crt)
    rt = rating.rate(
        rating.RatingInputs(
            tdate,
            events,
            hol,
            early,
            bias.confidence,
            bias.label,
            sources_down,
            struct,
            on_pct,
            conflict,
            bottom_q,
            all(not e.readable for e in crt.context if e.kind == "execution") and any(e.kind == "execution" for e in crt.context),
            calendar_.structural_summary(instrument, tdate)["front"],
        )
    )
    window_end = sess_cfg["trading_window"]["end"]
    ctx_levels = {s.id: {"h": s.h, "l": s.l, "eq": s.eq} for s in ctx_specs}
    bias = bias_engine.finalize(
        bias, ideas, crt.setups, window_end, ctx_levels, rt.label, [f"{e.name} at {e.when.strftime('%H:%M')}" for e in orange_today if e.when]
    )
    if rt.label == "No trade":
        ideas = []
    rt.plan = plan_line(rt, bias, ideas, orange_today, crt, window_end)
    # calendar cards
    week, month = calendar_.week_and_month(instrument, tdate, events, wstats, bias.confidence)
    cal_out = calendar_.Calendar(
        today=[calendar_.to_out(e) for e in events_today if e.currency in ("USD",) or e.impact in ("high", "holiday")],
        week=week,
        month=month,
        structural=calendar_.structural_summary(instrument, tdate),
        as_of=cal_health.as_of,
    )
    # prose
    summary, movers = news.template_summary(news_out, cal_out.today)
    news_out.summary, news_out.movers = summary, movers
    bias.narrative = narrative.template_narrative(bias, rt, ideas)
    payload = {
        "instrument": instrument,
        "date": tdate.isoformat(),
        "bias": bias.model_dump(exclude={"narrative", "confidence_math"}),
        "rating": rt.model_dump(),
        "levels": lv.model_dump(exclude={"above", "below"}),
        "ideas": [i.sentence for i in ideas],
        "headlines": [h.title for h in news_out.headlines[:15]],
        "events": [e.model_dump() for e in cal_out.today],
    }
    data, src = narrative.llm_prose(llm, payload)
    if data:
        bias.narrative, bias.narrative_source = data["narrative"], src
        news_out.summary, news_out.summary_source = data["summary"], src
        news_out.movers, news_out.movers_source = list(data["movers"]), src
        if isinstance(data.get("sentiment"), (int, float)):
            news_out.sentiment_score = float(data["sentiment"])
    else:
        bias.narrative_source = f"template ({src})"
    # brief
    brief = build_brief(rt, bias, ideas, window_end)
    fc = instruments.front_contract(instrument, tdate)
    q = md.quote
    price = Price(
        last=q.price if q else None,
        as_of=iso(q.as_of) if q and q.as_of else None,
        delay_min=q.delay_min if q else None,
        vs_prev_close=(q.price - lv.pdc) if q and q.price is not None and lv.pdc is not None else None,
        vs_midnight_open=(q.price - lv.midnight_open) if q and q.price is not None and lv.midnight_open is not None else None,
        vs_daily_open=(q.price - lv.daily_open) if q and q.price is not None and lv.daily_open is not None else None,
    )
    fmeta = fixture_meta() if not store else {}
    roll_warn = None
    expiring, expiring_days = None, None
    cs = instruments.contracts_around(instrument, tdate)
    for c in cs:
        if c.roll == tdate - timedelta(days=1) or c.roll == tdate:
            roll_warn = (
                f"{instrument} rolled from {c.code} to {fc.code} on {c.roll.isoformat()}: yesterday's levels may straddle a roll gap on the continuous series"
            )
        if c.roll <= tdate < c.expiry:
            expiring, expiring_days = c.code, (c.expiry - tdate).days
    meta = Meta(
        instrument=instrument,
        instrument_name=ins.name,
        contract=fc.code,
        contract_long=fc.code_long,
        contract_expiry=fc.expiry.isoformat(),
        contract_roll=fc.roll.isoformat(),
        days_to_roll=(fc.roll - tdate).days,
        days_to_expiry=(fc.expiry - tdate).days,
        expiring_contract=expiring,
        expiring_in_days=expiring_days,
        generated_at=iso(now_utc()) or "",
        trading_date=tdate.isoformat(),
        weekday=tdate.strftime("%A"),
        anchor=md.anchor,
        window=dict(sess_cfg["trading_window"]),
        milestones=list(sess_cfg["milestones"]),
        health={
            "prices": SourceHealth(
                ok=ph.ok, as_of=ph.as_of or (iso(q.as_of) if q and q.as_of else None), delay_min=ph.delay_min, error=ph.error, source=ph.source
            ),
            "calendar": SourceHealth(ok=cal_health.ok, as_of=cal_health.as_of, error=cal_health.error, source=cal_health.source),
            "news": SourceHealth(
                ok=any(f.get("ok") for f in news_out.feeds) if news_out.feeds else False,
                as_of=max((f.get("as_of") or "" for f in news_out.feeds), default=None) or None,
                source=newsp.name,
            ),
            "series": SourceHealth(
                ok=bool(im.real_yield and im.real_yield.get("status") == "ok"), as_of=im.real_yield.get("as_of") if im.real_yield else None, source=seriesp.name
            ),
            "llm": SourceHealth(ok=data is not None, as_of=iso(asof) if data else None, source=llm.name, error=None if data else src),
        },
        data_source=fmeta.get("source", "fixtures") if not store else "live",
        price_delay_min=q.delay_min if q else None,
        roll_warning=roll_warn,
        tick=ins.tick,
    )
    key_times = [dict(k) for k in sess_cfg["key_times"]]
    chart = chart_payload(md, lv, crt)
    snap = Snapshot(
        meta=meta,
        brief=brief,
        price=price,
        levels=lv,
        sessions=sessions,
        crt=crt,
        bias=bias,
        rating=rt,
        ideas=ideas,
        calendar=cal_out,
        news=news_out,
        intermarket=im,
        stats=Stats(
            weekday_window=wstats,
            crt=cstats,
            lookback={"window": wstats.get("lookback"), "crt": cstats.get("lookback"), "evidence_computed_at": ev_tables.get("computed_at")},
        ),
        key_times=key_times,
        chart=chart,
    )
    if write:
        snapshot_path(tdate, instrument).write_text(snap.model_dump_json(by_alias=True, indent=None))
    return snap


def _es_nq_conflict(instrument: str, tdate: date, label: str, crt: Any) -> str | None:
    partner = {"NQ": "ES", "ES": "NQ"}.get(instrument)
    if not partner:
        return None
    p = snapshot_path(tdate, partner)
    if not p.exists():
        return None
    try:
        other = json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return None
    ol = other.get("bias", {}).get("label")
    if ol and label != "Neutral" and ol != "Neutral" and ol != label:
        return f"{instrument} {label.lower()}, {partner} {ol.lower()}"
    if crt.smt and crt.smt.divergent:
        d = "long" if crt.smt.side == "low" else "short"
        b = {"Bullish": "long", "Bearish": "short"}.get(label)
        if b and d != b:
            return f"SMT at the {crt.smt.side} sweep argues against the {label.lower()} bias"
    return None


def build_brief(rt: Any, bias: Any, ideas: list[Any], window_end: str) -> Brief:
    if rt.label == "No trade":
        today = f"No trade today: {rt.top_reason[0].lower() + rt.top_reason[1:]}."
    elif rt.label == "Caution":
        today = f"Caution today: {rt.top_reason[0].lower() + rt.top_reason[1:]}."
    else:
        today = f"Trade today: {rt.top_reason[0].lower() + rt.top_reason[1:]}."
    top = sorted(bias.factors, key=lambda f: -abs(f.weight * f.score))[:2]
    why = " and ".join(_short(f.reason) for f in top) if top else "no factors available"
    b = f"{bias.label}, {bias.confidence}% confidence: {why}."
    if rt.label == "No trade":
        watch = f"No setup is presented on a No-trade day. The bias is still computed for the journal; stand down at {window_end}."
    elif ideas:
        watch = ideas[0].sentence
    else:
        watch = f"No readable range yet. Wait for the 9:00 and 9:30 candles to form; stand down at {window_end}."
    return Brief(today=today, bias=b, watch=watch)


def _short(reason: str) -> str:
    r = reason.split(" (heuristic")[0].split(": on ")[0].split(";")[0].split(": ")[0].rstrip(".")
    return r[0].lower() + r[1:]


def plan_line(rt: Any, bias: Any, ideas: list[Any], oranges: list[CalEvent], crt: Any, window_end: str) -> str:
    if rt.label == "No trade":
        return f"{rt.top_reason}: stay flat all day. Review the bias behind Why for the journal."
    parts = []
    for e in oranges:
        if e.when:
            t = e.when.strftime("%H:%M")
            nxt = "9:30–10:00" if t == "10:00" else "the 30m candle before it"
            parts.append(f"Orange-folder {e.name} at {t}: be flat into it, then treat the {nxt} candle as the range for the {t} sweep")
    if ideas:
        parts.append(ideas[0].sentence.rstrip("."))
    if bias.flip_if:
        parts.append(f"stand down at {window_end} or on {bias.flip_if[0][0].lower() + bias.flip_if[0][1:]}")
    return ". ".join(parts) + "." if parts else f"Wait for a readable execution range; stand down at {window_end}."


def chart_payload(md: market.MarketData, lv: Any, crt: Any) -> dict[str, Any]:
    """Candles for 15m/30m/1h from 17:00 the prior day, plus the levels/boxes the chart draws."""
    start = at(md.trading_date - timedelta(days=1), "17:00")
    out: dict[str, Any] = {"candles": {}, "from": iso(start)}
    for tf, bars in (("15m", md.m15), ("30m", md.m30), ("1h", md.h1)):
        seg = bars[bars.index >= start.astimezone(md.m15.index.tz if not md.m15.empty else None)] if not bars.empty else bars  # type: ignore[arg-type]
        out["candles"][tf] = [
            {"time": int(ts.timestamp()), "open": float(r["open"]), "high": float(r["high"]), "low": float(r["low"]), "close": float(r["close"])}
            for ts, r in seg.iterrows()
        ]
    out["boxes"] = [
        {"id": c.id, "label": c.label, "start": c.start, "end": c.end, "h": c.h, "l": c.l, "eq": c.eq, "live": c.live, "kind": c.kind}
        for c in crt.context
        if c.id.startswith("h4_") or c.kind == "execution"
    ]
    out["lines"] = [
        {"id": k, "label": n, "price": v}
        for k, n, v in (
            ("pdh", "PDH", lv.pdh),
            ("pdl", "PDL", lv.pdl),
            ("midnight_open", "Midnight open", lv.midnight_open),
            ("open_0830", "8:30 open", lv.open_0830),
            ("open_0900", "9:00 open", lv.open_0900),
            ("weekly_open", "Weekly open", lv.weekly_open),
            ("pwh", "PWH", lv.pwh),
            ("pwl", "PWL", lv.pwl),
        )
        if v is not None
    ]
    for name, r in lv.sessions.items():
        if r.h is not None:
            out["lines"].append({"id": f"{name}_h", "label": f"{name.capitalize()} high", "price": r.h})
            out["lines"].append({"id": f"{name}_l", "label": f"{name.capitalize()} low", "price": r.l})
    markers = []
    for c in crt.context:
        for sw in c.sweeps:
            markers.append({"time": sw.at, "kind": "sweep", "side": sw.side, "label": f"{c.label} {sw.side} swept", "price": sw.extreme})
            if sw.reclaimed_at:
                markers.append(
                    {"time": sw.reclaimed_at, "kind": "reclaim", "side": sw.side, "label": f"{c.label} reclaimed", "price": c.l if sw.side == "low" else c.h}
                )
    for s in crt.setups:
        if s.sweep_at:
            markers.append(
                {
                    "time": s.sweep_at,
                    "kind": "sweep",
                    "side": s.sweep_side,
                    "label": f"{s.range_label} {s.sweep_side} swept ({s.timeframe})",
                    "price": s.sweep_level,
                }
            )
        if s.reclaim_at:
            markers.append({"time": s.reclaim_at, "kind": "reclaim", "side": s.sweep_side, "label": f"reclaim ({s.timeframe})", "price": s.sweep_level})
        if s.state in ("confirmed", "active") and len(s.entry_zone) == 2:
            out.setdefault("zones", []).append(
                {"id": s.id, "from": s.candle_close_at, "lo": min(s.entry_zone), "hi": max(s.entry_zone), "label": f"entry zone {s.timeframe}"}
            )
    out["markers"] = markers
    out["asof"] = iso(md.asof)
    return out


def scan_all(asof: datetime | None = None) -> list[Snapshot]:
    order = ["ES", "NQ", "GC"]  # ES before NQ so the NQ scan can read the ES bias for the conflict check, then NQ again is cheap
    out = [run_premarket_scan(i, asof) for i in order]
    return out


def load_snapshot(instrument: str, d: date | None = None) -> dict[str, Any] | None:
    files = sorted(snapshot_dir().glob(f"*_{instrument}.json"))
    if d is not None:
        p = snapshot_path(d, instrument)
        return json.loads(p.read_text()) if p.exists() else None
    if not files:
        return None
    return json.loads(files[-1].read_text())
