import type { Snapshot } from "../types/snapshot";
import { fmtDate, fmtNum } from "../lib/format";
import { KV, PanelTitle } from "./Why";

function fmtInput(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : fmtNum(v, 3);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return JSON.stringify(v);
}

/** The full scorecard: every factor's score, weight, reason, inputs, evidence/heuristic, similar mornings and the arithmetic. */
export function BiasScorecard({ snap }: { snap: Snapshot }) {
  const b = snap.bias;
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead className="text-muted text-[13px] text-left">
            <tr>
              <th className="font-normal py-1">Factor</th>
              <th className="font-normal text-right">Score</th>
              <th className="font-normal text-right">Weight</th>
              <th className="font-normal text-right">w×s</th>
              <th className="font-normal">Source</th>
              <th className="font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {b.factors.map((f) => (
              <tr key={f.id} className="border-t hairline align-top">
                <td className="py-2 pr-2">{f.label}</td>
                <td className={`num text-right pr-2 ${f.score > 0 ? "bull" : f.score < 0 ? "bear" : ""}`}>{f.score >= 0 ? "+" : ""}{f.score.toFixed(2)}</td>
                <td className="num text-right pr-2">{f.weight.toFixed(2)}{f.weight !== f.weight_raw && <span className="text-muted"> ({f.weight_raw.toFixed(2)})</span>}</td>
                <td className="num text-right pr-2">{(f.weight * f.score >= 0 ? "+" : "") + (f.weight * f.score).toFixed(3)}</td>
                <td className="pr-2">
                  {f.source}
                  {f.source === "evidence" && f.n !== null && f.n !== undefined && <span className="text-muted"> n={f.n}, p̂={f.p_hat}</span>}
                  {f.source === "heuristic" && f.n !== null && f.n !== undefined && f.n > 0 && <span className="text-muted"> (n={f.n} &lt; 30)</span>}
                </td>
                <td>
                  {f.reason}
                  <details className="mt-1">
                    <summary className="text-muted text-[13px]">inputs{f.condition ? ` · condition ${f.condition}` : ""}</summary>
                    <div className="text-[13px] text-text-2 grid grid-cols-2 gap-x-4">
                      {Object.entries(f.inputs).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2 border-b hairline py-0.5">
                          <span>{k}</span>
                          <span className="num text-right">{fmtInput(v)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.excluded.length > 0 && (
        <div className="text-[14px]">
          <span className="text-text-2">Excluded (weights renormalised): </span>
          {b.excluded.map((e) => `${e.label}: ${e.why}`).join("; ")}
        </div>
      )}
      {b.modifiers.length > 0 && (
        <div className="text-[14px]">
          <span className="text-text-2">Modifiers (confidence only): </span>
          {b.modifiers.map((m) => `${m.id} −${m.penalty} (${m.reason})`).join("; ")}
        </div>
      )}
      <div className="text-[14px]">
        <span className="text-text-2">Similar mornings: </span>
        {b.similar_mornings ? (
          <>
            {b.similar_mornings.text} <span className="text-muted">n={b.similar_mornings.n}</span>
            <details className="inline ml-2">
              <summary className="inline text-muted text-[13px]">dates</summary>
              <span className="text-[13px] text-text-2 ml-2">{b.similar_mornings.dates.map((d) => fmtDate(d, { month: "short", day: "numeric" })).join(", ")}</span>
            </details>
          </>
        ) : (
          <span className="text-muted">unavailable (not enough stored mornings)</span>
        )}
      </div>
      <div className="num text-[13px] text-text-2 whitespace-pre-wrap">{b.confidence_math}</div>
      <div className="text-[14px]">
        <span className="text-text-2">Narrative ({b.narrative_source}): </span>
        {b.narrative}
      </div>
    </div>
  );
}

export function BiasPanel({ snap }: { snap: Snapshot }) {
  const b = snap.bias;
  return (
    <section className="panel p-5">
      <PanelTitle title="Bias engine" right={`${b.label} · ${b.confidence}% · S=${b.score >= 0 ? "+" : ""}${b.score.toFixed(3)}`} />
      <BiasScorecard snap={snap} />
      <div className="grid md:grid-cols-2 gap-4 mt-4 text-[14px]">
        {(["primary", "alternate"] as const).map((k) => {
          const s = b.scenarios[k];
          return (
            <div key={k}>
              <div className="text-text-2 mb-1">{k === "primary" ? "Primary scenario" : "Alternate scenario"}</div>
              {s ? (
                <>
                  <KV k="Direction" v={s.direction} />
                  <KV k="Trigger" v={s.trigger} />
                  <KV k="Confirmation" v={s.confirmation} />
                  <KV k="Entry zone" v={<span className="num">{s.entry_zone}</span>} />
                  <KV k="Target" v={<span className="num">{s.target}</span>} />
                  <KV k="Invalidation" v={s.invalidation} />
                  <KV k="Valid" v={s.valid} />
                </>
              ) : (
                <div className="text-muted">None.</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
