import { h } from '../core/util.js';

const ICON_PATHS = {
  play: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
  career: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
  franchise: '<path d="M4 20V9l8-5 8 5v11zM9 20v-6h6v6"/>',
  builder: '<rect x="3" y="4" width="8" height="11" rx="1.5"/><rect x="13" y="9" width="8" height="11" rx="1.5"/>',
  street: '<path d="M3 20h18M6 20V8l6-4 6 4v12M10 20v-5h4v5"/>',
  gym: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  creator: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
};
export function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); if (cls) s.setAttribute('class', cls);
  s.innerHTML = ICON_PATHS[name] || '';
  return s;
}

let toastTimer = 0;
export function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

export const btn = (label, onClick, cls = '', extra) => h('button', { class: 'btn ' + cls, 'data-nav': '', onClick, ...extra }, label);

/** Prompt-bar glyphs per input device. */
export function glyphs(device) {
  if (device === 'pad') return { accept: 'A', back: 'B', move: 'D-pad', tabs: 'LB / RB', adjust: '◀ ▶' };
  if (device === 'mouse') return { accept: 'Click', back: 'Esc', move: 'Hover', tabs: 'Q / E', adjust: '◀ ▶' };
  return { accept: 'Enter', back: 'Esc', move: '↑ ↓ ← →', tabs: 'Q / E', adjust: '← →' };
}

const TIPS = [
  'Release the shot at the very top of the meter. Tired legs shrink the window.',
  'A good screen is worth more than a good dribble. Call for one with the screen button.',
  'Contested threes miss more, but the physics decides. A hand in the face changes the release.',
  'Substitute early. Fatigue lowers speed, vertical and shooting, not just effort.',
  'Pass out of double teams: the open man is usually the corner shooter.',
  'Box out. Rebounding position matters more than jumping height.',
  'Shot clock under 8 seconds? Look for a catch-and-shoot rather than isolating.',
  'Tall defenders contest at the rim. Quick ones shut down the dribble drive.',
  'Hold sprint to cover ground, but stamina drains faster than you think.',
  'Every number on a player card is derived from the league data. Nothing is hand-typed.',
  'Press F3 anywhere to open the performance overlay.',
  'Adaptive quality lowers resolution quietly if a frame runs long, then raises it again.',
];
export class Loading {
  constructor() {
    this.root = document.getElementById('loading'); this.fill = document.getElementById('loadFill');
    this.title = document.getElementById('loadTitle'); this.label = document.getElementById('loadLabel'); this.tip = document.getElementById('loadTip');
    this.timer = 0; this.i = (Math.random() * TIPS.length) | 0; this.hideT = 0;
  }
  show(title = 'Loading') {
    clearTimeout(this.hideT);
    this.title.textContent = title; this.set(0, '');
    this.root.classList.remove('hidden'); void this.root.offsetWidth; this.root.classList.remove('fade');
    const next = () => { this.tip.textContent = 'Tip: ' + TIPS[this.i++ % TIPS.length]; };
    next(); clearInterval(this.timer); this.timer = setInterval(next, 3800);
  }
  set(p, label) {
    this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    if (label != null) this.label.textContent = label;
  }
  hide() {
    clearInterval(this.timer);
    this.root.classList.add('fade');
    this.hideT = setTimeout(() => this.root.classList.add('hidden'), 260);
  }
  get visible() { return !this.root.classList.contains('hidden'); }
}
