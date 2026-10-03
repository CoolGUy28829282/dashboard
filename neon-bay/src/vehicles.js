// Vehicles: archetype models, arcade-sim physics, damage / fire / explosions, manager with car-vs-car collisions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, rnd, pick, TAU, meshYaw, colorize, col, canvasTex, wrapAngle } from './util.js';

const ARCH = {
  sedan: { W: 1.85, yb: 0.3, arcs: [-1.45, 1.5], ar: 0.46, rear: -2.35, front: 2.35, nose: [[2.42, 0.5], [2.3, 0.76], [1.35, 0.9], [1.05, 0.96]], deck: [[-1.45, 0.96], [-2.2, 0.93], [-2.4, 0.78]], cabin: [[-1.55, 0.95], [-1.05, 1.43], [0.5, 1.43], [1.05, 0.95]], cabW: 1.52, roof: { w: 1.52, d: 1.55, y: 1.43, z: 0.275 }, wz: [-1.5, 1.45], wr: 0.34, hz: -2.35, hy: 0.66, tz: 2.35, ty: 0.84, len: 4.8, cOff: 1.25, cR: 1.0, hover: 0 },
  coupe: { W: 1.9, yb: 0.32, arcs: [-1.32, 1.35], ar: 0.5, rear: -2.2, front: 2.2, nose: [[2.27, 0.5], [2.12, 0.7], [1.2, 0.9], [0.95, 0.96]], deck: [[-1.3, 0.99], [-2.1, 0.97], [-2.24, 0.82]], cabin: [[-1.3, 0.96], [-0.72, 1.37], [0.25, 1.37], [0.95, 0.96]], cabW: 1.5, roof: { w: 1.5, d: 1.05, y: 1.395, z: 0.22 }, wz: [-1.35, 1.32], wr: 0.34, hz: -2.2, hy: 0.64, tz: 2.2, ty: 0.74, len: 4.5, cOff: 1.15, cR: 1.0, hover: 0, spoiler: 1.97 },
  super: { W: 1.95, yb: 0.3, arcs: [-1.45, 1.5], ar: 0.46, rear: -2.38, front: 2.38, nose: [[2.42, 0.42], [2.25, 0.56], [1.0, 0.7], [0.72, 0.78]], deck: [[-1.3, 0.9], [-2.3, 0.86], [-2.42, 0.7]], cabin: [[-1.0, 0.88], [-0.25, 1.19], [0.5, 1.2], [1.0, 0.74]], cabW: 1.45, roof: { w: 1.4, d: 0.75, y: 1.215, z: -0.125 }, wz: [-1.5, 1.45], wr: 0.35, hz: -2.4, hy: 0.52, tz: 2.4, ty: 0.8, len: 4.8, cOff: 1.25, cR: 1.02, hover: 0, spoiler: 2.1 },
  suv: { W: 1.98, yb: 0.36, arcs: [-1.5, 1.55], ar: 0.52, rear: -2.45, front: 2.45, nose: [[2.5, 0.62], [2.38, 1.0], [1.5, 1.08], [1.15, 1.14]], deck: [[-2.05, 1.16], [-2.4, 1.08], [-2.5, 0.8]], cabin: [[-2.15, 1.14], [-1.95, 1.82], [0.7, 1.82], [1.2, 1.14]], cabW: 1.7, roof: { w: 1.7, d: 2.6, y: 1.82, z: 0.62 }, wz: [-1.55, 1.5], wr: 0.4, hz: -2.5, hy: 0.85, tz: 2.5, ty: 1.0, len: 5.0, cOff: 1.35, cR: 1.05, hover: 0 },
};
// kind -> archetype, phys, look
export const TYPES = {
  sedan: { arche: 'sedan', name: 'Sedan', accel: 8, vmax: 44, brake: 28, grip: 7.5, mass: 1400, price: 0 },
  taxi: { arche: 'sedan', name: 'Taxi', paint: '#ffcf1f', taxi: true, accel: 8, vmax: 42, brake: 28, grip: 7.5, mass: 1450 },
  police: { arche: 'sedan', name: 'Police Cruiser', paint: '#12121c', police: true, accel: 12, vmax: 56, brake: 34, grip: 9, mass: 1700 },
  coupe: { arche: 'coupe', name: 'Coupe', accel: 10, vmax: 56, brake: 30, grip: 8.5, mass: 1300 },
  super: { arche: 'super', name: 'Supercar', accel: 14, vmax: 78, brake: 36, grip: 10, mass: 1250 },
  suv: { arche: 'suv', name: 'SUV', accel: 7, vmax: 42, brake: 26, grip: 7, mass: 2100 },
  swat: { arche: 'suv', name: 'SWAT Truck', paint: '#0c0c10', police: true, swat: true, accel: 9, vmax: 46, brake: 30, grip: 7.5, mass: 2600 },
  hover: { arche: 'super', name: 'Hover Racer', hover: 0.4, accel: 15, vmax: 82, brake: 36, grip: 11, mass: 1100 },
};
export const CIVIL = ['sedan', 'sedan', 'sedan', 'coupe', 'suv', 'suv', 'taxi', 'coupe', 'sedan', 'super', 'hover'];
export const PAINTS = ['#ffffff', '#ff7ab8', '#22d6c8', '#f5e27a', '#1d2a6a', '#b01a2a', '#101014', '#c8ccd8', '#ff8a3c', '#6a4ac8', '#2c8a5a', '#e8e8f0'];
const geoCache = {}, wheelGeoCache = {}, paintCache = {};
const M = {};

function initShared() {
  if (M.glass) return;
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x05070d, metalness: 0.9, roughness: 0.05, envMapIntensity: 2.4, clearcoat: 1 });
  M.wheel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 });
  M.head = new THREE.MeshBasicMaterial({ color: col('#fff2dc', 4) }); M.tail = new THREE.MeshBasicMaterial({ color: col('#ff2a2a', 3) }); M.brake = new THREE.MeshBasicMaterial({ color: col('#ff3a3a', 9) });
  M.black = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.6 }); M.white = new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.5 });
  M.charred = new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.9, metalness: 0.2 });
  M.shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, map: canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }, true, false) });
  M.glow = new THREE.SpriteMaterial({ map: M.shadow.map, color: col('#fff2dc', 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  M.glowRed = new THREE.SpriteMaterial({ map: M.shadow.map, color: col('#ff2a2a', 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  M.under = new THREE.MeshBasicMaterial({ map: M.shadow.map, color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
const paintMat = (hex, hover) => paintCache[hex + (hover ? 'h' : '')] ||= new THREE.MeshPhysicalMaterial({ color: hex, metalness: hover ? 0.9 : 0.7, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.8 });

function archeGeo(key) {
  if (geoCache[key]) return geoCache[key];
  const st = ARCH[key], yb = st.yb, body = new THREE.Shape();
  body.moveTo(st.rear, yb); body.lineTo(st.arcs[0] - st.ar, yb); body.absarc(st.arcs[0], yb, st.ar, Math.PI, 0, true); body.lineTo(st.arcs[1] - st.ar, yb); body.absarc(st.arcs[1], yb, st.ar, Math.PI, 0, true); body.lineTo(st.front, yb);
  [...st.nose, ...st.deck].forEach(p => body.lineTo(...p)); body.closePath();
  const ext = (shape, depth, bev) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev * 1.2, bevelSegments: 3, curveSegments: 14 }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; };
  const cab = new THREE.Shape(); st.cabin.forEach((p, i) => i ? cab.lineTo(...p) : cab.moveTo(...p)); cab.closePath();
  // merged small details: head/tail light blocks use their own materials, so keep them separate
  return geoCache[key] = { body: ext(body, st.W - 0.16, 0.08), cabin: ext(cab, st.cabW, 0.04), roof: new THREE.BoxGeometry(st.roof.w, 0.05, st.roof.d), shadow: new THREE.PlaneGeometry(st.W + 0.9, st.len + 1.2).rotateX(-Math.PI / 2),
    head: new THREE.BoxGeometry(0.5, 0.09, 0.1), tail: new THREE.BoxGeometry(st.W - 0.2, 0.08, 0.08), spoiler: new THREE.BoxGeometry(st.W - 0.2, 0.05, 0.36), strut: new THREE.BoxGeometry(0.05, 0.16, 0.05) };
}
function wheelGeo(wr) {
  const k = wr.toFixed(2); if (wheelGeoCache[k]) return wheelGeoCache[k];
  const parts = []; const tire = new THREE.CylinderGeometry(wr, wr, 0.26, 20).rotateZ(Math.PI / 2); colorize(tire, new THREE.Color('#0b0b0e')); parts.push(tire);
  const rim = new THREE.CylinderGeometry(wr * 0.67, wr * 0.67, 0.275, 12).rotateZ(Math.PI / 2); colorize(rim, new THREE.Color('#aab0c0')); parts.push(rim);
  for (let i = 0; i < 5; i++) { const s = new THREE.BoxGeometry(0.29, wr * 1.2, 0.04); s.rotateX(i * TAU / 5); colorize(s, new THREE.Color('#222')); parts.push(s); }
  return wheelGeoCache[k] = mergeGeometries(parts);
}

let VID = 1;
export class Vehicle {
  constructor(G, typeKey, x, z, a, opts = {}) {
    initShared(); this.G = G; this.id = VID++; this.type = typeKey; const T = TYPES[typeKey]; this.T = T; this.st = ARCH[T.arche]; this.name = T.name;
    this.x = x; this.z = z; this.a = a; this.y = G.world.groundY(x, z); this.vx = 0; this.vz = 0; this.w = 0; this.steer = 0; this.inp = { thr: 0, brk: 0, hb: 0, steer: 0 };
    this.health = 1000; this.maxHealth = 1000; this.driver = null; this.ai = null; this.owner = null; this.exploded = false; this.fuse = -1; this.burn = 0; this.pitch = 0; this.roll = 0; this.lastVl = 0; this.lastVf = 0; this.wheelSpin = 0; this.steerAng = 0;
    this.mass = T.mass; this.police = !!T.police; this.dead = false; this.age = 0; this.parked = false; this.paint = opts.paint || T.paint || pick(PAINTS); this.hover = T.hover || 0; this.stolen = false; this.sirenOn = false; this.crash = 0;
    this.buildMesh(opts);
  }
  buildMesh(opts) {
    const st = this.st, G = geoOf(this), grp = new THREE.Group(), inner = new THREE.Group(); inner.position.y = this.hover; grp.add(inner); grp.rotation.order = 'YXZ'; this.mesh = grp; this.inner = inner;
    const mk = (geo, mat, x = 0, y = 0, z = 0, parent = inner) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    this.bodyMat = paintMat(this.paint, this.hover); this.bodyMesh = mk(G.body, this.bodyMat); this.bodyMesh.castShadow = true; mk(G.cabin, M.glass).castShadow = true; mk(G.roof, this.bodyMat, 0, st.roof.y, st.roof.z);
    if (st.spoiler && opts.spoiler !== false) { mk(G.spoiler, this.bodyMat, 0, st.hy + 0.5, st.spoiler); mk(G.strut, M.black, -0.5, st.hy + 0.42, st.spoiler); mk(G.strut, M.black, 0.5, st.hy + 0.42, st.spoiler); }
    for (const x of [-0.62, 0.62]) mk(G.head, M.head, x, st.hy, st.hz);
    this.tailMesh = mk(G.tail, M.tail, 0, st.ty, st.tz);
    this.wheels = [];
    if (!this.hover) { const wg = wheelGeo(st.wr); for (const [sx, z, front] of [[-1, st.wz[0], 1], [1, st.wz[0], 1], [-1, st.wz[1], 0], [1, st.wz[1], 0]]) { const wh = new THREE.Group(); wh.position.set(sx * (st.W / 2 - 0.08), st.wr, z); const m = new THREE.Mesh(wg, M.wheel); wh.add(m); wh.userData = { front, m, sx }; grp.add(wh); this.wheels.push(wh); } }
    else for (const x of [-0.6, 0.6]) { const s = new THREE.Sprite(M.glow.clone()); s.material.color = col('#22e6ff', 2); s.position.set(x, this.hover + 0.5, st.tz + 0.3); s.scale.setScalar(1.8); grp.add(s); }
    const sh = new THREE.Mesh(G.shadow, M.shadow); sh.position.y = 0.04; sh.renderOrder = 1; grp.add(sh); this.shadow = sh;
    const addS = (m, x, y, z, s) => { const p = new THREE.Sprite(m); p.position.set(x, y + this.hover, z); p.scale.setScalar(s); grp.add(p); return p; };
    this.headGlow = [-0.62, 0.62].map(x => addS(M.glow, x, st.hy, st.hz - 0.2, 1.7)); this.tailGlow = [-0.7, 0.7].map(x => addS(M.glowRed, x, st.ty, st.tz + 0.2, 1.2));
    if (this.T.police) { // livery + light bar
      for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.04, 0.5, this.T.swat ? 2.4 : 1.6), M.white, sx * (st.W / 2 + 0.005), st.hy - 0.05, 0.1);
      this.barR = new THREE.MeshBasicMaterial({ color: col('#ff1020', 1) }); this.barB = new THREE.MeshBasicMaterial({ color: col('#2040ff', 1) });
      mk(new THREE.BoxGeometry(0.55, 0.14, 0.28), this.barR, -0.3, st.roof.y + 0.1, st.roof.z); mk(new THREE.BoxGeometry(0.55, 0.14, 0.28), this.barB, 0.3, st.roof.y + 0.1, st.roof.z);
      this.barGlowR = addS(M.glowRed, -0.3, st.roof.y + 0.3, st.roof.z, 1.3); this.barGlowB = addS(new THREE.SpriteMaterial({ map: M.shadow.map, color: col('#3050ff', 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }), 0.3, st.roof.y + 0.3, st.roof.z, 1.3);
    }
    if (this.T.taxi) { const s = mk(new THREE.BoxGeometry(0.5, 0.17, 0.22), new THREE.MeshBasicMaterial({ color: col('#fff6c0', 2) }), 0, st.roof.y + 0.13, st.roof.z); s.name = 'taxisign'; }
    this.neon = null; const wantNeon = opts.neon !== undefined ? opts.neon : (!this.police && Math.random() < 0.28 && !this.T.taxi);
    if (wantNeon || this.hover) { const m = new THREE.Mesh(new THREE.PlaneGeometry(st.W + 1.8, st.len + 1.8).rotateX(-Math.PI / 2), M.under.clone()); m.material.color = col(pick(['#ff2d95', '#22e6ff', '#b86bff', '#8cff5a', '#ffb02e']), 1.3); m.position.y = 0.07; m.renderOrder = 1; grp.add(m); this.neon = m; }
    grp.traverse(o => { if (o.isMesh && o !== sh && o !== this.neon) o.frustumCulled = true; });
    this.G.scene.add(grp);
  }
  circles() { const f = this.st.cOff, c = Math.cos(this.a), s = Math.sin(this.a); return [[this.x + c * f, this.z + s * f, this.st.cR], [this.x - c * f, this.z - s * f, this.st.cR]]; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwd() { return this.vx * Math.cos(this.a) + this.vz * Math.sin(this.a); }
  damage(amount, src, silent) {
    if (this.exploded) return; if (this.driver === this.G.player && this.G.cfg.godMode) amount *= 0.1; this.health -= amount; this.crash = Math.max(this.crash, amount);
    if (this.health <= 0 && this.fuse < 0) { this.fuse = 1.2 + Math.random() * 1.2; this.killer = src; if (this.police && src === this.G.player) this.G.police && this.G.police.crime('killcopcar', this.x, this.z); }
  }
  explode() {
    this.exploded = true; this.fuse = -1; const G = this.G; G.fx.explosion(this.x, this.y + 0.8, this.z, 9, 240, this.killer);
    this.bodyMesh.material = M.charred; this.inner.children.forEach(m => { if (m.isMesh && m.material === this.bodyMat) m.material = M.charred; });
    this.vy = 7; this.vx += rnd(-3, 3); this.vz += rnd(-3, 3); this.w += rnd(-2, 2); this.driver && G.vehicles.killDriver(this); this.ai = null; this.inp.thr = this.inp.brk = 0; this.inp.hb = 1; this.dead = true; this.deadT = 45;
    if (this.barR) { this.barR.color.setScalar(0.03); this.barB.color.setScalar(0.03); this.barGlowR.visible = this.barGlowB.visible = false; }
    this.headGlow.forEach(s => { s.visible = false; }); this.tailGlow.forEach(s => { s.visible = false; });
  }
  step(dt) {
    if (!(dt > 0)) return; const G = this.G, T = this.T, world = G.world, inp = this.inp;
    if (this.exploded) { inp.thr = 0; inp.brk = 0; inp.hb = 1; }
    const c = Math.cos(this.a), s = Math.sin(this.a), rx = -s, rz = c;
    let vf = this.vx * c + this.vz * s, vl = this.vx * rx + this.vz * rz; const sp = Math.abs(vf);
    this.steer = lerp(this.steer, inp.steer, Math.min(1, dt * (sp > 20 ? 5 : 9)));
    let acc = 0; const thr = inp.thr, hb = inp.hb;
    if (thr > 0) { acc = thr * T.accel * (1 - clamp(vf / T.vmax, 0, 1)) * (this.health < 250 ? 0.7 : 1); if (vf < -0.5) acc += thr * T.brake; }
    else if (thr < 0) { if (vf > 0.6) acc = thr * T.brake; else acc = thr * T.accel * 0.55 * (1 - clamp(-vf / (T.vmax * 0.25), 0, 1)); }
    if (inp.brk > 0) { if (sp > 0.4) acc -= Math.sign(vf) * T.brake * inp.brk; else vf = 0; }
    acc -= vf * 0.1 + vf * Math.abs(vf) * 0.0016; if (hb) acc -= Math.sign(vf) * T.brake * 0.3;
    if (!this.driver && !this.ai && !thr) acc -= Math.sign(vf) * Math.min(Math.abs(vf) / Math.max(dt, 1e-3), 3);
    vf += acc * dt;
    const grip = hb ? 1.3 : T.grip * (this.driver === G.player ? 1 : 1.15); vl *= Math.exp(-grip * dt * (sp < 1 ? 3 : 1));
    // yaw rate from steering (bicycle model)
    const maxSt = lerp(0.62, 0.15, clamp(sp / 38, 0, 1)); this.steerAng = this.steer * maxSt; const target = (vf / 2.9) * Math.tan(this.steerAng) * (hb ? 1.5 : 1);
    this.w = lerp(this.w, target, Math.min(1, dt * (hb ? 4 : 9))); this.w *= Math.exp(-0.15 * dt);
    this.vx = c * vf + rx * vl; this.vz = s * vf + rz * vl; this.a += this.w * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // world collisions (two circles)
    const out = this._out || (this._out = {}); let hit = 0;
    for (let it = 0; it < 2; it++) for (const [cx, cz, r] of this.circles()) {
      if (world.collideCircle(cx, cz, r, out)) {
        const nx = out.nx, nz = out.nz; this.x += nx * out.depth; this.z += nz * out.depth; const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) { this.vx -= 1.25 * vn * nx; this.vz -= 1.25 * vn * nz; const ang = (cx - this.x) * nz - (cz - this.z) * nx; this.w += ang * vn * 0.04; hit = Math.max(hit, -vn); }
      }
    }
    if (hit > 3.5) { this.damage((hit - 3) * 11 * (G.difficultyMul || 1), null); G.fx.sparks(this.x + Math.cos(this.a) * 1.5, this.y + 0.5, this.z + Math.sin(this.a) * 1.5, 8, 5); if (this.driver) this.onCrash && this.onCrash(hit); this.crashSpeed = hit; if (G.audio && hit > 5) G.audio.thud(clamp(hit / 20, 0.2, 1), Math.hypot(G.camera.position.x - this.x, G.camera.position.z - this.z)); }
    // ground + suspension
    const gy = world.groundY(this.x, this.z); this.vy = (this.vy || 0); if (this.y > gy + 0.02 || this.vy > 0) { this.vy -= 16 * dt; this.y += this.vy * dt; if (this.y <= gy) { this.y = gy; this.vy = 0; } } else this.y = lerp(this.y, gy, Math.min(1, dt * 14));
    const ax = (vf - this.lastVf) / Math.max(dt, 1e-3), al = (vl - this.lastVl) / Math.max(dt, 1e-3); this.lastVf = vf; this.lastVl = vl;
    this.pitch = lerp(this.pitch, clamp(ax * 0.0035, -0.07, 0.07), Math.min(1, dt * 6)); this.roll = lerp(this.roll, clamp(-this.w * sp * 0.0022 + al * 0.002, -0.12, 0.12), Math.min(1, dt * 6));
    this.wheelSpin += vf * dt / this.st.wr;
    // burning / smoke
    const frac = this.health / this.maxHealth; if (!this.exploded) { if (frac < 0.4) G.fx.smoke(this.x + c * this.st.len * 0.3, this.y + 1, this.z + s * this.st.len * 0.3, Math.random() < dt * 12 ? 1 : 0, 0.18 + 0.2 * frac, 1.1); if (frac < 0.18) G.fx.fire(this.x + c * this.st.len * 0.3, this.y + 0.9, this.z + s * this.st.len * 0.3, Math.random() < dt * 20 ? 1 : 0, 0.7); if (this.fuse > 0) { this.fuse -= dt; G.fx.fire(this.x, this.y + 0.9, this.z, 1, 1); if (this.fuse <= 0) this.explode(); } }
    // tyre smoke / dust
    if (!this.hover && (Math.abs(vl) > 4.5 || (hb && sp > 7) || (thr > 0.9 && sp < 5 && sp > 0.5 && T.accel > 13))) for (const sx of [-1, 1]) if (Math.random() < dt * 40) G.fx.tireSmoke(this.x - c * 1.4 + rx * sx * 0.8, this.z - s * 1.4 + rz * sx * 0.8, this.y + 0.12);
    if (this.hover && sp > 6 && Math.random() < dt * 30) G.fx.dust(this.x - c * 2, this.y + 0.2, this.z - s * 2, 1, 0.4);
  }
  sync(night, t) {
    const m = this.mesh; m.position.set(this.x, this.y, this.z); m.rotation.set(this.pitch, meshYaw(this.a), this.roll);
    if (this.wheels.length) { const sa = this.steerAng; for (const wh of this.wheels) { wh.userData.m.rotation.x = this.wheelSpin; wh.rotation.y = wh.userData.front ? -sa : 0; } }
    const braking = this.inp.brk > 0.1 || (this.inp.thr < 0 && this.fwd > 0.6); this.tailMesh.material = braking ? M.brake : M.tail;
    const lights = night > 0.25 && !this.exploded; for (const s of this.headGlow) { s.visible = lights; } for (const s of this.tailGlow) { s.visible = (lights || braking) && !this.exploded; s.scale.setScalar(braking ? 2.2 : 1.1); }
    if (this.neon) { this.neon.visible = night > 0.2; this.neon.material.opacity = 0.35 + 0.5 * night; }
    if (this.barR) { const ph = this.sirenOn ? Math.floor(t * 8) % 2 : -1, on = this.sirenOn && !this.exploded; this.barR.color.copy(col('#ff1020', on && ph === 0 ? 6 : 0.4)); this.barB.color.copy(col('#2040ff', on && ph === 1 ? 6 : 0.4)); this.barGlowR.visible = on && ph === 0; this.barGlowB.visible = on && ph === 1; }
    this.shadow.position.y = 0.04 - (this.y - this.G.world.groundY(this.x, this.z));
  }
  dispose() { this.G.scene.remove(this.mesh); this.mesh.traverse(o => { if (o.isSprite && o.material && !Object.values(M).includes(o.material)) o.material.dispose(); }); }
}
const geoOf = v => archeGeo(v.T.arche);

export class VehicleManager {
  constructor(G) { this.G = G; this.list = []; initShared(); this.t = 0; }
  spawn(typeKey, x, z, a, opts) { const v = new Vehicle(this.G, typeKey, x, z, a, opts); this.list.push(v); return v; }
  remove(v) { const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1); v.dispose(); }
  killDriver(v) { const d = v.driver; v.driver = null; if (d && d.onVehicleDestroyed) d.onVehicleDestroyed(v); }
  nearest(x, z, maxD, filter) { let best = null, bd = maxD * maxD; for (const v of this.list) { if (filter && !filter(v)) continue; const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; }
  update(dt) {
    const G = this.G, night = G.uniforms.night.value; this.t += dt; const list = this.list, cp = G.camera.position;
    for (const v of list) { v.age += dt; if (v.ai) v.ai.update(v, dt); v.step(dt); if (!isFinite(v.x + v.z + v.vx + v.vz + v.a)) { v.x = isFinite(v.x) ? v.x : 0; v.z = isFinite(v.z) ? v.z : 0; v.vx = v.vz = v.w = 0; if (!isFinite(v.a)) v.a = 0; } }
    // car vs car
    for (let i = 0; i < list.length; i++) { const A = list[i]; for (let j = i + 1; j < list.length; j++) { const B = list[j]; const dx = A.x - B.x, dz = A.z - B.z; if (dx * dx + dz * dz > 42) continue; this.collide(A, B); } }
    for (let i = list.length - 1; i >= 0; i--) { const v = list[i]; if (v.dead) { v.deadT -= dt; if (v.deadT <= 0 && v !== G.player.vehicle) { this.remove(v); continue; } } const d2 = (v.x - cp.x) ** 2 + (v.z - cp.z) ** 2; const vis = d2 < Math.min(G.cfg.viewDist * 0.8, 380) ** 2 || v === G.player.vehicle; v.mesh.visible = vis; if (vis) v.sync(night, this.t); }
  }
  collide(A, B) {
    const ca = A.circles(), cb = B.circles(); let worst = 0;
    for (const [ax, az, ar] of ca) for (const [bx, bz, br] of cb) {
      const dx = ax - bx, dz = az - bz, rr = ar + br, d2 = dx * dx + dz * dz; if (d2 >= rr * rr) continue; const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d, pen = rr - d, ma = A.mass, mb = B.mass, tot = ma + mb;
      A.x += nx * pen * mb / tot; A.z += nz * pen * mb / tot; B.x -= nx * pen * ma / tot; B.z -= nz * pen * ma / tot;
      const rv = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz; if (rv < 0) { const j = -(1 + 0.3) * rv / (1 / ma + 1 / mb); A.vx += j * nx / ma; A.vz += j * nz / ma; B.vx -= j * nx / mb; B.vz -= j * nz / mb; worst = Math.max(worst, -rv); const sgn = ((ax - A.x) * nz - (az - A.z) * nx); A.w += sgn * rv * 0.02; B.w -= ((bx - B.x) * nz - (bz - B.z) * nx) * rv * 0.02; }
    }
    if (worst > 3) { const G = this.G, dmg = (worst - 2.5) * 9 * (G.difficultyMul || 1); A.damage(dmg * B.mass / A.mass * 0.7, B.driver); B.damage(dmg * A.mass / B.mass * 0.7, A.driver); G.fx.sparks((A.x + B.x) / 2, 0.7, (A.z + B.z) / 2, 10, 6); if (A.driver) A.onCrash && A.onCrash(worst, B); if (B.driver) B.onCrash && B.onCrash(worst, A); if (A.ai && A.ai.bump) A.ai.bump(B, worst); if (B.ai && B.ai.bump) B.ai.bump(A, worst); if (G.audio && worst > 5) G.audio.thud(clamp(worst / 20, 0.2, 1), Math.hypot(G.camera.position.x - A.x, G.camera.position.z - A.z)); if (G.onVehicleCollision) G.onVehicleCollision(A, B, worst); }
  }
}
