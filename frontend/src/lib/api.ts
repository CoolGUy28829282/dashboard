import type { Snapshot } from "../types/snapshot";

export type Instrument = "NQ" | "ES" | "GC";
export const INSTRUMENTS: Instrument[] = ["NQ", "ES", "GC"];

export type Loaded = { snapshot: Snapshot; source: "api" | "mock" };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

/** API first; when the backend is not running, fall back to the frozen mock snapshot shipped with the UI. */
export async function fetchSnapshot(instr: Instrument): Promise<Loaded> {
  try {
    const snapshot = await getJson<Snapshot>(`/api/snapshot/${instr}`);
    return { snapshot, source: "api" };
  } catch {
    const snapshot = await getJson<Snapshot>(`/mock/2026-09-11_${instr}.json`);
    return { snapshot, source: "mock" };
  }
}

export async function runScan(instr?: Instrument): Promise<{ ok: boolean; scanning?: boolean; last_scan?: string }> {
  return getJson("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instrument: instr ?? null }) });
}

export async function fetchLive(instr: Instrument): Promise<any> {
  return getJson(`/api/live/${instr}`);
}

export async function fetchJournal(instr: Instrument, date: string): Promise<{ notes: string; checklist: Record<string, boolean>; grade: any }> {
  return getJson(`/api/journal/${instr}/${date}`);
}

export async function saveJournal(instr: Instrument, date: string, body: { notes?: string; checklist?: Record<string, boolean> }): Promise<void> {
  await getJson(`/api/journal/${instr}/${date}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function fetchScoreboard(instr: Instrument): Promise<any> {
  return getJson(`/api/scoreboard/${instr}`);
}

export async function fetchSettings(): Promise<Record<string, any>> {
  return getJson("/api/settings");
}

export async function saveSettings(name: string, body: any): Promise<void> {
  await getJson(`/api/settings/${name}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function runPostSession(instr: Instrument, date?: string): Promise<any> {
  return getJson(`/api/post-session/${instr}${date ? `?date_=${date}` : ""}`, { method: "POST" });
}
