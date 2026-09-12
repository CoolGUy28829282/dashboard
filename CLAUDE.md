# CLAUDE.md — conventions for this repository

Pre-market decision-support dashboard for NQ / ES / GC futures traded with Candle Range Theory
in the 9:00–12:00 ET window. Read the spec summary in `README.md` and the running log in
`PROGRESS.md` before changing anything.

## Non-negotiables

- **Decision-support only.** No order routing, broker connection, P&L or auto-trading. Ever.
- **Timezones.** All times are `America/New_York`, DST-aware. Store UTC, display New York.
  Never construct a naive datetime; ruff's `DTZ` rules are on and must stay on. Use
  `premarket.timeutil` helpers (`ny()`, `to_ny()`, `ny_date()`), never `datetime.now()`.
- **No invented numbers.** Never hard-code a price, level, headline, event or statistic.
  If a source is down the value is `None` and the UI shows "unavailable" plus the last-good
  timestamp. Fixtures are produced by `make fixtures` (freezes real provider output) or, when
  the network is unavailable, by `scripts/gen_synthetic_fixtures.py` (seeded generator, labelled
  `source: synthetic` in every file it writes). Nobody types fixture values by hand.
- **Stats carry sample size.** Every historical statistic is a `Stat {value, n, from, to}`
  (`premarket.models.Stat`). The frontend `<StatValue>` component refuses to render a stat
  missing any of those fields. Red-folder days are excluded by default (config).
- **Provider pattern.** Every external source sits behind an interface in `premarket/providers/base.py`
  (`PriceProvider`, `CalendarProvider`, `NewsProvider`, `SeriesProvider`, `LLMProvider`). Each has a
  `mock` implementation reading `data/fixtures/`. Selection is via `PROVIDER_*` env vars. Every network
  call is cached on disk with a TTL (`premarket/cache.py`). The UI never blocks on a feed.
- **Candles are resampled**, never taken natively above 5m. 4H/1h/30m/15m come from
  `premarket.candles.resample` anchored to the configured origin (`forex` 17:00 or `exchange` 18:00 ET).
- **Bias engine is auditable.** Every factor returns `score, weight, reason, inputs, source`.
  Missing inputs drop the factor and renormalise. The LLM writes prose only, returns schema-validated
  JSON, and may not emit a number that was not in its input payload.
- **Tests before "done".** `make check` (ruff, mypy, pytest, tsc, eslint, vitest) must pass before any
  phase commit. One commit per phase, named for the phase.
- **Snapshot models are the source of truth.** Pydantic models in `premarket/models.py` generate
  `frontend/src/types/snapshot.ts` via `make types`. Do not hand-edit the generated file.

## Layout

```
backend/premarket   Python package (FastAPI app in api.py, CLI in cli.py)
backend/tests       pytest
frontend/src        React 18 + TS + Tailwind 4 + Lightweight Charts 5
config/*.yaml       editable settings (sessions, bias weights, rating rules, CRT, feeds, checklist)
data/static         committed reference calendars with source URL + fetched-on date
data/fixtures       frozen provider output (mock providers read here)
data/history        parquet bar store, grows with every scan
data/snapshots      YYYY-MM-DD_<INSTR>.json written by the scan
data/journal        per-day notes, checklist state, post-session grades
```

## Style

- Python 3.11, ruff (line length 160), mypy with `check_untyped_defs`. Small pure functions;
  pandas only inside `candles`, `history`, `stats`.
- Frontend: function components, no global state library; a single `useSnapshot` hook.
  Numbers use Geist Mono with `tabular-nums`; text uses Geist Sans. Sentence case everywhere.
- Plain English in every user-facing string. Conclusions first, mechanics behind "Why".
- Log every unilateral decision in `DECISIONS.md`; keep `PROGRESS.md` current per phase.
