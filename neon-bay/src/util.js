// Shared helpers: math, seeded rng, spatial hash, canvas textures.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const wrapAngle = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
export const angDiff = (a, b) => wrapAngle(b - a);
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const col = (hex, m = 1) => new THREE.Color(hex).multiplyScalar(m);
export const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

// heading a: forward = (cos a, sin a) in (x,z); right = (-sin a, cos a). Mesh front is -z.
export const meshYaw = a => -a - Math.PI / 2;

export function canvasTex(w, h, draw, srgb = true, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// paint all vertices one colour (vertex-colour tint used by merged geometry)
export function colorize(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

// uniform-grid spatial hash for AABBs / circles
export class Grid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  _k(i, j) { return i * 73856093 ^ j * 19349663; }
  add(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = this._k(i, j); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(item); }
  }
  query(x0, z0, x1, z1, cb) {
    const c = this.cell, seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const a = this.map.get(this._k(i, j)); if (!a) continue; for (const it of a) { if (seen.has(it)) continue; seen.add(it); cb(it); } }
  }
}

// ray (ox,oz,dx,dz) vs AABB -> distance or Infinity
export function rayAabb(ox, oz, dx, dz, b, maxD) {
  let t0 = 0, t1 = maxD;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oz, dz, b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; } else { let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return Infinity; }
  }
  return t0;
}

export function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
