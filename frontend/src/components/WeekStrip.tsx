import { useState } from "react";
import type { DayCard, Snapshot } from "../types/snapshot";
import { fmtDate } from "../lib/format";
import { PanelTitle, toneForRating } from "./Why";
import { StatValue } from "./StatValue";

function folder(impact: string) {
  return impact === "high" ? "bear" : impact === "medium" ? "amber" : impact === "holiday" ? "text-muted" : "text-text-2";
}

export function WeekStrip({ snap }: { snap: Snapshot }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [sel, setSel] = useState<string | null>(null);
  const days: DayCard[] = view === "week" ? snap.calendar.week : snap.calendar.month;
  const selected = days.find((d) => d.date === sel) ?? null;
  const s = snap.calendar.structural;
  return (
    <section className="panel p-5">
      <PanelTitle
        title={view === "week" ? "This week" : "This month"}
        right={
          <span className="flex gap-3 items-center">
            <span>{s.front}: roll {fmtDate(s.roll, { month: "short", day: "numeric" })}, expiry {fmtDate(s.expiry, { month: "short", day: "numeric" })}</span>
            <span role="group" className="flex gap-1">
              <button className="tabbtn" aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
              <button className="tabbtn" aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
            </span>
          </span>
        }
      />
      <div className={`grid gap-x-4 gap-y-3 ${view === "week" ? "grid-cols-1 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-5"}`} role="list">
        {days.map((d) => (
          <button
            key={d.date}
            role="listitem"
            aria-pressed={sel === d.date}
            onClick={() => setSel(sel === d.date ? null : d.date)}
            className={`text-left border-l-2 pl-3 py-1 ${d.is_today ? "border-l-[var(--accent)]" : "border-l-[var(--hairline)]"}`}
          >
            <div className="flex justify-between items-baseline">
              <span className="text-[14px] text-text-2">{d.weekday} {fmtDate(d.date, { day: "numeric" })}{d.is_today ? " · today" : ""}</span>
              {d.rank && view === "week" && <span className="num text-[13px] text-muted">#{d.rank}</span>}
            </div>
            <div className={`font-semibold ${toneForRating(d.label)}`}>{d.label}</div>
            <div className="text-[13px] text-text-2 line-clamp-2">{d.reasons[0]}</div>
            <div className="text-[13px] flex flex-wrap gap-x-2">
              {d.events.filter((e) => e.impact !== "low").slice(0, 3).map((e, i) => <span key={i} className={folder(e.impact)}>{e.time ?? ""} {e.name}</span>)}
              {d.structural.map((x: any, i) => <span key={`s${i}`} className="amber">{x.text}</span>)}
            </div>
          </button>
        ))}
      </div>
      {selected && (
        <div className="drawer mt-4 px-4 py-3 rounded-md text-[14px] grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-text-2 mb-1">{fmtDate(selected.date)}: {selected.label}</div>
            <ul className="list-disc ml-5">{selected.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            {selected.structural.length > 0 && <div className="mt-2">{selected.structural.map((x: any) => x.text).join("; ")}</div>}
          </div>
          <div>
            <div className="text-text-2 mb-1">Events</div>
            {selected.events.length === 0 && <div className="text-muted">None listed.</div>}
            {selected.events.map((e, i) => (
              <div key={i} className="flex gap-2"><span className="num w-12">{e.time ?? "day"}</span><span className={folder(e.impact)}>{e.impact}</span><span>{e.name}{e.consensus ? ` (cons ${e.consensus}, prev ${e.previous ?? "—"})` : ""}</span></div>
            ))}
          </div>
          <div>
            <div className="text-text-2 mb-1">{selected.weekday} 9–12 window stats</div>
            <div className="flex justify-between"><span>Avg range</span><StatValue stat={selected.stats.avg_range} kind="pts" /></div>
            <div className="flex justify-between"><span>Median range</span><StatValue stat={selected.stats.median_range} kind="pts" /></div>
            <div className="flex justify-between"><span>Closed up</span><StatValue stat={selected.stats.p_up} kind="p" /></div>
            <div className="flex justify-between"><span>Trend windows</span><StatValue stat={selected.stats.p_trend} kind="p" /></div>
            <div className="flex justify-between"><span>Swept PDH / PDL</span><span><StatValue stat={selected.stats.swept_pdh} kind="p" /> / <StatValue stat={selected.stats.swept_pdl} kind="p" /></span></div>
          </div>
        </div>
      )}
    </section>
  );
}
