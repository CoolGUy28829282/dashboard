import { describe, it, expect } from 'vitest';
import { BallPhysics, hoopCenter, ballistic, arcTime, BALL_R } from '../src/physics/world.js';

describe('rapier ball world', () => {
  it('bounces on the floor and loses energy', async () => {
    const b = await BallPhysics.create();
    b.launch({ x: 0, y: 1.8, z: 3 }, { x: 0, y: 0, z: 0 });
    let maxAfter = 0, hitFloor = false;
    for (let i = 0; i < 240; i++) { b.step(); if (b.drainHits().some((h) => h.kind === 'floor')) hitFloor = true; if (hitFloor) maxAfter = Math.max(maxAfter, b.pos.y); }
    expect(hitFloor).toBe(true);
    expect(maxAfter).toBeLessThan(1.8); expect(maxAfter).toBeGreaterThan(0.6);
    expect(b.pos.y).toBeGreaterThanOrEqual(BALL_R - 0.02);
  });
  it('a ballistic shot aimed at the rim centre falls through the hoop', async () => {
    const b = await BallPhysics.create();
    const rim = hoopCenter(1); const p0 = { x: rim.x - 4, y: 2.2, z: 0 };
    const T = arcTime(p0, rim, 1.3);
    b.launch(p0, ballistic(p0, rim, T));
    let crossed = false, prev = b.pos.y;
    for (let i = 0; i < 400; i++) { b.step(); const p = b.pos; if (prev > rim.y && p.y <= rim.y && Math.hypot(p.x - rim.x, p.z - rim.z) < 0.2) crossed = true; prev = p.y; }
    expect(crossed).toBe(true);
  });
  it('a shot aimed at the front rim hits the rim collider', async () => {
    const b = await BallPhysics.create();
    const rim = hoopCenter(1); const p0 = { x: rim.x - 4, y: 2.2, z: 0 };
    const target = { x: rim.x - 0.3, y: rim.y, z: 0 };
    b.launch(p0, ballistic(p0, target, arcTime(p0, target, 1.0)));
    let rimHit = false;
    for (let i = 0; i < 300; i++) { b.step(); if (b.drainHits().some((h) => h.kind === 'rim' || h.kind === 'board')) rimHit = true; }
    expect(rimHit).toBe(true);
  });
});
