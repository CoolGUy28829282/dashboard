// Free shootaround: you control the shooter. Hold shoot to fill the meter, release in the green.
// The release only sets speed/angle/aim error; the rim (24-sphere torus), backboard, net and floor decide the result.
import * as THREE from 'three';
import { C, HOOP_X } from '../game/court.js';
import { stepAir, solveShotSpeed, BALL } from '../game/ballphys.js';
import { ACTIONS } from '../core/settings.js';
import { clamp, lerp, dampAngle, gauss, DEG } from '../core/util.js';

const G = BALL.g, R = BALL.r;
const SPRINT = ACTIONS.findIndex((a) => a.id === 'sprint'), SHOOT = ACTIONS.findIndex((a) => a.id === 'shoot');
const CHARGE_T = 1.0, CENTER = 0.8, TUBE = 0.01, RIM_R = C.rimRadius + C.rimTube, NPTS = 24;
const DIFF = { rookie: 1.5, pro: 1, allstar: 0.8, superstar: 0.65, hof: 0.5 };
const _ax = new THREE.Vector3();

export class Gym {
  constructor(arena, input, settings, audio, hud) {
    this.arena = arena; this.input = input; this.settings = settings; this.audio = audio; this.hud = hud;
    this.p = { x: 0, z: 4, px: 0, pz: 4, vx: 0, vz: 0, yaw: 0, pyaw: 0, jump: 0, pjump: 0, jumpV: 0, crouch: 0, pcrouch: 0, phase: 0, speed: 0, stride: 1, ph: 0, t: 0, air: false, released: false };
    this.b = { x: 0, y: 1, z: 0, px: 0, py: 1, pz: 0, vx: 0, vy: 0, vz: 0, mode: 0, bounceAt: 0 }; // mode 0 dribble, 1 carry, 2 free
    this.S = new Float64Array(9);
    this.netK = [0, 0];
    this.time = 0; this.prevShoot = false; this.meter = 0; this.relMeter = 0; this.curW = 0.07; this.side = 1;
    this.pickupAfter = 0; this.returnAt = Infinity; this.machine = true;
    this.shot = null; // live shot record
    this.stats = { att: 0, made: 0, a3: 0, m3: 0, pts: 0, streak: 0, best: 0 };
    this.rwS = 0; this.lwS = 0; this.lastMeterW = -1;
    this.pts = new Float64Array(NPTS * 2);
    for (let i = 0; i < NPTS; i++) { const a = (i / NPTS) * Math.PI * 2; this.pts[i * 2] = Math.cos(a) * RIM_R; this.pts[i * 2 + 1] = Math.sin(a) * RIM_R; }
    this.tmp = { x: 0, y: 0, z: 0 };
  }
  start() {
    const a = this.arena, p = this.p, b = this.b;
    a.gym = this; a.az = 0;
    p.x = p.px = HOOP_X - 5.5; p.z = p.pz = 2; p.vx = p.vz = 0; p.yaw = p.pyaw = Math.PI / 2; p.ph = 0; p.jump = 0; p.crouch = 0; p.air = false;
    b.mode = 0; b.vy = 0; b.y = 1; this._hand(p.x, p.z, p.yaw); b.x = b.px = this.tmp.x; b.z = b.pz = this.tmp.z; b.py = b.y;
    this.returnAt = Infinity; this.shot = null; this.meter = 0;
    this.hud.stats(this.stats); this.hud.shooter(a.featured);
  }
  stop() { this.arena.gym = null; this.arena._reset(); this.hud.meter(null); }
  newShooter(league) { this.arena.setFeatured(league); this.hud.shooter(this.arena.featured); this.stats = { att: 0, made: 0, a3: 0, m3: 0, pts: 0, streak: 0, best: 0 }; this.hud.stats(this.stats); this.start(); }
  toggleMachine() { this.machine = !this.machine; this.hud.machine(this.machine); }

  _hand(x, z, yaw) {
    const lx = -(this.arena.human.sw + 0.1), lz = 0.3, c = Math.cos(yaw), s = Math.sin(yaw);
    this.tmp.x = x + lx * c + lz * s; this.tmp.z = z - lx * s + lz * c;
  }
  _local(lx, ly, lz, yaw, jump) {
    const c = Math.cos(yaw), s = Math.sin(yaw), p = this.p;
    this.tmp.x = p.x + lx * c + lz * s; this.tmp.y = ly + jump; this.tmp.z = p.z - lx * s + lz * c;
  }
  _rating(x, z) {
    const r = this.arena.featured.player.ratings, hx = (x >= 0 ? 1 : -1) * HOOP_X, d = Math.hypot(x - hx, z);
    return this._isThree(x, z) ? r.thr : d > 3.4 ? r.mid : (r.ins + r.fin) / 2;
  }
  _isThree(x, z) { const hx = (x >= 0 ? 1 : -1) * HOOP_X; return Math.hypot(x - hx, z) >= C.threeR || Math.abs(z) >= C.threeCorner; }

  step(dt) {
    this.time += dt;
    const p = this.p, b = this.b, I = this.input, H = this.arena.human.H;
    p.px = p.x; p.pz = p.z; p.pyaw = p.yaw; p.pjump = p.jump; p.pcrouch = p.crouch;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    const held = !!(I.down[SHOOT] || I.keys.has('Space')), pressed = held && !this.prevShoot;
    this.prevShoot = held;
    this.netK[0] *= Math.exp(-3.2 * dt); this.netK[1] *= Math.exp(-3.2 * dt);
    this.side = p.x >= 0 ? 1 : -1;
    const hx = this.side * HOOP_X, toHoop = Math.atan2(hx - p.x, -p.z);
    switch (p.ph) {
      case 0:
        this._loco(dt, I.mx, I.my, I.down[SPRINT]);
        p.crouch = Math.max(0, p.crouch - dt * H * 0.6);
        if (pressed && b.mode === 0) { p.ph = 1; p.t = 0; b.mode = 1; this.ax = b.x; this.ay = b.y; this.az = b.z; this.audio.sfx('squeak', 0.3, 1.2); }
        break;
      case 1: { // charge
        p.t += dt; const k = Math.exp(-9 * dt);
        p.vx *= k; p.vz *= k; p.x += p.vx * dt; p.z += p.vz * dt;
        p.speed = Math.hypot(p.vx, p.vz); p.phase += (p.speed * dt) / 1.3;
        p.yaw = dampAngle(p.yaw, toHoop, 14, dt);
        const u = Math.min(1, p.t / 0.3), e = u * u * (3 - 2 * u);
        p.crouch = (0.05 + 0.04 * Math.min(1, p.t / CHARGE_T)) * H * e;
        this._local(-0.04, this.arena.human.reachShoulder - 0.12 * H, 0.32, p.yaw, 0);
        b.x = lerp(this.ax, this.tmp.x, e); b.y = lerp(this.ay, this.tmp.y, e); b.z = lerp(this.az, this.tmp.z, e);
        const m = p.t / CHARGE_T;
        this.meter = Math.min(1.25, m);
        this.curW = (0.035 + 0.075 * clamp((this._rating(p.x, p.z) - 45) / 55, 0, 1)) * (DIFF[this.settings.get('difficulty')] || 1);
        this.hud.meter(this.meter, CENTER, this.curW);
        if (!held || m >= 1.2) { this.relMeter = this.meter; p.ph = 2; p.t = 0; p.air = false; p.released = false; this.hud.meter(null); }
        break;
      }
      case 2: { // load, jump, release at apex
        p.t += dt; p.speed = 0; p.yaw = dampAngle(p.yaw, toHoop, 14, dt);
        const v = this.arena.human;
        if (!p.air) {
          p.crouch = (0.09 + 0.08 * Math.min(1, p.t / 0.1)) * H;
          if (p.t >= 0.1) { p.air = true; p.jumpV = Math.sqrt(2 * G * 0.36); p.jump = 0.001; }
          this._local(-0.04, v.reachShoulder - 0.15 * H, 0.32, p.yaw, 0); b.x = this.tmp.x; b.y = this.tmp.y; b.z = this.tmp.z;
        } else {
          p.jumpV -= G * dt; p.jump += p.jumpV * dt; p.crouch = Math.max(0, p.crouch - dt * H * 1.2);
          const u = Math.min(1, (p.t - 0.1) / 0.2), e = 1 - (1 - u) * (1 - u);
          this._local(-0.04, v.reachShoulder - 0.12 * H, 0.32, p.yaw, p.jump); const px = this.tmp.x, py = this.tmp.y, pz = this.tmp.z;
          this._local(0, v.reachShoulder + v.armLen * 0.85, 0.16, p.yaw, p.jump);
          if (!p.released) { b.x = lerp(px, this.tmp.x, e); b.y = lerp(py, this.tmp.y, e); b.z = lerp(pz, this.tmp.z, e); }
          if (!p.released && p.jumpV <= 0.3) this._release();
          if (p.jump <= 0 && p.jumpV < 0) { p.jump = 0; p.air = false; p.ph = 3; p.t = 0; p.crouch = 0.1 * H; this.audio.sfx('squeak', 0.5, 1 + Math.random() * 0.2); }
        }
        break;
      }
      default: // follow-through, then back to free movement
        p.t += dt; p.crouch *= Math.exp(-7 * dt);
        this._loco(dt, I.mx * 0.5, I.my * 0.5, false);
        if (p.t > 0.4) p.ph = 0;
    }
    this._ball(dt);
    if (this.shot && !this.shot.done && this.time - this.shot.t0 > 6) this._finish(false, 'Airball');
    if (this.machine && b.mode === 2 && this.time > this.returnAt && p.ph !== 1) this._returnBall();
  }
  _loco(dt, ix, iy, sprint) {
    const p = this.p, sp = (this.settings.get('gameSpeed') || 1), vmax = (sprint ? 6.3 : 4.3) * sp;
    const tx = ix * vmax, tz = iy * vmax, mag = Math.hypot(tx, tz);
    let ex = tx - p.vx, ez = tz - p.vz; const el = Math.hypot(ex, ez), mx = (mag > 0.1 ? 11 : 9) * dt;
    if (el > mx) { ex *= mx / el; ez *= mx / el; }
    p.vx += ex; p.vz += ez; p.x = clamp(p.x + p.vx * dt, -C.halfL - 1.5, C.halfL + 1.5); p.z = clamp(p.z + p.vz * dt, -C.halfW - 1.2, C.halfW + 1.2);
    const s = (p.speed = Math.hypot(p.vx, p.vz));
    if (s > 0.5) p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 10, dt);
    p.stride = lerp(0.9, 2.3, clamp(s / 6.5, 0, 1)); p.phase += (s * dt) / p.stride; if (p.phase > 1) p.phase -= 1;
  }

  _release() {
    const p = this.p, b = this.b, S = this.S, st = this.stats;
    p.released = true; b.mode = 2;
    const side = this.side, hx = side * HOOP_X, x0 = b.x, y0 = b.y, z0 = b.z;
    let dx = hx - x0, dz = -z0; const d = Math.hypot(dx, dz);
    const ang = clamp(58 - d * 1.5, 45, 55) * DEG, spin = (2.2 + Math.random() * 0.6) * 2 * Math.PI;
    const rating = this._rating(p.x, p.z), w = this.curW, e = clamp((this.relMeter - CENTER) / w, -6, 6), ae = Math.abs(e);
    let v = solveShotSpeed(x0, y0, z0, hx, C.rimH, 0, ang, spin);
    v *= 1 + 0.013 * e + (ae < 0.3 ? 0 : gauss(Math.random) * 0.008);
    const lat = ae < 0.3 ? 0 : gauss(Math.random) * (0.004 + 0.009 * Math.min(ae, 3)) * (1.3 - rating / 100) * (1 + d / 10);
    const c = Math.cos(lat), s = Math.sin(lat), ux0 = dx / d, uz0 = dz / d, ux = ux0 * c - uz0 * s, uz = ux0 * s + uz0 * c, ca = Math.cos(ang);
    b.vx = v * ca * ux; b.vy = v * Math.sin(ang); b.vz = v * ca * uz;
    S[6] = -uz * spin; S[7] = 0; S[8] = ux * spin;
    const three = this._isThree(p.x, p.z);
    st.att++; if (three) st.a3++;
    this.shot = { t0: this.time, three, d, ang, spin, e, rating, made: false, rim: false, board: false, done: false, entry: 0, timing: ae < 0.3 ? 'Perfect' : ae <= 1 ? 'Good' : e < 0 ? 'Early' : 'Late' };
    this.pickupAfter = this.time + 0.7; this.returnAt = this.time + 2.1;
    this.audio.sfx('whoosh', 0.15, 1.4);
    this.hud.stats(st);
  }
  _finish(made, text) {
    const s = this.shot, st = this.stats;
    if (!s || s.done) return;
    s.done = true; s.made = made;
    if (made) { st.made++; st.pts += s.three ? 3 : 2; if (s.three) st.m3++; st.streak++; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
    this.hud.stats(st);
    this.hud.shot({ made, text, dist: s.d / 0.3048, three: s.three, timing: s.timing, arc: s.ang / DEG, entry: s.entry, spin: s.spin / (2 * Math.PI), rating: s.rating });
  }
  _returnBall() {
    const p = this.p, b = this.b, S = this.S, T = 0.95;
    this.returnAt = Infinity;
    const sx = this.side * (HOOP_X - 0.7);
    b.x = sx; b.y = 1.0; b.z = 0; b.vx = (p.x + Math.sin(p.yaw) * 0.3 - sx) / T; b.vz = (p.z + Math.cos(p.yaw) * 0.3 - 0) / T; b.vy = (1.15 - 1.0) / T + 0.5 * G * T;
    S[6] = S[7] = S[8] = 0; b.px = b.x; b.py = b.y; b.pz = b.z; b.mode = 2; this.pickupAfter = this.time;
  }

  _ball(dt) {
    const b = this.b, p = this.p, S = this.S, H = this.arena.human.H;
    if (b.mode === 0) { // dribble: real bounce, hand follows
      const top = 0.52 * H, push = Math.sqrt(2 * G * (top - R) * (1 / (BALL.e * BALL.e) - 1));
      this._hand(p.x, p.z, p.yaw); b.x = this.tmp.x; b.z = this.tmp.z;
      b.vy -= G * dt; b.y += b.vy * dt;
      if (b.y <= R) { b.y = R; if (b.vy < -0.5 && this.time - b.bounceAt > 0.12) { b.bounceAt = this.time; this.audio.sfx('bounce', 0.5, 0.92 + Math.random() * 0.1); } b.vy = -b.vy * BALL.e; }
      else if (b.vy > 0 && b.y >= top) { b.y = top; b.vy = -push; }
      return;
    }
    if (b.mode === 1) { b.vx = b.vy = b.vz = 0; return; }
    const sub = 2, h = dt / sub;
    for (let k = 0; k < sub; k++) this._free(h, S, b);
    // pick the ball back up
    const dx = b.x - p.x, dz = b.z - p.z;
    if (p.ph === 0 && this.time > this.pickupAfter && dx * dx + dz * dz < 0.3 && b.y < 1.5) { b.mode = 0; b.vx = b.vy = b.vz = 0; this.returnAt = Infinity; }
  }
  _free(dt, S, b) {
    const sh = this.shot;
    S[0] = b.x; S[1] = b.y; S[2] = b.z; S[3] = b.vx; S[4] = b.vy; S[5] = b.vz;
    const py = b.y;
    stepAir(S, dt);
    b.x = S[0]; b.y = S[1]; b.z = S[2]; b.vx = S[3]; b.vy = S[4]; b.vz = S[5];
    const s = b.x >= 0 ? 1 : -1, hx = s * HOOP_X, ox = b.x - hx, dh = Math.sqrt(ox * ox + b.z * b.z), ni = s > 0 ? 0 : 1;
    // rim
    if (Math.abs(b.y - C.rimH) < R + 0.05 && dh < RIM_R + R + 0.05) {
      const lim = R + TUBE;
      for (let i = 0; i < NPTS; i++) {
        const rx = hx + this.pts[i * 2], rz = this.pts[i * 2 + 1];
        const dx = b.x - rx, dy = b.y - C.rimH, dz = b.z - rz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < lim * lim && d2 > 1e-9) {
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, vn = b.vx * nx + b.vy * ny + b.vz * nz;
          b.x = rx + nx * lim; b.y = C.rimH + ny * lim; b.z = rz + nz * lim;
          if (vn < 0) {
            const j = -(1 + 0.5) * vn;
            b.vx += j * nx; b.vy += j * ny; b.vz += j * nz; b.vx *= 0.99; b.vz *= 0.99;
            if (-vn > 1.0 && this.time - b.bounceAt > 0.06) { b.bounceAt = this.time; this.audio.sfx('rim', Math.min(1, -vn / 5), 0.9 + Math.random() * 0.2); }
            if (sh && !sh.done) sh.rim = true;
          }
        }
      }
    }
    // backboard
    const face = C.halfL - C.boardFromBaseline - C.boardT, ds = s * b.x;
    if (ds > face - R && ds < face + 0.2 && s * b.vx > 0 && b.y > C.boardBottom - R && b.y < C.boardBottom + C.boardH + R && Math.abs(b.z) < C.boardW / 2 + R) {
      b.x = s * (face - R); b.vx = -b.vx * 0.62; b.vy *= 0.98;
      if (-s * b.vx > 0.8) { this.audio.sfx('rim', Math.min(1, Math.abs(b.vx) / 5) * 0.8, 0.65); if (sh && !sh.done) sh.board = true; }
    }
    // through the net
    if (b.vy < 0 && py > C.rimH && b.y <= C.rimH && dh < RIM_R - 0.02) {
      this.netK[ni] = 1; this.audio.sfx('swish', 0.9, 0.95 + Math.random() * 0.1);
      if (sh && !sh.done) { sh.entry = Math.atan2(-b.vy, Math.hypot(b.vx, b.vz)) / DEG; this._finish(true, sh.rim ? (sh.board ? 'Bank, in' : 'Rim in') : sh.board ? 'Bank' : 'Swish'); }
    }
    if (dh < 0.2 && b.y < C.rimH && b.y > C.rimH - 0.5) { const k = 1 - 9 * dt; b.vx *= k; b.vz *= k; b.vy *= 1 - 3 * dt; }
    const lim = C.halfL + 1.6, limz = C.halfW + 1.4;
    if (b.x > lim) { b.x = lim; b.vx = -b.vx * 0.4; } else if (b.x < -lim) { b.x = -lim; b.vx = -b.vx * 0.4; }
    if (b.z > limz) { b.z = limz; b.vz = -b.vz * 0.4; } else if (b.z < -limz) { b.z = -limz; b.vz = -b.vz * 0.4; }
    if (b.y <= R) {
      b.y = R;
      if (sh && !sh.done) this._finish(false, sh.rim ? 'Off the rim' : sh.board ? 'Off the glass' : 'Airball');
      if (b.vy < -0.5) {
        if (b.vy < -1.5 && this.time - b.bounceAt > 0.08) { b.bounceAt = this.time; this.audio.sfx('bounce', Math.min(1, -b.vy / 7), 0.85 + Math.random() * 0.1); }
        b.vy = -b.vy * BALL.e; b.vx *= 0.9; b.vz *= 0.9;
      } else {
        b.vy = 0; const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0) { const f = Math.max(0, sp - 0.55 * dt) / sp; b.vx *= f; b.vz *= f; }
        S[6] = b.vz / R; S[7] = 0; S[8] = -b.vx / R;
      }
    }
  }

  render(renderer, alpha, dt) {
    const a = this.arena, hm = a.human, p = this.p, b = this.b;
    const px = lerp(p.px, p.x, alpha), pz = lerp(p.pz, p.z, alpha);
    const yaw = p.pyaw + ((((p.yaw - p.pyaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * alpha;
    const jump = lerp(p.pjump, p.jump, alpha), crouch = lerp(p.pcrouch, p.crouch, alpha);
    const bx = lerp(b.px, b.x, alpha), by = lerp(b.py, b.y, alpha), bz = lerp(b.pz, b.z, alpha);
    a.ballMesh.position.set(bx, by, bz);
    const S = this.S, w = Math.sqrt(S[6] * S[6] + S[7] * S[7] + S[8] * S[8]);
    if (b.mode === 2 && w > 0.01) { _ax.set(S[6] / w, S[7] / w, S[8] / w); a.ballMesh.rotateOnWorldAxis(_ax, w * dt); } else if (b.mode === 0) { _ax.set(1, 0, 0); a.ballMesh.rotateOnWorldAxis(_ax, 1.5 * dt); }
    hm.root.position.set(px, 0, pz); hm.root.rotation.y = yaw;
    const c = Math.cos(yaw), sn = Math.sin(yaw), sp = p.speed;
    hm.speed = sp; hm.phase = p.phase; hm.stride = p.stride; hm.hipDrop = crouch; hm.jump = jump;
    if (sp > 0.05) { const m = Math.hypot(p.vx, p.vz) || 1; hm.mvx = (p.vx * c - p.vz * sn) / m; hm.mvz = (p.vx * sn + p.vz * c) / m; }
    hm.leanX = clamp(sp * 0.035, 0, 0.2) + crouch * 0.5; hm.leanZ = 0;
    const dx = bx - px, dz = bz - pz, lx = dx * c - dz * sn, lz = dx * sn + dz * c, ease = 1 - Math.exp(-14 * dt);
    const r = hm.hand[0], l = hm.hand[1];
    const rt = b.mode === 2 && p.ph === 0 ? 0 : 1, lt = p.ph === 1 || (p.ph === 2 && !p.released) ? 0.9 : 0;
    this.rwS += (rt - this.rwS) * ease; this.lwS += (lt - this.lwS) * ease;
    r.x = lx; r.y = by + (b.mode === 0 ? 0.1 : -0.075); r.z = lz; r.w = this.rwS;
    l.x = lx + 0.12; l.y = by - 0.02; l.z = lz - 0.01; l.w = this.lwS;
    hm.pose();
    const ph = this.time * 22;
    for (let i = 0; i < 2; i++) { const k = this.netK[i]; a.nets[i].scale.set(1 + 0.1 * k * Math.sin(ph), 1 + 0.22 * k * (0.5 + 0.5 * Math.sin(ph * 0.8)), 1 + 0.1 * k * Math.cos(ph)); }
    a._camera(dt, px, pz, p.vx, p.vz, this.side * HOOP_X);
    renderer.render(a.scene, a.camera);
  }
}
