// Police & wanted system: stars, pursuit cruisers (road-grid pathfinding + direct ramming), SWAT, foot cops, helicopter.
import * as THREE from 'three';
import { P, X0, Z0, lineX, lineZ, NBX, NBZ } from './world.js';
import { DIRS, OPP, laneP } from './traffic.js';
import { hitscan } from './combat.js';
import { clamp, rnd, pick, angDiff, lerp, TAU, col } from './util.js';

const TH = [0, 25, 80, 160, 280, 450];
const CARS = [0, 2, 3, 4, 5, 7], SWAT = [0, 0, 0, 0, 1, 2];

export function createPolice(G) {
  const C = { stars: 0, heat: 0, searching: false, cars: [], lastSeen: { x: 0, z: 0 }, evadeT: 0, heli: null, arrest: 0, shotT: 0, seenT: 0, spawnT: 0, losT: 0 };
  const fw = new THREE.Vector3();
  const clear = (x0, z0, x1, z1, h = 1.4) => { const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz) || 1; return G.world.rayHitsBuilding(x0, z0, dx / d, dz / d, d, h, 0) === Infinity; };
  C.clear = () => { C.stars = 0; C.heat = 0; C.searching = false; C.evadeT = 0; C.arrest = 0; C.releaseAll(); };
  C.isCar = v => !!(v && v.ai && v.ai.cop);
  C.foot = () => (G.peds ? G.peds.list.filter(p => (p.role === 'cop' || p.role === 'swat') && p.state !== 'dead') : []);
  C.setStars = (n) => { n = clamp(Math.round(n), 0, 5); if (n === 0) { C.clear(); return; } C.stars = n; C.heat = Math.max(C.heat, TH[n]); C.searching = false; C.evadeT = 0; C.lastSeen = { x: G.player.x, z: G.player.z }; };
  C.witnessed = (x, z, kind) => {
    if (kind === 'killcop' || kind === 'killcopcar' || kind === 'explosion') return true;
    for (const cv of C.cars) if (cv.v && !cv.v.dead && Math.hypot(cv.v.x - x, cv.v.z - z) < 110 && clear(cv.v.x, cv.v.z, x, z)) return true;
    for (const p of C.foot()) if (Math.hypot(p.x - x, p.z - z) < 90 && clear(p.x, p.z, x, z)) return true;
    if (G.peds) for (const p of G.peds.list) { if (p.role !== 'civ' || p.state === 'dead') continue; if (Math.hypot(p.x - x, p.z - z) < 28) return true; }
    return false;
  };
  C.crime = (kind, x, z) => {
    if (G.cfg.neverWanted || G.player.state === 'dead') return; const sev = { kill: 45, killcop: 130, killcopcar: 70, stealcopcar: 55, hitped: 12, runover: 35, assault: 18, carjack: 35, shots: 3, explosion: 55, copcrash: 28 }[kind] || 10;
    if (kind === 'shots') { if (G.clock - C.shotT < 0.7) return; C.shotT = G.clock; } if (!C.witnessed(x, z, kind)) return;
    const was = C.stars; C.heat += sev; while (C.stars < 5 && C.heat >= TH[C.stars + 1]) C.stars++; if (C.stars > 0) { C.evadeT = 0; C.searching = false; C.lastSeen = { x: G.player.x, z: G.player.z }; }
    if (C.stars > was) { G.hud.notify(`Wanted level ${'★'.repeat(C.stars)}`); if (was === 0) G.hud.big('WANTED', '#ffdc3a'); }
  };
  C.onCopKilled = () => { G.player.giveWeapon('pistol', 12); };
  C.alert = (x, z, r, kind) => {};
  const prevCol = G.onVehicleCollision; G.onVehicleCollision = (A, B, worst) => { if (prevCol) prevCol(A, B, worst); if (worst > 4 && ((A.driver === G.player && C.isCar(B)) || (B.driver === G.player && C.isCar(A)))) C.crime('copcrash', G.player.x, G.player.z); };

  // ---- cop vehicle AI
  function driveDirect(v, tx, tz, maxSpeed, brakeNear, dt, ai) {
    const c = Math.cos(v.a), s = Math.sin(v.a), look = 9 + v.speed * 0.8; let err = angDiff(v.a, Math.atan2(tz - v.z, tx - v.x)), avoid = 0, obst = 0;
    for (const off of [0, 0.5, -0.5]) { const a = v.a + off, t = G.world.rayHitsBuilding(v.x, v.z, Math.cos(a), Math.sin(a), look, 0.8, 0); if (t < look) { const f = 1 - t / look; obst = Math.max(obst, f); avoid += off === 0 ? (err >= 0 ? 1 : -1) * f * 1.6 : -Math.sign(off) * f; } }
    for (const o of G.vehicles.list) { if (o === v || o.exploded && false) continue; const rx = o.x - v.x, rz = o.z - v.z, f = rx * c + rz * s; if (f < 1 || f > 9) continue; const l = -rx * s + rz * c; if (Math.abs(l) < 1.9 && !(o.driver === G.player)) { avoid += (l > 0 ? -1 : 1) * 0.9; } }
    v.inp.steer = clamp(err * 1.9 + avoid * 1.1, -1, 1); const vf = v.fwd; let target = maxSpeed * clamp(1 - Math.abs(err) * 0.45, 0.3, 1) * (1 - 0.65 * obst); if (brakeNear) target = Math.min(target, brakeNear);
    if (ai.revT > 0) { ai.revT -= dt; v.inp.thr = -0.8; v.inp.steer = -v.inp.steer; v.inp.brk = 0; return; }
    if (Math.abs(vf) < 0.6 && target > 3) { ai.stuck = (ai.stuck || 0) + dt; if (ai.stuck > 1.4) { ai.stuck = 0; ai.revT = 1.1; } } else ai.stuck = 0;
    if (vf < target) { v.inp.thr = clamp((target - vf) * 0.5, 0, 1); v.inp.brk = 0; } else { v.inp.thr = 0; v.inp.brk = clamp((vf - target) * 0.2, 0, 1); }
  }
  class CopAI {
    constructor(v, home) { this.v = v; this.cop = true; this.mode = 'police'; this.road = new G.traffic.RoadAI(v, 'police'); this.road.ignoreLights = true; this.road.mode = 'police'; this.road.cop = true; this.swat = home === 'swat'; this.direct = false; this.fieldKey = ''; this.stuckT = 0; this.lostT = 0; this.age = 0; this.exitT = 0; this.rt = 0; this.why = ''; this.passive = false; }
    bump(o, imp) {}
    reacquire(v) {
      const pr = this.road, c = Math.cos(v.a), s = Math.sin(v.a); const nj = Math.round((v.z - Z0) / P), ni = Math.round((v.x - X0) / P); let dir, i0, j0, off;
      if (Math.abs(v.z - lineZ(nj)) <= Math.abs(v.x - lineX(ni))) { j0 = clamp(nj, 0, NBZ); dir = c >= 0 ? 0 : 1; i0 = clamp(dir === 0 ? Math.floor((v.x - X0) / P) : Math.ceil((v.x - X0) / P), 0, NBX); const l = (v.z - lineZ(j0)) * (dir === 0 ? 1 : -1); off = l > 3.3 ? 4.8 : 1.9; }
      else { i0 = clamp(ni, 0, NBX); dir = s >= 0 ? 2 : 3; j0 = clamp(dir === 2 ? Math.floor((v.z - Z0) / P) : Math.ceil((v.z - Z0) / P), 0, NBZ); const l = (v.x - lineX(i0)) * (dir === 2 ? -1 : 1); off = l > 3.3 ? 4.8 : 1.9; }
      const nx = i0 + DIRS[dir][0], nz = j0 + DIRS[dir][1]; if (nx < 0 || nz < 0 || nx > NBX || nz > NBZ) { dir = OPP[dir]; i0 = nx < 0 || nx > NBX ? clamp(nx, 0, NBX) : i0; }
      pr.front = { i: i0, j: j0, dir, off }; pr.path = []; pr.pi = 0; pr.prev = { x: v.x, z: v.z }; pr.extend(); const fx = Math.cos(v.a), fz = Math.sin(v.a); while (pr.pi < pr.path.length - 2 && (pr.path[pr.pi].x - v.x) * fx + (pr.path[pr.pi].z - v.z) * fz < 3) pr.pi++; pr.prev = { x: v.x, z: v.z };
    }
    update(v, dt) {
      this.age += dt; const Pl = G.player, d = Math.hypot(Pl.x - v.x, Pl.z - v.z);
      if (C.stars === 0 || this.passive) { v.sirenOn = false; this.road.choose = G.traffic.chooseDir; this.road.ignoreLights = false; this.road.cruise = 13; if (this.direct) { this.direct = false; this.reacquire(v); } this.road.update(v, dt); return; }
      v.sirenOn = true; const los = d < 90 && clear(v.x, v.z, Pl.x, Pl.z, 0.9); this.lostT = 0;
      // cops step out when the player is on foot and close
      if (Pl.state === 'foot' && d < 24 && los && v.speed < 6 && !this.swat) { this.exitT += dt; v.inp.thr = 0; v.inp.brk = 1; if (this.exitT > 0.5) { C.dismount(v); return; } } else if (Pl.state === 'foot' && d < 30 && los && this.swat && v.speed < 6) { this.exitT += dt; v.inp.brk = 1; v.inp.thr = 0; if (this.exitT > 0.4) { C.dismount(v); return; } } else this.exitT = 0;
      const maxSpd = v.T.vmax * (0.62 + 0.12 * Math.min(C.stars, 4)) * (this.swat ? 0.85 : 1) * clamp(G.cfg.policeAggro, 0.5, 1.6) * clamp(1 - 0.0, 0, 1);
      if (d < 80 && los || d < 35) { // direct pursuit / ramming
        if (!this.direct) { this.direct = true; } let tx = Pl.x, tz = Pl.z, near = 0; if (Pl.vehicle) { tx += Pl.vehicle.vx * 0.5; tz += Pl.vehicle.vz * 0.5; } else near = d < 12 ? 2 : 0;
        driveDirect(v, tx, tz, maxSpd, near ? Math.max(0, d - 6) * 0.8 : 0, dt, this); this.why = 'direct';
      } else {
        if (this.direct) { this.direct = false; this.reacquire(v); this.rt = 0; }
        this.rt -= dt; const ni = clamp(Math.round((Pl.x - X0) / P), 0, NBX), nj = clamp(Math.round((Pl.z - Z0) / P), 0, NBZ); this.road.choose = G.traffic.chaseDir(G.traffic.distField(ni, nj)); this.road.cruise = maxSpd * 0.82; this.road.ignoreLights = true; this.why = 'road';
        if (this.road.lostT > 3 || (!G.world.onRoad(v.x, v.z) && v.speed < 3)) { this.reacquire(v); this.road.lostT = 0; }
        this.road.update(v, dt);
      }
    }
  }
  C.dismount = (v) => {
    const ai = v.ai; if (!ai || !G.peds) return; const n = ai.swat ? 2 : 1 + (C.stars >= 3 ? 1 : 0), c = Math.cos(v.a), s = Math.sin(v.a);
    for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, ped = G.peds.spawn(v.x - s * side * (v.st.W / 2 + 1), v.z + c * side * (v.st.W / 2 + 1) + (i > 1 ? 1.2 : 0), ai.swat ? 'swat' : 'cop'); if (ped) C.adoptCop(ped); }
    v.ai = null; v.driver = null; v.inp.thr = 0; v.inp.brk = 0.4; v.inp.hb = 1; v.sirenOn = true; v.parked = true; C.cars = C.cars.filter(x => x.v !== v);
  };
  C.adoptCop = (p) => { p.role = p.role === 'swat' ? 'swat' : 'cop'; p.ai = footAI; p.cool = rnd(0.4, 1.2); p.hp = p.role === 'swat' ? 220 : 100; };
  C.releaseAll = () => { for (const cv of C.cars) { if (cv.v && cv.v.ai) cv.v.ai.passive = true; } for (const p of C.foot()) { p.ai = null; p.state = 'flee'; p.fleeT = 6; p.fx = rnd(-1, 1); p.fz = rnd(-1, 1); p.aimT = 0; } C.cars = C.cars.filter(c => c.v && !c.v.dead); };

  function footAI(p, dt) {
    const Pl = G.player; if (C.stars === 0 || Pl.state === 'dead') { p.wx = p.wz = 0; p.aimT = 0; return; }
    const dx = Pl.x - p.x, dz = Pl.z - p.z, d = Math.hypot(dx, dz) || 1, swat = p.role === 'swat', los = d < 70 && clear(p.x, p.z, Pl.x, Pl.z); p.aimT = Math.max(0, (p.aimT || 0) - dt); p.cool = (p.cool || 0) - dt; const sp = (swat ? 5.2 : 6.0) * clamp(G.cfg.policeAggro, 0.6, 1.5), pref = swat ? 13 : 19;
    let mx = 0, mz = 0;
    if (los && d < (swat ? 60 : 48)) {
      if (d > pref) { mx = dx / d * sp; mz = dz / d * sp; } else if (d < pref - 7 && !(Pl.state === 'foot' && Pl.spd < 1)) { mx = -dx / d * 2.4; mz = -dz / d * 2.4; } else { const t = Math.sin(G.clock * 0.7 + p.id) > 0 ? 1 : -1; mx = -dz / d * 1.6 * t; mz = dx / d * 1.6 * t; }
      p.a += angDiff(p.a, Math.atan2(dz, dx)) * Math.min(1, dt * 12);
      if (p.cool <= 0) { p.cool = swat ? rnd(0.22, 0.5) : rnd(0.7, 1.5); p.aimT = 0.4; shootAt(p, swat); }
    } else { const tx = C.searching ? C.lastSeen.x : Pl.x, tz = C.searching ? C.lastSeen.z : Pl.z, ddx = tx - p.x, ddz = tz - p.z, dd = Math.hypot(ddx, ddz) || 1; if (dd > 3) { mx = ddx / dd * sp; mz = ddz / dd * sp; } }
    p.wx = mx; p.wz = mz;
    // arrest
    const near = d < 2.6 && ((Pl.state === 'foot' && Pl.spd < 3.5) || (Pl.vehicle && Pl.vehicle.speed < 3)); if (near) { C.arrest += dt / Math.max(1, C.cops || 1) * 1.4; } else if (d > 6) C.arrest = Math.max(0, C.arrest - dt * 0.1);
  }
  function shootAt(p, swat) {
    const Pl = G.player, ox = p.x, oy = p.y + 1.4, oz = p.z, tx = Pl.x, ty = (Pl.state === 'vehicle' ? Pl.vehicle.y + 1 : Pl.y + 1.2), tz = Pl.z, dx = tx - ox, dy = ty - oy, dz = tz - oz, d = Math.hypot(dx, dy, dz) || 1;
    const moving = Pl.state === 'vehicle' ? Pl.vehicle.speed > 6 : Pl.spd > 3, acc = clamp(0.62 - d * 0.009, 0.1, 0.6) * (moving ? 0.7 : 1) * clamp(G.cfg.policeAggro, 0.5, 1.5), hit = Math.random() < acc;
    const ex = hit ? tx : tx + rnd(-2.5, 2.5), ez = hit ? tz : tz + rnd(-2.5, 2.5);
    G.fx.tracer({ x: ox + dx / d * 0.8, y: oy, z: oz + dz / d * 0.8 }, { x: ex, y: ty, z: ez }); G.fx.sparks(ox + dx / d, oy, oz + dz / d, 2, 2); if (G.audio) G.audio.shoot(swat ? 'smg' : 'pistol', Math.hypot(G.camera.position.x - ox, G.camera.position.z - oz));
    if (hit) { if (Pl.state === 'vehicle') Pl.vehicle.damage(swat ? 14 : 20, p); else Pl.damage((swat ? 4 : 6) * (G.difficultyMul || 1), p); } else G.fx.dust(ex, 0.3, ez, 1);
  }

  // ---- spawning cruisers
  function spawnCar(swat) {
    const f = G.focus; for (let k = 0; k < 14; k++) {
      const a = rnd(0, TAU), d = rnd(150, 300), x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d, i = Math.round((x - X0) / P), j = Math.round((z - Z0) / P); if (i < 0 || j < 0 || i > NBX || j > NBZ) continue; const dir = Math.floor(Math.random() * 4); if (i + DIRS[dir][0] < 0 || j + DIRS[dir][1] < 0 || i + DIRS[dir][0] > NBX || j + DIRS[dir][1] > NBZ) continue;
      const off = Math.random() < 0.5 ? 1.9 : 4.8, p = laneP(i, j, dir, rnd(14, 70), off); if (!G.world.onRoad(p.x, p.z)) continue; let free = true; for (const v of G.vehicles.list) if ((v.x - p.x) ** 2 + (v.z - p.z) ** 2 < 100) { free = false; break; } if (!free) continue;
      G.camera.getWorldDirection(fw); const dx = p.x - f.x, dz = p.z - f.z, dd = Math.hypot(dx, dz); if (dd < 210 && (dx * fw.x + dz * fw.z) / dd > 0.25) continue;
      const v = G.vehicles.spawn(swat ? 'swat' : 'police', p.x, p.z, 0, { neon: false }); const ai = new CopAI(v, swat ? 'swat' : 'cop'); ai.road.place(i, j, dir, off, rnd(12, 70)); ai.road.cruise = 30; v.ai = ai; v.driver = { npc: true, cop: true }; v.sirenOn = true; C.cars.push({ v, swat }); return v;
    } return null;
  }
  // ---- helicopter
  function makeHeli() {
    const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.4, metalness: 0.7 }), lite = new THREE.MeshBasicMaterial({ color: col('#9fd0ff', 1.5) });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8).scale(1.2, 1, 2), dark); const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 5.5), dark); tail.position.set(0, 0.2, 4.4); const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.8), dark); fin.position.set(0, 0.8, 7);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), dark); mast.position.y = 1.7; const rotor = new THREE.Group(); rotor.position.y = 2.1; for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.35), dark); b.rotation.y = i * Math.PI / 2; rotor.add(b); } const disc = new THREE.Mesh(new THREE.CircleGeometry(5.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x888899, transparent: true, opacity: 0.1, depthWrite: false })); rotor.add(disc);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: col('#ff2020', 4) })); red.position.set(0, 1, 7.1); const blue = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: col('#2040ff', 4) })); blue.position.set(0, -1.3, 0.5);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lite); nose.position.set(0, -0.3, -2.8); g.add(body, tail, fin, mast, rotor, red, blue, nose); g.userData = { rotor, red, blue };
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 1, 20, 1, true).translate(0, -0.5, 0), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, vertexShader: 'varying float vA; void main(){ vA=1.-clamp(position.y/-1.,0.,1.); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying float vA; void main(){ gl_FragColor=vec4(vec3(.8,.9,1.)*.5, vA*.14+.02); }' })); cone.frustumCulled = false; G.scene.add(cone);
    const spot = new THREE.SpotLight(0xdfeaff, 9000, 200, 0.13, 0.55, 2); G.scene.add(spot, spot.target); G.scene.add(g); return { g, cone, spot, rotor, red, blue };
  }
  function spawnHeli() { const f = G.focus, m = makeHeli(); C.heli = { ...m, x: f.x + 140, y: 55, z: f.z + 140, th: rnd(0, TAU), hp: 450, fireT: 1, vy: 0 }; G.hud.notify('Police helicopter inbound'); }
  C.damageHeli = (dmg, src) => { const h = C.heli; if (!h) return; h.hp -= dmg; if (h.hp <= 0) { G.fx.explosion(h.x, h.y, h.z, 12, 200, src); G.scene.remove(h.g, h.cone, h.spot, h.spot.target); C.heli = null; C.crime('killcop', G.player.x, G.player.z); G.hud.notify('Helicopter down'); } };
  function updateHeli(dt) {
    const h = C.heli, Pl = G.player; if (!h) return; h.th += dt * 0.35; const tx = Pl.x + Math.cos(h.th) * 42, tz = Pl.z + Math.sin(h.th) * 42, dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(46, d * 1.2);
    h.x += dx / d * sp * dt; h.z += dz / d * sp * dt; h.y = lerp(h.y, 52 + Math.sin(G.clock * 0.5) * 4, dt); h.g.position.set(h.x, h.y, h.z); h.g.rotation.y = Math.atan2(-(Pl.x - h.x), -(Pl.z - h.z)); h.g.rotation.z = clamp(-dx * 0.01, -0.3, 0.3); h.g.rotation.x = clamp(sp * 0.006, 0, 0.25);
    h.rotor.rotation.y += dt * 40; const ph = Math.floor(G.clock * 4) % 2; h.red.visible = ph === 0; h.blue.visible = ph === 1;
    const ty = Pl.state === 'vehicle' ? Pl.vehicle.y : Pl.y; h.spot.position.set(h.x, h.y - 1, h.z); h.spot.target.position.set(Pl.x, ty, Pl.z); const L = Math.hypot(Pl.x - h.x, ty - h.y, Pl.z - h.z); h.cone.position.set(h.x, h.y - 1, h.z); h.cone.scale.set(1, L, 1); h.cone.lookAt(Pl.x, ty, Pl.z); h.cone.rotateX(Math.PI / 2); h.cone.scale.set(1, L, 1);
    h.cone.visible = h.spot.visible = true; if (C.stars >= 4) { h.fireT -= dt; const los = clear(h.x, h.z, Pl.x, Pl.z, 20) ; if (h.fireT <= 0 && los && L < 110) { h.fireT = rnd(0.35, 0.8); const hit = Math.random() < 0.3; G.fx.tracer({ x: h.x, y: h.y - 1, z: h.z }, { x: Pl.x + (hit ? 0 : rnd(-3, 3)), y: ty + 1, z: Pl.z + (hit ? 0 : rnd(-3, 3)) }); if (G.audio) G.audio.shoot('smg', L); if (hit) { if (Pl.state === 'vehicle') Pl.vehicle.damage(18, null); else Pl.damage(5 * (G.difficultyMul || 1), null); } } }
  }

  // ---- main update
  C.update = (dt) => {
    const Pl = G.player; C.cops = Math.max(1, C.foot().length);
    if (C.stars === 0) { // cooling off: remove leftover units once out of sight
      if (C.heli) { C.heli.y += dt * 8; C.heli.g.position.y = C.heli.y; if (C.heli.y > 140) { G.scene.remove(C.heli.g, C.heli.cone, C.heli.spot, C.heli.spot.target); C.heli = null; } else { C.heli.cone.visible = C.heli.spot.visible = false; } }
      C.cleanT = (C.cleanT || 0) - dt; if (C.cleanT <= 0) { C.cleanT = 1.5; G.camera.getWorldDirection(fw); for (const cv of [...C.cars]) { const v = cv.v; if (!v || v.dead) { C.cars = C.cars.filter(x => x !== cv); continue; } const dx = v.x - Pl.x, dz = v.z - Pl.z, d = Math.hypot(dx, dz); if (d > 160 && (dx * fw.x + dz * fw.z) / d < 0.3) { G.vehicles.remove(v); C.cars = C.cars.filter(x => x !== cv); } } for (const p of C.foot()) { const d = Math.hypot(p.x - Pl.x, p.z - Pl.z); if (d > 90) p.dead = true; } }
      if (G.audio) G.audio.setSiren(0); C.arrest = Math.max(0, C.arrest - dt); return;
    }
    // evasion
    C.seenT -= dt; if (C.seenT <= 0) { C.seenT = 0.3; let seen = false; const px = Pl.x, pz = Pl.z; const cams = C.cars.slice(0, 8); for (const cv of cams) if (cv.v && !cv.v.dead) { const d = Math.hypot(cv.v.x - px, cv.v.z - pz); if (d < 140 && clear(cv.v.x, cv.v.z, px, pz, 1)) { seen = true; break; } } if (!seen) for (const p of C.foot().slice(0, 8)) { if (Math.hypot(p.x - px, p.z - pz) < 120 && clear(p.x, p.z, px, pz)) { seen = true; break; } } if (!seen && C.heli && Math.hypot(C.heli.x - px, C.heli.z - pz) < 130) seen = true; C.seen = seen; }
    if (C.seen) { C.evadeT = 0; C.searching = false; C.lastSeen = { x: Pl.x, z: Pl.z }; } else { C.evadeT += dt; if (C.evadeT > 6) C.searching = true; if (C.evadeT > 14 + C.stars * 6) { C.stars = 0; C.heat = 0; C.searching = false; G.hud.notify('Wanted level lost'); G.hud.big('WANTED LEVEL LOST', '#7dff9a'); C.releaseAll(); return; } }
    // arrest meter
    if (C.arrest > 2.6 && Pl.state !== 'dead' && Pl.state !== 'busted') { C.arrest = 0; Pl.bust(); } if (Pl.state === 'busted' || Pl.state === 'dead') C.arrest = 0;
    // maintain unit count
    C.cars = C.cars.filter(cv => cv.v && !cv.v.dead && G.vehicles.list.includes(cv.v)); const aggro = clamp(G.cfg.policeAggro, 0.3, 2), wantCars = Math.round(CARS[C.stars] * aggro), wantSwat = Math.round(SWAT[C.stars] * Math.min(aggro, 1.5)), nSwat = C.cars.filter(c => c.swat).length, nCop = C.cars.length - nSwat;
    C.spawnT -= dt; if (C.spawnT <= 0) { C.spawnT = 1.4; if (nSwat < wantSwat) spawnCar(true); else if (nCop < wantCars) spawnCar(false); }
    // cruisers that fell far behind get recycled
    for (const cv of C.cars) { const v = cv.v, d = Math.hypot(v.x - Pl.x, v.z - Pl.z); if (d > 420) { G.vehicles.remove(v); } }
    if (C.stars >= 3 && !C.heli) spawnHeli(); if (C.stars < 3 && C.heli) { C.heli.y += dt * 6; }
    updateHeli(dt);
    // siren audio from the nearest unit
    if (G.audio) { let near = 1e9; for (const cv of C.cars) near = Math.min(near, Math.hypot(cv.v.x - Pl.x, cv.v.z - Pl.z)); G.audio.setSiren(near < 220 ? 1 - near / 220 : 0); }
  };
  return C;
}
