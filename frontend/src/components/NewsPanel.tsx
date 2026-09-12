import type { HeadlineOut, Snapshot } from "../types/snapshot";
import { fmtTime } from "../lib/format";
import { PanelTitle } from "./Why";

function Sent({ s }: { s: HeadlineOut["sentiment"] }) {
  return <span className={`text-[13px] ${s === "bullish" ? "bull" : s === "bearish" ? "bear" : "text-muted"}`}>{s}</span>;
}

export function NewsPanel({ snap, detailed }: { snap: Snapshot; detailed: boolean }) {
  const n = snap.news;
  const top = n.headlines.filter((h) => h.pinned);
  const today = snap.calendar.today;
  return (
    <section className="panel p-5">
      <PanelTitle title="News and catalysts" right={`${n.summary_source} · as of ${fmtTime(n.as_of)}`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="text-[14px] text-text-2 mb-1">Today's calendar</h3>
          {today.length === 0 && <div className="text-muted text-[14px]">Nothing scheduled.</div>}
          {today.map((e, i) => (
            <div key={i} className={`flex gap-2 text-[14px] py-0.5 ${e.in_window ? "font-medium" : ""}`}>
              <span className="num w-12 shrink-0">{e.time ?? "day"}</span>
              <span className={`w-16 shrink-0 ${e.impact === "high" ? "bear" : e.impact === "medium" ? "amber" : "text-muted"}`}>{e.impact === "high" ? "red" : e.impact === "medium" ? "orange" : e.impact === "holiday" ? "holiday" : "yellow"}</span>
              <span>{e.name}{e.consensus ? <span className="text-muted"> cons {e.consensus}{e.previous ? `, prev ${e.previous}` : ""}</span> : ""}</span>
            </div>
          ))}
          <h3 className="text-[14px] text-text-2 mt-4 mb-1">What could move the window</h3>
          <ul className="text-[14px] list-disc ml-5">{n.movers.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
        <div>
          <h3 className="text-[14px] text-text-2 mb-1">Overnight in 60 seconds</h3>
          <div className="text-[14px] whitespace-pre-line">{n.summary}</div>
          {n.sentiment_score !== null && <div className="text-[13px] text-muted mt-2">Lexicon sentiment <span className="num">{n.sentiment_score >= 0 ? "+" : ""}{n.sentiment_score}</span> over relevant headlines</div>}
        </div>
        <div>
          <h3 className="text-[14px] text-text-2 mb-1">Top headlines</h3>
          {top.map((h, i) => (
            <div key={i} className="text-[14px] py-1 border-t hairline first:border-0">
              <a href={h.url} target="_blank" rel="noreferrer" className="hover:underline">{h.title}</a>
              <div className="text-[13px] text-muted flex gap-2"><span className="num">{fmtTime(h.published)}</span><span>{h.source}</span><Sent s={h.sentiment} /></div>
              {h.why && <div className="text-[13px] text-text-2">{h.why}</div>}
            </div>
          ))}
        </div>
      </div>
      {detailed && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {Object.entries(n.groups).map(([g, items]) => (
            <details key={g} className="border-t hairline pt-2">
              <summary className="text-[14px] text-text-2">{g.replace("_", " and ")} ({items.length})</summary>
              {items.map((h, i) => <div key={i} className="text-[14px] py-0.5"><span className="num text-muted">{fmtTime(h.published)}</span> {h.title} <Sent s={h.sentiment} /></div>)}
            </details>
          ))}
          <div className="border-t hairline pt-2 text-[13px] text-muted">
            Feeds: {n.feeds.map((f: any) => `${f.name}: ${f.ok ? "ok" : "unavailable"}, ${f.count} items${f.as_of ? `, ${fmtTime(f.as_of)}` : ""}`).join(" · ")}
          </div>
        </div>
      )}
    </section>
  );
}
