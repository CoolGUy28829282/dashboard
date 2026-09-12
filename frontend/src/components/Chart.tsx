import { useEffect, useMemo, useRef, useState } from "react";
import { CandlestickSeries, createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type SeriesMarker, type Time } from "lightweight-charts";
import type { Snapshot } from "../types/snapshot";
import { fmtTime, NY } from "../lib/format";
import { RangePrimitive, type Box, type Level, type Palette, type VLine, type Zone } from "../chart/primitives";
import { PanelTitle } from "./Why";

type TF = "15m" | "30m" | "1h";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function palette(): Palette {
  const accent = cssVar("--accent");
  return { text: cssVar("--text"), muted: cssVar("--muted"), hairline: cssVar("--hairline"), accent, box: "rgba(169,180,196,0.06)", boxLive: "rgba(94,225,255,0.05)", exec: "rgba(169,180,196,0.10)", zone: accent + "26", grid: cssVar("--chart-grid") };
}

const toTs = (iso: string | null | undefined) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : null);

function nyTimeOnDate(dateIso: string, hhmm: string): number {
  // unix seconds for HH:MM New York on the trading date, DST-aware via Intl
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(`${dateIso}T${hhmm}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(guess);
  const gh = +(parts.find((p) => p.type === "hour")?.value ?? "0") % 24, gm = +(parts.find((p) => p.type === "minute")?.value ?? "0");
  const diff = (gh * 60 + gm - (h * 60 + m)) * 60;
  return Math.floor(guess.getTime() / 1000) - diff;
}

export function ChartPanel({ snap, theme, live }: { snap: Snapshot; theme: string; live: any | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const primRef = useRef<RangePrimitive | null>(null);
  const markersRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);
  const [tf, setTf] = useState<TF>("15m");
  const chart = live?.chart ?? snap.chart;
  const crt = live?.crt ?? snap.crt;

  const data = useMemo(() => {
    const candles = (chart.candles?.[tf] ?? []) as { time: number; open: number; high: number; low: number; close: number }[];
    const boxes: Box[] = (chart.boxes ?? []).map((b: any) => ({ id: b.id, label: b.label, start: toTs(b.start) ?? 0, end: toTs(b.end) ?? 0, h: b.h, l: b.l, eq: b.eq, live: !!b.live, kind: b.kind }));
    for (const [k, ex] of Object.entries(crt.execution as Record<string, any>)) {
      if (k === tf && ex.range) boxes.push({ id: ex.range.id, label: `${tf} range`, start: toTs(ex.range.start) ?? 0, end: toTs(ex.range.end) ?? 0, h: ex.range.h, l: ex.range.l, eq: ex.range.eq, live: true, kind: "execution" });
    }
    const levels: Level[] = (chart.lines ?? []).filter((l: any) => !["premarket_h", "premarket_l", "rth_h", "rth_l"].includes(l.id) || tf !== "1h");
    const date = snap.meta.trading_date;
    const vlines: VLine[] = snap.key_times.filter((k: any) => k.time).map((k: any) => ({ time: nyTimeOnDate(date, k.time), label: k.time.replace(/^0/, ""), kind: k.kind }));
    for (const k of snap.key_times.filter((k: any) => k.start)) vlines.push({ time: nyTimeOnDate(date, k.start), label: `${k.start.replace(/^0/, "")}–${k.end}`, kind: "reversal" });
    const zones: Zone[] = (chart.zones ?? []).map((z: any) => ({ lo: z.lo, hi: z.hi, from: toTs(z.from) ?? 0, label: z.label }));
    const markers: SeriesMarker<Time>[] = (chart.markers ?? [])
      .map((m: any) => ({ time: (Math.floor((toTs(m.time) ?? 0) / (tf === "15m" ? 900 : tf === "30m" ? 1800 : 3600)) * (tf === "15m" ? 900 : tf === "30m" ? 1800 : 3600)) as Time, position: m.side === "low" ? "belowBar" : "aboveBar", shape: m.kind === "sweep" ? (m.side === "low" ? "arrowUp" : "arrowDown") : "circle", color: cssVar("--accent"), text: `${m.kind === "sweep" ? "sweep" : "reclaim"} ${fmtTime(m.time)}` }))
      .sort((a: any, b: any) => (a.time as number) - (b.time as number));
    return { candles, boxes, levels, vlines, zones, markers, now: toTs(chart.asof) };
  }, [chart, crt, tf, snap.key_times, snap.meta.trading_date]);

  useEffect(() => {
    if (!ref.current) return;
    const pal = palette();
    const c = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: pal.muted, fontFamily: '"Geist Mono Variable", ui-monospace, monospace', fontSize: 12, attributionLogo: false },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      rightPriceScale: { borderColor: pal.hairline },
      timeScale: {
        borderColor: pal.hairline,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: Time) => fmtTime(t as number),
      },
      localization: { timeFormatter: (t: Time) => new Intl.DateTimeFormat("en-US", { timeZone: NY, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date((t as number) * 1000)) },
      crosshair: { horzLine: { labelBackgroundColor: cssVar("--raised") }, vertLine: { labelBackgroundColor: cssVar("--raised") } },
    });
    const s = c.addSeries(CandlestickSeries, { upColor: cssVar("--chart-up"), downColor: cssVar("--chart-down"), borderVisible: false, wickUpColor: cssVar("--chart-up"), wickDownColor: cssVar("--chart-down"), priceFormat: { type: "price", precision: snap.meta.tick >= 1 ? 0 : String(snap.meta.tick).split(".")[1]?.length ?? 2, minMove: snap.meta.tick } });
    const prim = new RangePrimitive([], [], [], [], null, pal);
    s.attachPrimitive(prim);
    const mk = createSeriesMarkers(s, []);
    chartRef.current = c;
    seriesRef.current = s;
    primRef.current = prim;
    markersRef.current = mk;
    return () => {
      c.remove();
      chartRef.current = null;
    };
    // the chart is created once per instrument/theme; data flows through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.meta.instrument, theme]);

  useEffect(() => {
    const s = seriesRef.current, c = chartRef.current;
    if (!s || !c) return;
    s.setData(data.candles.map((k) => ({ ...k, time: k.time as Time })));
    primRef.current?.update({ boxes: data.boxes, levels: data.levels, vlines: data.vlines, zones: data.zones, nowTs: data.now, palette: palette() });
    markersRef.current?.setMarkers(data.markers);
    const date = snap.meta.trading_date;
    const from = nyTimeOnDate(date, tf === "15m" ? "03:00" : "00:30"), to = nyTimeOnDate(date, "12:15");
    c.timeScale().setVisibleRange({ from: from as Time, to: to as Time });
  }, [data, snap.meta.trading_date]);

  return (
    <section className="panel p-5">
      <PanelTitle
        title="Chart"
        right={
          <span className="flex items-center gap-3">
            <span role="group" aria-label="Timeframe" className="flex gap-1">
              {(["15m", "30m", "1h"] as TF[]).map((t) => (
                <button key={t} className="tabbtn" aria-pressed={tf === t} onClick={() => setTf(t)}>{t}</button>
              ))}
            </span>
            <span>as of {fmtTime(chart.asof)}{live ? ` · live${snap.meta.price_delay_min ? `, delayed ${snap.meta.price_delay_min} min` : ""}` : ""}</span>
          </span>
        }
      />
      <div ref={ref} className="w-full h-[360px] lg:h-[420px]" role="img" aria-label={`${snap.meta.instrument} ${tf} candles with the 1 AM, 5 AM and 9 AM ranges`} />
    </section>
  );
}
