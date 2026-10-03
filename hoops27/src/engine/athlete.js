// Stylised-realistic athletes (no blocky primitives): smooth tapered limbs, shaped torso under a separate jersey shell, real hands with fingers,
// sneakers, head with eyes / ears / hair. Animation is procedural and follows basketball biomechanics:
//  - gait phase advances with DISTANCE travelled, stance feet stay planted (no sliding) with heel strike -> roll -> toe-off, leg IK
//  - weight transfer: hips lead, sway over the stance foot, shoulders counter-rotate (kinetic chain), head stays level, eyes track rim / defender
//  - jump shot: catch -> gather -> load (110-120 deg knees) -> rise -> release at the apex with wrist snap -> held follow-through -> soft landing
//  - secondary motion: jersey / shorts / hair / muscle springs that lag the body by a few frames
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const jerseyCache = new Map();

/** Critically-damped-ish spring used for all secondary motion. */
class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; }
  /** Implicit Euler: stable at any frame time (slow machines, long frames) without overshooting or blowing up. */
  step(dt, target, omega = 16, zeta = 0.7) { const w2 = omega * omega; this.v = (this.v + dt * w2 * (target - this.x)) / (1 + 2 * zeta * omega * dt + w2 * dt * dt); this.x += this.v * dt; return this.x; }
}

export function jerseyTexture(team, player) {
  const key = team.id + player.number + player.name;
  if (jerseyCache.has(key)) return jerseyCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const p = team.colors.primary, s = team.colors.secondary;
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, shade(p, 0.9)); grd.addColorStop(1, shade(p, 0.62));
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; // fine knit
  for (let y = 0; y < 256; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = s; g.fillRect(0, 0, 512, 10); g.fillRect(0, 246, 512, 10); g.globalAlpha = 0.9; g.fillRect(0, 12, 512, 3); g.fillRect(0, 241, 512, 3); g.globalAlpha = 1;
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = s; g.lineWidth = 6; g.font = '800 120px Barlow Condensed, Orbitron, sans-serif';
  for (const x of [128, 384]) { g.strokeText(String(player.number), x, x === 128 ? 170 : 190); g.fillText(String(player.number), x, x === 128 ? 170 : 190); }
  g.font = '700 30px Barlow Condensed, Orbitron, sans-serif'; g.lineWidth = 0; g.fillText(player.name.split(' ').pop().toUpperCase(), 384, 76); g.font = '600 22px Barlow Condensed, sans-serif'; g.fillText(team.abbr, 128, 74);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = THREE.RepeatWrapping;
  jerseyCache.set(key, tex); return tex;
}
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); return `rgb(${(((n >> 16) & 255) * f) | 0},${(((n >> 8) & 255) * f) | 0},${((n & 255) * f) | 0})`; }

/** Solve a two-bone chain so that the end effector reaches `target` (in the upper bone's parent space). Rest direction is -Y. */
const _u = V(), _p = V(), _d1 = V(), _el = V(), _ld = V(), _qi = new THREE.Quaternion();
export function twoBoneIK(upper, lower, L1, L2, target, pole) {
  const S = upper.position; _u.copy(target).sub(S); let d = _u.length(); const maxD = L1 + L2 - 1e-3, minD = Math.abs(L1 - L2) + 1e-3;
  _u.normalize(); d = Math.min(maxD, Math.max(minD, d));
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), a = Math.acos(cosA);
  _p.copy(pole).addScaledVector(_u, -pole.dot(_u)); if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1); _p.normalize();
  _d1.copy(_u).multiplyScalar(Math.cos(a)).addScaledVector(_p, Math.sin(a)).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, _d1);
  _el.copy(S).addScaledVector(_d1, L1);
  _ld.copy(target).sub(_el); if (_ld.lengthSq() > L2 * L2) _ld.setLength(L2); _ld.normalize();
  _qi.copy(upper.quaternion).invert(); _ld.applyQuaternion(_qi);
  lower.quaternion.setFromUnitVectors(DOWN, _ld);
}

/** Smooth organic limb: radii = [[t, r], ...] from the joint (t=0) to the far end (t=1); hangs along -Y. */
function limbGeo(len, radii, seg = 18) {
  const pts = radii.map(([t, r]) => new THREE.Vector2(Math.max(0.0005, r), -t * len)).reverse(); // ascending y
  pts.unshift(new THREE.Vector2(0.0005, pts[0].y - radii[radii.length - 1][1] * 0.6)); pts.push(new THREE.Vector2(0.0005, pts[pts.length - 1].y + radii[0][1] * 0.6));
  return new THREE.LatheGeometry(pts, seg);
}
function ellipsoid(rx, ry, rz, w = 20, h = 14) { const g = new THREE.SphereGeometry(1, w, h); g.scale(rx, ry, rz); return g; }

const SKIN = [0xf0c8a4, 0xd8a273, 0xb67a4c, 0x8a5634, 0x5e3a22, 0x3f2616];
const HAIR = [0x16110d, 0x241a12, 0x0e0b09, 0x3a2a1c];

export class Athlete {
  constructor(runtime, team) {
    this.p = runtime; this.team = team; const s = this.s = runtime.height / 1.98;
    this.root = new THREE.Group(); this.root.name = runtime.name;
    this.rigGroup = new THREE.Group(); this.lod = new THREE.LOD();
    this.pose = {}; this.phase = Math.random(); this.sec = { jx: new Spring(), jz: new Spring(), hair: new Spring(), hairZ: new Spring(), calfR: new Spring(), calfL: new Spring(), shortsR: new Spring(), shortsL: new Spring(), look: [new Spring(), new Spring()], head: [new Spring(), new Spring()] };
    this.vPrev = { x: 0, z: 0 }; this.vs = 0; this.stanceW = 0.095 * s; this.lastPh = [0, 0]; this.idleT = Math.random() * 10; this.prevAction = null; this.lookYaw = 0; this.lookPitch = 0;
    this.build(s, runtime, team); this.lod.addLevel(this.rigGroup, 0); this.lod.addLevel(this.buildLow(s, team), 42); this.root.add(this.lod);
    this.ringMat = new THREE.MeshBasicMaterial({ color: team.colors.primary, transparent: true, opacity: 0, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.02; this.root.add(this.ring);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.012; this.root.add(this.shadow);
  }

  build(s, rt, team) {
    const skinC = SKIN[(rt.number * 7 + rt.name.length) % SKIN.length], hairC = HAIR[(rt.number + rt.name.length) % HAIR.length], style = (rt.number * 3 + rt.name.length) % 5;
    const skin = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.58, metalness: 0 });
    const skinDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinC).multiplyScalar(0.72), roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: hairC, roughness: 0.85 });
    const jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(team, rt.data), roughness: 0.62, metalness: 0.05, emissive: new THREE.Color(team.colors.primary), emissiveIntensity: 0.1, side: THREE.DoubleSide });
    const shorts = new THREE.MeshStandardMaterial({ color: new THREE.Color(team.colors.primary).multiplyScalar(0.55), roughness: 0.65, emissive: new THREE.Color(team.colors.primary), emissiveIntensity: 0.06, side: THREE.DoubleSide });
    const trim = new THREE.MeshStandardMaterial({ color: team.colors.secondary, roughness: 0.5, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.25 });
    const shoeUp = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.5 }), sole = new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.7 });
    const shoeAcc = new THREE.MeshStandardMaterial({ color: team.colors.secondary, roughness: 0.4, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.4 });
    const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; return m; };
    const L = this.L = { thigh: 0.46 * s, shin: 0.45 * s, upper: 0.31 * s, fore: 0.27 * s, torso: 0.56 * s, ankleH: 0.075 * s, hipX: 0.095 * s, shX: 0.2 * s, neck: 0.07 * s };
    L.leg = L.thigh + L.shin; L.hipY = L.ankleH + L.leg;
    const j = this.j = {};
    j.hips = new THREE.Group(); j.hips.position.y = L.hipY; this.rigGroup.add(j.hips);
    // pelvis + waistband
    const pelvis = mesh(ellipsoid(0.155 * s, 0.1 * s, 0.125 * s), skin); pelvis.position.y = 0.02 * s; j.hips.add(pelvis);
    const band = mesh(new THREE.LatheGeometry([new THREE.Vector2(0.15 * s, -0.01 * s), new THREE.Vector2(0.16 * s, 0.05 * s), new THREE.Vector2(0.155 * s, 0.11 * s)], 24), shorts); band.scale.z = 0.78; j.hips.add(band);
    const bandTrim = mesh(new THREE.TorusGeometry(0.157 * s, 0.006 * s, 6, 28), trim, false); bandTrim.rotation.x = Math.PI / 2; bandTrim.scale.set(1, 0.78, 1); bandTrim.position.y = 0.105 * s; j.hips.add(bandTrim);
    // torso: skin chest under a separate jersey shell (shell moves with secondary motion)
    j.spine = new THREE.Group(); j.spine.position.y = 0.1 * s; j.hips.add(j.spine);
    const torsoProfile = (k) => [[0.0, 0.145], [0.06, 0.15], [0.16, 0.152], [0.28, 0.172], [0.4, 0.2], [0.49, 0.215], [0.545, 0.17], [0.575, 0.075], [0.585, 0.0]].map(([y, r]) => new THREE.Vector2((r + k) * s, y * s));
    const chest = mesh(new THREE.LatheGeometry(torsoProfile(0), 28), skin); chest.scale.z = 0.62; j.spine.add(chest);
    this.jerseyPivot = new THREE.Group(); j.spine.add(this.jerseyPivot);
    const shell = new THREE.LatheGeometry([[-0.1, 0.19], [-0.06, 0.168], [0.0, 0.16], [0.06, 0.158], [0.16, 0.16], [0.28, 0.18], [0.4, 0.208], [0.49, 0.222], [0.52, 0.2], [0.53, 0.15]].map(([y, r]) => new THREE.Vector2(r * s + 0.008 * s, y * s)), 32);
    this.jersey = mesh(shell, jersey); this.jersey.scale.z = 0.66; this.jerseyPivot.add(this.jersey);
    for (const side of [-1, 1]) { const arm = mesh(new THREE.TorusGeometry(0.075 * s, 0.006 * s, 6, 18), trim, false); arm.position.set(0, 0.5 * s, side * 0.2 * s); arm.rotation.y = Math.PI / 2; this.jerseyPivot.add(arm); }
    // neck + head
    j.neck = new THREE.Group(); j.neck.position.y = 0.575 * s; j.spine.add(j.neck);
    const neck = mesh(limbGeo(0.09 * s, [[0, 0.052], [1, 0.06]], 14), skin); neck.position.y = 0.085 * s; j.neck.add(neck);
    j.head = new THREE.Group(); j.head.position.y = 0.075 * s; j.neck.add(j.head);
    const skull = mesh(ellipsoid(0.098 * s, 0.118 * s, 0.088 * s, 28, 20), skin); skull.position.y = 0.09 * s; j.head.add(skull);
    const jaw = mesh(ellipsoid(0.07 * s, 0.06 * s, 0.07 * s, 18, 12), skin); jaw.position.set(0.012 * s, 0.025 * s, 0); j.head.add(jaw);
    const nose = mesh(ellipsoid(0.02 * s, 0.026 * s, 0.018 * s, 10, 8), skin, false); nose.position.set(0.095 * s, 0.075 * s, 0); j.head.add(nose);
    const mouth = mesh(ellipsoid(0.008 * s, 0.006 * s, 0.03 * s, 8, 6), dark, false); mouth.position.set(0.082 * s, 0.037 * s, 0); j.head.add(mouth);
    for (const side of [-1, 1]) {
      const ear = mesh(ellipsoid(0.014 * s, 0.03 * s, 0.01 * s, 10, 8), skinDark, false); ear.position.set(-0.005 * s, 0.085 * s, side * 0.092 * s); j.head.add(ear);
      const eyeW = mesh(ellipsoid(0.012 * s, 0.01 * s, 0.014 * s, 10, 8), white, false); eyeW.position.set(0.082 * s, 0.1 * s, side * 0.034 * s); j.head.add(eyeW);
      const iris = mesh(ellipsoid(0.007 * s, 0.007 * s, 0.007 * s, 8, 6), dark, false); iris.position.set(0.0075 * s, 0, 0); eyeW.add(iris); (this.irises ??= []).push(iris);
      const brow = mesh(ellipsoid(0.008 * s, 0.004 * s, 0.022 * s, 8, 6), hair, false); brow.position.set(0.086 * s, 0.118 * s, side * 0.034 * s); j.head.add(brow);
    }
    this.hairPivot = new THREE.Group(); this.hairPivot.position.y = 0.09 * s; j.head.add(this.hairPivot);
    if (style === 0 || style === 3) { const cap = mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); cap.scale.set(0.103 * s, 0.123 * s, 0.093 * s); cap.position.y = 0; this.hairPivot.add(cap); }
    if (style === 1) { const afro = mesh(ellipsoid(0.125 * s, 0.1 * s, 0.125 * s, 22, 14), hair); afro.position.set(-0.012 * s, 0.07 * s, 0); this.hairPivot.add(afro); }
    if (style === 3) for (let k = 0; k < 7; k++) { const braid = mesh(new THREE.CapsuleGeometry(0.009 * s, 0.1 * s, 3, 6), hair, false); braid.position.set(-0.07 * s, 0.0, (k - 3) * 0.022 * s); braid.rotation.z = 0.35; this.hairPivot.add(braid); }
    if (style === 4) { const cap = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), hair); cap.scale.set(0.1 * s, 0.123 * s, 0.09 * s); this.hairPivot.add(cap); }
    if (rt.number % 3 === 0) { const hb = mesh(new THREE.TorusGeometry(0.095 * s, 0.01 * s, 6, 24), trim, false); hb.rotation.x = Math.PI / 2; hb.scale.set(1, 0.92, 1); hb.position.y = 0.13 * s; j.head.add(hb); }
    // arms: deltoid, bicep, forearm, wrist, hand with fingers
    this.fingers = { l: [], r: [] };
    for (const side of [-1, 1]) {
      const k = side < 0 ? 'l' : 'r';
      const sh = new THREE.Group(); sh.position.set(0, 0.51 * s, side * L.shX); j.spine.add(sh); j[k + 'Sh'] = sh;
      sh.add(mesh(ellipsoid(0.06 * s, 0.06 * s, 0.06 * s, 14, 10), skin));
      const up = mesh(limbGeo(L.upper, [[0, 0.056], [0.3, 0.062], [0.55, 0.054], [1, 0.043]]), skin); sh.add(up);
      const el = new THREE.Group(); el.position.y = -L.upper; sh.add(el); j[k + 'El'] = el;
      el.add(mesh(ellipsoid(0.045 * s, 0.045 * s, 0.045 * s, 10, 8), skin, false));
      el.add(mesh(limbGeo(L.fore, [[0, 0.047], [0.25, 0.05], [1, 0.032]]), skin));
      const wr = new THREE.Group(); wr.position.y = -L.fore; el.add(wr); j[k + 'Wr'] = wr;
      const palm = mesh(ellipsoid(0.04 * s, 0.05 * s, 0.022 * s, 12, 10), skin, false); palm.position.set(0.006 * s, -0.045 * s, 0); wr.add(palm);
      const knuckles = [[0.012, 0.03], [0.0, 0.012], [0.0, -0.008], [0.0, -0.028]];
      knuckles.forEach(([x, z], i) => { const f = new THREE.Group(); f.position.set((x + 0.006) * s, -0.085 * s, z * s); const len = [0.062, 0.07, 0.066, 0.052][i] * s; f.add(mesh(new THREE.CapsuleGeometry(0.0085 * s, len, 3, 6), skin, false)); f.children[0].position.y = -len / 2; wr.add(f); this.fingers[k].push(f); });
      const th = new THREE.Group(); th.position.set(0.02 * s, -0.05 * s, side * -0.02 * s); th.rotation.set(0, 0, 0.5); th.add(mesh(new THREE.CapsuleGeometry(0.0095 * s, 0.045 * s, 3, 6), skin, false)); th.children[0].position.y = -0.026 * s; wr.add(th); j[k + 'Thumb'] = th;
      // legs: hip joint with thigh + shorts leg, knee, calf, ankle, sneaker
      const hip = new THREE.Group(); hip.position.set(0, 0, side * L.hipX); j.hips.add(hip); j[k + 'Hip'] = hip;
      const thigh = mesh(limbGeo(L.thigh, [[0, 0.088], [0.25, 0.1], [0.6, 0.082], [1, 0.062]]), skin); hip.add(thigh); j[k + 'Thigh'] = thigh;
      const sh2 = mesh(limbGeo(L.thigh * 0.8, [[0, 0.105], [0.5, 0.113], [1, 0.124]]), shorts); hip.add(sh2); j[k + 'Shorts'] = sh2;
      const kn = new THREE.Group(); kn.position.y = -L.thigh; hip.add(kn); j[k + 'Kn'] = kn;
      kn.add(mesh(ellipsoid(0.058 * s, 0.058 * s, 0.056 * s, 10, 8), skin, false));
      const calf = mesh(limbGeo(L.shin, [[0, 0.06], [0.2, 0.066], [0.4, 0.056], [1, 0.04]]), skin); kn.add(calf); j[k + 'Calf'] = calf;
      const ank = new THREE.Group(); ank.position.y = -L.shin; kn.add(ank); j[k + 'Ank'] = ank;
      const foot = new THREE.Group(); ank.add(foot); j[k + 'Foot'] = foot;
      const upper = mesh(ellipsoid(0.1 * s, 0.05 * s, 0.05 * s, 16, 10), shoeUp); upper.position.set(0.05 * s, -0.035 * s, 0); foot.add(upper);
      const toe = mesh(ellipsoid(0.06 * s, 0.038 * s, 0.047 * s, 14, 8), shoeUp); toe.position.set(0.115 * s, -0.052 * s, 0); foot.add(toe);
      const heel = mesh(ellipsoid(0.045 * s, 0.045 * s, 0.045 * s, 12, 8), shoeUp); heel.position.set(-0.03 * s, -0.04 * s, 0); foot.add(heel);
      const sl = mesh(ellipsoid(0.15 * s, 0.016 * s, 0.056 * s, 18, 8), sole, false); sl.position.set(0.062 * s, -0.073 * s, 0); foot.add(sl);
      const acc = mesh(ellipsoid(0.05 * s, 0.012 * s, 0.052 * s, 10, 6), shoeAcc, false); acc.position.set(0.05 * s, -0.01 * s, 0); foot.add(acc);
    }
  }
  buildLow(s, team) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2 * s, 1.3 * s, 3, 8), new THREE.MeshStandardMaterial({ color: team.colors.primary, roughness: 0.6, emissive: new THREE.Color(team.colors.secondary), emissiveIntensity: 0.1 }));
    body.position.y = 0.95 * s; g.add(body); return g;
  }

  /** Foot target (root space) for one foot from the gait cycle: stance feet are world-fixed (phase advances with distance). */
  footTarget(phi, side, a, ds, u, v, lift) {
    const s = this.s, L = this.L; let g, y = L.ankleH, pitch = 0;
    if (phi < ds) {
      const k = phi / ds; g = a * (1 - 2 * k);
      pitch = k < 0.14 ? lerp(0.3, 0, k / 0.14) : k > 0.78 ? lerp(0, -0.8, (k - 0.78) / 0.22) : 0; // heel strike -> flat -> toe-off
      y += Math.max(0, -pitch) * 0.05 * s;
    } else {
      const k = (phi - ds) / (1 - ds); g = -a + 2 * a * smooth(k); y += Math.sin(Math.PI * k) * lift; pitch = lerp(-0.55, 0.3, k);
    }
    return { x: g * u.x, z: g * u.z + side * this.stanceW, y, pitch, stance: phi < ds, k: phi < ds ? phi / ds : 0 };
  }

  /** Update from sim state. ball = world position; ctx = { defense, celebrate, active, ringColor, look: {x,y,z}, closeout, boxing } */
  update(dt, rt, ball, ctx) {
    const root = this.root; root.position.set(rt.pos.x, 0, rt.pos.z); root.rotation.y = -rt.face;
    if (this.lod.getCurrentLevel() > 0) { this.updateRing(rt, ctx); return; }
    dt = Math.min(dt, 0.05);
    const s = this.s, L = this.L, j = this.j, a = rt.action, fx = Math.cos(rt.face), fz = Math.sin(rt.face);
    const vf = rt.vel.x * fx + rt.vel.z * fz, vl = -rt.vel.x * fz + rt.vel.z * fx; // local forward / right velocity
    const v = Math.hypot(vf, vl); this.vs += (v - this.vs) * Math.min(1, dt * 10);
    const ax = (vf - this.vPrev.x) / Math.max(dt, 1e-3), az = (vl - this.vPrev.z) / Math.max(dt, 1e-3); this.vPrev.x = vf; this.vPrev.z = vl;
    const P = this.pose; const k5 = (rate) => Math.min(1, dt * rate);
    const sm = (key, target, rate = 14) => { P[key] = (P[key] ?? target) + (target - (P[key] ?? target)) * k5(rate); return P[key]; };
    const airborne = rt.y > 0.04; const isShot = a && (a.kind === 'shoot' || a.kind === 'ft' || a.kind === 'layup' || a.kind === 'dunk');
    const defending = !rt.hasBall && ctx.defense; const handler = rt.hasBall && !isShot;
    const u = v > 0.05 ? { x: vf / v, z: vl / v } : { x: 1, z: 0 };
    // ---------------- stance parameters per situation
    let crouch = 0.03 * s, lean = Math.min(0.28, 0.035 * this.vs), widen = 0, hipsBack = 0, strideScale = 1, torsoRoll = 0, shoulderYaw = 0;
    if (defending) { crouch = 0.2 * s; lean = 0.08 + Math.min(0.12, this.vs * 0.02); widen = 0.2 * s; if (Math.abs(vl) > Math.abs(vf)) strideScale = 0.8; }
    if (ctx.closeout && this.vs > 1) { const brake = clamp(1 - this.vs / 5.5, 0, 1); crouch = lerp(0.08 * s, 0.22 * s, brake); strideScale = lerp(1, 0.5, brake); widen = 0.12 * s * brake; } // closeout: choppy decelerating steps, hips lowering
    if (handler) { crouch = 0.08 * s + Math.min(0.05, this.vs * 0.01) * s; lean = 0.05 + this.vs * 0.025; }
    if (rt.state === 'post') { crouch = 0.22 * s; lean = 0.32; widen = 0.15 * s; hipsBack = -0.05; }
    if (ctx.boxing) { crouch = 0.2 * s; widen = 0.22 * s; lean = -0.12; }
    if (rt.stumble > 0) { crouch = 0.26 * s; lean = 0.4; widen = 0.1 * s; torsoRoll = 0.25; }
    // ---------------- action-driven parameters
    let mode = null; let shotK = null; // mode drives the arms
    if (a) {
      const t = a.t ?? 0;
      if (isShot) {
        const D = a.D, tL = a.load ?? D * 0.3, air = a.air ?? D * 0.7, rel = a.released ? (a.releaseT ?? D) : D;
        const since = a.released ? Math.max(0, t - rel) : 0;
        shotK = { t, D, tL, rel, since };
        if (t < tL) { const k = smooth(t / tL); crouch = lerp(crouch, (a.kind === 'ft' ? 0.1 : 0.19) * s, k); hipsBack = -0.05 * k; lean = lerp(lean, 0.1, k); widen = 0.07 * s * k; }          // load: knees to ~110-120 deg, hips back
        else if (t <= D) { const k = (t - tL) / Math.max(D - tL, 1e-3); crouch = lerp(0.19 * s, 0.0, smooth(Math.min(1, k * 2.4))); lean = lerp(0.1, -0.04, smooth(k)); }               // rise: explosive extension
        else { const landK = smooth(clamp((t - (D + air * 0.82)) / 0.22, 0, 1)); crouch = 0.13 * s * landK; lean = 0.05 * landK; }                                                      // land: knees soft
        if (a.variant === 'fadeaway') lean = -0.34 * smooth((t) / D);
        if (a.variant === 'euro' && t < tL) { const k = t / tL; torsoRoll = (k < 0.5 ? -0.2 : 0.22) * Math.sin(k * Math.PI); }
        mode = a.released ? 'follow' : 'shoot';
        if (a.kind === 'dunk' && !a.released) mode = 'dunk';
      } else if (a.kind === 'pass') { mode = 'pass'; lean += 0.06; }
      else if (a.kind === 'pump') { mode = 'shoot'; crouch = 0.12 * s; }
      else if (a.kind === 'block' || a.kind === 'oopjump') { mode = a.rebound ? 'rebound' : 'block'; }
      else if (a.kind === 'move') {
        const k = clamp(t / a.dur, 0, 1);
        if (a.type === 'cross' || a.type === 'behind') { crouch = 0.15 * s; lean = 0.2; widen = 0.14 * s; shoulderYaw = -rt.dribbleHand * 0.35 * Math.sin(k * Math.PI); torsoRoll = rt.dribbleHand * 0.12; } // shoulders fake the other way, plant outside the hip
        if (a.type === 'hesitate') { if (k < 0.6) { hipsBack = -0.11; lean = -0.06; crouch = 0.17 * s; } else { lean = 0.28; crouch = 0.1 * s; hipsBack = 0.06; } }       // weight back on the rear leg, then the burst
        if (a.type === 'stepback') { hipsBack = -0.12 * Math.sin(k * Math.PI); lean = -0.18; crouch = 0.16 * s; }
        if (a.type === 'spin') { root.rotation.y += k * Math.PI * 2 * rt.dribbleHand * 0.0; shoulderYaw = rt.dribbleHand * Math.sin(k * Math.PI) * 0.6; crouch = 0.14 * s; }
      }
    }
    if (ctx.celebrate) mode = 'celebrate';
    crouch = sm('crouch', crouch, isShot ? 26 : 10); lean = sm('lean', lean, 12); hipsBack = sm('hipsBack', hipsBack, 12); widen = sm('widen', widen, 8); torsoRoll = sm('roll', torsoRoll, 10);
    this.stanceW = (L.hipX + widen);

    // ---------------- gait (distance driven, no sliding) + idle
    const Dc = (0.9 + 0.33 * Math.min(this.vs, 6.5)) * strideScale, ds = clamp(0.62 - 0.045 * this.vs, 0.38, 0.62);
    const grounded = !airborne; if (grounded && this.vs > 0.2 && !isShot) this.phase = (this.phase + (this.vs * dt) / Dc) % 1;
    this.idleT += dt; const w = smooth((this.vs - 0.25) / 1.1), amp = (ds * Dc) / 2;
    const lift = (0.045 + 0.028 * Math.min(this.vs, 6)) * s;
    const foot = {};
    for (const side of [-1, 1]) {
      const kk = side < 0 ? 'l' : 'r'; const phi = (this.phase + (side < 0 ? 0.5 : 0)) % 1; const g = this.footTarget(phi, side, amp, ds, u, this.vs, lift);
      // idle: feet set at stance width with a slow weight shift and a staggered front foot
      const shift = Math.sin(this.idleT * 0.7) * 0.012 * s; const stagger = defending ? 0.1 * s * side : (handler ? 0.07 * s * side : 0.02 * s * side);
      const idle = { x: stagger + shift * side, z: side * this.stanceW, y: L.ankleH, pitch: 0 };
      const tgt = { x: lerp(idle.x, g.x, w), z: lerp(idle.z, g.z, w), y: lerp(idle.y, g.y, w), pitch: lerp(0, g.pitch, w), stance: g.stance, k: g.k };
      // shot gather: a one-two step, inside foot first, second foot snapping to shoulder width toes to the rim
      if (isShot && shotK && shotK.t < shotK.tL) { const gk = shotK.t / shotK.tL; tgt.x = (side > 0 ? 0.0 : lerp(0.12 * s, 0.02 * s, smooth(gk * 1.6))); tgt.z = side * (L.hipX + 0.06 * s * smooth(gk)); tgt.y = L.ankleH; tgt.pitch = 0; }
      if (a && a.kind === 'layup' && a.variant === 'euro' && shotK && shotK.t < shotK.tL) { const gk = shotK.t / shotK.tL; if (gk < 0.5) { tgt.z += (side > 0 ? 0.28 : 0.0) * s; tgt.x = 0.12 * s; } else { tgt.z -= (side < 0 ? 0.28 : 0.0) * s; tgt.x = 0.14 * s; } } // long lateral strides each way
      if (a && a.kind === 'move' && (a.type === 'cross' || a.type === 'behind')) { const plant = rt.dribbleHand > 0 ? -1 : 1; if (side === plant) { tgt.z += plant * 0.1 * s; tgt.x = 0.02 * s; tgt.y = L.ankleH; tgt.pitch = 0; } }  // plant outside the hip
      foot[kk] = tgt;
      // muscle impulse on heel strike
      if (tgt.stance && g.k < 0.1 && this.lastPh[side < 0 ? 0 : 1] >= 0.1) this.sec[side < 0 ? 'calfL' : 'calfR'].v += 1.2; this.lastPh[side < 0 ? 0 : 1] = tgt.stance ? g.k : 1;
    }
    // hips: height solves the stance-leg reach, bob loads the knees on contact, sway puts the weight over the stance foot, hips lead the feet
    const reachX = Math.max(Math.abs(foot.l.x), Math.abs(foot.r.x)); let H = L.ankleH + Math.min(L.leg * 0.985, Math.sqrt(Math.max(1e-3, L.leg * L.leg - reachX * reachX * 0.8)));
    H -= crouch + (0.012 + 0.004 * this.vs) * s * (0.5 - 0.5 * Math.cos(this.phase * Math.PI * 4)) * w; // bounce
    const stanceSign = foot.r.stance && !foot.l.stance ? 1 : foot.l.stance && !foot.r.stance ? -1 : 0;
    const sway = sm('sway', stanceSign * 0.03 * s * w, 12);
    const yaw = sm('pyaw', Math.sin(this.phase * Math.PI * 2) * 0.2 * w * Math.min(1, this.vs / 3), 14);
    j.hips.position.set(0.03 * Math.min(this.vs, 6) * 0.35 + hipsBack * s, H + rt.y, sway); j.hips.rotation.set(torsoRoll * 0.4, yaw, -0.0);
    // ---------------- legs: IK to the foot targets (ground-fixed) blended with hanging legs in the air
    const air = smooth((rt.y - 0.02) / 0.1);
    const tuck = a && a.released ? 0.04 : isShot ? 0.02 : 0.12;
    for (const side of [-1, 1]) {
      const kk = side < 0 ? 'l' : 'r', f = foot[kk], hip = j[kk + 'Hip'], kn = j[kk + 'Kn'];
      const gx = f.x, gy = f.y, gz = f.z; // root space ground target
      const ax_ = 0.05 * s, ay = H + rt.y - (L.leg * (0.97 - tuck)), az_ = side * (L.hipX + 0.03 * s); // hanging foot in root space
      const tx = lerp(gx, ax_, air), ty = lerp(gy, Math.max(L.ankleH, ay), air), tz = lerp(gz, az_, air);
      const hp = j.hips.position; const dx = tx - hp.x, dy = ty - hp.y, dz = tz - hp.z; const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      const target = V(dx * cy + dz * sy, dy, -dx * sy + dz * cy);
      twoBoneIK(hip, kn, L.thigh, L.shin, target, V(1, 0, 0.05 * side));
      // ankle: heel strike / roll / toe-off on the ground; toes pointed in the air (plantar-flexed at take-off)
      const sd = V(0, -1, 0).applyQuaternion(kn.quaternion).applyQuaternion(hip.quaternion); const shinPitch = Math.atan2(sd.x, -sd.y);
      const wantPitch = lerp(f.pitch, isShot && rt.vy > 0 ? -0.95 : -0.35, air);
      j[kk + 'Ank'].rotation.set(0, 0, wantPitch - shinPitch); // the foot's yaw follows the hips
      // shorts hang off the thigh and lag it (secondary motion)
      const lagKey = kk === 'l' ? 'shortsL' : 'shortsR'; const ang = shinPitch; const lagged = this.sec[lagKey].step(dt, ang, 14, 0.6); j[kk + 'Shorts'].rotation.z = (lagged - ang) * 0.5;
    }
    // ---------------- spine chain: hips lead, shoulders counter-rotate, head stays level
    const pyaw = P.pyaw ?? 0; j.spine.rotation.set(torsoRoll * 0.6, -pyaw * 1.5 + shoulderYaw, -lean);
    // ---------------- arms
    const swing = Math.sin(this.phase * Math.PI * 2) * 0.75 * w * Math.min(1, this.vs / 4);
    let ik = null; let twoHand = false; const pole = { r: V(-0.25, -0.2, 1), l: V(-0.25, -0.2, -1) };
    const setArm = (k, sho, rollv, elbow) => { const side = k === 'r' ? 1 : -1; j[k + 'Sh'].rotation.set(-side * rollv, 0, sho); j[k + 'El'].rotation.set(0, 0, elbow); };
    // default FK swing: right arm swings with the left leg
    setArm('r', -swing, 0.12, 0.45 + 0.5 * w); setArm('l', swing, 0.12, 0.45 + 0.5 * w);
    if (defending) { const wig = Math.sin(this.idleT * 6) * 0.1; const hu = rt.handsUp ?? 0; setArm('r', 0.5 + wig + hu * 1.9, 1.15 - hu * 0.5, 0.6 - hu * 0.3); setArm('l', 0.3 - wig + hu * 1.9, 1.15 - hu * 0.5, 0.6 - hu * 0.3); if (ctx.closeout) { setArm('r', 2.5, 0.35, 0.3); setArm('l', 0.7, 1.0, 0.7); } } // active hands: one in the lane, one at the ball
    if (ctx.boxing) { setArm('r', 0.2, 1.05, 1.5); setArm('l', 0.2, 1.05, 1.5); } // elbows out, lean into contact
    if (rt.state === 'post') setArm('l', 0.7, 1.2, 1.1);
    if (handler) { ik = 'dribble'; setArm(rt.dribbleHand > 0 ? 'l' : 'r', 0.35, 0.4, 1.55); } // off arm protects the ball: forearm up across the chest, clear of the face
    if (mode === 'shoot' || mode === 'dunk' || mode === 'pass') { ik = mode; twoHand = true; }
    if (mode === 'follow') ik = 'follow';
    if (mode === 'block') { setArm('r', 3.0, 0.2, 0.05); setArm('l', 3.0, 0.2, 0.05); }
    if (mode === 'rebound') { setArm('r', 3.0, 0.55, 0.1); setArm('l', 3.0, 0.55, 0.1); } // arms fully extended overhead, hands wide
    if (mode === 'celebrate') { const t2 = Math.sin(this.idleT * 9) * 0.25; setArm('r', 2.7 + t2, 0.5, 0.2); setArm('l', 2.7 - t2, 0.5, 0.2); }
    if (rt.stumble > 0) { setArm('r', 1.2, 1.0, 0.5); setArm('l', 1.2, 1.0, 0.5); }
    // after FK, hand IK onto the ball
    let wristR = -0.15, wristL = -0.15, curl = 0.25, curlGuide = 0.25;
    if (ik) {
      this.root.updateMatrixWorld(true);
      let bp = ball;
      if (ik === 'follow') { const since = shotK ? shotK.since : 0, e = smooth(since * 7); bp = { x: rt.pos.x + fx * (0.26 + 0.16 * e), y: rt.y + rt.height * (1.16 + 0.12 * e), z: rt.pos.z + fz * (0.26 + 0.16 * e) }; }
      const tgt = j.spine.worldToLocal(V(bp.x, bp.y, bp.z));
      if (ik === 'dribble') { const k = rt.dribbleHand > 0 ? 'r' : 'l'; const t2 = tgt.clone().add(V(-0.01, 0.03, k === 'r' ? 0.01 : -0.01)); this.ikArm(k, t2, pole[k]); if (k === 'r') { wristR = -0.5 + Math.sin((rt.dribbleHand ? 1 : 1) * Math.abs(ball.y - rt.y) * 5) * 0.2; curl = 0.55; } else { wristL = -0.5; curlGuide = 0.55; } }
      else if (ik === 'follow') {
        const e = smooth((shotK?.since ?? 0) * 7), snap = smooth((shotK?.since ?? 0) / 0.12);
        this.ikArm('r', tgt.clone().add(V(0, 0.0, 0.03 * s)), V(-0.1, -0.2, 0.9)); this.ikArm('l', tgt.clone().add(V(-0.08, -0.34, -0.2 * s)), pole.l);                                   // shooting arm stays up, guide hand drops
        wristR = lerp(-0.9, 1.15, snap); curl = lerp(0.5, 0.1, smooth(((shotK?.since ?? 0) - 0.04) / 0.12)); wristL = 0.2; curlGuide = 0.2; void e;                                         // gooseneck: wrist snaps forward, index + middle finger last to leave
      } else if (ik === 'pass') {
        this.ikArm('r', tgt.clone().add(V(0, 0, 0.08 * s)), pole.r); this.ikArm('l', tgt.clone().add(V(0, 0, -0.08 * s)), pole.l); wristR = wristL = -0.3; curl = curlGuide = 0.5;
      } else { // set point: elbow tucked under the ball at ~90 deg, guide hand on the side of the ball
        const up = shotK && shotK.t > shotK.tL ? 0 : 0; void up;
        this.ikArm('r', tgt.clone().add(V(-0.02, -0.055, 0.025 * s)), V(-0.15, -1, 0.12)); this.ikArm('l', tgt.clone().add(V(0.0, -0.01, -0.105 * s)), V(-0.2, -0.6, -1));
        wristR = -0.95; wristL = -0.45; curl = 0.45; curlGuide = 0.4;
      }
    } else { wristR = -0.1 + (P.wristNoise ?? 0); wristL = -0.1; }
    j.rWr.rotation.z = sm('wR', wristR, 40); j.lWr.rotation.z = sm('wL', wristL, 40);
    const cv = sm('curlR', curl, 30), cg = sm('curlL', curlGuide, 30);
    this.fingers.r.forEach((f, i) => { f.rotation.z = cv * (1.1 + i * 0.1) * (i === 0 || i === 1 ? 0.9 : 1); }); this.fingers.l.forEach((f) => { f.rotation.z = cg * 1.1; }); j.rThumb.rotation.z = 0.35 + cv * 0.4; j.lThumb.rotation.z = 0.35 + cg * 0.4;
    // ---------------- head: stays level, eyes on the rim / defender (not the ball)
    j.neck.rotation.set(0, 0, 0); j.head.rotation.set(0, 0, 0); this.root.updateMatrixWorld(true);
    const look = ctx.look ?? { x: rt.pos.x + fx * 5, y: rt.height * 0.9, z: rt.pos.z + fz * 5 }; const lt = j.neck.worldToLocal(V(look.x, look.y, look.z));
    const wantYaw = clamp(-Math.atan2(lt.z, lt.x), -1.0, 1.0), wantPitch = clamp(Math.atan2(lt.y, Math.hypot(lt.x, lt.z)), -0.35, 0.28);
    const hy = this.sec.head[0].step(dt, wantYaw, 22, 0.9), hp = this.sec.head[1].step(dt, wantPitch, 22, 0.9);
    j.neck.rotation.set(0, hy * 0.45, lean * 0.9 + hp * 0.25); j.head.rotation.set(0, hy * 0.55, lean * 0.1 + hp * 0.5); // lean is cancelled so the head stays level through the dribble
    this.irises?.forEach((ir) => { ir.position.y = clamp(hp, -0.4, 0.4) * 0.004; });
    // ---------------- secondary motion: jersey, hair, muscle; each lags the body by a few frames
    const jx = this.sec.jx.step(dt, clamp(-ax * 0.004, -0.04, 0.04), 18, 0.55), jz = this.sec.jz.step(dt, clamp(-az * 0.004, -0.04, 0.04), 18, 0.55);
    this.jerseyPivot.position.set(jx * s, 0, jz * s); this.jerseyPivot.rotation.set(jz * 3, 0, -jx * 3); this.jersey.scale.set(1 + Math.min(0.05, this.vs * 0.006), 1, 0.66 + Math.min(0.05, this.vs * 0.006));
    const hr = this.sec.hair.step(dt, clamp(-ax * 0.01, -0.35, 0.35) - (rt.vy ?? 0) * 0.02, 15, 0.45), hz = this.sec.hairZ.step(dt, clamp(-az * 0.01, -0.3, 0.3), 15, 0.45); this.hairPivot.rotation.set(hz, 0, hr);
    const cR = this.sec.calfR.step(dt, 0, 22, 0.35), cL = this.sec.calfL.step(dt, 0, 22, 0.35); j.rCalf.scale.set(1 + 0.04 * cR, 1, 1 + 0.04 * cR); j.lCalf.scale.set(1 + 0.04 * cL, 1, 1 + 0.04 * cL); j.rThigh.scale.set(1 + 0.025 * cR, 1, 1 + 0.025 * cR); j.lThigh.scale.set(1 + 0.025 * cL, 1, 1 + 0.025 * cL);
    this.updateRing(rt, ctx);
  }
  ikArm(side, targetSpine, pole) { const sh = this.j[side + 'Sh'], el = this.j[side + 'El']; sh.rotation.set(0, 0, 0); twoBoneIK(sh, el, this.L.upper, this.L.fore, targetSpine, pole); }
  updateRing(rt, ctx) {
    const m = this.ringMat; const a = ctx.active ? 0.95 : 0;
    m.opacity += (a - m.opacity) * 0.25; m.color.set(ctx.ringColor ?? this.team.colors.primary);
    this.ring.visible = m.opacity > 0.02; this.shadow.scale.setScalar(1 + rt.y * 0.2); this.shadow.material.opacity = Math.max(0.1, 0.38 - rt.y * 0.2);
    this.root.visible = true;
  }
  dispose() { this.root.parent?.remove(this.root); }
}

/** Swappable asset pipeline: register a loader that returns an Object3D with an AnimationMixer clip set; falls back to procedural. */
export const AthleteFactory = {
  glb: null,
  async useGLTF(url) {
    try {
      const head = await fetch(url, { method: 'HEAD' }); if (!head.ok) return false;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); this.glb = await new GLTFLoader().loadAsync(url); return true;
    } catch { return false; }
  },
  create(runtime, team) { return new Athlete(runtime, team); },
};
