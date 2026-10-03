import { RULES } from '../tuning.js';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** contactAngle: 0 = glancing, 1 = head-on. aggression & ratings 0..1. tolerance slider 0.5 (lenient) .. 1.5 (strict). */
export function foulProbability({ contactAngle, defAggression, shooterRating01, tolerance = 1, shooting = false, dunkContact = false }) {
  const f = RULES.foul;
  let p = (f.base + f.aggression * defAggression + f.contactAngle * contactAngle) * (1.15 - 0.4 * shooterRating01) * tolerance;
  if (shooting) p *= 1.5;
  if (dunkContact) p += RULES.dunkContactFoul;
  return clamp(p, 0, f.max);
}
