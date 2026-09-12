import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLive, fetchSnapshot, type Instrument, type Loaded } from "./api";
import { nextMilestone, nyParts } from "./format";

export function useSnapshot(instr: Instrument) {
  const [state, setState] = useState<{ data: Loaded | null; loading: boolean; error: string | null; tick: number }>({ data: null, loading: true, error: null, tick: 0 });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchSnapshot(instr);
      setState((s) => ({ data, loading: false, error: null, tick: s.tick + 1 }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [instr]);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

/** Ticks once a second; returns the next milestone (9:00, 9:30, 12:00) that lies inside an open Globex session. */
export function useClock(milestones: string[]) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const ms = milestones.length ? milestones : ["09:00", "09:30", "12:00"];
  const m = nextMilestone(now, ms);
  const p = nyParts(now);
  const inWindow = p.dow >= 1 && p.dow <= 5 && p.h * 60 + p.mi >= 9 * 60 && p.h * 60 + p.mi < 12 * 60;
  return { now, milestone: m, inWindow, ny: p };
}

/** Live window mode: between 9:00 and 12:00 poll /api/live every minute. Nothing else on the page changes. */
export function useLive(instr: Instrument, enabled: boolean) {
  const [live, setLive] = useState<any | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setLive(null);
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const d = await fetchLive(instr);
        if (!cancelled) setLive(d);
      } catch {
        /* the panel keeps the last snapshot */
      }
    };
    void poll();
    timer.current = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [instr, enabled]);
  return live;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        window.localStorage.setItem(key, JSON.stringify(nv));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}
