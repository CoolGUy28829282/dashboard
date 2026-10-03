// Pure shooting math (spec §5). No rendering, no randomness unless an rng is passed.
import { SHOT } from '../tuning.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function releaseSpeedMod(shotSpeedRating) {
  const r = SHOT.releaseSpeed;
  return clamp(r.a - r.b * shotSpeedRating, r.min, r.max);
}
/** Window multiplier by shot distance (m from the rim): 1 inside/at the three, shrinking beyond it. */
export function rangeWindowScale(distance) {
  const r = SHOT.range; return clamp(1 - r.perMeter * Math.max(0, distance - r.fullUntil), r.min, 1);
}
export const meterDuration = (type, shotSpeedRating) => SHOT.baseTime[type] * (type === 'ft' ? 1 : releaseSpeedMod(shotSpeedRating));

/** Perfect (green) window width in ms. fatigue is 0..1 (share of stamina lost). */
export function windowWidthMs({ type, rating, contest = 0, fatigue = 0, badgeBonus = 0 }) {
  const c = type === 'ft' ? 0 : contest;
  const w = SHOT.baseWindowMs[type] + SHOT.windowRatingCoef * rating - SHOT.windowContestCoef * c - SHOT.windowFatigueCoef * fatigue + badgeBonus;
  const [lo, hi] = type === 'ft' ? SHOT.ftWindowClamp : SHOT.windowClamp;
  return clamp(w, lo, hi);
}

/** offsetMs: negative = early, positive = late. */
export function gradeOffset(offsetMs, widthMs) {
  const a = Math.abs(offsetMs), h = widthMs / 2, b = SHOT.bands;
  if (a <= h) return 'perfect';
  if (a <= h + b.excellent) return 'excellent';
  if (a <= h + b.good) return 'good';
  if (a <= h + b.off) return offsetMs < 0 ? 'early' : 'late';
  return 'wayoff';
}

export function baseMake(rating) {
  const b = SHOT.base;
  const t = clamp((rating - b.minR) / (b.maxR - b.minR), 0, 1);
  return b.floor + b.span * Math.pow(t, b.exp);
}

export function distanceFactor(type, distance) {
  if (type === 'layup' || type === 'dunk' || type === 'ft') return 1;
  const d = SHOT.distance;
  return clamp(1 - d.falloff * Math.max(0, distance - (SHOT.ideal[type] ?? 4)), d.min, d.max);
}
export const contestMod = (c) => 1 - SHOT.contestPenalty * clamp(c, 0, 1);
export const fatigueMod = (staminaPct) => 1 - SHOT.fatiguePenalty * Math.pow(1 - clamp(staminaPct, 0, 100) / 100, SHOT.fatigueExp);

/** streak: signed tier. +n = n tiers hot, -n = n tiers cold. */
export function streakMod(tier) {
  const s = SHOT.streak;
  return tier >= 0 ? Math.min(tier * s.hotPerTier, s.hotMax) : -Math.min(-tier * s.coldPerTier, s.coldMax);
}
/** Streak tier from consecutive makes (positive) / misses (negative). */
export const streakTier = (run) => (run >= 2 ? Math.min(3, run - 1) : run <= -3 ? -Math.min(3, -run - 2) : 0);

/** Full make probability with a per-modifier breakdown (for the F3 overlay). */
export function makeProbability(i) {
  const { type, rating, distance = 0, contest = 0, staminaPct = 100, offDribble = false, offBalance = false, catchShoot = false,
    streak = 0, difficulty = 'allstar', grade = 'good', usersShot = true } = i;
  const m = {};
  m.base = baseMake(rating);
  m.distance = distanceFactor(type, distance);
  m.contest = type === 'ft' ? 1 : contestMod(contest);
  m.fatigue = fatigueMod(staminaPct);
  m.situation = 1 + (offDribble ? SHOT.offDribble : 0) + (offBalance ? SHOT.offBalance : 0) + (catchShoot ? SHOT.catchShoot : 0);
  m.streak = 1 + streakMod(streak);
  const dcfg = SHOT.difficulty[difficulty] ?? SHOT.difficulty.allstar;
  m.difficulty = usersShot ? 1 + dcfg.mod : 1;
  let gm = SHOT.gradeMod[grade === 'early' || grade === 'late' ? 'off' : grade];
  let forced = false;
  if (grade === 'perfect') {
    if (difficulty === 'hof' && usersShot) gm = dcfg.perfectMult;
    else if (contest <= 0.001) { gm = 1; forced = true; }
    else gm = SHOT.perfectContestedBase + SHOT.perfectContestedSlope * (1 - contest);
  }
  m.grade = gm;
  const [lo, hi] = SHOT.final;
  let p = m.base * m.distance * m.contest * m.fatigue * m.situation * m.streak * m.difficulty * m.grade;
  if (forced) p = hi;
  return { p: clamp(p, lo, hi), mods: m, forced };
}

/** Miss direction from timing: early = short, late = long. */
export const missBias = (grade, offsetMs) => (grade === 'early' || offsetMs < -1 ? 'short' : grade === 'late' || offsetMs > 1 ? 'long' : 'none');

/** Box-Muller normal sample. */
export function gaussian(rng, mean = 0, sd = 1) {
  const u = Math.max(1e-9, rng()), v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
