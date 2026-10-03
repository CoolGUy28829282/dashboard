import { describe, it, expect } from 'vitest';
import { generateLeague } from '../src/data/generator.js';
import { BallPhysics } from '../src/physics/world.js';
import { EventBus } from '../src/engine/bus.js';
import { Game } from '../src/gameplay/game.js';

async function runGame(seed, minutes = 1, difficulty = 'allstar', extra = {}) {
  const league = generateLeague(); const phys = await BallPhysics.create(); const bus = new EventBus();
  const stats = { shots: 0, makes: 0, fouls: 0, to: 0, passes: 0, reb: 0, blocks: 0, steals: 0, dunks: 0 };
  bus.on('shotRelease', () => stats.shots++); bus.on('score', () => stats.makes++); bus.on('foul', () => stats.fouls++); bus.on('turnover', () => stats.to++); bus.on('pass', () => stats.passes++);
  bus.on('rebound', () => stats.reb++); bus.on('block', () => stats.blocks++); bus.on('steal', () => stats.steals++); bus.on('dunk', () => stats.dunks++);
  Math.random = (() => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const g = new Game({ teams: [league.teams[0], league.teams[1]], settings: { quarterMinutes: minutes, difficulty, ...extra }, bus, physics: phys, seed });
  g.start();
  let ticks = 0; const phases = new Set();
  while (g.phase !== 'end' && ticks < 60 * 60 * 40) {
    g.update(1 / 60); ticks++; phases.add(g.phase);
    if (g.phase === 'qend') g.nextQuarter();
    if (g.phase === 'timeout' && g.timeoutState) g.endTimeout();
    if (!isFinite(g.ball.pos.x) || !isFinite(g.ball.pos.y)) throw new Error('NaN ball at tick ' + ticks + ' phase ' + g.phase + ' state ' + g.ball.state);
    for (const p of g.on) if (!isFinite(p.pos.x) || !isFinite(p.pos.z)) throw new Error('NaN player ' + p.name + ' tick ' + ticks);
  }
  return { g, ticks, stats, phases };
}

describe('headless full-game simulation', () => {
  it('plays four quarters CPU vs CPU and finishes with plausible scoring', async () => {
    const { g, ticks, stats, phases } = await runGame(7, 2);
    console.log('ticks', ticks, 'score', g.score, 'quarter', g.quarter, stats, [...phases]);
    expect(g.phase).toBe('end');
    expect(g.score[0] + g.score[1]).toBeGreaterThan(30);
    expect(g.score[0] + g.score[1]).toBeLessThan(260);
    expect(stats.shots).toBeGreaterThan(30);
    expect(stats.passes).toBeGreaterThan(20);
    expect(g.quarter).toBeGreaterThanOrEqual(4);
  }, 120000);

  it('never deadlocks across seeds, difficulties and rule sets', async () => {
    const cfgs = [[1, 'rookie', {}], [2, 'hof', { travel: 'sim' }], [3, 'pro', { fouls: false, fatigue: false }], [4, 'superstar', { ranked: true }], [5, 'allstar', { foulTolerance: 1.5 }], [6, 'allstar', {}], [8, 'pro', { threeSecond: false }]];
    for (const [seed, diff, extra] of cfgs) {
      const { g, stats } = await runGame(seed, 1, diff, extra);
      expect(g.phase, `seed ${seed} stuck in ${g.phase} / ball ${g.ball.state} q${g.quarter} clock ${g.clock}`).toBe('end');
      expect(stats.shots).toBeGreaterThan(8);
    }
  }, 240000);
});

describe('My Gym', () => {
  it('returns the ball to the solo user after makes and misses and never ends', async () => {
    const league = generateLeague(); const phys = await BallPhysics.create(); const bus = new EventBus();
    const g = new Game({ teams: [league.teams[0], league.teams[1]], settings: { gym: true, gymDefender: true, fouls: false, fatigue: false }, bus, physics: phys, humans: [{ team: 0, device: 'auto' }], seed: 4 });
    g.start(); expect(g.gymUser.hasBall).toBe(true); expect(g.on.filter((p) => !p.parked).length).toBe(2);
    let shots = 0; bus.on('shotRelease', () => shots++);
    for (let k = 0; k < 6; k++) {
      const u = g.gymUser; const i = g.humans[0].intent; i.shootPressed = true; i.shootHeld = true;
      for (let t = 0; t < 40 && !u.action; t++) g.update(1 / 60);
      i.shootPressed = false; for (let t = 0; t < 60; t++) g.update(1 / 60); i.shootHeld = false; i.shootReleased = true;
      for (let t = 0; t < 60 * 9 && !(u.hasBall && !u.action); t++) { g.update(1 / 60); i.shootReleased = false; }
      expect(u.hasBall, `shot ${k} ball did not return`).toBe(true);
    }
    expect(shots).toBeGreaterThanOrEqual(5); expect(g.phase).toBe('live'); expect(g.clock).toBe(g.qLen);
  }, 60000);
});
