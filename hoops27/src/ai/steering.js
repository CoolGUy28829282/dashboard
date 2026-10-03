// Steering behaviours: seek, arrive, separation, obstacle avoidance, interpose.
import { dist2 } from '../gameplay/court.js';

export function seek(p, target) { const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d, d }; }
/** Arrive: slow to a stop inside `slow` metres. Returns desired move vector magnitude 0..1. */
export function arrive(p, target, slow = 1.6) {
  const s = seek(p, target); const k = Math.min(1, Math.max(0, (s.d - 0.15) / slow));
  return { x: s.x * k, z: s.z * k, d: s.d };
}
export function separation(p, others, radius = 1.3) {
  let x = 0, z = 0;
  for (const o of others) {
    if (o === p) continue; const d = dist2(o.pos, p.pos);
    if (d < radius && d > 1e-3) { const w = (radius - d) / radius; x += ((p.pos.x - o.pos.x) / d) * w; z += ((p.pos.z - o.pos.z) / d) * w; }
  }
  return { x, z };
}
/** Steer around moving obstacles (e.g. a defender in the driving lane): push sideways away from whoever is ahead. */
export function avoid(p, move, obstacles, look = 1.8) {
  const mag = Math.hypot(move.x, move.z); if (mag < 1e-3) return move;
  const dx = move.x / mag, dz = move.z / mag; let x = move.x, z = move.z;
  for (const o of obstacles) {
    const rx = o.pos.x - p.pos.x, rz = o.pos.z - p.pos.z, d = Math.hypot(rx, rz);
    if (d > look || d < 1e-3 || (rx * dx + rz * dz) / d < 0.3) continue;
    const obstacleLeft = dx * rz - dz * rx > 0; const w = (1 - d / look) * 1.4 * mag;
    x += (obstacleLeft ? 1 : -1) * dz * w; z += (obstacleLeft ? -1 : 1) * dx * w;
  }
  const l = Math.hypot(x, z) || 1; return { x: (x / l) * mag, z: (z / l) * mag };
}
/** Interpose: stand on the line from `a` to `b` at fraction t (0 = at a). */
export function interpose(a, b, t) { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
