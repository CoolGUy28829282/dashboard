// Camera rig: Broadcast, Sideline Low, Behind-Basket, Player Cam, Dynamic. Critically-damped spring follow, FOV 38-50, lens breathing,
// and a raycast clamp so the camera never pushes through the stands.
import * as THREE from 'three';
import { HALF_L, HALF_W } from '../physics/world.js';

export const CAMERA_PRESETS = ['broadcast', 'sideline', 'basket', 'player', 'dynamic'];
export const CAMERA_LABEL = { broadcast: 'Broadcast', sideline: 'Sideline low', basket: 'Behind basket', player: 'Player cam', dynamic: 'Dynamic' };

/** Critically damped spring (Unity-style SmoothDamp) on a vector component set. */
function smooth(cur, target, vel, time, dt) {
  const w = 2 / Math.max(0.0001, time), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = cur.clone().sub(target); const tmp = vel.clone().addScaledVector(d, w).multiplyScalar(dt);
  vel.sub(tmp.clone().multiplyScalar(w)).multiplyScalar(e);
  cur.copy(target).add(d.add(tmp).multiplyScalar(e));
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.mode = 'broadcast'; this.pos = new THREE.Vector3(0, 10, 19); this.look = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.lv = new THREE.Vector3();
    this.fov = 42; this.time = 0; this.dynMode = 'broadcast'; this.dynUntil = 0; this.ray = new THREE.Raycaster(); this.colliders = []; this.clutch = false; this.shake = 0; this.reduced = false; this.orbit = null; this.speed = 0;
    this.shotCut = 0;
  }
  setMode(m) { this.mode = m; this.dynUntil = 0; }
  next() { const i = CAMERA_PRESETS.indexOf(this.mode); this.setMode(CAMERA_PRESETS[(i + 1) % CAMERA_PRESETS.length]); return this.mode; }
  kick(a = 0.3) { if (!this.reduced) this.shake = Math.max(this.shake, a); }
  /** `s` = { ball, vel, holder, attackSide, ctrl (runtime player), phase } */
  update(dt, s) {
    this.time += dt;
    if (this.override) { const o = this.override(dt); if (o) { this.camera.position.copy(o.pos); this.camera.fov = o.fov ?? 40; this.camera.updateProjectionMatrix(); this.camera.lookAt(o.look); this.pos.copy(o.pos); this.look.copy(o.look); return; } }
    let mode = this.mode;
    if (mode === 'dynamic') {
      if (this.time > this.dynUntil) { const opts = ['broadcast', 'broadcast', 'sideline', 'basket', 'player']; this.dynMode = opts[(Math.random() * opts.length) | 0]; this.dynUntil = this.time + 5 + Math.random() * 4; }
      if (this.shotCut > this.time) this.dynMode = 'basket'; mode = this.dynMode;
    }
    if (this.orbit) mode = 'orbit';
    const b = s.ball, bx = THREE.MathUtils.clamp(b.x, -HALF_L, HALF_L);
    const want = new THREE.Vector3(), tgt = new THREE.Vector3(); let fov = 42, tp = 0.38;
    const look = new THREE.Vector3(b.x + s.vel.x * 0.45, 0.9, THREE.MathUtils.clamp(b.z * 0.4, -3, 3));
    switch (mode) {
      case 'orbit': { const o = this.orbit; o.a += dt * o.speed; want.set(o.c.x + Math.cos(o.a) * o.r, o.c.y + 2.2, o.c.z + Math.sin(o.a) * o.r); tgt.copy(o.c); fov = 40; tp = 0.15; break; }
      case 'sideline': want.set(bx * 0.92, 1.7, HALF_W + 2.6); tgt.copy(look); tgt.y = 1.3; fov = 46; tp = 0.28; break;
      case 'basket': { const sd = s.attackSide || 1; want.set(sd * (HALF_L + 6.2), 4.4, THREE.MathUtils.clamp(b.z * 0.3, -2, 2)); tgt.set(sd * (HALF_L - 5), 2.2, b.z * 0.3); fov = 42; tp = 0.34; break; }
      case 'player': { const p = s.ctrl; if (p) { const fx = Math.cos(p.face), fz = Math.sin(p.face); want.set(p.pos.x - fx * 4.4, 2.8, p.pos.z - fz * 4.4); tgt.set(p.pos.x + fx * 4, 1.3, p.pos.z + fz * 4); } else { want.set(bx, 6, -12); tgt.copy(look); } fov = 50; tp = 0.22; break; }
      default: { // broadcast: side-high, follows with look-ahead, FOV widens with ball speed
        const spread = Math.min(1, Math.hypot(s.vel.x, s.vel.z) / 14);
        want.set(bx * 0.82 + s.vel.x * 0.25, 10.2 + spread * 0.8, HALF_W + 9.4); tgt.copy(look); fov = 38 + spread * 10; tp = 0.46; if (this.clutch) { want.z *= 0.86; want.y *= 0.9; fov -= 3; }
      }
    }
    fov += Math.sin(this.time * 0.6) * 0.45; // lens breathing
    this.fov += (fov - this.fov) * Math.min(1, dt * 2.4);
    // clamp against stands with a raycast from the target to the desired camera position
    if (this.colliders.length) {
      const dir = want.clone().sub(tgt); const dist = dir.length(); this.ray.set(tgt, dir.normalize()); this.ray.far = dist;
      const hit = this.ray.intersectObjects(this.colliders, false)[0]; if (hit) want.copy(tgt).addScaledVector(dir, Math.max(1.5, hit.distance - 0.6));
    }
    want.y = Math.max(0.9, want.y);
    const t = this.mode === 'dynamic' && this.time < this.dynUntil - 4.2 ? 0.05 : tp;
    smooth(this.pos, want, this.pv, t, dt); smooth(this.look, tgt, this.lv, tp * 0.8, dt);
    this.speed = this.pv.length();
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * sh * 0.35, this.pos.y + (Math.random() - 0.5) * sh * 0.25, this.pos.z + (Math.random() - 0.5) * sh * 0.3);
    this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.look);
  }
  snap() { this.pv.set(0, 0, 0); this.lv.set(0, 0, 0); }
}
