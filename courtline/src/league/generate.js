// League generator. Pure functions with no DOM access, so it can run in a Web Worker.
// leagueSteps() is a generator: it yields progress and returns the league, so callers can run it in a worker or one chunk per frame.
import { mulberry32, pick, gauss, shuffle, clamp, hsl2hex, shade } from '../core/util.js';
import * as N from './names.js';

export const RATING_KEYS = ['spd', 'str', 'vert', 'hnd', 'pas', 'ins', 'mid', 'thr', 'ft', 'fin', 'pst', 'pd', 'id', 'stl', 'blk', 'reb', 'sta', 'iq'];
export const RATING_LABEL = {
  spd: 'Speed', str: 'Strength', vert: 'Vertical', hnd: 'Ball handling', pas: 'Passing', ins: 'Inside shooting', mid: 'Mid-range', thr: 'Three-point',
  ft: 'Free throw', fin: 'Finishing', pst: 'Post game', pd: 'Perimeter defense', id: 'Interior defense', stl: 'Steals', blk: 'Blocks', reb: 'Rebounding', sta: 'Stamina', iq: 'Basketball IQ',
};
const BIAS = {
  PG: [8, -12, -3, 12, 12, -4, 1, 3, 3, -2, -22, 4, -18, 6, -22, -20, 3, 4],
  SG: [5, -8, 1, 4, -1, -1, 4, 6, 3, 1, -18, 4, -14, 3, -16, -14, 2, -1],
  SF: [2, -2, 3, -3, -4, 2, 1, 1, 0, 3, -8, 2, -4, 1, -6, -6, 1, -1],
  PF: [-4, 6, 2, -12, -9, 6, -3, -8, -5, 4, 4, -3, 6, -3, 4, 6, -2, -1],
  C: [-10, 12, 2, -20, -14, 8, -12, -20, -10, 5, 8, -8, 12, -6, 12, 14, -4, 0],
};
// archetype tweaks, same order as RATING_KEYS
const ARCH = {
  Playmaker: [2, -2, 0, 4, 8, -2, 0, 0, 2, -2, -4, 2, -4, 3, 0, -4, 2, 5],
  Sharpshooter: [0, -3, -2, 0, -2, -2, 6, 10, 6, -4, -6, 0, -2, 0, -2, -4, 2, 2],
  Slasher: [5, 2, 6, 3, 0, 4, -2, -6, -3, 9, -2, 0, -2, 2, 0, -2, 3, -2],
  'Two-way guard': [2, 2, 2, 0, -2, 0, 0, 2, 0, 0, -2, 7, 0, 5, 0, -2, 3, 3],
  'Two-way wing': [2, 2, 3, -2, -2, 0, 0, 2, 0, 0, -2, 7, 3, 4, 3, 0, 3, 3],
  'Stretch big': [0, -4, -2, 2, 0, -4, 4, 12, 4, -6, -8, -2, -2, 0, 0, -2, 0, 2],
  Bruiser: [-2, 6, 0, -2, -2, 4, -4, -8, -4, 3, 6, 0, 4, 0, 2, 4, 0, -2],
  'Glass cleaner': [-2, 4, 3, -4, 0, 0, -4, -6, -2, 3, 0, 0, 3, 0, 2, 10, 2, 2],
  'Rim protector': [-2, 4, 5, -4, -2, -2, -6, -10, -4, 0, -4, 0, 8, 0, 10, 4, 0, 3],
  'Post scorer': [-2, 4, 0, -2, 2, 6, 0, -6, 0, 3, 12, -2, 2, -2, 2, 3, 0, 2],
};
const OVR_W = {
  PG: { hnd: 14, pas: 13, spd: 9, thr: 10, mid: 6, ins: 3, fin: 6, pd: 8, stl: 5, iq: 9, sta: 4, ft: 4, vert: 3, str: 2, id: 1, reb: 1, pst: 2, blk: 0 },
  SG: { hnd: 8, pas: 5, spd: 9, thr: 13, mid: 9, ins: 4, fin: 8, pd: 9, stl: 5, iq: 7, sta: 4, ft: 5, vert: 4, str: 2, id: 1, reb: 2, pst: 1, blk: 1 },
  SF: { hnd: 5, pas: 4, spd: 7, thr: 9, mid: 8, ins: 6, fin: 9, pd: 8, stl: 4, iq: 7, sta: 4, ft: 4, vert: 6, str: 5, id: 4, reb: 5, pst: 2, blk: 3 },
  PF: { hnd: 2, pas: 3, spd: 4, thr: 5, mid: 6, ins: 9, fin: 10, pd: 4, stl: 3, iq: 7, sta: 4, ft: 3, vert: 6, str: 9, id: 9, reb: 10, pst: 6, blk: 6 },
  C: { hnd: 1, pas: 2, spd: 3, thr: 2, mid: 3, ins: 10, fin: 11, pd: 2, stl: 2, iq: 7, sta: 4, ft: 2, vert: 7, str: 10, id: 12, reb: 12, pst: 8, blk: 10 },
};
const W = {};
for (const p in OVR_W) { const sum = Object.values(OVR_W[p]).reduce((a, b) => a + b, 0); W[p] = RATING_KEYS.map((k) => (OVR_W[p][k] || 0) / sum); }

export function overall(r, pos) {
  let s = 0;
  const w = W[pos];
  for (let i = 0; i < RATING_KEYS.length; i++) s += r[RATING_KEYS[i]] * w[i];
  return Math.round(s);
}

// Talent curve: rank quantile -> overall. Gives ~5 superstars, ~30 stars, ~90 good starters, then role players and bench.
const CURVE = [[0, 96], [0.011, 90], [0.067, 82], [0.2, 74], [0.45, 67], [0.75, 58], [1, 47]];
function quantile(u) {
  for (let i = 1; i < CURVE.length; i++) if (u <= CURVE[i][0]) {
    const [u0, v0] = CURVE[i - 1], [u1, v1] = CURVE[i];
    return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0);
  }
  return CURVE[CURVE.length - 1][1];
}

const HT = { PG: [75, 2.2], SG: [77, 2], SF: [79, 1.8], PF: [81, 1.8], C: [83.5, 1.8] };
const WT = { PG: 190, SG: 200, SF: 215, PF: 235, C: 252 };

function salaryFor(ovr, age) {
  const s = 1.1 + Math.pow(Math.max(0, ovr - 45) / 50, 2.4) * 50;
  return Math.round((age <= 22 ? s * 0.6 : s) * 10) / 10;
}

function makeName(rng, used) {
  for (let t = 0; t < 40; t++) {
    const first = pick(rng, N.FIRST), last = pick(rng, N.SUR_A) + pick(rng, N.SUR_B);
    const full = first + ' ' + last;
    if (!used.has(full)) { used.add(full); return { first, last, name: full }; }
  }
  const first = pick(rng, N.FIRST), last = pick(rng, N.SUR_A) + pick(rng, N.SUR_B) + 'x';
  return { first, last, name: first + ' ' + last };
}

function makePlayer(rng, id, pos, target, teamId, used, jerseys) {
  const arch = pick(rng, N.ARCHETYPES[pos]);
  const age = Math.round(clamp(26.3 + gauss(rng) * 3.8 - (target < 56 ? -0.4 : 0), 19, 38));
  const r = {};
  const b = BIAS[pos], a = ARCH[arch];
  RATING_KEYS.forEach((k, i) => { r[k] = clamp(Math.round(target + (b[i] + a[i]) * 0.85 + gauss(rng) * 4.2), 25, 99); });
  // Pull the weighted overall onto the target by shifting every rating, keeping the shape of the player.
  for (let pass = 0; pass < 4; pass++) {
    const diff = target - overall(r, pos);
    if (diff === 0) break;
    for (const k of RATING_KEYS) r[k] = clamp(r[k] + diff, 25, 99);
  }
  const ovr = overall(r, pos);
  const [hm, hs] = HT[pos];
  const heightIn = Math.round(clamp(hm + gauss(rng) * hs, 68, 90));
  const wingIn = Math.round(clamp(heightIn + gauss(rng) * 2.2 + 4.5, heightIn - 1, heightIn + 10));
  const weightLb = Math.round(clamp(WT[pos] + (heightIn - hm) * 5 + gauss(rng) * 12, 165, 300));
  // taller players: slightly lower speed, higher block/reb potential already in position bias; tie physicals to height softly
  r.spd = clamp(r.spd - Math.max(0, heightIn - 84) * 1.2, 25, 99);
  let potential = ovr;
  if (age <= 24) potential = ovr + Math.max(0, Math.round(gauss(rng) * 3 + 9 - (age - 19) * 1.5));
  else if (age <= 28) potential = ovr + (rng() < 0.4 ? Math.round(rng() * 3) : 0);
  potential = clamp(potential, ovr, 99);
  const years = age <= 22 ? 2 + ((rng() * 3) | 0) : 1 + ((rng() * 5) | 0);
  const raw = { rim: r.fin + (pos === 'C' || pos === 'PF' ? 6 : 0), mid: r.mid, three: r.thr * 1.1, post: r.pst * (pos === 'C' || pos === 'PF' ? 1 : 0.45) };
  const tot = raw.rim + raw.mid + raw.three + raw.post;
  const sh = (v) => Math.round((v / tot) * 100);
  const j = (lo) => clamp(Math.round(lo + gauss(rng) * 8), 5, 99);
  let num;
  do { num = (rng() * 100) | 0; } while (jerseys.has(num));
  jerseys.add(num);
  const nm = makeName(rng, used);
  return {
    id, teamId, ...nm, age, pos, arch, num, heightIn, wingIn, weightLb, ovr, potential,
    contract: { salary: salaryFor(ovr, age), years },
    personality: pick(rng, N.PERSONALITY),
    tendencies: {
      shotMix: { rim: sh(raw.rim), mid: sh(raw.mid), three: sh(raw.three), post: sh(raw.post) },
      passFirst: j(r.pas * 0.7 + r.iq * 0.2 - 20), drive: j(r.spd * 0.5 + r.hnd * 0.4 - 20), iso: j(r.hnd * 0.5 + ovr * 0.2 - 10),
      offBall: j(r.iq * 0.8 - 10), crashBoards: j(r.reb * 0.9 - 15), gamble: j(r.stl * 0.8 - 10), helpD: j(r.iq * 0.8 - 12), foulProne: j(75 - r.iq * 0.6),
    },
    ratings: r,
    appearance: { skin: pick(rng, N.SKIN), hair: pick(rng, N.HAIR_COLOR), hairStyle: pick(rng, N.HAIR_STYLE), accessory: pick(rng, N.ACCESSORY) },
    injury: null, fatigue: 0, stats: { gp: 0, pts: 0, reb: 0, ast: 0 },
  };
}

function makeTeams(rng) {
  const used = new Set();
  const logoCombos = [];
  for (const s of N.SHAPES) for (const e of N.EMBLEMS) logoCombos.push([s, e]);
  shuffle(rng, logoCombos);
  return N.TEAMS.map(([city, name, abbr, conf, div], i) => {
    const hue = (i * 137.508 + rng() * 14) % 360;
    const primary = hsl2hex(hue, 0.6 + rng() * 0.2, 0.34 + rng() * 0.1);
    const mode = rng();
    const secondary = mode < 0.4 ? 0xf4f1e8 : mode < 0.7 ? hsl2hex(hue + 180, 0.7, 0.55) : hsl2hex(hue + 40, 0.85, 0.58);
    const accent = hsl2hex(hue + (rng() < 0.5 ? 30 : -30), 0.75, 0.62);
    const [shape, emblem] = logoCombos[i];
    const pattern = pick(rng, N.PATTERNS);
    const colors = { primary, secondary, accent };
    const arenaName = rng() < 0.6 ? `${pick(rng, N.SPONSORS)} ${pick(rng, N.VENUE)}` : `${city.split(' ')[0]} ${pick(rng, N.VENUE)}`;
    return {
      id: i, city, name, abbr, conf, div: N.DIVISIONS[div], divIndex: div, colors,
      logo: { shape, emblem },
      uniforms: {
        home: { base: 0xf6f4ee, trim: primary, number: primary, pattern },
        away: { base: primary, trim: secondary, number: 0xffffff, pattern },
        alt: { base: shade(primary, 0.38), trim: accent, number: accent, pattern: pick(rng, N.PATTERNS) },
      },
      arena: {
        name: arenaName, capacity: 17000 + ((rng() * 4200) | 0) + (rng() < 0.2 ? 1500 : 0),
        floor: pick(rng, [0xd9b27a, 0xc9985c, 0xe4c28f, 0xb88346]), paint: rng() < 0.7 ? primary : shade(secondary, 0.8), seat: shade(primary, 0.55), lights: rng() < 0.5 ? 'warm' : 'cool',
      },
      roster: [], payroll: 0, rating: { ovr: 0, off: 0, def: 0 }, record: { w: 0, l: 0 },
    };
  });
}

function rateTeam(team, players) {
  const ps = team.roster.map((i) => players[i]).sort((a, b) => b.ovr - a.ovr);
  const wt = [0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04];
  let ovr = 0, off = 0, def = 0;
  ps.slice(0, 10).forEach((p, i) => {
    ovr += p.ovr * wt[i];
    const r = p.ratings;
    off += ((r.thr + r.mid + r.fin + r.pas + r.hnd) / 5) * wt[i];
    def += ((r.pd + r.id + r.stl + r.blk + r.reb) / 5) * wt[i];
  });
  team.rating = { ovr: Math.round(ovr), off: Math.round(off), def: Math.round(def) };
  team.payroll = Math.round(ps.reduce((s, p) => s + p.contract.salary, 0) * 10) / 10;
}

export function* leagueSteps(seed) {
  const rng = mulberry32(seed);
  yield { p: 0.02, label: 'Founding franchises' };
  const teams = makeTeams(rng);
  yield { p: 0.08, label: 'Drawing logos and uniforms' };
  const pool = [];
  for (let i = 0; i < 450; i++) pool.push(Math.round(quantile(i / 449) + gauss(rng) * 0.8));
  pool.sort((a, b) => b - a);
  const per = teams.map(() => []);
  const luck = teams.map(() => gauss(rng)); // persistent franchise strength, so the league has contenders and rebuilders
  for (let round = 0; round < 15; round++) {
    const key = teams.map((t) => luck[t.id] * 1.1 + gauss(rng));
    const order = teams.map((t) => t.id).sort((a, b) => key[b] - key[a]);
    for (let k = 0; k < 30; k++) per[order[k]].push(pool[round * 30 + k]);
  }
  yield { p: 0.15, label: 'Running the talent pool' };
  const players = [], used = new Set();
  for (let ti = 0; ti < teams.length; ti++) {
    const t = teams[ti], targets = per[ti].sort((a, b) => b - a), jerseys = new Set();
    const slots = [];
    for (let g = 0; g < 3; g++) slots.push(...shuffle(rng, N.POSITIONS.slice()));
    for (let i = 0; i < 15; i++) {
      const p = makePlayer(rng, players.length, slots[i], targets[i], t.id, used, jerseys);
      players.push(p); t.roster.push(p.id);
    }
    rateTeam(t, players);
    yield { p: 0.15 + 0.82 * ((ti + 1) / teams.length), label: `Signing the ${t.city} ${t.name}` };
  }
  return {
    version: 1, seed, name: 'Courtline Pro League',
    season: { year: 1, label: 'Season 1', phase: 'preseason', day: 0 },
    cap: { salaryCap: 140, luxuryTax: 170, minPayroll: 100 },
    conferences: ['East', 'West'], divisions: N.DIVISIONS,
    teams, players,
  };
}

/** Synchronous convenience wrapper (used by tests and the worker). */
export function generateLeague(seed, onProgress) {
  const g = leagueSteps(seed);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (onProgress) onProgress(r.value);
  }
}
