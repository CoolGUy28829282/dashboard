import { describe, it, expect } from 'vitest';
import { makeProbability, baseMake, gradeOffset, windowWidthMs, streakMod, streakTier, releaseSpeedMod, meterDuration, contestMod } from '../src/gameplay/shooting.js';
import { contestLevel } from '../src/gameplay/contest.js';
import { mmrDelta, rankFromMmr, streakBonus, rankLabel, expected, levelForMmr } from '../src/gameplay/elo.js';
import { foulProbability } from '../src/gameplay/foul.js';

const mp = (o) => makeProbability({ type: 'three', rating: 70, distance: 7.24, grade: 'good', ...o }).p;

describe('make probability', () => {
  it('is monotonic increasing with rating', () => {
    let prev = -1;
    for (let r = 25; r <= 99; r += 2) { const p = mp({ rating: r }); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
  });
  it('is monotonic decreasing with contest', () => {
    let prev = 2;
    for (let c = 0; c <= 1; c += 0.1) { const p = mp({ contest: c }); expect(p).toBeLessThanOrEqual(prev); prev = p; }
  });
  it('base curve endpoints', () => {
    expect(baseMake(25)).toBeCloseTo(0.12); expect(baseMake(99)).toBeCloseTo(0.9);
  });
  it('clamps to [0.01, 0.99]', () => {
    expect(mp({ rating: 25, contest: 1, grade: 'wayoff', difficulty: 'hof' })).toBe(0.01);
    expect(mp({ rating: 99, grade: 'perfect', type: 'layup', streak: 3, difficulty: 'rookie' })).toBeLessThanOrEqual(0.99);
  });
  it('perfect uncontested is a forced make (0.99) except on Hall of Fame', () => {
    expect(mp({ grade: 'perfect', rating: 40 })).toBe(0.99);
    expect(mp({ grade: 'perfect', rating: 40, difficulty: 'hof' })).toBeLessThan(0.99);
  });
  it('perfect contested uses 0.85 + 0.15*(1-contest)', () => {
    const r = makeProbability({ type: 'midrange', rating: 80, distance: 4, contest: 0.5, grade: 'perfect' });
    expect(r.mods.grade).toBeCloseTo(0.925);
  });
  it('difficulty scaling applies to user shots only', () => {
    expect(mp({ difficulty: 'rookie' })).toBeGreaterThan(mp({ difficulty: 'hof' }));
    expect(mp({ difficulty: 'rookie', usersShot: false })).toBeCloseTo(mp({ difficulty: 'hof', usersShot: false }));
  });
  it('distance factor never drops below 0.4', () => {
    expect(makeProbability({ type: 'three', rating: 80, distance: 30 }).mods.distance).toBe(0.4);
  });
  it('fatigue lowers probability', () => { expect(mp({ staminaPct: 10 })).toBeLessThan(mp({ staminaPct: 100 })); });
});

describe('grading and windows', () => {
  it('bands from offsets', () => {
    const W = 60;
    expect(gradeOffset(0, W)).toBe('perfect'); expect(gradeOffset(30, W)).toBe('perfect'); expect(gradeOffset(-30, W)).toBe('perfect');
    expect(gradeOffset(31, W)).toBe('excellent'); expect(gradeOffset(55, W)).toBe('excellent');
    expect(gradeOffset(56, W)).toBe('good'); expect(gradeOffset(85, W)).toBe('good');
    expect(gradeOffset(-86, W)).toBe('early'); expect(gradeOffset(130, W)).toBe('late');
    expect(gradeOffset(131, W)).toBe('wayoff'); expect(gradeOffset(-400, W)).toBe('wayoff');
  });
  it('window clamps to [18,180] and FT to [70,160]', () => {
    expect(windowWidthMs({ type: 'fadeaway', rating: 25, contest: 1, fatigue: 1 })).toBe(18);
    expect(windowWidthMs({ type: 'layup', rating: 99, badgeBonus: 100 })).toBe(180);
    expect(windowWidthMs({ type: 'ft', rating: 25 })).toBeGreaterThanOrEqual(70);
    expect(windowWidthMs({ type: 'ft', rating: 99, badgeBonus: 200 })).toBe(160);
  });
  it('window shrinks with contest and fatigue, grows with rating', () => {
    const b = { type: 'three', rating: 70 };
    expect(windowWidthMs({ ...b, contest: 1 })).toBeLessThan(windowWidthMs(b));
    expect(windowWidthMs({ ...b, fatigue: 1 })).toBeLessThan(windowWidthMs(b));
    expect(windowWidthMs({ ...b, rating: 90 })).toBeGreaterThan(windowWidthMs(b));
  });
  it('FT window ignores contest', () => {
    expect(windowWidthMs({ type: 'ft', rating: 70, contest: 1 })).toBe(windowWidthMs({ type: 'ft', rating: 70 }));
  });
  it('release speed modifier clamp and meter duration', () => {
    expect(releaseSpeedMod(0)).toBe(1.15); expect(releaseSpeedMod(99)).toBeCloseTo(0.80345, 3); expect(releaseSpeedMod(200)).toBe(0.8);
    expect(meterDuration('ft', 99)).toBe(0.95);
    expect(meterDuration('three', 0)).toBeCloseTo(0.7 * 1.15);
  });
});

describe('streaks', () => {
  it('caps hot at +12% and cold at -9%', () => {
    expect(streakMod(3)).toBeCloseTo(0.12); expect(streakMod(10)).toBeCloseTo(0.12);
    expect(streakMod(-3)).toBeCloseTo(-0.09); expect(streakMod(-10)).toBeCloseTo(-0.09);
    expect(streakMod(1)).toBeCloseTo(0.04); expect(streakMod(-1)).toBeCloseTo(-0.03);
  });
  it('tiers from runs', () => {
    expect(streakTier(1)).toBe(0); expect(streakTier(2)).toBe(1); expect(streakTier(9)).toBe(3);
    expect(streakTier(-2)).toBe(0); expect(streakTier(-3)).toBe(-1); expect(streakTier(-9)).toBe(-3);
  });
});

describe('contest', () => {
  const base = { distance: 0.5, handHeight: 2.4, releaseHeight: 2.4, closingSpeed: 3, defRating: 80, heightM: 2.0 };
  it('is zero when far, rises as defender closes', () => {
    expect(contestLevel({ ...base, distance: 3 })).toBe(0);
    expect(contestLevel({ ...base, distance: 0.3 })).toBeGreaterThan(contestLevel({ ...base, distance: 1.2 }));
  });
  it('is in [0,1] and monotonic with defender rating', () => {
    const lo = contestLevel({ ...base, defRating: 30 }), hi = contestLevel({ ...base, defRating: 95 });
    expect(hi).toBeGreaterThan(lo); expect(hi).toBeLessThanOrEqual(1); expect(lo).toBeGreaterThanOrEqual(0);
    expect(contestMod(1)).toBeCloseTo(0.45);
  });
});

describe('ranked', () => {
  it('elo is zero-sum-ish for equal ratings', () => {
    expect(expected(1000, 1000)).toBeCloseTo(0.5);
    expect(mmrDelta({ mmr: 1000, oppMmr: 1000, won: true, gamesPlayed: 5 })).toBe(12);
    expect(mmrDelta({ mmr: 1000, oppMmr: 1000, won: true, gamesPlayed: 0 })).toBe(20);
    expect(mmrDelta({ mmr: 1000, oppMmr: 1000, won: false, gamesPlayed: 0 })).toBe(-20);
  });
  it('streak bonus +2 from third win, cap +10', () => {
    expect([1, 2, 3, 4, 5, 7, 8, 20].map(streakBonus)).toEqual([0, 0, 2, 4, 6, 10, 10, 10]);
    expect(mmrDelta({ mmr: 1000, oppMmr: 1000, won: false, gamesPlayed: 9, winStreak: 9 })).toBe(-12);
  });
  it('rage quit costs 1.5x', () => {
    expect(mmrDelta({ mmr: 1000, oppMmr: 1000, won: false, gamesPlayed: 9, rageQuit: true })).toBe(-18);
  });
  it('divisions every 100 from 800', () => {
    expect(rankLabel(800)).toBe('Bronze III'); expect(rankLabel(900)).toBe('Bronze II'); expect(rankLabel(1000)).toBe('Bronze I');
    expect(rankLabel(1100)).toBe('Silver III'); expect(rankLabel(1000 + 0)).toBe('Bronze I'); expect(rankLabel(100)).toBe('Bronze III');
    expect(rankFromMmr(800 + 18 * 100).tier).toBe('Legend'); expect(rankFromMmr(5000).division).toBeNull();
  });
  it('AI level maps from MMR', () => { expect(levelForMmr(900)).toBe('rookie'); expect(levelForMmr(2500)).toBe('hof'); });
});

describe('fouls', () => {
  const b = { contactAngle: 0.5, defAggression: 0.5, shooterRating01: 0.5 };
  it('rises with aggression, tolerance, shooting; stays within [0, 0.6]', () => {
    expect(foulProbability({ ...b, defAggression: 1 })).toBeGreaterThan(foulProbability(b));
    expect(foulProbability({ ...b, tolerance: 1.5 })).toBeGreaterThan(foulProbability(b));
    expect(foulProbability({ ...b, shooting: true })).toBeGreaterThan(foulProbability(b));
    expect(foulProbability({ contactAngle: 1, defAggression: 1, shooterRating01: 0, tolerance: 1.5, shooting: true, dunkContact: true })).toBeLessThanOrEqual(0.6);
    expect(foulProbability({ contactAngle: 1, defAggression: 1, shooterRating01: 0, tolerance: 3, shooting: true, dunkContact: true })).toBe(0.6);
  });
});

describe('forced make flag', () => {
  it('flags only perfect + uncontested (not on Hall of Fame, not when contested)', () => {
    expect(makeProbability({ type: 'three', rating: 50, distance: 7, grade: 'perfect', contest: 0 }).forced).toBe(true);
    expect(makeProbability({ type: 'three', rating: 50, distance: 7, grade: 'perfect', contest: 0.2 }).forced).toBe(false);
    expect(makeProbability({ type: 'three', rating: 50, distance: 7, grade: 'perfect', contest: 0, difficulty: 'hof' }).forced).toBe(false);
    expect(makeProbability({ type: 'three', rating: 50, distance: 7, grade: 'excellent', contest: 0 }).forced).toBe(false);
  });
});
