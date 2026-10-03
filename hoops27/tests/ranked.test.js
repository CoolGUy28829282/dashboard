import { describe, it, expect } from 'vitest';
import { newProfile, applyResult, generateOpponent, leaderboard, placementDone, rankText, seasonDaysLeft } from '../src/modes/ranked.js';
import { mulberry32 } from '../src/engine/rng.js';

const opp = (mmr) => ({ tag: 'X', mmr, level: 10, badge: '◆' });
describe('ranked flow', () => {
  it('starts at 1000 MMR, five placement games with K=40', () => {
    const p = newProfile('t'); expect(p.mmr).toBe(1000); expect(placementDone(p)).toBe(false); expect(rankText(p)).toContain('Placement');
    const r = applyResult(p, { won: true, opp: opp(1000), userPts: 30, oppPts: 20 });
    expect(r.delta).toBe(20); expect(p.mmr).toBe(1020);
    for (let i = 0; i < 4; i++) applyResult(p, { won: false, opp: opp(1000), userPts: 10, oppPts: 20 });
    expect(placementDone(p)).toBe(true); expect(p.games).toBe(5);
  });
  it('switches to K=24 after placement and applies the streak bonus from the 3rd win', () => {
    const p = newProfile('t'); for (let i = 0; i < 5; i++) applyResult(p, { won: i % 2 === 1, opp: opp(p.mmr), userPts: 1, oppPts: 0 });
    const m0 = p.mmr; const r1 = applyResult(p, { won: true, opp: opp(m0), userPts: 1, oppPts: 0 }); expect(r1.delta).toBe(12 + 0);
    const r2 = applyResult(p, { won: true, opp: opp(p.mmr), userPts: 1, oppPts: 0 }); expect(r2.delta).toBe(12);
    const r3 = applyResult(p, { won: true, opp: opp(p.mmr), userPts: 1, oppPts: 0 }); expect(r3.delta).toBe(14); // 12 + 2
    const r4 = applyResult(p, { won: true, opp: opp(p.mmr), userPts: 1, oppPts: 0 }); expect(r4.delta).toBe(16);
    expect(p.winStreak).toBe(4);
    const loss = applyResult(p, { won: false, opp: opp(p.mmr), userPts: 0, oppPts: 1 }); expect(loss.delta).toBe(-12); expect(p.winStreak).toBe(0);
  });
  it('rage quit costs 1.5x and promotion is detected', () => {
    const p = newProfile('t'); p.games = 10; p.mmr = 1000;
    const r = applyResult(p, { won: false, opp: opp(1000), userPts: 0, oppPts: 1, rageQuit: true }); expect(r.delta).toBe(-18);
    const q = newProfile('t'); q.games = 10; q.mmr = 1095; const up = applyResult(q, { won: true, opp: opp(1095), userPts: 1, oppPts: 0 }); expect(up.after).toBe(1107); expect(up.promoted).toBe(true); expect(up.rankAfter).toBe('Silver III');
  });
  it('matchmaking stays within ±150 MMR and the leaderboard has 51 sorted rows', () => {
    const p = newProfile('t'); const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) { const o = generateOpponent(p, rng); expect(Math.abs(o.mmr - p.mmr)).toBeLessThanOrEqual(150); expect(o.searchSeconds).toBeGreaterThanOrEqual(2); expect(o.searchSeconds).toBeLessThanOrEqual(6); }
    const lb = leaderboard(p); expect(lb.length).toBe(51); expect(lb.filter((r) => r.you).length).toBe(1);
    for (let i = 1; i < lb.length; i++) expect(lb[i - 1].mmr).toBeGreaterThanOrEqual(lb[i].mmr);
    expect(seasonDaysLeft(p)).toBe(30);
  });
});
