import type { Snapshot } from "../types/snapshot";
import { fmtDelta, fmtPrice, fmtTime } from "../lib/format";
import { PanelTitle } from "./Why";

export function KeyLevels({ snap, live }: { snap: Snapshot; live: any | null }) {
  const tick = snap.meta.tick;
  const price = live?.price?.last ?? snap.price.last;
  const above = [...snap.levels.above].reverse().slice(-6);
  const below = snap.levels.below.slice(0, 6);
  const Row = ({ r }: { r: Snapshot["levels"]["above"][number] }) => (
    <tr className={r.state === "swept" ? "text-muted" : ""} title={r.state === "swept" ? `swept at ${fmtTime(r.swept_at)}` : "untested"}>
      <td className="text-[14px] pr-3">{r.name}{r.state === "swept" ? <span className="text-[13px]"> swept {fmtTime(r.swept_at)}</span> : ""}</td>
      <td className="num text-[16px] text-right pr-3">{fmtPrice(r.price, tick)}</td>
      <td className="num text-[14px] text-right text-text-2">{fmtDelta(r.distance, tick)}</td>
    </tr>
  );
  return (
    <section className="panel p-5">
      <PanelTitle title="Key levels" right={`as of ${fmtTime(snap.price.as_of)}`} />
      <table className="levels w-full">
        <tbody>
          <tr><td className="text-[13px] text-muted pb-1" colSpan={3}>above</td></tr>
          {above.map((r) => <Row key={r.id} r={r} />)}
          <tr className="border-y hairline">
            <td className="text-[14px] py-2">now{snap.price.delay_min ? <span className="text-[13px] text-muted"> delayed {snap.price.delay_min} min</span> : ""}</td>
            <td className="num accent text-[18px] text-right pr-3 py-2">{fmtPrice(price, tick)}</td>
            <td className="num text-[13px] text-right text-muted">{fmtTime(live?.price?.as_of ?? snap.price.as_of)}</td>
          </tr>
          <tr><td className="text-[13px] text-muted pt-2 pb-1" colSpan={3}>below</td></tr>
          {below.map((r) => <Row key={r.id} r={r} />)}
        </tbody>
      </table>
      <div className="mt-3 text-[13px] text-text-2 grid grid-cols-2 gap-x-3">
        {Object.entries(snap.crt.premium_discount).map(([k, v]) => (
          <div key={k} className="flex justify-between"><span>{k === "h4_0500" ? "5 AM candle" : k === "daily_prev" ? "prev day" : k}</span><span>{v}</span></div>
        ))}
      </div>
    </section>
  );
}
