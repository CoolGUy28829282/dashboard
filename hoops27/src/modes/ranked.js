// Ranked mode logic (spec §3.2): profile, placement, MMR, streak bonus, simulated matchmaking, season + leaderboard. UI-free and tested.
import { RANKED, AI } from '../tuning.js';
import { mmrDelta, rankFromMmr, rankLabel, levelForMmr, divisionProgress } from '../gameplay/elo.js';
import { mulberry32, irange, range } from '../engine/rng.js';
import { gamertag, BADGE_ICONS } from '../data/generator.js';
import { dbGet, dbSet } from '../data/db.js';

export const newProfile = (name = 'Rookie01', now = Date.now()) => ({
  name, level: 1, xp: 0, mmr: RANKED.startMMR, wins: 0, losses: 0, games: 0, winStreak: 0, lossStreak: 0, bestStreak: 0, history: [], mmrSeries: [RANKED.startMMR], seasonId: 1, seasonStart: now,
  seasonHigh: RANKED.startMMR, archetypeUse: {}, points: 0, pointsTotal: 0, playNow: { wins: 0, losses: 0 },
});
export const placementDone = (p) => p.games >= RANKED.placementGames;
export const placementLeft = (p) => Math.max(0, RANKED.placementGames - p.games);
export const seasonDaysLeft = (p, now = Date.now()) => Math.max(0, RANKED.seasonDays - Math.floor((now - p.seasonStart) / 86400000));
export const rankOf = (p) => (placementDone(p) ? rankFromMmr(p.mmr) : { tier: 'Unranked', division: null });
export const rankText = (p) => (placementDone(p) ? rankLabel(p.mmr) : `Placement ${p.games}/${RANKED.placementGames}`);
export const winPct = (p) => (p.games ? Math.round((p.wins / p.games) * 100) : 0);
export const last10 = (p) => p.history.slice(-10).map((h) => (h.won ? 'W' : 'L'));
export const avgPoints = (p) => (p.history.length ? +(p.history.reduce((s, h) => s + (h.userPts ?? 0), 0) / p.history.length).toFixed(1) : 0);
export const favoriteArchetype = (p) => Object.entries(p.archetypeUse).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

export function generateOpponent(profile, rng = Math.random) {
  const mmr = Math.max(0, Math.round(profile.mmr + (rng() * 2 - 1) * RANKED.matchRange));
  return { tag: gamertag(rng), mmr, level: Math.max(1, Math.round(mmr / 40 + rng() * 6)), badge: BADGE_ICONS[Math.floor(rng() * BADGE_ICONS.length)], rank: rankLabel(mmr), aiLevel: levelForMmr(mmr), searchSeconds: range(rng, ...RANKED.searchSeconds) };
}
export const aiLevelForOpponent = (opp) => levelForMmr(opp.mmr);

/** Apply a finished match. Returns { delta, before, after, rankBefore, rankAfter, promoted, demoted }. */
export function applyResult(profile, { won, opp, userPts, oppPts, rageQuit = false, forfeit = false, mvp = '', archetype = null, now = Date.now() }) {
  const before = profile.mmr, rankBefore = placementDone(profile) ? rankLabel(before) : 'Unranked';
  const streakAfter = won ? profile.winStreak + 1 : 0;
  const delta = mmrDelta({ mmr: before, oppMmr: opp.mmr, won, gamesPlayed: profile.games, winStreak: streakAfter, rageQuit });
  profile.mmr = Math.max(0, before + delta); profile.games++; won ? profile.wins++ : profile.losses++;
  profile.winStreak = streakAfter; profile.lossStreak = won ? 0 : profile.lossStreak + 1; profile.bestStreak = Math.max(profile.bestStreak, profile.winStreak);
  profile.seasonHigh = Math.max(profile.seasonHigh, profile.mmr); profile.mmrSeries.push(profile.mmr);
  profile.xp += 80 + (won ? 60 : 20); profile.level = 1 + Math.floor(profile.xp / 400);
  profile.points += won ? 25 : 8; profile.pointsTotal += won ? 25 : 8;
  if (archetype) profile.archetypeUse[archetype] = (profile.archetypeUse[archetype] ?? 0) + 1;
  profile.history.push({ won, delta, opp: { tag: opp.tag, mmr: opp.mmr, level: opp.level, badge: opp.badge }, userPts, oppPts, mvp, rageQuit, forfeit, at: now, mmrAfter: profile.mmr });
  if (profile.history.length > 60) profile.history.shift();
  const after = profile.mmr, nowRanked = placementDone(profile), rankAfter = nowRanked ? rankLabel(after) : 'Unranked';
  const tierIdx = (m) => rankFromMmr(m).tier ? [...RANKED.tiers].indexOf(rankFromMmr(m).tier) * 3 + (rankFromMmr(m).division ? 2 - RANKED.divisions.indexOf(rankFromMmr(m).division) : 0) : 0;
  const placed = nowRanked && !(profile.games - 1 >= RANKED.placementGames);
  return { delta, before, after, rankBefore, rankAfter, promoted: nowRanked && !placed && tierIdx(after) > tierIdx(before), demoted: nowRanked && !placed && tierIdx(after) < tierIdx(before), placed, progress: divisionProgress(after) };
}

/** 50 simulated players + the user, ranked by MMR. Seeded by season so the board is stable. */
export function leaderboard(profile) {
  const rng = mulberry32(profile.seasonId * 9973 + 17); const rows = [];
  for (let i = 0; i < RANKED.leaderboardSize; i++) { const mmr = Math.round(2150 - i * 28 - rng() * 22 + (rng() - 0.5) * 30); const w = irange(rng, 20, 90); rows.push({ tag: gamertag(rng), mmr, level: irange(rng, 8, 90), wins: w, losses: irange(rng, 8, w), you: false }); }
  rows.push({ tag: profile.name, mmr: profile.mmr, level: profile.level, wins: profile.wins, losses: profile.losses, you: true });
  rows.sort((a, b) => b.mmr - a.mmr); rows.forEach((r, i) => { r.rank = i + 1; }); return rows;
}
export const REWARDS = [['Bronze', 'Neon trail: ember'], ['Silver', 'Court glow: frost'], ['Gold', 'Rim flash: gold burst'], ['Platinum', 'Intro banner: platinum'], ['Diamond', 'Ball skin: prism'], ['Master', 'Jersey trim: aurora'], ['Legend', 'Holo crown + title']];
export function rewardTier(profile) { const r = rankFromMmr(profile.mmr); return r.tier; }

export async function loadProfile() { return (await dbGet('profile')) ?? newProfile(); }
export async function saveProfile(p) { return dbSet('profile', p); }
/** New season: soft reset toward the mean. */
export function rolloverSeason(p, now = Date.now()) { p.seasonId++; p.seasonStart = now; p.mmr = Math.round((p.mmr + RANKED.startMMR) / 2); p.seasonHigh = p.mmr; p.games = Math.min(p.games, RANKED.placementGames - 1); p.mmrSeries = [p.mmr]; return p; }
export const AI_TABLE = AI.levels;
