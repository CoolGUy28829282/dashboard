// Weapons, hitscan, rockets and area damage.
import * as THREE from 'three';
import { clamp, rnd, col } from './util.js';

export const WEAPONS = [
  { id: 'fists', name: 'Fists', melee: true, dmg: 16, rate: 0.42, range: 1.9, mag: 0, maxAmmo: 0 },
  { id: 'pistol', name: 'Pistol', dmg: 26, mag: 12, rate: 0.2, spread: 0.008, auto: false, range: 130, reload: 1.1, maxAmmo: 180, snd: 'pistol' },
  { id: 'smg', name: 'Micro SMG', dmg: 13, mag: 30, rate: 0.075, spread: 0.03, auto: true, range: 95, reload: 1.5, maxAmmo: 360, snd: 'smg' },
  { id: 'shotgun', name: 'Pump Shotgun', dmg: 12, pellets: 8, mag: 6, rate: 0.85, spread: 0.075, range: 48, reload: 2.0, maxAmmo: 60, snd: 'shotgun' },
  { id: 'rpg', name: 'Rocket Launcher', mag: 1, rate: 1.3, reload: 2.3, maxAmmo: 12, rocket: true, snd: 'rpg', range: 400 },
];
export const weaponIndex = id => WEAPONS.findIndex(w => w.id === id);

const A = { t: 0 };
function rayCircle(ox, oz, dx, dz, cx, cz, r) { const fx = ox - cx, fz = oz - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r, disc = b * b - 4 * a * c; if (disc < 0 || a < 1e-9) return Infinity; const s = Math.sqrt(disc), t = (-b - s) / (2 * a); return t >= 0 ? t : ((-b + s) / (2 * a) >= 0 ? 0 : Infinity); }

// ray from o along normalized d; returns nearest of buildings / vehicles / peds / ground
export function hitscan(G, ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
  const res = { t: maxT, type: 'none', v: null, ped: null, head: false, x: ox + dx * maxT, y: oy + dy * maxT, z: oz + dz * maxT };
  const tb = G.world.rayHitsBuilding(ox, oz, dx, dz, maxT, oy, dy); if (tb < res.t) { res.t = tb; res.type = 'building'; }
  if (dy < -1e-4) { const tg = (0.25 - oy) / dy; if (tg > 0 && tg < res.t) { res.t = tg; res.type = 'ground'; } }
  for (const v of G.vehicles.list) {
    if (v === opts.ignoreVehicle || v.exploded && false) continue; const mx = v.x - ox, mz = v.z - oz; if (mx * mx + mz * mz > (res.t + 6) * (res.t + 6)) continue;
    for (const [cx, cz, r] of v.circles()) { const t = rayCircle(ox, oz, dx, dz, cx, cz, r + 0.15); if (t < res.t) { const y = oy + dy * t; if (y >= v.y - 0.1 && y <= v.y + 1.75 + v.hover) { res.t = t; res.type = 'vehicle'; res.v = v; } } }
  }
  if (G.peds) { const h = G.peds.rayTest(ox, oy, oz, dx, dy, dz, res.t, opts.ignorePed); if (h && h.t < res.t) { res.t = h.t; res.type = 'ped'; res.ped = h.ped; res.head = h.head; } }
  if (G.police && G.police.heli) { const h = G.police.heli, mx = h.x - ox, my = h.y - oy, mz = h.z - oz, tca = mx * dx + my * dy + mz * dz; if (tca > 0 && tca < res.t) { const d2 = mx * mx + my * my + mz * mz - tca * tca; if (d2 < 16) { res.t = Math.max(0, tca - Math.sqrt(16 - d2)); res.type = 'heli'; } } }
  if (G.player && !opts.ignorePlayer && G.player.state === 'foot') { const p = G.player, t = rayCircle(ox, oz, dx, dz, p.x, p.z, 0.45); if (t < res.t) { const y = oy + dy * t - p.y; if (y > 0 && y < 1.8) { res.t = t; res.type = 'player'; } } }
  res.x = ox + dx * res.t; res.y = oy + dy * res.t; res.z = oz + dz * res.t; return res;
}

export function createCombat(G) {
  const C = { rockets: [], lastShot: 0 };
  const rocketGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshStandardMaterial({ color: 0x555a50, metalness: 0.6, roughness: 0.5 });
  C.fireRocket = (ox, oy, oz, dx, dy, dz, owner) => { const m = new THREE.Mesh(rocketGeo, rocketMat); m.position.set(ox, oy, oz); m.lookAt(ox + dx, oy + dy, oz + dz); G.scene.add(m); C.rockets.push({ m, x: ox, y: oy, z: oz, dx, dy, dz, sp: 62, life: 5, owner }); G.fx.flash(ox, oy, oz, 300); };
  // apply a bullet's damage to whatever was hit. shooter: 'player' | ped | vehicle driver
  C.applyHit = (h, dmg, shooter, dir) => {
    if (h.type === 'ped') { G.peds.damage(h.ped, dmg * (h.head ? 3 : 1), shooter, h.head, dir); G.fx.blood(h.x, h.y, h.z, 5); }
    else if (h.type === 'vehicle') { h.v.damage(dmg * 1.1, shooter); G.fx.sparks(h.x, h.y, h.z, 5, 4); if (h.v.driver && h.v.driver !== G.player && G.peds && G.peds.onVehicleShot) G.peds.onVehicleShot(h.v, shooter); }
    else if (h.type === 'heli') { G.police.damageHeli(dmg * 1.3, shooter); G.fx.sparks(h.x, h.y, h.z, 4, 5); }
    else if (h.type === 'player') { G.player.damage(dmg * 0.5 * (G.difficultyMul || 1), shooter); G.fx.blood(h.x, h.y, h.z, 4); }
    else if (h.type === 'building' || h.type === 'ground') { G.fx.sparks(h.x, h.y, h.z, 4, 3); G.fx.dust(h.x, h.y, h.z, 2, 0.6); }
  };
  C.update = dt => {
    for (let i = C.rockets.length - 1; i >= 0; i--) {
      const r = C.rockets[i], step = r.sp * dt; r.life -= dt; const h = hitscan(G, r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.4, { ignorePlayer: r.owner === 'player', ignoreVehicle: r.owner && r.owner.vehicle });
      G.fx.smoke(r.x, r.y, r.z, 1, 0.5, 0.8); G.fx.fire(r.x, r.y, r.z, 1, 0.5);
      if (h.type !== 'none' || r.life <= 0 || r.y < 0.2) { G.scene.remove(r.m); C.rockets.splice(i, 1); G.fx.explosion(h.type !== 'none' ? h.x : r.x, Math.max(h.type !== 'none' ? h.y : r.y, 0.5), h.type !== 'none' ? h.z : r.z, 10, 260, r.owner); continue; }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step; r.m.position.set(r.x, r.y, r.z);
    }
  };
  G.damageArea = (x, z, radius, damage, owner) => {
    for (const v of G.vehicles.list) { const d = Math.hypot(v.x - x, v.z - z); if (d < radius + 2.5) { const f = clamp(1 - d / (radius + 2.5), 0.1, 1); v.damage(damage * f * 0.9, owner); if (d > 0.1) { v.vx += (v.x - x) / d * 7 * f; v.vz += (v.z - z) / d * 7 * f; v.vy = (v.vy || 0) + 4 * f; } } }
    if (G.peds) G.peds.explosionDamage(x, z, radius, damage, owner);
    const p = G.player, d = Math.hypot(p.x - x, p.z - z); if (d < radius + 1) { const f = clamp(1 - d / (radius + 1), 0.05, 1); p.damage(damage * f * 0.55, owner); if (p.state === 'foot') { p.vxk = (p.x - x) / (d + 0.1) * 9 * f; p.vzk = (p.z - z) / (d + 0.1) * 9 * f; p.vy = 4 * f; } }
    if (owner === 'player' || (owner && owner === G.player)) G.police && G.police.crime('explosion', x, z);
  };
  return C;
}
