// Procedural stylised athletes: articulated rig (capsule limbs), pose-blend animation state machine, analytic two-bone IK for
// hand-to-ball, ground-clamp foot IK, jersey shader/texture with name + number, and LOD. A glTF path is available via AthleteFactory.useGLTF().
import * as THREE from 'three';
import { COLORS } from '../tuning.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const jerseyCache = new Map();
const DOWN = V(0, -1, 0);

export function jerseyTexture(team, player) {
  const key = team.id + player.number + player.name;
  if (jerseyCache.has(key)) return jerseyCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const p = team.colors.primary, s = team.colors.secondary;
  const grd = g.createLinearGradient(0, 0, 512, 256); grd.addColorStop(0, shade(p, 0.55)); grd.addColorStop(1, shade(p, 0.25));
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  // futuristic fabric: hex mesh + diagonal energy trim
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let y = 0; y < 260; y += 10) for (let x = 0; x < 520; x += 12) { const ox = (y / 10) % 2 ? 6 : 0; g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const px = x + ox + Math.cos(a) * 5, py = y + Math.sin(a) * 5; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.stroke(); }
  g.fillStyle = p; g.globalAlpha = 0.9; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22); g.globalAlpha = 1;
  g.fillStyle = s; g.shadowColor = s; g.shadowBlur = 14; g.fillRect(0, 22, 512, 5); g.fillRect(0, 229, 512, 5); g.shadowBlur = 0;
  // front half (x 0..256) = chest number; back half (256..512) = name + number
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = s; g.shadowBlur = 12;
  g.font = '800 120px Orbitron, Rajdhani, sans-serif'; g.fillText(String(player.number), 128, 160); g.fillText(String(player.number), 384, 190);
  g.font = '700 28px Orbitron, Rajdhani, sans-serif'; g.fillText(player.name.split(' ').pop().toUpperCase(), 384, 80);
  g.font = '600 20px Orbitron, sans-serif'; g.fillText(team.abbr, 128, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  jerseyCache.set(key, tex); return tex;
}
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = ((n >> 16) & 255) * f, gg = ((n >> 8) & 255) * f, b = (n & 255) * f; return `rgb(${r | 0},${gg | 0},${b | 0})`; }

const SKIN_TONES = [0xf1c9a5, 0xd9a273, 0xb67a4c, 0x8a5634, 0x5e3a22, 0x3f2616];
const shared = { skin: new Map(), shorts: new Map(), shoe: null };

/** Solve a two-bone chain so that the end effector reaches `target` (in the upper bone's parent space). */
const _u = V(), _p = V(), _d1 = V(), _el = V(), _ld = V(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
export function twoBoneIK(upper, lower, L1, L2, target, pole) {
  const S = upper.position; _u.copy(target).sub(S); let d = _u.length(); const maxD = L1 + L2 - 1e-3, minD = Math.abs(L1 - L2) + 1e-3;
  _u.normalize(); d = Math.min(maxD, Math.max(minD, d));
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), a = Math.acos(cosA);
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u)); if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1); _p.normalize();
  _d1.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_p, Math.sin(a)).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _d1);
  _el.copy(S).addScaledVector(_d1, L1);
  _ld.copy(target).sub(_el); if (_ld.lengthSq() > L2 * L2) _ld.setLength(L2); _ld.normalize();
  _qi.copy(upper.quaternion).invert(); _ld.applyQuaternion(_qi);
  lower.quaternion.setFromUnitVectors(DOWN, _ld);
}

export class Athlete {
  constructor(runtime, team, opts = {}) {
    this.p = runtime; this.team = team;
    const s = runtime.height / 1.98; this.s = s;
    this.root = new THREE.Group(); this.root.name = runtime.name;
    this.pose = { ...REST }; this.phase = Math.random() * 6; this.k = { ...team.colors };
    this.lod = new THREE.LOD(); this.rigGroup = new THREE.Group(); this.buildRig(s, runtime, team); this.lod.addLevel(this.rigGroup, 0);
    this.lod.addLevel(this.buildLow(s, team), 42);
    this.root.add(this.lod);
    this.ringMat = new THREE.MeshBasicMaterial({ color: team.colors.primary, transparent: true, opacity: 0.0, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.02; this.root.add(this.ring);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.012; this.root.add(this.shadow);
    this.handTarget = V(); this.lastBallLocal = V(); this.fireLight = null;
  }
  buildRig(s, rt, team) {
    const skinC = SKIN_TONES[(rt.number * 7 + rt.name.length) % SKIN_TONES.length];
    const skin = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.65, metalness: 0.0 });
    const jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(team, rt.data), roughness: 0.55, metalness: 0.15, emissive: new THREE.Color(team.colors.primary), emissiveIntensity: 0.16 });
    const shorts = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors.primary).multiplyScalar(0.45), roughness: 0.6, metalness: 0.1, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.12 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.55 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.1, metalness: 0.9, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.9 });
    const cap = (r, h, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r * s, Math.max(0.001, (h - 2 * r) * s), 4, 8), mat); m.position.y = -(h * s) / 2; m.castShadow = true; return m; };
    this.L = { thigh: 0.47 * s, shin: 0.46 * s, upper: 0.31 * s, fore: 0.29 * s, torso: 0.58 * s, hipY: 0.93 * s, shoulderY: 0.56 * s, shoulderX: 0.21 * s, hipX: 0.1 * s };
    const L = this.L; const j = this.j = {};
    j.hips = new THREE.Group(); j.hips.position.y = L.hipY; this.rigGroup.add(j.hips);
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * s, 0.14 * s, 4, 8), shorts); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.8); pelvis.castShadow = true; j.hips.add(pelvis);
    j.spine = new THREE.Group(); j.hips.add(j.spine);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, L.torso, 14, 1, false), [jersey]); torso.position.y = L.torso / 2; torso.scale.z = 0.62; torso.castShadow = true;
    torso.rotation.y = Math.PI / 2; // texture seam on side, front faces +x of the rig
    j.spine.add(torso);
    j.neck = new THREE.Group(); j.neck.position.y = L.torso; j.spine.add(j.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115 * s, 16, 12), skin); head.position.y = 0.13 * s; head.castShadow = true; j.neck.add(head);
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.045 * s, 0.17 * s), visor); vis.position.set(0.075 * s, 0.15 * s, 0); j.neck.add(vis);
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0, L.shoulderY, side * L.shoulderX); j.spine.add(sh); j[side < 0 ? 'lSh' : 'rSh'] = sh;
      const up = cap(0.055, L.upper / s + 0.11, skin); sh.add(up);
      const el = new THREE.Group(); el.position.y = -L.upper; sh.add(el); j[side < 0 ? 'lEl' : 'rEl'] = el;
      el.add(cap(0.045, L.fore / s + 0.09, skin));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058 * s, 10, 8), skin); hand.position.y = -L.fore; el.add(hand); j[side < 0 ? 'lHand' : 'rHand'] = hand;
      const hip = new THREE.Group(); hip.position.set(0, 0, side * L.hipX); j.hips.add(hip); j[side < 0 ? 'lHip' : 'rHip'] = hip;
      hip.add(cap(0.085, L.thigh / s + 0.17, shorts));
      const kn = new THREE.Group(); kn.position.y = -L.thigh; hip.add(kn); j[side < 0 ? 'lKn' : 'rKn'] = kn;
      kn.add(cap(0.065, L.shin / s + 0.13, skin));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28 * s, 0.09 * s, 0.11 * s), shoe); foot.position.set(0.07 * s, -L.shin - 0.03 * s, 0); foot.castShadow = true; kn.add(foot); j[side < 0 ? 'lFoot' : 'rFoot'] = foot;
    }
  }
  buildLow(s, team) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s, 1.3 * s, 3, 6), new THREE.MeshStandardMaterial({ color: team.colors.primary, roughness: 0.6, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.1 }));
    body.position.y = 0.95 * s; g.add(body); return g;
  }

  /** Update from sim state. `ballLocal` is the ball position in the athlete's root space (for IK). */
  update(dt, rt, ball, ctx) {
    const root = this.root; root.position.set(rt.pos.x, 0, rt.pos.z); root.rotation.y = -rt.face;
    if (this.lod.getCurrentLevel() > 0) { this.ring.rotation.z += 0; this.updateRing(rt, ctx); return; }
    const sp = Math.hypot(rt.vel.x, rt.vel.z), a = rt.action, j = this.j, P = this.pose, s = this.s;
    // facing-relative velocity (for lateral shuffles)
    const fx = Math.cos(rt.face), fz = Math.sin(rt.face); const fwd = rt.vel.x * fx + rt.vel.z * fz, lat = -rt.vel.x * fz + rt.vel.z * fx;
    this.phase += dt * (3.2 + sp * 1.55);
    const off = rt.hasBall; const defending = !off && ctx.defense;
    const T = { ...REST };
    // ---- blend tree: locomotion (idle <-> run) + stance (offence / defence) + action layer
    const run = Math.min(1, sp / 5.2), cyc = Math.sin(this.phase), cyc2 = Math.sin(this.phase + Math.PI);
    const backward = fwd < -0.6;
    T.lHip = cyc * 0.95 * run * (backward ? -0.7 : 1); T.rHip = cyc2 * 0.95 * run * (backward ? -0.7 : 1);
    T.lKn = Math.max(0, -cyc) * 1.25 * run + 0.05; T.rKn = Math.max(0, -cyc2) * 1.25 * run + 0.05;
    T.lShP = cyc2 * 0.8 * run; T.rShP = cyc * 0.8 * run; T.lEl = 0.5 + 0.7 * run; T.rEl = 0.5 + 0.7 * run;
    T.lean = 0.12 * run + Math.min(0.18, Math.abs(fwd) * 0.03); T.crouch = 0.0 + 0.025 * run;
    if (defending) { // defensive stance: low, wide, arms out, shuffle
      const w = 1 - Math.min(1, Math.abs(fwd) / 4) * 0.4;
      T.crouch = 0.14 * s * w; T.lHip = 0.55 + Math.sin(this.phase) * 0.35 * Math.min(1, Math.abs(lat) / 3); T.rHip = 0.55 - Math.sin(this.phase) * 0.35 * Math.min(1, Math.abs(lat) / 3);
      T.lKn = 1.0; T.rKn = 1.0; T.lShP = -0.4; T.rShP = -0.4; T.lShR = 1.2 + rt.handsUp * 0.3; T.rShR = 1.2 + rt.handsUp * 0.3; T.lEl = 0.7; T.rEl = 0.7; T.lean = 0.28;
      if (rt.handsUp > 0.4) { T.lShP = -2.2 * rt.handsUp; T.rShP = -2.2 * rt.handsUp; T.lShR = 0.35; T.rShR = 0.35; T.lEl = 0.3; T.rEl = 0.3; }
    }
    let ik = null;
    if (rt.hasBall) { // dribbling posture: lean, off-arm protects
      T.lean += 0.12; T.crouch += 0.04 * s; ik = 'dribble';
      T.lShP = -0.9; T.lShR = 0.9; T.lEl = 1.1;
    }
    if (rt.state === 'post') { T.crouch = 0.17 * s; T.lKn = T.rKn = 1.1; T.lHip = T.rHip = 0.6; T.lShP = -0.8; T.lShR = 1.3; T.lean = 0.35; }
    if (a) {
      const t = a.t ?? 0;
      if (a.kind === 'shoot' || a.kind === 'ft' || a.kind === 'layup' || a.kind === 'dunk') {
        const D = a.D || 0.6, u = Math.min(1.6, t / D); ik = a.kind === 'dunk' ? 'dunk' : 'shoot';
        const ft = a.kind === 'ft', rimFinish = a.kind === 'layup' || a.kind === 'dunk';
        // phases: gather/load (0-0.35) -> rise & extend (0.35-1) -> release & follow-through -> soft landing
        const load = u < 0.35 ? Math.sin((u / 0.35) * Math.PI * 0.5) : 1 - Math.min(1, (u - 0.35) / 0.55);
        T.lKn = T.rKn = 0.12 + (ft ? 0.55 : 0.85) * Math.max(0, load); T.lHip = T.rHip = 0.12 + 0.5 * Math.max(0, load);
        T.crouch = (ft ? 0.07 : 0.1) * s * Math.max(0, load); T.lean = 0.1 * Math.max(0, load) - 0.05 * Math.min(1, u) + (a.variant === 'fadeaway' ? -0.35 : 0);
        T.lShP = -0.5; T.lShR = 0.5; // guide hand rests beside the ball
        if (rimFinish) { T.rHip = -0.9 * Math.min(1, u * 2); T.rKn = 1.5 * Math.min(1, u * 2); T.lHip = 0.5; T.lKn = 0.1; }
        if (a.released) {
          ik = 'follow'; const since = Math.max(0, t - (a.releaseT ?? a.D)); // held follow-through, then the knees soften for the landing
          if (!rimFinish) { T.lKn = T.rKn = 0.25 + 0.5 * Math.min(1, Math.max(0, since - 0.25) * 2.2); T.lHip = T.rHip = 0.2 + 0.3 * Math.min(1, Math.max(0, since - 0.25) * 2.2); T.crouch = 0.06 * s * Math.min(1, Math.max(0, since - 0.3) * 3); }
          T.lean = -0.04;
        }
      } else if (a.kind === 'pass') { ik = 'pass'; T.lean += 0.06; }
      else if (a.kind === 'pump') { ik = 'shoot'; }
      else if (a.kind === 'block' || a.kind === 'oopjump') { T.lShP = T.rShP = -3.0; T.lShR = T.rShR = 0.2; T.lEl = T.rEl = 0.05; T.lKn = T.rKn = 0.3; T.lHip = T.rHip = 0.2; T.crouch = 0; }
      else if (a.kind === 'move') {
        if (a.type === 'spin') root.rotation.y += (a.t / a.dur) * Math.PI * 2 * (rt.dribbleHand);
        if (a.type === 'hesitate') { T.crouch = 0.18 * s; T.lKn = 1.0; T.rKn = 0.2; }
        if (a.type === 'stepback') { T.lean = -0.2; T.lHip = 0.6; T.rHip = -0.3; }
        if (a.type === 'cross' || a.type === 'behind') { T.lean += 0.15; T.crouch = 0.1 * s; }
      }
    }
    if (rt.stumble > 0) { T.lean = 0.5; T.lHip = 1.1; T.rHip = -0.2; T.crouch = 0.12 * s; }
    if (ctx.celebrate) { T.lShP = T.rShP = -2.8 + Math.sin(this.phase * 2) * 0.3; T.lShR = T.rShR = 0.6; T.lEl = T.rEl = 0.2; }
    // jump: tuck legs in the air
    if (rt.y > 0.08 && !a) { T.lKn = T.rKn = 0.9; T.lHip = T.rHip = 0.5; }
    // ---- smooth pose blend
    const k = 1 - Math.exp(-dt * (a ? 18 : 11));
    for (const key in T) P[key] += (T[key] - P[key]) * k;
    // ---- apply FK
    j.hips.position.y = this.L.hipY - P.crouch - 0.0 + rt.y;
    j.hips.rotation.set(0, 0, 0); j.spine.rotation.set(0, 0, -P.lean * (1)); // lean forward = rotate about z (+x forward)
    j.lHip.rotation.z = P.lHip; j.rHip.rotation.z = P.rHip; // +z swings the leg forward (+x)
    j.lKn.rotation.z = -P.lKn; j.rKn.rotation.z = -P.rKn; // knees flex backwards
    j.lSh.rotation.set(P.lShR, 0, -P.lShP); j.rSh.rotation.set(-P.rShR, 0, -P.rShP); // roll abducts outward on both sides
    j.lEl.rotation.set(0, 0, P.lEl); j.rEl.rotation.set(0, 0, P.rEl);
    // ground-clamp foot IK: keep the lowest foot on the floor unless airborne
    if (rt.y < 0.05) { this.rigGroup.updateMatrixWorld(true); const lf = V(), rf = V(); j.lFoot.getWorldPosition(lf); j.rFoot.getWorldPosition(rf); const low = Math.min(lf.y, rf.y) - 0.045 * s; j.hips.position.y -= low * 0.9; }
    // ---- hand IK onto the ball (target converted into the spine's space)
    if (ik === 'follow') { // ball has left the hands: keep the shooting arm extended up and forward with a wrist flick
      const fx = Math.cos(rt.face), fz = Math.sin(rt.face); const since = Math.max(0, (a?.t ?? 0) - (a?.releaseT ?? a?.D ?? 0));
      ball = { x: rt.pos.x + fx * (0.3 + 0.12 * Math.min(1, since * 4)), y: rt.y + rt.height * (1.2 + 0.1 * Math.min(1, since * 4)), z: rt.pos.z + fz * (0.3 + 0.12 * Math.min(1, since * 4)) };
    }
    if (ik && ball) {
      this.root.updateMatrixWorld(true);
      const target = j.spine.worldToLocal(V(ball.x, ball.y, ball.z));
      const poleR = V(-0.3, -0.2, 1), poleL = V(-0.3, -0.2, -1);
      if (ik === 'dribble') { const side = rt.dribbleHand > 0 ? 'r' : 'l'; this.ikArm(side, target.clone().add(V(0, 0, side === 'r' ? 0.02 : -0.02)), side === 'r' ? poleR : poleL); }
      else { // two-hand set, shot, pass, dunk
        this.ikArm('r', target.clone().add(V(0, 0, (ik === 'follow' ? 0.13 : 0.09) * s)), poleR);
        this.ikArm('l', target.clone().add(V(ik === 'follow' ? -0.05 : 0, ik === 'follow' ? -0.4 : 0, (ik === 'follow' ? -0.3 : -0.09) * s)), poleL); // guide hand drops after release
      }
    }
    this.updateRing(rt, ctx);
  }
  ikArm(side, targetSpine, pole) { const sh = this.j[side + 'Sh'], el = this.j[side + 'El']; const rot = sh.rotation; rot.set(0, 0, 0); twoBoneIK(sh, el, this.L.upper, this.L.fore, targetSpine, pole); }
  updateRing(rt, ctx) {
    const m = this.ringMat; const active = ctx.active, a = active ? 0.95 : 0;
    m.opacity += (a - m.opacity) * 0.25; m.color.set(ctx.ringColor ?? this.team.colors.primary);
    this.ring.visible = m.opacity > 0.02; this.shadow.scale.setScalar(1 + rt.y * 0.2); this.shadow.material.opacity = Math.max(0.1, 0.38 - rt.y * 0.2);
    this.root.visible = true;
  }
  setHighlight(on) { this.active = on; }
  dispose() { this.root.parent?.remove(this.root); }
}
const REST = { lHip: 0, rHip: 0, lKn: 0.05, rKn: 0.05, lShP: 0, rShP: 0, lShR: 0.12, rShR: 0.12, lEl: 0.3, rEl: 0.3, lean: 0, crouch: 0 };

/** Swappable asset pipeline: register a loader that returns an Object3D with an AnimationMixer clip set; falls back to procedural. */
export const AthleteFactory = {
  glb: null,
  async useGLTF(url) {
    try {
      const head = await fetch(url, { method: 'HEAD' }); if (!head.ok) return false;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); this.glb = await new GLTFLoader().loadAsync(url); return true;
    } catch { return false; }
  },
  create(runtime, team) { return new Athlete(runtime, team); }, // a glTF-backed class can replace this: bind clips by state name (idle/run/dribble/shoot/defend)
};
void COLORS;
