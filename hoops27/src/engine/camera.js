// Camera rig: Broadcast, Sideline Low, Behind-Basket, Player Cam, Dynamic. Critically-damped spring follow, FOV 38-50, lens breathing,
// and a raycast clamp so the camera never pushes through the stands.
import * as THREE from 'three';
import { HALF_L, HALF_W, RIM_X } from '../physics/world.js';

export const CAMERA_PRESETS = ['2k', 'high', 'stadium', 'low', 'drive', 'dynamic'];
export const CAMERA_LABEL = { '2k': '2K Camera', high: '2K Legacy / High', stadium: 'Broadcast Stadium', low: 'Broadcast Low', drive: 'Drive', dynamic: 'Dynamic (auto cuts)', basket: 'Behind basket', player: 'Player cam' };
export const CAMERA_INFO = {
  '2k': 'Wide, elevated side-court view. Best for reading passing lanes, open teammates and defenders.',
  high: 'Sky-view, high-angle look at the whole floor. Precise for passing lanes and 1v1 matchups.',
  stadium: 'TV-broadcast angle that keeps players large. Sacrifices some of the full-court view.',
  low: 'Close, low-down angle. Great for post play and clips, less practical for 5v5.',
  drive: 'Stadium angle that zooms in tight when you drive to the basket. Cinematic, not for competitive play.',
  dynamic: 'Automatic cuts between angles. Good for spectating.',
};
const LEGACY = { broadcast: '2k', sideline: 'low' };

/** Critically damped spring (Unity-style SmoothDamp) on a vector component set. */
function smooth(cur, target, vel, time, dt) {
  const w = 2 / Math.max(0.0001, time), x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = cur.clone().sub(target); const tmp = vel.clone().addScaledVector(d, w).multiplyScalar(dt);
  vel.sub(tmp.clone().multiplyScalar(w)).multiplyScalar(e);
  cur.copy(target).add(d.add(tmp).multiplyScalar(e));
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.mode = '2k'; this.pos = new THREE.Vector3(0, 10, 19); this.look = new THREE.Vector3(); this.pv = new THREE.Vector3(); this.lv = new THREE.Vector3();
    this.fov = 42; this.driveK = 0; this.time = 0; this.dynMode = 'broadcast'; this.dynUntil = 0; this.ray = new THREE.Raycaster(); this.colliders = []; this.clutch = false; this.shake = 0; this.reduced = false; this.orbit = null; this.speed = 0;
    this.shotCut = 0;
  }
  setMode(m) { this.mode = LEGACY[m] ?? m; this.dynUntil = 0; }
  next() { const i = CAMERA_PRESETS.indexOf(this.mode); this.setMode(CAMERA_PRESETS[(i + 1) % CAMERA_PRESETS.length]); return this.mode; }
  kick(a = 0.3) { if (!this.reduced) this.shake = Math.max(this.shake, a); }
  /** `s` = { ball, vel, holder, attackSide, ctrl (runtime player), phase } */
  update(dt, s) {
    this.time += dt;
    if (this.override) { const o = this.override(dt); if (o) { this.camera.position.copy(o.pos); this.camera.fov = o.fov ?? 40; this.camera.updateProjectionMatrix(); this.camera.lookAt(o.look); this.pos.copy(o.pos); this.look.copy(o.look); return; } }
    let mode = this.mode;
    if (mode === 'dynamic') {
      if (this.time > this.dynUntil) { const opts = ['2k', 'stadium', 'low', 'high', 'drive']; this.dynMode = opts[(Math.random() * opts.length) | 0]; this.dynUntil = this.time + 5 + Math.random() * 4; }
      mode = this.dynMode;
    }
    if (this.orbit) mode = 'orbit';
    const b = s.ball, bx = THREE.MathUtils.clamp(b.x, -HALF_L, HALF_L);
    const want = new THREE.Vector3(), tgt = new THREE.Vector3(); let fov = 42, tp = 0.38;
    const look = new THREE.Vector3(b.x + s.vel.x * 0.45, 0.9, THREE.MathUtils.clamp(b.z * 0.4, -3, 3));
    switch (mode) {
      case '2k': { // wide, elevated side-court: the whole floor stays in frame, the camera only drifts with play
        want.set(bx * 0.38 + s.vel.x * 0.12, 12.5, HALF_W + 11.5); tgt.set(bx * 0.4 + s.vel.x * 0.15, 0, -0.5); fov = 44; tp = 0.55; break; }
      case 'high': { // sky view: steep bird's-eye angle
        want.set(bx * 0.45, 27, HALF_W + 4.5); tgt.set(bx * 0.45, 0, 0.5); fov = 46; tp = 0.5; break; }
      case 'stadium': { // TV angle: closer, lower, leads the play so players stay large
        const dir = Math.sign(s.vel.x) || 0; want.set(bx * 0.92 + dir * 2.2 + s.vel.x * 0.2, 7.4, HALF_W + 10.2 - Math.min(2.5, Math.abs(s.vel.x) * 0.15)); tgt.set(bx + s.vel.x * 0.5, 0.9, -0.8); fov = 36; tp = 0.42; if (this.clutch) { want.z -= 1.6; want.y -= 0.8; fov -= 3; } break; }
      case 'low': { want.set(bx * 0.95 + s.vel.x * 0.12, 2.4, HALF_W + 6.2); tgt.set(bx + s.vel.x * 0.4, 1.15, 0); fov = 40; tp = 0.3; break; }
      case 'drive': { // stadium framing until the ball handler attacks the rim, then a tight chase cam
        const p = s.ctrl, side = s.attackSide || 1; let k = 0;
        if (p) { const sp = Math.hypot(p.vel.x, p.vel.z), dr = Math.hypot(p.pos.x - side * RIM_X, p.pos.z); const toward = (p.vel.x * (side * RIM_X - p.pos.x) + p.vel.z * -p.pos.z) / (sp * dr + 1e-3); k = p.hasBall && sp > 3.2 && dr < 11 && toward > 0.55 ? 1 : 0; }
        this.driveK += (k - this.driveK) * Math.min(1, dt * (k ? 4 : 1.6));
        const dir = Math.sign(s.vel.x) || 0; const bw = new THREE.Vector3(bx * 0.92 + dir * 2.2, 7.4, HALF_W + 10.2), bt = new THREE.Vector3(bx + s.vel.x * 0.5, 0.9, -0.8);
        let dw = bw, dt2 = bt, dfov = 36;
        if (p) { const fx = Math.cos(p.face), fz = Math.sin(p.face); dw = new THREE.Vector3(p.pos.x - fx * 4.6, 2.5, p.pos.z - fz * 4.6 + 1.2); dt2 = new THREE.Vector3(p.pos.x + fx * 3.5, 1.4, p.pos.z + fz * 3.5); dfov = 50; }
        want.lerpVectors(bw, dw, this.driveK); tgt.lerpVectors(bt, dt2, this.driveK); fov = 36 + (dfov - 36) * this.driveK; tp = 0.45 - 0.2 * this.driveK; break; }
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
