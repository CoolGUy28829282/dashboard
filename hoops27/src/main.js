// HOOPS 27: NEON ERA — application shell: services, settings, benchmark, session lifecycle.
import './ui/style.css';
import { generateLeague, ARENAS } from './data/generator.js';
import { BallPhysics } from './physics/world.js';
import { Renderer, PRESETS } from './engine/renderer.js';
import { Backdrop } from './engine/backdrop.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './audio/audio.js';
import { EventBus } from './engine/bus.js';
import { GameSession } from './engine/session.js';
import { Screens } from './ui/screens.js';
import { Nav, h, toast, $ } from './ui/dom.js';
import { dbGet, dbSet } from './data/db.js';
import { mergeSettings } from './data/defaults.js';
import * as R from './modes/ranked.js';

class App {
  async init() {
    this.uiRoot = $('#ui'); this.bus = new EventBus(); this.league = generateLeague(2027);
    this.settings = mergeSettings(await dbGet('settings')); this.profile = await R.loadProfile(); this.autoPreset = (await dbGet('autoPreset')) ?? 'high';
    this.rend = new Renderer($('#game')); this.audio = new AudioEngine(this.settings); this.input = new Input(this.settings, this.bus); this.nav = new Nav(this.input, this.audio);
    this.phys = await BallPhysics.create();
    this.screens = new Screens(this); this.session = null;
    this.applyAccess(); this.applyVideo(true);
    this.backdrop = new Backdrop(this.rend, ARENAS[0]); this.backdrop.activate();
    addEventListener('resize', () => this.rend.resize());
    // first user gesture unlocks audio and starts the menu music
    const unlock = () => { this.audio.allowed = true; this.audio.ensure(); this.audio.startMusic(); removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); }; addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.last = performance.now(); this.loopMenu = (now) => { requestAnimationFrame(this.loopMenu); const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; if (this.session) return; this.input.poll(dt, now / 1000); this.audio.update(dt); this.backdrop?.update(dt); }; requestAnimationFrame(this.loopMenu);
    window.__app = this; window.addEventListener('beforeunload', () => { /* a pending ranked flag stays in localStorage -> rage-quit penalty on next boot */ });
    if (!this.settings.video.benchmarked && !new URLSearchParams(location.search).has('nobench')) await this.benchmark(false);
    this.recoverRageQuit();
    this.screens.main();
  }
  saveSettings() { dbSet('settings', this.settings); }
  refreshSettings() { this.settingsRefresh?.(); }
  toast(text, cls) { toast(this.uiRoot, text, cls); }
  applyVideo(silent) {
    const v = this.settings.video; const base = PRESETS[v.preset === 'auto' ? this.autoPreset : v.preset] ?? PRESETS.high;
    this.rend.apply({ ...base, scale: v.resolutionScale ?? base.scale, shadows: v.shadows, bloom: v.bloom, ssao: v.ssao, ca: v.ca, fxaa: v.fxaa, motionBlur: v.motionBlur, reducedMotion: this.settings.access.reducedMotion }); void silent;
  }
  applyAccess() { const a = this.settings.access; document.documentElement.style.setProperty('--ui-scale', a.uiScale); document.body.classList.toggle('reduce-motion', !!a.reducedMotion); this.rend.cfg.reducedMotion = !!a.reducedMotion; }
  /** First-run automatic benchmark: render the arena for ~1.5 s at High and pick a preset from the frame time. */
  async benchmark(force) {
    const overlay = h('div', { class: 'overlay' }, h('div', { class: 'panel', style: { textAlign: 'center' } }, h('div', { class: 'spinner', style: { margin: '0 auto 12px' } }), h('div', { class: 'display' }, 'Calibrating graphics'), h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'One-time benchmark')));
    this.uiRoot.append(overlay); this.rend.applyPreset('high'); this.backdrop.activate();
    const times = []; const t0 = performance.now(); await new Promise((res) => { let last = performance.now(), n = 0; const f = (now) => { const dt = (now - last) / 1000; last = now; if (n++ > 6) times.push(dt * 1000); this.backdrop.update(dt); if (times.length < 30 && now - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); if (!times.length) times.push(60);
    times.sort((a, b) => a - b); const med = times[Math.floor(times.length / 2)];
    const preset = med < 9 ? 'ultra' : med < 18 ? 'high' : med < 30 ? 'medium' : 'low';
    this.autoPreset = preset; await dbSet('autoPreset', preset); const v = this.settings.video; v.benchmarked = true; if (force || v.preset === 'auto') { v.preset = 'auto'; const p = PRESETS[preset]; Object.assign(v, { shadows: p.shadows, bloom: p.bloom, ssao: p.ssao, ca: p.ca, fxaa: p.fxaa, motionBlur: p.motionBlur, resolutionScale: p.scale }); }
    this.saveSettings(); this.applyVideo(); overlay.remove(); this.toast(`Graphics preset: ${preset} (median ${med.toFixed(1)} ms/frame)`, 'cyan', 3500);
  }
  recoverRageQuit() {
    const raw = localStorage.getItem('hoops27.pendingRanked'); if (!raw) return; localStorage.removeItem('hoops27.pendingRanked');
    try { const { opp } = JSON.parse(raw); const r = R.applyResult(this.profile, { won: false, opp, userPts: 0, oppPts: 0, rageQuit: true, forfeit: true }); R.saveProfile(this.profile); setTimeout(() => this.toast(`Ranked game abandoned: loss recorded with ${1.5}× penalty (${r.delta} MMR)`, 'red', 6000), 600); } catch { /* ignore corrupt flag */ }
  }
  async startGame(cfg) {
    this.backdrop?.dispose?.(); this.backdrop = null; this.uiRoot.querySelectorAll('.screen, .overlay').forEach((n) => n.remove()); this.nav.setRoot(null);
    this.session = new GameSession(this, cfg); this.session.cfg = cfg; this.screens.current = null;
    await this.session.begin();
  }
  onGymEnd(session) { session.hud.el.style.display = 'none'; session.view.rig.setMode('2k'); this.screens.gymSummary(session); }
  onGameEnd(session, res) { session.hud.el.style.display = 'none'; session.view.rig.setMode('broadcast'); this.screens.postgame(session, res); }
  endSession() { this.session = null; this.backdrop = new Backdrop(this.rend, ARENAS[0]); this.backdrop.activate(); this.applyVideo(); }
}
const app = new App();
app.init().catch((e) => { console.error(e); document.body.append(h('pre', { style: { color: '#ff3355', padding: '20px', position: 'fixed', zIndex: 99 } }, 'Failed to start: ' + (e?.stack ?? e))); });
