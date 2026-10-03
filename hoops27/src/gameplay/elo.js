// Ranked maths (spec §3.2). Pure.
import { RANKED } from '../tuning.js';

export const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
export const kFactor = (gamesPlayed) => (gamesPlayed < RANKED.placementGames ? RANKED.kPlacement : RANKED.kNormal);

/** Streak bonus: +2 per consecutive win starting from the 3rd, capped at +10. Never for losses. */
export const streakBonus = (winStreakAfterWin) => (winStreakAfterWin >= RANKED.streakStartAt ? Math.min(RANKED.streakCap, RANKED.streakBonus * (winStreakAfterWin - RANKED.streakStartAt + 1)) : 0);

/** Returns the signed MMR delta. winStreak = consecutive wins INCLUDING this game when won. */
export function mmrDelta({ mmr, oppMmr, won, gamesPlayed, winStreak = 0, rageQuit = false }) {
  const k = kFactor(gamesPlayed);
  let d = k * ((won ? 1 : 0) - expected(mmr, oppMmr));
  if (won) d += streakBonus(winStreak);
  if (!won && rageQuit) d *= RANKED.rageQuitMult;
  return Math.round(d);
}

/** Tier / division from MMR. Bronze III starts at 800; each division is 100 MMR; Legend has no divisions. */
export function rankFromMmr(mmr) {
  const idx = Math.max(0, Math.floor((mmr - RANKED.divisionStart) / RANKED.divisionStep));
  const legendIdx = (RANKED.tiers.length - 1) * 3;
  if (idx >= legendIdx) return { tier: 'Legend', division: null, floor: RANKED.divisionStart + legendIdx * RANKED.divisionStep, next: null };
  const tier = RANKED.tiers[Math.floor(idx / 3)];
  const division = RANKED.divisions[idx % 3];
  const floor = RANKED.divisionStart + idx * RANKED.divisionStep;
  return { tier, division, floor, next: floor + RANKED.divisionStep };
}
export const rankLabel = (m) => { const r = rankFromMmr(m); return r.division ? `${r.tier} ${r.division}` : r.tier; };
export const divisionProgress = (mmr) => { const r = rankFromMmr(mmr); return r.next ? (mmr - r.floor) / (r.next - r.floor) : 1; };

export function opponentMmr(mmr, rng) { return Math.round(mmr + (rng() * 2 - 1) * RANKED.matchRange); }
import { AI } from '../tuning.js';
export const levelForMmr = (mmr) => AI.mmrToLevel.find(([max]) => mmr < max)[1];
