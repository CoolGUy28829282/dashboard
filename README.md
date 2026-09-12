# Pre-market dashboard for NQ / ES / GC

A decision-support dashboard for trading Candle Range Theory in the 9:00–12:00 ET window.
It answers three questions before the open, in plain English, with the full mechanics one click away:
*Is today a trading day? What is the bias for 9–12? Which sweep, at which level, on which timeframe, and where does it go?*

Decision-support only. No order routing, broker connection, P&L or auto-trading.

## Setup

```
make install            # uv venv + pip install backend; npm install frontend
cp .env.example .env    # defaults: yfinance, Forex Factory, RSS; every provider has a mock
make scan               # writes data/snapshots/YYYY-MM-DD_{ES,NQ,GC}.json
make dev                # FastAPI on :8000 and Vite on :5173
```

Open http://localhost:5173. With no backend running the UI shows the frozen mock snapshot in
`frontend/public/mock/` so the layout can be reviewed anywhere.

Zero keys are required. Prices from yfinance are delayed; the delay is shown next to the price.

### `.env` variables

| Variable | Values | Notes |
|---|---|---|
| `PROVIDER_PRICES` | `yfinance` (default), `mock`, `databento`/`polygon`/`broker` (stubs) | mock reads `data/fixtures/bars/` |
| `PROVIDER_CALENDAR` | `forexfactory`, `mock` | free weekly JSON, cached 3 h, backs off on failure |
| `PROVIDER_NEWS` | `rss`, `mock` | feeds in `config/feeds.yaml` |
| `PROVIDER_SERIES` | `fred`, `mock` | real yields / breakevens; without `FRED_API_KEY` they read "unavailable" |
| `PROVIDER_LLM` | `rules` (default), `anthropic`, `openai`, `mock` | `openai` works with any OpenAI-compatible endpoint (Ollama) |
| `FRED_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | | optional |
| `CANDLE_ANCHOR` | `forex` (17:00 daily open), `exchange` (18:00) | 4H / daily candle origin |
| `SCHEDULE` | `0`, `1` | APScheduler: scan 07:00 ET weekdays, post-session 12:15 |
| `DATA_DIR`, `CACHE_TTL_MIN` | | |

## Commands

| Command | What it does |
|---|---|
| `make scan [INSTR=NQ]` | run the pre-market scan (all three instruments by default) and write snapshots |
| `make backfill` | pull the maximum yfinance history for every symbol into `data/history/` |
| `make import FILE=path.csv INSTR=NQ INTERVAL=1m` | import a TradingView / NinjaTrader / Sierra export (CSV or Parquet) |
| `make fixtures` | freeze real provider output into `data/fixtures/` (needs network) |
| `make post-session [INSTR=NQ]` | grade today's window into `data/journal/` |
| `make types` | regenerate `frontend/src/types/snapshot.ts` from the pydantic models |
| `make test`, `make lint`, `make check` | pytest + vitest; ruff + mypy + tsc + eslint; both |
| `make screenshots` | 1440 px and 390 px screenshots in `screenshots/` (Playwright) |

Every scan appends new intraday bars to `data/history/<symbol>/<interval>.parquet`, deduplicated by
timestamp, so intraday history grows past yfinance's 60-day limit with normal use.

## Editing behaviour

All of these are YAML in `config/` and editable in the Settings panel (Detailed mode):

- `sessions.yaml`: trading window, Globex clock, sessions, opening prices, key-time markers, milestones, candle anchor, execution timeframes.
- `bias_weights.yaml`: factor weights (per-instrument overrides), thresholds, confidence formula, evidence shrinkage `k` and the `n ≥ 30` switch, similar-mornings `k`, modifiers.
- `rating.yaml`: red-folder scope (`any_time` | `before_1200`) and currencies, no-trade / caution rules, Trade confidence floor.
- `crt.yaml`: `min_sweep_ticks`, `max_sweep_pct`, displacement `k`, equal-highs tolerance, stop buffer, quality-score table, stats lookback and red-folder exclusion.
- `feeds.yaml`: RSS feeds, headline groups, sentiment lexicon. `instruments.yaml`: ticks, contract months, SMT partners, intermarket symbols, keyword sets. `checklist.yaml`.

Re-run the scan after editing.

## Swapping providers

Implement the protocol in `backend/premarket/providers/base.py` (`PriceProvider`, `CalendarProvider`,
`NewsProvider`, `SeriesProvider`, `LLMProvider`), register it in `providers/__init__.py`, select it in `.env`.
`providers/stubs.py` shows the shape for a paid price feed.

## How it works

`run_premarket_scan` (backend/premarket/scan.py): fetch → sessions and levels → 4H / 1h / 30m / 15m candles
resampled from 1m/5m bars at the configured anchor → CRT detection on every context and execution range →
window and CRT statistics from the store → evidence tables and similar mornings → bias scorecard → rating
rubric → setups and trade ideas → calendar cards → news → prose → snapshot JSON. The UI reads the snapshot.

Between 9:00 and 12:00 the UI polls `/api/live/<instr>` once a minute: CRT detection re-runs on the freshest
bars and only the setups, chart and Watch line update.

The journal (`make post-session`) records what the window did, grades bias direction, delivery and scenario
outcome, and builds the calibration scoreboard shown in Detailed mode.

## Layout

```
backend/premarket   Python package (FastAPI app, CLI, engines)   backend/tests   pytest
frontend/src        React 18 + TypeScript + Tailwind 4 + Lightweight Charts 5
config/             editable YAML     data/static   committed reference calendars
data/fixtures       frozen (or synthetic) provider output     data/history   parquet bar store
data/snapshots      scan output       data/journal  notes, checklist state, grades
```

See `CLAUDE.md` for conventions, `DESIGN.md` for the design system, `DECISIONS.md` for decisions made
without asking and `PROGRESS.md` for the state of each phase.
