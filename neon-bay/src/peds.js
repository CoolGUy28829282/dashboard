// Pedestrians: instanced humanoids walking the sidewalk graph, panicking, dying; carjack ejections; hit detection.
import * as THREE from 'three';
import { PART, RIG, pose } from './char.js';
import { P as PITCH, NBX, NBZ, X0, Z0, X1, BEACH, blockCenter, districtOf } from './world.js';
import { rnd, pick, clamp, lerp, angDiff, meshYaw, TAU } from './util.js';

const CORNER = [[-37, -37], [37, -37], [37, 37], [-37, 37]];
const SHIRTS = ['#ff9ec8', '#8fe8e0', '#fff3a8', '#ffffff', '#ff6a7a', '#7fd0ff', '#b8f5c0', '#ffb04a', '#c9a0ff', '#22e6ff', '#ff2d95', '#222233', '#eaeaea', '#f2d0a0'];
const PANTS = ['#f4f0e6', '#d8c9a0', '#2a3552', '#1b1b24', '#4a5a7a', '#ff9ec8', '#8fe8e0', '#39394a'];
const SKINS = ['#f1c8a5', '#e0ac82', '#c58c6a', '#9a6a48', '#6e4a32', '#4a3022'];
const MAXP = 280;

function nodePos(n) { const c = blockCenter(n.bx, n.bz); return { x: c.x + CORNER[n.c][0], z: c.z + CORNER[n.c][1] }; }
function neighbors(n) {
  const { bx, bz, c } = n, out = [], ok = (x, z) => x >= 0 && z >= 0 && x < NBX && z < NBZ, add = (x, z, cc, cross) => { if (ok(x, z)) out.push({ bx: x, bz: z, c: cc, cross }); };
  add(bx, bz, (c + 1) % 4, false); add(bx, bz, (c + 3) % 4, false);
  if (c === 0) { add(bx - 1, bz, 1, true); add(bx, bz - 1, 3, true); } else if (c === 1) { add(bx + 1, bz, 0, true); add(bx, bz - 1, 2, true); } else if (c === 2) { add(bx + 1, bz, 3, true); add(bx, bz + 1, 1, true); } else { add(bx - 1, bz, 2, true); add(bx, bz + 1, 0, true); }
  return out;
}

export function createPeds(G) {
  const scene = G.scene, PM = { list: [], nextId: 1 };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const mk = (geo) => { const m = new THREE.InstancedMesh(geo, mat, MAXP); m.frustumCulled = false; m.castShadow = true; m.count = 0; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3); scene.add(m); return m; };
  const mesh = { head: mk(PART.head), torso: mk(PART.torso), armL: mk(PART.arm), armR: mk(PART.arm), legL: mk(PART.leg), legR: mk(PART.leg) };
  const shadowBlob = null; void shadowBlob;
  const R = new THREE.Matrix4(), L = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color(), pp = {};
  const parts = [['legL', -RIG.legX, RIG.hipY], ['legR', RIG.legX, RIG.hipY], ['armL', -RIG.armX, RIG.shoulderY], ['armR', RIG.armX, RIG.shoulderY]];

  function spawn(x, z, role = 'civ', opts = {}) {
    if (PM.list.length >= MAXP) return null; const skin = pick(SKINS), shirt = opts.shirt || pick(SHIRTS), pants = opts.pants || pick(PANTS);
    const ped = { id: PM.nextId++, x, z, y: G.world.groundY(x, z), a: rnd(0, TAU), hp: role === 'civ' ? 45 : 100, role, state: 'walk', spd: 0, phase: rnd(0, 6), skin: new THREE.Color(skin), shirt: new THREE.Color(shirt), pants: new THREE.Color(pants), armsBare: Math.random() < 0.6, wx: 0, wz: 0, fleeT: 0, t: 0, deadT: 0, vx: 0, vy: 0, vz: 0, node: null, to: null, prog: 0, off: rnd(0.8, 2.2), walkSpd: rnd(1.1, 1.7), run: Math.random() < 0.08, cash: Math.floor(rnd(15, 120)), oblivious: Math.random() < 0.4, ai: null, wander: null, scale: 1 };
    if (role === 'cop') { ped.shirt = new THREE.Color('#1f3a7a'); ped.pants = new THREE.Color('#14203a'); ped.armsBare = false; ped.walkSpd = 1.5; ped.hp = 100; }
    if (role === 'swat') { ped.shirt = new THREE.Color('#111218'); ped.pants = new THREE.Color('#0c0c10'); ped.armsBare = false; ped.hp = 220; }
    Object.assign(ped, opts.fields || {}); PM.list.push(ped); return ped;
  }
  PM.spawn = spawn;
  const randNode = (cx, cz, rmin, rmax) => { for (let k = 0; k < 14; k++) { const a = rnd(0, TAU), d = rnd(rmin, rmax), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, bx = Math.floor((x - X0) / PITCH), bz = Math.floor((z - Z0) / PITCH); if (bx < 0 || bz < 0 || bx >= NBX || bz >= NBZ) continue; return { bx, bz, c: Math.floor(Math.random() * 4) }; } return null; };
  function placeOnGraph(ped, n) { const nb = neighbors(n); const to = pick(nb); ped.node = n; ped.to = to; ped.prog = Math.random(); const a = nodePos(n), b = nodePos(to); ped.x = lerp(a.x, b.x, ped.prog); ped.z = lerp(a.z, b.z, ped.prog); ped.y = G.world.groundY(ped.x, ped.z); }
  function spawnWalker(cx, cz, rmin, rmax) {
    const n = randNode(cx, cz, rmin, rmax); if (!n) return null; const d = districtOf(n.bx, n.bz); if (d === 'port' && Math.random() < 0.6) return null; const ped = spawn(0, 0, 'civ'); if (!ped) return null; placeOnGraph(ped, n); return ped;
  }
  function spawnBeach(cx, cz) {
    const x = X1 + 14 + Math.random() * 95, z = cz + rnd(-160, 160); if (Math.abs(x - cx) > 190) return null; const swim = ['#ff2d95', '#22e6ff', '#ffb02e', '#8cff5a', '#ffffff', '#ff6a3c'], ped = spawn(x, z, 'civ', { shirt: pick(swim), pants: pick(swim) }); if (!ped) return null; ped.armsBare = true; ped.wander = { x: x, z: z }; ped.state = 'wander'; ped.walkSpd = rnd(0.9, 1.4); return ped;
  }
  PM.prime = () => { for (const p of PM.list) if (p.role === 'civ') p.dead = true; PM.list = PM.list.filter(p => !p.dead); const f = G.focus, n = Math.round(110 * G.cfg.peds); for (let i = 0; i < n; i++) spawnWalker(f.x, f.z, 15, 160); if (f.x > X1 - 200) for (let i = 0; i < 24 * G.cfg.peds; i++) spawnBeach(f.x, f.z); };
  PM.count = () => PM.list.length;

  // ---- damage & reactions
  function kill(ped, src, head, dir) {
    if (ped.state === 'dead') return; ped.state = 'dead'; ped.hp = 0; ped.deadT = 28; ped.ai = null; const d = dir || { x: 0, z: 0 }; ped.vx = (d.x || 0) * 3; ped.vz = (d.z || 0) * 3; ped.vy = 2.5; ped.killer = src;
    if (src === 'player' || src === G.player) { G.player.kills++; if (ped.role === 'civ') { G.player.cash += ped.cash; G.fx.floatText('+$' + ped.cash, ped.x, ped.y + 1.9, ped.z); } G.police && G.police.crime(ped.role === 'civ' ? 'kill' : 'killcop', ped.x, ped.z, ped); if (ped.role !== 'civ') G.police && G.police.onCopKilled && G.police.onCopKilled(ped); G.hud.notify(head ? 'Headshot' : (ped.role === 'civ' ? 'Pedestrian killed' : 'Officer down')); }
    G.fx.blood(ped.x, ped.y + 1, ped.z, 8); PM.alert(ped.x, ped.z, 25, 'death');
  }
  PM.damage = (ped, dmg, src, head, dir) => { if (ped.state === 'dead') return; ped.hp -= dmg; if (ped.hp <= 0) kill(ped, src, head, dir); else if (ped.role === 'civ') { ped.state = 'flee'; ped.fleeT = rnd(7, 12); ped.fx = (ped.x - G.player.x); ped.fz = (ped.z - G.player.z); } else if (ped.onHit) ped.onHit(src); };
  PM.explosionDamage = (x, z, r, dmg, owner) => { for (const p of PM.list) { if (p.state === 'dead') continue; const d = Math.hypot(p.x - x, p.z - z); if (d < r + 1) { const f = clamp(1 - d / (r + 1), 0.1, 1); PM.damage(p, dmg * f * 1.4, owner, false, { x: (p.x - x) / (d + 0.1), z: (p.z - z) / (d + 0.1) }); } } };
  PM.melee = (x, z, r, dmg, src, fx, fz) => { for (const p of PM.list) { if (p.state === 'dead') continue; if (Math.hypot(p.x - x, p.z - z) < r + 0.4) { PM.damage(p, dmg, 'player', false, { x: fx, z: fz }); p.x += fx * 0.4; p.z += fz * 0.4; if (p.role === 'civ' && p.state !== 'dead') { p.state = 'flee'; p.fleeT = 8; p.fx = fx; p.fz = fz; } if (G.police) G.police.crime('assault', p.x, p.z, p); G.fx.blood(p.x, p.y + 1.3, p.z, 3); break; } } };
  PM.alert = (x, z, r, kind) => { for (const p of PM.list) { if (p.state === 'dead' || p.role !== 'civ') continue; const d = Math.hypot(p.x - x, p.z - z); if (d < r && (kind !== 'gun' || d < r)) { p.state = 'flee'; p.fleeT = rnd(6, 11) * (1 - d / (r * 1.5)) + 3; p.fx = p.x - x; p.fz = p.z - z; } } };
  PM.onVehicleShot = (v, src) => { PM.alert(v.x, v.z, 30, 'gun'); };
  PM.rayTest = (ox, oy, oz, dx, dy, dz, maxT, ignore) => {
    let best = null; const f = (a, b) => a * a + b * b;
    for (const p of PM.list) {
      if (p === ignore) continue; const mx = p.x - ox, mz = p.z - oz; if (f(mx, mz) > (maxT + 2) * (maxT + 2)) continue; const a = f(dx, dz); if (a < 1e-9) continue; const tca = (mx * dx + mz * dz) / a; if (tca < 0 || tca > maxT) continue; const cx = ox + dx * tca - p.x, cz = oz + dz * tca - p.z, d2 = f(cx, cz), r = 0.42; if (d2 > r * r) continue; const t = tca - Math.sqrt(r * r - d2) / Math.sqrt(a); const y = oy + dy * Math.max(t, 0) - p.y, hgt = p.state === 'dead' ? 0.5 : 1.8; if (y < -0.1 || y > hgt) continue; if (!best || t < best.t) best = { t: Math.max(t, 0), ped: p, head: p.state !== 'dead' && y > 1.45 };
    }
    return best;
  };
  PM.ejectDriver = (v) => {
    const c = Math.cos(v.a), s = Math.sin(v.a), x = v.x - (-s) * (v.st.W / 2 + 0.9), z = v.z - c * (v.st.W / 2 + 0.9), isCop = v.police, ped = spawn(x, z, isCop ? 'cop' : 'civ'); v.driver = null; v.ai = null;
    if (ped) { ped.state = isCop ? 'walk' : 'flee'; ped.fleeT = 12; ped.fx = ped.x - G.player.x; ped.fz = ped.z - G.player.z; ped.vxk = 0; if (isCop) { ped.ai = null; G.police && G.police.adoptCop && G.police.adoptCop(ped); } }
    G.fx.blood && 0;
  };
  PM.nearest = (x, z, maxD, filter) => { let best = null, bd = maxD * maxD; for (const p of PM.list) { if (filter && !filter(p)) continue; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } } return best; };

  // ---- update
  const tmp = {};
  PM.update = (dt) => {
    const f = G.focus, list = PM.list; PM.t = (PM.t || 0) + dt;
    // spawning / despawning
    PM.spawnT = (PM.spawnT || 0) - dt; const civ = list.filter(p => p.role === 'civ').length, target = Math.round(110 * G.cfg.peds);
    if (PM.spawnT <= 0 && civ < target) { PM.spawnT = 0.08; const nearBeach = f.x > X1 - 220 && Math.random() < 0.3; const p = nearBeach ? spawnBeach(f.x, f.z) : spawnWalker(f.x, f.z, 70, 180); if (p) { const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz); const cam = G.camera, fw = new THREE.Vector3(); cam.getWorldDirection(fw); if (d < 130 && (dx * fw.x + dz * fw.z) / d > 0.35) { p.dead = true; } } }
    for (let i = list.length - 1; i >= 0; i--) { const p = list[i]; if (p.dead || (p.role === 'civ' && !p.keep && Math.hypot(p.x - f.x, p.z - f.z) > 230) || (p.state === 'dead' && p.deadT <= 0)) { list.splice(i, 1); } }
    const car = G.vehicles.list;
    for (const p of list) {
      if (p.state === 'dead') { p.deadT -= dt; p.vy -= 18 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; const gy = G.world.groundY(p.x, p.z); if (p.y < gy) { p.y = gy; p.vy = 0; p.vx *= Math.exp(-6 * dt); p.vz *= Math.exp(-6 * dt); } p.spd = 0; continue; }
      p.t += dt; let wx = 0, wz = 0, top = p.walkSpd;
      if (p.ai) { p.ai(p, dt); wx = p.wx; wz = p.wz; top = Math.hypot(wx, wz); }
      else if (p.state === 'flee') { p.fleeT -= dt; const L = Math.hypot(p.fx, p.fz) || 1; wx = p.fx / L; wz = p.fz / L; top = 5.6; wx *= top; wz *= top; if (p.fleeT <= 0) { p.state = p.wander ? 'wander' : 'walk'; if (!p.wander) { const n = randNode(p.x, p.z, 0, 30); if (n) placeOnGraph(p, n); } } }
      else if (p.state === 'wander') { const w = p.wander; if (Math.hypot(w.x - p.x, w.z - p.z) < 1.5 || Math.random() < dt * 0.02) { w.x = clamp(p.x + rnd(-40, 40), X1 + 12, X1 + 110); w.z = p.z + rnd(-40, 40); } const dx = w.x - p.x, dz = w.z - p.z, L = Math.hypot(dx, dz) || 1; wx = dx / L * p.walkSpd; wz = dz / L * p.walkSpd; }
      else { // walk the sidewalk graph
        const a = nodePos(p.node), b = nodePos(p.to), len = Math.hypot(b.x - a.x, b.z - a.z), sp = p.walkSpd * (p.to.cross ? 1.25 : 1) * (p.run ? 2.4 : 1); p.prog += sp * dt / len;
        const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, ox = -dz * p.off * (p.to.cross ? 0 : 1), oz = dx * p.off * (p.to.cross ? 0 : 1); const nx = lerp(a.x, b.x, p.prog) + ox, nz = lerp(a.z, b.z, p.prog) + oz; wx = (nx - p.x) / Math.max(dt, 1e-3); wz = (nz - p.z) / Math.max(dt, 1e-3); const lim = sp * 3; const wl = Math.hypot(wx, wz); if (wl > lim) { wx *= lim / wl; wz *= lim / wl; } top = sp;
        if (p.prog >= 1) { const nb = neighbors(p.to), prev = p.node; let opts = nb.filter(n => !(n.bx === prev.bx && n.bz === prev.bz && n.c === prev.c)); if (!opts.length) opts = nb; p.node = p.to; p.to = pick(opts); p.prog = 0; p.off = rnd(0.8, 2.2) * (Math.random() < 0.5 ? 1 : -1); }
      }
      // dodge nearby fast vehicles
      if (p.state !== 'flee' && !p.ai && !p.oblivious) for (const v of car) { const dx = p.x - v.x, dz = p.z - v.z, d2 = dx * dx + dz * dz; if (d2 > 144) continue; const sp = v.speed; if (sp > 5) { const rel = (v.vx * dx + v.vz * dz); if (rel > 0) { p.state = 'flee'; p.fleeT = 3; p.fx = -v.vz * Math.sign(dx * -v.vz + dz * v.vx || 1); p.fz = v.vx * Math.sign(dx * -v.vz + dz * v.vx || 1); if (sp > 14 && v.driver !== G.player && Math.random() < 0.02) PM.alert(p.x, p.z, 18, 'car'); } } }
      // move + collide with buildings when near the player
      const nxp = p.x + wx * dt, nzp = p.z + wz * dt; p.spd = lerp(p.spd, Math.hypot(wx, wz), Math.min(1, dt * 8));
      if (Math.hypot(wx, wz) > 0.05) { const want = Math.atan2(wz, wx); p.a += angDiff(p.a, want) * Math.min(1, dt * 10); }
      p.x = nxp; p.z = nzp; if (p.state === 'flee' || p.ai) { if (G.world.collideCircle(p.x, p.z, 0.4, tmp)) { p.x += tmp.nx * tmp.depth; p.z += tmp.nz * tmp.depth; } }
      p.y = lerp(p.y, G.world.groundY(p.x, p.z), Math.min(1, dt * 12)); p.phase += p.spd * dt * 2.3;
      // run-over check
      for (const v of car) { const sp = v.speed; if (sp < 2.4 || v.parked && sp < 1) continue; const ddx = v.x - p.x, ddz = v.z - p.z; if (ddx * ddx + ddz * ddz > 30) continue; for (const [cx, cz, r] of v.circles()) { if ((cx - p.x) ** 2 + (cz - p.z) ** 2 < (r + 0.35) ** 2) { const src = v.driver === G.player ? 'player' : v.driver; p.vx = v.vx * 0.9 + rnd(-1, 1); p.vz = v.vz * 0.9 + rnd(-1, 1); p.vy = 3 + sp * 0.12; if (p.role === 'civ' || true) { p.hp -= sp * 14; if (p.hp <= 0) { kill(p, src === 'player' ? 'player' : null, false, { x: v.vx / (sp || 1), z: v.vz / (sp || 1) }); if (src === 'player') G.police && G.police.crime('runover', p.x, p.z, p); } else { p.state = 'flee'; p.fleeT = 6; p.fx = v.vx; p.fz = v.vz; } } if (src === 'player') G.police && G.police.crime('hitped', p.x, p.z, p); v.damage(3, null); PM.alert(p.x, p.z, 22, 'car'); G.fx.blood(p.x, p.y + 1, p.z, 4); break; } } }
    }
    // render instances
    let k = 0; const cp = G.camera.position;
    for (const p of list) {
      const dx = p.x - cp.x, dz = p.z - cp.z; if (dx * dx + dz * dz > 260 * 260) continue; if (k >= MAXP) break;
      pose(pp, p.phase, p.spd, 0); const dead = p.state === 'dead';
      p.y = p.y || 0; const lie = dead ? 1 : 0; e.set(dead ? -Math.PI / 2 : -pp.lean, meshYaw(p.a), 0, 'YXZ'); q.setFromEuler(e); p.x !== undefined && R.compose(p.v3 || (p.v3 = new THREE.Vector3()), q, one); R.setPosition(p.x, p.y + (dead ? 0.17 : pp.bob), p.z);
      const set = (name, px, py, pz, rx, color) => { e.set(rx, 0, 0); q.setFromEuler(e); L.compose(p_set(px, py, pz), q, one); L.premultiply(R); mesh[name].setMatrixAt(k, L); mesh[name].setColorAt(k, color); };
      const sk = p.skin, shirtC = p.shirt, pantsC = p.pants, armC = p.armsBare ? sk : shirtC;
      set('torso', 0, RIG.torsoY, 0, 0, shirtC); set('head', 0, RIG.headY, 0, 0, sk);
      set('legL', -RIG.legX, RIG.hipY, 0, lie ? 0.2 : pp.legL, pantsC); set('legR', RIG.legX, RIG.hipY, 0, lie ? -0.15 : pp.legR, pantsC);
      const aimed = p.aimT > 0; set('armL', -RIG.armX, RIG.shoulderY, 0, lie ? -0.3 : (aimed ? 1.2 : pp.armL), armC); set('armR', RIG.armX, RIG.shoulderY, 0, lie ? 0.4 : (aimed ? 1.52 : pp.armR), armC);
      k++;
    }
    for (const m of Object.values(mesh)) { m.count = k; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  };
  const _pv = new THREE.Vector3(); const p_set = (x, y, z) => _pv.set(x, y, z);
  PM.foot = () => PM.list.filter(p => p.role !== 'civ' && p.state !== 'dead');
  return PM;
}
