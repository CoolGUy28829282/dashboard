// Procedural humanoid proportioned from height, wingspan and weight. Legs and arms are solved with analytic two-bone IK,
// the stride is driven by distance travelled (phase += distance / stride) so planted feet match ground speed.
// Everything is pre-allocated: pose() performs no allocation.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const limb = new THREE.CylinderGeometry(1, 0.78, 1, 10, 1).translate(0, -0.5, 0);
const ball = new THREE.SphereGeometry(1, 16, 12);
const cap = new THREE.CapsuleGeometry(1, 1, 6, 14);
const hairCap = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
const shoeGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.35);
const mats = new Map();
function mat(color, rough = 0.78) {
  const k = color + ':' + rough;
  let m = mats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }); mats.set(k, m); }
  return m;
}
const _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _inv = new THREE.Quaternion();
const _dir1 = new THREE.Vector3(), _dir2 = new THREE.Vector3(), _pole = new THREE.Vector3();

function mesh(geo, material, sx, sy, sz) {
  const m = new THREE.Mesh(geo, material);
  m.scale.set(sx, sy, sz);
  return m;
}

export class Humanoid {
  constructor(o) {
    const H = o.height, k = Math.min(1.35, Math.max(0.82, Math.sqrt(o.weight / (23 * H * H))));
    this.H = H;
    const skin = mat(o.skin), jersey = mat(o.jersey, 0.6), trim = mat(o.trim, 0.6), shorts = mat(o.shorts, 0.6);
    this.hipStand = 0.53 * H - 0.015 * H; this.ankleH = 0.04 * H;
    const legSpan = 0.53 * H - this.ankleH;
    this.l1 = legSpan * 0.505; this.l2 = legSpan * 0.505; // slightly over-long so a straight leg never over-reaches
    this.torsoLen = 0.3 * H;
    this.sw = 0.118 * H * Math.min(1.12, k); this.hw = 0.052 * H * k;
    this.armLen = Math.max(0.5, o.wingspan / 2 - this.sw);
    this.a1 = this.armLen * 0.53; this.a2 = this.armLen * 0.47;
    this.shY = this.torsoLen * 0.9;
    this.reachShoulder = this.hipStand + this.shY;

    this.root = new THREE.Group();
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.torso = new THREE.Group(); this.pelvis.add(this.torso);
    const tw = 0.105 * H * k, td = 0.068 * H * Math.min(1.3, k);
    const chest = mesh(cap, jersey, tw, this.torsoLen / 3.2, td); chest.position.y = this.torsoLen * 0.52; this.torso.add(chest);
    const hem = mesh(limb, trim, tw * 1.0, 0.03 * H, td * 1.05); hem.position.y = 0.02 * H; hem.scale.set(tw * 0.96, 0.03 * H, td * 1.0); this.torso.add(hem);
    const hips = mesh(cap, shorts, this.hw * 2.2, 0.16 * H / 3, td * 1.05); hips.position.y = -0.04 * H; this.pelvis.add(hips);
    const neck = mesh(limb, skin, 0.03 * H, 0.05 * H, 0.03 * H); neck.position.y = this.torsoLen + 0.045 * H; this.torso.add(neck);
    this.head = new THREE.Group(); this.head.position.y = this.torsoLen + 0.1 * H; this.torso.add(this.head);
    const hd = mesh(ball, skin, 0.066 * H, 0.083 * H, 0.074 * H); this.head.add(hd);
    this._hair(o, H);
    // number on the back
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); g.fillStyle = '#' + o.trim.toString(16).padStart(6, '0'); g.font = '900 46px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(o.number), 32, 34);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.17 * H, 0.17 * H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    num.position.set(0, this.torsoLen * 0.62, -td * 1.02); num.rotation.y = Math.PI; this.torso.add(num);
    this.numTex = tex;

    // legs: index 0 = right (local -x), 1 = left (local +x)
    this.legs = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const up = new THREE.Group(); up.position.set(s * this.hw, 0, 0); this.pelvis.add(up);
      up.add(mesh(limb, skin, 0.048 * H * k, this.l1, 0.048 * H * k));
      const lo = new THREE.Group(); lo.position.y = -this.l1; up.add(lo);
      lo.add(mesh(limb, skin, 0.034 * H * k, this.l2, 0.034 * H * k));
      const shortLeg = mesh(limb, shorts, 0.056 * H * k, this.l1 * 0.42, 0.056 * H * k); up.add(shortLeg);
      const foot = new THREE.Group(); foot.position.y = -this.l2; lo.add(foot);
      const shoe = mesh(shoeGeo, trim, 0.056 * H, 0.05 * H, 0.15 * H); shoe.position.set(0, -0.012 * H, 0.0); foot.add(shoe);
      this.legs.push({ s, up, lo, foot });
    }
    this.arms = [];
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const up = new THREE.Group(); up.position.set(s * this.sw, this.shY, 0); this.torso.add(up);
      const sh = mesh(ball, jersey, 0.045 * H, 0.045 * H, 0.045 * H); up.add(sh);
      up.add(mesh(limb, skin, 0.031 * H * k, this.a1, 0.031 * H * k));
      const lo = new THREE.Group(); lo.position.y = -this.a1; up.add(lo);
      lo.add(mesh(limb, skin, 0.025 * H * k, this.a2 * 0.92, 0.025 * H * k));
      const hand = mesh(ball, skin, 0.036 * H, 0.046 * H, 0.03 * H); hand.position.y = -this.a2 * 0.97; lo.add(hand);
      this.arms.push({ s, up, lo });
    }
    this.root.traverse((m) => { if (m.isMesh && m.material.map === undefined) m.castShadow = true; else if (m.isMesh) m.castShadow = false; });

    // pose inputs (written by the owner, read by pose())
    this.hipDrop = 0; this.jump = 0; this.leanX = 0; this.leanZ = 0;
    this.speed = 0; this.mvx = 0; this.mvz = 1; this.phase = 0; this.stride = 1.2; this.footRaise = 0; this.armSwing = 0.3;
    this.hand = [{ x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 0, w: 0 }]; // root-space ball-hand targets, w = blend weight 0..1
    this.headLook = 0;
  }
  _hair(o, H) {
    const hm = mat(o.hair, 0.9), st = o.hairStyle;
    if (st === 'bald') return;
    const c = mesh(hairCap, hm, 0.07 * H, 0.088 * H, 0.078 * H); c.position.y = 0.004 * H; this.head.add(c);
    if (st === 'afro') { const a = mesh(ball, hm, 0.088 * H, 0.09 * H, 0.09 * H); a.position.y = 0.022 * H; this.head.add(a); }
    else if (st === 'topknot') { const a = mesh(ball, hm, 0.03 * H, 0.03 * H, 0.03 * H); a.position.y = 0.1 * H; this.head.add(a); }
    else if (st === 'locs' || st === 'braids') for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, l = mesh(limb, hm, 0.011 * H, 0.07 * H, 0.011 * H);
      l.position.set(Math.cos(a) * 0.06 * H, 0.03 * H, Math.sin(a) * 0.06 * H); this.head.add(l);
    }
    if (o.accessory === 'headband') { const b = mesh(limb, mat(o.trim, 0.6), 0.072 * H, 0.014 * H, 0.08 * H); b.position.y = 0.04 * H; this.head.add(b); }
  }
  /** Two-bone IK in the parent's local space. Writes quaternions on `up` and `lo`. */
  _ik(up, lo, ax, ay, az, tx, ty, tz, l1, l2, px, py, pz) {
    let dx = tx - ax, dy = ty - ay, dz = tz - az;
    let L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxL = (l1 + l2) * 0.9985;
    if (L > maxL) { const f = maxL / L; dx *= f; dy *= f; dz *= f; L = maxL; }
    if (L < 0.05) L = 0.05;
    const nx = dx / L, ny = dy / L, nz = dz / L;
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pd = px * nx + py * ny + pz * nz;
    _pole.set(px - nx * pd, py - ny * pd, pz - nz * pd);
    if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, 1);
    _pole.normalize();
    const ex = nx * a + _pole.x * hh, ey = ny * a + _pole.y * hh, ez = nz * a + _pole.z * hh; // elbow relative to anchor
    _dir1.set(ex, ey, ez).normalize();
    _dir2.set(dx - ex, dy - ey, dz - ez).normalize();
    up.quaternion.setFromUnitVectors(DOWN, _dir1);
    _q.setFromUnitVectors(DOWN, _dir2);
    _inv.copy(up.quaternion).invert();
    lo.quaternion.copy(_inv).multiply(_q);
  }
  pose() {
    const p = this.pelvis, H = this.H;
    p.position.set(0, this.hipStand - this.hipDrop + this.jump, 0);
    this.torso.rotation.set(this.leanX, 0, this.leanZ);
    const w = Math.min(1, this.speed / 0.5), TAU = Math.PI * 2;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i], s = L.s;
      const ph = this.phase + (i ? 0.5 : 0);
      const amp = (this.stride / TAU) * w;
      const sOff = amp * Math.cos(TAU * ph);
      const lift = w * Math.max(0, -Math.sin(TAU * ph)) * (0.045 + 0.05 * Math.min(1, this.speed / 5)) * H;
      const fx = s * this.hw * 1.15 + this.mvx * sOff, fy = this.ankleH + lift + this.footRaise + this.jump * 0.55, fz = this.mvz * sOff;
      this._ik(L.up, L.lo, s * this.hw, 0, 0, fx, fy - p.position.y, fz, this.l1, this.l2, 0, 0.1, 1);
      _q2.copy(L.up.quaternion).multiply(L.lo.quaternion).invert();
      L.foot.quaternion.copy(_q2);
    }
    _inv.setFromEuler(this.torso.rotation).invert();
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i], s = A.s, hd = this.hand[i];
      const swing = this.armSwing * w * Math.sin(TAU * (this.phase + (i ? 0 : 0.5)));
      let tx = s * (this.sw + 0.06 * H), ty = this.shY - this.armLen * 0.86, tz = swing * this.armLen;
      if (hd.w > 0) {
        _a.set(hd.x, hd.y - p.position.y, hd.z).applyQuaternion(_inv);
        tx += (_a.x - tx) * hd.w; ty += (_a.y - ty) * hd.w; tz += (_a.z - tz) * hd.w;
      }
      this._ik(A.up, A.lo, s * this.sw, this.shY, 0, tx, ty, tz, this.a1, this.a2, s * 0.7, -0.6, -0.5);
    }
  }
}
