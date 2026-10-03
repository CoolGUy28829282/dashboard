// Ball flight: gravity, quadratic air drag and Magnus lift from backspin. Scalar-only maths, no allocation.
// Phase 1 uses it for the menu shooter; Phase 2 builds rim/backboard collision and the shot model on top.
import { C } from './court.js';

export const BALL = { r: C.ballR, m: C.ballMass, e: 0.78, g: 9.81, rho: 1.2, cd: 0.47, area: Math.PI * C.ballR * C.ballR };
const kD = (0.5 * BALL.rho * BALL.area * BALL.cd) / BALL.m;
const kM = (0.5 * BALL.rho * BALL.area) / BALL.m;

/** State layout: x y z vx vy vz wx wy wz (angular velocity, rad/s). Semi-implicit Euler. */
export function stepAir(S, dt) {
  const vx = S[3], vy = S[4], vz = S[5];
  const v = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1e-6;
  let ax = -kD * v * vx, ay = -kD * v * vy - BALL.g, az = -kD * v * vz;
  const wx = S[6], wy = S[7], wz = S[8];
  const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
  if (w > 1e-3) {
    const spinParam = (BALL.r * w) / v;
    const cl = Math.min(0.6 * spinParam, 0.25);
    const k = (kM * cl * v) / w; // F = 0.5 rho A Cl v^2 (w_hat x v_hat)
    ax += k * (wy * vz - wz * vy); ay += k * (wz * vx - wx * vz); az += k * (wx * vy - wy * vx);
  }
  S[3] = vx + ax * dt; S[4] = vy + ay * dt; S[5] = vz + az * dt;
  S[0] += S[3] * dt; S[1] += S[4] * dt; S[2] += S[5] * dt;
}

const T = new Float64Array(9);
/** Horizontal distance (along u) at which the ball descends through height `hy`, or -1 if it never does. */
function carry(x0, y0, z0, ux, uz, hy, v, ang, spin) {
  const ca = Math.cos(ang);
  T[0] = x0; T[1] = y0; T[2] = z0; T[3] = v * ca * ux; T[4] = v * Math.sin(ang); T[5] = v * ca * uz;
  T[6] = -uz * spin; T[7] = 0; T[8] = ux * spin; // backspin axis = u x up
  const dt = 1 / 120;
  for (let i = 0; i < 700; i++) {
    const py = T[1], px = T[0], pz = T[2];
    stepAir(T, dt);
    if (T[4] < 0 && py > hy && T[1] <= hy) {
      const f = (py - hy) / (py - T[1]);
      return (px + (T[0] - px) * f - x0) * ux + (pz + (T[2] - pz) * f - z0) * uz;
    }
    if (T[1] < 0) return -1;
  }
  return -1;
}

/** Launch speed that sends the ball through (hx,hy,hz) from (x0,y0,z0) at `ang` radians with `spin` rad/s backspin. */
export function solveShotSpeed(x0, y0, z0, hx, hy, hz, ang, spin) {
  const dx = hx - x0, dz = hz - z0, d = Math.sqrt(dx * dx + dz * dz) || 1e-6, ux = dx / d, uz = dz / d;
  let lo = 3, hi = 18;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2, got = carry(x0, y0, z0, ux, uz, hy, mid, ang, spin);
    if (got < d) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
