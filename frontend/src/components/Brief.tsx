import type { Setup, Snapshot } from "../types/snapshot";
import { fmtPrice, fmtTime } from "../lib/format";
import { KV, Verdict, WhyLine, toneForBias, toneForRating } from "./Why";
import { BiasScorecard } from "./BiasPanel";
import { StatValue } from "./StatValue";

function splitLead(s: string): [string, string] {
  const i = s.indexOf(":");
  return i > 0 && i < 40 ? [s.slice(0, i), s.slice(i)] : ["", s];
}

export function Brief({ snap, animKey, liveWatch }: { snap: Snapshot; animKey: number; liveWatch?: string | null }) {
  const [todayLead, todayRest] = splitLead(snap.brief.today);
  const [biasLead, biasRest] = splitLead(snap.brief.bias);
  const noTrade = snap.rating.label === "No trade";
  const primary: Setup | undefined = snap.ideas[0];
  const watchText = (liveWatch ?? snap.brief.watch).replace(/^Watch for /, "");
  return (
    <section className="brief-surface px-6 py-8 lg:px-10 lg:py-10" aria-label="The brief" key={animKey}>
      <div className="relative flex flex-col gap-6">
        <WhyLine className="fade-in" drawer={<RatingDrawer snap={snap} />}>
          {todayLead && <Verdict label={todayLead.replace(" today", "")} tone={toneForRating(snap.rating.label)} />}
          {todayLead ? " today" + todayRest : todayRest}
        </WhyLine>
        <div className="fade-in-2">
          <WhyLine drawer={<BiasScorecard snap={snap} />}>
            <span className="text-text-2 font-normal">Bias for {snap.meta.window.start.replace(/^0/, "")}–{snap.meta.window.end}: </span>
            <Verdict label={biasLead || snap.bias.label} tone={toneForBias(snap.bias.label)} />
            {biasRest}
          </WhyLine>
          <div className="confbar mt-3 max-w-xl" role="meter" aria-valuenow={snap.bias.confidence} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
            <div style={{ width: `${snap.bias.confidence}%` }} />
          </div>
        </div>
        <WhyLine className="fade-in-3" drawer={<WatchDrawer snap={snap} setup={noTrade ? undefined : primary} />}>
          <span className="text-text-2 font-normal">Watch: </span>
          {watchText}
          {liveWatch && <span className="text-[14px] text-muted font-normal"> (live)</span>}
        </WhyLine>
      </div>
    </section>
  );
}

function RatingDrawer({ snap }: { snap: Snapshot }) {
  const r = snap.rating;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="text-text-2 mb-1">Rubric, applied in order. Matched rules:</div>
        {r.reasons.length === 0 && <div>No rule matched: no red-folder events, no structural flags, confidence high enough.</div>}
        <ol className="list-decimal ml-5">
          {r.reasons.map((x, i) => (
            <li key={i}>
              <span className={x.tier === "no_trade" ? "bear" : x.tier === "caution" ? "amber" : "bull"}>{x.tier === "no_trade" ? "No trade" : x.tier === "caution" ? "Caution" : "Trade"}</span>: {x.text}
            </li>
          ))}
        </ol>
        <div className="text-muted text-[13px] mt-2">Rules checked: {r.rules_checked.join(", ")}</div>
      </div>
      <div>
        <div className="text-text-2 mb-1">Plan</div>
        <div>{r.plan}</div>
        {snap.meta.roll_warning && <div className="amber mt-2">{snap.meta.roll_warning}</div>}
      </div>
    </div>
  );
}

function WatchDrawer({ snap, setup }: { snap: Snapshot; setup?: Setup }) {
  const tick = snap.meta.tick;
  const alt = snap.crt.setups.find((s) => s.scenario === "alternate");
  if (!setup) {
    return (
      <div>
        <div>No setup is presented today.</div>
        <ul className="list-disc ml-5 mt-1">{snap.bias.no_trade.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="text-text-2 mb-1">Primary setup, {setup.timeframe}, template {setup.template}, state <span className={setup.state === "confirmed" || setup.state === "active" ? "accent" : ""}>{setup.state}</span></div>
        <KV k="Trigger" v={setup.trigger} />
        <KV k="Confirmation" v={setup.confirmation} />
        <KV k="Earliest entry" v={setup.earliest_entry_at ? fmtTime(setup.earliest_entry_at) : setup.candle_close_at ? `at the ${fmtTime(setup.candle_close_at)} close` : "after confirmation"} />
        <KV k="Entry zone" v={<span className="num">{setup.entry_zone.map((x) => fmtPrice(x, tick)).join(" – ")}</span>} />
        <KV k="Stop" v={<span className="num">{fmtPrice(setup.stop, tick)}</span>} />
        <KV k="Targets" v={<span className="num">{fmtPrice(setup.t1, tick)} (EQ) · {fmtPrice(setup.t2, tick)}{setup.t3 ? ` · ${fmtPrice(setup.t3, tick)}` : ""}</span>} />
        <KV k="R:R at T2" v={<span className="num">{setup.rr_t2 ?? "—"}</span>} />
        <KV k="Quality" v={<span className="num">{setup.quality}/100</span>} />
        <KV k="Odds (reach EQ)" v={<StatValue stat={setup.odds.reach_eq} kind="p" />} />
        <KV k="Odds (reach opposite)" v={<StatValue stat={setup.odds.reach_opposite} kind="p" />} />
        <KV k="Odds (invalidated)" v={<StatValue stat={setup.odds.invalidated} kind="p" />} />
        <KV k="Odds scope" v={setup.odds_scope} />
        <KV k="Valid until" v={fmtTime(setup.valid_until)} />
        <KV k="Invalidation" v={setup.invalidation} />
        {setup.smt && <KV k="SMT" v={setup.smt.detail} />}
        {setup.warning && <div className="amber mt-2">{setup.warning}</div>}
        <div className="text-muted text-[13px] mt-2">{setup.entry_note}</div>
        <ul className="list-disc ml-5 mt-2 text-[13px] text-text-2">{setup.quality_reasons.map((q, i) => <li key={i}>{q}</li>)}</ul>
      </div>
      <div>
        <div className="text-text-2 mb-1">Alternate scenario</div>
        {alt ? (
          <>
            <div>{alt.sentence}</div>
            <KV k="Direction" v={alt.direction} />
            <KV k="Stop" v={<span className="num">{fmtPrice(alt.stop, tick)}</span>} />
            <KV k="Targets" v={<span className="num">{fmtPrice(alt.t1, tick)} · {fmtPrice(alt.t2, tick)}</span>} />
            <KV k="Quality" v={<span className="num">{alt.quality}/100</span>} />
            {alt.warning && <div className="amber mt-1">{alt.warning}</div>}
          </>
        ) : (
          <div className="text-muted">None.</div>
        )}
        <div className="text-text-2 mt-4 mb-1">What flips the bias</div>
        <ul className="list-disc ml-5">{snap.bias.flip_if.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <div className="text-text-2 mt-4 mb-1">No-trade conditions</div>
        <ul className="list-disc ml-5">{snap.bias.no_trade.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
