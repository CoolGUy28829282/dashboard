// AI traffic: lane-following on the road grid with traffic lights, turns, obstacle braking, panic, parked cars.
import * as THREE from 'three';
import { P, ROAD, NBX, NBZ, lineX, lineZ, X0, Z0 } from './world.js';
import { CIVIL, PAINTS, TYPES } from './vehicles.js';
import { clamp, lerp, rnd, pick, angDiff, wrapAngle } from './util.js';

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // E W S N
export const OPP = [1, 0, 3, 2];
const OFF_IN = 1.9, OFF_OUT = 4.8, PARK_OFF = 6.85, STOP_S = P - 10.5, ENTRY_S = P - 8;
const axisOf = d => (d < 2 ? 0 : 1);
export const nodeXZ = (i, j) => ({ x: lineX(i), z: lineZ(j) });
const validNode = (i, j) => i >= 0 && j >= 0 && i <= NBX && j <= NBZ;
export function laneP(i, j, dir, s, off) { const d = DIRS[dir], n = nodeXZ(i, j); return { x: n.x + d[0] * s + -d[1] * off, z: n.z + d[1] * s + d[0] * off }; }

export function createTraffic(G) {
  const T = { ais: [] }, world = G.world;
  T.chooseDir = (i, j, inDir) => { // random turn weights, no U-turns
    const opts = []; for (let d = 0; d < 4; d++) { if (d === OPP[inDir]) continue; if (!validNode(i + DIRS[d][0], j + DIRS[d][1])) continue; opts.push([d, d === inDir ? 0.6 : 0.2]); } const tot = opts.reduce((a, o) => a + o[1], 0); let r = Math.random() * tot; for (const [d, w] of opts) { r -= w; if (r <= 0) return d; } return opts[0][0];
  };
  // BFS distance field toward a target node, cached for chase AI
  const distCache = { key: '', t: -9, field: null };
  T.distField = (ti, tj) => {
    const key = ti + ',' + tj; if (distCache.key === key && G.clock - distCache.t < 1.0) return distCache.field; const f = new Int16Array((NBX + 1) * (NBZ + 1)).fill(9999), q = [[ti, tj]]; f[ti * (NBZ + 1) + tj] = 0;
    for (let h = 0; h < q.length; h++) { const [i, j] = q[h], d = f[i * (NBZ + 1) + j]; for (const dd of DIRS) { const ni = i + dd[0], nj = j + dd[1]; if (!validNode(ni, nj)) continue; const k = ni * (NBZ + 1) + nj; if (f[k] > d + 1) { f[k] = d + 1; q.push([ni, nj]); } } }
    distCache.key = key; distCache.t = G.clock; distCache.field = f; return f;
  };
  T.chaseDir = (field) => (i, j, inDir) => { let best = -1, bd = 1e9; for (let d = 0; d < 4; d++) { if (d === OPP[inDir]) continue; const ni = i + DIRS[d][0], nj = j + DIRS[d][1]; if (!validNode(ni, nj)) continue; const v = field[ni * (NBZ + 1) + nj] + (d === inDir ? -0.1 : 0) + Math.random() * 0.05; if (v < bd) { bd = v; best = d; } } return best < 0 ? T.chooseDir(i, j, inDir) : best; };

  class RoadAI {
    constructor(v, mode = 'traffic') { this.v = v; this.mode = mode; this.path = []; this.pi = 0; this.prev = { x: v.x, z: v.z }; this.front = null; this.cruise = rnd(11, 16) * (0.9 + Math.random() * 0.25); this.stuckT = 0; this.revT = 0; this.panic = 0; this.lostT = 0; this.choose = T.chooseDir; this.ignoreLights = false; this.maxSpeedMul = 1; this.age = 0; this.seen = 0; }
    place(i, j, dir, off, s) { const p = laneP(i, j, dir, s, off), v = this.v; v.x = p.x; v.z = p.z; v.a = Math.atan2(DIRS[dir][1], DIRS[dir][0]); this.front = { i, j, dir, off }; this.path = []; this.pi = 0; this.prev = { x: v.x, z: v.z }; v.y = G.world.groundY(v.x, v.z); const sp = Math.min(this.cruise * 0.8, 12); v.vx = Math.cos(v.a) * sp; v.vz = Math.sin(v.a) * sp; }
    // append: stop line + entry of the next intersection, then a bezier through it, then the exit point
    extend() {
      const f = this.front, d = DIRS[f.dir], Bi = f.i + d[0], Bj = f.j + d[1], nd = this.choose(Bi, Bj, f.dir); const cross = d[0] * DIRS[nd][1] - d[1] * DIRS[nd][0]; let noff = f.off; if (nd !== f.dir) noff = cross > 0 ? OFF_OUT : OFF_IN; else if (Math.random() < 0.12) noff = f.off === OFF_IN ? OFF_OUT : OFF_IN;
      const stop = laneP(f.i, f.j, f.dir, STOP_S, f.off), entry = laneP(f.i, f.j, f.dir, ENTRY_S, f.off), exit = laneP(Bi, Bj, nd, 8.5, noff);
      this.path.push({ x: stop.x, z: stop.z, stop: { i: Bi, j: Bj, ax: axisOf(f.dir) }, spd: 99 }); this.path.push({ x: entry.x, z: entry.z, spd: nd === f.dir ? 99 : 7.5 });
      if (nd !== f.dir) { const B = nodeXZ(Bi, Bj), r1 = [-d[1], d[0]], r2 = [-DIRS[nd][1], DIRS[nd][0]], cx = B.x + r1[0] * f.off + r2[0] * noff, cz = B.z + r1[1] * f.off + r2[1] * noff; for (let k = 1; k <= 4; k++) { const t = k / 5, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; this.path.push({ x: a * entry.x + b * cx + c * exit.x, z: a * entry.z + b * cz + c * exit.z, spd: 7.5 }); } }
      this.path.push({ x: exit.x, z: exit.z, spd: 99 }); this.front = { i: Bi, j: Bj, dir: nd, off: noff };
      if (this.pi > 24) { this.path.splice(0, this.pi); this.pi = 0; }
    }
    bump(other, impact) { if (impact > 5 || other.driver === G.player) this.panic = 5; }
    update(v, dt) {
      this.age += dt; if (this.panic > 0) this.panic -= dt; while (this.path.length - this.pi < 6) this.extend();
      const sx = this.prev.x, sz = this.prev.z; let Tp = this.path[this.pi], dx = Tp.x - sx, dz = Tp.z - sz, len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len; const t = (v.x - sx) * dx + (v.z - sz) * dz, vf = v.fwd;
      const green = !Tp.stop || this.ignoreLights || this.panic > 0 || G.world.signalState(Tp.stop.i, Tp.stop.j, Tp.stop.ax, G.clock) === 2 || (G.world.signalState(Tp.stop.i, Tp.stop.j, Tp.stop.ax, G.clock) === 1 && t > len - (vf * 1.1 + 3));
      if (Tp.stop ? (green && t >= len - 3) : (t >= len - 1.5 || Math.hypot(Tp.x - v.x, Tp.z - v.z) < 4.5)) { this.prev = { x: Tp.x, z: Tp.z }; this.pi++; Tp = this.path[this.pi]; dx = Tp.x - this.prev.x; dz = Tp.z - this.prev.z; len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len; }
      // carrot point (pure pursuit with cross-track correction)
      const tt = (v.x - this.prev.x) * dx + (v.z - this.prev.z) * dz, la = clamp(4.5 + Math.abs(vf) * 0.5, 5.5, 20); let cx, cz; const reach = tt + la;
      if (reach <= len || Tp.stop) { const u = Math.min(reach, len); cx = this.prev.x + dx * u; cz = this.prev.z + dz * u; } else { const N = this.path[this.pi + 1], nx = N.x - Tp.x, nz = N.z - Tp.z, nl = Math.hypot(nx, nz) || 1, u = reach - len; cx = Tp.x + nx / nl * u; cz = Tp.z + nz / nl * u; }
      const err = angDiff(v.a, Math.atan2(cz - v.z, cx - v.x)); let target = this.cruise * (this.panic > 0 ? 1.35 : 1) * this.maxSpeedMul, why = 'cruise'; const lim = (val, r) => { if (val < target) { target = val; why = r; } };
      // speed limits ahead (turns) and stop lines
      let dist = 0, px = v.x, pz = v.z;
      for (let k = 0; k < 4 && this.pi + k < this.path.length; k++) {
        const q = this.path[this.pi + k]; dist += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z;
        if (q.spd < 90) lim(Math.sqrt(q.spd * q.spd + 2 * 4.5 * Math.max(dist - 3, 0)), 'turn');
        if (q.stop && !(this.ignoreLights || this.panic > 0)) { const st = G.world.signalState(q.stop.i, q.stop.j, q.stop.ax, G.clock); if (st === 0 || (st === 1 && dist > vf * 1.1 + 4)) lim(Math.sqrt(2 * 5.5 * Math.max(dist - 1.6, 0)), 'light'); }
      }
      target *= clamp(1 - Math.abs(err) * 0.55, 0.4, 1);
      // obstacles: other vehicles and pedestrians ahead
      const c = Math.cos(v.a), s = Math.sin(v.a), look = 7 + Math.abs(vf) * 1.5;
      for (const o of G.vehicles.list) { if (o === v) continue; const rx = o.x - v.x, rz = o.z - v.z, f = rx * c + rz * s; if (f < 0.5 || f > look + 4) continue; const l = -rx * s + rz * c; const stat = !(o.driver || o.ai); if (Math.abs(l) > (stat ? 1.7 : 2.0)) continue; const gap = f - 4.6; const ov = o.fwd > 0 ? o.fwd * (stat ? 0 : 1) : 0; lim(Math.max(0, gap * 0.8) + ov * 0.9, 'car'); if (gap < 1.2) lim(0, 'car'); }
      if (G.peds) for (const p of G.peds.list) { if (p.state === 'dead') continue; const rx = p.x - v.x, rz = p.z - v.z, f = rx * c + rz * s; if (f < 0.5 || f > look) continue; const l = -rx * s + rz * c; if (Math.abs(l) > 1.6) continue; lim(Math.max(0, (f - 3.2) * 0.9), 'ped'); }
      const pl = G.player; if (pl.state === 'foot') { const rx = pl.x - v.x, rz = pl.z - v.z, f = rx * c + rz * s; if (f > 0.5 && f < look && Math.abs(-rx * s + rz * c) < 1.6) lim(Math.max(0, (f - 3.2) * 0.9), 'ped'); }
      this.why = why;
      // reverse recovery when stuck
      if (this.revT > 0) { this.revT -= dt; v.inp.thr = -0.7; v.inp.steer = this.revSteer; v.inp.brk = 0; return; }
      if (target > 2.5 && Math.abs(vf) < 0.4) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 3.2) { this.stuckT = 0; this.revT = 1.3; this.revSteer = -Math.sign(err || 1) * 0.9; this.lostT += 1; }
      // lost: far from planned route (after crashes)
      const cross = Math.abs(-(v.x - this.prev.x) * dz + (v.z - this.prev.z) * dx); if (cross > 12) this.lostT += dt; else this.lostT = Math.max(0, this.lostT - dt * 0.5);
      v.inp.steer = clamp(err * 1.7, -1, 1) * (vf < -0.5 ? -1 : 1); v.inp.hb = 0;
      if (vf < target - 0.3) { v.inp.thr = clamp((target - vf) * 0.45, 0, 1); v.inp.brk = 0; } else { v.inp.thr = 0; v.inp.brk = clamp((vf - target) * 0.25, 0, 1); }
    }
  }
  T.RoadAI = RoadAI;
  T.attach = (v, i, j, dir, off, mode = 'traffic') => { const ai = new RoadAI(v, mode); ai.place(i, j, dir, off, rnd(12, 70)); v.ai = ai; v.driver = { npc: true }; return ai; };

  // ---- spawning
  const free = (x, z, r) => { for (const v of G.vehicles.list) if ((v.x - x) ** 2 + (v.z - z) ** 2 < r * r) return false; return true; };
  const fw = new THREE.Vector3();
  function spawnDriver(inView) {
    const f = G.focus; for (let k = 0; k < 10; k++) {
      const a = rnd(0, Math.PI * 2), d = rnd(inView ? 40 : 120, inView ? 260 : 440), x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d, i = Math.round((x - X0) / P), j = Math.round((z - Z0) / P); if (!validNode(i, j)) continue;
      let dir = Math.floor(Math.random() * 4); if (!validNode(i + DIRS[dir][0], j + DIRS[dir][1])) continue; const off = Math.random() < 0.5 ? OFF_IN : OFF_OUT, p = laneP(i, j, dir, rnd(14, 70), off); if (!free(p.x, p.z, 11) || !G.world.onRoad(p.x, p.z)) continue;
      if (!inView) { G.camera.getWorldDirection(fw); const dx = p.x - f.x, dz = p.z - f.z, dd = Math.hypot(dx, dz); if (dd < 220 && (dx * fw.x + dz * fw.z) / dd > 0.2) continue; }
      const type = pick(CIVIL), v = G.vehicles.spawn(type, p.x, p.z, 0, {}); T.attach(v, i, j, dir, off); v.mesh.visible = true; return v;
    } return null;
  }
  function spawnParked(inView) {
    const f = G.focus; for (let k = 0; k < 10; k++) {
      const a = rnd(0, Math.PI * 2), d = rnd(15, inView ? 230 : 330), x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d, horizontal = Math.random() < 0.5; let px, pz, ang;
      if (horizontal) { const j = Math.round((z - Z0) / P), i = Math.floor((x - X0) / P); if (j < 0 || j > NBZ || i < 0 || i >= NBX) continue; const side = Math.random() < 0.5 ? 1 : -1; px = lineX(i) + rnd(20, P - 20); pz = lineZ(j) + side * PARK_OFF; ang = side > 0 ? 0 : Math.PI; }
      else { const i = Math.round((x - X0) / P), j = Math.floor((z - Z0) / P); if (i < 0 || i > NBX || j < 0 || j >= NBZ) continue; const side = Math.random() < 0.5 ? 1 : -1; px = lineX(i) + side * PARK_OFF; pz = lineZ(j) + rnd(20, P - 20); ang = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      if (!free(px, pz, 6.5)) continue; if (!inView) { G.camera.getWorldDirection(fw); const dx = px - f.x, dz = pz - f.z, dd = Math.hypot(dx, dz) || 1; if (dd < 150 && (dx * fw.x + dz * fw.z) / dd > 0.2) continue; }
      const type = pick(['sedan', 'sedan', 'coupe', 'suv', 'coupe', 'sedan', 'taxi', 'super']), v = G.vehicles.spawn(type, px, pz, ang + rnd(-0.03, 0.03), {}); v.parked = true; return v;
    } return null;
  }
  T.prime = () => {
    for (const v of [...G.vehicles.list]) if ((v.ai && v.ai.mode === 'traffic') || (v.parked && !v.driver && !v.stolen)) G.vehicles.remove(v);
    const nT = Math.round(52 * G.cfg.traffic), nP = Math.round(70 * G.cfg.parked); for (let i = 0; i < nT; i++) spawnDriver(true); for (let i = 0; i < nP; i++) spawnParked(true);
  };
  T.count = () => G.vehicles.list.filter(v => v.ai && v.ai.mode === 'traffic').length;
  T.update = (dt) => {
    const f = G.focus; T.sT = (T.sT || 0) - dt;
    if (T.sT <= 0) { T.sT = 0.12; const nT = Math.round(52 * G.cfg.traffic), nP = Math.round(70 * G.cfg.parked); let cT = 0, cP = 0; for (const v of G.vehicles.list) { if (v.ai && v.ai.mode === 'traffic') cT++; else if (v.parked && !v.driver) cP++; } if (cT < nT) spawnDriver(false); if (cP < nP) spawnParked(false); }
    // despawn far / lost vehicles
    T.dT = (T.dT || 0) - dt; if (T.dT <= 0) {
      T.dT = 0.5; G.camera.getWorldDirection(fw);
      for (const v of [...G.vehicles.list]) { if (v === G.player.vehicle || v.driver) continue; const dx = v.x - f.x, dz = v.z - f.z, d = Math.hypot(dx, dz), isT = v.ai && v.ai.mode === 'traffic', isP = v.parked && !v.stolen;
        if ((isT || isP) && d > 520) { G.vehicles.remove(v); continue; } if (isT && v.ai.lostT > 8 && d > 60 && (dx * fw.x + dz * fw.z) / d < 0.3) { G.vehicles.remove(v); continue; } if (isT && v.ai.stuckT > 20 && d > 100) { G.vehicles.remove(v); continue; } }
    }
  };
  return T;
}
