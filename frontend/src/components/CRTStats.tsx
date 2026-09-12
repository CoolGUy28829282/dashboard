import type { Snapshot, Stat } from "../types/snapshot";
import { fmtDelta, fmtPrice, fmtTime } from "../lib/format";
import { PanelTitle } from "./Why";
import { StatValue } from "./StatValue";

const KEYS: [string, string][] = [["sweep_high", "Sweeps prior high"], ["sweep_low", "Sweeps prior low"], ["sweep_both", "Both"], ["sweep_neither", "Neither"], ["close_inside_given_sweep", "Closes inside | sweep"], ["reach_eq", "Reach EQ | confirmed"], ["reach_opposite", "Reach opposite | confirmed"], ["invalidated", "Invalidated | confirmed"], ["median_min_to_t1", "Median min to T1"], ["median_min_to_t2", "Median min to T2"]];

export function CRTStatsPanel({ snap }: { snap: Snapshot }) {
  const c = snap.stats.crt as any;
  const byTf = (c.by_timeframe ?? {}) as Record<string, Record<string, Stat>>;
  const byHour = (c.by_hour ?? {}) as Record<string, Record<string, Stat>>;
  const byWd = (c.by_weekday ?? {}) as Record<string, Record<string, Stat>>;
  const ctx = (c.context ?? {}) as Record<string, Record<string, Stat>>;
  const lb = c.lookback ?? {};
  const tick = snap.meta.tick;
  return (
    <section className="panel p-5">
      <PanelTitle title="CRT stats for the window" right={`${lb.days ?? 0} days · ${lb.from ?? "—"} to ${lb.to ?? "—"} · red-folder days excluded: ${lb.excluded_red_folder ?? 0}`} />
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead className="text-[13px] text-muted text-left"><tr><th className="font-normal py-1">By execution timeframe</th>{Object.keys(byTf).map((tf) => <th key={tf} className="font-normal text-right num">{tf}</th>)}</tr></thead>
          <tbody>
            {KEYS.map(([k, label]) => (
              <tr key={k} className="border-t hairline"><td className="py-1 text-text-2">{label}</td>{Object.keys(byTf).map((tf) => <td key={tf} className="text-right"><StatValue stat={byTf[tf]?.[k]} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3">
        <summary className="text-[14px] text-text-2">By hour of the window (P reach EQ | confirmed)</summary>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 text-[14px] mt-2">
          {Object.entries(byHour).sort().map(([k, v]) => <div key={k} className="flex justify-between border-b hairline py-0.5"><span className="num">{k.replace("@", " at ")}:00</span><StatValue stat={v.reach_eq} kind="p" /></div>)}
        </div>
      </details>
      <details className="mt-2">
        <summary className="text-[14px] text-text-2">By weekday (P reach EQ | confirmed)</summary>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 text-[14px] mt-2">
          {Object.entries(byWd).map(([k, v]) => <div key={k} className="flex justify-between border-b hairline py-0.5"><span className="num">{k.replace("@", " ")}</span><StatValue stat={v.reach_eq} kind="p" /></div>)}
        </div>
      </details>
      <div className="mt-4 grid md:grid-cols-2 gap-6 text-[14px]">
        <div>
          <h3 className="text-text-2 mb-1">Opening sweeps</h3>
          {Object.entries(ctx).map(([k, v]) => (
            <div key={k} className="border-t hairline py-1">
              <div className="text-muted text-[13px]">first {k.replace("first_", "")} minutes after 9:30</div>
              <div className="flex justify-between"><span>sweeps pre-market H/L</span><StatValue stat={v.sweep_premarket} kind="p" /></div>
              <div className="flex justify-between"><span>sweeps 5 AM candle H/L</span><StatValue stat={v.sweep_5am} kind="p" /></div>
              <div className="flex justify-between"><span>reversal after that sweep</span><StatValue stat={v.reversal_after_sweep} kind="p" /></div>
            </div>
          ))}
          {Object.keys(ctx).length === 0 && <div className="text-muted">unavailable (n=0)</div>}
        </div>
        <div>
          <h3 className="text-text-2 mb-1">Model templates</h3>
          {snap.crt.templates.map((t) => (
            <details key={t.id} className="border-t hairline py-1">
              <summary className="flex justify-between gap-2"><span><span className="num">{t.id}</span> {t.name} <span className={t.live ? "accent" : "text-muted"}>{t.live ? "live" : "pending"}</span></span><StatValue stat={t.hit_rate} kind="p" /></summary>
              <div className="text-[13px] text-text-2 mt-1">{t.definition}</div>
              <div className="text-[13px] mt-1">Today: {t.state}</div>
              <div className="text-[13px] text-muted mt-1 flex flex-wrap gap-x-3">{Object.entries(t.by_weekday).map(([wd, s]) => <span key={wd}>{wd} <StatValue stat={s} kind="p" /></span>)}</div>
            </details>
          ))}
        </div>
      </div>
      <details className="mt-4">
        <summary className="text-[14px] text-text-2">Liquidity map ({snap.crt.liquidity.length} pools) and context ranges</summary>
        <div className="grid md:grid-cols-2 gap-6 mt-2 text-[14px]">
          <table className="w-full"><tbody>
            {snap.crt.liquidity.slice(0, 16).map((r) => (
              <tr key={r.id} className={r.state === "swept" ? "text-muted" : ""}><td>{r.name}</td><td className="num text-right">{fmtPrice(r.price, tick)}</td><td className="num text-right text-text-2">{fmtDelta(r.distance, tick)}</td><td className="text-right text-[13px]">{r.state === "swept" ? `swept ${fmtTime(r.swept_at)}` : "untested"}</td></tr>
            ))}
          </tbody></table>
          <table className="w-full"><tbody>
            {snap.crt.context.map((r) => (
              <tr key={r.id} className="align-top border-t hairline"><td className="py-1">{r.label}</td><td className="num text-right">{fmtPrice(r.l, tick)}–{fmtPrice(r.h, tick)}</td><td className="num text-right text-text-2">eq {fmtPrice(r.eq, tick)}</td><td className="text-right text-[13px]">{r.phase}{r.sweeps.length ? ` · ${r.sweeps.map((s) => `${s.side} ${fmtTime(s.at)}${s.closed_inside ? " ✓" : s.closed_inside === false ? " ✗" : " …"}`).join(", ")}` : ""}</td></tr>
            ))}
          </tbody></table>
        </div>
      </details>
    </section>
  );
}
