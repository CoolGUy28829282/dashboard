// The Neon Era arena: LED court, glass backboards, hoops, tiered stands, instanced crowd, volumetric light show, hologram scoreboard.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COURT, COLORS } from '../tuning.js';
import { HALF_L, HALF_W, RIM_X } from '../physics/world.js';
import { mulberry32 } from './rng.js';
import { BEAM_VS, BEAM_FS } from '../shaders/beam.js';

const PPM = 56; // court texture pixels per metre

export function courtTexture(accent = '#00F0FF', accent2 = '#FF2BD6', tint = '#0a1a2e', logoText = 'NEON ERA') {
  const W = Math.round(COURT.length * PPM), H = Math.round(COURT.width * PPM);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const X = (x) => (x + HALF_L) * PPM, Z = (z) => (z + HALF_W) * PPM; // world metres -> pixels
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, tint); grd.addColorStop(0.5, '#05060d'); grd.addColorStop(1, tint);
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // subtle LED tile grid
  g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1;
  for (let x = -HALF_L; x <= HALF_L; x += 0.5) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
  for (let z = -HALF_W; z <= HALF_W; z += 0.5) { g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }
  // painted areas
  g.fillStyle = hexA(accent, 0.16);
  for (const s of [-1, 1]) { const x0 = X(s * HALF_L), x1 = X(s * (HALF_L - COURT.backboardOffset - COURT.ftLine)); g.fillRect(Math.min(x0, x1), Z(-COURT.paintWidth / 2), Math.abs(x1 - x0), COURT.paintWidth * PPM); }
  const glowLine = (col, w, fn) => { g.save(); g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 14; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); fn(); g.stroke(); g.restore(); g.save(); g.strokeStyle = '#fff'; g.globalAlpha = 0.55; g.lineWidth = Math.max(1.5, w * 0.3); g.beginPath(); fn(); g.stroke(); g.restore(); };
  const lw = 0.1 * PPM;
  glowLine(accent, lw, () => { g.rect(X(-HALF_L) + lw / 2, Z(-HALF_W) + lw / 2, COURT.length * PPM - lw, COURT.width * PPM - lw); });
  glowLine(accent, lw * 0.8, () => { g.moveTo(X(0), Z(-HALF_W)); g.lineTo(X(0), Z(HALF_W)); });
  glowLine(accent, lw * 0.8, () => { g.arc(X(0), Z(0), 1.83 * PPM, 0, Math.PI * 2); });
  for (const s of [-1, 1]) {
    const bx = s * HALF_L, rx = s * RIM_X, ftx = s * (HALF_L - COURT.backboardOffset - COURT.ftLine);
    glowLine(accent, lw * 0.8, () => { g.rect(Math.min(X(bx), X(ftx)), Z(-COURT.paintWidth / 2), Math.abs(X(ftx) - X(bx)), COURT.paintWidth * PPM); });
    glowLine(accent, lw * 0.8, () => { g.arc(X(ftx), Z(0), 1.83 * PPM, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? true : false); });
    glowLine(accent2, lw, () => { // three-point line: corners straight, arc between
      const R = COURT.threeArc, cz = COURT.threeCorner, a = Math.asin(cz / R); const cornerEnd = Math.cos(a) * R;
      g.moveTo(X(bx), Z(-cz)); g.lineTo(X(rx - s * cornerEnd), Z(-cz));
      const a0 = s > 0 ? Math.PI + a : -a, a1 = s > 0 ? Math.PI - a : a;
      g.arc(X(rx), Z(0), R * PPM, s > 0 ? Math.PI - a : a, s > 0 ? Math.PI + a : -a, s > 0 ? false : true); void a0; void a1;
      g.moveTo(X(rx - s * cornerEnd), Z(cz)); g.lineTo(X(bx), Z(cz));
    });
    glowLine(accent, lw * 0.6, () => { g.arc(X(rx), Z(0), 1.25 * PPM, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2 + Math.PI * 0, false); });
  }
  // center logo
  g.save(); g.translate(X(0), Z(0)); g.fillStyle = hexA(accent2, 0.9); g.shadowColor = accent2; g.shadowBlur = 24; g.font = `800 ${0.95 * PPM}px Orbitron, Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(logoText, 0, -0.1 * PPM); g.font = `600 ${0.38 * PPM}px Orbitron, sans-serif`; g.fillStyle = hexA(accent, 0.9); g.shadowColor = accent; g.fillText('HOOPS 27', 0, 0.75 * PPM); g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true; return tex;
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };


export class Arena {
  constructor(scene, arena, opts = {}) {
    this.scene = scene; this.arena = arena; this.group = new THREE.Group(); scene.add(this.group); this.time = 0;
    this.opts = opts; this.beams = []; this.rimLights = []; this.nets = []; this.standMeshes = [];
    this.accent = new THREE.Color(arena.accent); this.accent2 = new THREE.Color(arena.accent2);
    this.crowdExcite = 0; this.rimFlash = [0, 0]; this.rimColor = [new THREE.Color(), new THREE.Color()];
    this.buildLights(); this.buildCourt(opts.reflection ?? 0.6); this.buildHoops(); this.buildStands(opts.crowd ?? 1); this.buildBeams(); this.buildScoreboard(); this.buildRoof();
    scene.background = new THREE.Color(COLORS.void); scene.fog = new THREE.FogExp2(0x05060d, 0.011);
  }
  buildLights() {
    const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x141a30, 1.0); this.group.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-6, 22, -10); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 11; sc.bottom = -11; sc.near = 5; sc.far = 50; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    this.group.add(key, key.target); this.key = key;
    const rimL = new THREE.PointLight(this.accent, 20, 40, 1.6); rimL.position.set(0, 9, -9); const rimR = new THREE.PointLight(this.accent2, 18, 40, 1.6); rimR.position.set(0, 9, 9); this.group.add(rimL, rimR); this.fillLights = [rimL, rimR];
  }
  buildCourt(reflection) {
    const tex = courtTexture(this.arena.accent, this.arena.accent2, this.arena.floorTint);
    const geo = new THREE.PlaneGeometry(COURT.length, COURT.width);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.28, metalness: 0.15, transparent: reflection > 0, opacity: reflection > 0 ? 0.86 : 1 });
    this.court = new THREE.Mesh(geo, mat); this.court.rotation.x = -Math.PI / 2; this.court.position.y = 0.005; this.court.receiveShadow = true; this.group.add(this.court);
    // surround apron
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(COURT.length + 18, COURT.width + 18), new THREE.MeshStandardMaterial({ color: 0x080b16, roughness: 0.35, metalness: 0.6 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.03; apron.receiveShadow = true; this.group.add(apron);
    if (reflection > 0) {
      const size = Math.round(1024 * reflection);
      this.mirror = new Reflector(new THREE.PlaneGeometry(COURT.length + 18, COURT.width + 18), { textureWidth: size, textureHeight: Math.round(size * 0.55), color: 0x3a3f55, clipBias: 0.003 });
      this.mirror.rotation.x = -Math.PI / 2; this.mirror.position.y = -0.01; this.group.add(this.mirror);
    }
    // LED sideline strips
    const ledMat = new THREE.MeshBasicMaterial({ color: this.accent });
    this.led = [];
    for (const z of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(COURT.length + 1, 0.12, 0.12), ledMat.clone()); m.position.set(0, 0.06, z * (HALF_W + 1.1)); this.group.add(m); this.led.push(m); }
    for (const x of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, COURT.width + 2.4), ledMat.clone()); m.position.set(x * (HALF_L + 1.1), 0.06, 0); this.group.add(m); this.led.push(m); }
  }
  buildHoops() {
    const carbon = new THREE.MeshStandardMaterial({ color: 0x10131c, roughness: 0.35, metalness: 0.8 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, transmission: 0.0, side: THREE.DoubleSide });
    this.hoops = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const bx = s * (HALF_L - COURT.backboardOffset);
      const boardY = COURT.rimHeight - 0.148 + COURT.backboardH / 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, COURT.backboardH, COURT.backboardW), glass); board.position.set(bx - s * 0.03, boardY, 0); g.add(board);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), new THREE.LineBasicMaterial({ color: this.accent })); frame.position.copy(board.position); g.add(frame);
      const square = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.01, 0.59, 0.61)), new THREE.LineBasicMaterial({ color: 0xffffff })); square.position.set(bx + -s * 0.0, COURT.rimHeight + 0.1, 0); g.add(square);
      const rimX = s * RIM_X;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimInnerDiameter / 2 + 0.0095, 0.0095, 12, 40), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff3a00, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.set(rimX, COURT.rimHeight, 0); g.add(rim);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.016, 8, 48), new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0.55 })); halo.rotation.x = Math.PI / 2; halo.position.copy(rim.position); halo.position.y -= 0.01; g.add(halo); this.rimLights.push(halo);
      // net: cone of lines, animated by scaling on scores
      const pts = []; const n = 16;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4; const r0 = 0.238 - 0.07 * t0, r1 = 0.238 - 0.07 * t1; pts.push(Math.cos(a) * r0, -0.4 * t0, Math.sin(a) * r0, Math.cos(a + 0.2) * r1, -0.4 * t1, Math.sin(a + 0.2) * r1); pts.push(Math.cos(a) * r0, -0.4 * t0, Math.sin(a) * r0, Math.cos(a) * r1, -0.4 * t1, Math.sin(a) * r1); } }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const net = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })); net.position.set(rimX, COURT.rimHeight, 0); g.add(net); this.nets.push(net);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), carbon); arm.position.set(bx + s * 0.35, boardY - 0.3, 0); arm.scale.set(2.2, 1, 1); g.add(arm);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, boardY + 0.4, 12), carbon); post.position.set(s * (HALF_L + 1.9), (boardY + 0.4) / 2 - 0.3, 0); g.add(post);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(s * (HALF_L + 1.9) - (bx + s * 0.3)), 0.14, 0.14), carbon); brace.position.set((s * (HALF_L + 1.9) + bx + s * 0.3) / 2, boardY - 0.3, 0); g.add(brace);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, COURT.paintWidth * 0.6), new THREE.MeshStandardMaterial({ color: 0x0c1020, emissive: this.accent, emissiveIntensity: 0.12, roughness: 0.6 })); pad.position.set(s * (HALF_L + 0.25) + s * 1.35, 1.1, 0); void pad;
      this.group.add(g); this.hoops.push(g);
    }
  }
  buildStands(density) {
    const rng = mulberry32(77);
    const tiers = 10, tierW = 1.15, tierH = 0.82;
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x0d1122, roughness: 0.7, metalness: 0.3 });
    const seatPos = []; const stepGeo = new THREE.BoxGeometry(1, 1, 1);
    const addTier = (cx, cz, lenX, lenZ, h, axis, sgn, k) => {
      const m = new THREE.Mesh(stepGeo, stepMat); m.scale.set(lenX, h, lenZ); m.position.set(cx, h / 2, cz); this.group.add(m); this.standMeshes.push(m);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(axis === 'z' ? lenX : 0.06, 0.05, axis === 'z' ? 0.06 : lenZ), new THREE.MeshBasicMaterial({ color: k % 2 ? this.accent : this.accent2 })); edge.position.set(axis === 'z' ? cx : cx - sgn * tierW / 2 + 0.0, h + 0.03, axis === 'z' ? cz - sgn * tierW / 2 : cz); this.group.add(edge);
      const step = 0.56 * (1 / Math.max(0.35, density));
      if (axis === 'z') for (let x = -lenX / 2 + 0.4; x < lenX / 2 - 0.3; x += step) seatPos.push([cx + x + (rng() - 0.5) * 0.12, h, cz + sgn * 0.05, sgn > 0 ? 0 : Math.PI]);
      else for (let z = -lenZ / 2 + 0.4; z < lenZ / 2 - 0.3; z += step) seatPos.push([cx + sgn * 0.05, h, cz + z + (rng() - 0.5) * 0.12, sgn > 0 ? Math.PI / 2 : -Math.PI / 2]);
    };
    for (let k = 0; k < tiers; k++) {
      const h = 0.7 + (k + 1) * tierH;
      for (const sgn of [-1, 1]) {
        const z = sgn * (HALF_W + 3.9 + k * tierW + tierW / 2); addTier(0, z, COURT.length + 6 + k * 2.3, tierW, h, 'z', sgn, k);
        const x = sgn * (HALF_L + 3.9 + k * tierW + tierW / 2); addTier(x, 0, tierW, COURT.width + 6 + k * 2.3 - 4, h, 'x', sgn, k);
      }
    }
    // instanced crowd: body (capsule) + head, animated in the vertex shader
    const count = seatPos.length; this.crowdCount = count;
    const body = new THREE.CapsuleGeometry(0.2, 0.42, 3, 6); body.translate(0, 0.46, 0);
    const head = new THREE.SphereGeometry(0.14, 6, 5); head.translate(0, 0.98, 0);
    const merged = mergeGeos([body, head]);
    const phase = new Float32Array(count), color = new Float32Array(count * 3), speed = new Float32Array(count);
    const pal = [new THREE.Color(0x182038), new THREE.Color(0x24304f), new THREE.Color(0x14182b), this.accent.clone().multiplyScalar(0.35), this.accent2.clone().multiplyScalar(0.35), new THREE.Color(0x30263f)];
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, excite: { value: 0 } },
      vertexShader: `attribute float phase; attribute vec3 icolor; attribute float speed; uniform float time; uniform float excite; varying vec3 vC; varying float vH;
        void main(){ vec3 p = position; float b = sin(time * speed + phase); float amp = 0.015 + 0.09 * excite * (0.5 + 0.5 * sin(phase * 3.0)); p.y += max(0.0, b) * amp * 3.0 * step(0.1, position.y); p.y += max(0.0, b) * amp * 1.2;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0); vC = icolor * (0.35 + 0.65 * smoothstep(0.0, 1.1, position.y)); vH = position.y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: 'varying vec3 vC; varying float vH; void main(){ gl_FragColor = vec4(vC, 1.0); }',
    });
    const mesh = new THREE.InstancedMesh(merged, mat, count); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    seatPos.forEach(([x, y, z, ry], i) => { e.set(0, ry, 0); q.setFromEuler(e); const s = 0.85 + rng() * 0.25; sc.set(s, s, s); v.set(x, y, z); m4.compose(v, q, sc); mesh.setMatrixAt(i, m4); const c = pal[(rng() * pal.length) | 0]; color.set([c.r * (0.7 + rng() * 0.6), c.g * (0.7 + rng() * 0.6), c.b * (0.7 + rng() * 0.6)], i * 3); phase[i] = rng() * 6.28; speed[i] = 2 + rng() * 3; });
    merged.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1)); merged.setAttribute('icolor', new THREE.InstancedBufferAttribute(color, 3)); merged.setAttribute('speed', new THREE.InstancedBufferAttribute(speed, 1));
    mesh.frustumCulled = false; this.group.add(mesh); this.crowd = mesh;
    // phone lights
    const lights = Math.min(300, Math.floor(count * 0.1)); const lg = new THREE.PlaneGeometry(0.08, 0.1); const lm = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.9 });
    const li = new THREE.InstancedMesh(lg, lm, lights); for (let i = 0; i < lights; i++) { const [x, y, z, ry] = seatPos[(rng() * count) | 0]; e.set(0, ry, 0); q.setFromEuler(e); v.set(x + Math.sin(ry) * 0.2, y + 0.75 + rng() * 0.15, z + Math.cos(ry) * 0.2); sc.set(1, 1, 1); m4.compose(v, q, sc); li.setMatrixAt(i, m4); }
    this.group.add(li); this.phones = li;
    // back wall glow
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(62, 62, 26, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x070a16, side: THREE.BackSide })); wall.position.y = 10; this.group.add(wall);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(60, 0.18, 6, 96), new THREE.MeshBasicMaterial({ color: this.accent })); ring.rotation.x = Math.PI / 2; ring.position.y = 14.5; this.group.add(ring); this.wallRing = ring;
  }
  buildBeams() {
    const geo = new THREE.ConeGeometry(1.5, 26, 20, 1, true); geo.translate(0, -13, 0);
    for (let i = 0; i < 8; i++) {
      const col = i % 2 ? this.accent2 : this.accent;
      const mat = new THREE.ShaderMaterial({ uniforms: { color: { value: col }, intensity: { value: 1 } }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const b = new THREE.Mesh(geo, mat); const a = (i / 8) * Math.PI * 2; b.position.set(Math.cos(a) * 16, 24, Math.sin(a) * 10); b.userData = { a, r: 8 + (i % 3) * 3, speed: 0.15 + (i % 4) * 0.07 }; this.group.add(b); this.beams.push(b);
    }
  }
  buildRoof() {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.12, 8, 64), new THREE.MeshBasicMaterial({ color: this.accent2 })); ring.rotation.x = Math.PI / 2; ring.position.y = 17.5; this.group.add(ring); this.roofRing = ring;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(13.5, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: this.accent })); ring2.rotation.x = Math.PI / 2; ring2.position.y = 17.2; this.group.add(ring2);
  }
  buildScoreboard() {
    this.sbCanvas = document.createElement('canvas'); this.sbCanvas.width = 1024; this.sbCanvas.height = 384;
    this.sbTex = new THREE.CanvasTexture(this.sbCanvas); this.sbTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.sbTex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.4), mat); const a = i * Math.PI / 2; p.position.set(Math.sin(a) * 1.6, 0, Math.cos(a) * 1.6); p.rotation.y = a; g.add(p); }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.08, 4, 1), new THREE.MeshBasicMaterial({ color: this.accent })); rim.rotation.y = Math.PI / 4; rim.position.y = 1.35; g.add(rim);
    g.position.set(0, 10.2, 0); this.group.add(g); this.scoreboard = g;
    for (const dz of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 8, 4), new THREE.MeshBasicMaterial({ color: 0x334 })); c.position.set(dz * 1.4, 14.2, 0); this.group.add(c); }
  }
  drawScoreboard(info) {
    const c = this.sbCanvas, g = c.getContext('2d'), W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(5,8,20,0.78)'; chamfer(g, 6, 6, W - 12, H - 12, 34); g.fill(); g.strokeStyle = this.arena.accent; g.lineWidth = 4; g.shadowColor = this.arena.accent; g.shadowBlur = 18; chamfer(g, 6, 6, W - 12, H - 12, 34); g.stroke(); g.shadowBlur = 0;
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 120px Orbitron, Rajdhani, sans-serif';
    g.fillText(String(info.score[0]), 220, 210); g.fillText(String(info.score[1]), W - 220, 210);
    g.font = '700 38px Orbitron, sans-serif'; g.fillStyle = info.colors[0]; g.fillText(info.abbr[0], 220, 90); g.fillStyle = info.colors[1]; g.fillText(info.abbr[1], W - 220, 90);
    g.fillStyle = '#fff'; g.font = '800 96px Orbitron, sans-serif'; g.fillText(info.clock, W / 2, 190); g.font = '600 34px Orbitron, sans-serif'; g.fillStyle = this.arena.accent2; g.fillText(info.period, W / 2, 90);
    g.fillStyle = '#FFB000'; g.font = '700 54px Orbitron, sans-serif'; g.fillText(info.shotClock, W / 2, 290); g.font = '500 24px Inter, sans-serif'; g.fillStyle = '#9fb0d0'; g.fillText(info.foulsLine, W / 2, 345);
    this.sbTex.needsUpdate = true;
  }
  flashRim(side, kind) {
    const i = side > 0 ? 1 : 0; this.rimFlash[i] = 1; this.rimColor[i].set(kind === 'green' ? COLORS.lime : kind === 3 ? COLORS.magenta : COLORS.cyan);
    this.netKick = this.netKick ?? [0, 0]; this.netKick[i] = 1;
  }
  update(dt, ball) {
    this.time += dt;
    this.crowd.material.uniforms.time.value = this.time; this.crowdExcite = Math.max(0, this.crowdExcite - dt * 0.18); this.crowd.material.uniforms.excite.value = this.crowdExcite;
    this.phones.visible = this.crowdExcite > 0.05 || (this.time % 4) < 3;
    this.beams.forEach((b, i) => { const u = b.userData; const a = u.a + this.time * u.speed; b.position.x = Math.cos(a) * 16; b.position.z = Math.sin(a * 1.3) * 9; b.rotation.z = Math.sin(a) * 0.35; b.rotation.x = Math.cos(a * 1.3) * 0.3; b.material.uniforms.intensity.value = 0.7 + 0.5 * Math.sin(this.time * 1.7 + i) + this.crowdExcite; });
    this.scoreboard.rotation.y += dt * 0.25; this.roofRing.rotation.z += dt * 0.2;
    this.rimLights.forEach((h, i) => { this.rimFlash[i] = Math.max(0, this.rimFlash[i] - dt * 1.4); const f = this.rimFlash[i]; h.material.color.copy(f > 0.02 ? this.rimColor[i] : this.accent); h.material.opacity = 0.45 + 0.55 * f; h.scale.setScalar(1 + f * 0.25); });
    this.nets.forEach((n, i) => { const k = this.netKick?.[i] ?? 0; if (k > 0) { this.netKick[i] = Math.max(0, k - dt * 2.2); n.scale.set(1 - 0.12 * Math.sin(k * 6) * k, 1 + 0.35 * Math.sin(k * 5) * k, 1 - 0.12 * Math.sin(k * 6) * k); } else n.scale.set(1, 1, 1); });
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2); this.led.forEach((l) => l.material.color.copy(this.accent).lerp(this.accent2, pulse * 0.6));
    void ball;
  }
  dispose() { this.scene.remove(this.group); }
}
function chamfer(g, x, y, w, h, c) { g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); }
function mergeGeos(list) {
  let vc = 0, ic = 0; list.forEach((g) => { vc += g.attributes.position.count; ic += g.index.count; });
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic); let vo = 0, io = 0;
  for (const g of list) { pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; vo += g.attributes.position.count; io += g.index.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
