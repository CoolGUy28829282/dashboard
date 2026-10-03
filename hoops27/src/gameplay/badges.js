// 24 badges, 4 tiers [bronze, silver, gold, hof]. `effect` documents what each value means.
export const TIERS = ['Bronze', 'Silver', 'Gold', 'Hall of Fame'];
export const BADGES = {
  greenMachine: { name: 'Green Machine', stat: 'shotRating', min: [70, 78, 86, 93], windowMsAfterPerfect: [6, 10, 14, 18], effect: '+ms to green window after a perfect release' },
  catchShoot: { name: 'Catch & Shoot', stat: 'three', min: [68, 76, 84, 92], makePct: [0.03, 0.05, 0.07, 0.09], effect: '+% make on catch shots' },
  deadeye: { name: 'Deadeye', stat: 'three', min: [72, 80, 88, 94], contestReduce: [0.2, 0.35, 0.5, 0.65], effect: 'reduces contest penalty' },
  handles: { name: 'Handles for Days', stat: 'ball', min: [70, 78, 86, 93], stealReduce: [0.1, 0.2, 0.3, 0.4], effect: '-% steal chance' },
  ankleBreaker: { name: 'Ankle Breaker', stat: 'ball', min: [74, 82, 89, 95], stumble: [0.1, 0.2, 0.3, 0.4], effect: '+% defender stumble on a successful move' },
  rimProtector: { name: 'Rim Protector', stat: 'block', min: [70, 78, 86, 93], blockWindowMs: [8, 14, 20, 26], effect: '+ms block window' },
  clamps: { name: 'Clamps', stat: 'perimD', min: [70, 78, 86, 93], lateralSpeed: [0.03, 0.05, 0.07, 0.09], effect: '+% lateral speed on-ball' },
  pickDodger: { name: 'Pick Dodger', stat: 'perimD', min: [66, 74, 82, 90], screenReduce: [0.1, 0.2, 0.3, 0.4], effect: '-% screen effectiveness' },
  posterizer: { name: 'Posterizer', stat: 'dunk', min: [72, 80, 88, 94], contactDunk: [0.05, 0.09, 0.13, 0.18], effect: '+% contact dunk success' },
  hustleReb: { name: 'Hustle Rebounder', stat: 'reb', min: [68, 76, 84, 92], pursuitRadius: [0.1, 0.18, 0.26, 0.35], effect: '+% rebound pursuit radius' },
  dimer: { name: 'Dimer', stat: 'pass', min: [70, 78, 86, 93], assistMake: [0.02, 0.04, 0.06, 0.08], effect: '+% make for teammates on your passes' },
  needleThreader: { name: 'Needle Threader', stat: 'pass', min: [72, 80, 88, 94], laneReduce: [0.1, 0.2, 0.3, 0.4], effect: '-% interception on tight lanes' },
  pickpocket: { name: 'Pick Pocket', stat: 'steal', min: [70, 78, 86, 93], stealPct: [0.1, 0.2, 0.3, 0.4], effect: '+% steal chance' },
  intimidator: { name: 'Intimidator', stat: 'interiorD', min: [72, 80, 88, 94], contestAdd: [0.05, 0.1, 0.15, 0.2], effect: '+contest on rim attempts' },
  slasher: { name: 'Fearless Finisher', stat: 'inside', min: [70, 78, 86, 93], contactLayup: [0.04, 0.07, 0.1, 0.14], effect: '+% contact layup' },
  limitless: { name: 'Limitless Range', stat: 'three', min: [76, 83, 90, 95], idealRangeAdd: [0.3, 0.6, 0.9, 1.2], effect: 'extends ideal three range (m)' },
  fadeMaster: { name: 'Fade Master', stat: 'mid', min: [72, 80, 88, 94], fadeMake: [0.03, 0.05, 0.07, 0.1], effect: '+% fadeaway make' },
  stepBack: { name: 'Quick First Step', stat: 'accel', min: [70, 78, 86, 93], dribbleCooldown: [0.03, 0.05, 0.08, 0.1], effect: '-s dribble move cooldown' },
  workhorse: { name: 'Workhorse', stat: 'stamina', min: [70, 78, 86, 93], staminaDrain: [0.1, 0.2, 0.3, 0.4], effect: '-% stamina drain' },
  clutch: { name: 'Clutch Performer', stat: 'iq', min: [72, 80, 88, 94], clutchMake: [0.02, 0.04, 0.06, 0.08], effect: '+% make in clutch time' },
  boxOut: { name: 'Anchor', stat: 'strength', min: [72, 80, 88, 94], boxOut: [0.1, 0.2, 0.3, 0.4], effect: '+% box-out strength' },
  stopper: { name: 'Hands Up', stat: 'perimD', min: [68, 76, 84, 92], contestAdd: [0.03, 0.06, 0.09, 0.12], effect: '+contest while hands up' },
  floorGeneral: { name: 'Floor General', stat: 'iq', min: [74, 82, 90, 95], teamBoost: [1, 2, 3, 4], effect: '+rating to teammates on court' },
};
/** Returns the tier index (0..3) earned for a player's attributes, or -1. */
export function badgeTier(key, attrs) {
  const b = BADGES[key]; const v = attrs[b.stat] ?? 0; let t = -1;
  b.min.forEach((m, i) => { if (v >= m) t = i; });
  return t;
}
export const badgeValue = (key, tier, field) => (tier < 0 ? 0 : BADGES[key][field][tier]);
