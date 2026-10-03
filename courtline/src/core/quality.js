// Adaptive resolution: step down when frames miss the display's refresh, step back up with sustained headroom.
const LEVELS = [1, 0.9, 0.8, 0.7, 0.6];

export class Quality {
  constructor(gfx, settings) {
    this.gfx = gfx; this.settings = settings;
    this.level = 0; this.refresh = 0; this.samples = new Float32Array(90); this.n = 0;
    this.ema = 16.7; this.emaWork = 4; this.bad = 0; this.good = 0; this.changed = 0;
  }
  update(now, gap, work, capMs) {
    if (gap > 120) return; // resume-from-hidden spike
    if (this.n < 90) {
      this.samples[this.n++] = gap;
      if (this.n === 90) {
        const s = Array.from(this.samples).sort((a, b) => a - b);
        this.refresh = Math.min(34, Math.max(4.5, s[45]));
      }
      return;
    }
    this.ema += (gap - this.ema) * 0.08;
    this.emaWork += (work - this.emaWork) * 0.08;
    if (!this.settings.get('adaptive')) { if (this.level) this._apply(0, now); return; }
    const target = Math.max(this.refresh, capMs || 0);
    if (this.ema > target * 1.3) { this.bad++; this.good = 0; }
    else if (this.ema < target * 1.1 && this.emaWork < target * 0.55) { this.good++; this.bad = 0; }
    else { this.bad = 0; this.good = 0; }
    if (this.bad > 45 && this.level < LEVELS.length - 1 && now - this.changed > 1000) this._apply(this.level + 1, now);
    else if (this.good > 360 && this.level > 0 && now - this.changed > 4000) this._apply(this.level - 1, now);
  }
  _apply(level, now) {
    this.level = level; this.changed = now; this.bad = 0; this.good = 0;
    this.gfx.setDynamicScale(LEVELS[level]);
  }
}
