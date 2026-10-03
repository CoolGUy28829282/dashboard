// Jobs: courier runs, hot-car thefts and contract hits, started at glowing yellow markers.
import * as THREE from 'three';
import { clamp, rnd, pick, col } from './util.js';
import { lineX, lineZ, blockCenter, NBX, NBZ, X0, Z0, P } from './world.js';

const TYPES = { courier: { name: 'Courier run', blurb: 'Pick up a package and deliver it on time', color: '#ffd24a' }, hotcar: { name: 'Hot car', blurb: 'Steal a car and deliver it to the harbor garage', color: '#ff8a3c' }, hit: { name: 'Contract hit', blurb: 'Eliminate the marked target', color: '#ff3a5a' } };

export function createMissions(G) {
  const M = { active: null, hubs: [], done: 0, beams: [] }, W = G.world;
  const mkBeam = (hex) => { const g = new THREE.Group(), c = new THREE.Color(hex); const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.3), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.y = 30; const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5), fog: false })); ring.position.y = 0.5; const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3), fog: false })); core.position.y = 1.6; g.add(beam, ring, core); g.userData = { core, ring }; G.scene.add(g); return g; };
  const s = W.spawns, hubDefs = [['courier', s.beach.x - 22, s.beach.z + 40], ['hotcar', s.downtown.x + 6, s.downtown.z], ['hit', s.neon.x, s.neon.z + 6], ['courier', s.arts.x, s.arts.z], ['hotcar', s.port.x + 2, s.port.z - 4], ['hit', lineX(7) + 10, lineZ(3) + 10], ['courier', lineX(15) + 10, lineZ(13) + 10]];
  for (const [type, x, z] of hubDefs) { const g = mkBeam(TYPES[type].color); g.position.set(x, W.groundY(x, z), z); M.hubs.push({ type, x, z, g }); }
  const objBeam = mkBeam('#22e6ff'); objBeam.visible = false;
  const randPoint = (minD, maxD) => { const P0 = G.player; for (let k = 0; k < 40; k++) { const a = rnd(0, 6.283), d = rnd(minD, maxD), x = P0.x + Math.cos(a) * d, z = P0.z + Math.sin(a) * d, bx = Math.floor((x - X0) / P), bz = Math.floor((z - Z0) / P); if (bx < 1 || bz < 1 || bx >= NBX - 1 || bz >= NBZ - 1) continue; const c = blockCenter(bx, bz); return { x: c.x + 37 * (Math.random() < 0.5 ? 1 : -1), z: c.z + 37 * (Math.random() < 0.5 ? 1 : -1) }; } return { x: P0.x + 300, z: P0.z }; };
  M.nearHub = () => { const P0 = G.player; if (M.active || P0.state === 'dead') return null; for (const h of M.hubs) if (Math.hypot(h.x - P0.x, h.z - P0.z) < 5.5 && (P0.state === 'foot' || P0.vehicle && P0.vehicle.speed < 4)) return h; return null; };
  G.promptExtra = () => { const h = M.nearHub(); return h ? `<kbd>F</kbd> ${TYPES[h.type].name} — ${TYPES[h.type].blurb}` : ''; };
  G.onInteract = () => { const h = M.nearHub(); if (h) M.start(h.type); };
  M.start = (type) => {
    const P0 = G.player, t = TYPES[type]; M.active = { type, name: t.name, stage: 0, time: 0, limit: 0, objs: [], reward: 0 }; const A = M.active;
    if (type === 'courier') { const a = randPoint(350, 700), b = randPoint(500, 900), dist = Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(a.x - P0.x, a.z - P0.z); A.objs = [{ x: a.x, z: a.z, text: 'Pick up the package', r: 6 }, { x: b.x, z: b.z, text: 'Deliver the package', r: 6 }]; A.limit = dist / 13 + 50; A.reward = Math.round(400 + dist * 0.45); }
    else if (type === 'hotcar') { const a = randPoint(300, 600), car = pick(['super', 'coupe', 'suv', 'hover']), v = G.vehicles.spawn(car, a.x, a.z, rnd(0, 6.28), { neon: true }); v.parked = true; v.stolen = false; v.target = true; A.car = v; A.objs = [{ x: a.x, z: a.z, text: `Steal the ${v.name}`, r: 0, car: v }, { x: s.port.x, z: s.port.z, text: 'Deliver the car to the harbor garage', r: 9 }]; A.limit = 210; A.reward = 1400; }
    else { const a = randPoint(250, 500), ped = G.peds.spawn(a.x, a.z, 'civ', { shirt: '#ff2d95', pants: '#101018' }); if (ped) { ped.keep = true; ped.hp = 120; ped.isTarget = true; const nodes = null; void nodes; ped.state = 'wander'; ped.wander = { x: a.x, z: a.z }; ped.walkSpd = 1.6; } A.ped = ped; A.objs = [{ x: a.x, z: a.z, text: 'Eliminate the target', r: 0, ped }]; A.limit = 240; A.reward = 1800; }
    G.hud.big(t.name.toUpperCase(), t.color, A.objs[0].text); objBeam.visible = true;
  };
  M.fail = (why) => { if (!M.active) return; G.hud.big('MISSION FAILED', '#ff5a6e', why || ''); cleanup(); };
  M.complete = () => { const A = M.active; if (!A) return; G.player.cash += A.reward; M.done++; G.hud.big('MISSION PASSED', '#7dff9a', '+$' + A.reward.toLocaleString('en-US')); G.fx.floatText('+$' + A.reward, G.player.x, G.player.y + 2, G.player.z, '#7dff9a'); cleanup(); };
  function cleanup() { const A = M.active; if (A) { if (A.car && A.car.target) { A.car.target = false; } if (A.ped) { A.ped.keep = false; A.ped.isTarget = false; } } M.active = null; objBeam.visible = false; }
  M.onEnter = (v) => { const A = M.active; if (A && A.type === 'hotcar' && A.stage === 0 && v === A.car) { A.stage = 1; A.time = 0; G.hud.notify('Got the car — take it to the garage'); } };
  M.onExit = (v) => {};
  M.markers = (all) => { if (M.active) { const o = M.active.objs[M.active.stage]; const p = objPos(o); return p ? [{ x: p.x, z: p.z, color: '#22e6ff', r: 6 }] : []; } return M.hubs.map(h => ({ x: h.x, z: h.z, color: TYPES[h.type].color, r: 6 })); };
  function objPos(o) { if (!o) return null; if (o.car) return { x: o.car.x, z: o.car.z }; if (o.ped) return o.ped.state === 'dead' ? null : { x: o.ped.x, z: o.ped.z }; return o; }
  M.hudText = () => { const A = M.active; if (!A) return ''; const o = A.objs[A.stage]; const left = Math.max(0, A.limit - (A.type === 'hotcar' ? A.time : A.time)); const m = Math.floor(left / 60), sec = String(Math.floor(left % 60)).padStart(2, '0'); return `<small>${A.name}</small>${o ? o.text : ''} — ${m}:${sec}`; };
  M.update = (dt) => {
    const t = G.clock; for (const h of M.hubs) { const d = Math.hypot(h.x - G.player.x, h.z - G.player.z); h.g.visible = !M.active && d < 700; h.g.userData.core.rotation.y = t * 2; h.g.userData.core.position.y = 1.6 + Math.sin(t * 2) * 0.2; h.g.userData.ring.rotation.y = t; }
    const A = M.active; if (!A) return; A.time += dt; const Pl = G.player; if (A.time > A.limit) { M.fail('Out of time'); return; }
    const o = A.objs[A.stage], pos = objPos(o); if (!pos) { if (A.type === 'hit' && A.ped && A.ped.state === 'dead') { M.complete(); } return; }
    objBeam.visible = true; objBeam.position.set(pos.x, G.world.groundY(pos.x, pos.z), pos.z); objBeam.userData.core.rotation.y = t * 3;
    if (A.type === 'hit') { if (!A.ped || A.ped.state === 'dead') { M.complete(); return; } if (A.ped.state === 'flee') A.ped.fleeT = Math.max(A.ped.fleeT, 3); }
    else if (A.type === 'hotcar') { if (A.stage === 0) { if (A.car.exploded) { M.fail('The car was destroyed'); return; } } else { if (A.car.exploded || Pl.vehicle !== A.car && A.time > 3 && Math.hypot(A.car.x - Pl.x, A.car.z - Pl.z) > 30) { if (A.car.exploded) M.fail('The car was destroyed'); else if (Pl.vehicle !== A.car && Math.hypot(A.car.x - Pl.x, A.car.z - Pl.z) > 60) M.fail('You abandoned the car'); } if (M.active && Pl.vehicle === A.car && Math.hypot(pos.x - Pl.x, pos.z - Pl.z) < o.r) M.complete(); } }
    else { const px = Pl.x, pz = Pl.z; if (Math.hypot(pos.x - px, pos.z - pz) < o.r + 2) { A.stage++; if (A.stage >= A.objs.length) M.complete(); else { G.hud.notify('Package collected'); const nx = A.objs[A.stage]; G.hud.big('PICKED UP', '#22e6ff', nx.text); } } }
  };
  return M;
}
