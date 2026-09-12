import type { Stat } from "../types/snapshot";
import { fmtDate, statOk, statText } from "../lib/format";

/** Renders a historical statistic only when it carries value, n and a date range; otherwise "unavailable". */
export function StatValue({ stat, kind, className = "" }: { stat: Stat | null | undefined; kind?: "p" | "pts" | "min" | ""; className?: string }) {
  if (!statOk(stat)) {
    return <span className={`text-muted ${className}`} title="Missing value, sample size or date range">{stat && stat.n === 0 ? "unavailable (n=0)" : "unavailable"}</span>;
  }
  const title = `n=${stat.n}, ${fmtDate(stat.from, { month: "short", day: "numeric", year: "numeric" })} to ${fmtDate(stat.to, { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <span className={className} title={title}>
      <span className="num">{statText(stat, kind)}</span> <span className="text-muted text-[13px]">n={stat.n}</span>
    </span>
  );
}
