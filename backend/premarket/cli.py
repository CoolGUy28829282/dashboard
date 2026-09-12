"""CLI: premarket scan | backfill | import | fixtures | post-session | types."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from . import config, history, instruments, scan
from .candles import normalise
from .timeutil import NY, ny


def cmd_scan(args: argparse.Namespace) -> None:
    asof = datetime.fromisoformat(args.asof).astimezone(NY) if args.asof else None
    ids = [args.instrument] if args.instrument else ["ES", "NQ", "GC"]
    for i in ids:
        s = scan.run_premarket_scan(i, asof)
        print(
            f"{i}: {s.rating.label} | {s.bias.label} {s.bias.confidence}% | {s.brief.watch[:90]}… → {scan.snapshot_path(datetime.fromisoformat(s.meta.trading_date).date(), i)}"
        )


def cmd_backfill(_: argparse.Namespace) -> None:
    from .providers import prices

    p = prices()
    now = ny()
    for sym in config.load("instruments")["symbols"]:
        for iv, days in (("1m", 7), ("5m", 59), ("1h", 729), ("1d", 3650)):
            df = p.get_bars(sym, iv, now - timedelta(days=days), now)
            n = history.append(sym, iv, df)
            print(f"{sym} {iv}: +{n} rows ({history.coverage(sym, iv)['rows']} total)")


def cmd_import(args: argparse.Namespace) -> None:
    """Import a TradingView / NinjaTrader / Sierra CSV or Parquet export into the history store."""
    path = Path(args.file)
    df = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
    cols = {c: c.lower().strip() for c in df.columns}
    df = df.rename(columns=cols)
    tcol = next((c for c in df.columns if c in ("time", "timestamp", "date", "datetime", "ts", "date time")), None)
    if tcol is None:
        sys.exit("no time column found")
    ts = pd.to_datetime(df[tcol], utc=False)
    if getattr(ts.dt, "tz", None) is None:
        ts = ts.dt.tz_localize(args.tz)
    df = df.assign(ts=ts.dt.tz_convert("UTC")).set_index("ts")
    df = df.rename(columns={"last": "close", "vol": "volume"})
    sym = instruments.get(args.instrument).yf
    n = history.append(sym, args.interval, normalise(df))
    print(f"imported {n} new rows into {sym} {args.interval}; coverage {history.coverage(sym, args.interval)}")


def cmd_fixtures(_: argparse.Namespace) -> None:
    """Freeze real provider output into data/fixtures/ (needs network). Falls back to the synthetic generator."""
    from .providers import calendar, news, prices, series

    fix = config.data_dir() / "fixtures"
    (fix / "bars").mkdir(parents=True, exist_ok=True)
    p = prices()
    now = ny()
    ok = True
    for sym in config.load("instruments")["symbols"]:
        for iv, days in (("1m", 7), ("5m", 59), ("1h", 60), ("1d", 400)):
            df = p.get_bars(sym, iv, now - timedelta(days=days), now)
            if df.empty and iv == "5m":
                ok = False
            safe = sym.replace("=", "").replace("^", "").replace(".", "_").replace("-", "_")
            df.to_parquet(fix / "bars" / f"{safe}_{iv}.parquet")
    if not ok:
        print("price provider returned nothing; keeping existing fixtures (run scripts/gen_synthetic_fixtures.py for synthetic ones)")
        return
    evs = calendar().get_events(now - timedelta(days=45), now + timedelta(days=40))
    (fix / "calendar.json").write_text(
        json.dumps(
            {
                "source": "forexfactory",
                "frozen_at": now.isoformat(),
                "events": [
                    {
                        "date": e.date,
                        "when": e.when.isoformat() if e.when else None,
                        "name": e.name,
                        "impact": e.impact,
                        "currency": e.currency,
                        "consensus": e.consensus,
                        "previous": e.previous,
                        "actual": e.actual,
                    }
                    for e in evs
                ],
            },
            indent=1,
        )
    )
    hs = news().get_headlines(now - timedelta(hours=18))
    (fix / "headlines.json").write_text(
        json.dumps(
            {
                "source": "rss",
                "frozen_at": now.isoformat(),
                "headlines": [
                    {
                        "title": h.title,
                        "url": h.url,
                        "published": h.published.isoformat() if h.published else None,
                        "source": h.source,
                        "feed_id": h.feed_id,
                        "summary": h.summary,
                    }
                    for h in hs
                ],
            },
            indent=1,
        )
    )
    ser = {}
    for sid in ("DFII10", "T10YIE"):
        s = series().get_series(sid, now - timedelta(days=60), now)
        if s is not None:
            ser[sid] = {k.strftime("%Y-%m-%d"): float(v) for k, v in s.items()}
    (fix / "series.json").write_text(json.dumps(ser))
    (fix / "meta.json").write_text(json.dumps({"source": "frozen", "frozen_at": now.isoformat()}, indent=1))
    print("fixtures frozen at", now.isoformat())


def cmd_post_session(args: argparse.Namespace) -> None:
    from .api import _post_session

    ids = [args.instrument] if args.instrument else ["ES", "NQ", "GC"]
    for i in ids:
        g = _post_session(i, datetime.fromisoformat(args.date).date() if args.date else None)
        print(i, json.dumps({k: g.get(k) for k in ("status", "direction_actual", "bias", "bias_correct", "bias_delivery", "primary_hit")}))


def cmd_types(_: argparse.Namespace) -> None:
    from .typegen import generate

    print(generate())


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="premarket")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scan")
    s.add_argument("instrument", nargs="?")
    s.add_argument("--asof")
    s.set_defaults(fn=cmd_scan)
    sub.add_parser("backfill").set_defaults(fn=cmd_backfill)
    i = sub.add_parser("import")
    i.add_argument("file")
    i.add_argument("--instrument", required=True)
    i.add_argument("--interval", default="1m")
    i.add_argument("--tz", default="America/New_York")
    i.set_defaults(fn=cmd_import)
    sub.add_parser("fixtures").set_defaults(fn=cmd_fixtures)
    ps = sub.add_parser("post-session")
    ps.add_argument("instrument", nargs="?")
    ps.add_argument("--date")
    ps.set_defaults(fn=cmd_post_session)
    sub.add_parser("types").set_defaults(fn=cmd_types)
    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
