import { useState } from "react";
import type { Setup, Snapshot } from "../types/snapshot";
import { fmtPrice, fmtTime } from "../lib/format";
import { KV, PanelTitle } from "./Why";
import { StatValue } from "./StatValue";

function StateWord({ s }: { s: Setup["state"] }) {
  const cls = s === "confirmed" || s === "active" ? "accent" : s === "invalidated" ? "bear" : s === "done" ? "bull" : "text-text-2";
  return <span className={`${cls} font-medium`}>{s}</span>;
}

export function SetupsList({ snap, live }: { snap: Snapshot; live: any | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const noTrade = snap.rating.label === "No trade";
  const setups: Setup[] = noTrade ? [] : (live?.crt?.setups ?? snap.crt.setups);
  const tick = snap.meta.tick;
  const exec = (live?.crt?.execution ?? snap.crt.execution) as Record<string, any>;
  return (
    <section className="panel p-5">
      <PanelTitle title="Setups" right={live ? `live · ${fmtTime(live.as_of)}` : `as of ${fmtTime(snap.crt.as_of)}`} />
      {noTrade && <div className="text-text-2">No setups on a No-trade day.</div>}
      {!noTrade && setups.length === 0 && <div className="text-text-2">No readable range yet.</div>}
      <ol className="grid gap-2">
        {setups.map((s, i) => (
          <li key={s.id} className={`border-t hairline pt-2 first:border-0 first:pt-0 ${s.state === "confirmed" ? "pulse-once" : ""}`}>
            <button className="w-full text-left flex flex-wrap sm:flex-nowrap gap-x-3 gap-y-1 items-baseline" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="num text-muted w-4">{i + 1}</span>
              <span className="w-20 shrink-0"><StateWord s={s.state} /></span>
              <span className="num w-10 shrink-0">{s.timeframe}</span>
              <span className="basis-full sm:basis-auto sm:flex-1 text-[14px]">{s.sentence}{s.scenario === "alternate" && <span className="text-muted"> (alternate)</span>}{s.counter_bias && <span className="amber"> counter-bias</span>}</span>
              <span className="num text-[13px] text-muted shrink-0">q {s.quality}</span>
            </button>
            {open === s.id && (
              <div className="drawer mt-2 px-4 py-3 rounded-md text-[14px] grid md:grid-cols-2 gap-x-6">
                <div>
                  <KV k="Template" v={s.template} />
                  <KV k="Range" v={`${s.range_label} (${fmtPrice(s.sweep_level, tick)})`} />
                  <KV k="Sweep" v={s.sweep_at ? fmtTime(s.sweep_at) : "not yet"} />
                  <KV k="Reclaim (first 5m close inside)" v={s.reclaim_at ? fmtTime(s.reclaim_at) : "—"} />
                  <KV k="Candle close" v={s.candle_close_at ? fmtTime(s.candle_close_at) : "—"} />
                  <KV k="Entry zone" v={<span className="num">{s.entry_zone.map((x) => fmtPrice(x, tick)).join(" – ")}</span>} />
                  <KV k="Stop" v={<span className="num">{fmtPrice(s.stop, tick)}</span>} />
                  <KV k="T1 / T2 / T3" v={<span className="num">{fmtPrice(s.t1, tick)} / {fmtPrice(s.t2, tick)} / {s.t3 ? fmtPrice(s.t3, tick) : "—"}</span>} />
                  <KV k="R:R at T2" v={<span className="num">{s.rr_t2 ?? "—"}</span>} />
                </div>
                <div>
                  <KV k="P(reach EQ)" v={<StatValue stat={s.odds.reach_eq} kind="p" />} />
                  <KV k="P(reach opposite)" v={<StatValue stat={s.odds.reach_opposite} kind="p" />} />
                  <KV k="P(invalidated)" v={<StatValue stat={s.odds.invalidated} kind="p" />} />
                  <KV k="Median min to T1 / T2" v={<><StatValue stat={s.odds.median_min_to_t1} kind="min" /> / <StatValue stat={s.odds.median_min_to_t2} kind="min" /></>} />
                  <KV k="Odds scope" v={s.odds_scope} />
                  <KV k="SMT" v={s.smt ? s.smt.detail : "—"} />
                  <KV k="Premium / discount" v={s.premium_discount ?? "—"} />
                  <KV k="Invalidation" v={s.invalidation} />
                  <ul className="list-disc ml-5 mt-2 text-[13px] text-text-2">{s.quality_reasons.map((q, j) => <li key={j}>{q}</li>)}</ul>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid sm:grid-cols-3 gap-3 text-[13px] text-text-2">
        {Object.values(exec).map((e: any) => (
          <div key={e.timeframe} className="border-t hairline pt-2">
            <div className="flex justify-between"><span className="num text-text">{e.timeframe}</span><span>{e.state ?? "—"}{e.closes_at ? ` · closes ${fmtTime(e.closes_at)}` : ""}</span></div>
            <div>{e.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
