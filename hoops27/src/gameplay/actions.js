// Player actions: shooting flow (spec §5), passing, steals, blocks, dribble moves, post-ups, rebounds.
import { SHOT, VARIANTS, AIRTIME, PASS, COURT, RULES, AI } from '../tuning.js';
import { rangeWindowScale, makeProbability, windowWidthMs, gradeOffset, meterDuration, missBias, gaussian, streakTier } from './shooting.js';
import { contestLevel, blockChance } from './contest.js';
import { foulProbability } from './foul.js';
import { clamp } from '../engine/rng.js';
import { hoopX, hoopDist, isThree, dist2, segDist, wrapAngle, ftSpot } from './court.js';
import { badge, shotRatingOf, dunkRating, reach } from './movement.js';
import { RIM_R, BALL_R, ballistic, arcTime } from '../physics/world.js';

const G = 9.81;
const rimOf = (side) => ({ x: hoopX(side), y: COURT.rimHeight, z: 0 });
/** Defensive pressure tiers: a defender in your face shrinks the green window and removes Perfect/Excellent entirely. */
export const PRESSURE = { contested: 0.45, smothered: 0.7 };
export const pressureLabel = (c) => (c >= PRESSURE.smothered ? 'SMOTHERED' : c >= PRESSURE.contested ? 'CONTESTED' : c >= 0.2 ? 'TIGHT' : 'OPEN');
/** Highest grade a release can earn under this much pressure. */
export function capGrade(grade, contest) {
  const rank = { wayoff: 0, late: 1, early: 1, good: 2, excellent: 3, perfect: 4 };
  const cap = contest >= PRESSURE.smothered ? 'good' : contest >= PRESSURE.contested ? 'excellent' : 'perfect';
  return rank[grade] > rank[cap] ? cap : grade;
}
const aiLevel = (g) => AI.levels[g.settings.difficulty] ?? AI.levels.allstar;

/** Defence / offence helpers */
export const opp = (g, p) => g.teams[1 - p.team];
export const attackSide = (g, team) => g.dirOf(team);

export function handPos(p, h = 1.0) {
  const side = p.dribbleHand;
  const f = { x: Math.cos(p.face), z: Math.sin(p.face) };
  return { x: p.pos.x + f.x * 0.42 - f.z * 0.22 * side, y: p.y + h, z: p.pos.z + f.z * 0.42 + f.x * 0.22 * side };
}

/* ------------------------------------------------------------------ shot selection */
export function chooseShot(g, p, intent) {
  const side = g.dirOf(p.team);
  const d = hoopDist(p.pos, side);
  const a = p.data.attrs;
  const sp = Math.hypot(p.vel.x, p.vel.z);
  const toRim = Math.atan2(-p.pos.z, hoopX(side) - p.pos.x);
  const facingRim = Math.abs(wrapAngle(p.face - toRim)) < 1.1;
  const nearest = nearestDefender(g, p);
  const pressed = nearest && dist2(nearest.pos, p.pos) < 1.4;
  const forceDunk = intent.dunkMod;
  let variant;
  if (g.phase === 'ft') variant = 'ft';
  else if (d < 2.6 && (forceDunk || (dunkRating(p) > 70 && a.vertical > 72 && (sp > 3.4 || d < 1.3) && (!pressed || a.vertical > 78) && d < 2.2 && !rimProtected(g, p, side)))) {
    variant = d < 1.3 && sp < 2 ? 'standdunk' : dunkRating(p) > 90 && Math.random() < 0.3 ? (Math.random() < 0.5 ? 'windmill' : 'tomahawk') : 'drivedunk';
  } else if (d < 2.4) variant = intent.putback ? 'putback' : sp > 4 ? ['euro', 'reverse', 'fingerroll', 'layup'][(Math.random() * 4) | 0] : 'layup';
  else if (d < 4.0 && sp > 3 && !isThree(p.pos, side)) variant = 'floater';
  else if (p.action?.kind === 'post' || (d < 4.5 && p.postTime > 0.5)) variant = pressed ? 'fadeaway' : p.data.archetype === 'postScorer' ? 'hook' : 'turnaround';
  else {
    const three = isThree(p.pos, side);
    const stepBack = p.lastMove?.type === 'stepback' && g.t - p.lastMove.t < 1.2;
    const catching = g.t - p.catchTime < 0.9;
    if (three) variant = stepBack ? 'stepback' : catching ? 'catchShoot3' : sp > 3 && Math.random() < 0.3 ? 'hopstep3' : 'pullup3';
    else variant = stepBack ? 'stepback2' : catching ? 'catchShoot' : pressed && facingRim && d > 3.5 && Math.random() < 0.4 ? 'fadeaway' : 'pullup';
  }
  return variant;
}

/** A defender planted between the ball and the rim takes away the dunk lane (needs space to elevate). */
export function rimProtected(g, p, side) {
  const rx = hoopX(side);
  for (const q of opp(g, p).court) { const dr = Math.hypot(q.pos.x - rx, q.pos.z); if (dr < 2.4 && dist2(q.pos, p.pos) < 2.0 && q.data.attrs.interiorD > 55) return true; }
  return false;
}
export function nearestDefender(g, p, maxD = 99) {
  let best = null, bd = maxD;
  for (const q of opp(g, p).court) { const d = dist2(q.pos, p.pos); if (d < bd) { bd = d; best = q; } }
  return best;
}

/* ------------------------------------------------------------------ shot commit / meter */
export function beginShot(g, p, intent) {
  if (!p.hasBall || p.action || g.phase === 'dead') return false;
  const variantKey = chooseShot(g, p, intent);
  const v = VARIANTS[variantKey];
  const side = g.dirOf(p.team);
  const a = p.data.attrs;
  const rating = shotRatingOf(p, v.type);
  const D = meterDuration(v.type, a.shotSpeed) * v.durMul * p.data.form.speed;
  const dist = hoopDist(p.pos, side);
  const sp = Math.hypot(p.vel.x, p.vel.z);
  const human = g.humans.find((h) => h.ctrl === p);
  const lv = aiLevel(g);
  const rimLike = v.type === 'layup' || v.type === 'dunk';
  const jumpH = (AIRTIME[v.type] ?? 0.35) * (v.type === 'dunk' ? 0.85 + a.vertical / 200 : 0.8 + a.vertical / 400) + (rimLike ? p.momentum * 0.1 : 0);
  // AI pre-samples a timing offset from a normal distribution (spec §8).
  p.ai.pressure = shooterContest(g, p, { type: v.type, variant: variantKey, side }).level;
  const sd = lv.timingSd * 1.3 * (AI.timingSdByType[v.type] ?? 1) * (1.35 - rating / 110) * (1 + 0.35 * (p.ai.pressure ?? 0));
  const offsetMs = human ? null : gaussian(Math.random, 0, sd);
  p.action = {
    kind: v.type === 'ft' ? 'ft' : v.type === 'dunk' ? 'dunk' : v.type === 'layup' ? 'layup' : 'shoot', t: 0, dur: D * 2, D, hold: v.type !== 'layup' && v.type !== 'dunk' && v.type !== 'floater',
    variant: variantKey, type: v.type, rating, jumpH, dist, startPos: { ...p.pos }, startSpeed: sp, offDribble: sp > 2.2 && p.dribbling, offBalance: (v.type === 'fadeaway' ? false : sp > 4.8) || p.stumble > 0,
    spaced: !(v.type === 'dunk' && rimProtected(g, p, side)), catchShoot: g.t - p.catchTime < 0.9 && sp < 3, released: false, plannedMs: offsetMs, human: !!human, side, momentum: p.momentum,
  };
  p.shotMeter = { t: 0, D, type: v.type, windowMs: 0 };
  p.dribbling = false;
  g.bus.emit('shotStart', { player: p, variant: variantKey, D, human: !!human });
  return true;
}

export function updateShotAction(g, p, dt, intent) {
  const a = p.action;
  if (!a || (a.kind !== 'shoot' && a.kind !== 'layup' && a.kind !== 'dunk' && a.kind !== 'ft')) return;
  a.t += dt;
  p.shotMeter.t = a.t;
  // jump arc: apex at t = D
  if (a.type !== 'ft') {
    const u = (a.t - a.D) / a.D;
    p.y = Math.max(0, a.jumpH * (1 - u * u));
    p.vy = -2 * a.jumpH * u / a.D;
    if (a.type === 'layup' || a.type === 'dunk' || a.type === 'floater') {
      // drive to the rim: finish within ~0.7m (dunk) / 1.1m (layup)
      const rim = rimOf(a.side), dx = rim.x - p.pos.x, dz = rim.z - p.pos.z, d = Math.hypot(dx, dz);
      const stop = a.type === 'dunk' ? 0.55 : a.type === 'layup' ? 1.0 : 2.2;
      const left = Math.max(0.05, a.D - a.t);
      const want = a.t < a.D ? clamp((d - stop) / left, 0, 7.5) : 0;
      p.vel.x += (dx / (d || 1) * want - p.vel.x) * Math.min(1, dt * 8); p.vel.z += (dz / (d || 1) * want - p.vel.z) * Math.min(1, dt * 8);
      p.face = Math.atan2(dz, dx);
    } else {
      p.vel.x *= 1 - Math.min(1, dt * (a.type === 'fadeaway' ? 1.5 : 3)); p.vel.z *= 1 - Math.min(1, dt * (a.type === 'fadeaway' ? 1.5 : 3));
      if (a.type === 'fadeaway') { p.vel.x += -Math.cos(p.face) * dt * 2; p.vel.z += -Math.sin(p.face) * dt * 2; }
    }
  } else { p.vel.x = 0; p.vel.z = 0; }
  // contest preview for the live HUD ring
  p.shotMeter.contest = shooterContest(g, p, a).level;
  p.shotMeter.windowMs = shotWindow(g, p, a, p.shotMeter.contest); p.shotMeter.pressure = pressureLabel(p.shotMeter.contest);
  if (!a.released) {
    let go = false;
    if (a.human) {
      if (intent.shootReleased || (!intent.shootHeld && a.t > 0.05 && !intent.shootPressed)) go = true;
      if (a.t >= a.D * 2 - 0.02) go = true;
    } else go = a.t >= Math.max(a.D * 0.35, a.D + a.plannedMs / 1000);
    if (go) releaseShot(g, p);
  }
  if (a.t >= a.dur) { p.action = null; p.y = 0; p.vy = 0; p.shotMeter = null; }
  else if (a.released && a.t >= a.D * 1.9) { p.action = null; p.y = 0; p.vy = 0; p.shotMeter = null; }
}

function shotWindow(g, p, a, contest) {
  const fatigue = g.settings.fatigue ? 1 - p.stamina / 100 : 0;
  const bonus = p.data.form.windowBonusMs + (p.perfectChain > 0 ? badge(p, 'greenMachine', 'windowMsAfterPerfect') : 0);
  // spec formula, then extra squeeze from defender pressure: nobody greens a shot with a hand in their face
  const w = windowWidthMs({ type: a.type, rating: a.rating, contest, fatigue, badgeBonus: bonus });
  if (a.type === 'ft') return w;
  const dist = Math.max(0, hoopDist(p.pos, a.side) - (a.type === 'three' || a.type === 'midrange' ? badge(p, 'limitless', 'idealRangeAdd') : 0)); // deep range is harder to green
  return Math.max(12, w * rangeWindowScale(dist) * (1 - 0.7 * contest * contest - 0.15 * contest));
}

/** Contest from the closest threatening defender at the release moment. */
export function shooterContest(g, p, a) {
  let best = 0, who = null;
  const side = a.side;
  const relH = p.y + (VARIANTS[a.variant]?.rel ?? 2.4) * (p.height / 2.0);
  const rim = a.type === 'layup' || a.type === 'dunk' || a.type === 'floater' || a.type === 'fadeaway';
  for (const d of opp(g, p).court) {
    const dd = dist2(d.pos, p.pos);
    if (dd > COURT.ballDiameter * 0 + 2.5) continue;
    const dir = Math.atan2(d.pos.z - p.pos.z, d.pos.x - p.pos.x);
    const infront = Math.cos(wrapAngle(dir - p.face));
    const toShooter = { x: p.pos.x - d.pos.x, z: p.pos.z - d.pos.z };
    const closing = Math.max(0, (d.vel.x * toShooter.x + d.vel.z * toShooter.z) / (dd || 1));
    const rating = rim ? d.data.attrs.interiorD + badge(d, 'intimidator', 'contestAdd') * 40 : d.data.attrs.perimD + badge(d, 'stopper', 'contestAdd') * 40;
    const handH = d.y + d.height * 1.15 + d.height * 0.22 * d.handsUp + (d.y > 0.1 ? 0.2 : 0);
    let c = contestLevel({ distance: Math.max(0.05, dd - 0.35), handHeight: handH, releaseHeight: relH, closingSpeed: closing, defRating: Math.min(99, rating), heightM: d.height });
    if (infront < -0.2) c *= 0.4; // defender behind the shooter can't truly contest
    if (d.recover > 0) c *= 0.5; // beaten off the dribble
    c *= 0.5 + 0.5 * (VARIANTS[a.variant]?.vuln ?? 1);
    c = clamp(c * (0.55 + 0.45 * Math.min(1.2, aiLevelFor(g, d).contest)), 0, 1);
    if (c > best) { best = c; who = d; }
  }
  void side;
  if (a.type !== 'ft' && (a.type === 'three' || a.type === 'midrange')) best *= 1 - badge(p, 'deadeye', 'contestReduce');
  return { level: a.type === 'ft' ? 0 : best, defender: who };
}
const aiLevelFor = (g, p) => (g.humans.some((h) => h.ctrl === p) ? { contest: 0.9 } : aiLevel(g));

/* ------------------------------------------------------------------ release / roll / outcome */
export function releaseShot(g, p) {
  const a = p.action; a.released = true; a.releaseT = a.t;
  const side = a.side, rim = rimOf(side);
  const { level: contest, defender } = shooterContest(g, p, a);
  const windowMs = shotWindow(g, p, a, contest);
  const offsetMs = (a.t - a.D) * 1000;
  const grade = a.type === 'ft' ? gradeOffset(offsetMs, windowMs) : capGrade(gradeOffset(offsetMs, windowMs), contest);
  const rawDist = a.type === 'ft' ? 4.57 : hoopDist(p.pos, side);
  const dist = a.type === 'three' || a.type === 'midrange' ? Math.max(0, rawDist - badge(p, 'limitless', 'idealRangeAdd')) : rawDist; // Limitless Range extends the ideal range
  const three = a.type !== 'ft' && isThree(p.pos, side);
  const clutch = g.isClutch() ? 1 + 0.0007 * (p.data.attrs.iq - 60) + badge(p, 'clutch', 'clutchMake') : 1;
  const usersShot = g.humans.some((h) => h.ctrl === p) || (g.humans.length > 0 && p.team === g.humans[0].team && false);
  const lv = aiLevel(g);
  const mp = makeProbability({
    type: a.type, rating: a.rating + (a.type === 'three' ? 0 : 0), distance: dist, contest, staminaPct: g.settings.fatigue ? p.stamina : 100,
    offDribble: a.offDribble, offBalance: a.offBalance, catchShoot: a.catchShoot, streak: streakTier(p.run), difficulty: g.settings.difficulty, grade, usersShot: a.human,
  });
  let pct = mp.p;
  pct += VARIANTS[a.variant].mod;
  if (a.catchShoot && (a.type === 'three' || a.type === 'midrange')) pct += badge(p, 'catchShoot', 'makePct');
  if (a.variant === 'fadeaway') pct += badge(p, 'fadeMaster', 'fadeMake');
  if (a.type === 'dunk' && contest > 0.4) pct += badge(p, 'posterizer', 'contactDunk');
  if (a.type === 'layup' && contest > 0.3) pct += badge(p, 'slasher', 'contactLayup');
  for (const m of g.teams[p.team].court) if (m !== p) pct += 0.004 * badge(m, 'floorGeneral', 'teamBoost'); // Floor General lifts teammates
  if (!a.human) pct += lv.accuracy + g.rubberBand(p.team);
  pct *= clutch;
  if (a.type === 'dunk') pct = clamp(pct * (0.8 + 0.2 * p.momentum + 0.15) * (a.spaced ? 1 : 0.7), 0, 0.99);
  const [lo, hi] = SHOT.final; pct = clamp(pct, lo, hi);
  if (p.action) p.action.lastWindow = windowMs;

  const ev = {
    t: g.t, q: g.quarter, clock: g.clock, shooter: p.id, shooterName: p.name, team: p.team, type: a.type, variant: a.variant, distance: dist, three, contest,
    offsetMs, grade, windowMs, pressure: pressureLabel(contest), makePct: pct, mods: mp.mods, made: false, x: p.pos.x, z: p.pos.z, side, human: a.human, assist: null, blocked: false, fouled: false,
  };
  p.perfectChain = grade === 'perfect' ? (p.perfectChain ?? 0) + 1 : 0;
  if (a.human) g.bus.emit('shotGrade', { player: p, grade, offsetMs, contest, windowMs, type: a.type });
  g.lastShotInfo = { ...ev, mods: mp.mods };

  const hand = { x: p.pos.x + Math.cos(p.face) * 0.25, y: p.y + (VARIANTS[a.variant].rel * p.height) / 2.0, z: p.pos.z + Math.sin(p.face) * 0.25 };
  const isFT = a.type === 'ft';
  if (!isFT) { p.stats.fga++; if (three) p.stats.tpa++; }
  else p.stats.fta++;
  p.hasBall = false;

  // block?
  if (!isFT && defender && contest > 0.55) {
    const win = 0.16 + badge(defender, 'rimProtector', 'blockWindowMs') / 1000;
    const good = defender.y > 0.08 && Math.abs(g.t - defender.blockAt) <= win && dist2(defender.pos, p.pos) < 1.7;
    const rimTry = a.type === 'dunk' || a.type === 'layup'; const bc = blockChance(contest, true, defender.data.attrs.block + 10) * (rimTry ? 1.35 : 1) * (a.type === 'dunk' && !a.spaced ? 1.2 : 1);
    if (good && Math.random() < Math.min(0.9, bc)) {
      ev.blocked = true; defender.stats.blk++;
      g.recordShot(ev, p);
      const dir = Math.atan2(p.pos.z - defender.pos.z, p.pos.x - defender.pos.x) + (Math.random() - 0.5) * 2.2;
      g.ball.fromShot = ev; g.ball.lastTouch = defender; g.ball.lastTouchTeam = defender.team;
      g.setLoose(hand, { x: Math.cos(dir) * (4 + Math.random() * 3), y: -1 + Math.random() * 2, z: Math.sin(dir) * (4 + Math.random() * 3) });
      g.bus.emit('block', { by: defender, shooter: p, ev });
      g.popup('BLOCK', defender);
      return;
    }
  }
  // foul?
  let foul = false;
  if (!isFT && g.settings.fouls && defender && contest > 0.25 && dist2(defender.pos, p.pos) < 1.3) {
    const agg = clamp(0.25 + opp(g, p).strategy.pressure * 0.5 + defender.data.attrs.steal / 400, 0, 1);
    let fp = foulProbability({ contactAngle: contest, defAggression: agg, shooterRating01: a.rating / 99, tolerance: g.settings.foulTolerance, shooting: true, dunkContact: a.type === 'dunk' && contest > 0.4 }) * 0.9;
    if (g.humans.some((h) => h.team === p.team && h.ctrl === p) && badge(p, 'posterizer', 'contactDunk')) fp *= 0.9;
    foul = Math.random() < fp;
  }
  const made = mp.forced ? true : Math.random() < pct; // Perfect + uncontested is a forced make (spec 5.3); the displayed make% stays clamped to 0.99
  ev.made = made; ev.fouled = foul;
  // assist bookkeeping: pass caught recently by this shooter
  const lp = g.lastPass;
  if (made && lp && lp.to === p && g.t - p.catchTime < 2.2 && lp.from !== p && lp.from.team === p.team && a.type !== 'ft') ev.assist = lp.from;
  p.ai.shotAt = g.t;
  if (foul && !made) {
    g.recordShot(ev, p);
    g.callFoul(defender, p, 'shooting', { shooting: true, three, made: false, ev });
    return;
  }
  g.ball.shot = { ev, p, scored: false, made, foul, foulDef: defender, contest };
  g.ball.fromShot = ev; g.ball.lastTouch = p; g.ball.lastTouchTeam = p.team;
  g.recordShot(ev, p, { pending: true });
  launchBall(g, p, a, ev, hand, rim, made, grade, offsetMs, dist, mp, contest);
  g.bus.emit('shotRelease', { ev, player: p });
}

/** Scripted arcs for makes, physical launches for misses (spec §5.4). */
function launchBall(g, p, a, ev, hand, rim, made, grade, offsetMs, dist, mp, contest) {
  const b = g.ball; const side = a.side;
  b.state = 'shot'; b.holder = null; b.vel = { x: 0, y: 0, z: 0 };
  if (a.type === 'dunk') {
    // ball goes from the hands to the rim; failed dunks hang / spit out
    const target = { x: rim.x - side * 0.02, y: rim.y + 0.05, z: 0 };
    if (made) { b.script = [{ from: { ...hand }, to: target, T: 0.1, apex: 0, kind: 'dunk' }]; b.scriptT = 0; b.scriptI = 0; }
    else {
      const dirx = -side, ang = (Math.random() - 0.5) * 2;
      g.setLoose(hand, { x: dirx * 2.5 + Math.cos(ang) * 1.5, y: 3.5 + Math.random() * 1.5, z: Math.sin(ang) * 2.5 });
      g.ball.shot = { ev, p, scored: false, made: false };
      g.ball.fromShot = ev;
      g.bus.emit('rimHang', { player: p });
    }
    if (a.type === 'dunk') g.bus.emit('dunk', { player: p, made, variant: a.variant });
    return;
  }
  const bias = missBias(grade, offsetMs);
  if (made) {
    // variants of a make: swish, bank, rim-in
    const bank = a.type !== 'three' && a.type !== 'ft' && Math.abs(hand.z) > 1.0 && dist < 5.2 && Math.random() < 0.45 || (a.variant === 'layup' && Math.random() < 0.3);
    const rimIn = !bank && (grade !== 'perfect') && Math.random() < 0.35;
    const apexAbove = apexFor(a.type, dist);
    const segs = [];
    if (bank) {
      const bz = clamp(hand.z * 0.18, -0.4, 0.4);
      const board = { x: rim.x + side * (COURT.rimFromBoard + 0.03), y: rim.y + 0.42, z: bz };
      segs.push({ from: hand, to: board, T: arcTime(hand, board, apexAbove * 0.7), apex: apexAbove * 0.7, kind: 'board' });
      segs.push({ from: board, to: { x: rim.x, y: rim.y, z: 0 }, T: 0.22, apex: 0, kind: 'swish' });
    } else if (rimIn) {
      const front = { x: rim.x - side * (RIM_R - 0.04) * -1 * -1 + (side > 0 ? -0.16 : 0.16), y: rim.y + 0.1, z: 0 };
      const toward = bias === 'long' ? -1 : 1;
      front.x = rim.x - side * 0.19 * toward;
      segs.push({ from: hand, to: front, T: arcTime(hand, front, apexAbove), apex: apexAbove, kind: 'rim' });
      segs.push({ from: front, to: { x: rim.x, y: rim.y, z: 0 }, T: 0.28, apex: 0.22, kind: 'swish' });
    } else {
      const to = { x: rim.x, y: rim.y, z: 0 };
      segs.push({ from: hand, to, T: arcTime(hand, to, apexAbove), apex: apexAbove, kind: 'swish' });
    }
    b.script = segs; b.scriptT = 0; b.scriptI = 0;
  } else {
    const wayOff = grade === 'wayoff';
    let r = 0.27 + Math.random() * 0.2, ang = Math.random() * Math.PI * 2;
    const towardShooter = Math.atan2(hand.z, hand.x - rim.x);
    if (bias === 'short') { ang = towardShooter + (Math.random() - 0.5) * 1.1; r = 0.3 + Math.random() * 0.25; }
    else if (bias === 'long') { ang = towardShooter + Math.PI + (Math.random() - 0.5) * 1.1; r = 0.3 + Math.random() * 0.25; }
    if (wayOff) { r = 0.75 + Math.random() * 0.8; }
    let target = { x: rim.x + Math.cos(ang) * r, y: rim.y, z: Math.sin(ang) * r };
    if (a.type !== 'three' && a.type !== 'ft' && Math.random() < 0.25) target = { x: rim.x + side * (COURT.rimFromBoard + 0.05), y: rim.y + 0.45, z: (Math.random() - 0.5) * 0.7 }; // off the glass
    const apexAbove = apexFor(a.type, dist);
    const T = arcTime(hand, target, apexAbove);
    g.setLoose(hand, ballistic(hand, target, T), { x: (Math.random() - 0.5) * 6, y: 0, z: (side) * -8 });
    g.ball.shot = { ev, p, scored: false, made: false, foul: false };
    g.ball.fromShot = ev;
  }
  void mp; void contest;
}
const apexFor = (type, d) => (type === 'three' ? 1.6 : type === 'ft' ? 1.35 : type === 'layup' ? 0.5 : type === 'floater' ? 1.5 : type === 'fadeaway' ? 1.3 : clamp(0.9 + d * 0.1, 1.0, 1.6));

/* ------------------------------------------------------------------ passing */
export function bestTargetInDirection(g, p, dx, dz) {
  let best = null, bs = -9;
  for (const q of g.teams[p.team].court) {
    if (q === p) continue;
    const vx = q.pos.x - p.pos.x, vz = q.pos.z - p.pos.z, d = Math.hypot(vx, vz) || 1;
    const hasDir = Math.hypot(dx, dz) > 0.3;
    const cosA = hasDir ? (vx * dx + vz * dz) / (d * Math.hypot(dx, dz)) : 0.6;
    if (hasDir && cosA < 0.55 - 0.4 * (g.settings.aimAssist ?? 0.5)) continue; // aim assist widens the pass cone
    const nd = nearestDefender(g, q);
    const open = nd ? clamp(dist2(nd.pos, q.pos) / 3, 0, 1) : 1;
    const s = cosA * 1.2 + open * (0.4 + 0.8 * (g.settings.aimAssist ?? 0.5)) - d / 40 + (q.ai.called && g.t - q.ai.called < 2 ? 0.5 : 0);
    if (s > bs) { bs = s; best = q; }
  }
  return best;
}

export function startPass(g, p, target, type = 'chest', opts = {}) {
  if (!p.hasBall || !target || p.action?.kind === 'shoot') return false;
  const cfg = PASS[type];
  const from = handPos(p, 1.2);
  const lead = type === 'lob' ? 0.9 : 0.35;
  let to = { x: target.pos.x + target.vel.x * lead, y: 1.25, z: target.pos.z + target.vel.z * lead };
  const alley = type === 'lob' && hoopDist(target.pos, g.dirOf(p.team)) < 6.2 && target.team === p.team && (opts.alley ?? hoopDist(target.pos, g.dirOf(p.team)) < 4.8);
  const side = g.dirOf(p.team);
  if (alley) { to = { x: hoopX(side) - side * 0.45, y: COURT.rimHeight + 0.35, z: clamp(target.pos.z * 0.3, -0.5, 0.5) }; }
  // accuracy: Passing rating, lane contest, pass type (spec §6.5)
  const lane = laneTightness(g, p, to);
  const err = (1 - p.data.attrs.pass / 110) * 0.7 * (type === 'nolook' ? 1.6 : 1) + lane * 0.25 + (p.stumble > 0 ? 0.3 : 0);
  to.x += gaussian(Math.random, 0, err * 0.5); to.z += gaussian(Math.random, 0, err * 0.5);
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  let T = Math.max(0.22, dist / cfg.speed);
  if (alley) T = Math.max(T, 0.9);
  // interception per defender along the lane
  let intercept = null;
  for (const d of opp(g, p).court) {
    if (d === p) continue;
    const { d: ld, t } = segDist(d.pos, from, to);
    if (ld > 1.5 || t < 0.12 || t > 0.95) continue;
    const prox = clamp((1.5 - ld) / 1.5, 0, 1) ** 1.3;
    const anticip = d.data.attrs.iq / 99, st = d.data.attrs.steal / 99;
    const typeF = type === 'bounce' ? 0.65 : type === 'lob' ? 0.35 : type === 'overhead' ? 0.8 : type === 'nolook' ? 1.15 : 1;
    const levelF = g.humans.some((h) => h.ctrl === d) ? 1 : aiLevel(g).steal;
    const ch = 0.16 * prox * (0.15 + 0.38 * st + 0.17 * anticip) * typeF * levelF * (1 - badge(p, 'needleThreader', 'laneReduce')) * (1 + badge(d, 'pickpocket', 'stealPct')) * (d.handsUp > 0.5 ? 1.2 : 1);
    if (Math.random() < ch && (!intercept || t < intercept.t)) intercept = { by: d, t };
  }
  p.hasBall = false; p.dribbling = false;
  p.action = { kind: 'pass', t: 0, dur: 0.3, type };
  g.ball.state = 'pass';
  g.ball.holder = null;
  g.ball.pass = { from: p, to: target, p0: from, p1: to, T, t: 0, type, apex: alley ? 1.1 : cfg.apex, intercept, alley };
  g.ball.lastTouch = p; g.ball.lastTouchTeam = p.team;
  g.lastPass = { from: p, to: target, t: g.t };
  p.stats.passes = (p.stats.passes ?? 0) + 1;
  g.bus.emit('pass', { from: p, to: target, type, alley });
  if (g.phase === 'inbound') g.beginLiveFromInbound();
  return true;
}
const laneTightness = (g, p, to) => {
  let t = 0;
  for (const d of opp(g, p).court) { const { d: ld } = segDist(d.pos, p.pos, to); t = Math.max(t, clamp(1 - ld / 1.5, 0, 1)); }
  return t;
};

export function updatePass(g, dt) {
  const b = g.ball, ps = b.pass; ps.t += dt;
  const s = clamp(ps.t / ps.T, 0, 1);
  const x = ps.p0.x + (ps.p1.x - ps.p0.x) * s, z = ps.p0.z + (ps.p1.z - ps.p0.z) * s;
  let y;
  if (ps.type === 'bounce') { y = s < 0.6 ? ps.p0.y * (1 - s / 0.6) + BALL_R * (s / 0.6) : BALL_R + (ps.p1.y - BALL_R) * ((s - 0.6) / 0.4); }
  else y = ps.p0.y + (ps.p1.y - ps.p0.y) * s + ps.apex * 4 * s * (1 - s);
  b.pos = { x, y: Math.max(BALL_R, y), z };
  b.vel = { x: (ps.p1.x - ps.p0.x) / ps.T, y: 0, z: (ps.p1.z - ps.p0.z) / ps.T };
  if (ps.alley && ps.t > ps.T - 0.5 && !ps.to.action) { ps.to.action = { kind: 'oopjump', t: 0, dur: 0.6 }; ps.to.vy = 1; }
  if (ps.intercept && s >= ps.intercept.t) {
    const d = ps.intercept.by; b.pass = null;
    d.stats.stl++; g.lastPass = null;
    g.bus.emit('steal', { by: d, from: ps.from, type: 'lane' }); g.popup('STEAL', d);
    g.turnover(ps.from, 'steal', { stealer: d }); g.giveBall(d); return;
  }
  if (s >= 1) {
    const r = ps.to;
    const dd = Math.hypot(r.pos.x - ps.p1.x, r.pos.z - ps.p1.z);
    const reachOk = ps.alley ? dd < 1.4 : dd < 2.0 + (r.data.attrs.iq > 85 ? 0.2 : 0);
    b.pass = null;
    if (reachOk && !g.dead) {
      if (ps.alley) { g.giveBall(r, { quiet: true }); g.autoFinish(r); }
      else { g.giveBall(r); }
    } else {
      b.state = 'loose'; g.setLoose(b.pos, { x: b.vel.x * 0.25, y: 1, z: b.vel.z * 0.25 });
      b.looseFromPass = true; b.fromShot = null;
      g.bus.emit('badPass', { from: ps.from });
    }
  }
}

/* ------------------------------------------------------------------ dribble moves, pump fake, post */
export function dribbleMove(g, p, type, intent) {
  if (!p.hasBall || p.action || p.cd.move > 0) return;
  const cool = Math.max(0.18, p.moveCooldown - badge(p, 'stepBack', 'dribbleCooldown'));
  p.cd.move = cool;
  const side = g.dirOf(p.team);
  const sp = Math.hypot(p.vel.x, p.vel.z);
  const dir = sp > 0.5 ? { x: p.vel.x / sp, z: p.vel.z / sp } : { x: Math.cos(p.face), z: Math.sin(p.face) };
  const perp = { x: -dir.z * p.dribbleHand, z: dir.x * p.dribbleHand };
  const def = nearestDefender(g, p, 2.4);
  const mv = { type, t: g.t };
  p.lastMove = mv;
  p.action = { kind: 'move', t: 0, dur: type === 'spin' ? 0.55 : type === 'hesitate' ? 0.4 : 0.35, type };
  if (type === 'cross' || type === 'behind') { p.vel.x += perp.x * 2.6; p.vel.z += perp.z * 2.6; p.dribbleHand *= -1; }
  if (type === 'spin') { p.vel.x += perp.x * 1.4 + dir.x * 1.0; p.vel.z += perp.z * 1.4 + dir.z * 1.0; p.spinT = 0.55; p.dribbleHand *= -1; p.protect = 0.6; }
  if (type === 'hesitate') { p.vel.x *= 0.15; p.vel.z *= 0.15; p.hesitateBurst = 0.3; }
  if (type === 'stepback') { p.vel.x = -dir.x * 3.6; p.vel.z = -dir.z * 3.6; p.vel.x += Math.cos(p.face) * 0; }
  if (def) {
    // beat the defender?
    const handle = p.data.attrs.ball / 99, dFoot = (def.data.attrs.perimD + def.data.attrs.speed) / 198;
    const stumbleP = clamp(0.1 + 0.28 * (handle - dFoot) + badge(p, 'ankleBreaker', 'stumble') * 0.4 + (type === 'hesitate' ? 0.08 : 0), 0.03, 0.7);
    def.recover = Math.max(def.recover, 0.28 + (type === 'hesitate' ? 0.2 : 0));
    if (Math.random() < stumbleP) { def.stumble = 0.8; def.recover = 0.7; def.recoverFreeze = true; g.bus.emit('ankleBreaker', { player: p, def }); g.popup('ANKLES', p); }
    // risk: stolen mid-move
    const risk = clamp(0.03 + 0.12 * (1 - handle) - badge(p, 'handles', 'stealReduce') * 0.05, 0.005, 0.2) * aiLevelFor(g, def).steal * (type === 'spin' ? 0.5 : 1);
    if (Math.random() < risk * 0.5) attemptSteal(g, def, p, true);
  }
  void side;
  g.bus.emit('dribbleMove', { player: p, type });
}

export function pumpFake(g, p) {
  if (!p.hasBall || p.action || p.cd.pump > 0) return;
  p.cd.pump = 0.8; p.action = { kind: 'pump', t: 0, dur: 0.42 };
  const d = nearestDefender(g, p, 2.8);
  if (d && !g.humans.some((h) => h.ctrl === d)) {
    const bite = clamp(0.62 - d.data.attrs.iq / 200 + (aiLevel(g).decision < 0.7 ? 0.2 : 0), 0.1, 0.9);
    if (Math.random() < bite) { d.action = { kind: 'block', t: 0, dur: 0.6 }; d.vy = 1; d.recover = 0.65; d.blockAt = g.t + 0.15; g.bus.emit('bite', { def: d }); }
  } else if (d) { d.recover = Math.max(d.recover, 0.3); }
  g.bus.emit('pump', { player: p });
}

export function postUp(g, p, dt, on) {
  const side = g.dirOf(p.team);
  if (!on || !p.hasBall || hoopDist(p.pos, side) > 5.2) { if (p.action?.kind === 'post') p.action = null; p.postTime = 0; return; }
  if (!p.action) p.action = { kind: 'post', t: 0, dur: 99 };
  if (p.action.kind !== 'post') return;
  p.postTime = (p.postTime ?? 0) + dt;
  p.dribbling = true;
  const def = nearestDefender(g, p, 1.5);
  const rim = rimOf(side);
  const dx = rim.x - p.pos.x, dz = rim.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
  p.face = Math.atan2(dz, dx);
  const power = clamp((p.data.attrs.strength - (def?.data.attrs.strength ?? 60)) / 60 + 0.5 + p.postTime * 0.15, 0, 1.5);
  p.backdown = power;
  const v = 0.35 + 0.7 * clamp(power, 0, 1);
  if (d > 1.8) { p.pos.x += (dx / d) * v * dt; p.pos.z += (dz / d) * v * dt; if (def) { def.pos.x += (dx / d) * v * dt * 0.8; def.pos.z += (dz / d) * v * dt * 0.8; } }
}

/* ------------------------------------------------------------------ steals & blocks & charges */
export function attemptSteal(g, d, handler, free = false) {
  if (g.gym) return false; // practice: the defender contests but never takes the ball
  if (!handler.hasBall || (!free && d.cd.steal > 0)) return false;
  if (!free) d.cd.steal = 0.9;
  const dd = dist2(d.pos, handler.pos);
  if (dd > 1.45) { d.recover = Math.max(d.recover, 0.3); return false; }
  const st = d.data.attrs.steal / 99, ball = handler.data.attrs.ball / 99;
  const protectedBall = handler.protect > 0 ? 0.35 : 1;
  const behind = Math.cos(wrapAngle(Math.atan2(handler.pos.z - d.pos.z, handler.pos.x - d.pos.x) - d.face)) < 0 ? 0.4 : 1;
  const p = clamp((0.05 + 0.26 * st - 0.1 * ball) * aiLevelFor(g, d).steal * protectedBall * behind * (1 + badge(d, 'pickpocket', 'stealPct')) * (1 - badge(handler, 'handles', 'stealReduce')) * (handler.dribbling ? 1 : 0.7), 0.01, 0.6);
  g.bus.emit('stealAttempt', { by: d, handler });
  if (Math.random() < p) {
    d.stats.stl++;
    g.bus.emit('steal', { by: d, from: handler, type: 'swipe' }); g.popup('STEAL', d);
    g.turnover(handler, 'steal', { stealer: d });
    if (Math.random() < 0.55) g.giveBall(d, { quiet: true });
    else { g.setLoose(handPos(handler, 0.6), { x: Math.cos(d.face) * 4, y: 1.5, z: Math.sin(d.face) * 4 }); handler.hasBall = false; g.ball.holder = null; }
    return true;
  }
  // reach-in foul chance
  if (g.settings.fouls && Math.random() < 0.16 * g.settings.foulTolerance * (1 + opp(g, d).strategy.pressure * 0.0)) { g.callFoul(d, handler, 'personal', { reach: true }); return false; }
  d.recover = Math.max(d.recover, 0.4);
  return false;
}

export function startBlock(g, d) {
  if (d.cd.block > 0 || d.action) return;
  d.cd.block = 0.9;
  d.action = { kind: 'block', t: 0, dur: 0.62 };
  d.vy = 3.4; d.blockAt = g.t + 0.2; d.blockUntil = g.t + 0.5;
}
export function updateBlockAction(g, p, dt) {
  const a = p.action; if (!a || (a.kind !== 'block' && a.kind !== 'oopjump')) return;
  a.t += dt;
  p.vy -= 9.81 * dt; p.y = Math.max(0, p.y + p.vy * dt);
  p.handsUp = 1;
  if (p.y <= 0 && p.vy < 0) { p.y = 0; p.vy = 0; p.action = null; }
}

/* ------------------------------------------------------------------ rebounds & loose ball */
export function resolveLoose(g, dt) {
  const b = g.ball; const cands = [];
  if (b.pos.y > 3.9 && g.ball.fromShot && b.vel.y > -0.5 && b.vel.y > 0) return;
  for (const p of g.on) {
    if (p.fouledOut || p.action?.kind === 'ft' || p.parked || (g.gym && p !== g.gymUser)) continue;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    const hustle = 1 + badge(p, 'hustleReb', 'pursuitRadius');
    const r = (0.62 + (p.data.wingspanM - 1.9) * 0.4) * hustle;
    const top = reach(p) + 0.45 + (p.y > 0 ? 0.3 : 0) + p.data.attrs.vertical / 300;
    if (d < r + 0.15 && b.pos.y < top && b.pos.y > p.y - 0.2 && !(g.ball.fromShot && b.pos.y > 3.3 && Math.hypot(b.pos.x - hoopX(Math.sign(b.pos.x) || 1), b.pos.z) < 0.35)) cands.push({ p, d });
  }
  if (!cands.length) return;
  const rebound = !!b.fromShot;
  const scored = cands.map((c) => {
    const p = c.p, a = p.data.attrs;
    let s = a.reb * 0.45 + a.vertical * 0.12 + a.strength * 0.18 + p.height * 18 - c.d * 14 + Math.random() * 26 + a.iq * 0.05;
    s += badge(p, 'boxOut', 'boxOut') * 18;
    if (p.boxedUntil > g.t) s -= 14;
    if (p.y > 0.2) s += 6;
    return { p, s };
  }).sort((x, y) => y.s - x.s);
  const w = scored[0].p;
  if (g.settings.fouls && scored.length > 1 && Math.random() < 0.012 * g.settings.foulTolerance && scored[1].p.team !== w.team) { const f = scored[1].p; g.callFoul(f, w, 'loose-ball', { looseBall: true }); return; }
  // tip-out (offensive put-back chance)
  if (rebound && scored[0].s > 0 && Math.random() < 0.1 + w.data.attrs.reb / 900 && g.t - (b.lastTip ?? -9) > 0.5) {
    b.lastTip = g.t; const side = Math.sign(b.pos.x) || 1; const rim = rimOf(side);
    g.bus.emit('tip', { player: w });
    g.ball.lastTouch = w; g.ball.lastTouchTeam = w.team;
    g.phys.impulse({ x: (rim.x - b.pos.x) * 1.4 - g.phys.vel.x, y: 2.4 - g.phys.vel.y, z: -g.phys.vel.z - b.pos.z * 1.4 });
    return;
  }
  if (rebound && g.ball.shot && g.ball.shot.ev) {
    const off = w.team === g.ball.shot.ev.team;
    w.stats.reb++; if (off) w.stats.oreb++;
    g.bus.emit('rebound', { player: w, offensive: off });
    g.reboundWon(w, off);
  } else g.giveBall(w);
}
export const resetBlockState = (p) => { p.blockAt = -9; };
export { ftSpot };
void RULES; void shotRatingOf; void aiLevel;
