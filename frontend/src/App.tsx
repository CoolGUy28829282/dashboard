import { useEffect, useState } from "react";
import { INSTRUMENTS, runScan, type Instrument } from "./lib/api";
import { useClock, useLive, useLocalStorage, useSnapshot } from "./lib/hooks";
import { TopBar } from "./components/TopBar";
import { Brief } from "./components/Brief";
import { ChartPanel } from "./components/Chart";
import { SetupsList } from "./components/Setups";
import { KeyLevels } from "./components/KeyLevels";
import { WeekStrip } from "./components/WeekStrip";
import { NewsPanel } from "./components/NewsPanel";
import { BiasPanel } from "./components/BiasPanel";
import { CRTStatsPanel } from "./components/CRTStats";
import { IntermarketPanel, SessionPanel } from "./components/Intermarket";
import { ChecklistNotes, JournalPanel } from "./components/Journal";
import { SettingsPanel } from "./components/Settings";
import { Footer } from "./components/Footer";
import { fmtTime } from "./lib/format";

const DEFAULT_CHECKLIST = [
  "Read the Today line: is this a trading day?",
  "Read the bias and its two heaviest factors; do I agree?",
  "Locate the 1 AM, 5 AM and 9 AM ranges and their EQs on the chart",
  "Mark PDH / PDL and the pre-market high / low",
  "Note every orange-folder event between 8:30 and 12:00",
  "Decide the execution timeframe I will watch first",
  "Write the invalidation before the trigger",
  "Set the 12:00 stand-down alarm",
];

export default function App() {
  const [instr, setInstr] = useLocalStorage<Instrument>("instr", "NQ");
  const [mode, setMode] = useLocalStorage<"simple" | "detailed">("mode", "simple");
  const [theme, setTheme] = useLocalStorage<"dark" | "light">("theme", "dark");
  const { data, loading, error, reload, tick } = useSnapshot(INSTRUMENTS.includes(instr) ? instr : "NQ");
  const snap = data?.snapshot ?? null;
  const clock = useClock(snap?.meta.milestones ?? []);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const apiAvailable = data?.source === "api";
  const liveEnabled = apiAvailable && clock.inWindow && !!snap && snap.meta.trading_date === new Date().toISOString().slice(0, 10);
  const live = useLive(instr, liveEnabled);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const onScan = async () => {
    setScanning(true);
    try {
      const r = await runScan();
      if (r.last_scan) setLastScan(r.last_scan);
      await reload();
    } finally {
      setScanning(false);
    }
  };
  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-8">
      <TopBar instr={instr} setInstr={setInstr} snap={snap} milestone={clock.milestone} onScan={onScan} scanning={scanning} lastScan={lastScan} mode={mode} setMode={setMode} theme={theme} setTheme={setTheme} apiAvailable={apiAvailable} />
      {error && !snap && <div className="panel p-5 mt-6 bear">Could not load a snapshot: {error}. Run `make scan` and start the API.</div>}
      {loading && !snap && <div className="text-muted mt-6">Loading…</div>}
      {snap && (
        <main key={`${instr}-${tick}`} className="xfade grid gap-6 mt-6">
          <Brief snap={snap} animKey={tick} liveWatch={live?.watch ?? null} />
          <div className="fade-panels grid gap-6">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 grid gap-6">
                <ChartPanel snap={snap} theme={theme} live={live} />
                <SetupsList snap={snap} live={live} />
              </div>
              <div className="lg:col-span-4">
                <KeyLevels snap={snap} live={live} />
              </div>
            </div>
            <WeekStrip snap={snap} />
            <NewsPanel snap={snap} detailed={mode === "detailed"} />
            {mode === "detailed" && (
              <>
                <BiasPanel snap={snap} />
                <CRTStatsPanel snap={snap} />
                <div className="grid gap-6 lg:grid-cols-2">
                  <IntermarketPanel snap={snap} />
                  <SessionPanel snap={snap} />
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <ChecklistNotes snap={snap} instr={instr} apiAvailable={apiAvailable} checklist={DEFAULT_CHECKLIST} />
                  <JournalPanel snap={snap} instr={instr} apiAvailable={apiAvailable} />
                </div>
                <SettingsPanel apiAvailable={apiAvailable} />
                <div className="text-[13px] text-muted">Sources: {Object.entries(snap.meta.health).map(([k, v]) => `${k} ${v.ok ? "ok" : "unavailable"}${v.as_of ? ` (${fmtTime(v.as_of)})` : ""}${v.source ? ` via ${v.source}` : ""}`).join(" · ")}</div>
              </>
            )}
          </div>
        </main>
      )}
      <Footer snap={snap} source={data?.source ?? null} />
    </div>
  );
}
