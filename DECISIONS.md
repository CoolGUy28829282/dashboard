# DECISIONS.md — decisions made without asking

Each entry: date, decision, why, how to reverse.

## 2026-09-12 (build day)

1. **Fixtures are synthetic in this build.** The build sandbox's egress policy blocks
   query2.finance.yahoo.com, nfs.faireconomy.media and every RSS host (403 from the proxy), so
   `make fixtures` cannot freeze real output here. `scripts/gen_synthetic_fixtures.py` produces
   seeded, self-consistent bars/calendar/headlines and stamps `"source": "synthetic"` on every file;
   the UI footer shows "synthetic fixture data" whenever a snapshot was built from them.
   Reverse: run `make fixtures` on a machine with network access; it overwrites `data/fixtures/`.
2. **Static reference calendars are committed with a `verified: false` flag** for the same reason
   (FOMC / BLS / BEA / Treasury / CME pages could not be fetched). The rule-derived structural days
   (roll, expiry, OPEX, month/quarter end) are computed from section 6 rules and tested; the holiday
   list holds the well-known US exchange holidays for 2026 and is marked unverified until
   `scripts/fetch_static_calendars.py` is run with network access.
3. **Questions I would have asked, and the answer I assumed:**
   - *Red-folder scope currency:* USD only, `any_time`. (Configurable in `config/rating.yaml`.)
   - *Evidence tables need ≥30 mornings per condition:* with fresh installs there is little intraday
     history, so most factors will be heuristic for weeks. The UI says so per factor. Assumed acceptable.
   - *Live window mode cadence with yfinance:* 60 s poll, prices delayed; assumed acceptable.
   - *Light theme priority:* built, but tuned less than dark. Assumed acceptable.
   - *Contract naming:* `NQZ6` (single-digit year) as the spec shows; `NQZ26` shown as alias.
4. **React 18, Vite 7, Tailwind 4, Lightweight Charts 5, TypeScript 5.9, pandas 2.x.** TypeScript 7 and
   pandas 3 were on the registry but are new majors; pinned below them for stability.
5. **Weekday tendency and every window stat use the parquet store, not yfinance on the fly.** On a
   fresh clone with no history, stats render "unavailable (n=0)" rather than a number.
6. **Prices for the mock provider come from `data/fixtures/bars/<SYMBOL>_<interval>.parquet`.**
   Parquet, not CSV, so a frozen fixture is byte-identical to what the history store holds.
7. **Two commits instead of one per phase.** The scan orchestrator depends on every engine and the App shell
   imports every panel, so neither half can be split into runnable per-phase states without stubbing.
   Commit 1 is phase (a): design system, config, fixtures, frontend. Commit 2 is phases (b)–(h): backend
   engines, API, CLI and tests. `make check` is green on both commits' final tree (the second). PROGRESS.md
   records each phase's state separately.
8. **ruff line length 160, E501 and E741 ignored.** The engine builds long plain-English sentences; `l` is
   the CRT low. `pandas-stubs` was dropped: its signatures fought every `float(row["high"])`.
9. **Context ranges accept a later reclaim.** Appendix A says accumulation after the sweep can take more
   than three candles, so for context ranges (daily, 4H slots, sessions) a close back inside up to three
   candles after the sweeping candle confirms the manipulation. Execution ranges stay strict (C2 must close
   inside). Both are tested.
10. **Watch setups estimate risk with half an ATR14 of the timeframe** as the assumed sweep depth, so the
    R:R shown before any sweep exists is a plausible number rather than the level-plus-buffer fantasy.
