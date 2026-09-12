import { useEffect } from "react";
import { INSTRUMENTS, type Instrument } from "../lib/api";
import { fmtCountdown, fmtDate, fmtTime } from "../lib/format";
import type { Snapshot } from "../types/snapshot";

type Props = {
  instr: Instrument;
  setInstr: (i: Instrument) => void;
  snap: Snapshot | null;
  milestone: { label: string; seconds: number };
  onScan: () => void;
  scanning: boolean;
  lastScan: string | null;
  mode: "simple" | "detailed";
  setMode: (m: "simple" | "detailed") => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  apiAvailable: boolean;
};

export function TopBar(p: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const idx = INSTRUMENTS.indexOf(p.instr);
      if (e.key === "1") p.setInstr("NQ");
      if (e.key === "2") p.setInstr("ES");
      if (e.key === "3") p.setInstr("GC");
      if (e.key === "ArrowRight") p.setInstr(INSTRUMENTS[(idx + 1) % 3]);
      if (e.key === "ArrowLeft") p.setInstr(INSTRUMENTS[(idx + 2) % 3]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  const m = p.snap?.meta;
  const contract = m ? (m.expiring_contract ? `${m.contract} · ${m.expiring_contract} expires ${fmtDate(m.contract_expiry === m.contract_expiry ? m.contract_expiry : "", { month: "short", day: "numeric" }) === "—" ? "" : ""}` : m.contract) : "";
  const contractLine = m
    ? m.expiring_contract
      ? `${m.contract}, ${m.expiring_contract} expires in ${m.expiring_in_days} d`
      : `${m.contract}, ${m.days_to_roll} d to roll, expires ${fmtDate(m.contract_expiry, { month: "short", day: "numeric" })}`
    : "";
  void contract;
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 border-b hairline">
      <div role="tablist" aria-label="Instrument" className="flex gap-1">
        {INSTRUMENTS.map((i) => (
          <button key={i} role="tab" aria-selected={p.instr === i} className="tabbtn text-[16px] font-semibold" onClick={() => p.setInstr(i)} title={`Press ${INSTRUMENTS.indexOf(i) + 1}`}>
            {i}
          </button>
        ))}
      </div>
      <div className="text-[14px] text-text-2 hidden md:block">{contractLine}</div>
      <div className="text-[14px] text-text-2">{m ? fmtDate(m.trading_date) : ""}</div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[14px] text-text-2 hidden sm:inline">{p.milestone.label.replace(" window open", " open").replace(" RTH open", " open")} in</span>
        <span className="num accent text-[28px] lg:text-[40px] font-medium" aria-live="off">{fmtCountdown(p.milestone.seconds)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={p.onScan} disabled={p.scanning || !p.apiAvailable} title={p.apiAvailable ? "Run the pre-market scan for all instruments" : "Backend not running: showing the frozen mock snapshot"}>
          {p.scanning ? "Scanning…" : "Run pre-market scan"}
        </button>
        <span className="text-[13px] text-muted hidden lg:inline">{p.lastScan ? `last scan ${fmtTime(p.lastScan)}` : m ? `snapshot ${fmtTime(m.generated_at)}` : ""}</span>
        <div className="flex gap-1 ml-2" role="group" aria-label="Mode">
          <button className="tabbtn" aria-pressed={p.mode === "simple"} onClick={() => p.setMode("simple")}>Simple</button>
          <button className="tabbtn" aria-pressed={p.mode === "detailed"} onClick={() => p.setMode("detailed")}>Detailed</button>
        </div>
        <button className="tabbtn" aria-pressed={p.theme === "light"} onClick={() => p.setTheme(p.theme === "dark" ? "light" : "dark")} title="Toggle light theme">
          {p.theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </header>
  );
}
