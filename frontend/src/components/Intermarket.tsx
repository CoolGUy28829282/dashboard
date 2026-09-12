import type { Snapshot } from "../types/snapshot";
import { fmtNum, fmtTime } from "../lib/format";
import { PanelTitle } from "./Why";
import { StatValue } from "./StatValue";

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return <span className="text-muted">—</span>;
  const w = 64, h = 18, min = Math.min(...v), max = Math.max(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - ((x - min) / (max - min || 1)) * h}`).join(" ");
  return <svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1" /></svg>;
}

export function IntermarketPanel({ snap }: { snap: Snapshot }) {
  const im = snap.intermarket;
  return (
    <section className="panel p-5">
      <PanelTitle title="Intermarket" right={`as of ${fmtTime(im.as_of)}`} />
      <table className="w-full text-[14px]">
        <thead className="text-[13px] text-muted text-left"><tr><th className="font-normal">Symbol</th><th className="font-normal text-right">Last</th><th className="font-normal text-right">Since 5 PM</th><th className="font-normal text-right">Since midnight</th><th className="font-normal text-right">5 d</th><th className="font-normal">Read</th></tr></thead>
        <tbody>
          {im.rows.map((r) => (
            <tr key={r.symbol} className="border-t hairline">
              <td className="py-1">{r.name}</td>
              <td className="num text-right">{r.last === null ? "—" : fmtNum(r.last, r.last > 1000 ? 0 : 2)}</td>
              <td className={`num text-right ${(r.pct_since_1700 ?? 0) > 0 ? "bull" : (r.pct_since_1700 ?? 0) < 0 ? "bear" : ""}`}>{r.pct_since_1700 === null ? "—" : `${r.pct_since_1700 > 0 ? "+" : ""}${r.pct_since_1700.toFixed(2)}%`}</td>
              <td className="num text-right text-text-2">{r.chg_since_midnight === null ? "—" : fmtNum(r.chg_since_midnight, 2)}</td>
              <td className="text-right text-text-2"><Spark v={r.sparkline} /></td>
              <td className="text-text-2">{r.read}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[14px] grid sm:grid-cols-2 gap-x-6">
        {[im.real_yield, im.breakeven].map((s: any, i) => (
          <div key={i} className="flex justify-between border-t hairline py-1"><span className="text-text-2">{i === 0 ? "10Y real yield (DFII10)" : "10Y breakeven (T10YIE)"}</span><span className="num">{s && s.status === "ok" ? `${s.value.toFixed(2)}% (${s.change >= 0 ? "+" : ""}${(s.change ?? 0).toFixed(2)}) · ${s.as_of}` : "unavailable"}</span></div>
        ))}
      </div>
    </section>
  );
}

export function SessionPanel({ snap }: { snap: Snapshot }) {
  const s = snap.sessions;
  const wd = (snap.stats.weekday_window as any)?.all?.avg_range;
  const dayRange = snap.crt.context.find((c) => c.id === "daily_cur");
  const used = dayRange && dayRange.h !== null && dayRange.l !== null && wd?.value ? ((dayRange.h! - dayRange.l!) / wd.value) * 100 : null;
  return (
    <section className="panel p-5">
      <PanelTitle title="Session stats" right="range vs its 20-day average" />
      <table className="w-full text-[14px]">
        <thead className="text-[13px] text-muted text-left"><tr><th className="font-normal">Session</th><th className="font-normal text-right">Range</th><th className="font-normal text-right">20-day avg</th><th className="font-normal text-right">% of avg</th><th className="font-normal text-right">Direction</th></tr></thead>
        <tbody>
          {Object.entries(s).filter(([k]) => k !== "rth").map(([k, v]) => (
            <tr key={k} className="border-t hairline">
              <td className="py-1 capitalize">{k} <span className="text-muted text-[13px]">{fmtTime(v.start)}–{fmtTime(v.end)}</span></td>
              <td className="num text-right">{v.range === null ? "—" : fmtNum(v.range, 1)}</td>
              <td className="text-right"><StatValue stat={v.avg20} kind="pts" /></td>
              <td className="num text-right">{v.pct_of_avg === null ? "—" : `${v.pct_of_avg}%`}</td>
              <td className="text-right text-text-2">{v.direction ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[14px] flex justify-between border-t hairline pt-2"><span className="text-text-2">Average window range already used before 9:00</span><span className="num">{used === null ? "unavailable" : `${used.toFixed(0)}%`}{wd ? <span className="text-muted text-[13px]"> (avg {fmtNum(wd.value, 0)} pts, n={wd.n})</span> : null}</span></div>
    </section>
  );
}
