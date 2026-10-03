// Court geometry. x runs baseline to baseline, z is lateral, y is up (metres).
import { COURT } from '../tuning.js';
import { HALF_L, HALF_W, RIM_X } from '../physics/world.js';

export { HALF_L, HALF_W, RIM_X };
export const hoopX = (side) => side * RIM_X;
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const len = (x, z) => Math.hypot(x, z);
export const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const clampCourt = (p, m = 0) => { p.x = Math.max(-HALF_L - m, Math.min(HALF_L + m, p.x)); p.z = Math.max(-HALF_W - m, Math.min(HALF_W + m, p.z)); };
export const outOfBounds = (p) => Math.abs(p.x) > HALF_L || Math.abs(p.z) > HALF_W;

/** Distance from a position to the hoop being attacked (side = +1 for +x hoop). */
export const hoopDist = (p, side) => Math.hypot(p.x - hoopX(side), p.z);
export const isThree = (p, side) => hoopDist(p, side) >= COURT.threeArc - 0.05 || Math.abs(p.z) >= COURT.threeCorner - 0.05;
/** Attack-local coordinates: d = distance from the attacked baseline, l = lateral. */
export const toWorld = (side, d, l) => ({ x: side * (HALF_L - d), z: l });
export const depthFromBaseline = (p, side) => HALF_L - side * p.x;
export const inPaint = (p, side) => depthFromBaseline(p, side) <= COURT.ftLine + COURT.backboardOffset && Math.abs(p.z) <= COURT.paintWidth / 2;
export const frontcourt = (p, side) => side * p.x > 0;
export const ftSpot = (side) => ({ x: side * (HALF_L - COURT.backboardOffset - COURT.ftLine), z: 0 });

/** Closest distance from point p to segment a-b, and the parameter t of the closest point. */
export function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z; const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)), t };
}
