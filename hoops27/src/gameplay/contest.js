import { CONTEST } from '../tuning.js';
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Contest level 0..1 from the closest defender (spec §5.4). Ratings are 25–99. */
export function contestLevel({ distance, handHeight, releaseHeight, closingSpeed = 0, defRating = 50, heightM = 1.98 }) {
  if (distance >= CONTEST.maxDist) return 0;
  const prox = clamp01(1 - (distance - CONTEST.hardDist * 0.25) / (CONTEST.maxDist - CONTEST.hardDist * 0.25));
  const hand = clamp01((handHeight - (releaseHeight - 0.35)) / 0.7);
  const closing = clamp01(closingSpeed / 6);
  const rate = clamp01((defRating - 25) / 74);
  const hgt = clamp01((heightM - 1.83) / 0.35);
  const w = CONTEST;
  const quality = hand * (1 - w.handWeight - w.closingWeight - w.ratingWeight - w.heightWeight) + closing * w.closingWeight + rate * w.ratingWeight + hgt * w.heightWeight + w.handWeight;
  return clamp01(prox * (0.25 + 0.75 * quality));
}
export const blockChance = (contest, blockTimingGood, blockRating) => (contest > 0.6 && blockTimingGood ? clamp01(0.15 + 0.6 * ((blockRating - 25) / 74)) : 0);
