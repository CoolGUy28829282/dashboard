# DESIGN.md — pre-market brief

## Principle

A serious, futuristic tool that is effortless to read. Futurism from precision, light and
material; readability from plain sentences and progressive disclosure. Three sentences answer the
morning. Everything else is one click away, under the line it explains.

Grounding: the visual vocabulary is **ranges, levels and time**. Horizontal range boxes with a
midline, thin vertical time markers, prices in a mono face. A border, a divider or a number exists
only when it encodes information (a range edge, a level, a rank).

## Tokens (final)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--base` | `#080B12` | `#F5F7FA` | page |
| `--glass` | `rgba(255,255,255,0.03)` | `rgba(10,16,28,0.03)` | panel fill |
| `--hairline` | `rgba(255,255,255,0.09)` | `rgba(10,16,28,0.12)` | 1 px panel border |
| `--edge` | `rgba(255,255,255,0.14)` | `rgba(255,255,255,0.9)` | 1 px top-edge highlight of a panel |
| `--raised` | `#121826` | `#FFFFFF` | drawers, popovers |
| `--text` | `#EAF0F7` | `#0E1420` | primary text |
| `--text-2` | `#A9B4C4` | `#4A5568` | secondary |
| `--muted` | `#6F7B8D` | `#7A8698` | labels, timestamps |
| `--accent` | `#5EE1FF` | `#0891B2` | live / actionable only |
| `--bull` | `#3DDC97` | `#0F9F6E` | always with a word |
| `--bear` | `#FF6B84` | `#D6455F` | always with a word |
| `--amber` | `#FFB547` | `#B7791F` | caution, always with a word |

One radial light (`--accent` at 10 % alpha, 600 px, centred behind the brief) is the only gradient on
the page. Panel top-edge highlight is a 1 px inset box-shadow, not a gradient.

**Accent budget.** Countdown digits, live price, current-time line, sweep markers, confirmed-setup
state, focus rings. Nothing else. If a designer asks "can this be cyan?", the answer is no.

**Contrast.** Dark: text on base 15.6:1, text-2 8.6:1, muted 4.6:1, accent 11.9:1, bull 10.9:1,
bear 7.5:1, amber 10.7:1. Light: text 17.5:1, text-2 7.6:1, muted 4.5:1 (labels only, ≥14 px),
accent 4.6:1, bull 4.5:1, bear 4.6:1, amber 4.6:1.

## Type

Geist Sans (variable, self-hosted via `@fontsource-variable/geist`) for text. Geist Mono
(`@fontsource-variable/geist-mono`) with `font-variant-numeric: tabular-nums` for every number,
price, time and countdown. Never mono for labels.

Scale (px): 13 meta only (timestamps, `n=`) · 14 body minimum · 16 panel body · 18 panel titles ·
22 brief lines at 390 px · 26 brief lines at ≥1024 px · 40 the countdown and the live price.
Line height 1.45 for prose, 1.1 for numbers. Sentence case everywhere.

## Type roles

| Role | Face | Size | Weight |
|---|---|---|---|
| Brief line | Sans | 26 / 22 | 500 |
| Brief verdict word ("Trade", "Bullish") | Sans | same | 600, semantic colour + word |
| Panel title | Sans | 18 | 600 |
| Body | Sans | 16 / 14 | 400 |
| Level price | Mono | 16 | 500 |
| Distance, delta | Mono | 14 | 400, text-2 |
| Meta (as-of, n, range) | Sans 13 / Mono for the numbers | 13 | 400, muted |
| Countdown | Mono | 40 (28 on phone) | 500, accent |

## Layout, 1440 px, Simple mode

```
+----------------------------------------------------------------------------------------------+
| [NQ] ES  GC   NQZ6 · expires Sep 18 (6 d)   Fri Sep 11, 2026    9:30 open in 01:12:44  Run scan |
|                                                                        Simple | Detailed      |
+----------------------------------------------------------------------------------------------+
|                                                                                              |
|   Today: Trade. No red-folder events; orange-folder UMich at 10:00, be flat into it.   Why   |
|   Bias for 9:00–12:00: Bullish, 68% confidence. The overnight swept yesterday's low     Why   |
|   and reclaimed it, and the 5 AM candle closed in its upper half.                            |
|   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯▯                                                  |
|   Watch: a sweep of the 5 AM low (24,150) after 9:30 that closes back inside on the     Why   |
|   15m or 30m; target 24,194 (EQ) then 24,240 (5 AM high). Stand down at 12:00.               |
|                                                                                              |
+-------------------------------------------------------------------+--------------------------+
| Chart                         15m  30m  1h        as of 07:02     | Key levels               |
|  ┌─────┐ ┌──────┐ ┌────────                                       | above  PWH  24,312  +118 |
|  │ 1AM │ │ 5AM  │ │ 9AM                                           |        PDH  24,240   +46 |
|  └─────┘ └──────┘ └────────   ▲ sweep 09:41   ● reclaim 09:52     | now         24,194       |
|  ‥‥‥‥‥‥‥‥‥‥‥‥‥‥ 8:30  9:00  9:30  10:00  ‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥‥        | below  5AML 24,150   -44 |
| Setups                                                            |        PDL  24,088  -106 |
|  1  pending    30m  sweep of the 9:30 high … closes 10:30  q 74   |                          |
|  2  watch      1h   …                                             |                          |
+-------------------------------------------------------------------+--------------------------+
| This week   Mon  No trade · CPI   Tue  Trade   Wed  Trade   Thu  Caution · roll   Fri  No trade · NFP |
+----------------------------------------------------------------------------------------------+
| News   Overnight in 60 seconds       |  What could move the window       |  Top 5 headlines   |
+----------------------------------------------------------------------------------------------+
  Decision-support only. Not financial advice.              Data as of 07:02 (prices delayed 15 min)
```

Grid: 12 columns, 24 px gutters, 32 px outer margin. Chart panel spans 8, levels 4. Brief spans 12
with 48 px vertical padding and no border; it sits on a slightly lighter glass surface (`--glass`
at 0.05) that is the only surface with the radial light behind it.

## Layout, 390 px

```
+----------------------------------+
| NQ ES GC            9:30 in 1:12 |
| NQZ6 · 6 d     Fri Sep 11        |
+----------------------------------+
| Today: Trade. No red-folder      |
| events; orange UMich at 10:00,   |
| be flat into it.           Why   |
|                                  |
| Bias 9–12: Bullish, 68%. The     |
| overnight swept yesterday's low  |
| and reclaimed it …         Why   |
| ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯            |
|                                  |
| Watch: a sweep of the 5 AM low   |
| (24,150) after 9:30 …      Why   |
+----------------------------------+
| Chart (16:10, 15m default)       |
+----------------------------------+
| Setups                           |
+----------------------------------+
| Key levels                       |
+----------------------------------+
| This week (horizontal scroll)    |
+----------------------------------+
| News                             |
+----------------------------------+
| footer                           |
```

On a phone the brief is the screen. The top bar collapses to two rows; the countdown moves to the
right of the instrument switcher at 28 px.

## Alignment rules

- Text left-aligned. Numbers right-aligned in their column, tabular, same decimals within a column.
- "Why" is a text button at the right edge of its line, 14 px, text-2, underlined on focus/hover
  (no glow). It opens an inline drawer directly under the line with a 1 px hairline top border and
  the `--raised` background. Never a modal.
- Level rows: name (sans, 14) · price (mono, 16) · distance (mono, 14, text-2, signed). The "now"
  row sits between above and below and carries the only accent price on the page.
- Panel title row: title left, as-of time right in 13 px muted. Nothing else in the title row.
- Semantic colour is always paired with a word ("Bullish", "No trade", "confirmed") or a glyph
  with a text label.

## Motion budget

- Scan finished: the three brief lines fade+rise 8 px in sequence over ~500 ms total, then panels
  below fade in once (150 ms). Numbers tick to new values over 200 ms. Instrument switch cross-fades
  the page body in 200 ms. Confirmed setup: one 600 ms pulse of the accent border. Nothing loops.
  No hover glow. `prefers-reduced-motion` sets every duration to 0.

## Not shipped (checked against the spec's list)

Gauges, dials, HUD corner brackets, scanlines, grid textures, blinking dots, DOM-style ladders,
identical shadowed cards, tracked-out all-caps labels, decorative gradients, middle-dot meta
strings as decoration (the `·` in the top bar separates two facts and is the only one), arrows on
buttons, mono for labels, dense multi-column tables in Simple mode, placeholder copy.

## Review notes ("would I produce this for any dashboard?")

First draft used rounded cards with identical shadows and a cyan glow on hover. Removed both:
panels now differ by content density, only the brief has a light source, and hover changes nothing
but the cursor. The setups list was a table; it is now a numbered list of sentences because that is
how the trader reads a setup. The week strip lost its per-day card borders; days are separated by
the rating word and a hairline, so the border encodes "day boundary" only once.
