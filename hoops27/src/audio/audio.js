// WebAudio synthesis (no sample files): spatialised ball/rim sounds, reactive crowd bed, UI blips, buzzer/whistle, generative music pad.
export class AudioEngine {
  constructor(settings) {
    this.s = settings; this.ctx = null; this.started = false; this.crowdLevel = 0.25; this.crowdTarget = 0.25; this.clutch = false; this.musicTimer = null; this.step = 0;
  }
  ensure() {
    if (!this.allowed) return null; // browsers require a user gesture first
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
    const c = this.ctx = new Ctx();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.bus = {}; for (const k of ['music', 'sfx', 'crowd', 'commentary']) { this.bus[k] = c.createGain(); this.bus[k].connect(this.master); }
    // shared noise buffer
    const len = c.sampleRate * 2; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } this.noise = b; // brown-ish
    const wb = c.createBuffer(1, len, c.sampleRate); const wd = wb.getChannelData(0); for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1; this.white = wb;
    this.applyVolumes(); this.startCrowd(); return c;
  }
  applyVolumes() {
    if (!this.ctx) return; const a = this.s.audio; const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05); this.bus.music.gain.setTargetAtTime(a.music * 0.5, t, 0.05); this.bus.sfx.gain.setTargetAtTime(a.sfx, t, 0.05); this.bus.crowd.gain.setTargetAtTime(a.crowd, t, 0.05); this.bus.commentary.gain.setTargetAtTime(a.commentary, t, 0.05);
  }
  listener(pos, forward) { const c = this.ctx; if (!c) return; const L = c.listener; if (L.positionX) { L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z; L.forwardX.value = forward.x; L.forwardY.value = 0; L.forwardZ.value = forward.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } }
  out(bus, pos) {
    const c = this.ctx; if (!pos) return this.bus[bus];
    const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 0.8;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } p.connect(this.bus[bus]); setTimeout(() => p.disconnect(), 2500); return p;
  }
  tone({ f = 440, f2 = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, bus = 'sfx', pos = null, delay = 0 }) {
    const c = this.ensure(); if (!c) return; const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.out(bus, pos)); o.start(t); o.stop(t + dur + 0.05);
  }
  burst({ dur = 0.2, vol = 0.3, hp = 0, lp = 18000, bp = 0, q = 1, buf = 'white', pos = null, bus = 'sfx', delay = 0, attack = 0.002 }) {
    const c = this.ensure(); if (!c) return; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = buf === 'white' ? this.white : this.noise; s.loop = true; let node = s;
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; node.connect(f); node = f; }
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; node.connect(f2); node = f2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); node.connect(g); g.connect(this.out(bus, pos));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // ---- game sounds
  dribble(pos) { this.tone({ f: 150, f2: 55, dur: 0.11, vol: 0.5, pos, type: 'sine' }); this.burst({ dur: 0.04, vol: 0.12, hp: 1500, pos }); }
  floor(pos, speed = 5) { const v = Math.min(0.7, 0.1 + speed * 0.06); this.tone({ f: 170, f2: 60, dur: 0.14, vol: v, pos }); this.burst({ dur: 0.05, vol: v * 0.3, hp: 1200, pos }); }
  rim(pos, speed = 5) { const v = Math.min(0.6, 0.15 + speed * 0.05); [520, 1130, 1870, 2650].forEach((f, i) => this.tone({ f, dur: 0.5 - i * 0.07, vol: v / (1 + i * 0.8), type: 'triangle', pos })); this.burst({ dur: 0.06, vol: v * 0.5, bp: 2500, q: 2, pos }); }
  board(pos, speed = 5) { this.tone({ f: 210, f2: 120, dur: 0.22, vol: Math.min(0.6, 0.12 + speed * 0.05), type: 'triangle', pos }); this.burst({ dur: 0.1, vol: 0.2, bp: 600, q: 1, pos }); }
  swish(pos) { this.burst({ dur: 0.32, vol: 0.4, hp: 3500, lp: 12000, pos, attack: 0.03 }); }
  chime(grade) {
    if (grade === 'perfect') { [880, 1320, 1760].forEach((f, i) => this.tone({ f, dur: 0.5, vol: 0.18, delay: i * 0.07, type: 'sine' })); }
    else if (grade === 'excellent') { [740, 1110].forEach((f, i) => this.tone({ f, dur: 0.35, vol: 0.14, delay: i * 0.06 })); }
    else if (grade === 'good') this.tone({ f: 660, dur: 0.2, vol: 0.1 });
    else if (grade === 'wayoff') this.tone({ f: 180, f2: 90, dur: 0.3, vol: 0.2, type: 'sawtooth' });
    else this.tone({ f: 330, f2: 260, dur: 0.2, vol: 0.12, type: 'triangle' });
  }
  whistle() { const c = this.ensure(); if (!c) return; const t = c.currentTime; const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(); o.type = 'square'; o.frequency.value = 2900; l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.01); g.gain.setValueAtTime(0.14, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; o.connect(f); f.connect(g); g.connect(this.bus.sfx); o.start(t); l.start(t); o.stop(t + 0.65); l.stop(t + 0.65); }
  buzzer() { this.tone({ f: 220, dur: 0.9, vol: 0.35, type: 'sawtooth', attack: 0.01 }); this.tone({ f: 233, dur: 0.9, vol: 0.3, type: 'sawtooth' }); }
  swoosh() { this.burst({ dur: 0.18, vol: 0.15, hp: 800, lp: 6000, attack: 0.05 }); }
  ui(kind = 'tick') { const m = { tick: [1400, 0.04, 0.05], ok: [880, 0.09, 0.12], back: [520, 0.08, 0.1], err: [200, 0.15, 0.14], open: [660, 0.12, 0.1] }[kind] ?? [1000, 0.05, 0.06]; this.tone({ f: m[0], f2: kind === 'ok' ? 1320 : null, dur: m[1] + 0.03, vol: m[2], type: kind === 'err' ? 'sawtooth' : 'sine' }); }
  popup() { this.tone({ f: 520, f2: 1040, dur: 0.18, vol: 0.12, type: 'square' }); }
  // ---- crowd bed: filtered brown noise, level follows excitement
  startCrowd() {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.5; this.crowdFilter = f;
    const g = c.createGain(); g.gain.value = 0.15; this.crowdGain = g; s.connect(f); f.connect(g); g.connect(this.bus.crowd); s.start();
    const s2 = c.createBufferSource(); s2.buffer = this.white; s2.loop = true; const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1800; f2.Q.value = 0.9; const g2 = c.createGain(); g2.gain.value = 0.0; this.crowdHi = g2; s2.connect(f2); f2.connect(g2); g2.connect(this.bus.crowd); s2.start();
  }
  cheer(amount = 1) { this.crowdTarget = Math.min(1.4, this.crowdTarget + amount * 0.5); this.crowdKick = amount; }
  groan() { this.crowdTarget = Math.max(this.crowdTarget, 0.4); this.burst({ dur: 0.9, vol: 0.18, bp: 420, q: 0.8, buf: 'noise', bus: 'crowd', attack: 0.15 }); }
  update(dt) {
    if (!this.ctx) return; this.crowdTarget = Math.max(this.clutch ? 0.55 : 0.22, this.crowdTarget - dt * 0.12); this.crowdLevel += (this.crowdTarget - this.crowdLevel) * Math.min(1, dt * 2.5);
    const t = this.ctx.currentTime; this.crowdGain.gain.setTargetAtTime(0.12 + this.crowdLevel * 0.5, t, 0.2); this.crowdHi.gain.setTargetAtTime(Math.max(0, this.crowdLevel - 0.5) * 0.12, t, 0.15); this.crowdFilter.frequency.setTargetAtTime(500 + this.crowdLevel * 500, t, 0.2);
  }
  // ---- generative music: pad + arpeggio over a minor progression
  startMusic() {
    if (this.musicTimer || !this.ensure()) return; const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const tick = () => {
      const c = this.ctx, t = c.currentTime, chord = prog[Math.floor(this.step / 8) % 4], n = chord[this.step % 3] + (this.step % 8 > 4 ? 12 : 0);
      if (this.step % 8 === 0) chord.forEach((m) => this.tone({ f: hz(m - 12), dur: 3.1, vol: 0.05, type: 'sawtooth', attack: 0.4, bus: 'music' }));
      this.tone({ f: hz(n + 12), dur: 0.35, vol: 0.05, type: 'triangle', bus: 'music' });
      if (this.step % 4 === 0) this.tone({ f: 60, f2: 40, dur: 0.25, vol: 0.18, bus: 'music' });
      if (this.step % 2 === 1) this.burst({ dur: 0.04, vol: 0.03, hp: 7000, bus: 'music' });
      this.step++; void t;
    };
    this.musicTimer = setInterval(tick, 60000 / 104 / 2);
  }
  stopMusic() { clearInterval(this.musicTimer); this.musicTimer = null; }
  speak(text) { if (!this.s.audio.tts || !('speechSynthesis' in window)) return; try { const u = new SpeechSynthesisUtterance(text); u.volume = this.s.audio.commentary * this.s.audio.master; u.rate = 1.1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* ignore */ } }
}
