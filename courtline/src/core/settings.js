// Settings schema drives both defaults and the settings UI. Every change is saved and emitted immediately.
import { Emitter } from './util.js';

const LS_KEY = 'courtline.settings.v1';

const YN = [[true, 'On'], [false, 'Off']];
const LEVELS = [['off', 'Off'], ['low', 'Low'], ['normal', 'Normal'], ['high', 'High']];
const pct = (v) => v + '%';

export const GFX_PRESETS = {
  low: { resScale: 0.75, shadows: 'off', reflections: false, aa: 'off', crowd: 25, post: false },
  medium: { resScale: 1, shadows: 'soft', reflections: false, aa: 'off', crowd: 50, post: true },
  high: { resScale: 1, shadows: 'soft', reflections: true, aa: 'msaa', crowd: 80, post: true },
  ultra: { resScale: 1.25, shadows: 'sharp', reflections: true, aa: 'msaa', crowd: 100, post: true },
};
export const GFX_KEYS = Object.keys(GFX_PRESETS.low);
export const CAM_PRESETS = {
  broadcast: { camZoom: 1, camHeight: 7, camAngle: 0 },
  high: { camZoom: 1, camHeight: 15, camAngle: 0 },
  low: { camZoom: 0.9, camHeight: 1.6, camAngle: 0 },
  follow: { camZoom: 0.8, camHeight: 2.6, camAngle: 0 },
};
export const CAM_KEYS = ['camZoom', 'camHeight', 'camAngle'];

// id, label, group, default keyboard code, default gamepad button (standard mapping)
export const ACTIONS = [
  { id: 'sprint', label: 'Sprint', group: 'Movement', kb: 'ShiftLeft', pad: 7 },
  { id: 'shoot', label: 'Shoot (hold & release)', group: 'Offense', kb: 'KeyJ', pad: 2 },
  { id: 'pass', label: 'Pass', group: 'Offense', kb: 'KeyK', pad: 0 },
  { id: 'iconPass', label: 'Icon pass', group: 'Offense', kb: 'KeyL', pad: 8 },
  { id: 'alleyOop', label: 'Alley-oop', group: 'Offense', kb: 'KeyI', pad: 3 },
  { id: 'crossover', label: 'Crossover', group: 'Offense', kb: 'KeyQ', pad: 4 },
  { id: 'spin', label: 'Spin move', group: 'Offense', kb: 'KeyE', pad: 5 },
  { id: 'stepBack', label: 'Step-back', group: 'Offense', kb: 'KeyC', pad: 6 },
  { id: 'euroStep', label: 'Euro step', group: 'Offense', kb: 'KeyV', pad: 9 },
  { id: 'pumpFake', label: 'Pump fake', group: 'Offense', kb: 'KeyU', pad: 1 },
  { id: 'post', label: 'Post up', group: 'Offense', kb: 'KeyR', pad: 10 },
  { id: 'screen', label: 'Call for screen', group: 'Offense', kb: 'KeyF', pad: 11 },
  { id: 'steal', label: 'Steal', group: 'Defense', kb: 'KeyN', pad: 2 },
  { id: 'block', label: 'Block / contest', group: 'Defense', kb: 'KeyB', pad: 3 },
  { id: 'switch', label: 'Switch player', group: 'Defense', kb: 'KeyG', pad: 0 },
  { id: 'pause', label: 'Pause', group: 'System', kb: 'KeyP', pad: 9 },
];

const sl = (k, label, def, min, max, step, fmt, desc) => ({ k, label, type: 'range', def, min, max, step, fmt: fmt || String, desc });
const se = (k, label, def, options, desc) => ({ k, label, type: 'select', def, options, desc });
const tg = (k, label, def, desc) => ({ k, label, type: 'toggle', def, desc });

export const SCHEMA = [
  { id: 'gameplay', title: 'Gameplay', items: [
    se('difficulty', 'Difficulty', 'pro', [['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star'], ['superstar', 'Superstar'], ['hof', 'Hall of Fame']], 'How hard the CPU plays and how tight the shot-timing window is.'),
    sl('quarterMin', 'Quarter length', 6, 1, 12, 1, (v) => v + ' min', 'Real minutes per quarter. Stats are scaled so short games still feel like pro basketball.'),
    sl('gameSpeed', 'Game speed', 1, 0.7, 1.3, 0.05, (v) => v.toFixed(2) + '×', 'Speeds up or slows down all on-court movement.'),
    se('fatigue', 'Fatigue', 'normal', LEVELS, 'How quickly players tire. Tired players are slower, jump lower and shoot worse.'),
    se('injuries', 'Injuries', 'normal', LEVELS, 'How often players get hurt.'),
    sl('foulFreq', 'Foul frequency', 50, 0, 100, 5, pct, 'How often contact is called as a foul.'),
    sl('shootingSlider', 'Shooting', 50, 0, 100, 5, pct, 'Nudges shot-making for both teams. 50% is true to the ratings.'),
    sl('turnoverSlider', 'Turnovers', 50, 0, 100, 5, pct, 'Nudges how often the ball gets lost. 50% is true to the ratings.'),
    sl('aiAggression', 'AI aggression', 50, 0, 100, 5, pct, 'How hard the CPU pressures the ball and gambles for steals.'),
  ] },
  { id: 'controls', title: 'Controls', items: [
    tg('shotMeter', 'Shot meter', true, 'Show the release meter when you shoot.'),
    se('shotMeterStyle', 'Shot meter style', 'bar', [['bar', 'Bar'], ['arc', 'Arc'], ['ring', 'Ring'], ['minimal', 'Minimal']]),
    se('shotMode', 'Shot control', 'timing', [['timing', 'Timing'], ['aiming', 'Aiming'], ['hybrid', 'Timing + aim']], 'Timing: release at the top of the meter. Aiming: steer the ball with the stick.'),
    sl('vibration', 'Vibration', 60, 0, 100, 10, pct, 'Controller rumble strength.'),
    { type: 'remap', id: 'remap' },
  ] },
  { id: 'camera', title: 'Camera', items: [
    se('camPreset', 'View', 'broadcast', [['broadcast', 'Broadcast'], ['high', 'High'], ['low', 'Low'], ['follow', 'Player follow'], ['custom', 'Custom']], 'The menu background uses these settings so you can preview them live.'),
    sl('camZoom', 'Zoom', 1, 0.5, 1.8, 0.05, (v) => v.toFixed(2) + '×'),
    sl('camHeight', 'Height', 7, 0.8, 18, 0.2, (v) => v.toFixed(1) + ' m'),
    sl('camAngle', 'Angle', 0, -60, 60, 1, (v) => v + '°', 'Rotates the camera around the action.'),
  ] },
  { id: 'graphics', title: 'Graphics', items: [
    se('gfxPreset', 'Quality preset', 'high', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']], 'Sets every option below at once.'),
    sl('resScale', 'Resolution scale', 1, 0.5, 1.5, 0.05, (v) => Math.round(v * 100) + '%', 'Render resolution. Lower is smoother on slower machines.'),
    se('shadows', 'Shadows', 'soft', [['off', 'Off'], ['soft', 'Soft'], ['sharp', 'Sharp']]),
    tg('reflections', 'Floor reflections', true, 'Glossy hardwood sheen from the arena lights.'),
    se('aa', 'Anti-aliasing', 'msaa', [['off', 'Off'], ['msaa', 'MSAA']], 'Applies by rebuilding the renderer, which takes a moment.'),
    sl('crowd', 'Crowd density', 80, 0, 100, 5, pct),
    tg('post', 'Post-processing', true, 'Filmic tone mapping and vignette.'),
    se('fpsCap', 'FPS cap', 0, [[0, 'Match display'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144']], 'Match display follows 60, 120 or 144 Hz screens automatically.'),
    tg('adaptive', 'Adaptive quality', true, 'Quietly lowers resolution when frames run long and raises it again when there is headroom.'),
    tg('fpsCounter', 'FPS counter', false),
    tg('perfOverlay', 'Performance overlay', false, 'FPS, frame-time graph, draw calls and memory. Shortcut: F3.'),
  ] },
  { id: 'audio', title: 'Audio', items: [
    sl('volMaster', 'Master', 80, 0, 100, 5, pct),
    sl('volMusic', 'Music', 55, 0, 100, 5, pct),
    sl('volSfx', 'Sound effects', 80, 0, 100, 5, pct),
    sl('volCrowd', 'Crowd', 70, 0, 100, 5, pct),
    sl('volVoice', 'Commentary', 80, 0, 100, 5, pct),
  ] },
  { id: 'access', title: 'Accessibility & HUD', items: [
    se('colorblind', 'Colorblind mode', 'off', [['off', 'Off'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']], 'Swaps the interface palette for colors that stay distinct.'),
    sl('textSize', 'Text size', 1, 0.85, 1.4, 0.05, (v) => Math.round(v * 100) + '%'),
    tg('reduceMotion', 'Reduce motion', false, 'Shortens menu transitions and stops the news ticker scrolling.'),
    tg('subtitles', 'Commentary subtitles', true),
    tg('hudScoreboard', 'HUD: scoreboard', true),
    tg('hudShotClock', 'HUD: shot clock', true),
    tg('hudStamina', 'HUD: stamina bars', true),
    tg('hudMinimap', 'HUD: court radar', true),
    tg('hudNames', 'HUD: player names', true),
    tg('hudHints', 'HUD: control hints', true),
  ] },
];

const DEFAULTS = {};
for (const c of SCHEMA) for (const it of c.items) if (it.k) DEFAULTS[it.k] = it.def;

export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→'];
export function codeLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→')
    .replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('Space', 'Space');
}

export class Settings extends Emitter {
  constructor() {
    super();
    this.v = { ...DEFAULTS };
    this.bind = { kb: {}, pad: {} };
    this.resetBindings(true);
    this._load();
  }
  _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      for (const k in DEFAULTS) if (o.v && typeof o.v[k] === typeof DEFAULTS[k]) this.v[k] = o.v[k];
      if (o.bind) for (const kind of ['kb', 'pad']) for (const a of ACTIONS) {
        const x = o.bind[kind] && o.bind[kind][a.id];
        if (typeof x === (kind === 'kb' ? 'string' : 'number')) this.bind[kind][a.id] = x;
      }
    } catch (e) { /* corrupt or unavailable storage: fall back to defaults */ }
  }
  _persist() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ v: this.v, bind: this.bind })); } catch (e) { /* storage full or blocked */ }
    }, 250);
  }
  get(k) { return this.v[k]; }
  set(k, val) {
    if (this.v[k] === val) return;
    this.v[k] = val;
    this.emit('change', k, val);
    if (k === 'gfxPreset' && val !== 'custom') {
      for (const pk of GFX_KEYS) { this.v[pk] = GFX_PRESETS[val][pk]; this.emit('change', pk, this.v[pk]); }
    } else if (GFX_KEYS.includes(k) && this.v.gfxPreset !== 'custom') {
      this.v.gfxPreset = 'custom'; this.emit('change', 'gfxPreset', 'custom');
    }
    if (k === 'camPreset' && val !== 'custom') {
      for (const pk of CAM_KEYS) { this.v[pk] = CAM_PRESETS[val][pk]; this.emit('change', pk, this.v[pk]); }
    } else if (CAM_KEYS.includes(k) && this.v.camPreset !== 'custom') {
      this.v.camPreset = 'custom'; this.emit('change', 'camPreset', 'custom');
    }
    this._persist();
  }
  resetCategory(id) {
    const c = SCHEMA.find((x) => x.id === id);
    if (!c) return;
    if (id === 'controls') this.resetBindings();
    // preset keys first so dependent sliders land on their own defaults afterwards
    for (const it of c.items) if (it.k) this.set(it.k, it.def);
    for (const it of c.items) if (it.k) this.set(it.k, it.def);
  }
  resetBindings(silent) {
    for (const a of ACTIONS) { this.bind.kb[a.id] = a.kb; this.bind.pad[a.id] = a.pad; }
    if (!silent) { this.emit('bindings'); this._persist(); }
  }
  setBinding(kind, action, code) {
    const me = ACTIONS.find((a) => a.id === action);
    const old = this.bind[kind][action];
    for (const a of ACTIONS) {
      if (a.id !== action && this.bind[kind][a.id] === code && (a.group === me.group || a.group === 'Movement' || me.group === 'Movement')) this.bind[kind][a.id] = old;
    }
    this.bind[kind][action] = code;
    this.emit('bindings');
    this._persist();
  }
}
