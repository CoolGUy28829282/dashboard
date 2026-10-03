// Performance overlay + frame statistics (always collected; drawn only when enabled).
const N = 240;
const BUDGET = 12; // ms of CPU work per frame we allow ourselves

export class Perf {
  constructor(root, fpsEl) {
    this.root = root; this.fpsEl = fpsEl;
    this.cv = root.querySelector('canvas'); this.g = this.cv.getContext('2d'); this.pre = root.querySelector('pre');
    this.work = new Float32Array(N); this.gap = new Float32Array(N);
    this.i = 0; this.enabled = false; this.mini = false;
    this.t0 = 0; this.lastWork = 0; this.lastGap = 16.7;
    this.frames = 0; this.accT = 0; this.fps = 0; this.avgGap = 16.7; this.avgWork = 0; this.worst = 0; this.spikes = 0;
    this.info = null; this.extra = null; this.sinceText = 0;
  }
  setEnabled(v) { this.enabled = v; this.root.classList.toggle('hidden', !v); }
  setMini(v) { this.mini = v; this.fpsEl.classList.toggle('hidden', !v); }
  resetSpikes() { this.spikes = 0; this.worst = 0; }
  begin() { this.t0 = performance.now(); }
  end(gap) {
    const w = performance.now() - this.t0;
    this.lastWork = w; this.lastGap = gap;
    this.work[this.i] = w; this.gap[this.i] = gap; this.i = (this.i + 1) % N;
    this.frames++; this.accT += gap;
    if (w > BUDGET) this.spikes++;
    if (gap > this.worst) this.worst = gap;
    if (this.accT >= 250) {
      this.fps = (this.frames * 1000) / this.accT;
      this.avgGap = this.accT / this.frames;
      this.frames = 0; this.accT = 0;
      if (this.mini) this.fpsEl.textContent = Math.round(this.fps) + ' FPS';
      if (this.enabled) this._text();
      this.worst *= 0.85; // decay so one old hitch does not stick forever
    }
    if (this.enabled) this._draw();
  }
  _draw() {
    const g = this.g, H = 64, sc = H / 33.4; // 0..33 ms
    g.clearRect(0, 0, N, H);
    for (let k = 0; k < N; k++) {
      const idx = (this.i + k) % N, gp = this.gap[idx] * sc, w = this.work[idx] * sc;
      g.fillStyle = 'rgba(120,150,255,.45)'; g.fillRect(k, H - gp, 1, gp);
      g.fillStyle = this.work[idx] > BUDGET ? '#ff5468' : '#3ddc84'; g.fillRect(k, H - w, 1, w);
    }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, H - BUDGET * sc, N, 1);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, H - 16.7 * sc, N, 1);
  }
  _text() {
    const i = this.info, e = this.extra || {};
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a';
    this.pre.textContent =
      `${this.fps.toFixed(0)} FPS  ${this.avgGap.toFixed(1)} ms  cpu ${this.lastWork.toFixed(1)}  worst ${this.worst.toFixed(1)}\n` +
      `draws ${i ? i.render.calls : 0}  tris ${i ? (i.render.triangles / 1000).toFixed(0) + 'k' : 0}  geo ${i ? i.memory.geometries : 0}  tex ${i ? i.memory.textures : 0}\n` +
      `js heap ${heap}  scale ${e.scale ? e.scale.toFixed(2) : '-'}  dpr ${e.dpr ? e.dpr.toFixed(2) : '-'}  >12ms: ${this.spikes}\n` +
      `refresh ~${e.refresh ? (1000 / e.refresh).toFixed(0) : '?'} Hz  cap ${e.cap || 'display'}  (F4 resets)`;
  }
}
