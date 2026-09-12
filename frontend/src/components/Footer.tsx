import type { Snapshot } from "../types/snapshot";
import { fmtTime } from "../lib/format";

export function Footer({ snap, source }: { snap: Snapshot | null; source: "api" | "mock" | null }) {
  const h = snap?.meta.health;
  const delay = snap?.meta.price_delay_min;
  const asOf = h?.prices.as_of ?? snap?.price.as_of ?? null;
  const parts: string[] = [];
  if (asOf) parts.push(`Data as of ${fmtTime(asOf)}`);
  if (delay !== null && delay !== undefined && delay > 0) parts.push(`prices delayed ${delay} min`);
  if (snap?.meta.data_source === "synthetic") parts.push("synthetic fixture data, not market data");
  else if (snap?.meta.data_source === "fixtures") parts.push("frozen fixture data");
  if (source === "mock") parts.push("backend offline, frozen snapshot");
  const down = h ? Object.entries(h).filter(([k, v]) => !v.ok && !["llm", "series"].includes(k)).map(([k, v]) => `${k} unavailable${v.as_of ? ` (last good ${fmtTime(v.as_of)})` : ""}`) : [];
  return (
    <footer className="flex flex-wrap justify-between gap-2 py-4 mt-6 border-t hairline text-[13px] text-muted">
      <span>Decision-support only. Not financial advice.</span>
      <span className="text-right">
        {parts.join(" · ")}
        {down.length > 0 && <span className="block">{down.join(" · ")}</span>}
      </span>
    </footer>
  );
}
