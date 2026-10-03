// Procedural audio: engine, rain, thunder, blips and a small synth sequencer (no samples).
import { CFG } from './config.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const MUSIC = {
  Synthwave: { bpm: 108, prog: [57, 53, 60, 55], kick: 1, snare: 1, hat: 1, bass: [0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 7, 5, 0], arp: [0, 1, 2, 3, 2, 1, 2, 3], arpWave: 'sawtooth', pad: 1 },
  Darksynth: { bpm: 128, prog: [45, 45, 48, 43], kick: 1, snare: 1, hat: 1, bass: [0, 0, 0, 12, 0, 0, 0, 6, 0, 0, 0, 12, 0, 0, 6, 0], arp: [0, 2, 1, 3, 0, 2, 3, 1], arpWave: 'square', pad: 1, drive: 1 },
  Ambient: { bpm: 70, prog: [57, 55, 53, 52], kick: 0, snare: 0, hat: 0, bass: [], arp: [0, 3, 2, 1], arpWave: 'sine', pad: 1, slow: 1 },
};

export class AudioEngine {
  constructor() { this.ctx = null; this.on = false; }
  init() {
    if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      const delay = c.createDelay(1); delay.delayTime.value = 0.28; const fb = c.createGain(); fb.gain.value = 0.35; const dg = c.createGain(); dg.gain.value = 0.35;
      delay.connect(fb); fb.connect(delay); delay.connect(dg); dg.connect(this.musicBus); this.delay = delay;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const eg = this.eng = c.createGain(); eg.gain.value = 0.05;
      this.o1 = c.createOscillator(); this.o2 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2.type = 'square';
      this.o1.connect(lp); this.o2.connect(lp); lp.connect(eg); eg.connect(this.sfx); this.o1.start(); this.o2.start();
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
      const n = c.createBufferSource(); n.buffer = buf; n.loop = true; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      this.rainG = c.createGain(); this.rainG.gain.value = 0; n.connect(hp); hp.connect(this.rainG); this.rainG.connect(this.sfx); n.start();
      this.on = true; this.apply(); this.startMusic();
    } catch (e) { this.ctx = null; }
  }
  apply() {
    if (!this.ctx) return;
    this.master.gain.value = CFG.master; this.sfx.gain.value = CFG.sfxVol; this.musicBus.gain.value = CFG.musicVol * 0.5;
    if (this.mode !== CFG.music) this.startMusic();
  }
  engine(v, thr, boost, rain) {
    if (!this.ctx) return; const f = 38 + ((v * 3.6) % 70) * 1.4 + v * 0.6 + (boost ? 25 : 0);
    this.o1.frequency.value = f; this.o2.frequency.value = f * 0.503; this.eng.gain.value = 0.035 + (thr ? 0.02 : 0); this.rainG.gain.value = 0.03 * rain;
  }
  blip(f, d = 0.1) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.05; g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.connect(g); g.connect(this.sfx); o.start(); o.stop(c.currentTime + d); }
  thunder(delay = 0.4) {
    const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noise; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; const g = c.createGain(); const t = c.currentTime + delay;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(60, t + 3); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + 3.3);
  }
  crash() { const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noise; const lp = c.createBiquadFilter(); lp.frequency.value = 1200; const g = c.createGain(); g.gain.setValueAtTime(0.8, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5); s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start(); s.stop(c.currentTime + 0.5); }
  setSuspended(sus) { if (!this.ctx) return; sus ? this.ctx.suspend() : this.ctx.resume(); }

  // ---- sequencer (16th-note grid, 4-bar chord loop)
  startMusic() {
    clearInterval(this.timer); this.mode = CFG.music; if (!this.ctx || CFG.music === 'Off' || !MUSIC[CFG.music]) return;
    this.step = 0; this.next = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.sched(), 30);
  }
  sched() { const st = MUSIC[this.mode]; if (!st) return; const dur = 60 / st.bpm / 4; while (this.next < this.ctx.currentTime + 0.18) { this.note(st, this.step, this.next); this.next += dur; this.step++; } }
  voice(type, freq, t, len, gain, cutoff, dest = this.musicBus, echo = false) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(f); f.connect(g); g.connect(dest); if (echo) g.connect(this.delay); o.start(t); o.stop(t + len + 0.05);
  }
  note(st, i, t) {
    const c = this.ctx, s = i % 16, bar = Math.floor(i / 16) % 4, root = st.prog[bar], q = 60 / st.bpm / 4;
    if (st.kick && s % 4 === 0) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.25); }
    if (st.snare && (s === 4 || s === 12)) { const n = c.createBufferSource(); n.buffer = this.noise; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); n.connect(bp); bp.connect(g); g.connect(this.musicBus); g.connect(this.delay); n.start(t, Math.random()); n.stop(t + 0.18); }
    if (st.hat && s % 2 === 1) { const n = c.createBufferSource(); n.buffer = this.noise; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); n.connect(hp); hp.connect(g); g.connect(this.musicBus); n.start(t, Math.random()); n.stop(t + 0.06); }
    const b = st.bass[s]; if (b !== undefined && st.bass.length && !(s % 2) ) this.voice('sawtooth', mtof(root - 24 + b), t, q * 1.8, 0.45, st.drive ? 900 : 500);
    const chord = [0, 3, 7, 12]; const a = st.arp[i % st.arp.length]; if (!st.slow || s % 4 === 0) this.voice(st.arpWave, mtof(root + 12 + chord[a] + (s % 8 > 3 ? 12 : 0)), t, q * (st.slow ? 5 : 1.6), st.slow ? 0.16 : 0.2, 2600, this.musicBus, true);
    if (st.pad && s === 0) for (const iv of chord) { this.voice('sawtooth', mtof(root + iv) * 1.003, t, q * 15, 0.07, 900); this.voice('sawtooth', mtof(root + iv) * 0.997, t, q * 15, 0.07, 900); }
  }
}
