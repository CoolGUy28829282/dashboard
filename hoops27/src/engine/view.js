// GameView: binds a Game (pure simulation) to the Three.js scene. Interpolates render frames between 60 Hz logic ticks.
import * as THREE from 'three';
import { Arena } from './arena.js';
import { AthleteFactory } from './athlete.js';
import { CameraRig } from './camera.js';
import { Particles, ShotMeterView } from './fx.js';
import { ReplayBuffer, ReplayPlayer } from './replay.js';
import { BALL_R, RIM_X } from '../physics/world.js';
import { COLORS, COURT } from '../tuning.js';
import { PLAYS } from '../data/plays.js';
import { hoopX, toWorld, HALF_L } from '../gameplay/court.js';
import { bestTargetInDirection } from '../gameplay/actions.js';

const ballTexture = () => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 256); grd.addColorStop(0, '#ff8a1f'); grd.addColorStop(1, '#c44a00'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#1a0d05'; g.lineWidth = 7; g.shadowColor = '#00F0FF'; g.shadowBlur = 8;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); }
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  g.beginPath(); g.ellipse(64, 128, 70, 120, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.ellipse(448, 128, 70, 120, 0, Math.PI / 2, Math.PI * 1.5); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

export class GameView {
  constructor(rend, game, { arena, settings, bus }) {
    this.R = rend; this.g = game; this.bus = bus; this.settings = settings; this.time = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
    this.arena = new Arena(this.scene, arena, { reflection: rend.cfg.reflection, crowd: rend.cfg.crowd });
    this.rig = new CameraRig(this.camera); this.rig.colliders = this.arena.standMeshes; this.rig.reduced = !!settings.access?.reducedMotion;
    rend.setScene(this.scene, this.camera); rend.cfg.reducedMotion = !!settings.access?.reducedMotion;
    this.key = this.arena.key; this.key.castShadow = rend.cfg.shadows;
    this.fx = new Particles(this.scene); this.meter = new ShotMeterView(this.scene); this.meter.setPalette(settings.access?.palette ?? 'default');
    this.ath = new Map();
    for (const tm of game.teams) for (const p of tm.players) { const a = AthleteFactory.create(p, tm.data); this.scene.add(a.root); this.ath.set(p, a); a.root.visible = false; a.root.traverse((o) => { if (o.isMesh) o.castShadow = rend.cfg.shadows && o.castShadow; }); }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.55, metalness: 0.1, emissive: 0xff5500, emissiveIntensity: 0.12 })); this.ball.castShadow = true; this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false })); this.ballShadow.rotation.x = -Math.PI / 2; this.scene.add(this.ballShadow);
    this.trail = []; this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), new THREE.MeshBasicMaterial({ color: COLORS.cyan })); this.arrow.rotation.x = Math.PI; this.scene.add(this.arrow);
    this.passRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.84, 32), new THREE.MeshBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0.9, depthWrite: false })); this.passRing.rotation.x = -Math.PI / 2; this.passRing.visible = false; this.scene.add(this.passRing);
    this.lane = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: COLORS.lime, transparent: true, opacity: 0.8 })); this.lane.visible = false; this.scene.add(this.lane);
    this.routes = new THREE.Group(); this.scene.add(this.routes); this.routeT = 0;
    this.prev = new Map(); this.curr = new Map(); this.prevBall = { x: 0, y: 1, z: 0 }; this.currBall = { x: 0, y: 1, z: 0 };
    this.buffer = new ReplayBuffer(8); this.replay = null; this.sbT = 0; this.celebrate = new Map(); this.lastCapture = 0;
    this.pendingReplay = null; this.onReplayEnd = null; this.camSpeed = 0;
    this.wire(bus); this.capture(); this.capture();
  }
  wire(bus) {
    const g = this.g, fx = this.fx;
    this.offs = [
      bus.on('score', ({ player, pts, ev }) => {
        const side = ev.side ?? 1; const kind = ev.grade === 'perfect' && ev.type !== 'dunk' ? 'green' : pts === 3 ? 3 : 2;
        this.arena.flashRim(side, kind); this.arena.crowdExcite = Math.min(1.2, this.arena.crowdExcite + (pts === 3 ? 0.7 : 0.4));
        const rim = { x: hoopX(side), y: COURT.rimHeight, z: 0 }; fx.burst(rim, kind === 3 ? COLORS.magenta : kind === 'green' ? COLORS.lime : COLORS.cyan, 36, 4, 0.9);
        if (pts === 3) this.R.kick(0.006); this.celebrate.set(player, g.t + 1.6);
      }),
      bus.on('dunk', ({ made }) => { if (made) { this.rig.kick(0.5); this.R.kick(0.014); } }),
      bus.on('shotGrade', ({ player, grade }) => this.meter.result(player, grade)),
      bus.on('block', () => { this.rig.kick(0.35); this.R.kick(0.01); }),
      bus.on('shotRelease', ({ ev, player }) => { this.rig.shotCut = this.rig.time + 1.8; if (ev.human && (ev.grade === 'perfect' || ev.grade === 'excellent')) { if (ev.grade === 'perfect') this.meter.flash(); fx.burst({ x: player.pos.x, y: 0.1, z: player.pos.z }, ev.grade === 'perfect' ? COLORS.lime : COLORS.cyan, ev.grade === 'perfect' ? 46 : 22, 3.2, 0.8); } }),
      bus.on('buzzer', () => this.R.kick(0.02)),
      bus.on('ballHit', ({ kind, speed, pos }) => { if (kind === 'rim' && speed > 3) fx.burst(pos, COLORS.amber, 6, 2, 0.4, 0.1); }),
    ];
  }
  /** Snapshot render state after each logic tick (for interpolation + replay). */
  capture() {
    const g = this.g;
    for (const p of g.on) { const c = this.curr.get(p) ?? {}; this.prev.set(p, { ...c, x: c.x ?? p.pos.x, z: c.z ?? p.pos.z, y: c.y ?? p.y, face: c.face ?? p.face }); this.curr.set(p, { x: p.pos.x, z: p.pos.z, y: p.y, face: p.face }); }
    this.prevBall = this.currBall; this.currBall = { x: g.ball.pos.x, y: g.ball.pos.y, z: g.ball.pos.z };
    this.buffer.record(g);
  }
  flashHud() {}
  setCameraMode(m) { this.rig.setMode(m); }
  startReplay(sec = 6, speed = 0.5) {
    const clip = this.buffer.clip(sec); if (clip.length < 30) return false;
    this.replay = new ReplayPlayer(clip, { speed }); this.g.paused = true; this.bus.emit('replayStart', {});
    const f = clip[clip.length - 1].ball; this.rig.orbit = { c: new THREE.Vector3(f.x, 1.6, f.z), r: 8, a: Math.PI * 0.5, speed: 0.12 }; this.rig.snap(); return true;
  }
  startReplayClip(clip, speed = 0.6) {
    if (!clip || clip.length < 20) return false;
    this.replay = new ReplayPlayer(clip, { speed }); this.g.paused = true; this.bus.emit('replayStart', {});
    const f = clip[clip.length - 1].ball; this.rig.orbit = { c: new THREE.Vector3(f.x, 1.6, f.z), r: 8, a: Math.PI * 0.5, speed: 0.12 }; this.rig.snap(); return true;
  }
  stopReplay() { if (!this.replay) return; this.replay = null; this.rig.orbit = null; this.g.paused = false; this.bus.emit('replayEnd', {}); this.onReplayEnd?.(); }
  queueReplay(delay = 1.3) { this.pendingReplay = this.time + delay; }
  update(dt, alpha, ctx) {
    this.time += dt; const g = this.g, s = this.settings;
    if (this.pendingReplay && this.time > this.pendingReplay && !this.replay) { this.pendingReplay = null; this.startReplay(6, 0.5); }
    if (this.replay) { this.replay.step(dt); if (this.replay.done) { this.stopReplay(); } }
    const R = this.replay;
    const activeCtrl = ctx?.active ?? [];
    for (const [rt, a] of this.ath) {
      let on = rt.onCourt; let proxy = rt;
      let c, pv, saved;
      if (R) {
        const f = R.frame(), nf = R.next(), al = R.alpha(); const fr = f.pl.find((x) => x.id === rt.id), nx = nf.pl.find((x) => x.id === rt.id);
        on = !!fr; if (!fr) { a.root.visible = false; continue; }
        proxy = { ...rt, pos: { x: fr.x + ((nx?.x ?? fr.x) - fr.x) * al, z: fr.z + ((nx?.z ?? fr.z) - fr.z) * al }, vel: { x: fr.vx, z: fr.vz }, y: fr.y, face: angLerp(fr.face, nx?.face ?? fr.face, al), hasBall: fr.hasBall, handsUp: fr.hu, dribbleHand: fr.dh, stumble: fr.st, state: fr.state, action: fr.action };
      } else if (on) {
        c = this.curr.get(rt); pv = this.prev.get(rt); if (!c || !pv) continue;
        proxy = Object.create(rt); proxy.pos = { x: pv.x + (c.x - pv.x) * alpha, z: pv.z + (c.z - pv.z) * alpha }; proxy.y = pv.y + (c.y - pv.y) * alpha; proxy.face = angLerp(pv.face, c.face, alpha);
      }
      a.root.visible = on; if (!on) continue;
      const defense = !R && g.poss && g.poss.team !== rt.team && g.phase === 'live';
      const ballPos = R ? this.replayBall(R) : this.renderBall(alpha);
      const celebrating = (this.celebrate.get(rt) ?? 0) > g.t;
      const isActive = !R && activeCtrl.includes(rt);
      // eyes: ball handler / shooter look at the rim or the nearest defender, defenders look at the ball handler, everyone else at the ball
      let look = ballPos, closeout = false; const holder = g.ball.holder;
      if (!R) {
        const side = g.dirOf(rt.team);
        if (rt.hasBall) { let nd = null, nb = 3; for (const q of g.teams[1 - rt.team].court) { const d = Math.hypot(q.pos.x - rt.pos.x, q.pos.z - rt.pos.z); if (d < nb) { nb = d; nd = q; } } look = rt.action ? { x: hoopX(side), y: 3.05, z: 0 } : nd ? { x: nd.pos.x, y: nd.height * 0.92, z: nd.pos.z } : { x: hoopX(side), y: 3.05, z: 0 }; }
        else if (defense && holder) { look = { x: holder.pos.x, y: holder.height * 0.9, z: holder.pos.z }; const dd = Math.hypot(holder.pos.x - rt.pos.x, holder.pos.z - rt.pos.z); closeout = dd < 5.5 && dd > 1.2 && g.t - holder.catchTime < 1.5; }
      }
      a.update(dt, proxy, ballPos, { defense, celebrate: celebrating, active: isActive, look, closeout, boxing: !R && (rt.boxUntil ?? 0) > g.t, ringColor: isActive ? '#ffffff' : rt.hasBall ? rt.data ? this.g.teams[rt.team].data.colors.secondary : undefined : undefined });
      if (!R && rt.run >= 4 && Math.random() < 0.8) this.fx.flame({ x: proxy.pos.x, y: 0.9, z: proxy.pos.z }, Math.random() < 0.5 ? COLORS.amber : COLORS.danger);
      void saved;
    }
    // ball
    const bp = R ? this.replayBall(R) : this.renderBall(alpha);
    this.ball.position.set(bp.x, bp.y, bp.z);
    const spd = R ? 0 : Math.hypot(g.ball.vel.x, g.ball.vel.z);
    if (!R && g.ball.quat && g.ball.state === 'loose') this.ball.quaternion.set(g.ball.quat.x, g.ball.quat.y, g.ball.quat.z, g.ball.quat.w);
    else this.ball.rotation.z -= dt * (spd * 2 + 1.2);
    this.ballShadow.position.set(bp.x, 0.02, bp.z); this.ballShadow.scale.setScalar(Math.max(0.4, 1.2 - bp.y * 0.18)); this.ballShadow.material.opacity = Math.max(0.1, 0.45 - bp.y * 0.07);
    // shot meter + helpers for the controlled player
    const ctrl = activeCtrl[0];
    if (!R && ctrl) this.meter.update(dt, this.time, ctrl, s.gameplay?.shotMeter ?? 'overhead', { showContest: true, camera: this.camera }); else this.meter.update(dt, this.time, null, 'off', {});
    this.updateHelpers(dt, ctrl, R);
    this.fx.update(dt, this.R.renderer.domElement.clientHeight || innerHeight);
    // camera
    const target = { ball: bp, vel: R ? { x: 0, z: 0 } : g.ball.vel, attackSide: g.dirOf(g.poss?.team ?? 0), ctrl, phase: g.phase };
    this.rig.clutch = g.isClutch?.() ?? false; this.rig.update(dt, target); this.camSpeed = this.rig.speed;
    const camMode = this.rig.mode === 'dynamic' ? this.rig.dynMode : this.rig.mode; this.arena.setOverheadVisible(camMode !== 'high');
    this.arena.update(dt, bp);
    this.sbT -= dt; if (this.sbT <= 0) { this.sbT = 0.2; this.drawBoard(); }
    this.R.render(dt, this.camSpeed);
  }
  renderBall(alpha) { const p = this.prevBall, c = this.currBall; return { x: p.x + (c.x - p.x) * alpha, y: p.y + (c.y - p.y) * alpha, z: p.z + (c.z - p.z) * alpha }; }
  replayBall(R) { const f = R.frame().ball, n = R.next().ball, a = R.alpha(); return { x: f.x + (n.x - f.x) * a, y: f.y + (n.y - f.y) * a, z: f.z + (n.z - f.z) * a }; }
  updateHelpers(dt, ctrl, R) {
    const g = this.g;
    this.arrow.visible = !!ctrl && !R; if (ctrl && !R) { const a = this.ath.get(ctrl); this.arrow.position.set(ctrl.pos.x, ctrl.height + 0.55 + Math.sin(this.time * 4) * 0.06 + ctrl.y, ctrl.pos.z); this.arrow.material.color.set(g.teams[ctrl.team].data.colors.primary); void a; }
    // pass target highlight + lane glow (human ball handler only)
    const h = g.humans.find((x) => x.ctrl === ctrl); let tgt = null;
    if (!R && h && ctrl.hasBall && (g.phase === 'live' || g.phase === 'inbound')) tgt = bestTargetInDirection(g, ctrl, h.intent.passAimX || h.intent.mx, h.intent.passAimZ || h.intent.mz);
    this.passRing.visible = !!tgt; this.lane.visible = !!tgt;
    if (tgt) { this.passRing.position.set(tgt.pos.x, 0.03, tgt.pos.z); const pos = this.lane.geometry.attributes.position; pos.setXYZ(0, ctrl.pos.x, 1.0, ctrl.pos.z); pos.setXYZ(1, tgt.pos.x, 1.0, tgt.pos.z); pos.needsUpdate = true; this.lane.material.opacity = 0.35 + 0.35 * Math.sin(this.time * 8); this.passRing.material.opacity = 0.5 + 0.4 * Math.sin(this.time * 8); }
    // play route overlay fade
    if (this.routeT > 0) { this.routeT -= dt; this.routes.visible = true; this.routes.children.forEach((l) => { l.material.opacity = Math.min(1, this.routeT) * 0.85; }); } else this.routes.visible = false;
  }
  showPlay(name, team) {
    const play = PLAYS.find((p) => p.name === name); if (!play) return;
    this.routes.clear(); const side = this.g.dirOf(team);
    const colors = [COLORS.cyan, COLORS.magenta, COLORS.lime, COLORS.amber, '#ffffff'];
    for (let slot = 0; slot < 5; slot++) {
      const pts = play.steps.map((st) => st.slots[slot]).filter(Boolean).map((s) => { const w = toWorld(side, s.d, s.l); return new THREE.Vector3(w.x, 0.05, w.z); });
      if (pts.length < 2) { if (pts.length === 1) { const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.4, 20), new THREE.MeshBasicMaterial({ color: colors[slot], transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.copy(pts[0]); this.routes.add(m); m.material = m.material; } continue; }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colors[slot], transparent: true })); this.routes.add(line);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 4), new THREE.MeshBasicMaterial({ color: colors[slot], transparent: true })); head.position.copy(pts[pts.length - 1]); head.position.y = 0.3; this.routes.add(head); head.material.opacity = 0.85;
    }
    this.routeT = 3.5;
  }
  drawBoard() {
    const g = this.g, c = g.clock, m = Math.floor(c / 60), sec = Math.floor(c % 60), tenth = Math.floor((c % 1) * 10);
    const clock = c < 60 ? `${sec}.${tenth}` : `${m}:${String(sec).padStart(2, '0')}`;
    const q = g.quarter > 4 ? `OT${g.quarter - 4 > 1 ? g.quarter - 4 : ''}` : `Q${g.quarter}`;
    this.arena.drawScoreboard({ score: g.score, colors: g.teams.map((t) => t.data.colors.primary), abbr: g.teams.map((t) => t.data.abbr), clock, period: q, shotClock: String(Math.ceil(g.poss.shotClock)), foulsLine: `FOULS ${g.teams[0].fouls}-${g.teams[1].fouls}` });
  }
  dispose() { this.offs.forEach((f) => f()); this.arena.dispose(); this.scene.clear(); }
}
void RIM_X; void HALF_L;
