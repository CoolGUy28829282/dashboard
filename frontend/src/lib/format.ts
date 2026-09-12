// Formatting helpers. Every time shown to the user is New York time.
import type { Stat } from "../types/snapshot";

export const NY = "America/New_York";

export function decimalsForTick(tick: number): number {
  if (tick >= 1) return 0;
  const s = tick.toString();
  return s.includes(".") ? s.split(".")[1].length : 0;
}

export function fmtPrice(v: number | null | undefined, tick = 0.25): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const d = decimalsForTick(tick);
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtDelta(v: number | null | undefined, tick = 0.25): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const d = decimalsForTick(tick);
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (v > 0 ? "+" : v < 0 ? "−" : "") + s;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** HH:MM in New York from an ISO string (any offset) or unix seconds. */
export function fmtTime(t: string | number | null | undefined): string {
  if (t === null || t === undefined || t === "") return "—";
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function fmtDate(t: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }): string {
  if (!t) return "—";
  const d = t.length === 10 ? new Date(t + "T12:00:00") : new Date(t);
  return new Intl.DateTimeFormat("en-US", { timeZone: t.length === 10 ? undefined : NY, ...opts }).format(d);
}

/** Time parts of `now` on the New York wall clock. */
export function nyParts(now: Date): { y: number; mo: number; d: number; h: number; mi: number; s: number; dow: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: NY, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false, weekday: "short" });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(now)) p[part.type] = part.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, dow };
}

/** Is Globex open at this NY wall-clock moment? Sun 18:00 → Fri 17:00 with a 17:00–18:00 daily halt. */
export function globexOpen(p: { dow: number; h: number; mi: number }): boolean {
  const mins = p.h * 60 + p.mi;
  if (p.dow === 6) return false;
  if (p.dow === 0) return mins >= 18 * 60;
  if (p.dow === 5 && mins >= 17 * 60) return false;
  return !(mins >= 17 * 60 && mins < 18 * 60);
}

/** Seconds until the next milestone (HH:MM list) that falls inside an open session, and its label. */
export function nextMilestone(now: Date, milestones: string[]): { label: string; seconds: number; at: Date } {
  const p = nyParts(now);
  const labels: Record<string, string> = { "09:00": "9:00 window open", "09:30": "9:30 RTH open", "12:00": "12:00 stand down" };
  for (let dayOff = 0; dayOff < 8; dayOff++) {
    const dow = (p.dow + dayOff) % 7;
    if (dow === 0 || dow === 6) continue;
    for (const m of milestones) {
      const [hh, mm] = m.split(":").map(Number);
      const target = dayOff * 86400 + hh * 3600 + mm * 60;
      const nowS = p.h * 3600 + p.mi * 60 + p.s;
      if (target > nowS && globexOpen({ dow, h: hh, mi: mm })) {
        const seconds = target - nowS;
        return { label: labels[m] ?? m, seconds, at: new Date(now.getTime() + seconds * 1000) };
      }
    }
  }
  return { label: "next session", seconds: 0, at: now };
}

export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

/** A stat is renderable only when it carries value, n and a date range (spec rule). */
export function statOk(s: Stat | null | undefined): s is Stat & { from: string; to: string } {
  return !!s && s.value !== null && s.value !== undefined && typeof s.n === "number" && s.n > 0 && !!s.from && !!s.to;
}

export function statText(s: Stat | null | undefined, kind: "p" | "pts" | "min" | "" = ""): string {
  if (!statOk(s)) return s && s.n === 0 ? "unavailable (n=0)" : "unavailable";
  const unit = kind || (s.unit as "p" | "pts" | "min" | "") || "";
  if (unit === "p") return fmtPct(s.value);
  if (unit === "pts") return `${fmtNum(s.value, 0)} pts`;
  if (unit === "min") return `${fmtNum(s.value, 0)} min`;
  return fmtNum(s.value, 2);
}
