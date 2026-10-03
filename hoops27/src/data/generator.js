// Seeded generator: 16 fictional franchises x 10 players, 3 arenas, 12 shooting forms.
import { mulberry32, pick, range, irange, clamp } from '../engine/rng.js';
import { BADGES, badgeTier } from '../gameplay/badges.js';

export const ATTRS = ['inside', 'mid', 'three', 'ft', 'shotSpeed', 'ball', 'pass', 'perimD', 'interiorD', 'steal', 'block', 'reb', 'speed', 'accel', 'strength', 'vertical', 'stamina', 'iq'];
export const ATTR_LABEL = { inside: 'Inside scoring', mid: 'Mid-range', three: 'Three-point', ft: 'Free throw', shotSpeed: 'Shot speed', ball: 'Ball handling', pass: 'Passing', perimD: 'Perimeter D', interiorD: 'Interior D', steal: 'Steal', block: 'Block', reb: 'Rebounding', speed: 'Speed', accel: 'Acceleration', strength: 'Strength', vertical: 'Vertical', stamina: 'Stamina', iq: 'Basketball IQ' };

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_H = { PG: [1.83, 1.93], SG: [1.88, 1.98], SF: [1.95, 2.05], PF: [2.01, 2.11], C: [2.06, 2.18] };
// Position-weighted OVR weights.
const W = {
  PG: { ball: 3, pass: 3, three: 2, mid: 1.5, speed: 2, accel: 2, iq: 2, perimD: 1.5, steal: 1, ft: 1, shotSpeed: 1, stamina: 1 },
  SG: { three: 3, mid: 2.5, ball: 1.5, speed: 1.5, accel: 1.5, perimD: 1.5, ft: 1, shotSpeed: 1.5, inside: 1, iq: 1, stamina: 1, pass: 1 },
  SF: { three: 2, mid: 2, inside: 2, perimD: 2, speed: 1.5, vertical: 1.5, reb: 1, ball: 1, iq: 1.5, stamina: 1, strength: 1 },
  PF: { inside: 2.5, reb: 2.5, interiorD: 2, strength: 2, mid: 1.5, vertical: 1.5, block: 1, iq: 1, stamina: 1, three: 1 },
  C: { inside: 3, reb: 3, interiorD: 3, block: 2.5, strength: 2.5, vertical: 2, iq: 1, stamina: 1, ft: 0.5 },
};
export function ovrOf(attrs, pos) {
  const w = W[pos]; let s = 0, t = 0;
  for (const k in w) { s += attrs[k] * w[k]; t += w[k]; }
  return Math.round(s / t);
}

export const ARCHETYPES = {
  sharpshooter: { label: 'Sharpshooter', pos: ['SG', 'SF', 'PG'], bias: { three: 16, mid: 8, ft: 8, shotSpeed: 10, inside: -8, strength: -6, block: -10, interiorD: -8, reb: -8 }, strength: 'Spot-up threes, catch-and-shoot bonus', weakness: 'Struggles when smothered; poor inside', plays: ['Pick-and-Pop', 'Motion', 'Horns'], tendency: { threeFreq: 0.5, drive: 0.1 } },
  slasher: { label: 'Slasher', pos: ['SG', 'SF', 'PG'], bias: { inside: 14, vertical: 12, speed: 8, accel: 10, three: -8, mid: -4, strength: 4 }, strength: 'Rim attacks, finishing through contact', weakness: 'Streaky from outside', plays: ['Isolation', 'Transition', 'Pick-and-Roll'], tendency: { threeFreq: 0.15, drive: 0.5 } },
  playmaker: { label: 'Playmaker', pos: ['PG', 'SG'], bias: { pass: 16, ball: 12, iq: 10, accel: 6, strength: -6, reb: -8, block: -10 }, strength: 'Passing, vision, assist boosts', weakness: 'Small; weak finisher over size', plays: ['Pick-and-Roll', 'Horns', 'Motion'], tendency: { threeFreq: 0.28, drive: 0.3, pass: 0.5 } },
  lockdown: { label: 'Lockdown defender', pos: ['SG', 'SF', 'PG'], bias: { perimD: 18, steal: 16, speed: 6, accel: 6, iq: 4, three: -6, inside: -4, ball: -4 }, strength: 'Contests, steals, switchability', weakness: 'Limited shot creation', plays: ['Transition', 'Motion', 'Switch Everything'], tendency: { threeFreq: 0.25, drive: 0.15 } },
  rimProtector: { label: 'Rim protector', pos: ['C', 'PF'], bias: { block: 18, interiorD: 18, reb: 8, vertical: 6, strength: 6, three: -14, mid: -8, ball: -12, speed: -6 }, strength: 'Blocks, paint presence', weakness: 'No range; slow in space', plays: ['Pick-and-Roll', 'Post Split', 'Drop Coverage'], tendency: { threeFreq: 0.0, drive: 0.05 } },
  glassCleaner: { label: 'Glass cleaner', pos: ['PF', 'C'], bias: { reb: 20, strength: 10, interiorD: 6, vertical: 4, three: -10, ball: -10, speed: -6 }, strength: 'Rebounds, box-outs', weakness: 'Limited offence', plays: ['Post Split', 'Horns'], tendency: { threeFreq: 0.02, drive: 0.1 } },
  postScorer: { label: 'Post scorer', pos: ['C', 'PF'], bias: { inside: 14, mid: 8, strength: 12, ft: 4, three: -12, speed: -8, accel: -6 }, strength: 'Back-down, hooks, fadeaways', weakness: 'Slow; poor in transition', plays: ['Post Split', 'Isolation'], tendency: { threeFreq: 0.03, drive: 0.1, post: 0.6 } },
  twoWayWing: { label: 'Two-way wing', pos: ['SF', 'SG', 'PF'], bias: { perimD: 8, three: 4, mid: 4, inside: 4, speed: 3 }, strength: 'Balanced on both ends', weakness: 'No elite skill', plays: ['Motion', 'Transition'], tendency: { threeFreq: 0.3, drive: 0.25 } },
  stretchBig: { label: 'Stretch big', pos: ['PF', 'C'], bias: { three: 14, mid: 10, ft: 6, shotSpeed: 6, reb: 2, interiorD: -4, block: -4, speed: -4 }, strength: 'Pick-and-pop spacing', weakness: 'Less physical inside', plays: ['Pick-and-Pop', 'Horns'], tendency: { threeFreq: 0.4, drive: 0.05 } },
  floorGeneral: { label: 'Floor general', pos: ['PG'], bias: { iq: 18, pass: 12, ball: 10, three: 4, perimD: 2 }, strength: 'Play-calling bonus; boosts teammates', weakness: 'Average athlete', plays: ['Horns', 'Pick-and-Roll', 'Motion'], tendency: { threeFreq: 0.3, drive: 0.25, pass: 0.5 } },
};

export const FORMS = [
  ['Classic', 2.35, 1.0, 0], ['Quick draw', 2.2, 0.92, -4], ['High arc', 2.6, 1.06, 4], ['Set shot', 2.3, 1.04, 6], ['Sling', 2.1, 0.95, -6], ['Lefty flick', 2.4, 0.98, 2],
  ['Textbook', 2.45, 1.0, 8], ['Slow pour', 2.5, 1.1, 10], ['One motion', 2.3, 0.9, -2], ['Fadeway lean', 2.35, 1.0, 0], ['Tall release', 2.7, 1.05, 3], ['Hitch', 2.25, 1.08, -8],
].map(([name, rel, speed, bonus], id) => ({ id, name, releaseHeight: rel, speed, windowBonusMs: bonus }));

const FIRST = ['Kairo', 'Zane', 'Ryo', 'Dax', 'Mikah', 'Tavian', 'Jules', 'Orion', 'Nico', 'Sol', 'Kade', 'Remy', 'Eli', 'Arlo', 'Vance', 'Idris', 'Malik', 'Theo', 'Juno', 'Cass', 'Lex', 'Niko', 'Pax', 'Rune', 'Axel', 'Blaze', 'Cyrus', 'Dario', 'Enzo', 'Finn', 'Gideon', 'Hiro', 'Ivo', 'Jax', 'Koa', 'Luca', 'Milo', 'Nash', 'Otis', 'Quill'];
const LAST = ['Voss', 'Okafor', 'Reyes', 'Tanaka', 'Moreau', 'Lindqvist', 'Adeyemi', 'Castellan', 'Brandt', 'Ito', 'Navarro', 'Kovacs', 'Delacroix', 'Mbeki', 'Sorensen', 'Park', 'Valdez', 'Hartmann', 'Ibarra', 'Quinn', 'Rao', 'Strand', 'Torres', 'Ueda', 'Volkov', 'Wells', 'Yilmaz', 'Zhou', 'Abara', 'Bishop', 'Crane', 'Dunmore'];

const TEAMS = [
  ['Neon City', 'Voltage', 'NCV', '#00F0FF', '#0B0F1E', 'Pace & Space'], ['Harbor Bay', 'Krakens', 'HBK', '#2B7BFF', '#E6F1FF', 'Grit & Grind'],
  ['Solaris', 'Flare', 'SOL', '#FFB000', '#2A0F00', 'Iso Heavy'], ['Vector', 'Drift', 'VEC', '#FF2BD6', '#12041A', 'Pick-and-Roll Machine'],
  ['Atlas Heights', 'Titans', 'ATL', '#B6FF00', '#0D1A00', 'Grit & Grind'], ['Cobalt Coast', 'Sentinels', 'CCS', '#3355FF', '#CCD6FF', 'Pace & Space'],
  ['Ember Ridge', 'Wolves', 'ERW', '#FF3355', '#1A0508', 'Iso Heavy'], ['Quantum Falls', 'Pulse', 'QFP', '#9B5CFF', '#F0E6FF', 'Pick-and-Roll Machine'],
  ['Iron Delta', 'Foundry', 'IDF', '#C0C7D4', '#20242E', 'Grit & Grind'], ['Lumen Park', 'Comets', 'LPC', '#FFE14D', '#241C00', 'Pace & Space'],
  ['Obsidian', 'Reign', 'OBR', '#FF6A00', '#0A0A0A', 'Iso Heavy'], ['Aether', 'Gliders', 'AET', '#4DFFB8', '#032017', 'Pace & Space'],
  ['Crimson Arc', 'Vanguard', 'CAV', '#E5173F', '#FFE3E8', 'Pick-and-Roll Machine'], ['Tidal Prime', 'Surge', 'TPS', '#00B8FF', '#001B2E', 'Pace & Space'],
  ['Summit Peak', 'Yetis', 'SPY', '#E8F7FF', '#12324A', 'Grit & Grind'], ['Zenith', 'Orbit', 'ZEN', '#FF8AE6', '#2A0A27', 'Iso Heavy'],
];
const STYLE_TEND = {
  'Pace & Space': { pace: 0.8, threeFreq: 0.7, pressure: 0.5, help: 0.4, plays: ['Motion', 'Transition', 'Pick-and-Pop'] },
  'Grit & Grind': { pace: 0.3, threeFreq: 0.25, pressure: 0.7, help: 0.7, plays: ['Post Split', 'Horns', 'Pick-and-Roll'] },
  'Iso Heavy': { pace: 0.5, threeFreq: 0.45, pressure: 0.5, help: 0.45, plays: ['Isolation', 'Isolation', 'Transition'] },
  'Pick-and-Roll Machine': { pace: 0.55, threeFreq: 0.5, pressure: 0.55, help: 0.55, plays: ['Pick-and-Roll', 'Pick-and-Roll', 'Horns'] },
};

export const ARENAS = [
  { id: 'helix', name: 'Helix Dome', accent: '#00F0FF', accent2: '#FF2BD6', floorTint: '#0a1a2e', crowdDensity: 1.0 },
  { id: 'prism', name: 'Prism Garden', accent: '#FF2BD6', accent2: '#FFB000', floorTint: '#1a0a24', crowdDensity: 0.9 },
  { id: 'apex', name: 'Apex Forum', accent: '#B6FF00', accent2: '#00F0FF', floorTint: '#0c1a10', crowdDensity: 1.1 },
];

function genPlayer(rng, teamId, idx, pos, tier, usedNums, usedArch) {
  const eligible = Object.keys(ARCHETYPES).filter((k) => ARCHETYPES[k].pos.includes(pos));
  const fresh = eligible.filter((k) => !usedArch.has(k)); // keep each rotation varied: avoid repeating an archetype until exhausted
  const arch = pick(rng, fresh.length ? fresh : eligible); usedArch.add(arch);
  const A = ARCHETYPES[arch];
  const heightM = +range(rng, ...POS_H[pos]).toFixed(2);
  const hs = (heightM - 1.83) / 0.35; // 0 guard .. 1 big
  const base = tier; // team quality + depth
  const attrs = {};
  for (const k of ATTRS) {
    let v = base + range(rng, -8, 8) + (A.bias[k] ?? 0);
    if (k === 'speed' || k === 'accel') v -= hs * 14;
    if (k === 'strength' || k === 'reb' || k === 'block' || k === 'interiorD') v += hs * 10 - 4;
    if (k === 'three' || k === 'ball' || k === 'pass') v -= hs * 8 - 3;
    attrs[k] = Math.round(clamp(v, 25, 99));
  }
  // derived keys used by badges
  const d = { ...attrs, perimD: attrs.perimD, dunk: Math.round(attrs.inside * 0.4 + attrs.vertical * 0.6), shotRating: Math.round((attrs.three + attrs.mid + attrs.ft) / 3) };
  const badges = [];
  for (const key in BADGES) { const t = badgeTier(key, d); if (t >= 0) badges.push({ key, tier: t }); }
  badges.sort((a, b) => b.tier - a.tier); badges.length = Math.min(badges.length, 5);
  let number; do { number = irange(rng, 0, 99); } while (usedNums.has(number)); usedNums.add(number);
  const name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  return {
    id: `${teamId}-${idx}`, name, number, pos, heightM, weightKg: Math.round(78 + hs * 32 + range(rng, -4, 6)), wingspanM: +(heightM + range(rng, 0.04, 0.16)).toFixed(2),
    archetype: arch, attrs, ovr: ovrOf(attrs, pos), badges, form: FORMS[irange(rng, 0, 11)], teamId,
  };
}

function logoSvg(rng, abbr, c1, c2) {
  const shape = irange(rng, 0, 3), rot = irange(rng, 0, 3) * 15;
  const poly = [`50,6 92,28 92,72 50,94 8,72 8,28`, `50,6 94,50 50,94 6,50`, `8,10 92,10 92,60 50,94 8,60`, `50,4 96,38 78,94 22,94 4,38`][shape];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g${abbr}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><polygon points="${poly}" fill="url(#g${abbr})" stroke="${c1}" stroke-width="3" transform="rotate(${rot} 50 50)" opacity="0.95"/><polygon points="${poly}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" transform="rotate(${rot} 50 50) scale(.8) translate(12.5 12.5)"/><text x="50" y="58" text-anchor="middle" font-family="Orbitron,sans-serif" font-weight="800" font-size="24" fill="#05060D">${abbr[0]}${abbr[1]}</text></svg>`;
}

export function generateLeague(seed = 2027) {
  const rng = mulberry32(seed);
  const teams = TEAMS.map(([city, name, abbr, c1, c2, style], ti) => {
    const id = abbr.toLowerCase();
    const quality = 66 + Math.round(range(rng, 0, 12)) + (ti % 4);
    const used = new Set(), usedArch = new Set();
    const poss = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C'];
    const roster = poss.map((pos, i) => genPlayer(rng, id, i, pos, quality - (i >= 5 ? 9 : i === 0 ? -4 : 0) + range(rng, -2, 4), used, usedArch));
    roster.sort((a, b) => b.ovr - a.ovr);
    // starters: best at each position first
    const starters = []; const rest = [...roster];
    for (const pos of POSITIONS) { const c = rest.find((p) => p.pos === pos); if (c) { starters.push(c); rest.splice(rest.indexOf(c), 1); } }
    const ordered = [...starters, ...rest];
    const top = [...roster].slice(0, 8);
    const avg = (arr, keys) => Math.round(arr.reduce((s, p) => s + keys.reduce((a, k) => a + p.attrs[k], 0) / keys.length, 0) / arr.length);
    const st = STYLE_TEND[style];
    return {
      id, city, name, abbr, colors: { primary: c1, secondary: c2 }, style, arenaId: ARENAS[ti % 3].id, roster: ordered,
      ratings: { ovr: Math.round(top.reduce((s, p) => s + p.ovr, 0) / top.length), off: avg(top, ['inside', 'mid', 'three', 'ball', 'pass']), def: avg(top, ['perimD', 'interiorD', 'steal', 'block', 'reb']), ath: avg(top, ['speed', 'accel', 'strength', 'vertical', 'stamina']) },
      logoSvg: logoSvg(rng, abbr, c1, c2), tendencies: { pace: st.pace, threeFreq: st.threeFreq, pressure: st.pressure, help: st.help }, preferredPlays: st.plays,
    };
  });
  return { teams, arenas: ARENAS, forms: FORMS };
}

const TAG_A = ['Nova', 'Zero', 'Echo', 'Pixel', 'Glitch', 'Cipher', 'Vortex', 'Hyper', 'Ghost', 'Turbo', 'Apex', 'Rogue', 'Lumen', 'Kilo', 'Blitz', 'Onyx', 'Flux', 'Drift'];
const TAG_B = ['Hoops', 'Splash', 'Drip', 'Dunkz', 'Cash', 'Fade', 'Clutch', 'Ankles', 'Bucket', 'Handle', 'Swish', 'Rim', 'Dimes', 'Glass'];
export const gamertag = (rng) => `${pick(rng, TAG_A)}${pick(rng, TAG_B)}${irange(rng, 1, 99)}`;
export const BADGE_ICONS = ['◆', '▲', '●', '■', '✦', '⬢'];
