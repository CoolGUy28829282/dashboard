// Procedural audio: engine, radio stations (synth sequencer), gunshots, explosions, sirens, ambience. No samples.
import { CFG } from './config.js';
import { clamp } from './util.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const STATIONS = [
  { name: 'NEON FM 88.1', genre: 'Synthwave', bpm: 104, prog: [57, 53, 60, 55], style: 'synth', track: ['Midnight Drive', 'Chrome Hearts', 'Palm Reflections'] },
  { name: 'CALLE OCHO 94.5', genre: 'Latin Trap', bpm: 92, prog: [57, 57, 53, 55], style: 'latin', track: ['Fuego en Miami', 'Noche Eléctrica', 'Calor'] },
  { name: 'CHROME 103.7', genre: 'Darksynth', bpm: 126, prog: [45, 45, 48, 43], style: 'dark', track: ['Neon Pursuit', 'Kill Switch', 'Overdrive'] },
  { name: 'LAGOON FM 99.9', genre: 'Chill Wave', bpm: 78, prog: [60, 57, 53, 55], style: 'chill', track: ['Sunset Bay', 'Salt Air', 'Slow Tide'] },
  { name: 'RADIO OFF', genre: '', bpm: 0, prog: [], style: 'off', track: [''] },
];

export class AudioSys {
  constructor() { this.ctx = null; this.station = CFG.station; this.inCar = false; this.hornOsc = null; this.sirenLevel = 0; this.lastSfx = {}; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      const c = this.ctx = new AC(); this.master = c.createGain(); this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.radioLP = c.createBiquadFilter(); this.radioLP.type = 'lowpass'; this.radioLP.frequency.value = 400; this.radioBus = c.createGain(); this.radioBus.connect(this.radioLP); this.radioLP.connect(this.master);
      const delay = c.createDelay(1); delay.delayTime.value = 0.3; const fb = c.createGain(); fb.gain.value = 0.32; const dg = c.createGain(); dg.gain.value = 0.3; delay.connect(fb); fb.connect(delay); delay.connect(dg); dg.connect(this.radioBus); this.delay = delay;
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; this.engG = c.createGain(); this.engG.gain.value = 0; this.o1 = c.createOscillator(); this.o2 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2.type = 'square'; this.o1.connect(lp); this.o2.connect(lp); lp.connect(this.engG); this.engG.connect(this.sfx); this.o1.start(); this.o2.start(); this.engLP = lp;
      const rn = c.createBufferSource(); rn.buffer = buf; rn.loop = true; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; this.rainG = c.createGain(); this.rainG.gain.value = 0; rn.connect(hp); hp.connect(this.rainG); this.rainG.connect(this.sfx); rn.start();
      const so = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(); so.type = 'sawtooth'; lfo.frequency.value = 0.35; lg.gain.value = 260; so.frequency.value = 900; lfo.connect(lg); lg.connect(so.frequency); const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1100; sf.Q.value = 0.6; this.sirenG = c.createGain(); this.sirenG.gain.value = 0; so.connect(sf); sf.connect(this.sirenG); this.sirenG.connect(this.sfx); so.start(); lfo.start();
      this.apply(); this.startRadio();
    } catch (e) { this.ctx = null; }
  }
  apply() { if (!this.ctx) return; this.master.gain.value = CFG.master; this.sfx.gain.value = CFG.sfxVol; this.radioBus.gain.value = CFG.radioVol * 0.55 * (this.inCar ? 1 : 0.35); this.radioLP.frequency.value = this.inCar ? 12000 : 500; }
  setInCar(b) { if (this.inCar === b) return; this.inCar = b; this.apply(); }
  enterCar() { this.setInCar(true); this.blip(180, 0.08, 'square', 0.05); }
  engine(speed, thr, vmax, hover) {
    if (!this.ctx) return; const r = clamp(speed / vmax, 0, 1), gear = Math.min(4, Math.floor(r * 5)), band = r * 5 - gear, rpm = 0.25 + band * 0.75 + thr * 0.1;
    const f = hover ? 90 + r * 520 : 34 + rpm * 90 + gear * 4; this.o1.frequency.value = f; this.o2.frequency.value = f * (hover ? 2.01 : 0.503); this.o1.type = hover ? 'sine' : 'sawtooth'; this.o2.type = hover ? 'sine' : 'square';
    this.engG.gain.value = (this.inCar ? 0.045 : 0.02) + thr * 0.03; this.engLP.frequency.value = 350 + rpm * 900;
  }
  engineOff() { if (this.ctx) this.engG.gain.value = 0; }
  setRain(v) { if (this.ctx) this.rainG.gain.value = 0.035 * v; }
  setSiren(level) { if (!this.ctx) return; this.sirenG.gain.value = clamp(level, 0, 1) * 0.05; }
  // ---- sfx
  blip(f, d = 0.1, type = 'square', g = 0.05) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), gg = c.createGain(); o.type = type; o.frequency.value = f; gg.gain.value = g; gg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.connect(gg); gg.connect(this.sfx); o.start(); o.stop(c.currentTime + d); }
  burst(dur, freq, q, gain, dist = 0, type = 'lowpass', sweepTo) {
    const c = this.ctx; if (!c) return; const att = clamp(1 - dist / 220, 0.05, 1); if (att < 0.06) return; const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, c.currentTime); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, c.currentTime + dur); f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(gain * att, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur); s.connect(f); f.connect(g); g.connect(this.sfx); s.start(c.currentTime, Math.random()); s.stop(c.currentTime + dur + 0.02);
  }
  shoot(type, dist = 0) { const t = this.ctx ? this.ctx.currentTime : 0; if (this.lastSfx[type] && t - this.lastSfx[type] < 0.04) return; this.lastSfx[type] = t; if (type === 'pistol') { this.burst(0.16, 2600, 1, 0.55, dist, 'bandpass'); this.burst(0.2, 400, 1, 0.5, dist); } else if (type === 'smg') { this.burst(0.09, 3200, 1, 0.4, dist, 'bandpass'); this.burst(0.12, 500, 1, 0.35, dist); } else if (type === 'shotgun') { this.burst(0.35, 1500, 1, 0.8, dist); this.burst(0.4, 250, 1, 0.8, dist); } else if (type === 'rpg') { this.burst(0.6, 900, 1, 0.6, dist, 'lowpass', 120); } }
  boom(dist = 0) { this.burst(1.6, 700, 1, 1.0, dist * 0.5, 'lowpass', 40); this.burst(0.5, 4000, 1, 0.6, dist * 0.5, 'bandpass'); }
  thud(v = 0.5, dist = 0) { this.burst(0.25, 300, 1, 0.8 * v, dist, 'lowpass', 60); this.burst(0.12, 2500, 1, 0.3 * v, dist, 'bandpass'); }
  thunder(delay = 0.3) { const c = this.ctx; if (!c) return; setTimeout(() => this.burst(3, 800, 1, 1.0, 0, 'lowpass', 50), delay * 1000); }
  punch() { this.burst(0.1, 500, 1, 0.5, 0, 'lowpass', 120); } click() { this.blip(1200, 0.03, 'square', 0.05); } reload() { this.blip(500, 0.05, 'square', 0.05); setTimeout(() => this.blip(800, 0.06, 'square', 0.05), 220); } pickup() { this.blip(880, 0.08, 'triangle', 0.08); setTimeout(() => this.blip(1320, 0.12, 'triangle', 0.08), 80); }
  horn() { this.hornHold(true); setTimeout(() => this.hornHold(false), 160); }
  hornHold(on) { const c = this.ctx; if (!c) return; if (on && !this.hornOsc) { const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o.type = o2.type = 'square'; o.frequency.value = 420; o2.frequency.value = 520; g.gain.value = 0.05; o.connect(g); o2.connect(g); g.connect(this.sfx); o.start(); o2.start(); this.hornOsc = [o, o2, g]; } else if (!on && this.hornOsc) { this.hornOsc[0].stop(); this.hornOsc[1].stop(); this.hornOsc = null; } }
  // ---- radio
  nextStation(dir) { this.station = (this.station + dir + STATIONS.length) % STATIONS.length; CFG.station = this.station; this.startRadio(); this.onStation && this.onStation(STATIONS[this.station]); }
  startRadio() { clearInterval(this.timer); if (!this.ctx) return; const st = STATIONS[this.station]; if (st.style === 'off') return; this.step = 0; this.next = this.ctx.currentTime + 0.1; this.timer = setInterval(() => this.sched(), 30); }
  sched() { const st = STATIONS[this.station], dur = 60 / st.bpm / 4; while (this.next < this.ctx.currentTime + 0.18) { this.note(st, this.step, this.next); this.next += dur; this.step++; } }
  voice(type, freq, t, len, gain, cutoff, echo = false) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len); o.connect(f); f.connect(g); g.connect(this.radioBus); if (echo) g.connect(this.delay); o.start(t); o.stop(t + len + 0.05); }
  drum(kind, t, g = 1) { const c = this.ctx; if (kind === 'kick') { const o = c.createOscillator(), gg = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); gg.gain.setValueAtTime(0.9 * g, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(gg); gg.connect(this.radioBus); o.start(t); o.stop(t + 0.25); return; } const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter(), gg = c.createGain(); if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7000; gg.gain.setValueAtTime(0.16 * g, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.05); } else { f.type = 'bandpass'; f.frequency.value = kind === 'clap' ? 1500 : 1800; gg.gain.setValueAtTime(0.5 * g, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.15); gg.connect(this.delay); } n.connect(f); f.connect(gg); gg.connect(this.radioBus); n.start(t, Math.random()); n.stop(t + 0.18); }
  note(st, i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4, root = st.prog[bar], q = 60 / st.bpm / 4, chord = [0, 3, 7, 12];
    if (st.style === 'synth') { if (s % 4 === 0) this.drum('kick', t); if (s === 4 || s === 12) this.drum('snare', t); if (s % 2) this.drum('hat', t); const b = [0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 0, 7, 5, 0][s]; if (s % 2 === 0) this.voice('sawtooth', mtof(root - 24 + b), t, q * 1.8, 0.4, 500); this.voice('sawtooth', mtof(root + 12 + chord[[0, 1, 2, 3, 2, 1, 2, 3][i % 8]] + (s % 8 > 3 ? 12 : 0)), t, q * 1.6, 0.18, 2600, true); if (s === 0) for (const iv of chord) { this.voice('sawtooth', mtof(root + iv) * 1.003, t, q * 15, 0.06, 900); this.voice('sawtooth', mtof(root + iv) * 0.997, t, q * 15, 0.06, 900); } }
    else if (st.style === 'latin') { if (s % 4 === 0) this.drum('kick', t); if ([3, 6, 11, 14].includes(s)) this.drum('clap', t); this.drum('hat', t, s % 2 ? 0.8 : 0.4); if ([0, 3, 8, 11, 14].includes(s)) this.voice('sine', mtof(root - 24), t, q * 2.5, 0.7, 300); if ([0, 3, 6, 8, 10, 13].includes(s)) this.voice('triangle', mtof(root + 12 + [0, 3, 7, 10, 7, 3][i % 6]), t, q * 1.2, 0.22, 3000, true); if (s === 0) this.voice('sawtooth', mtof(root + 7), t, q * 15, 0.05, 700); }
    else if (st.style === 'dark') { if (s % 4 === 0) this.drum('kick', t); if (s === 4 || s === 12) this.drum('snare', t); if (s % 2) this.drum('hat', t, 0.7); if (s % 2 === 0) this.voice('sawtooth', mtof(root - 24 + ([0, 0, 0, 12, 0, 0, 6, 0][s % 8])), t, q * 1.6, 0.45, 900); this.voice('square', mtof(root + 12 + chord[[0, 2, 1, 3, 0, 2, 3, 1][i % 8]]), t, q * 1.2, 0.14, 2200, true); }
    else if (st.style === 'chill') { if (s === 0 || s === 8) this.drum('kick', t, 0.7); if (s === 4 || s === 12) this.drum('snare', t, 0.5); if (s % 4 === 2) this.drum('hat', t, 0.5); if (s % 4 === 0) this.voice('triangle', mtof(root + 12 + chord[(i >> 2) % 4]), t, q * 5, 0.2, 1800, true); if (s === 0) for (const iv of chord) this.voice('sine', mtof(root + iv), t, q * 15, 0.1, 800); }
  }
}
