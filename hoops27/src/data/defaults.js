import { COLORS } from '../tuning.js';
export const DEFAULT_SETTINGS = {
  audio: { master: 0.8, music: 0.5, sfx: 0.9, crowd: 0.8, commentary: 0.7, tts: false },
  controls: { keys: {}, deadzone: 0.15, aimAssist: 0.5, shotStickSens: 0.6, vibration: true },
  gameplay: { shotMeter: 'overhead', shotInput: 'button', camera: 'broadcast', sprintToggle: false, playCallUI: true, foulSensitivity: 1.0, replays: true, travel: 'arcade', threeSecond: true },
  video: { preset: 'auto', resolutionScale: 1, shadows: true, bloom: true, ssao: false, ca: true, fxaa: true, motionBlur: false, fpsCap: 0, showFps: false, benchmarked: false },
  access: { palette: 'default', uiScale: 1, reducedMotion: false, screenShake: true },
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const mergeSettings = (saved) => { const d = clone(DEFAULT_SETTINGS); for (const k of Object.keys(d)) Object.assign(d[k], saved?.[k] ?? {}); return d; };
export const TIPS = [
  'Release a shot when the sweet spot reaches the end of the arc — green is the perfect window.',
  'Contested shots shrink your green window. Get open before you shoot.',
  'Hold sprint while pressing shoot near the rim for a dunk attempt.',
  'Use a hesitation to freeze a defender, then attack the gap.',
  'A step-back buys space against a defender who has just recovered.',
  'Call a play from the D-pad / number keys to see the holographic routes.',
  'Free throws always play a fixed meter: 0.95 s, no contest.',
  'Get your hands up with Shift to raise your contest on defence.',
  'Hot streak? Keep feeding your shooter — every tier adds up to +12% to make chance.',
  'Take a charge by holding C in the driver\'s path while standing still.',
  'The shot clock resets to 14 after an offensive rebound.',
  'Ranked uses fixed 5-minute quarters, fouls on, fatigue on, and no rematch.',
];
export const ACCENTS = { cyan: COLORS.cyan, magenta: COLORS.magenta, lime: COLORS.lime };
