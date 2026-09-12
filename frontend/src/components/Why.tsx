import { useId, useState, type ReactNode } from "react";

/** A "Why" text button that opens an inline drawer under its line. Never a modal. */
export function WhyLine({ children, drawer, id, className = "", size = "brief" }: { children: ReactNode; drawer: ReactNode; id?: string; className?: string; size?: "brief" | "panel" }) {
  const [open, setOpen] = useState(false);
  const rid = useId();
  const did = id ?? rid;
  return (
    <div className={className}>
      <div className="flex items-start gap-4">
        <div className={`flex-1 ${size === "brief" ? "text-[22px] lg:text-[26px] leading-[1.35] font-medium" : "text-[16px]"}`}>{children}</div>
        <button className="why shrink-0 mt-1" aria-expanded={open} aria-controls={did} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Why"}
        </button>
      </div>
      {open && (
        <div id={did} className="drawer mt-3 -mx-2 px-4 py-3 rounded-md text-[14px] leading-[1.5]">
          {drawer}
        </div>
      )}
    </div>
  );
}

export function Verdict({ label, tone }: { label: string; tone: "bull" | "bear" | "amber" | "muted" | "text" }) {
  const cls = tone === "text" ? "" : tone === "muted" ? "text-text-2" : tone;
  return <span className={`font-semibold ${cls}`}>{label}</span>;
}

export function toneForRating(label: string): "bull" | "bear" | "amber" {
  return label === "Trade" ? "bull" : label === "No trade" ? "bear" : "amber";
}
export function toneForBias(label: string): "bull" | "bear" | "muted" {
  return label === "Bullish" ? "bull" : label === "Bearish" ? "bear" : "muted";
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b hairline last:border-0">
      <span className="text-text-2">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

export function PanelTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      {right && <span className="text-[13px] text-muted">{right}</span>}
    </div>
  );
}
