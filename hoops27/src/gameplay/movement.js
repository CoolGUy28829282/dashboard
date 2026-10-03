// Player runtime state, attribute-derived physics and movement integration (spec §6.2).
import { MOVE } from '../tuning.js';
import { clamp, lerp } from '../engine/rng.js';
import { badgeValue } from './badges.js';
import { wrapAngle, clampCourt } from './court.js';

const n01 = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

export function createRuntimePlayer(data, team, slot) {
  const a = data.attrs;
  const p = {
    id: data.id, data, team, slot, name: data.name, number: data.number, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, y: 0, vy: 0, face: 0,
    stamina: 100, momentum: 0, hasBall: false, onCourt: false, fouls: 0, fouledOut: false, hot: 0, run: 0, // run: signed consecutive makes/misses
    height: data.heightM, radius: 0.3, state: 'idle', action: null, // action = { kind, t, dur } for rig animation
    cd: { move: 0, steal: 0, block: 0, turn: 0, pump: 0 }, recover: 0, stumble: 0, handsUp: 0, chargeUntil: 0, blockAt: -9, blockUntil: -9,
    ai: { t: Math.random() * 0.1, target: null, role: 'spot', wait: 0, utility: {}, spot: null, lastSwitch: 0 },
    dribbleHand: 1, dribblePh: 0, dribbling: false, stats: blankStats(), minutesSince: 0, catchTime: -9, paintTime: 0,
    topSpeed: lerp(MOVE.topSpeed[0], MOVE.topSpeed[1], n01(a.speed, 40, 99)), accel: lerp(MOVE.accel[0], MOVE.accel[1], n01(a.accel, 25, 99)),
    moveCooldown: lerp(MOVE.dribbleCooldown[0], MOVE.dribbleCooldown[1], n01(a.ball, 25, 99)),
    tiers: {},
  };
  for (const b of data.badges) p.tiers[b.key] = b.tier;
  return p;
}
export const blankStats = () => ({ min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, pm: 0 });

export const badge = (p, key, field) => badgeValue(key, p.tiers[key] ?? -1, field);
export const dunkRating = (p) => Math.round(p.data.attrs.inside * 0.4 + p.data.attrs.vertical * 0.6);
export const shotRatingOf = (p, type) => {
  const a = p.data.attrs;
  return type === 'three' ? a.three : type === 'midrange' || type === 'fadeaway' ? a.mid : type === 'ft' ? a.ft : type === 'dunk' ? dunkRating(p) : type === 'floater' ? (a.inside + a.mid) / 2 : a.inside;
};
export const reach = (p) => p.height * 1.31 + p.y; // standing reach plus jump
export const speedMul = (p) => 1 - MOVE.fatigueSpeedLoss * (1 - p.stamina / 100);

/** Integrate one logic tick of movement from an intent. */
export function movePlayer(p, intent, dt, opts = {}) {
  const i = intent ?? {};
  p.cd.move = Math.max(0, p.cd.move - dt); p.cd.turn = Math.max(0, p.cd.turn - dt);
  p.recover = Math.max(0, p.recover - dt); p.stumble = Math.max(0, p.stumble - dt);
  const frozen = p.recover > 0 && p.recoverFreeze;
  if (p.recover <= 0) p.recoverFreeze = false;
  let mx = i.mx ?? 0, mz = i.mz ?? 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const airborne = p.y > 0.02 || p.vy > 0;
  let max = p.topSpeed * speedMul(p) * (i.sprint && p.stamina > 4 ? 1 : 0.72);
  if (p.hasBall) max *= MOVE.carrySpeedMul;
  if (p.action && (p.action.kind === 'shoot' || p.action.kind === 'ft')) max *= p.action.hold ? 0.0 : 0.25;
  if (p.stumble > 0) max *= 0.4;
  if (i.handsUp) max *= 0.9;
  if (i.latBoost) max *= 1 + i.latBoost;
  if (frozen) max = 0;
  if (p.action?.kind === 'post') max *= 0.35;
  const ws = p.slowUntil !== undefined && p.slowUntil > opts.time ? 1 - 0.55 * (1 - badge(p, 'pickDodger', 'screenReduce')) : 1; // Pick Dodger shrinks screen slow-down
  max *= ws;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  // 180° direction change penalty while carrying the ball
  if (p.hasBall && ml > 0.3 && speed > 2.2 && p.cd.turn <= 0 && !p.action) {
    const dot = (p.vel.x * mx + p.vel.z * mz) / (speed * Math.max(ml, 1e-6));
    if (dot < -0.85) { p.cd.turn = MOVE.turnPenalty180; p.momentum = Math.max(0, p.momentum - 0.5); }
  }
  const locked = p.cd.turn > 0;
  const tx = locked ? 0 : mx * max, tz = locked ? 0 : mz * max;
  const a = (airborne ? p.accel * 0.15 : p.accel * (ml > 0.05 ? 1 : 1.3)) * dt;
  const dx = tx - p.vel.x, dz = tz - p.vel.z, dl = Math.hypot(dx, dz);
  if (dl > 0) { const s = Math.min(1, a / dl); p.vel.x += dx * s; p.vel.z += dz * s; }
  // momentum
  const sp = Math.hypot(p.vel.x, p.vel.z);
  if (i.sprint && sp > p.topSpeed * 0.75) p.momentum = Math.min(1, p.momentum + MOVE.momentumBuild * dt);
  else p.momentum = Math.max(0, p.momentum - (ml < 0.1 ? 1.2 : 0.3) * dt);
  if (sp > 0.5 && ml > 0.2) {
    const dir = (p.vel.x * mx + p.vel.z * mz) / (sp * Math.max(ml, 1e-6));
    if (dir < 0.5) p.momentum = Math.max(0, p.momentum - MOVE.momentumDrain * dt);
  }
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
  // facing
  const want = i.faceX !== undefined ? Math.atan2(i.faceZ, i.faceX) : sp > 0.6 ? Math.atan2(p.vel.z, p.vel.x) : p.face;
  const turnRate = (p.hasBall ? 9 : 12) * dt;
  p.face += clamp(wrapAngle(want - p.face), -turnRate, turnRate);
  // stamina
  const drain = (i.sprint && sp > 2 ? MOVE.sprintStaminaPerSec * (1 - badge(p, 'workhorse', 'staminaDrain')) * (1.25 - p.data.attrs.stamina / 200) : 0) + (p.action ? 1.5 : 0);
  if (opts.fatigue !== false) p.stamina = clamp(p.stamina + (drain > 0 ? -drain : sp < 1.2 ? MOVE.restStaminaPerSec * 0.5 : 0.8) * dt, 0, 100);
  p.handsUp = clamp(p.handsUp + ((i.handsUp || i.blockHeld ? 1 : -1) * 6 * dt), 0, 1);
  p.state = p.action ? p.action.kind : sp > 3.6 ? 'sprint' : sp > 0.7 ? 'run' : 'idle';
  if (!opts.noClamp) clampCourt(p.pos, 1.2);
}

/** Soft capsule-capsule separation with strength-based push (spec: strength affects collisions/screens/post fights). */
export function separate(players, dt) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      if (a.y > 0.4 || b.y > 0.4) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
      if (d < min && d > 1e-4) {
        const ov = min - d, nx = dx / d, nz = dz / d;
        const sa = a.data.attrs.strength + a.data.heightM * 4, sb = b.data.attrs.strength + b.data.heightM * 4;
        const wa = sb / (sa + sb), wb = sa / (sa + sb); // stronger player is pushed less
        a.pos.x -= nx * ov * wa; a.pos.z -= nz * ov * wa; b.pos.x += nx * ov * wb; b.pos.z += nz * ov * wb;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) { a.vel.x += nx * rel * 0.3 * wa * dt * 60 * 0.2; b.vel.x -= nx * rel * 0.3 * wb * dt * 60 * 0.2; }
      }
    }
  }
}
