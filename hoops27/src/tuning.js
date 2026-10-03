// Single source of truth for every adjustable number in HOOPS 27: NEON ERA.
export const COURT = {
  length: 28.65, width: 15.24, rimHeight: 3.048, rimInnerDiameter: 0.457,
  backboardW: 1.829, backboardH: 1.067, backboardOffset: 1.194, // backboard plane distance from baseline (m); rim centre sits at 1.575
  rimFromBoard: 0.381, threeArc: 7.24, threeCorner: 6.71, ftLine: 4.57, paintWidth: 4.88,
  ballDiameter: 0.239, ballMass: 0.62, playerMinH: 1.83, playerMaxH: 2.18,
};

export const LOOP = { physicsHz: 120, logicHz: 60 };

export const SHOT_TYPES = ['layup', 'dunk', 'floater', 'midrange', 'three', 'fadeaway', 'ft'];

export const SHOT = {
  baseTime: { layup: 0.45, dunk: 0.35, floater: 0.5, midrange: 0.62, three: 0.7, fadeaway: 0.72, ft: 0.95 },
  releaseSpeed: { a: 1.15, b: 0.0035, min: 0.8, max: 1.15 },
  baseWindowMs: { layup: 120, dunk: 120, floater: 100, midrange: 80, three: 62, fadeaway: 55, ft: 110 },
  windowRatingCoef: 0.9, windowContestCoef: 0.5 * 80, windowFatigueCoef: 0.3 * 100,
  windowClamp: [18, 180], ftWindowClamp: [70, 160],
  bands: { excellent: 25, good: 55, off: 100 }, // ms beyond W/2
  gradeMod: { perfect: 1.0, excellent: 0.88, good: 0.65, off: 0.35, wayoff: 0.08 },
  perfectContestedBase: 0.85, perfectContestedSlope: 0.15,
  base: { floor: 0.12, span: 0.78, exp: 1.35, minR: 25, maxR: 99 },
  distance: { falloff: 0.045, min: 0.4, max: 1.0 },
  ideal: { midrange: 4.0, three: 7.24, fadeaway: 4.5, floater: 2.0, layup: 0, dunk: 0, ft: 4.57 },
  // green window vs range: full size out to just past the three-point line, then it shrinks per metre of extra distance
  range: { fullUntil: 7.5, perMeter: 0.085, min: 0.3 },
  contestPenalty: 0.55, fatiguePenalty: 0.18, fatigueExp: 1.2,
  offDribble: -0.06, offBalance: -0.12, catchShoot: 0.04,
  streak: { hotPerTier: 0.04, hotMax: 0.12, coldPerTier: 0.03, coldMax: 0.09 },
  difficulty: {
    rookie: { mod: 0.10 }, pro: { mod: 0.05 }, allstar: { mod: 0 },
    superstar: { mod: -0.04 }, hof: { mod: -0.08, perfectMult: 1.25 },
  },
  final: [0.01, 0.99],
  grades: { perfect: 'PERFECT', excellent: 'EXCELLENT', good: 'GOOD', early: 'EARLY', late: 'LATE', wayoff: 'WAY OFF' },
};

export const CONTEST = { maxDist: 0.6 * 4, hardDist: 0.6, handWeight: 0.25, closingWeight: 0.15, ratingWeight: 0.2, heightWeight: 0.1 };

export const MOVE = {
  topSpeed: [4.2, 6.0], accel: [8, 18], sprintStaminaPerSec: 9, restStaminaPerSec: 6,
  turnPenalty180: 0.14, fatigueSpeedLoss: 0.14, dribbleCooldown: [0.42, 0.18],
  carrySpeedMul: 0.92, momentumBuild: 0.6, momentumDrain: 1.4,
};

export const RULES = {
  shotClock: 24, shotClockOreb: 14, backcourt: 8, inbound: 5, threeSecond: 3,
  quarterMinutes: 5, otMinutes: 5, timeouts: 7, bonusFouls: 5, foulOut: 6,
  clutchMinutes: 5, clutchPoints: 5,
  foul: { base: 0.04, aggression: 0.10, contactAngle: 0.05, tolerance: 1.0, max: 0.6 },
  dunkContactFoul: 0.05,
};

export const RANKED = {
  startMMR: 1000, kPlacement: 40, kNormal: 24, placementGames: 5, divisionStart: 800, divisionStep: 100,
  tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legend'], divisions: ['III', 'II', 'I'],
  streakStartAt: 3, streakBonus: 2, streakCap: 10, matchRange: 150, searchSeconds: [2, 6],
  rageQuitMult: 1.5, pauseBudgetSec: 30, seasonDays: 30, leaderboardSize: 50, quarterMinutes: 5,
};

export const AI = {
  levels: {
    rookie:    { react: 0.42, accuracy: -0.05, steal: 0.6, contest: 0.5, decision: 0.55, timingSd: 190 },
    pro:       { react: 0.32, accuracy: -0.02, steal: 0.8, contest: 0.7, decision: 0.7,  timingSd: 160 },
    allstar:   { react: 0.24, accuracy: 0.0,   steal: 1.0, contest: 0.85, decision: 0.82, timingSd: 135 },
    superstar: { react: 0.18, accuracy: 0.02,  steal: 1.2, contest: 1.0, decision: 0.92, timingSd: 110 },
    hof:       { react: 0.12, accuracy: 0.04,  steal: 1.4, contest: 1.15, decision: 1.0, timingSd: 85 },
  },
  think: 0.1, // seconds between utility evaluations
  timingSdByType: { layup: 0.4, dunk: 0.3, floater: 0.7, midrange: 0.9, three: 1.0, fadeaway: 1.1, ft: 0.55 }, // shot-type scaling of the AI timing sd
  mmrToLevel: [[1100, 'rookie'], [1300, 'pro'], [1500, 'allstar'], [1700, 'superstar'], [Infinity, 'hof']],
};

export const COLORS = {
  void: '#05060D', surface: '#0B0F1E', cyan: '#00F0FF', magenta: '#FF2BD6', lime: '#B6FF00', amber: '#FFB000', danger: '#FF3355',
};

// Shot variants: animation label, meter-duration multiplier, release height (m above feet), contest vulnerability (0 = hard to contest, 1 = easy)
// and a make-probability tweak. `type` is the rating/timing family from SHOT.baseTime.
export const VARIANTS = {
  pullup:       { type: 'midrange', label: 'Pull-up jumper', durMul: 1.0, vuln: 1.0, rel: 2.45, mod: -0.0 },
  catchShoot:   { type: 'midrange', label: 'Catch-and-shoot', durMul: 0.94, vuln: 0.9, rel: 2.4, mod: 0 },
  catchShoot3:  { type: 'three', label: 'Catch-and-shoot three', durMul: 0.95, vuln: 0.9, rel: 2.45, mod: 0 },
  pullup3:      { type: 'three', label: 'Pull-up three', durMul: 1.0, vuln: 1.0, rel: 2.5, mod: 0 },
  stepback:     { type: 'three', label: 'Step-back', durMul: 1.04, vuln: 0.7, rel: 2.55, mod: 0 },
  stepback2:    { type: 'midrange', label: 'Step-back jumper', durMul: 1.04, vuln: 0.7, rel: 2.5, mod: 0 },
  fadeaway:     { type: 'fadeaway', label: 'Fadeaway', durMul: 1.0, vuln: 0.65, rel: 2.7, mod: 0 },
  turnaround:   { type: 'midrange', label: 'Turnaround', durMul: 1.05, vuln: 0.75, rel: 2.6, mod: 0 },
  hopstep3:     { type: 'three', label: 'Hop-step three', durMul: 0.97, vuln: 0.95, rel: 2.45, mod: 0 },
  floater:      { type: 'floater', label: 'Floater', durMul: 1.0, vuln: 0.55, rel: 2.7, mod: 0 },
  fingerroll:   { type: 'layup', label: 'Finger roll', durMul: 1.1, vuln: 0.6, rel: 2.9, mod: 0 },
  reverse:      { type: 'layup', label: 'Reverse layup', durMul: 1.05, vuln: 0.5, rel: 3.0, mod: -0.01 },
  euro:         { type: 'layup', label: 'Euro-step layup', durMul: 1.08, vuln: 0.5, rel: 2.95, mod: 0 },
  layup:        { type: 'layup', label: 'Layup', durMul: 1.0, vuln: 0.9, rel: 2.9, mod: 0 },
  hook:         { type: 'floater', label: 'Hook shot', durMul: 1.05, vuln: 0.6, rel: 2.85, mod: 0.02 },
  putback:      { type: 'layup', label: 'Putback', durMul: 0.8, vuln: 0.9, rel: 2.9, mod: 0.02 },
  standdunk:    { type: 'dunk', label: 'Standing dunk', durMul: 1.0, vuln: 1.0, rel: 3.3, mod: 0 },
  drivedunk:    { type: 'dunk', label: 'Driving dunk', durMul: 0.95, vuln: 0.8, rel: 3.4, mod: 0 },
  windmill:     { type: 'dunk', label: 'Windmill', durMul: 1.1, vuln: 0.9, rel: 3.5, mod: -0.03 },
  tomahawk:     { type: 'dunk', label: 'Tomahawk', durMul: 1.1, vuln: 0.9, rel: 3.55, mod: -0.03 },
  alleyoop:     { type: 'dunk', label: 'Alley-oop finish', durMul: 0.9, vuln: 0.7, rel: 3.4, mod: 0 },
  ft:           { type: 'ft', label: 'Free throw', durMul: 1.0, vuln: 0, rel: 2.3, mod: 0 },
};
export const AIRTIME = { three: 0.35, midrange: 0.4, layup: 0.55, dunk: 0.8, floater: 0.45, fadeaway: 0.42, ft: 0.05 }; // jump height (m) base per type
export const PASS = { chest: { speed: 15, apex: 0.0 }, bounce: { speed: 11, apex: 0.0 }, overhead: { speed: 14, apex: 0.6 }, lob: { speed: 9, apex: 2.6 }, nolook: { speed: 14, apex: 0.0 } };
