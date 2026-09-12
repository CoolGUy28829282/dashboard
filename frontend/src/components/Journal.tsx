import { useEffect, useState } from "react";
import type { Snapshot } from "../types/snapshot";
import { fetchJournal, fetchScoreboard, runPostSession, saveJournal, type Instrument } from "../lib/api";
import { useLocalStorage } from "../lib/hooks";
import { fmtTime } from "../lib/format";
import { PanelTitle } from "./Why";
import { StatValue } from "./StatValue";

export function ChecklistNotes({ snap, instr, apiAvailable, checklist }: { snap: Snapshot; instr: Instrument; apiAvailable: boolean; checklist: string[] }) {
  const date = snap.meta.trading_date;
  const key = `journal:${instr}:${date}`;
  const [local, setLocal] = useLocalStorage<{ notes: string; checklist: Record<string, boolean> }>(key, { notes: "", checklist: {} });
  const [state, setState] = useState(local);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!apiAvailable) return;
    fetchJournal(instr, date).then((j) => setState({ notes: j.notes ?? "", checklist: j.checklist ?? {} })).catch(() => {});
  }, [instr, date, apiAvailable]);
  const persist = (next: typeof state) => {
    setState(next);
    setLocal(next);
    if (apiAvailable) saveJournal(instr, date, next).then(() => setSaved(new Date().toISOString())).catch(() => {});
  };
  return (
    <section className="panel p-5">
      <PanelTitle title="Pre-trade checklist and notes" right={saved ? `saved ${fmtTime(saved)}` : apiAvailable ? "persisted per day" : "stored in this browser"} />
      <ul className="grid gap-1 text-[14px]">
        {checklist.map((item, i) => (
          <li key={i}>
            <label className="flex gap-2 items-start cursor-pointer">
              <input type="checkbox" checked={!!state.checklist[String(i)]} onChange={(e) => persist({ ...state, checklist: { ...state.checklist, [String(i)]: e.target.checked } })} />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <textarea className="w-full mt-3 min-h-24" placeholder="Notes for today" value={state.notes} onChange={(e) => setState({ ...state, notes: e.target.value })} onBlur={() => persist(state)} aria-label="Notes" />
    </section>
  );
}

function Block({ title, b }: { title: string; b: any }) {
  if (!b) return null;
  return (
    <div className="border-t hairline py-1 text-[14px]">
      <div className="flex justify-between"><span className="text-text-2">{title}</span><span className="num text-muted text-[13px]">n={b.n}</span></div>
      <div className="grid grid-cols-2 gap-x-4 text-[13px]">
        <span className="flex justify-between"><span>bias direction</span><StatValue stat={b.bias_accuracy} kind="p" /></span>
        <span className="flex justify-between"><span>bias delivery</span><StatValue stat={b.delivery} kind="p" /></span>
        <span className="flex justify-between"><span>primary hit</span><StatValue stat={b.primary_hit} kind="p" /></span>
        <span className="flex justify-between"><span>avg range</span><StatValue stat={b.avg_range} kind="pts" /></span>
      </div>
    </div>
  );
}

export function JournalPanel({ snap, instr, apiAvailable }: { snap: Snapshot; instr: Instrument; apiAvailable: boolean }) {
  const [board, setBoard] = useState<any | null>(null);
  const [grade, setGrade] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const date = snap.meta.trading_date;
  useEffect(() => {
    if (!apiAvailable) return;
    fetchScoreboard(instr).then(setBoard).catch(() => {});
    fetchJournal(instr, date).then((j) => setGrade(j.grade)).catch(() => {});
  }, [instr, date, apiAvailable]);
  const run = async () => {
    setBusy(true);
    try {
      const g = await runPostSession(instr, date);
      setGrade(g);
      setBoard(await fetchScoreboard(instr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel p-5">
      <PanelTitle title="Journal and calibration" right={<button className="btn" onClick={run} disabled={busy || !apiAvailable}>{busy ? "Grading…" : `Grade ${date}`}</button>} />
      {!apiAvailable && <div className="text-muted text-[14px]">Backend offline: the scoreboard needs the API.</div>}
      {grade && grade.status === "graded" && (
        <div className="text-[14px] mb-3">
          <span className="text-text-2">Today: </span>window {grade.direction_actual} ({grade.window.move >= 0 ? "+" : ""}{grade.window.move.toFixed(2)} pts, range {grade.window.range.toFixed(2)}); bias {grade.bias} was {grade.bias_correct === null ? "neutral" : grade.bias_correct ? <span className="bull">right</span> : <span className="bear">wrong</span>}; delivery {grade.bias_delivery === null ? "n/a" : grade.bias_delivery ? "reached" : "not reached"}; primary scenario {grade.scenarios?.primary?.first ?? "n/a"}.
          {grade.execution_sweeps?.length > 0 && <div className="text-[13px] text-text-2 mt-1">Confirmed execution sweeps: {grade.execution_sweeps.map((e: any) => `${e.tf} ${e.range} ${e.side} at ${fmtTime(e.sweep_at)} → ${e.reached_opposite ? "T2" : e.reached_eq ? "T1" : e.invalidated ? "invalidated" : "neither"}`).join("; ")}</div>}
        </div>
      )}
      {grade && grade.status !== "graded" && <div className="text-muted text-[14px]">{grade.reason}</div>}
      {board && board.n > 0 ? (
        <div className="grid md:grid-cols-3 gap-6">
          <div><h3 className="text-[14px] text-text-2 mb-1">Last windows</h3>{Object.entries(board.windows).map(([k, b]) => <Block key={k} title={`last ${k}`} b={b} />)}</div>
          <div><h3 className="text-[14px] text-text-2 mb-1">By confidence bucket (calibration)</h3>{Object.entries(board.by_confidence).map(([k, b]) => <Block key={k} title={`${k}% stated`} b={b} />)}<h3 className="text-[14px] text-text-2 mt-3 mb-1">By rating</h3>{Object.entries(board.rating).map(([k, b]) => <Block key={k} title={k} b={b} />)}</div>
          <div><h3 className="text-[14px] text-text-2 mb-1">By weekday</h3>{Object.entries(board.by_weekday).map(([k, b]) => <Block key={k} title={k} b={b} />)}<h3 className="text-[14px] text-text-2 mt-3 mb-1">By execution timeframe</h3>{Object.entries(board.by_timeframe).map(([k, b]: any) => <div key={k} className="border-t hairline py-1 text-[13px] flex flex-wrap gap-x-4"><span className="num">{k}</span><span>reach EQ <StatValue stat={b.reach_eq} kind="p" /></span><span>opposite <StatValue stat={b.reach_opposite} kind="p" /></span><span>invalidated <StatValue stat={b.invalidated} kind="p" /></span></div>)}</div>
        </div>
      ) : (
        apiAvailable && <div className="text-muted text-[14px]">No graded windows yet. Run the post-session job after 12:00 (or grade a past snapshot).</div>
      )}
    </section>
  );
}
