// Humanoid rig: shared geometry + walk/aim pose, and the player's model.
import * as THREE from 'three';
import { clamp, col } from './util.js';

export const PART = {
  head: new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1.12, 1),
  torso: new THREE.BoxGeometry(0.44, 0.62, 0.25),
  arm: new THREE.BoxGeometry(0.12, 0.62, 0.12).translate(0, -0.31, 0),
  leg: new THREE.BoxGeometry(0.17, 0.88, 0.17).translate(0, -0.44, 0),
};
export const RIG = { hipY: 0.88, shoulderY: 1.47, torsoY: 1.19, headY: 1.66, legX: 0.1, armX: 0.28 };

// out: legL, legR, armL, armR (rotation.x, + swings forward), bob, lean
export function pose(out, phase, spd, mode = 0, aim = 0) {
  const amp = clamp(spd / 5.5, 0, 1) * 0.95, s = Math.sin(phase);
  out.legL = s * amp; out.legR = -s * amp; out.armL = -s * amp * 0.85; out.armR = s * amp * 0.85;
  out.bob = Math.abs(Math.cos(phase)) * 0.05 * clamp(spd / 4, 0, 1); out.lean = clamp(spd / 8, 0, 1) * 0.16;
  if (mode === 1) { out.armR = 1.52 + aim * 0.0; out.armL = 1.22; out.lean *= 0.3; }
  else if (mode === 3) { out.armR = 0.9; out.armL = -0.9; out.legL = 0.5; out.legR = 0.5; } // jump
  return out;
}

export function makePlayerModel() {
  const root = new THREE.Group(), mats = { suit: new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.7 }), shirt: new THREE.MeshStandardMaterial({ color: 0xff5fa8, roughness: 0.6 }), pants: new THREE.MeshStandardMaterial({ color: 0x1b2038, roughness: 0.7 }), skin: new THREE.MeshStandardMaterial({ color: 0xc58c6a, roughness: 0.8 }), hair: new THREE.MeshStandardMaterial({ color: 0x15101a, roughness: 0.9 }), visor: new THREE.MeshBasicMaterial({ color: col('#22e6ff', 3) }), shoe: new THREE.MeshStandardMaterial({ color: 0xff2d95, roughness: 0.5 }), gun: new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.4, metalness: 0.8 }) };
  const mk = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const torso = mk(PART.torso, mats.suit, 0, RIG.torsoY, 0); mk(new THREE.BoxGeometry(0.2, 0.5, 0.02), mats.shirt, 0, 0.02, -0.13, torso);
  const head = mk(PART.head, mats.skin, 0, RIG.headY, 0); mk(new THREE.BoxGeometry(0.27, 0.07, 0.26), mats.hair, 0, 0.1, 0.015, head); mk(new THREE.BoxGeometry(0.24, 0.05, 0.05), mats.visor, 0, 0.02, -0.12, head);
  const legL = mk(PART.leg, mats.pants, -RIG.legX, RIG.hipY, 0), legR = mk(PART.leg, mats.pants, RIG.legX, RIG.hipY, 0); mk(new THREE.BoxGeometry(0.18, 0.08, 0.28), mats.shoe, 0, -0.86, -0.04, legL); mk(new THREE.BoxGeometry(0.18, 0.08, 0.28), mats.shoe, 0, -0.86, -0.04, legR);
  const armL = mk(PART.arm, mats.suit, -RIG.armX, RIG.shoulderY, 0), armR = mk(PART.arm, mats.suit, RIG.armX, RIG.shoulderY, 0);
  const gun = new THREE.Group(); gun.position.set(0, -0.6, -0.06); armR.add(gun); gun.rotation.x = -Math.PI / 2; // along arm when arm is raised
  const guns = { pistol: mk(new THREE.BoxGeometry(0.06, 0.1, 0.24), mats.gun, 0, 0.0, -0.1, gun), smg: mk(new THREE.BoxGeometry(0.07, 0.14, 0.46), mats.gun, 0, 0, -0.18, gun), shotgun: mk(new THREE.BoxGeometry(0.07, 0.09, 0.8), mats.gun, 0, 0, -0.3, gun), rpg: mk(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a4a30, roughness: 0.6 }), 0, 0.02, -0.25, gun) };
  Object.values(guns).forEach(g => { g.visible = false; });
  root.userData = { torso, head, legL, legR, armL, armR, guns, mats };
  return root;
}
