// The player: on-foot controller, driving, weapons, camera, death / respawn, pickups.
import * as THREE from 'three';
import { clamp, lerp, rnd, TAU, wrapAngle, angDiff, meshYaw } from './util.js';
import { makePlayerModel, pose } from './char.js';
import { WEAPONS, hitscan } from './combat.js';
import { P as PITCH, X1, Z0, H, lineX, lineZ, PIER, BEACH } from './world.js';

export class Player {
  constructor(G) {
    this.G = G; this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0; this.vxk = 0; this.vzk = 0; this.a = -Math.PI / 2; this.hp = 100; this.armor = 0; this.cash = 2500; this.state = 'foot'; this.vehicle = null;
    this.ammo = { pistol: 60, smg: 0, shotgun: 0, rpg: 0 }; this.mags = { pistol: 12, smg: 0, shotgun: 0, rpg: 0 }; this.owned = { fists: true, pistol: true, smg: false, shotgun: false, rpg: false }; this.cur = 1;
    this.fireT = 0; this.reloadT = 0; this.aiming = false; this.sprint = false; this.phase = 0; this.spd = 0; this.camYaw = -Math.PI / 2; this.camPitch = 0.18; this.lookYaw = 0; this.lookIdle = 0; this.camDist = 3.6; this.hitFlash = 0; this.deadT = 0; this.nearVehicle = null; this.punchT = 0; this.kills = 0; this.lastHurt = -99; this.hitMarker = 0; this.pose = {}; this.crouch = false; this.onGround = true; this.spread = 0;
    this.model = makePlayerModel(); G.scene.add(this.model); this.model.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.pickups = []; this.setupPickups();
  }
  get pos() { return { x: this.x, z: this.z }; }
  weapon() { return WEAPONS[this.cur]; }
  setPos(x, z) { this.x = x; this.z = z; this.y = this.G.world.groundY(x, z); this.vy = 0; }
  teleport(x, z, a) { this.exitVehicleInstant(); this.setPos(x, z); if (a !== undefined) { this.a = a; this.camYaw = a; } }
  giveWeapon(id, ammo = 0) { const w = WEAPONS.findIndex(q => q.id === id); this.owned[id] = true; this.ammo[id] = Math.min((this.ammo[id] || 0) + ammo, WEAPONS[w].maxAmmo); if (!this.mags[id]) this.mags[id] = Math.min(WEAPONS[w].mag, this.ammo[id]); }
  giveAll() { for (const w of WEAPONS) if (!w.melee) this.giveWeapon(w.id, w.maxAmmo); this.cur = 2; }
  damage(n, src) {
    const G = this.G; if (this.state === 'dead' || this.state === 'busted') return; if (G.cfg.godMode) return; n *= G.difficultyMul || 1;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.6); this.armor -= a; n -= a; } this.hp -= n; this.hitFlash = Math.min(1, this.hitFlash + n / 40); this.lastHurt = G.clock; if (this.hp <= 0) this.die();
  }
  die() { if (this.state === 'dead') return; const G = this.G; this.state = 'dead'; this.deadT = 0; this.hp = 0; if (this.vehicle) { this.vehicle.driver = null; this.vehicle.inp.thr = 0; this.vehicle.inp.hb = 1; this.vehicle = null; } G.hud && G.hud.big('WASTED', '#ff3a5a'); G.timeScale = 0.35; }
  bust() { if (this.state === 'dead' || this.state === 'busted') return; this.state = 'busted'; this.deadT = 0; if (this.vehicle) { this.vehicle.driver = null; this.vehicle.inp.hb = 1; this.vehicle = null; } this.G.hud && this.G.hud.big('BUSTED', '#5aa0ff'); }
  respawn(where) {
    const G = this.G, spot = where || (this.state === 'busted' ? G.world.station : G.world.hospital); const fee = Math.min(this.cash, Math.round(this.cash * 0.1 + 100)); this.cash -= fee; G.hud && G.hud.notify(`${this.state === 'busted' ? 'Booking fee' : 'Hospital bill'}: -$${fee}`);
    this.hp = 100; this.armor = 0; this.state = 'foot'; this.model.rotation.set(0, 0, 0); this.setPos(spot.x, spot.z); this.vxk = this.vzk = 0; this.model.visible = true; G.timeScale = 1; if (G.police) G.police.clear(); if (G.missions && G.missions.fail) G.missions.fail('You were taken out');
    if (this.cur === 0 && this.owned.pistol) this.cur = 1;
  }
  // ---- vehicles
  findVehicle() { const G = this.G; let best = null, bd = 3.4; for (const v of G.vehicles.list) { if (v.exploded && v.deadT < 40) continue; for (const [cx, cz, r] of v.circles()) { const d = Math.hypot(cx - this.x, cz - this.z) - r; if (d < bd) { bd = d; best = v; } } } return best; }
  enter(v) {
    const G = this.G; if (v.driver && v.driver !== this && G.peds) { G.peds.ejectDriver(v); if (G.police) G.police.crime(v.police ? 'stealcopcar' : 'carjack', v.x, v.z); }
    else if (v.police && G.police) G.police.crime('stealcopcar', v.x, v.z);
    v.driver = this; v.ai = null; v.stolen = true; v.parked = false; v.dead = false; v.inp.thr = v.inp.brk = 0; this.vehicle = v; this.state = 'vehicle'; this.model.visible = false; this.x = v.x; this.z = v.z; this.y = v.y; if (G.audio) G.audio.enterCar(); G.hud && G.hud.notify(v.name);
    if (G.missions && G.missions.onEnter) G.missions.onEnter(v);
  }
  exitVehicleInstant() { const v = this.vehicle; if (!v) return; v.driver = null; v.inp.thr = v.inp.brk = 0; this.vehicle = null; this.state = 'foot'; this.model.visible = true; }
  exit() {
    const v = this.vehicle, G = this.G; if (!v) return; const c = Math.cos(v.a), s = Math.sin(v.a), rx = -s, rz = c, out = {}; let placed = false;
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1.6], [0, 1.6]]) { const side = v.st.W / 2 + 0.85; const px = v.x + rx * side * ox + c * (oz * 2.2), pz = v.z + rz * side * ox + s * (oz * 2.2); if (!G.world.collideCircle(px, pz, 0.45, out)) { this.setPos(px, pz); placed = true; break; } }
    if (!placed) this.setPos(v.x + rx * (v.st.W / 2 + 1), v.z + rz * (v.st.W / 2 + 1)); const sp = v.speed; this.vxk = v.vx * 0.5; this.vzk = v.vz * 0.5; if (sp > 14) this.damage((sp - 12) * 1.4, null);
    v.driver = null; v.inp.thr = 0; v.inp.brk = 0.2; v.inp.steer = 0; v.inp.hb = sp < 3 ? 1 : 0; this.vehicle = null; this.state = 'foot'; this.model.visible = true; this.camYaw = v.a; this.camPitch = 0.2; this.a = v.a;
    if (G.missions && G.missions.onExit) G.missions.onExit(v);
  }
  // ---- pickups
  setupPickups() {
    const G = this.G, spots = [
      ['rpg', X1 + 240, PIER.z, '#ff7a30'], ['smg', lineX(2) + 14, lineZ(5) + 14, '#ffb02e'], ['shotgun', lineX(9) + 14, lineZ(8) - 14, '#22e6ff'], ['armor', lineX(5) + 14, lineZ(13) + 14, '#5aa0ff'], ['health', X1 - 5, Z0 + H * 0.5 + 24, '#ff4a6a'],
      ['smg', lineX(13) + 14, lineZ(5) + 14, '#ffb02e'], ['health', lineX(8) + 14, lineZ(2) + 14, '#ff4a6a'], ['shotgun', lineX(14) + 14, lineZ(12) + 14, '#22e6ff'], ['armor', lineX(10) + 14, lineZ(7) - 14, '#5aa0ff'], ['rpg', lineX(3) + 14, lineZ(14) + 14, '#ff7a30'], ['health', lineX(16) + 14, lineZ(3) + 14, '#ff4a6a'],
    ];
    for (const [type, x, z, c] of spots) {
      const grp = new THREE.Group(), glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) })); grp.add(glow); const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.2), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.y = 6; grp.add(beam);
      grp.position.set(x, G.world.groundY(x, z) + 1.1, z); G.scene.add(grp); this.pickups.push({ type, x, z, grp, glow, t: 0, active: true });
    }
  }
  updatePickups(dt) {
    const G = this.G;
    for (const p of this.pickups) {
      p.glow.rotation.y += dt * 1.6; p.glow.position.y = Math.sin(G.clock * 2 + p.x) * 0.15; const d2 = (p.x - this.x) ** 2 + (p.z - this.z) ** 2, vis = d2 < 600 * 600; p.grp.visible = p.active && vis;
      if (!p.active) { p.t -= dt; if (p.t <= 0) p.active = true; continue; }
      if (d2 < 2.2 * 2.2 && this.state !== 'dead') {
        if (p.type === 'health') { if (this.hp >= 100) continue; this.hp = 100; G.hud.notify('Health restored'); } else if (p.type === 'armor') { if (this.armor >= 100) continue; this.armor = 100; G.hud.notify('Body armor'); }
        else { const w = WEAPONS.find(q => q.id === p.type); this.giveWeapon(p.type, p.type === 'rpg' ? 6 : p.type === 'shotgun' ? 24 : 120); G.hud.notify(w.name + ' acquired'); }
        p.active = false; p.t = 90; if (G.audio) G.audio.pickup();
      }
    }
  }
  // ---- shooting
  aimPoint() {
    const G = this.G, cam = G.camera, d = new THREE.Vector3(); let o = cam.position;
    if (this.aiming) cam.getWorldDirection(d); else { const cp = Math.cos(this.camPitch * 0.5); d.set(Math.cos(this.a) * cp, Math.sin(this.camPitch * 0.5) * 0.6, Math.sin(this.a) * cp).normalize(); o = { x: this.x, y: this.y + 1.4, z: this.z }; }
    const h = hitscan(G, o.x, o.y, o.z, d.x, d.y, d.z, 160, { ignorePlayer: true, ignoreVehicle: this.vehicle });
    return { x: o.x + d.x * h.t, y: o.y + d.y * h.t, z: o.z + d.z * h.t, t: h.t, d };
  }
  reload() { const w = this.weapon(); if (w.melee || this.reloadT > 0) return; const id = w.id, have = this.ammo[id] || 0, mag = this.mags[id] || 0; if (mag >= w.mag || have <= mag) return; this.reloadT = w.reload; if (this.G.audio) this.G.audio.reload(); }
  tryFire(inp, dt) {
    const G = this.G, w = this.weapon(); this.fireT -= dt; if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const id = w.id, take = Math.min(w.mag, this.ammo[id]); this.mags[id] = take; } return; }
    const want = w.auto ? inp.lmb : inp.lmbPressed; if (!want || this.fireT > 0) return;
    if (w.melee) { this.fireT = w.rate; this.punchT = 0.25; const fx = Math.cos(this.a), fz = Math.sin(this.a); if (G.peds) G.peds.melee(this.x + fx * 0.8, this.z + fz * 0.8, 1.1, w.dmg, this, fx, fz); if (G.audio) G.audio.punch(); return; }
    const id = w.id; if (this.mags[id] <= 0) { if (this.ammo[id] > 0) this.reload(); else if (G.audio && inp.lmbPressed) G.audio.click(); this.fireT = 0.25; return; }
    this.fireT = w.rate; if (!G.cfg.infAmmo) { this.mags[id]--; this.ammo[id]--; }
    const ap = this.aimPoint(), ox = this.x + Math.cos(this.a) * 0.4, oy = this.y + 1.38, oz = this.z + Math.sin(this.a) * 0.4;
    let dx = ap.x - ox, dy = ap.y - oy, dz = ap.z - oz; const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    if (w.rocket) { G.combat.fireRocket(ox + dx, oy + dy * 0.5, oz + dz, dx, dy, dz, 'player'); if (G.audio) G.audio.shoot('rpg'); G.alert(this.x, this.z, 120, 'gun'); this.camPitch += 0.04; return; }
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) { const sp = w.spread + this.spread * 0.02; let ddx = dx + rnd(-sp, sp), ddy = dy + rnd(-sp, sp), ddz = dz + rnd(-sp, sp); const l = Math.hypot(ddx, ddy, ddz); ddx /= l; ddy /= l; ddz /= l; const h = hitscan(G, ox, oy, oz, ddx, ddy, ddz, w.range, { ignorePlayer: true, ignoreVehicle: this.vehicle }); G.combat.applyHit(h, w.dmg, 'player', { x: ddx, z: ddz }); if (i < 3 || n === 1) G.fx.tracer({ x: ox + ddx * 0.8, y: oy - 0.1, z: oz + ddz * 0.8 }, h); if (h.type === 'ped' && h.ped.hp <= 0) this.hitMarker = 1.4; else if (h.type === 'ped' || h.type === 'vehicle') this.hitMarker = Math.max(this.hitMarker, 0.7); }
    G.fx.sparks(ox + dx, oy, oz + dz, 3, 3); G.fx.flash(ox + dx, oy, oz + dz, 120, 0xffd080); if (G.audio) G.audio.shoot(w.snd); this.camPitch += w.id === 'shotgun' ? 0.05 : 0.012; this.camYaw += rnd(-0.004, 0.004); this.spread = Math.min(2, this.spread + 0.25);
    G.alert(this.x, this.z, w.id === 'pistol' ? 55 : 80, 'gun'); if (G.police) G.police.crime('shots', this.x, this.z);
  }
  // ---- main update
  update(dt) {
    const G = this.G, inp = G.input, cfg = G.cfg; this.hitFlash = Math.max(0, this.hitFlash - dt * 1.5); this.hitMarker = Math.max(0, this.hitMarker - dt * 3); this.spread = Math.max(0, this.spread - dt * 2.5);
    // look
    const sens = 0.0022 * cfg.mouseSens * (this.aiming ? 0.6 : 1); if (this.state !== 'dead' && this.state !== 'busted') { if (this.state === 'vehicle') { this.lookYaw += inp.mdx * sens; this.camPitch = clamp(this.camPitch - inp.mdy * sens * (cfg.invertY ? -1 : 1), -0.5, 1.1); if (Math.abs(inp.mdx) + Math.abs(inp.mdy) > 0.5) this.lookIdle = 0; } else { this.camYaw += inp.mdx * sens; this.camPitch = clamp(this.camPitch - inp.mdy * sens * (cfg.invertY ? -1 : 1), -1.0, 1.25); } }
    if (this.state === 'foot') this.updateFoot(dt, inp); else if (this.state === 'vehicle') this.updateVehicle(dt, inp); else this.updateDead(dt);
    this.updatePickups(dt); this.updateCamera(dt);
    G.focus.set(this.x, 0, this.z);
  }
  updateFoot(dt, inp) {
    const G = this.G, w = this.weapon(), world = G.world;
    // weapon select
    for (let i = 0; i < 5; i++) if (inp.pressed('Digit' + (i + 1)) && this.owned[WEAPONS[i].id]) { this.cur = i; this.reloadT = 0; }
    if (inp.wheel || inp.pressed('KeyE') || inp.pressed('KeyQ')) { const dir = inp.wheel ? Math.sign(inp.wheel) : inp.pressed('KeyE') ? 1 : -1; for (let k = 1; k <= 5; k++) { const i = (this.cur + dir * k + 50) % 5; if (this.owned[WEAPONS[i].id]) { this.cur = i; this.reloadT = 0; break; } } }
    if (inp.pressed('KeyR')) this.reload();
    this.aiming = inp.rmb && !w.melee; this.sprint = inp.down('ShiftLeft', 'ShiftRight') && !this.aiming;
    // move
    const f = { x: Math.cos(this.camYaw), z: Math.sin(this.camYaw) }, r = { x: -f.z, z: f.x };
    const ix = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0), iz = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0);
    let mx = f.x * iz + r.x * ix, mz = f.z * iz + r.z * ix; const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
    const top = this.aiming ? 2.7 : this.sprint ? 7.8 : 4.7, target = ml > 0 ? top : 0; this.spd = lerp(this.spd, target, Math.min(1, dt * (ml > 0 ? 8 : 12)));
    if (ml > 0) { this.dirx = mx; this.dirz = mz; } const dx = (this.dirx || 0) * this.spd + this.vxk, dz = (this.dirz || 0) * this.spd + this.vzk; this.vxk *= Math.exp(-4 * dt); this.vzk *= Math.exp(-4 * dt);
    this.x += dx * dt; this.z += dz * dt;
    // face
    const wantA = this.aiming || (inp.lmb && !w.melee) || this.fireT > 0.08 ? this.camYaw : (ml > 0 ? Math.atan2(mz, mx) : this.a); this.a += angDiff(this.a, wantA) * Math.min(1, dt * 14);
    // collisions
    const out = this._o || (this._o = {}); for (let k = 0; k < 2; k++) { if (world.collideCircle(this.x, this.z, 0.42, out)) { this.x += out.nx * out.depth; this.z += out.nz * out.depth; } }
    for (const v of G.vehicles.list) { const ddx = v.x - this.x, ddz = v.z - this.z; if (ddx * ddx + ddz * ddz > 40) continue; for (const [cx, cz, rr] of v.circles()) { const ex = this.x - cx, ez = this.z - cz, rad = rr + 0.4, d2 = ex * ex + ez * ez; if (d2 < rad * rad) { const d = Math.sqrt(d2) || 1e-3; this.x += ex / d * (rad - d); this.z += ez / d * (rad - d); const sp = v.speed; if (sp > 3.5 && !v.exploded) { const rel = (v.vx * ex + v.vz * ez) / d; if (rel > 2.5) { this.damage(sp * 2.4, v.driver); this.vxk = v.vx * 0.6; this.vzk = v.vz * 0.6; this.vy = 3; G.hud && G.hud.flashDamage(); } } } } }
    // vertical
    const gy = world.groundY(this.x, this.z); this.vy -= 18 * dt; this.y += this.vy * dt; this.onGround = false; if (this.y <= gy) { this.y = gy; this.vy = 0; this.onGround = true; } if (this.onGround && inp.pressed('Space')) { this.vy = 6.2; this.onGround = false; }
    // interact
    this.nearVehicle = this.findVehicle(); if (inp.pressed('KeyF')) { if (this.nearVehicle) this.enter(this.nearVehicle); else if (G.onInteract) G.onInteract(); }
    this.tryFire({ lmb: inp.lmb, lmbPressed: inp.lmbPressed }, dt);
    // model
    this.phase += this.spd * dt * 2.3; const mode = !this.onGround ? 3 : (this.aiming || this.fireT > 0.1 || (inp.lmb && !w.melee) ? 1 : 0); pose(this.pose, this.phase, this.spd, mode); this.applyModel(w, mode);
    if (this.punchT > 0) { this.punchT -= dt; this.model.userData.armR.rotation.x = 1.6 * Math.sin((1 - this.punchT / 0.25) * Math.PI); }
    // waves wetting / water boundary handled by world bounds
  }
  applyModel(w, mode) {
    const m = this.model, u = m.userData, p = this.pose; m.position.set(this.x, this.y + p.bob * 0, this.z); m.rotation.set(0, meshYaw(this.a), 0);
    u.legL.rotation.x = p.legL; u.legR.rotation.x = p.legR; u.armL.rotation.x = p.armL; u.armR.rotation.x = p.armR; u.torso.rotation.x = -p.lean; u.head.rotation.x = p.lean * 0.5; m.position.y += p.bob;
    for (const k in u.guns) u.guns[k].visible = (w.id === k); u.armR.rotation.x = this.punchT > 0 ? u.armR.rotation.x : (w.melee && mode === 1 ? p.armR : p.armR); if (!w.melee && mode !== 1) u.armR.rotation.x = 0.75; if (!w.melee && mode !== 1) u.armL.rotation.x = 0.15;
    m.visible = this.state !== 'vehicle';
  }
  updateVehicle(dt, inp) {
    const G = this.G, v = this.vehicle; if (!v || v.dead && v.exploded && v.deadT < 44) { if (v && v.exploded) { this.damage(200, null); } return; }
    const i = v.inp; i.thr = (inp.down('KeyW', 'ArrowUp') ? 1 : 0) - (inp.down('KeyS', 'ArrowDown') ? 1 : 0); i.steer = (inp.down('KeyD', 'ArrowRight') ? 1 : 0) - (inp.down('KeyA', 'ArrowLeft') ? 1 : 0); i.hb = inp.down('Space') ? 1 : 0; i.brk = 0;
    if (inp.pressed('KeyH') && G.audio) G.audio.horn(); if (inp.down('KeyH') && G.audio) G.audio.hornHold(true); else if (G.audio) G.audio.hornHold(false);
    if (inp.pressed('KeyE') && G.audio) G.audio.nextStation(1); if (inp.pressed('KeyQ') && G.audio) G.audio.nextStation(-1);
    this.x = v.x; this.z = v.z; this.y = v.y; this.a = v.a; this.nearVehicle = null;
    if (inp.pressed('KeyF')) { if (v.speed < 28 || true) this.exit(); }
    if (G.audio) G.audio.engine(v.speed, Math.max(0, i.thr), v.T.vmax, v.type === 'hover');
    if (v.exploded) this.damage(300, null);
  }
  updateDead(dt) {
    this.deadT += dt / (this.state === 'dead' ? Math.max(G_ts(this.G), 0.2) : 1); const m = this.model; m.visible = true; m.position.set(this.x, this.y + 0.15, this.z); m.rotation.x = lerp(m.rotation.x, -Math.PI / 2, Math.min(1, dt * 5));
    if (this.deadT > (this.state === 'dead' ? 3.4 : 3.0)) this.respawn();
  }
  // ---- camera
  updateCamera(dt) {
    const G = this.G, cam = G.camera, v = this.vehicle; let px, py, pz, dist, cy = this.camYaw, cp = this.camPitch, fovT = G.cfg.fov;
    if (this.state === 'vehicle' && v) {
      this.lookIdle += dt; if (this.lookIdle > 1.6) this.lookYaw = lerp(this.lookYaw, 0, Math.min(1, dt * 3)); const back = G.input.down('KeyC') ? Math.PI : 0;
      const target = v.a + back, vel = Math.atan2(v.vz, v.vx), useVel = v.speed > 8 && v.fwd > 0 ? vel : v.a; const base = back ? target : (this.camYawV === undefined ? v.a : this.camYawV);
      this.camYawV = this.camYawV === undefined ? v.a : this.camYawV + angDiff(this.camYawV, back ? target : (v.fwd > 0 ? lerpAng(v.a, useVel, 0.45) : v.a)) * Math.min(1, dt * 4.5); void base;
      cy = this.camYawV + this.lookYaw; cp = clamp(0.2 + (this.camPitch - 0.18) * 0.8, -0.2, 1); this.camYaw = cy;
      dist = (6.4 + v.st.len * 0.18 + v.speed * 0.035) * (v.type === 'suv' || v.type === 'swat' ? 1.1 : 1); px = v.x; py = v.y + 1.35 + v.hover; pz = v.z; fovT += clamp(v.speed * 0.28, 0, 22);
    } else if (this.state === 'dead' || this.state === 'busted') { this.camYaw += dt * 0.25; cy = this.camYaw; cp = 0.5; dist = 5; px = this.x; py = this.y + 1; pz = this.z; }
    else { const aim = this.aiming ? 1 : 0; this.camDist = lerp(this.camDist, aim ? 2.1 : 3.9, Math.min(1, dt * 8)); dist = this.camDist; px = this.x; py = this.y + 1.5; pz = this.z; const rx = -Math.sin(cy), rz = Math.cos(cy), sh = aim ? 0.55 : 0.0; px += rx * sh; pz += rz * sh; fovT -= aim * 12; this.camYawV = undefined; }
    const cpr = Math.cos(cp), lx = Math.cos(cy) * cpr, lz = Math.sin(cy) * cpr, ly = Math.sin(cp);
    // collision pull-in
    let d = dist; const tb = G.world.rayHitsBuilding(px, pz, -lx, -lz, dist * cpr + 0.5, py - ly * dist, -ly); if (tb < dist * cpr + 0.5) d = Math.max(0.8, (tb - 0.5) / Math.max(cpr, 0.2));
    let cx = px - lx * d, cyy = py - ly * d, cz = pz - lz * d; const gy = G.world.groundY(cx, cz); if (cyy < gy + 0.4) cyy = gy + 0.4;
    const k = this.state === 'vehicle' ? 1 - Math.exp(-dt * 14) : 1; this._cx = lerp(this._cx ?? cx, cx, k); this._cy = lerp(this._cy ?? cyy, cyy, k); this._cz = lerp(this._cz ?? cz, cz, k);
    if (Math.hypot(this._cx - cx, this._cz - cz) > 25) { this._cx = cx; this._cy = cyy; this._cz = cz; }
    const sh = G.shake || 0; G.shake = sh * Math.pow(0.02, dt); cam.position.set(this._cx + rnd(-sh, sh) * 0.25, this._cy + rnd(-sh, sh) * 0.25, this._cz + rnd(-sh, sh) * 0.25); cam.lookAt(px, py, pz);
    if (this.state === 'foot' && this.aiming) cam.lookAt(px + lx * 20, py + ly * 20, pz + lz * 20);
    cam.fov = lerp(cam.fov, fovT, Math.min(1, dt * 5)); cam.updateProjectionMatrix();
  }
}
function G_ts(G) { return G.timeScale || 1; }
function lerpAng(a, b, t) { return a + angDiff(a, b) * t; }
