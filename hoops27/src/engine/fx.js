// Pooled GPU particles, world-space shot meter, contest ring, hot-streak flames.
import * as THREE from 'three';
import { COLORS } from '../tuning.js';
import { PARTICLE_VS, PARTICLE_FS } from '../shaders/particles.js';
import { METER_FS, BAR_FS } from '../shaders/meter.js';


export class Particles {
  constructor(scene, max = 2400) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.life = new Float32Array(max); this.ttl = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.attrs = { position: new THREE.BufferAttribute(this.pos, 3), color: new THREE.BufferAttribute(this.col, 4), size: new THREE.BufferAttribute(this.size, 1), life: new THREE.BufferAttribute(this.life, 1) };
    for (const k in this.attrs) { this.attrs[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, this.attrs[k]); }
    this.mat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { scale: { value: 800 } } });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(p, v, color, size, ttl, grav = 0) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.col.set([color.r, color.g, color.b, 1], i * 4); this.size[i] = size; this.life[i] = 1; this.ttl[i] = ttl; this.grav[i] = grav;
  }
  burst(p, hex, count = 40, speed = 4, ttl = 0.8, size = 0.22) {
    const c = new THREE.Color(hex);
    for (let n = 0; n < count; n++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.1, s = speed * (0.4 + Math.random() * 0.8); this.emit(p, { x: Math.cos(a) * Math.cos(e) * s, y: Math.sin(e) * s + speed * 0.3, z: Math.sin(a) * Math.cos(e) * s }, c, size * (0.6 + Math.random() * 0.8), ttl * (0.6 + Math.random() * 0.6), 6); }
  }
  flame(p, hex) { const c = new THREE.Color(hex); this.emit({ x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + Math.random() * 0.4, z: p.z + (Math.random() - 0.5) * 0.4 }, { x: (Math.random() - 0.5) * 0.4, y: 1.2 + Math.random() * 1.4, z: (Math.random() - 0.5) * 0.4 }, c, 0.35, 0.7, -1); }
  update(dt, viewHeight) {
    this.mat.uniforms.scale.value = viewHeight * 0.9;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt / this.ttl[i]; if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      const j = i * 3; this.vel[j + 1] -= this.grav[i] * dt; this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02 && this.grav[i] > 0) { this.pos[j + 1] = 0.02; this.vel[j + 1] *= -0.4; }
    }
    for (const k in this.attrs) this.attrs[k].needsUpdate = true;
  }
}


export class ShotMeterView {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { fill: { value: 0 }, winC: { value: 0.92 }, winW: { value: 0.06 }, time: { value: 0 }, trackCol: { value: new THREE.Color(COLORS.cyan) }, fillCol: { value: new THREE.Color(COLORS.cyan) }, greenCol: { value: new THREE.Color(COLORS.lime) }, flash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: METER_FS,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), this.mat); this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.y = 0.03; this.mesh.visible = false;
    this.group = new THREE.Group(); this.group.add(this.mesh); scene.add(this.group);
    this.contest = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 40), new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0.8, depthWrite: false })); this.contest.rotation.x = -Math.PI / 2; this.contest.position.y = 0.025; this.contest.visible = false; this.group.add(this.contest);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0.2, depthWrite: false })); this.glow.rotation.x = -Math.PI / 2; this.glow.position.y = 0.02; this.glow.visible = false; this.group.add(this.glow);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: COLORS.cyan })); this.dot.visible = false; this.group.add(this.dot);
    this.palette = { track: COLORS.cyan, good: COLORS.lime, warn: COLORS.amber, bad: COLORS.danger, ok: COLORS.lime, mid: COLORS.amber };
    this.flashT = 0;
    // overhead bar (2K style): billboard above the shooter's head
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { fill: { value: 0 }, zoneLo: { value: 0.85 }, time: { value: 0 }, greenCol: { value: new THREE.Color('#34ff55') }, resCol: { value: new THREE.Color('#ffffff') }, res: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: BAR_FS }));
    this.bar.renderOrder = 20; this.bar.visible = false; scene.add(this.bar); this.hold = 0; this.holdFill = 0; this.holdP = null;
  }
  /** Freeze the bar for a moment after release and tint it by grade (perfect = green, early/late = amber, way off = red). */
  result(player, grade) {
    const col = { perfect: '#2dff4f', excellent: '#19e8ff', good: '#ffffff', early: '#ffb000', late: '#ffb000', wayoff: '#ff3355' }[grade] ?? '#ffffff';
    const u = this.bar.material.uniforms; u.resCol.value.set(col); this.hold = 0.75; this.holdP = player; this.holdFill = u.fill.value;
  }
  setPalette(name) { // colour-blind-safe meter palettes
    const P = { default: { ok: COLORS.lime, mid: COLORS.amber, bad: COLORS.danger, green: COLORS.lime }, deuteranopia: { ok: '#2E9BFF', mid: '#FFD21F', bad: '#FF5A1F', green: '#2E9BFF' }, protanopia: { ok: '#36B6FF', mid: '#FFE24A', bad: '#FF8A00', green: '#36B6FF' }, tritanopia: { ok: '#00E5A0', mid: '#FF9EB5', bad: '#FF2B55', green: '#00E5A0' } };
    this.palette = { ...this.palette, ...(P[name] ?? P.default) }; this.mat.uniforms.greenCol.value.set(this.palette.green);
  }
  flash() { this.flashT = 0.4; }
  update(dt, t, p, style, ctx) {
    const m = p?.shotMeter, a = p?.action;
    this.flashT = Math.max(0, this.flashT - dt); this.mat.uniforms.flash.value = this.flashT;
    const bu = this.bar.material.uniforms; this.hold = Math.max(0, this.hold - dt);
    if (this.hold > 0 && this.holdP) { // post-release: the blade freezes with the result colour, then fades
      const q = this.holdP; this.bar.visible = style === 'overhead'; this.placeBar(q, ctx); bu.fill.value = this.holdFill; bu.res.value = Math.min(1, this.hold * 3); bu.time.value = t;
    } else { this.bar.visible = false; bu.res.value = 0; }
    if (style === 'overhead' && p && m && a && !a.released) {
      const wf = Math.min(0.5, (m.windowMs / 1000 / m.D)); // zone height as a share of the blade; 100% fill lands in the middle of the zone
      const top = 1 - wf / 2; bu.zoneLo.value = 1 - wf; bu.fill.value = Math.min(1, (m.t / m.D) * top); bu.time.value = t; bu.res.value = 0; bu.resCol.value.set('#ffffff'); this.hold = 0;
      this.bar.visible = true; this.placeBar(p, ctx); this.mesh.visible = false; this.dot.visible = false; this.group.position.set(p.pos.x, 0, p.pos.z); this.placeContest(p, m); this.contest.visible = true; return;
    }
    if (!p || !m || !a || a.released || style === 'off') { this.mesh.visible = false; this.dot.visible = false; this.contest.visible = !!(p && m && a && !a.released && style !== 'off' && ctx.showContest); if (this.contest.visible) this.placeContest(p, m); this.group.position.set(p?.pos.x ?? 0, 0, p?.pos.z ?? 0); return; }
    this.group.position.set(p.pos.x, 0, p.pos.z); 
    const f = Math.min(1.2, m.t / m.D) * 0.92; // 100% fill sits at 0.92 of the arc; the green window is centred there
    const wFrac = (m.windowMs / 1000 / m.D) * 0.92;
    this.mat.uniforms.fill.value = f; this.mat.uniforms.winC.value = 0.92; this.mat.uniforms.winW.value = wFrac; this.mat.uniforms.time.value = t;
    this.mat.uniforms.fillCol.value.set(f > 0.92 - wFrac / 2 && f < 0.92 + wFrac / 2 ? this.palette.green : this.palette.track);
    const showArc = style === 'standard'; this.mesh.visible = showArc;
    this.mesh.rotation.set(-Math.PI / 2, 0, 0); this.group.rotation.y = Math.PI / 2 - p.face; // arc opens toward the shooter's facing
    this.placeContest(p, m); this.contest.visible = ctx.showContest !== false;
    // minimal dot at the head
    this.dot.visible = style === 'minimal'; if (this.dot.visible) { this.dot.position.set(0, p.y + p.height + 0.35, 0); const inWin = Math.abs(f - 0.92) < wFrac / 2; this.dot.material.color.set(inWin ? this.palette.green : '#ffffff'); this.dot.scale.setScalar(inWin ? 1.8 : 1); }
  }
  /** stand the crescent beside the shooter (screen-left of the body), facing the camera, sized to the player */
  placeBar(p, ctx) {
    const cam = ctx.camera; if (!cam) { this.bar.position.set(p.pos.x, p.y + p.height * 0.6, p.pos.z); return; }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); this.bar.quaternion.copy(cam.quaternion);
    const k = p.height / 2.0, d = Math.hypot(cam.position.x - p.pos.x, cam.position.z - p.pos.z); const near = Math.min(1.5, Math.max(1, d / 14)); // stays legible from far cameras
    this.bar.scale.setScalar(k * near); this.bar.position.set(p.pos.x - right.x * 0.6 * k * near, p.y + p.height * 0.58, p.pos.z - right.z * 0.6 * k * near);
  }
  /** (legacy) keep the bar a readable size on screen regardless of camera distance */
  distScale(ctx, p) { if (!ctx.camera) return 1; const d = Math.hypot(ctx.camera.position.x - p.pos.x, ctx.camera.position.y - 2, ctx.camera.position.z - p.pos.z); return Math.min(2.6, Math.max(0.9, d / 11)); }
  placeContest(p, m) { const c = m.contest ?? 0; const col = c < 0.25 ? this.palette.ok : c < 0.6 ? this.palette.mid : this.palette.bad; this.contest.material.color.set(col); this.glow.material.color.set(col); this.glow.visible = this.contest.visible || true; this.contest.position.y = 0.025; }
}
