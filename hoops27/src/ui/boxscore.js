// Box scores, shot-chart heat maps and game-flow graph (canvas). Used at quarter breaks, in the pause menu and post-game.
import { h, clear } from './dom.js';
import { COURT, COLORS } from '../tuning.js';
import { HALF_L, HALF_W } from '../physics/world.js';

export const gameScore = (s) => s.pts + 0.4 * s.fgm - 0.7 * (s.fga - s.fgm) - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * (s.reb - s.oreb) + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.to;
export function findMvp(game, winner) {
  let best = null, bs = -99;
  game.teams.forEach((t, ti) => t.players.forEach((p) => { const s = gameScore(p.stats) + (ti === winner ? 4 : 0); if (s > bs) { bs = s; best = { p, team: ti, score: s }; } }));
  return best;
}
const pct = (m, a) => (a ? `${Math.round((m / a) * 100)}%` : '–');
export function boxTable(game, ti, mvpId) {
  const t = game.teams[ti]; const rows = [...t.players].sort((a, b) => b.stats.min - a.stats.min);
  const tot = { min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 };
  const tr = (p) => { const s = p.stats; for (const k in tot) tot[k] += s[k]; return h('tr', { class: p.id === mvpId ? 'mvp' : '' }, h('td', {}, `#${p.number} ${p.name}`, h('span', { class: 'dim' }, ` ${p.data.pos}`)), h('td', {}, Math.round(s.min / 60)), h('td', {}, s.pts), h('td', {}, `${s.fgm}-${s.fga}`), h('td', {}, `${s.tpm}-${s.tpa}`), h('td', {}, `${s.ftm}-${s.fta}`), h('td', {}, s.reb), h('td', {}, s.ast), h('td', {}, s.stl), h('td', {}, s.blk), h('td', {}, s.to), h('td', {}, s.pf + (p.fouledOut ? '*' : '')), h('td', { class: s.pm > 0 ? 'li' : s.pm < 0 ? 'dg' : '' }, (s.pm > 0 ? '+' : '') + s.pm)); };
  const body = rows.map(tr);
  return h('div', {}, h('div', { class: 'display', style: { color: t.data.colors.primary, margin: '6px 0', fontSize: '14px' } }, `${t.data.city} ${t.data.name}`),
    h('table', { class: 'box' }, h('thead', {}, h('tr', {}, ['Player', 'MIN', 'PTS', 'FG', '3P', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-'].map((c) => h('th', {}, c)))), h('tbody', {}, body, h('tr', { class: 'tot' }, h('td', {}, 'Team'), h('td', {}, ''), h('td', {}, tot.pts), h('td', {}, `${tot.fgm}-${tot.fga} ${pct(tot.fgm, tot.fga)}`), h('td', {}, `${tot.tpm}-${tot.tpa}`), h('td', {}, `${tot.ftm}-${tot.fta}`), h('td', {}, tot.reb), h('td', {}, tot.ast), h('td', {}, tot.stl), h('td', {}, tot.blk), h('td', {}, tot.to), h('td', {}, tot.pf), h('td', {}, '')))));
}
/** Half-court heat map: bins every attempt (mirrored to one basket) and shades by volume and FG%. */
export function shotChart(game, teamIdx) {
  const W = 520, H = 280, c = h('canvas', { width: W, height: H, style: { width: '100%', maxWidth: `${W}px`, background: 'rgba(0,0,0,.35)' } }); const g = c.getContext('2d');
  const sx = (d) => (d / 14.325) * (W - 20) + 10, sz = (z) => ((z + HALF_W) / (2 * HALF_W)) * (H - 20) + 10; // d = metres from baseline toward half-court
  g.strokeStyle = 'rgba(0,240,255,.5)'; g.lineWidth = 1.5; g.strokeRect(10, 10, W - 20, H - 20);
  const rimD = 1.575, ftD = 1.194 + COURT.ftLine;
  g.strokeRect(sx(0), sz(-COURT.paintWidth / 2), sx(ftD) - sx(0), sz(COURT.paintWidth / 2) - sz(-COURT.paintWidth / 2));
  g.beginPath(); g.arc(sx(rimD), sz(0), (COURT.threeArc / 14.325) * (W - 20), -1.2, 1.2); g.stroke();
  g.beginPath(); g.moveTo(sx(0), sz(-6.71)); g.lineTo(sx(2.7), sz(-6.71)); g.moveTo(sx(0), sz(6.71)); g.lineTo(sx(2.7), sz(6.71)); g.stroke(); g.beginPath(); g.arc(sx(ftD), sz(0), 1.83 / 14.325 * (W - 20), -Math.PI / 2, Math.PI / 2); g.stroke();
  const bins = new Map(); const shots = game.shots.filter((s) => s.type !== 'ft' && (teamIdx === undefined || s.team === teamIdx));
  for (const s of shots) { const d = 14.325 - Math.abs(s.x) * 1; const z = s.z; const key = `${Math.floor(d / 1.6)},${Math.floor((z + 7.6) / 1.6)}`; const b = bins.get(key) ?? { n: 0, m: 0, d: Math.floor(d / 1.6) * 1.6 + 0.8, z: Math.floor((z + 7.6) / 1.6) * 1.6 - 7.6 + 0.8 }; b.n++; if (s.made) b.m++; bins.set(key, b); }
  const max = Math.max(1, ...[...bins.values()].map((b) => b.n));
  for (const b of bins.values()) { const p = b.m / b.n; const hue = p > 0.5 ? COLORS.lime : p > 0.35 ? COLORS.amber : COLORS.danger; g.globalAlpha = 0.18 + 0.5 * (b.n / max); g.fillStyle = hue; const r = 10 + 12 * (b.n / max); g.beginPath(); g.arc(sx(b.d), sz(b.z), r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  for (const s of shots) { const d = 14.325 - Math.abs(s.x); g.fillStyle = s.made ? COLORS.lime : COLORS.danger; g.globalAlpha = 0.9; g.beginPath(); g.arc(sx(d), sz(s.z), 2.4, 0, 7); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '10px Inter, sans-serif'; g.fillText(`${shots.filter((s) => s.made).length}/${shots.length} FG · circles: volume, colour: FG% (green ≥50, amber ≥35)`, 14, H - 14);
  return c;
}
export function flowGraph(game) {
  const W = 640, H = 220, c = h('canvas', { width: W, height: H, style: { width: '100%', maxWidth: `${W}px`, background: 'rgba(0,0,0,.35)' } }); const g = c.getContext('2d');
  const pts = game.flow; const tmax = Math.max(1, pts[pts.length - 1][0]); const dmax = Math.max(8, ...pts.map((p) => Math.abs(p[1]))) + 2;
  const X = (t) => 36 + (t / tmax) * (W - 50), Y = (d) => H / 2 - (d / dmax) * (H / 2 - 18);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(36, Y(0)); g.lineTo(W - 14, Y(0)); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '10px Inter, sans-serif'; g.fillText(`${game.teams[0].data.abbr} ahead`, 40, 14); g.fillText(`${game.teams[1].data.abbr} ahead`, 40, H - 6);
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, game.teams[0].data.colors.primary); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, game.teams[1].data.colors.primary);
  g.strokeStyle = grad; g.lineWidth = 2.5; g.beginPath(); let prev = pts[0]; g.moveTo(X(prev[0]), Y(prev[1])); for (const p of pts.slice(1)) { g.lineTo(X(p[0]), Y(prev[1])); g.lineTo(X(p[0]), Y(p[1])); prev = p; } g.lineTo(X(tmax), Y(prev[1])); g.stroke();
  g.strokeStyle = 'rgba(255,43,214,.45)'; g.setLineDash([3, 4]); let q = 1; for (const p of pts) if (p[2] > q) { q = p[2]; g.beginPath(); g.moveTo(X(p[0]), 10); g.lineTo(X(p[0]), H - 8); g.stroke(); } g.setLineDash([]);
  return c;
}
export function boxScoreView(game, { mvp } = {}) {
  const wrap = h('div', { class: 'col', style: { minWidth: 'min(860px, 88vw)' } }); const body = h('div', { class: 'scroll', style: { maxHeight: '58vh' } });
  const tabs = [['Box score', () => h('div', {}, boxTable(game, 0, mvp), boxTable(game, 1, mvp))], ['Shot chart', () => h('div', { class: 'row wrap' }, h('div', { style: { flex: 1, minWidth: '300px' } }, h('div', { class: 'display', style: { fontSize: '12px', color: game.teams[0].data.colors.primary } }, game.teams[0].data.abbr), shotChart(game, 0)), h('div', { style: { flex: 1, minWidth: '300px' } }, h('div', { class: 'display', style: { fontSize: '12px', color: game.teams[1].data.colors.primary } }, game.teams[1].data.abbr), shotChart(game, 1)))], ['Game flow', () => h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '8px' } }, 'Score margin over game time; dashed lines mark period breaks.'), flowGraph(game))]];
  const bar = h('div', { class: 'tabs' }); const show = (i) => { clear(body); body.append(tabs[i][1]()); [...bar.children].forEach((b, k) => b.classList.toggle('on', k === i)); };
  tabs.forEach(([n], i) => bar.append(h('div', { class: 'tab', onclick: () => show(i) }, n))); wrap.append(bar, body); show(0); return wrap;
}
