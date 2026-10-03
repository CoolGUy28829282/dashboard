// Ticker facts derived from the league data itself (never hard-coded numbers).
import { fmtHeight } from '../core/util.js';

export function leagueFacts(l) {
  if (!l) return [];
  const out = [];
  const P = l.players, T = l.teams;
  const tn = (id) => T[id].city + ' ' + T[id].name;
  const top = P.slice().sort((a, b) => b.ovr - a.ovr);
  out.push(`${top[0].name} (${tn(top[0].teamId)}) enters ${l.season.label} as the league's top-rated player at ${top[0].ovr} overall`);
  const ts = T.slice().sort((a, b) => b.rating.ovr - a.rating.ovr);
  out.push(`${tn(ts[0].id)} are the preseason favourites with a ${ts[0].rating.ovr} team rating`);
  out.push(`${tn(ts[ts.length - 1].id)} open the rebuild at the bottom of the power rankings (${ts[ts.length - 1].rating.ovr})`);
  const prospect = P.filter((p) => p.age <= 21).sort((a, b) => b.potential - a.potential)[0];
  if (prospect) out.push(`Scouts love ${prospect.name} (${prospect.age}, ${tn(prospect.teamId)}): potential ${prospect.potential}`);
  const tall = P.slice().sort((a, b) => b.heightIn - a.heightIn)[0];
  out.push(`${tall.name} is the league's tallest player at ${fmtHeight(tall.heightIn)}`);
  const rich = T.slice().sort((a, b) => b.payroll - a.payroll)[0];
  out.push(`${tn(rich.id)} carry the biggest payroll at $${rich.payroll.toFixed(1)}M against a $${l.cap.salaryCap}M cap`);
  const shooter = P.slice().sort((a, b) => b.ratings.thr - a.ratings.thr)[0];
  out.push(`${shooter.name} owns the best three-point rating in the league (${shooter.ratings.thr})`);
  const vet = P.slice().sort((a, b) => b.age - a.age)[0];
  out.push(`${vet.name} is the oldest player on a roster at ${vet.age}`);
  return out;
}
