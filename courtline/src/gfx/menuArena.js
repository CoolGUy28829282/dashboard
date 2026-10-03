// Live main-menu background: an empty regulation arena where a league player shoots around.
// The shot is solved with the real ball model (drag + Magnus), so it goes in because the physics says so.
// Simulation runs at the fixed 120 Hz step; render() interpolates between the last two states. No per-frame allocation.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, HOOP_X, drawCourtTexture } from '../game/court.js';
import { stepAir, solveShotSpeed, BALL } from '../game/ballphys.js';
import { Humanoid } from './humanoid.js';
import { drawLogo } from '../league/logo.js';
import { SKIN } from '../league/names.js';
import { smoothDamp, dampAngle, clamp, lerp, DEG, nextFrame, shade } from '../core/util.js';

const PRESET = { broadcast: { r: 15, fov: 36 }, high: { r: 12, fov: 40 }, low: { r: 9, fov: 55 }, follow: { r: 5.5, fov: 50 }, custom: { r: 15, fov: 38 } };
const G = BALL.g, R = BALL.r;
const _ax = new THREE.Vector3();

export class MenuArena {
  constructor(settings, audio) {
    this.settings = settings; this.audio = audio;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.Fog(0x05070d, 32, 95);
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 160);
    this.az = 0.6; this.time = 0; this.camInit = false;
    this.cp = { x: 0, y: 8, z: 14, tx: 0, ty: 1, tz: 0 };
    this.cs = { x: { v: 0 }, y: { v: 0 }, z: { v: 0 }, tx: { v: 0 }, ty: { v: 0 }, tz: { v: 0 } };
    this.sh = {
      x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, yaw: 0, pyaw: 0, jump: 0, pjump: 0, jumpV: 0, crouch: 0, pcrouch: 0, phase: 0,
      state: 0, t: 0, tx: 0, tz: 0, air: false, released: false, rw: 1, lw: 0, ax: 0, ay: 0, az: 0, relY: 0, relX: 0, relZ: 0, speed: 0, stall: 0,
    };
    this.b = { x: 0, y: 1, z: 0, px: 0, py: 1, pz: 0, vx: 0, vy: 0, vz: 0, mode: 0, bounceAt: 0 }; // mode 0 dribble, 1 carry, 2 free
    this.S = new Float64Array(9);
    this.netK = 0; this.featured = null; this.tmp = { x: 0, y: 0, z: 0 };
    this.shift = 0; this.shiftTarget = 0; this.shiftApplied = 0; this.aspect = 16 / 9;
    this.seatCount = 0; this.maxCrowd = 0; this.rwS = 0; this.lwS = 0;
  }

  async build(gfx, league, progress) {
    const step = async (p, fn) => { fn(); progress && progress(p); await nextFrame(); };
    this.renderer = gfx.renderer;
    await step(0.05, () => this._env(gfx.renderer));
    await step(0.2, () => this._lights());
    await step(0.35, () => this._court());
    await step(0.5, () => this._hoops());
    await step(0.65, () => this._stands());
    await step(0.8, () => this._rig());
    await step(0.92, () => { this._ball(); this.setFeatured(league); });
    this.applyGraphics();
    progress && progress(1);
  }
  rebuildEnv(renderer) { this.renderer = renderer; this._env(renderer); }

  _env(renderer) {
    if (this.pmrem) this.pmrem.dispose();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.45;
  }
  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x40301f, 0.65));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 2.3));
    sun.position.set(7, 22, 9);
    sun.shadow.camera.left = -19; sun.shadow.camera.right = 19; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12; sun.shadow.camera.near = 5; sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
  }
  _court() {
    const cv = (this.courtCv = document.createElement('canvas')); cv.width = 2048;
    drawCourtTexture(cv, { floor: 0xd9b27a, paint: 0x1d3a6b, accent: 0xffffff, team: null });
    const tex = (this.courtTex = new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
    this.floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0, envMapIntensity: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.L + 2 * C.margin, C.W + 2 * C.margin).rotateX(-Math.PI / 2), this.floorMat);
    floor.receiveShadow = true; this.scene.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(160, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: 0.9 }));
    out.position.y = -0.02; out.receiveShadow = true; this.scene.add(out);
  }
  _hoops() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x22272f, roughness: 0.5, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28 });
    const frame = new THREE.LineBasicMaterial({ color: 0xffffff });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.35, metalness: 0.4 });
    this.padMat = new THREE.MeshStandardMaterial({ color: 0x1d3a6b, roughness: 0.8 });
    const build = () => {
      const g = new THREE.Group();
      const bx = C.halfL - C.boardFromBaseline - C.boardT / 2, by = C.boardBottom + C.boardH / 2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(C.boardT, C.boardH, C.boardW), glass); board.position.set(bx, by, 0); g.add(board);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(C.boardT, C.boardH, C.boardW)), frame); edges.position.copy(board.position); g.add(edges);
      const sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.01, 0.457, 0.61)), frame); sq.position.set(bx - C.boardT / 2 - 0.002, C.rimH + 0.228, 0); g.add(sq);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(C.rimRadius + C.rimTube, C.rimTube, 8, 40).rotateX(Math.PI / 2), rimMat); rim.position.set(HOOP_X, C.rimH, 0); g.add(rim);
      const brk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), rimMat); brk.position.set(HOOP_X + C.rimRadius + 0.1, C.rimH, 0); g.add(brk);
      const net = new THREE.Group(); net.position.set(HOOP_X, C.rimH, 0); g.add(net);
      const nm = new THREE.Mesh(new THREE.CylinderGeometry(C.rimRadius, 0.13, 0.42, 16, 5, true).translate(0, -0.21, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 }));
      net.add(nm);
      const px = C.halfL + 1.35;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.7, 12), steel); pole.position.set(px, 1.85, 0); g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(px - bx - 0.1, 0.16, 0.2), steel); arm.position.set((px + bx) / 2, 3.35, 0); g.add(arm);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 1.0), this.padMat); pad.position.set(px, 1.3, 0); g.add(pad);
      g.traverse((m) => { if (m.isMesh && !m.material.wireframe && !m.material.transparent) m.castShadow = true; });
      return { g, net };
    };
    const a = build(), b = build();
    b.g.rotation.y = Math.PI;
    this.scene.add(a.g, b.g);
    this.net = a.net; this.nets = [a.net, b.net];
  }
  _stands() {
    const rows = 22, ext = C.halfL + 2.2;
    const seatPos = [], slabs = [];
    const dark = new THREE.MeshStandardMaterial({ color: 0x161c2a, roughness: 0.9 });
    for (let a = 0; a < 2; a++) for (const sg of [-1, 1]) for (let r = 0; r < rows; r++) {
      const o = 2.4 + r * 0.9, y = 0.35 + r * 0.5;
      if (a === 0) {
        const z = sg * (C.halfW + o);
        slabs.push(new THREE.BoxGeometry(2 * ext, 0.5, 0.9).translate(0, y - 0.25, z));
        for (let x = -ext + 0.3; x <= ext - 0.3; x += 0.56) seatPos.push(x, y, z, r);
      } else {
        const x = sg * (C.halfL + o), zh = C.halfW + 1.9;
        slabs.push(new THREE.BoxGeometry(0.9, 0.5, 2 * zh).translate(x, y - 0.25, 0));
        for (let z = -zh + 0.3; z <= zh - 0.3; z += 0.56) seatPos.push(x, y, z, r);
      }
    }
    const slab = new THREE.Mesh(mergeGeometries(slabs), dark); this.scene.add(slab);
    const wallH = 16, wo = 2.4 + rows * 0.9 + 0.6;
    for (const [w, d, x, z] of [[2 * (ext + 6), 0.6, 0, C.halfW + wo], [2 * (ext + 6), 0.6, 0, -C.halfW - wo], [0.6, 2 * (C.halfW + 6), C.halfL + wo, 0], [0.6, 2 * (C.halfW + 6), -C.halfL - wo, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), dark); m.position.set(x, wallH / 2 + 5, z); this.scene.add(m);
    }
    const n = (this.seatCount = seatPos.length / 4);
    this.seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.42, 0.44).translate(0, 0.21, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
    this.seatPos = seatPos;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(seatPos[i * 4], seatPos[i * 4 + 1], seatPos[i * 4 + 2]); this.seats.setMatrixAt(i, m4); }
    this.seats.instanceMatrix.needsUpdate = true;
    this.scene.add(this.seats);
    // spectators: two instanced meshes (torso, head) sharing positions; count follows the crowd setting
    this.maxCrowd = Math.floor(n * 0.14);
    this.torsos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.42, 0.2).translate(0, 0.62, -0.05), new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.maxCrowd);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6).translate(0, 0.98, -0.05), new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.maxCrowd);
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
    for (let i = 0; i < this.maxCrowd; i++) {
      const s = order[i];
      m4.makeTranslation(seatPos[s * 4], seatPos[s * 4 + 1] + 0.05, seatPos[s * 4 + 2]);
      this.torsos.setMatrixAt(i, m4); this.heads.setMatrixAt(i, m4);
      this.heads.setColorAt(i, new THREE.Color(SKIN[(Math.random() * SKIN.length) | 0]));
    }
    this.torsos.instanceMatrix.needsUpdate = true; this.heads.instanceMatrix.needsUpdate = true;
    this.scene.add(this.torsos, this.heads);
    this.banners = new THREE.Group(); this.scene.add(this.banners);
  }
  _rig() {
    // roof, light panels, hung scoreboard, sideline ad boards
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(120, 90).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x07090f }));
    roof.position.y = 24; this.scene.add(roof);
    const panelGeo = new THREE.BoxGeometry(3.2, 0.2, 1.1), lamp = new THREE.MeshBasicMaterial({ color: 0xfff4e0 }), geos = [];
    for (let i = -3; i <= 3; i++) for (const z of [-4.5, 4.5]) geos.push(panelGeo.clone().translate(i * 4.4, 18, z));
    this.scene.add(new THREE.Mesh(mergeGeometries(geos), lamp));
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d'); g.fillStyle = '#05080f'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ff7a1a'; g.font = '900 72px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('COURTLINE', 256, 130);
    g.fillStyle = '#9aa7c2'; g.font = '600 26px system-ui,sans-serif'; g.fillText('PRO BASKETBALL', 256, 180);
    const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x10131c, roughness: 0.6 })); body.position.y = 13; this.scene.add(body);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.4), new THREE.MeshBasicMaterial({ map: st })); s.position.set(Math.sin(i * Math.PI / 2) * 3.01, 13, Math.cos(i * Math.PI / 2) * 3.01); s.rotation.y = i * Math.PI / 2; this.scene.add(s);
    }
    const ac = document.createElement('canvas'); ac.width = 1024; ac.height = 64;
    const a = ac.getContext('2d'); a.fillStyle = '#0c1020'; a.fillRect(0, 0, 1024, 64); a.fillStyle = '#ff7a1a'; a.font = '900 38px system-ui,sans-serif'; a.textBaseline = 'middle';
    for (let x = 20; x < 1024; x += 340) { a.fillText('COURTLINE', x, 34); a.fillStyle = '#e8eefc'; a.fillText('★', x + 250, 34); a.fillStyle = '#ff7a1a'; }
    const at = new THREE.CanvasTexture(ac); at.colorSpace = THREE.SRGBColorSpace; at.wrapS = THREE.RepeatWrapping; at.repeat.set(2, 1);
    const adMat = new THREE.MeshBasicMaterial({ map: at });
    for (const z of [-C.halfW - 1.5, C.halfW + 1.5]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2 * C.halfL - 6, 0.8, 0.12), adMat); m.position.set(0, 0.4, z); this.scene.add(m); }
    this.adTex = at;
  }
  _ball() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#d9691c'); gr.addColorStop(0.5, '#e8761f'); gr.addColorStop(1, '#c75d16');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    g.globalAlpha = 0.12; g.fillStyle = '#000'; for (let i = 0; i < 2600; i++) g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); g.globalAlpha = 1;
    g.strokeStyle = '#1a0d05'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
    for (const u of [0, 256, 512]) { g.beginPath(); g.moveTo(u, 0); g.lineTo(u, 256); g.stroke(); }
    for (const u of [128, 384]) { g.beginPath(); for (let v = 0; v <= 256; v += 8) { const x = u + Math.sin((v / 256) * Math.PI) * 48 * (u === 128 ? 1 : -1); g[v ? 'lineTo' : 'moveTo'](x, v); } g.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }));
    this.ballMesh.castShadow = true; this.scene.add(this.ballMesh); this.ballTex = tex;
  }

  /** Pick one of the league's best players and dress the arena in that team's colours. */
  setFeatured(league) {
    if (!league) return;
    const top = league.players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 40);
    const p = top[(Math.random() * top.length) | 0], team = league.teams[p.teamId], uni = team.uniforms[Math.random() < 0.5 ? 'home' : 'away'];
    this.featured = { player: p, team };
    if (this.human) { this.scene.remove(this.human.root); this.human.numTex.dispose(); }
    this.human = new Humanoid({
      height: p.heightIn * 0.0254, wingspan: p.wingIn * 0.0254, weight: p.weightLb * 0.4536, skin: p.appearance.skin, hair: p.appearance.hair, hairStyle: p.appearance.hairStyle,
      accessory: p.appearance.accessory, jersey: uni.base, trim: uni.number, shorts: shade(uni.base, 0.94), number: p.num,
    });
    this.scene.add(this.human.root);
    drawCourtTexture(this.courtCv, { floor: team.arena.floor, paint: team.arena.paint, accent: team.colors.accent, team });
    this.courtTex.needsUpdate = true;
    this.padMat.color.setHex(team.colors.primary);
    // seats
    const c1 = new THREE.Color(team.arena.seat), c2 = new THREE.Color(shade(team.arena.seat, 1.7)), n = this.seatCount;
    for (let i = 0; i < n; i++) this.seats.setColorAt(i, Math.floor(this.seatPos[i * 4 + 3] / 5) % 2 ? c2 : c1);
    this.seats.instanceColor.needsUpdate = true;
    const shirts = [team.colors.primary, team.colors.secondary, 0xe8e8e8, 0x555a66, 0x1d2230], col = new THREE.Color();
    for (let i = 0; i < this.maxCrowd; i++) this.torsos.setColorAt(i, col.setHex(shirts[(Math.random() * shirts.length) | 0]));
    this.torsos.instanceColor.needsUpdate = true;
    // banners from random league teams
    while (this.banners.children.length) { const m = this.banners.children.pop(); m.material.map.dispose(); m.material.dispose(); }
    const teams = league.teams;
    for (let i = 0; i < 6; i++) {
      const t = i === 0 ? team : teams[(Math.random() * teams.length) | 0];
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384; const g = cv.getContext('2d');
      g.fillStyle = '#' + t.colors.primary.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 384);
      g.fillStyle = '#' + t.colors.secondary.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 18); g.fillRect(0, 366, 256, 18);
      drawLogo(g, 128, 150, 100, t); g.fillStyle = '#fff'; g.font = '800 30px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(t.city.toUpperCase().slice(0, 14), 128, 300);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.5), new THREE.MeshBasicMaterial({ map: tex }));
      const side = i % 2 ? 1 : -1, x = -13 + Math.floor(i / 2) * 13;
      m.position.set(x, 12.5, side * (C.halfW + 2.4 + 22 * 0.9 + 0.25)); m.rotation.y = side > 0 ? Math.PI : 0;
      this.banners.add(m);
      if (this.renderer) this.renderer.initTexture(tex);
    }
    if (this.renderer) { this.renderer.initTexture(this.courtTex); this.renderer.initTexture(this.ballTex); }
    this._reset();
    this.human.root.traverse((m) => { if (m.isMesh) m.frustumCulled = true; });
  }
  _reset() {
    const s = this.sh, b = this.b;
    s.x = s.px = 0; s.z = s.pz = 0; s.vx = s.vz = 0; s.state = 0; s.t = 0; s.jump = s.pjump = 0; s.air = false; s.released = false; s.crouch = 0; s.rw = 1; s.lw = 0;
    this._pickSpot();
    b.mode = 0; b.vy = 0; b.y = 1; this._handPos(s.x, s.z, s.yaw); b.x = this.tmp.x; b.z = this.tmp.z; b.px = b.x; b.py = b.y; b.pz = b.z;
  }
  _pickSpot() {
    const s = this.sh, ang = (Math.random() * 2 - 1) * 1.15, d = 3.6 + Math.random() * 3.8;
    s.tx = HOOP_X - Math.cos(ang) * d; s.tz = clamp(Math.sin(ang) * d, -C.halfW + 1.2, C.halfW - 1.2);
  }

  applyGraphics() {
    if (!this.sun || !this.torsos || !this.floorMat) return; // not built yet
    const st = this.settings, sh = st.get('shadows'), refl = st.get('reflections');
    const on = sh !== 'off', size = sh === 'sharp' ? 2048 : 1024;
    if (this.sun.castShadow !== on || this.sun.shadow.mapSize.x !== size) {
      this.sun.castShadow = on;
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.sun.shadow.mapSize.set(size, size);
      this.scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    }
    this.floorMat.roughness = refl ? 0.3 : 0.62;
    this.floorMat.envMapIntensity = refl ? 1.4 : 0.15;
    const n = Math.round((this.maxCrowd * st.get('crowd')) / 100);
    this.torsos.count = n; this.heads.count = n;
  }
  resize(aspect) { this.aspect = aspect; this.camera.aspect = aspect; this.shiftApplied = 9; this.camera.updateProjectionMatrix(); }
  async warm(renderer) {
    if (renderer.compileAsync) await renderer.compileAsync(this.scene, this.camera); else renderer.compile(this.scene, this.camera);
    for (let i = 0; i < 3; i++) { renderer.render(this.scene, this.camera); await nextFrame(); }
  }

  // ---------------- simulation (fixed step) ----------------
  step(dt) {
    this.time += dt;
    if (!this.human) return;
    if (this.gym) { this.gym.step(dt); return; }
    this._stepShooter(dt);
    this._stepBall(dt);
    this.netK *= Math.exp(-3.2 * dt);
  }
  _handPos(x, z, yaw) { // right-hand dribble position in world space
    const lx = -(this.human.sw + 0.1), lz = 0.3, c = Math.cos(yaw), s = Math.sin(yaw);
    this.tmp.x = x + lx * c + lz * s; this.tmp.z = z - lx * s + lz * c;
  }
  _local(lx, ly, lz, yaw, jump) { // player-local point to world, written to this.tmp
    const c = Math.cos(yaw), s = Math.sin(yaw), q = this.sh;
    this.tmp.x = q.x + lx * c + lz * s; this.tmp.y = ly + jump; this.tmp.z = q.z - lx * s + lz * c;
  }
  _move(tx, tz, vmax, dt) {
    const s = this.sh, dx = tx - s.x, dz = tz - s.z, d = Math.sqrt(dx * dx + dz * dz);
    const sp = d < 0.02 ? 0 : Math.min(vmax, Math.sqrt(2 * 7 * d));
    const dvx = d > 1e-4 ? (dx / d) * sp : 0, dvz = d > 1e-4 ? (dz / d) * sp : 0;
    let ex = dvx - s.vx, ez = dvz - s.vz;
    const el = Math.sqrt(ex * ex + ez * ez), mx = 8 * dt;
    if (el > mx) { ex *= mx / el; ez *= mx / el; }
    s.vx += ex; s.vz += ez; s.x += s.vx * dt; s.z += s.vz * dt;
    return d;
  }
  _locomotion(dt) {
    const s = this.sh, sp = Math.sqrt(s.vx * s.vx + s.vz * s.vz);
    s.speed = sp;
    if (sp > 0.5) s.yaw = dampAngle(s.yaw, Math.atan2(s.vx, s.vz), 9, dt);
    const stride = lerp(0.9, 2.3, clamp(sp / 6, 0, 1));
    s.phase += (sp * dt) / stride; if (s.phase > 1) s.phase -= 1;
    s.stride = stride;
  }
  _stepShooter(dt) {
    const s = this.sh, b = this.b, H = this.human.H;
    s.px = s.x; s.pz = s.z; s.pyaw = s.yaw; s.pjump = s.jump; s.pcrouch = s.crouch;
    const toHoop = Math.atan2(HOOP_X - s.x, -s.z);
    switch (s.state) {
      case 0: { // dribble to a spot
        const d = this._move(s.tx, s.tz, 4.1, dt);
        this._locomotion(dt); s.rw = 1; s.lw = 0; b.mode = 0; s.crouch = Math.max(0, s.crouch - dt * H * 0.5);
        if (d < 0.3) { s.state = 1; s.t = 0; s.ax = b.x; s.ay = b.y; s.az = b.z; b.mode = 1; }
        break;
      }
      case 1: { // gather: stop, square up, bring the ball to the shot pocket
        s.t += dt; const u = Math.min(1, s.t / 0.34), e = u * u * (3 - 2 * u), k = Math.exp(-9 * dt);
        s.vx *= k; s.vz *= k; s.x += s.vx * dt; s.z += s.vz * dt;
        s.speed = Math.sqrt(s.vx * s.vx + s.vz * s.vz); s.phase += (s.speed * dt) / 1.3;
        s.yaw = dampAngle(s.yaw, toHoop, 14, dt);
        s.crouch = 0.07 * H * e; s.lw = e * 0.9; s.rw = 1;
        this._local(-0.04, this.human.reachShoulder - 0.12 * H, 0.32, s.yaw, 0);
        b.x = lerp(s.ax, this.tmp.x, e); b.y = lerp(s.ay, this.tmp.y, e); b.z = lerp(s.az, this.tmp.z, e);
        if (u >= 1) { s.state = 2; s.t = 0; s.air = false; s.released = false; }
        break;
      }
      case 2: { // load, jump, release at the apex
        s.t += dt; s.speed = 0; s.yaw = dampAngle(s.yaw, toHoop, 14, dt);
        if (!s.air) {
          s.crouch = (0.07 + 0.1 * Math.min(1, s.t / 0.14)) * H;
          if (s.t >= 0.14) { s.air = true; s.jumpV = Math.sqrt(2 * G * (0.34 + 0.06 * Math.random())); s.jump = 0.001; }
          this._local(-0.04, this.human.reachShoulder - 0.15 * H, 0.32, s.yaw, 0);
          b.x = this.tmp.x; b.y = this.tmp.y; b.z = this.tmp.z;
        } else {
          s.jumpV -= G * dt; s.jump += s.jumpV * dt; s.crouch = Math.max(0, s.crouch - dt * H * 1.2);
          const u = Math.min(1, (s.t - 0.14) / 0.22), e = 1 - (1 - u) * (1 - u);
          this._local(-0.04, this.human.reachShoulder - 0.12 * H, 0.32, s.yaw, s.jump);
          const px = this.tmp.x, py = this.tmp.y, pz = this.tmp.z;
          this._local(0.0, this.human.reachShoulder + this.human.armLen * 0.85, 0.16, s.yaw, s.jump);
          if (!s.released) { b.x = lerp(px, this.tmp.x, e); b.y = lerp(py, this.tmp.y, e); b.z = lerp(pz, this.tmp.z, e); }
          if (!s.released && s.jumpV <= 0.35) this._release();
          if (s.jump <= 0 && s.jumpV < 0) { s.jump = 0; s.air = false; s.state = 3; s.t = 0; s.crouch = 0.1 * H; this.audio.sfx('squeak', 0.5, 1 + Math.random() * 0.2); }
        }
        break;
      }
      case 3: { // follow-through and land
        s.t += dt; const k = Math.exp(-7 * dt); s.crouch *= k; s.speed = 0;
        s.rw = Math.max(0, 1 - s.t / 0.7); s.lw = Math.max(0, 0.9 - s.t / 0.5);
        s.yaw = dampAngle(s.yaw, toHoop, 6, dt);
        if (s.t > 0.95) { s.state = 4; s.t = 0; }
        break;
      }
      default: { // fetch the rebound
        s.t += dt; s.rw = 0; s.lw = 0; s.crouch = Math.max(0, s.crouch - dt * H);
        this._move(b.x, b.z, 4.9, dt); this._locomotion(dt);
        const dx = b.x - s.x, dz = b.z - s.z;
        if ((dx * dx + dz * dz < 0.36 && b.y < 0.5) || s.t > 9) {
          s.state = 0; s.t = 0; b.mode = 0; b.vy = 0; b.vx = b.vz = 0; this._pickSpot();
        }
      }
    }
  }
  _release() {
    const s = this.sh, b = this.b, S = this.S;
    s.released = true; b.mode = 2;
    const x0 = b.x, y0 = b.y, z0 = b.z, dx = HOOP_X - x0, dz = -z0, d = Math.sqrt(dx * dx + dz * dz);
    const ang = clamp(58 - d * 1.5, 45, 55) * DEG, spin = (2 + Math.random()) * 2 * Math.PI;
    const v = solveShotSpeed(x0, y0, z0, HOOP_X, C.rimH, 0, ang, spin), ux = dx / d, uz = dz / d, ca = Math.cos(ang);
    b.vx = v * ca * ux; b.vy = v * Math.sin(ang); b.vz = v * ca * uz;
    S[6] = -uz * spin; S[7] = 0; S[8] = ux * spin;
    s.relX = x0; s.relY = y0; s.relZ = z0;
    this.audio.sfx('whoosh', 0.15, 1.4);
  }
  _stepBall(dt) {
    const b = this.b, s = this.sh, S = this.S;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    if (b.mode === 0) { // dribble: the ball is simulated for real and the hand follows it
      const handTop = 0.52 * this.human.H, push = Math.sqrt(2 * G * (handTop - R) * (1 / (BALL.e * BALL.e) - 1));
      this._handPos(s.x, s.z, s.yaw); b.x = this.tmp.x; b.z = this.tmp.z;
      b.vy -= G * dt; b.y += b.vy * dt;
      if (b.y <= R) {
        b.y = R;
        if (b.vy < -0.5 && this.time - b.bounceAt > 0.12) { b.bounceAt = this.time; this.audio.sfx('bounce', 0.5, 0.92 + Math.random() * 0.1); }
        b.vy = -b.vy * BALL.e;
      } else if (b.vy > 0 && b.y >= handTop) { b.y = handTop; b.vy = -push; }
      return;
    }
    if (b.mode === 1) { b.vx = b.vy = b.vz = 0; return; }
    S[0] = b.x; S[1] = b.y; S[2] = b.z; S[3] = b.vx; S[4] = b.vy; S[5] = b.vz;
    stepAir(S, dt);
    b.x = S[0]; b.y = S[1]; b.z = S[2]; b.vx = S[3]; b.vy = S[4]; b.vz = S[5];
    const dxh = b.x - HOOP_X, dh = Math.sqrt(dxh * dxh + b.z * b.z);
    if (b.vy < 0 && b.py > C.rimH && b.y <= C.rimH && dh < C.rimRadius) { this.netK = 1; this.audio.sfx('swish', 0.9, 0.95 + Math.random() * 0.1); }
    if (dh < 0.2 && b.y < C.rimH && b.y > C.rimH - 0.5) { const k = 1 - 9 * dt; b.vx *= k; b.vz *= k; b.vy *= 1 - 3 * dt; }
    // backboard (swishes never touch it; this keeps stray balls honest)
    const bpx = C.halfL - C.boardFromBaseline - C.boardT;
    if (b.x > bpx - R && b.vx > 0 && b.y > C.boardBottom && b.y < C.boardBottom + C.boardH && Math.abs(b.z) < C.boardW / 2) { b.x = bpx - R; b.vx = -b.vx * 0.6; }
    const lim = C.halfL + 1.6, limz = C.halfW + 1.4;
    if (b.x > lim) { b.x = lim; b.vx = -b.vx * 0.4; } else if (b.x < -lim) { b.x = -lim; b.vx = -b.vx * 0.4; }
    if (b.z > limz) { b.z = limz; b.vz = -b.vz * 0.4; } else if (b.z < -limz) { b.z = -limz; b.vz = -b.vz * 0.4; }
    if (b.y <= R) {
      b.y = R;
      if (b.vy < -0.5) {
        if (b.vy < -1.5 && this.time - b.bounceAt > 0.08) { b.bounceAt = this.time; this.audio.sfx('bounce', Math.min(1, -b.vy / 7), 0.85 + Math.random() * 0.1); }
        b.vy = -b.vy * BALL.e; b.vx *= 0.9; b.vz *= 0.9;
      } else {
        b.vy = 0;
        const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
        if (sp > 0) { const f = Math.max(0, sp - 0.55 * dt) / sp; b.vx *= f; b.vz *= f; }
        S[6] = b.vz / R; S[7] = 0; S[8] = -b.vx / R; // rolling without slipping
      }
    }
  }

  // ---------------- rendering ----------------
  render(renderer, alpha, dt) {
    const hm = this.human, s = this.sh, b = this.b;
    if (!hm) return;
    if (this.gym) { this.gym.render(renderer, alpha, dt); return; }
    const px = lerp(s.px, s.x, alpha), pz = lerp(s.pz, s.z, alpha), yaw = lerp(s.pyaw, s.pyaw + (((s.yaw - s.pyaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI), alpha);
    const jump = lerp(s.pjump, s.jump, alpha), crouch = lerp(s.pcrouch, s.crouch, alpha);
    const bx = lerp(b.px, b.x, alpha), by = lerp(b.py, b.y, alpha), bz = lerp(b.pz, b.z, alpha);
    this.ballMesh.position.set(bx, by, bz);
    // spin the ball visually from its angular velocity
    const w = Math.sqrt(this.S[6] * this.S[6] + this.S[7] * this.S[7] + this.S[8] * this.S[8]);
    if (b.mode === 2 && w > 0.01) { _ax.set(this.S[6] / w, this.S[7] / w, this.S[8] / w); this.ballMesh.rotateOnWorldAxis(_ax, w * dt); }
    else if (b.mode === 0) { _ax.set(1, 0, 0); this.ballMesh.rotateOnWorldAxis(_ax, 1.5 * dt); }
    hm.root.position.set(px, 0, pz); hm.root.rotation.y = yaw;
    const c = Math.cos(yaw), sn = Math.sin(yaw), sp = s.speed;
    hm.speed = sp; hm.phase = s.phase; hm.stride = s.stride; hm.hipDrop = crouch; hm.jump = jump;
    if (sp > 0.05) { const vx = s.vx, vz = s.vz, m = Math.sqrt(vx * vx + vz * vz) || 1; hm.mvx = (vx * c - vz * sn) / m; hm.mvz = (vx * sn + vz * c) / m; }
    hm.leanX = clamp(sp * 0.035, 0, 0.2) + crouch * 0.5; hm.leanZ = 0;
    // hand targets in player-local space, derived from the interpolated ball
    const dx = bx - px, dz = bz - pz, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const r = hm.hand[0], l = hm.hand[1], above = b.mode === 0 ? 0.1 : -0.075;
    const ease = 1 - Math.exp(-14 * dt); // blend weights ease so the arms never snap onto or off the ball
    this.rwS += ((s.state === 4 ? 0 : s.rw) - this.rwS) * ease; this.lwS += (s.lw - this.lwS) * ease;
    r.x = lx; r.y = by + above; r.z = lz; r.w = this.rwS;
    l.x = lx + 0.12; l.y = by - 0.02; l.z = lz - 0.01; l.w = this.lwS;
    hm.pose();
    // net sway
    const k = this.netK, ph = this.time * 22;
    this.net.scale.set(1 + 0.1 * k * Math.sin(ph), 1 + 0.22 * k * (0.5 + 0.5 * Math.sin(ph * 0.8)), 1 + 0.1 * k * Math.cos(ph));
    this._camera(dt, px, pz, s.vx, s.vz);
    renderer.render(this.scene, this.camera);
  }
  _camera(dt, px, pz, vx, vz, hoopX = HOOP_X) {
    const st = this.settings, cp = this.cp, cs = this.cs, cam = this.camera;
    const pr = PRESET[st.get('camPreset')] || PRESET.broadcast;
    const rad = pr.r * st.get('camZoom'), hgt = st.get('camHeight');
    if (!this.gym) this.az += dt * 0.045;
    const az = this.az + st.get('camAngle') * DEG;
    const bl = this.gym ? 0.5 : 0.28, fx = lerp(px, hoopX, bl) + vx * 0.35, fz = lerp(pz, 0, bl) + vz * 0.35;
    const dx = clamp(fx + Math.sin(az) * rad, -C.halfL - 2, C.halfL + 2), dz = clamp(fz + Math.cos(az) * rad, -C.halfW - 1.7, C.halfW + 1.7), dy = clamp(hgt, 0.6, 20);
    if (!this.camInit) { this.camInit = true; cp.x = dx; cp.y = dy; cp.z = dz; cp.tx = fx; cp.ty = 1.2; cp.tz = fz; }
    cp.x = smoothDamp(cp.x, dx, cs.x, 0.5, dt); cp.y = smoothDamp(cp.y, dy, cs.y, 0.5, dt); cp.z = smoothDamp(cp.z, dz, cs.z, 0.5, dt);
    cp.tx = smoothDamp(cp.tx, fx, cs.tx, 0.3, dt); cp.ty = smoothDamp(cp.ty, 1.2, cs.ty, 0.3, dt); cp.tz = smoothDamp(cp.tz, fz, cs.tz, 0.3, dt);
    cam.position.set(cp.x, cp.y, cp.z); cam.lookAt(cp.tx, cp.ty, cp.tz);
    // slide the 3D picture sideways so the menu tiles do not cover the action
    this.shift += (this.shiftTarget - this.shift) * (1 - Math.exp(-5 * dt));
    if (Math.abs(this.shift - this.shiftApplied) > 0.0002) {
      this.shiftApplied = this.shift;
      if (Math.abs(this.shift) < 0.0005) { cam.clearViewOffset(); this.shiftApplied = 0; } else { const fw = 1000, fh = 1000 / this.aspect; cam.setViewOffset(fw, fh, -this.shift * fw, 0, fw, fh); }
    }
    const df = pr.fov - cam.fov;
    if (Math.abs(df) > 0.01) { cam.fov += df * (1 - Math.exp(-3 * dt)); cam.updateProjectionMatrix(); }
  }
}
