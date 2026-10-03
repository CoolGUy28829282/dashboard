// Small shared helpers. Nothing here allocates in hot paths except h() (UI construction only).
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (r, arr) => arr[(r() * arr.length) | 0];
export function gauss(r) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}
export function shuffle(r, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/** Critically damped scalar smoothing (Unity-style SmoothDamp). `st.v` carries velocity. */
export function smoothDamp(cur, tgt, st, smooth, dt) {
  const o = 2 / Math.max(0.0001, smooth), x = o * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const d = cur - tgt, t = (st.v + o * d) * dt;
  st.v = (st.v - o * t) * e;
  return tgt + (d + t) * e;
}
export function dampAngle(cur, tgt, rate, dt) {
  let d = ((tgt - cur + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return cur + d * (1 - Math.exp(-rate * dt));
}

export class Emitter {
  constructor() { this._m = new Map(); }
  on(e, f) {
    let s = this._m.get(e);
    if (!s) this._m.set(e, (s = new Set()));
    s.add(f);
    return () => s.delete(f);
  }
  emit(e, a, b, c) {
    const s = this._m.get(e);
    if (s) for (const f of s) f(a, b, c);
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6); }
export function hsl2hex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
export function shade(c, f) {
  const r = clamp(((c >> 16) & 255) * f, 0, 255) | 0, g = clamp(((c >> 8) & 255) * f, 0, 255) | 0, b = clamp((c & 255) * f, 0, 255) | 0;
  return (r << 16) | (g << 8) | b;
}
export const fmtMoney = (m) => '$' + m.toFixed(1) + 'M';
export const fmtHeight = (inch) => `${Math.floor(inch / 12)}'${Math.round(inch % 12)}"`;
export function ovrColor(o) {
  return o >= 90 ? '#c9a0ff' : o >= 80 ? '#ffd24a' : o >= 70 ? '#6be08f' : o >= 60 ? '#8cc7ff' : '#aab4c8';
}
