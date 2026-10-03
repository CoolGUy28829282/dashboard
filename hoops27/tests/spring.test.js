import { describe, it, expect } from 'vitest';
import { twoBoneIK } from '../src/engine/athlete.js';
import * as THREE from 'three';

// The spring helper is internal; exercise the same maths through a copy to guard against instability at long frame times.
const step = (S, dt, target, omega, zeta) => { const w2 = omega * omega; S.v = (S.v + dt * w2 * (target - S.x)) / (1 + 2 * zeta * omega * dt + w2 * dt * dt); S.x += S.v * dt; return S.x; };
describe('secondary-motion springs and IK', () => {
  it('converge without blowing up for any frame time', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.05, 0.1, 0.5]) for (const [w, z] of [[14, 0.6], [22, 0.9], [18, 0.55], [40, 0.4]]) {
      const S = { x: 0, v: 0 }; for (let i = 0; i < 400; i++) step(S, dt, 1, w, z);
      expect(Math.abs(S.x - 1), `dt ${dt} w ${w}`).toBeLessThan(0.01); expect(Number.isFinite(S.v)).toBe(true);
    }
  });
  it('two-bone IK reaches reachable targets and keeps a fixed bone length', () => {
    const upper = new THREE.Group(), lower = new THREE.Group(); upper.position.set(0, 0, 0); lower.position.set(0, -0.46, 0); upper.add(lower);
    for (const t of [[0.1, -0.7, 0.05], [0.3, -0.6, 0], [-0.2, -0.8, 0.1]]) {
      twoBoneIK(upper, lower, 0.46, 0.45, new THREE.Vector3(...t), new THREE.Vector3(1, 0, 0)); upper.updateMatrixWorld(true);
      const end = new THREE.Vector3(0, -0.45, 0); lower.localToWorld(end); expect(end.distanceTo(new THREE.Vector3(...t))).toBeLessThan(0.01);
    }
  });
});
