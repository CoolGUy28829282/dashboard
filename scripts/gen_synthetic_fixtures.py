"""Generate SYNTHETIC fixtures when `make fixtures` cannot reach the network.

Everything written here is stamped `source: synthetic`. The bars are a seeded random walk with
session-aware volatility and one engineered fixture week (2026-09-07 … 2026-09-11) so that tests
and the mock snapshot exercise: a holiday, a red-folder CPI day, a roll day, an orange-folder UMich
day, an overnight PDL sweep-and-reclaim, a 09:41 sweep of the 5 AM low that closes back inside on
the 30m and delivers to EQ and the opposite side, and an SMT divergence with ES.

Run: backend/.venv/bin/python scripts/gen_synthetic_fixtures.py
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from premarket import history  # noqa: E402
from premarket.candles import resample  # noqa: E402
from premarket.timeutil import NY, UTC, at, is_globex_open  # noqa: E402

FIX = ROOT / "data" / "fixtures"
FROZEN_AT = datetime(2026, 9, 11, 7, 2, tzinfo=NY)
FIXTURE_DAY = date(2026, 9, 11)
START = date(2026, 2, 20)
END = datetime(2026, 9, 11, 17, 0, tzinfo=NY)

# level, tick, daily vol (%)
SYMBOLS = {
    "NQ=F": (24000.0, 0.25, 1.4),
    "ES=F": (6500.0, 0.25, 1.0),
    "YM=F": (45000.0, 1.0, 0.9),
    "GC=F": (3400.0, 0.1, 1.1),
    "SI=F": (39.0, 0.005, 1.8),
    "DX-Y.NYB": (98.0, 0.001, 0.4),
    "^TNX": (4.10, 0.001, 1.5),
    "^VIX": (16.0, 0.01, 6.0),
    "CL=F": (64.0, 0.01, 2.0),
    "^N225": (42000.0, 1.0, 1.2),
    "^GDAXI": (23500.0, 1.0, 1.0),
    "^FTSE": (9100.0, 0.1, 0.8),
}
EQUITY_HOURS = {"^N225", "^GDAXI", "^FTSE", "^VIX", "^TNX", "DX-Y.NYB"}


def minute_index() -> pd.DatetimeIndex:
    start = datetime(START.year, START.month, START.day, 18, 0, tzinfo=NY)
    idx = pd.date_range(start, END, freq="5min", tz=NY)
    keep = [is_globex_open(t.to_pydatetime()) for t in idx]
    return pd.DatetimeIndex(idx[keep])


def vol_profile(ts: pd.Timestamp) -> float:
    h = ts.hour + ts.minute / 60
    if 9.5 <= h < 11.5:
        return 2.2
    if 8.5 <= h < 9.5 or 2 <= h < 5:
        return 1.3
    if 11.5 <= h < 16:
        return 1.0
    return 0.55


def random_walk(sym: str, rng: np.random.Generator, idx: pd.DatetimeIndex, common: np.ndarray) -> pd.DataFrame:
    level, tick, dvol = SYMBOLS[sym]
    per_bar = dvol / 100 / np.sqrt(276)
    prof = np.array([vol_profile(t) for t in idx])
    beta = {"NQ=F": 1.0, "ES=F": 0.8, "YM=F": 0.7, "GC=F": -0.1, "SI=F": 0.1, "^VIX": -3.0, "^TNX": 0.3, "DX-Y.NYB": -0.2}.get(sym, 0.3)
    own = rng.standard_normal(len(idx))
    shock = (beta * common * 0.6 + own * 0.8) * per_bar * prof
    log_close = np.log(level) + np.cumsum(shock)
    close = np.exp(log_close)
    open_ = np.concatenate([[level], close[:-1]])
    wick = np.abs(rng.standard_normal(len(idx))) * per_bar * prof * level * 0.8
    high = np.maximum(open_, close) + wick
    low = np.minimum(open_, close) - wick * rng.uniform(0.3, 1.0, len(idx))
    vol = rng.integers(200, 3000, len(idx)) * prof
    df = pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": vol}, index=idx.tz_convert(UTC))
    df.index.name = "ts"
    return (df / tick).round() * tick if tick >= 0.1 else df.round(4)


def path_override(df: pd.DataFrame, sym: str, points: list[tuple[str, float]], day: date, rng: np.random.Generator, tick: float) -> pd.DataFrame:
    """Replace the fixture day's bars with a piecewise-linear path through (HH:MM, price) points plus noise."""
    times = [at(day - timedelta(days=1), p[0]) if p[0] >= "17:00" else at(day, p[0]) for p in points]
    prices = [p[1] for p in points]
    seg_start, seg_end = times[0].astimezone(UTC), times[-1].astimezone(UTC)
    mask = (df.index >= seg_start) & (df.index <= seg_end)
    idx = df.index[mask]
    xs = np.array([t.timestamp() for t in times])
    target = np.interp(np.array([t.timestamp() for t in idx]), xs, prices)
    noise = rng.standard_normal(len(idx)) * tick * 2
    close = target + noise
    open_ = np.concatenate([[close[0]], close[:-1]])
    wick = np.abs(rng.standard_normal(len(idx))) * tick * 3
    high = np.maximum(open_, close) + wick
    low = np.minimum(open_, close) - wick
    # make the path extremes exact at the control points so sweeps land where intended
    for t, p in zip(times, prices, strict=True):
        key = t.astimezone(UTC)
        if key in idx:
            i = idx.get_loc(key)
            close[i] = p
            high[i] = max(open_[i], p)
            low[i] = min(open_[i], p)
            if i + 1 < len(close):
                open_[i + 1] = p
    d = df.copy()
    d.loc[mask, "open"] = (open_ / tick).round() * tick
    d.loc[mask, "close"] = (close / tick).round() * tick
    d.loc[mask, "high"] = (np.maximum(high, np.maximum(open_, close)) / tick).round() * tick
    d.loc[mask, "low"] = (np.minimum(low, np.minimum(open_, close)) / tick).round() * tick
    return d


def fixture_paths(prev_close: dict[str, float]) -> dict[str, list[tuple[str, float]]]:
    """Engineered fixture-day paths (Fri 2026-09-11). Prices are relative to the previous close."""
    nq = prev_close["NQ=F"]
    es = prev_close["ES=F"]
    gc = prev_close["GC=F"]
    si = prev_close["SI=F"]
    # NQ: PDL ≈ nq-160 (set by Thu path below). Overnight sweeps PDL at 03:30 and reclaims; 5 AM candle
    # (05:00–09:00) low at 05:40 = nq-95 (the "5 AM low"), high at 07:50 = nq-5, closes upper half at 09:00.
    # 09:41 sweeps the 5 AM low by 2 pts, 09:52 back inside, 30m 09:30–10:00 closes inside, EQ by 10:20,
    # 5 AM high by 11:05, drifts into 12:00 close above the 9:00 open.
    nq_path = [
        ("17:00", nq), ("21:00", nq - 20), ("01:00", nq - 60), ("03:30", nq - 190), ("04:30", nq - 120),
        ("05:00", nq - 70), ("05:40", nq - 95), ("07:50", nq - 5), ("09:00", nq - 30), ("09:30", nq - 45),
        ("09:40", nq - 103), ("09:50", nq - 82), ("09:59", nq - 70), ("10:20", nq - 50), ("10:45", nq - 40),
        ("11:05", nq - 3), ("11:30", nq - 15), ("12:00", nq + 5), ("16:00", nq + 20),
    ]
    # ES: same shape, but at 09:41 it does NOT trade below its 5 AM low (SMT divergence).
    es_path = [
        ("17:00", es), ("21:00", es - 5), ("01:00", es - 14), ("03:30", es - 40), ("04:30", es - 28),
        ("05:00", es - 16), ("05:40", es - 22), ("07:50", es - 1), ("09:00", es - 7), ("09:30", es - 11),
        ("09:40", es - 20), ("09:50", es - 17), ("09:59", es - 15), ("10:20", es - 10), ("11:05", es + 1),
        ("12:00", es + 2), ("16:00", es + 6),
    ]
    gc_path = [
        ("17:00", gc), ("01:00", gc + 6), ("05:00", gc + 10), ("06:30", gc + 18), ("08:30", gc + 4),
        ("09:00", gc + 8), ("09:38", gc + 20), ("09:55", gc + 12), ("10:30", gc + 2), ("11:20", gc - 4), ("12:00", gc - 2), ("16:00", gc),
    ]
    si_path = [("17:00", si), ("05:00", si + 0.2), ("09:38", si + 0.35), ("09:55", si + 0.25), ("12:00", si + 0.1), ("16:00", si + 0.15)]
    return {"NQ=F": nq_path, "ES=F": es_path, "GC=F": gc_path, "SI=F": si_path}


def thursday_paths(prev_close: dict[str, float]) -> dict[str, list[tuple[str, float]]]:
    """Thursday 2026-09-10 sets clean PDH/PDL for Friday: NQ range prev-160 … prev+60, close prev."""
    nq, es, gc = prev_close["NQ=F"], prev_close["ES=F"], prev_close["GC=F"]
    return {
        "NQ=F": [("17:00", nq - 30), ("03:00", nq + 10), ("09:30", nq + 60), ("11:00", nq - 160), ("14:00", nq - 80), ("16:55", nq)],
        "ES=F": [("17:00", es - 8), ("03:00", es + 2), ("09:30", es + 15), ("11:00", es - 38), ("14:00", es - 18), ("16:55", es)],
        "GC=F": [("17:00", gc - 5), ("09:30", gc + 25), ("13:00", gc - 20), ("16:55", gc)],
    }


def write_bars(sym: str, df: pd.DataFrame) -> None:
    safe = sym.replace("=", "").replace("^", "").replace(".", "_").replace("-", "_")
    (FIX / "bars").mkdir(parents=True, exist_ok=True)
    df.to_parquet(FIX / "bars" / f"{safe}_5m.parquet")
    resample(df, "1h").to_parquet(FIX / "bars" / f"{safe}_1h.parquet")
    resample(df, "1d").to_parquet(FIX / "bars" / f"{safe}_1d.parquet")
    if sym not in ("NQ=F", "ES=F", "GC=F", "SI=F", "YM=F"):
        return
    # 1m: last 10 days, each 5m bar split into five 1m bars along its path
    last10 = df[df.index >= (END - timedelta(days=10)).astimezone(UTC)]
    rows = []
    for ts, r in last10.iterrows():
        path = np.linspace(r["open"], r["close"], 6)
        for k in range(5):
            o, c = path[k], path[k + 1]
            hi = r["high"] if k == 2 else max(o, c)
            lo = r["low"] if k == 3 else min(o, c)
            rows.append((ts + pd.Timedelta(minutes=k), o, hi, lo, c, r["volume"] / 5))
    m1 = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"]).set_index("ts")
    m1.to_parquet(FIX / "bars" / f"{safe}_1m.parquet")


def calendar_events() -> list[dict]:
    def ev(d: str, t: str | None, name: str, impact: str, cur: str = "USD", cons: str | None = None, prev: str | None = None) -> dict:
        when = f"{d}T{t}:00-04:00" if t else None
        return {"date": d, "when": when, "name": name, "impact": impact, "currency": cur, "consensus": cons, "previous": prev}

    return [
        ev("2026-09-07", None, "Labor Day", "holiday"),
        ev("2026-09-08", "10:00", "NFIB small business optimism", "low", cons="100.9", prev="100.3"),
        ev("2026-09-08", "13:00", "3-year note auction", "low"),
        ev("2026-09-09", "08:30", "CPI m/m", "high", cons="0.3%", prev="0.2%"),
        ev("2026-09-09", "08:30", "Core CPI m/m", "high", cons="0.3%", prev="0.3%"),
        ev("2026-09-09", "13:00", "10-year note auction", "medium"),
        ev("2026-09-10", "08:30", "PPI m/m", "medium", cons="0.2%", prev="0.1%"),
        ev("2026-09-10", "08:30", "Unemployment claims", "medium", cons="228K", prev="231K"),
        ev("2026-09-10", "13:00", "30-year bond auction", "medium"),
        ev("2026-09-11", "10:00", "Prelim UoM consumer sentiment", "medium", cons="58.9", prev="58.2"),
        ev("2026-09-11", "10:00", "Prelim UoM inflation expectations", "low", prev="4.8%"),
        ev("2026-09-11", "02:00", "GDP m/m", "medium", cur="GBP", cons="0.1%", prev="0.4%"),
        ev("2026-09-11", "05:00", "German final CPI m/m", "low", cur="EUR"),
        ev("2026-09-14", "08:30", "Empire State manufacturing", "low", cons="5.1", prev="11.9"),
        ev("2026-09-15", "08:30", "Retail sales m/m", "high", cons="0.4%", prev="0.5%"),
        ev("2026-09-16", "14:00", "FOMC statement", "high"),
        ev("2026-09-16", "14:30", "FOMC press conference", "high"),
        ev("2026-09-17", "08:30", "Unemployment claims", "medium", cons="230K", prev="228K"),
        ev("2026-09-17", "08:30", "Philly Fed manufacturing", "medium", cons="2.0", prev="-0.3"),
        ev("2026-09-18", "10:00", "Fed's Waller speaks", "low"),
        ev("2026-09-02", "10:00", "ISM manufacturing PMI", "high", cons="49.0", prev="48.0"),
        ev("2026-09-03", "08:30", "Unemployment claims", "medium"),
        ev("2026-09-04", "08:30", "Non-farm employment change", "high", cons="75K", prev="73K"),
        ev("2026-09-04", "08:30", "Unemployment rate", "high", cons="4.3%", prev="4.2%"),
    ]


def headlines() -> list[dict]:
    base = FROZEN_AT
    items = [
        (17.5, "Futures edge higher after Nasdaq's late rebound; UMich sentiment due at 10 a.m.", "CNBC Top News", "cnbc_top"),
        (16.2, "Treasury yields slip as traders price a quarter-point Fed cut next week", "CNBC Economy", "cnbc_econ"),
        (15.1, "Nikkei closes at a record as chip stocks rally; DAX flat ahead of ECB comments", "Reuters via Google News", "gnews_reuters"),
        (13.4, "Oracle shares jump 9% after hours on cloud backlog; Nasdaq futures follow", "MarketWatch Top", "marketwatch"),
        (12.0, "Gold holds near $3,400 as the dollar softens; Kitco survey leans bullish", "Kitco", "kitco"),
        (10.8, "China's PBOC adds to gold reserves for a tenth month", "Kitco", "kitco"),
        (9.6, "Dollar index dips toward 98 as markets await inflation expectations print", "FXStreet", "fxstreet"),
        (8.9, "Oil steadies after OPEC+ signals no change to output plans", "Reuters via Google News", "gnews_reuters"),
        (6.5, "Bloomberg: Traders see FOMC delivering a cut but guiding cautiously", "Bloomberg via Google News", "gnews_bloomberg"),
        (5.2, "Apple supplier warns of weaker handset demand; shares fall in Asia", "Reuters via Google News", "gnews_reuters"),
        (3.8, "Silver extends gains toward $39.50 alongside gold", "Kitco", "kitco"),
        (2.4, "UK GDP unexpectedly stalls in July, pound slips", "FXStreet", "fxstreet"),
        (1.1, "S&P 500 futures flat; VIX near 16 ahead of quarterly OPEX next week", "MarketWatch Top", "marketwatch"),
        (0.6, "Futures edge higher after Nasdaq's late rebound; UMich sentiment due at 10 a.m.", "Reuters via Google News", "gnews_reuters"),
    ]
    return [
        {"title": t, "url": f"https://example.invalid/synthetic/{i}", "published": (base - timedelta(hours=h)).isoformat(), "source": s, "feed_id": f, "summary": ""}
        for i, (h, t, s, f) in enumerate(items)
    ]


def main() -> None:
    rng = np.random.default_rng(20260911)
    idx = minute_index()
    common = rng.standard_normal(len(idx))
    bars: dict[str, pd.DataFrame] = {}
    for sym in SYMBOLS:
        df = random_walk(sym, rng, idx, common)
        if sym in EQUITY_HOURS:
            ny_idx = df.index.tz_convert(NY)
            df = df[(ny_idx.hour >= 3) & (ny_idx.hour < 17)] if sym in ("^N225", "^GDAXI", "^FTSE") else df
        bars[sym] = df
    # engineered Thursday and Friday
    wed_close = {s: float(bars[s][bars[s].index < at(date(2026, 9, 9), "17:00").astimezone(UTC)]["close"].iloc[-1]) for s in ("NQ=F", "ES=F", "GC=F")}
    for sym, pts in thursday_paths(wed_close).items():
        bars[sym] = path_override(bars[sym], sym, pts, date(2026, 9, 10), rng, SYMBOLS[sym][1])
    thu_close = {s: float(bars[s][bars[s].index < at(date(2026, 9, 10), "17:00").astimezone(UTC)]["close"].iloc[-1]) for s in ("NQ=F", "ES=F", "GC=F", "SI=F")}
    for sym, pts in fixture_paths(thu_close).items():
        bars[sym] = path_override(bars[sym], sym, pts, FIXTURE_DAY, rng, SYMBOLS[sym][1])
    for sym, df in bars.items():
        write_bars(sym, df)
    (FIX).mkdir(parents=True, exist_ok=True)
    (FIX / "calendar.json").write_text(json.dumps({"source": "synthetic", "frozen_at": FROZEN_AT.isoformat(), "events": calendar_events()}, indent=1))
    (FIX / "headlines.json").write_text(json.dumps({"source": "synthetic", "frozen_at": FROZEN_AT.isoformat(), "headlines": headlines()}, indent=1))
    days = pd.date_range(START, FIXTURE_DAY, freq="B")
    series = {
        "DFII10": {d.strftime("%Y-%m-%d"): round(1.9 + 0.15 * np.sin(i / 20) + rng.normal(0, 0.02), 3) for i, d in enumerate(days)},
        "T10YIE": {d.strftime("%Y-%m-%d"): round(2.3 + 0.1 * np.cos(i / 25) + rng.normal(0, 0.01), 3) for i, d in enumerate(days)},
    }
    (FIX / "series.json").write_text(json.dumps(series))
    (FIX / "meta.json").write_text(
        json.dumps({"source": "synthetic", "frozen_at": FROZEN_AT.isoformat(), "generator": "scripts/gen_synthetic_fixtures.py", "seed": 20260911, "note": "Seeded random walk with an engineered fixture week. Not market data."}, indent=1)
    )
    # also seed the history store from the fixtures so stats have something to work with
    hist_root = ROOT / "data" / "history"
    for sym, df in bars.items():
        history.append(sym, "5m", df, hist_root)
        history.append(sym, "1d", resample(df, "1d"), hist_root)
    print("synthetic fixtures written to", FIX)


if __name__ == "__main__":
    main()
