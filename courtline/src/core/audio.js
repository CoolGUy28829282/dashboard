// Procedural audio. All samples are synthesised at load (in small chunks across frames), then played from a fixed pool of
// gain nodes scheduled on the Web Audio clock. Music runs a look-ahead scheduler on the same clock, never on the render loop.
import { mulberry32, nextFrame } from './util.js';

const SR = 44100;
const MAX_VOICES = 24;

function buf(len, fn) {
  const b = new AudioBuffer({ length: len | 0, sampleRate: SR, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  fn(d, len | 0);
  return b;
}
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);
const noiseRng = mulberry32(1234);
const white = () => noiseRng() * 2 - 1;

// name -> [seconds, generator(d, n)]
const SFX = {
  click: [0.05, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * (1700 - 6000 * t) * t) * env(t, 0.001, 0.012) * 0.6; } }],
  hover: [0.03, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 1250 * t) * env(t, 0.001, 0.007) * 0.3; } }],
  confirm: [0.2, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR, f = t < 0.08 ? 660 : 990; d[i] = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env(t % 0.08, 0.002, 0.05) * 0.4; } }],
  back: [0.14, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * (720 - 1500 * t) * t) * env(t, 0.002, 0.05) * 0.45; } }],
  error: [0.18, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(2 * Math.PI * 150 * t) > 0 ? 1 : -1) * env(t, 0.003, 0.07) * 0.22; } }],
  whoosh: [0.5, (d, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (white() - lp) * (0.04 + 0.5 * Math.sin(Math.PI * t / 0.5)); d[i] = lp * Math.sin(Math.PI * t / 0.5) ** 2 * 1.4; } }],
  bounce: [0.22, (d, n) => { let lp = 0; for (let i = 0; i < n; i++) { const t = i / SR; lp += (white() - lp) * 0.25; d[i] = (Math.sin(2 * Math.PI * (130 - 260 * t) * t) * env(t, 0.001, 0.045) + lp * env(t, 0.0005, 0.008) * 0.5) * 0.9; } }],
  swish: [0.6, (d, n) => { let lp = 0, hp = 0; for (let i = 0; i < n; i++) { const t = i / SR; const x = white(); lp += (x - lp) * 0.5; hp = lp - hp * 0.9; d[i] = hp * env(t, 0.012, 0.11) * 0.55; } }],
  rim: [0.7, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (Math.sin(2 * Math.PI * 1180 * t) * 0.5 + Math.sin(2 * Math.PI * 1830 * t) * 0.35 + Math.sin(2 * Math.PI * 2640 * t) * 0.25 + white() * 0.3 * Math.exp(-t / 0.004)) * env(t, 0.0005, 0.12) * 0.7; } }],
  squeak: [0.16, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const f = 1900 + 900 * Math.sin(Math.PI * t / 0.16) + 60 * Math.sin(80 * t); d[i] = (Math.sin(2 * Math.PI * f * t) * 0.6 + white() * 0.15) * Math.sin(Math.PI * t / 0.16) * 0.28; } }],
  buzzer: [1.0, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const s = (Math.sin(2 * Math.PI * 220 * t) > 0 ? 1 : -1) + (Math.sin(2 * Math.PI * 223 * t) > 0 ? 1 : -1); d[i] = s * 0.25 * Math.min(1, t / 0.01) * Math.min(1, (1 - t) / 0.05); } }],
  tick: [0.04, (d, n) => { for (let i = 0; i < n; i++) { const t = i / SR; d[i] = Math.sin(2 * Math.PI * 2400 * t) * env(t, 0.0005, 0.006) * 0.4; } }],
  cheer: [1.8, (d, n) => { let b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const t = i / SR; const x = white(); b1 += (x - b1) * 0.12; b2 += (b1 - b2) * 0.3; d[i] = (b1 - b2) * 5 * Math.sin(Math.PI * Math.min(1, t / 1.8)) ** 1.5 * (0.8 + 0.2 * Math.sin(t * 40)); } }],
};

const MOODS = {
  menu: { bpm: 92, root: 57, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]], bass: [0, -4, 3, -2], kick: [0, 8], hat: [2, 6, 10, 14], arp: 0.5, pad: 0.05 },
  pregame: { bpm: 108, root: 52, chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], bass: [0, -2, -4, -5], kick: [0, 4, 8, 12], hat: [2, 6, 10, 14, 15], arp: 0.8, pad: 0.04 },
  timeout: { bpm: 84, root: 50, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [0, 4, 7, 11], [7, 11, 14, 17]], bass: [0, 5, 0, 7], kick: [0, 10], hat: [4, 12], arp: 0.3, pad: 0.06 },
};
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.buffers = {}; this.ready = false;
    this.pool = []; this.active = 0;
    this.mood = null; this.musicTimer = 0; this.step = 0; this.nextT = 0; this.bar = 0; this.rng = mulberry32(99);
  }
  /** Synthesise sample buffers in chunks so loading never freezes. Safe to call before any user gesture. */
  async prepare(progress) {
    const names = Object.keys(SFX);
    for (let i = 0; i < names.length; i++) {
      const [sec, fn] = SFX[names[i]];
      this.buffers[names[i]] = buf(sec * SR, fn);
      if (progress) progress((i + 1) / (names.length + 2));
      await nextFrame();
    }
    this.buffers.noise = buf(SR, (d, n) => { for (let i = 0; i < n; i++) d[i] = white(); });
    await nextFrame();
    // 8 s of crowd murmur: band-limited noise with slow swells, looped
    this.buffers.murmur = buf(SR * 8, (d, n) => {
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, x = white();
        a += (x - a) * 0.06; b += (a - b) * 0.2;
        d[i] = (a - b) * 6 * (0.6 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3 + 1)) * Math.min(1, t / 0.2) * Math.min(1, (8 - t) / 0.2);
      }
    });
    this.buffers.ir = buf(SR * 1.6, (d, n) => { for (let i = 0; i < n; i++) d[i] = white() * Math.exp(-i / SR / 0.35) * (i < 200 ? i / 200 : 1); });
    if (progress) progress(1);
    this.ready = true;
  }
  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive', sampleRate: SR }));
      const mk = () => { const g = ctx.createGain(); return g; };
      this.master = mk(); this.musicBus = mk(); this.sfxBus = mk(); this.crowdBus = mk(); this.voiceBus = mk();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      this.musicBus.connect(this.master); this.sfxBus.connect(this.master); this.crowdBus.connect(this.master); this.voiceBus.connect(this.master);
      this.master.connect(comp); comp.connect(ctx.destination);
      if (this.buffers.ir) {
        this.verb = ctx.createConvolver(); this.verb.buffer = this.buffers.ir;
        this.verbSend = mk(); this.verbSend.gain.value = 0.18;
        this.verbSend.connect(this.verb); this.verb.connect(this.master);
      }
      for (let i = 0; i < MAX_VOICES; i++) { const g = mk(); g.connect(this.sfxBus); if (this.verbSend) g.connect(this.verbSend); this.pool.push(g); }
      this.applyVolumes(true);
      this._ambience();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
      });
    } catch (e) { this.ctx = null; }
  }
  applyVolumes(instant) {
    if (!this.ctx) return;
    const s = this.settings, t = this.ctx.currentTime, set = (n, v) => { if (instant) n.gain.value = v; else n.gain.setTargetAtTime(v, t, 0.03); };
    set(this.master, (s.get('volMaster') / 100) ** 1.6);
    set(this.musicBus, (s.get('volMusic') / 100) ** 1.6 * 0.7);
    set(this.sfxBus, (s.get('volSfx') / 100) ** 1.6);
    set(this.crowdBus, (s.get('volCrowd') / 100) ** 1.6 * 0.5);
    set(this.voiceBus, (s.get('volVoice') / 100) ** 1.6);
  }
  /** Play a sample. Drops the sound if every pooled voice is busy (never allocates more gain nodes). */
  sfx(name, vol = 1, rate = 1) {
    if (!this.ctx || !this.ready || this.ctx.state !== 'running') return;
    const b = this.buffers[name];
    const g = this.pool.pop();
    if (!b || !g) { if (g) this.pool.push(g); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.playbackRate.value = rate;
    g.gain.value = vol;
    src.connect(g);
    src.onended = () => { src.disconnect(); this.pool.push(g); };
    src.start(this.ctx.currentTime);
  }
  _ambience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.buffers.murmur; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.9;
    src.connect(bp); bp.connect(g); g.connect(this.crowdBus);
    src.start();
    // faint HVAC / arena hum
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 58;
    const og = ctx.createGain(); og.gain.value = 0.02; o.connect(og); og.connect(this.crowdBus); o.start();
  }
  // ---- music ----
  setMood(name) {
    if (name === this.mood) return;
    this.mood = name;
    if (!this.ctx) return;
    clearInterval(this.musicTimer);
    if (!name) return;
    this.step = 0; this.bar = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this._schedule(), 90);
  }
  _schedule() {
    const ctx = this.ctx, m = MOODS[this.mood];
    if (!ctx || !m || ctx.state !== 'running') return;
    const spb = 60 / m.bpm / 4; // 16th
    while (this.nextT < ctx.currentTime + 0.3) {
      this._step(m, this.step, this.bar, this.nextT, spb);
      this.nextT += spb;
      if (++this.step === 16) { this.step = 0; this.bar = (this.bar + 1) % 4; }
    }
  }
  _tone(f, t, dur, type, vol, atk = 0.005, lp = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
    n.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, vol, hp) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = this.buffers.noise; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicBus); s.start(t, this.rng()); s.stop(t + dur + 0.02);
  }
  _step(m, st, bar, t, spb) {
    const chord = m.chords[bar], root = m.root + m.bass[bar];
    if (st === 0) for (const iv of chord) this._tone(mtof(m.root + iv + 12), t, spb * 16, 'sawtooth', m.pad, 0.4, 900);
    if (m.kick.includes(st)) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.25);
    }
    if (st === 4 || st === 12) this._noise(t, 0.12, 0.18, 1800);
    if (m.hat.includes(st)) this._noise(t, 0.035, 0.07, 7000);
    if (st === 0 || st === 6 || st === 10) this._tone(mtof(root - 12), t, spb * 3.5, 'triangle', 0.3, 0.004, 400);
    if (st % 2 === 0 && this.rng() < m.arp * 0.55) {
      const n = m.root + chord[(this.rng() * chord.length) | 0] + (this.rng() < 0.5 ? 24 : 12);
      this._tone(mtof(n), t, spb * 2.2, 'square', 0.035, 0.004, 2400);
    }
    if (st === 8 && this.rng() < 0.5) this._tone(mtof(m.root + 24 + SCALE[(this.rng() * SCALE.length) | 0]), t, spb * 5, 'triangle', 0.07, 0.01, 3000);
  }
  /** Spoken commentary (Web Speech API). Volume follows the commentary slider. */
  speak(text) {
    try {
      const v = this.settings.get('volVoice') / 100 * this.settings.get('volMaster') / 100;
      if (!('speechSynthesis' in globalThis) || v <= 0) return;
      const u = new SpeechSynthesisUtterance(text); u.volume = Math.min(1, v * 1.2); u.rate = 1.08;
      speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  }
}
