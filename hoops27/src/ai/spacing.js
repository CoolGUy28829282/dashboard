// Grid-based open-space evaluator (Voronoi-flavoured: score by distance to the nearest player of each side).
import { COURT } from '../tuning.js';
import { HALF_L, hoopX } from '../gameplay/court.js';

const CELL = 1.5;
export function bestSpot({ me, side, mates, defenders, shooter, prefer, radius = 6.5 }) {
  let best = null, bs = -1e9;
  const hx = hoopX(side);
  for (let d = 1.5; d <= 12; d += CELL) {
    for (let l = -7; l <= 7; l += CELL) {
      const pt = { x: side * (HALF_L - d), z: l };
      const dm = Math.hypot(pt.x - me.pos.x, pt.z - me.pos.z); if (dm > radius) continue;
      let minDef = 6; for (const o of defenders) minDef = Math.min(minDef, Math.hypot(o.pos.x - pt.x, o.pos.z - pt.z));
      let minMate = 6; for (const o of mates) if (o !== me) minMate = Math.min(minMate, Math.hypot((o.ai.spot?.x ?? o.pos.x) - pt.x, (o.ai.spot?.z ?? o.pos.z) - pt.z));
      const rimD = Math.hypot(pt.x - hx, pt.z);
      let s = Math.min(minDef, 4) * 1.0 + Math.min(minMate, 4.5) * 1.6 - dm * 0.25;
      if (shooter) s -= Math.abs(rimD - (COURT.threeArc + 0.4)) * 0.9; // sit just behind the arc
      else if (prefer === 'inside') s -= Math.abs(rimD - 3.2) * 0.8;
      else s -= Math.abs(rimD - 5.5) * 0.4;
      if (Math.abs(pt.z) > 7.0 && rimD > 4.2) s -= 1.2; // don't hug the sideline except in the corner
      if (s > bs) { bs = s; best = pt; }
    }
  }
  return best ?? { x: me.pos.x, z: me.pos.z };
}
