# PROGRESS.md

State per phase. "Mocked" means the code path is real but the data behind it is fixture data.

## Phase a — design plan, design system, UI skeleton
**Works:** `DESIGN.md` (tokens, type roles, 1440/390 layouts, motion budget, do-not-ship list); Tailwind 4
tokens with dark and light themes; top bar (instrument switcher with 1/2/3 and arrow keys, contract line,
date, countdown to 9:00 / 9:30 / 12:00 that never counts into a closed session, Run scan, Simple/Detailed,
theme); the three-line brief with inline Why drawers and confidence bar; chart with 15m/30m/1h toggle;
setups list; key levels; week/month strip; news. Screenshots at 1440 and 390 px in `screenshots/`.
**Mocked:** the UI falls back to `frontend/public/mock/*.json` (frozen from the synthetic scan) when the
API is not running. Fixtures are synthetic (see DECISIONS #1).

## Phase b — providers, history, backfill, import, sessions, levels, resampling, snapshot writer
**Works:** provider interfaces with mock, yfinance, Forex Factory, RSS, FRED, rules/Anthropic/OpenAI LLM;
disk cache with TTL and last-good fallback; parquet history store that grows on every scan; `make backfill`,
`make import`, `make fixtures`; sessions, opening prices, PDH/PDL/PWH/PWL, above/below list with swept
state; 15m/30m/1h/4H/daily resampling in both anchors, DST-safe; snapshot writer; pydantic → TS types.
**Not verified live:** yfinance, Forex Factory, RSS and FRED could not be exercised in the build sandbox
(egress blocked). The code paths follow the documented APIs; run `make scan` with network to confirm.

## Phase c — bias engine
**Works:** six factors with score/weight/reason/inputs; heuristic vs evidence per factor with shrinkage and
the n ≥ 30 switch; evidence tables rebuilt weekly from stored bars (overnight, HTF, CRT-state and weekday
conditions); similar mornings (10 nearest at 8:55); modifiers; visible arithmetic; primary and alternate
scenarios; flip conditions; no-trade list; rating rubric; the brief.
**Mocked:** intermarket and news conditions have no historical evidence table (not stored historically), so
those factors are always heuristic; the reason says so.

## Phase d — CRT engine
**Works:** context ranges (previous day, current day, previous week, 9 PM / 1 AM / 5 AM / 9 AM 4H, sessions,
8:30–9:00 on orange days) watched on all three execution timeframes; execution ranges from 08:00; sweep,
reclaim, close-back-inside, expansion, distribution, invalidation with timestamps; later-candle reclaim for
context ranges; phase and setup-state labels; three-candle sequence; entry model with displacement check;
SMT vs partner; premium/discount; liquidity map with equal highs/lows; quality score; chart boxes, EQ
lines, level lines, key-time markers, sweep/reclaim markers, entry zones, current-time line.

## Phase e — stats, templates, calendar, news, prose
**Works:** weekday window stats and CRT stats by timeframe/hour/weekday with n and date ranges, red-folder
days excluded; opening-sweep stats; T1–T6 templates with live/pending state and hit rates; week and month
cards with red-folder-first ranking and roll/expiry/OPEX flags; headline dedupe, tagging, lexicon sentiment,
groups, per-feed health; templated summaries; LLM prose with schema validation and the no-new-numbers check.
**Mocked:** the static release calendars in `data/static/` are unverified (DECISIONS #2).

## Phase f — settings, checklist, notes, intermarket, sessions, light theme, polish, motion
**Works:** Settings panel edits every config YAML through the API; checklist and notes persisted per day
(API, with localStorage fallback); intermarket table with sparklines and reads; session stats; light theme;
brief fade-in, panel fade, instrument cross-fade, confirmed-setup pulse, reduced-motion.

## Phase g — journal and calibration
**Works:** `make post-session` / `POST /api/post-session/{instr}` grades a window (direction, delivery,
scenario outcome, execution and context sweeps); scoreboard for last 20/60/120, by weekday, confidence
bucket, rating and timeframe. Verified on the fixture window.

## Phase h — live window mode
**Works:** between 9:00 and 12:00 on the snapshot's trading date the UI polls `/api/live` every minute;
setups, chart, key-levels price and the Watch line update; the panel says "live, delayed N min".
**Not verified live:** needs a real session with network.

## Next
- Run `make fixtures` and `make backfill` on a networked machine; replace the synthetic fixtures.
- Appendix C follow-ups: backtest and weight tuning, alerts, replay mode.
