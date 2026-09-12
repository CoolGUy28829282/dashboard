"""FastAPI app: snapshots, scan trigger, settings, journal, live window mode."""

from __future__ import annotations

import json
import threading
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config, history, instruments, journal, scan
from .timeutil import NY, is_globex_open, iso, next_milestone, ny

app = FastAPI(title="premarket", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_lock = threading.Lock()
_state: dict[str, Any] = {"scanning": False, "last_scan": None, "error": None}

if config.env("SCHEDULE", "0") == "1":
    from apscheduler.schedulers.background import BackgroundScheduler

    _sched = BackgroundScheduler(timezone="America/New_York")
    _sched.add_job(lambda: scan.scan_all(), "cron", day_of_week="mon-fri", hour=7, minute=0)
    _sched.add_job(lambda: [_post_session(i) for i in instruments.all_ids()], "cron", day_of_week="mon-fri", hour=12, minute=15)
    _sched.start()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "now": iso(ny()),
        "globex_open": is_globex_open(ny()),
        "scanning": _state["scanning"],
        "last_scan": _state["last_scan"],
        "error": _state["error"],
        "providers": {k: config.env(k) for k in ("PROVIDER_PRICES", "PROVIDER_CALENDAR", "PROVIDER_NEWS", "PROVIDER_SERIES", "PROVIDER_LLM")},
    }


@app.get("/api/clock")
def clock() -> dict[str, Any]:
    now = ny()
    ms = config.load("sessions")["milestones"]
    m = next_milestone(now, ms)
    return {"now": iso(now), "milestone": {"label": m.label, "at": iso(m.at), "seconds": m.seconds}, "globex_open": is_globex_open(now)}


@app.get("/api/snapshot/{instrument}")
def get_snapshot(instrument: str, date_: str | None = None) -> dict[str, Any]:
    if instrument not in instruments.all_ids():
        raise HTTPException(404, "unknown instrument")
    d = date.fromisoformat(date_) if date_ else None
    snap = scan.load_snapshot(instrument, d)
    if snap is None:
        raise HTTPException(404, "no snapshot yet; run a scan")
    return snap


@app.get("/api/snapshots")
def list_snapshots() -> list[str]:
    return sorted(p.name for p in scan.snapshot_dir().glob("*.json"))


class ScanBody(BaseModel):
    instrument: str | None = None
    asof: str | None = None


@app.post("/api/scan")
def run_scan(body: ScanBody) -> dict[str, Any]:
    if not _lock.acquire(blocking=False):
        return {"ok": False, "scanning": True}
    _state["scanning"] = True
    _state["error"] = None
    try:
        asof = datetime.fromisoformat(body.asof).astimezone(NY) if body.asof else None
        if body.instrument:
            snaps = [scan.run_premarket_scan(body.instrument, asof)]
        else:
            snaps = scan.scan_all(asof)
        _state["last_scan"] = iso(ny())
        return {"ok": True, "instruments": [s.meta.instrument for s in snaps], "last_scan": _state["last_scan"]}
    except Exception as exc:  # noqa: BLE001
        _state["error"] = str(exc)
        raise HTTPException(500, str(exc)) from exc
    finally:
        _state["scanning"] = False
        _lock.release()


@app.get("/api/live/{instrument}")
def live(instrument: str) -> dict[str, Any]:
    """Live window mode: re-run detection on the freshest bars, return only the CRT panel + brief watch line."""
    snap = scan.run_premarket_scan(instrument, None, write=False)
    return {
        "crt": snap.crt.model_dump(by_alias=True),
        "ideas": [i.model_dump(by_alias=True) for i in snap.ideas],
        "watch": snap.brief.watch,
        "price": snap.price.model_dump(),
        "chart": snap.chart,
        "as_of": snap.crt.as_of,
        "delay_min": snap.meta.price_delay_min,
    }


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return {name: config.load(name) for name in ("sessions", "bias_weights", "rating", "crt", "feeds", "checklist", "instruments")}


@app.put("/api/settings/{name}")
def put_settings(name: str, body: dict[str, Any]) -> dict[str, Any]:
    if name not in ("sessions", "bias_weights", "rating", "crt", "feeds", "checklist"):
        raise HTTPException(400, "not editable")
    config.save(name, body)
    return {"ok": True}


@app.get("/api/journal/{instrument}/{d}")
def get_journal(instrument: str, d: str) -> dict[str, Any]:
    return journal.load_day(d, instrument)


@app.put("/api/journal/{instrument}/{d}")
def put_journal(instrument: str, d: str, body: dict[str, Any]) -> dict[str, Any]:
    journal.save_day(d, instrument, body)
    return journal.load_day(d, instrument)


@app.get("/api/scoreboard/{instrument}")
def get_scoreboard(instrument: str) -> dict[str, Any]:
    return journal.scoreboard(instrument)


def _post_session(instrument: str, d: date | None = None) -> dict[str, Any]:
    from .models import Snapshot
    from .providers import prices as _prices
    from .timeutil import at

    raw = scan.load_snapshot(instrument, d)
    if raw is None:
        raise HTTPException(404, "no snapshot for that day")
    snap = Snapshot.model_validate(raw)
    td = date.fromisoformat(snap.meta.trading_date)
    ins = instruments.get(instrument)
    p = _prices()
    bars = p.get_bars(ins.yf, "1m", at(td, "08:00"), at(td, "16:00"))
    if bars.empty:
        bars = p.get_bars(ins.yf, "5m", at(td, "08:00"), at(td, "16:00"))
    if bars.empty:
        bars = history.load(ins.yf, "5m")
    g = journal.grade(snap, bars)
    journal.save_day(snap.meta.trading_date, instrument, {"grade": g})
    return g


@app.post("/api/post-session/{instrument}")
def post_session(instrument: str, date_: str | None = None) -> dict[str, Any]:
    return _post_session(instrument, date.fromisoformat(date_) if date_ else None)


@app.get("/api/history")
def history_coverage() -> dict[str, Any]:
    return {sym: {iv: history.coverage(sym, iv) for iv in ("1m", "5m", "1h", "1d")} for sym in config.load("instruments")["symbols"]}


def dumps(x: Any) -> str:
    return json.dumps(x, default=str)
