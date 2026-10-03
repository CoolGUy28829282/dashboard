import { describe, it, expect } from 'vitest';
import { generateLeague } from '../src/data/generator.js';
import { BallPhysics } from '../src/physics/world.js';
import { EventBus } from '../src/engine/bus.js';
import { Game } from '../src/gameplay/game.js';

// Calibration guard: CPU-vs-CPU games should look like basketball, not like a broken sim.
describe('simulation balance', () => {
  it('produces plausible shooting, passing and turnover numbers across seeds', async () => {
    const league = generateLeague(); const phys = await BallPhysics.create(); let fga = 0, fgm = 0, tpa = 0, tpm = 0, passes = 0, steals = 0, tos = 0, fts = 0, pts = 0, games = 0;
    for (const seed of [3, 11, 23, 42]) {
      const bus = new EventBus(); bus.on('pass', () => passes++); bus.on('steal', () => steals++); bus.on('turnover', () => tos++);
      let a = seed; const orig = Math.random; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
      try {
        const g = new Game({ teams: [league.teams[0], league.teams[1]], settings: { quarterMinutes: 2 }, bus, physics: phys, seed }); g.start(); let n = 0;
        while (g.phase !== 'end' && n++ < 200000) { g.update(1 / 60); if (g.phase === 'qend') g.nextQuarter(); if (g.phase === 'timeout') g.endTimeout(); }
        expect(g.phase).toBe('end'); games++; pts += g.score[0] + g.score[1];
        for (const s of g.shots) { if (s.type === 'ft') { fts++; continue; } fga++; if (s.made) fgm++; if (s.three) { tpa++; if (s.made) tpm++; } }
      } finally { Math.random = orig; }
    }
    const fg = fgm / fga, tp = tpm / Math.max(1, tpa);
    expect(fg).toBeGreaterThan(0.33); expect(fg).toBeLessThan(0.58);
    expect(tp).toBeGreaterThan(0.25); expect(tp).toBeLessThan(0.55);
    expect(tpa / fga).toBeGreaterThan(0.12); expect(tpa / fga).toBeLessThan(0.6);
    expect(passes / games).toBeGreaterThan(40); expect(steals / games).toBeLessThan(30); expect(tos / games).toBeLessThan(40);
    expect(pts / games).toBeGreaterThan(40); expect(pts / games).toBeLessThan(200);
  }, 120000);
});
