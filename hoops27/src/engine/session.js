// GameSession: owns one match — simulation, view, HUD, audio, commentary, input, intro, replays, pause rules, results.
import * as THREE from 'three';
import { Game } from '../gameplay/game.js';
import { GameView } from './view.js';
import { Hud, HUD_PLAYS } from '../ui/hud.js';
import { PauseMenu } from '../ui/pause.js';
import { boxScoreView, findMvp } from '../ui/boxscore.js';
import { Commentary } from '../audio/commentary.js';
import { h, clear, $ } from '../ui/dom.js';
import { EventBus } from './bus.js';
import { ARENAS } from '../data/generator.js';
import { RANKED, LOOP } from '../tuning.js';
import { HALF_L, HALF_W } from '../physics/world.js';
import { PLAYS } from '../data/plays.js';
import { CAMERA_LABEL } from './camera.js';
import { ARCHETYPES } from '../data/generator.js';

export class GameSession {
  constructor(app, cfg) {
    this.app = app; this.cfg = cfg; this.bus = new EventBus(); this.pauseUsed = 0; this.paused = false; this.disposed = false; this.highlights = []; this.subQueue = []; this.running = false; this.fps = 60; this.frameAcc = 0; this.over = false; this.reelIndex = 0; this.skipIntro = false;
    const S = app.settings; const league = app.league;
    const teams = cfg.teams.map((i) => league.teams[i]);
    const rules = { ...cfg.rules }; const gym = cfg.mode === 'gym';
    const settings = { difficulty: rules.difficulty ?? 'allstar', quarterMinutes: rules.quarterMinutes ?? 5, fouls: rules.fouls ?? true, fatigue: rules.fatigue ?? true, injuries: false, travel: S.gameplay.travel, threeSecond: S.gameplay.threeSecond, foulTolerance: S.gameplay.foulSensitivity, ranked: !!cfg.ranked, autoSubs: true, rubberBand: true, aimAssist: S.controls.aimAssist, gym, gymDefender: gym && !!cfg.gymDefender };
    if (gym) { settings.fouls = false; settings.fatigue = false; settings.threeSecond = false; }
    this.humanTeam = cfg.humans[0]?.team ?? 0;
    // arena: the home (second-listed? first) team's arena unless the user picked one
    const arena = ARENAS.find((a) => a.id === (rules.arenaId ?? teams[0].arenaId)) ?? ARENAS[0];
    this.game = new Game({ teams, settings, bus: this.bus, physics: app.phys, humans: cfg.humans.map((hh) => ({ ...hh })), seed: (Math.random() * 1e9) | 0 });
    if (gym && cfg.userPlayer) this.applyLineup(0, [cfg.userPlayer]);
    if (cfg.lineups) cfg.lineups.forEach((l, ti) => { if (l) this.applyLineup(ti, l); });
    if (cfg.strategy) cfg.strategy.forEach((st, ti) => { if (st) Object.assign(this.game.teams[ti].strategy, st); });
    this.viewSettings = { ...S, gameplay: { ...S.gameplay, shotMeter: cfg.ranked ? 'overhead' : S.gameplay.shotMeter } };
    app.rend.cfg.reducedMotion = S.access.reducedMotion;
    this.view = new GameView(app.rend, this.game, { arena, settings: this.viewSettings, bus: this.bus });
    this.view.setCameraMode(S.gameplay.camera);
    this.hud = new Hud(app.uiRoot, { game: this.game, bus: this.bus, settings: S, audio: app.audio, callPlay: (i, t) => this.callPlay(i, t), requestTimeout: () => this.requestTimeout() });
    this.commentary = new Commentary(this.bus, this.game, (t) => this.hud.say(t)); if (gym) { this.commentary.dispose(); this.commentary = { update() {}, dispose() {} }; }
    this.wire();
  }
  applyLineup(ti, order) { const tm = this.game.teams[ti]; const players = order.map((id) => tm.players.find((p) => p.id === id)).filter(Boolean); const rest = tm.players.filter((p) => !players.includes(p)); const all = [...players, ...rest]; tm.court.forEach((p) => { p.onCourt = false; }); tm.court = all.slice(0, 5); tm.bench = all.slice(5); tm.court.forEach((p) => { p.onCourt = true; }); this.game.refreshOn(); }
  wire() {
    const bus = this.bus, A = this.app.audio, g = this.game;
    this.offs = [
      bus.on('ballHit', ({ kind, speed, pos }) => { if (kind === 'floor') A.floor(pos, speed); else if (kind === 'rim') { A.rim(pos, speed); if (speed > 4) this.app.input.rumble(0.1, 0.3, 80); } else if (kind === 'board') A.board(pos, speed); else if (kind === 'net') A.swish(pos); }),
      bus.on('dribble', ({ pos }) => A.dribble(pos)),
      bus.on('score', ({ pts, ev }) => { A.cheer(pts === 3 ? 1.2 : ev.type === 'dunk' ? 1.3 : 0.7); if (ev.grade === 'perfect' && ev.human) this.app.input.rumble(0.2, 0.7, 160); }),
      bus.on('shotGrade', ({ grade }) => A.chime(grade)),
      bus.on('shotStart', ({ human }) => { if (human) this.app.input.rumble(0.05, 0.15, 60); }),
      bus.on('foul', () => { A.whistle(); A.groan(); this.app.input.rumble(0.7, 0.3, 160); this.view.rig.kick(0.25); }),
      bus.on('block', () => { A.cheer(1.1); this.app.input.rumble(0.8, 0.4, 150); }),
      bus.on('dunk', ({ made }) => { if (made) A.cheer(1.4); }),
      bus.on('steal', () => A.swoosh()), bus.on('pass', () => A.swoosh()), bus.on('buzzer', () => { A.buzzer(); A.cheer(1.6); }), bus.on('quarterEnd', () => A.buzzer()),
      bus.on('pauseToggle', () => this.togglePause()), bus.on('cameraCycle', () => { const m = this.view.rig.next(); this.hud.toast(`Camera: ${CAMERA_LABEL[m]}`, 'cyan'); }),
      bus.on('replaySkip', () => { if (this.view.replay) this.view.stopReplay(); else if (this.intro) this.skipIntro = true; }),
      bus.on('playCall', ({ index, team }) => this.callPlay(index, team)), bus.on('toggleDebug', () => this.hud.toggleDebug()),
      bus.on('replayOrbit', () => { const R = this.view.replay; if (R) { const speeds = [0.5, 0.25, 1]; R.speed = speeds[(speeds.indexOf(R.speed) + 1) % speeds.length]; this.hud.toast(`Replay speed ×${R.speed}`, 'mag'); } }),
      bus.on('replayStart', () => this.hud.setReplay(true)), bus.on('replayEnd', () => this.hud.setReplay(false)),
      bus.on('dunk', ({ made }) => made && this.saveHighlight('Dunk')), bus.on('block', () => this.saveHighlight('Block')), bus.on('buzzer', () => this.saveHighlight('Buzzer beater')),
      bus.on('score', ({ ev, player }) => { if (ev.three && g.isClutch()) this.saveHighlight('Clutch three'); if (ev.type === 'dunk' && g.settings.fouls === false) void player; }),
      bus.on('final', (r) => this.onFinal(r)),
      bus.on('quarterEnd', ({ quarter }) => this.onQuarterEnd(quarter)),
    ];
    // replays for the big plays (dunk, block, buzzer beater)
    const rp = (d = 1.2) => { if (this.app.settings.gameplay.replays && !this.app.settings.reducedReplays && this.game.humans.length + 1 > 0) this.view.queueReplay(d); };
    this.offs.push(bus.on('dunk', ({ made }) => made && rp(1.4)), bus.on('block', () => rp(1.2)), bus.on('buzzer', () => rp(1.2)));
    this.onMove = (e) => { if (this.view.replay && e.buttons & 1 && this.view.rig.orbit) this.view.rig.orbit.a += e.movementX * 0.01; }; window.addEventListener('mousemove', this.onMove); // drag to free-orbit a replay
    this.onVis = () => { if (document.hidden && this.running && !this.paused && !this.over && this.game.humans.length) this.togglePause(); }; document.addEventListener('visibilitychange', this.onVis);
  }
  saveHighlight(label) { if (this.highlights.length >= 10) this.highlights.shift(); setTimeout(() => { if (this.disposed) return; const clip = this.view.buffer.clip(4); if (clip.length > 30) this.highlights.push({ label, clip, score: [...this.game.score], q: this.game.quarter }); }, 900); }
  /* ---------------------------------------------------------------- lifecycle */
  async begin() {
    const { app, game } = this; app.input.attach(game, this.view, this.bus); app.audio.ensure(); app.audio.startMusic();
    if (this.cfg.ranked) localStorage.setItem('hoops27.pendingRanked', JSON.stringify({ opp: this.cfg.ranked.opp, at: Date.now() }));
    game.start(); game.hold = true; this.running = true; this.last = performance.now(); this.acc = 0;
    this.startLoop();
    if (this.cfg.skipIntro) { this.finishIntro(); } else await this.playIntro();
  }
  startLoop() { const step = (now) => { if (this.disposed) return; this.raf = requestAnimationFrame(step); this.frame(now); }; this.raf = requestAnimationFrame(step); }
  frame(now) {
    const cap = this.app.settings.video.fpsCap; if (cap && now - this.last < 1000 / cap - 1) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.1;
    const g = this.game, app = this.app;
    app.input.poll(dt, now / 1000);
    this.processSubQueue();
    if (this.paused && this.cfg.ranked) { this.pauseUsed += dt; if (this.pauseUsed >= RANKED.pauseBudgetSec) { this.pauseMenu?.close(); this.paused = false; this.forfeit(true); } }
    if (!this.paused && !g.paused) {
      this.acc += dt; let n = 0; const step = 1 / LOOP.logicHz;
      while (this.acc >= step && n < 6) { g.update(step); this.view.capture(); this.acc -= step; n++; this.afterTick(); }
      if (n === 6) this.acc = 0;
    }
    const active = g.humans.map((h2) => h2.ctrl).filter(Boolean);
    app.audio.update(dt); app.audio.clutch = g.isClutch(); this.commentary.update(dt);
    const rig = this.view.rig; app.audio.listener(rig.camera.position, new THREE.Vector3().subVectors(rig.look, rig.camera.position).normalize());
    this.view.update(dt, this.paused ? 1 : this.acc / (1 / LOOP.logicHz), { active });
    this.hud.update(dt, active[0] ?? null, this.fps);
    if (g.phase === 'ft' && g.ft?.ready && active.includes(g.ft.shooter) && !g.ft.shotOut) this.ftHint();
  }
  afterTick() {
    const g = this.game;
    if (g.phase === 'timeout' && !this.timeoutOpen) this.openTimeout();
    if (g.phase === 'end' && !this.over) { this.over = true; }
    // screen shake setting
    this.view.rig.reduced = !this.app.settings.access.screenShake || this.app.settings.access.reducedMotion;
  }
  ftHint() { if (this.ftHinted === this.game.ft) return; this.ftHinted = this.game.ft; this.hud.toast('Free throw — press Shoot, release on the green window (fixed 0.95 s meter)', 'lime'); }
  /* ---------------------------------------------------------------- intro */
  playIntro() {
    const g = this.game, T = g.teams.map((t) => t.data); const view = this.view; const ui = this.app.uiRoot;
    return new Promise((resolve) => {
      this.intro = { t: 0, stage: 'fly' }; const ov = h('div', { class: 'screen', style: { pointerEvents: 'none', justifyContent: 'flex-end', alignItems: 'center' } }); ui.append(ov); this.hud.el.style.opacity = 0;
      const course = (t) => { const k = Math.min(1, t / 5.2), e = 1 - Math.pow(1 - k, 3); const ang = -Math.PI * 0.8 + e * Math.PI * 0.55; const r = 46 - e * 20; return { pos: new THREE.Vector3(Math.cos(ang) * r, 26 - e * 15, Math.sin(ang) * r * 0.62 + 4), look: new THREE.Vector3(0, 1.5, 0), fov: 52 - e * 12 }; };
      const hide = () => { view.rig.override = null; ov.remove(); this.hud.el.style.opacity = 1; this.intro = null; this.finishIntro(); resolve(); };
      view.rig.override = (dt) => { if (!this.intro) return null; this.intro.t += dt; const t = this.intro.t;
        if (this.skipIntro || t > 12.5) { hide(); return null; }
        if (t < 5.2) return course(t);
        if (this.intro.stage === 'fly') { this.intro.stage = 'five'; this.showFive(ov, T); }
        const a = (t - 5.2) * 0.12; return { pos: new THREE.Vector3(Math.cos(a + 1.2) * 15, 4.2, 9 + Math.sin(a) * 3), look: new THREE.Vector3(0, 1.4, 0), fov: 36 }; };
      ov.append(h('div', { class: 'panel flat', style: { marginBottom: '24px', textAlign: 'center' } }, h('div', { class: 'crumbs' }, 'Tonight at'), h('div', { class: 'display cy', style: { fontSize: '22px' } }, view.arena.arena.name), h('div', { class: 'vs-row', style: { gap: '22px', marginTop: '8px' } }, h('div', { html: T[0].logoSvg, style: { width: '64px', height: '64px' } }), h('span', { class: 'vs', style: { fontSize: '22px' } }, 'VS'), h('div', { html: T[1].logoSvg, style: { width: '64px', height: '64px' } })), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, 'Press Space / Enter to skip')));
      this.skipHandler = (kind, code) => { if (kind === 'key' && (code === 'Space' || code === 'Enter')) this.skipIntro = true; }; this.app.input.menuHandlers.add(this.skipHandler);
    });
  }
  showFive(ov, T) {
    const g = this.game; clear(ov); ov.style.justifyContent = 'center'; this.app.audio.cheer(1);
    const col = (ti) => h('div', { class: 'col', style: { minWidth: '270px' } }, h('div', { class: 'display', style: { color: T[ti].colors.primary, textAlign: ti ? 'right' : 'left', fontSize: '16px' } }, `${T[ti].city} ${T[ti].name}`), g.teams[ti].court.map((p, i) => h('div', { class: 'panel flat', style: { '--c': '10px', padding: '8px 14px', animation: `kin 3400ms ${i * 320}ms var(--ease) both`, transform: 'none', borderColor: T[ti].colors.primary }, class2: '' }, h('div', { class: 'row', style: { flexDirection: ti ? 'row-reverse' : 'row' } }, h('span', { class: 'num', style: { fontSize: '26px', color: T[ti].colors.primary } }, '#' + p.number), h('div', { style: { textAlign: ti ? 'right' : 'left' } }, h('div', { class: 'display', style: { fontSize: '14px' } }, p.name), h('div', { class: 'muted', style: { fontSize: '11px' } }, `${p.data.pos} · ${ARCHETYPES[p.data.archetype].label}`)), h('div', { class: 'spacer' }), h('span', { class: 'ovr' }, p.data.ovr)))));
    ov.append(h('div', { class: 'row', style: { gap: '120px', alignItems: 'flex-start' } }, col(0), col(1)));
    ov.append(h('div', { class: 'display mg', style: { position: 'absolute', top: '12%', fontSize: '28px', textShadow: '0 0 24px #FF2BD6' } }, 'Starting five'));
  }
  finishIntro() { if (this.skipHandler) { this.app.input.menuHandlers.delete(this.skipHandler); this.skipHandler = null; } this.game.hold = false; this.view.rig.snap(); this.hud.hide?.(); this.app.audio.cheer(0.8); }
  /* ---------------------------------------------------------------- pause / timeouts / subs / plays */
  togglePause() {
    if (this.over || this.intro || this.view.replay) return;
    if (this.paused) { this.pauseMenu?.close(); this.resume(); return; }
    this.paused = true; this.game.paused = true; this.pauseMenu = new PauseMenu(this.app, this); this.app.audio.ui('open');
  }
  resume() { this.paused = false; this.game.paused = false; this.pauseMenu = null; this.last = performance.now(); this.acc = 0; this.app.nav.setRoot(null); }
  queueSub(team, out, inn) { if (this.subQueue.some((s) => s.out === out || s.inn === inn)) return false; this.subQueue.push({ team, out, inn }); this.processSubQueue(); return true; }
  processSubQueue() { if (!this.subQueue.length) return; const g = this.game; if (!['dead', 'timeout', 'ft', 'inbound', 'qend'].includes(g.phase)) return; this.subQueue = this.subQueue.filter((s) => !g.substitute(s.team, s.out, s.inn) && !(s.inn.fouledOut)); }
  callPlay(index, team, name) {
    const n = name ?? HUD_PLAYS[index]; if (!n) return; const tm = this.game.teams[team]; tm.call = n; this.view.showPlay(n, team); this.hud.highlightPlay(index); this.hud.toast(`Play called: ${n}`, 'lime');
    const ctrl = this.game.humans.find((h2) => h2.team === team)?.ctrl; if (ctrl) ctrl.ai.called = this.game.t; this.game.poss.plan = null; void PLAYS;
  }
  requestTimeout() { const t = this.humanTeam; if (this.game.canTimeout(t)) this.game.callTimeout(t); else this.hud.toast('Timeout unavailable right now', 'red'); }
  openTimeout() {
    const g = this.game, st = g.timeoutState; const human = g.humans.find((h2) => h2.team === st.team); this.timeoutOpen = true;
    if (!human) { setTimeout(() => { this.timeoutOpen = false; }, 3500); return; } // CPU timeout is resolved by the coach AI
    const ov = h('div', { class: 'overlay' }); const p = h('div', { class: 'panel amb' }); ov.append(p); this.app.uiRoot.append(ov);
    const plays = h('div', { class: 'col' }); [...HUD_PLAYS, 'Motion'].forEach((n, i) => plays.append(h('button', { class: 'btn sm', onclick: () => { this.callPlay(i < 5 ? i : -1, st.team, n); } }, `${n}`)));
    const done = () => { ov.remove(); this.timeoutOpen = false; g.endTimeout(); this.app.nav.setRoot(null); };
    p.append(h('div', { class: 'title-row' }, h('h2', {}, 'Timeout'), h('span', { class: 'crumbs' }, `${g.teams[st.team].timeouts} left`)), h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '24px' } }, h('div', {}, h('div', { class: 'display', style: { fontSize: '12px', marginBottom: '6px' } }, 'Draw up a play'), plays), h('div', { class: 'muted', style: { maxWidth: '260px', lineHeight: 1.5, fontSize: '13px' } }, 'Players recover stamina. Swap players from the pause menu (Esc) after resuming, or choose a play now.')), h('div', { class: 'footer-bar' }, h('button', { class: 'btn primary', dataset: { default: '', back: '' }, onclick: done }, 'Resume play')));
    this.app.nav.setRoot(ov);
  }
  onQuarterEnd(q) {
    const g = this.game; if (this.over || (q >= 4 && g.score[0] !== g.score[1])) return;
    setTimeout(() => {
      if (this.disposed || g.phase !== 'qend') return; const ov = h('div', { class: 'overlay' }); const p = h('div', { class: 'panel' }); ov.append(p); this.app.uiRoot.append(ov);
      const name = q === 2 ? 'Halftime' : q >= 4 ? 'End of regulation — overtime!' : `End of Q${q}`;
      const go = () => { ov.remove(); g.nextQuarter(); this.app.nav.setRoot(null); clearTimeout(auto); };
      p.append(h('div', { class: 'title-row' }, h('h2', {}, name), h('span', { class: 'crumbs' }, `${g.teams[0].data.abbr} ${g.score[0]} – ${g.score[1]} ${g.teams[1].data.abbr}`)), boxScoreView(g), h('div', { class: 'footer-bar' }, h('button', { class: 'btn primary', dataset: { default: '', back: '' }, onclick: go }, q >= 4 ? 'Start overtime' : 'Continue'), h('button', { class: 'btn', onclick: () => { ov.remove(); this.togglePause(); } }, 'Substitutions / strategy')));
      this.app.nav.setRoot(ov); const auto = g.humans.length ? null : setTimeout(go, 6000);
    }, 900);
  }
  /** My Gym: teleport to a practice spot. */
  gymSpot(name) { this.game.gymSpot(name); this.hud.toast(name === 'ft' ? 'Free-throw practice: 3 attempts' : 'Moved to a new spot', 'cyan'); }
  gymSetDefender(on) {
    const g = this.game; g.settings.gymDefender = on; const side = g.dirOf(0), u = g.gymUser;
    const cand = g.teams[1].court; cand.forEach((p) => { p.parked = true; });
    if (on) { const d = u.guardedBy ?? cand[0]; d.parked = false; d.pos = { x: u.pos.x + side * -1.5 + (side > 0 ? 3 : -3), z: u.pos.z }; d.vel = { x: 0, z: 0 }; g.gymReturn(); }
    this.hud.toast(on ? 'Defender on' : 'Defender off', 'cyan');
  }
  gymResetStats() { const g = this.game; g.shots.length = 0; g.gymUser.run = 0; g.gymUser.perfectChain = 0; this.hud.toast('Stats reset', 'cyan'); }
  leaveGym() { if (this.over) return; this.over = true; this.app.onGymEnd(this); }
  forfeit(timeUp = false) {
    if (this.game.gym) return this.leaveGym(); if (this.over) return; const team = this.humanTeam; this.game.forfeit(team); this.forfeited = timeUp ? 'pause' : 'forfeit'; }
  /* ---------------------------------------------------------------- end */
  onFinal({ score, winner }) {
    if (this.finalSent) return; this.finalSent = true; this.over = true; const g = this.game;
    const mvp = findMvp(g, winner); this.app.audio.cheer(1.5); localStorage.removeItem('hoops27.pendingRanked');
    const result = { score, winner, mvp: { name: mvp.p.name, team: mvp.team, id: mvp.p.id }, forfeited: g.forfeited, humanTeam: this.humanTeam, humans: g.humans.length, game: g, highlights: this.highlights, cfg: this.cfg, userArchetype: g.humans[0]?.ctrl?.data.archetype ?? g.teams[this.humanTeam].court[0].data.archetype };
    setTimeout(() => { if (!this.disposed) this.app.onGameEnd(this, result); }, 1600);
  }
  /** Play the top-plays reel through the replay system. */
  playReel(onDone) {
    const list = this.highlights; if (!list.length) return onDone?.(); let i = 0; const tag = h('div', { class: 'panel mag', style: { position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', padding: '8px 22px', zIndex: 30 } }); this.app.uiRoot.append(tag);
    const next = () => { if (i >= list.length || this.disposed) { tag.remove(); this.view.onReplayEnd = null; return onDone?.(); } const hl = list[i++]; tag.textContent = `Top plays ${i}/${list.length} — ${hl.label}`; this.view.replay = null; this.view.g.paused = true; const ok = this.view.startReplayClip(hl.clip, 0.6); if (!ok) next(); };
    this.view.onReplayEnd = () => setTimeout(next, 200); next();
  }
  applySettings() { const S = this.app.settings; this.viewSettings.gameplay.shotMeter = this.cfg.ranked ? 'overhead' : S.gameplay.shotMeter; this.view.meter.setPalette(S.access.palette); this.hud.buildPlayUi(); this.app.applyVideo(); this.app.applyAccess(); }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.offs?.forEach((f) => f()); document.removeEventListener('visibilitychange', this.onVis); window.removeEventListener('mousemove', this.onMove); this.hud.dispose(); this.commentary.dispose(); this.view.dispose(); this.app.input.detach(); this.app.audio.stopMusic(); this.pauseMenu?.close?.();
    if (this.skipHandler) this.app.input.menuHandlers.delete(this.skipHandler); this.app.phys.setActive(false);
  }
}
void HALF_L; void HALF_W; void $;
