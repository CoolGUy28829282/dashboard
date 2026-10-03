// GameState manager: possession, clocks, ball states, rules engine, fouls, free throws, substitutions, quarters.
import { RULES, LOOP, COURT, AI } from '../tuning.js';
import { createRuntimePlayer, movePlayer, separate, blankStats, badge } from './movement.js';
import { hoopX, hoopDist, dist2, HALF_L, HALF_W, ftSpot, inPaint, outOfBounds, clampCourt } from './court.js';
import * as A from './actions.js';
import { BALL_R, RIM_R } from '../physics/world.js';
import { AIController } from '../ai/controller.js';
import { mulberry32, clamp } from '../engine/rng.js';
import { streakTier } from './shooting.js';

export const DEFAULT_SETTINGS = {
  difficulty: 'allstar', quarterMinutes: 5, fouls: true, fatigue: true, injuries: false, shotMeter: 'standard', rubberBand: true, travel: 'arcade', threeSecond: true,
  foulTolerance: 1.0, autoSubs: true, ranked: false, aimAssist: 0.5,
};
const TICK = 1 / LOOP.logicHz;

export class Game {
  constructor({ teams, settings = {}, bus, physics, humans = [], seed = 1 }) {
    this.bus = bus; this.phys = physics; this.rng = mulberry32(seed);
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    if (this.settings.ranked) { this.settings.rubberBand = false; this.settings.fouls = true; this.settings.fatigue = true; this.settings.quarterMinutes = 5; }
    if (this.settings.difficulty === 'hof') this.settings.rubberBand = false;
    this.teams = teams.map((t, i) => this.makeTeam(t, i));
    this.humans = humans.map((h) => ({ ...h, ctrl: null, intent: blankIntent(), switchCd: 0 }));
    this.t = 0; this.quarter = 1; this.qLen = this.settings.quarterMinutes * 60; this.clock = this.qLen; this.score = [0, 0]; this.clockOn = false;
    this.phase = 'init'; this.paused = false; this.dead = null; this.arrow = 0; this.shots = []; this.flow = [[0, 0, 0]]; this.log = [];
    this.ball = { state: 'dead', holder: null, pos: { x: 0, y: 1, z: 0 }, vel: { x: 0, y: 0, z: 0 }, lastTouch: null, lastTouchTeam: 0, pass: null, shot: null, fromShot: null, script: null };
    this.poss = { team: 0, shotClock: RULES.shotClock, backcourt: RULES.backcourt, crossed: false, inbound: 0, elapsed: 0, playId: null, playStep: 0, playT: 0 };
    this.hist = []; this.lastPass = null; this.lastShotInfo = null; this.pauseUsed = 0; this.runs = [0, 0]; this.lastScoreTeam = -1;
    this.ai = new AIController(this);
    this.timeoutState = null; this.ft = null; this.events = []; this.over = false; this.ballTeleport = 0; this.tipState = null;
    this.on = [];
    for (const tm of this.teams) for (const p of tm.court) p.onCourt = true;
    this.refreshOn();
    this.shotClockHold = false;
  }

  makeTeam(data, idx) {
    const players = data.roster.map((r) => createRuntimePlayer(r, idx, 0));
    players.forEach((p, i) => { p.slot = i; });
    return { idx, data, players, court: players.slice(0, 5), bench: players.slice(5), strategy: { ...data.tendencies }, scheme: 'man', call: null, timeouts: RULES.timeouts, tqCount: 0, fouls: 0, bonus: false, plays: data.preferredPlays ?? [] };
  }
  refreshOn() { this.on = [...this.teams[0].court, ...this.teams[1].court]; }
  dirOf(team) { const half = this.quarter <= 2 ? 0 : this.quarter <= 4 ? 1 : (this.quarter - 5) % 2; const d0 = half === 0 ? 1 : -1; return team === 0 ? d0 : -d0; }
  oppTeam(t) { return this.teams[1 - t]; }
  isClutch() { return (this.quarter >= 4 && this.clock <= RULES.clutchMinutes * 60 && Math.abs(this.score[0] - this.score[1]) <= RULES.clutchPoints); }
  rubberBand(team) {
    if (!this.settings.rubberBand || this.settings.ranked || this.settings.difficulty === 'hof') return 0;
    const diff = this.score[1 - team] - this.score[team]; return clamp(diff * 0.002, -0.03, 0.03);
  }
  popup(text, player) { this.bus.emit('popup', { text, player }); }
  timeSituation() { return { q: this.quarter, clock: this.clock, diff: this.score[0] - this.score[1], last: this.quarter >= 4 && this.clock < 30 }; }

  /* ----------------------------------------------------------- setup */
  start() {
    // jump ball (spec §7); possession arrow starts with the loser
    const c0 = [...this.teams[0].court].sort((a, b) => b.height - a.height)[0], c1 = [...this.teams[1].court].sort((a, b) => b.height - a.height)[0];
    const s0 = c0.data.attrs.vertical + c0.height * 40 + this.rng() * 30, s1 = c1.data.attrs.vertical + c1.height * 40 + this.rng() * 30;
    const winner = s0 >= s1 ? 0 : 1; this.arrow = 1 - winner;
    this.phase = 'tip'; this.tipState = { t: 0, winner, c: [c0, c1] };
    this.layoutTip(winner);
    this.ball.state = 'dead'; this.ball.pos = { x: 0, y: 1.2, z: 0 };
    this.assignControl();
    this.bus.emit('gameStart', {});
  }
  layoutTip(winner) {
    const [c0, c1] = this.tipState.c;
    c0.pos = { x: -0.6, z: 0 }; c1.pos = { x: 0.6, z: 0 }; c0.face = 0; c1.face = Math.PI;
    for (const tm of this.teams) {
      const others = tm.court.filter((p) => p !== c0 && p !== c1);
      others.forEach((p, i) => { const sgn = tm.idx === 0 ? -1 : 1; p.pos = { x: sgn * (2.5 + (i % 2) * 1.5), z: -4.5 + i * 3 }; p.face = tm.idx === 0 ? 0 : Math.PI; p.vel = { x: 0, z: 0 }; });
    }
    void winner;
  }
  updateTip(dt) {
    const s = this.tipState; s.t += dt;
    if (s.t < 1.2) { this.ball.pos = { x: 0, y: 1.0 + s.t * 0.4, z: 0 }; return; }
    if (!s.tossed) { s.tossed = true; this.phys.launch({ x: 0, y: 2.0, z: 0 }, { x: 0, y: 7.2, z: 0 }); this.ball.state = 'tip'; this.bus.emit('tipoff', {}); s.c.forEach((c) => { c.action = { kind: 'oopjump', t: 0, dur: 0.9 }; c.vy = 3.6; }); }
    this.ball.pos = this.phys.pos; this.ball.vel = this.phys.vel;
    if (!s.tipped && s.t > 1.2 + 0.62) {
      s.tipped = true; const w = s.winner; const tm = this.teams[w];
      const guard = tm.court.find((p) => p !== s.c[w] && p.data.pos === 'PG') ?? tm.court.find((p) => p !== s.c[w]);
      this.phys.place(this.phys.pos.x, this.phys.pos.y, this.phys.pos.z);
      const dir = { x: guard.pos.x - this.phys.pos.x, z: guard.pos.z - this.phys.pos.z }; const dl = Math.hypot(dir.x, dir.z) || 1;
      this.phys.body.setLinvel({ x: (dir.x / dl) * 4.5, y: 0.5, z: (dir.z / dl) * 4.5 }, true);
      s.target = guard; this.ball.lastTouchTeam = w;
    }
    if (s.tipped && s.t > 2.9) {
      const g = s.target; this.phase = 'live'; this.clockOn = true; this.tipState = null;
      this.giveBall(g, { quiet: true }); this.startPossession(g.team, { keepBall: true });
      this.bus.emit('tipResult', { team: s.winner });
    }
  }

  /* ----------------------------------------------------------- control assignment */
  assignControl() {
    for (const h of this.humans) {
      const team = this.teams[h.team];
      const valid = (p) => p && p.team === h.team && p.onCourt && !p.fouledOut;
      const holder = this.ball.holder;
      if (holder && holder.team === h.team) { h.ctrl = holder; continue; }
      if (this.phase === 'ft') { if (this.ft && this.ft.shooter.team === h.team) h.ctrl = this.ft.shooter; }
      if (this.ball.pass && this.ball.pass.from.team === h.team) { h.ctrl = h.ctrl ?? this.ball.pass.from; if (valid(h.ctrl)) continue; }
      if (!valid(h.ctrl) || this.poss.team !== h.team && h.switchCd <= 0 && (!h.ctrl.action) && (this.ball.holder && this.ball.holder.team !== h.team) && this.poss.justChanged) {
        const ref = this.ball.holder?.pos ?? this.ball.pos;
        h.ctrl = [...team.court].sort((a, b) => dist2(a.pos, ref) - dist2(b.pos, ref))[0];
      }
    }
  }
  switchPlayer(h) {
    const ref = this.ball.holder?.pos ?? this.ball.pos;
    const list = [...this.teams[h.team].court].filter((p) => p !== h.ctrl).sort((a, b) => dist2(a.pos, ref) - dist2(b.pos, ref));
    if (list[0]) { h.ctrl = list[0]; h.switchCd = 0.25; this.bus.emit('switch', { player: list[0] }); }
  }

  /** Hold-to-call-a-screen: the nearest big teammate sets a pick on the handler's defender until released. */
  requestScreen(h) {
    const handler = h.ctrl; let r = this.pickReq;
    if (!r || r.team !== h.team || this.t - r.last > 0.5) {
      const mates = this.teams[h.team].court.filter((p) => p !== handler).sort((a, b) => (Number(b.data.pos === 'C' || b.data.pos === 'PF') - Number(a.data.pos === 'C' || a.data.pos === 'PF')) * 6 + dist2(a.pos, handler.pos) - dist2(b.pos, handler.pos));
      r = this.pickReq = { team: h.team, screener: mates[0], handler, start: this.t, last: this.t }; this.bus.emit('screenCalled', { screener: mates[0] });
    }
    r.last = this.t;
  }
  /* ----------------------------------------------------------- possession */
  startPossession(team, opts = {}) {
    this.poss = { team, shotClock: opts.shotClock ?? RULES.shotClock, backcourt: RULES.backcourt, crossed: this.crossedFor(team), inbound: 0, elapsed: 0, playId: null, playStep: 0, playT: 0, justChanged: true, since: this.t };
    this.assignGuards();
    this.ai.onPossession(team);
    this.teams.forEach((t) => t.court.forEach((p) => { p.postTime = 0; p.gathered = false; }));
    this.bus.emit('possession', { team });
    this.assignControl();
    void opts;
  }
  crossedFor(team) { const h = this.ball.holder; return h ? this.dirOf(team) * h.pos.x > 0 : false; }
  assignGuards() {
    const off = this.teams[this.poss.team], def = this.teams[1 - this.poss.team];
    const used = new Set();
    // match by position first, then nearest
    for (const o of off.court) {
      let best = null, bd = 1e9;
      for (const d of def.court) { if (used.has(d)) continue; const s = dist2(d.pos, o.pos) + (d.data.pos === o.data.pos ? -4 : 0); if (s < bd) { bd = s; best = d; } }
      if (best) { used.add(best); best.guard = o; o.guardedBy = best; }
    }
  }
  /* ----------------------------------------------------------- ball management */
  giveBall(p, opts = {}) {
    const b = this.ball;
    const prevHolder = b.holder; if (prevHolder && prevHolder !== p) prevHolder.hasBall = false;
    b.state = 'held'; b.holder = p; b.pass = null; b.script = null; b.shot = null; b.fromShot = null;
    p.hasBall = true; p.dribbling = true; p.catchTime = this.t; p.protect = 0; p.ai.mode = 'probe'; p.ai.t = 0;
    this.phys.setActive(false);
    b.lastTouch = p; b.lastTouchTeam = p.team;
    if (p.team !== this.poss.team) { this.startPossession(p.team); if (this.phase === 'live') this.clockOn = true; }
    if (this.phase === 'live') this.clockOn = true;
    if (!opts.quiet) this.bus.emit('catch', { player: p });
    p.gathered = this.settings.travel === 'sim' ? true : false; p.gatherPos = { ...p.pos };
    this.assignControl();
    const h = this.humans.find((hh) => hh.team === p.team); if (h) h.ctrl = p;
  }
  setLoose(pos, vel, spin) {
    const b = this.ball; b.state = 'loose'; b.holder = null; b.script = null; b.pass = null;
    this.phys.launch(pos, vel, spin); b.pos = this.phys.pos; b.vel = this.phys.vel;
    for (const p of this.on) p.hasBall = false;
    b.looseT = 0;
  }
  releaseBallToLoose() { const p = this.ball.holder; if (!p) return; this.setLoose(A.handPos(p, 0.8), { x: 0, y: 0, z: 0 }); }
  reboundWon(p, off) {
    p.rebTime = this.t;
    this.giveBall(p, { quiet: true });
    this.clockOn = true;
    if (off) { this.poss.shotClock = Math.max(this.poss.shotClock > 14 ? 14 : this.poss.shotClock, RULES.shotClockOreb); if (this.poss.shotClock < RULES.shotClockOreb) this.poss.shotClock = RULES.shotClockOreb; }
    this.poss.crossed = this.crossedFor(p.team);
    if (this.ftReboundLive) this.ftReboundLive = false;
  }
  turnover(p, kind, info = {}) {
    p.stats.to++; this.bus.emit('turnover', { player: p, kind, ...info });
    p.hasBall = false;
    this.lastPass = null;
  }
  recordShot(ev, p, opts = {}) {
    this.shots.push(ev);
    this.bus.emit('shotRecorded', { ev, pending: !!opts.pending });
  }

  /* ----------------------------------------------------------- scoring */
  scoreShot() {
    const b = this.ball, sh = b.shot; if (!sh || sh.scored) return; sh.scored = true;
    const ev = sh.ev, p = sh.p; ev.made = true;
    const pts = ev.type === 'ft' ? 1 : ev.three ? 3 : 2;
    this.addPoints(p.team, pts, p);
    if (ev.type === 'ft') { p.stats.ftm++; } else { p.stats.fgm++; if (ev.three) p.stats.tpm++; }
    p.run = p.run > 0 ? p.run + 1 : 1;
    if (ev.assist) { ev.assist.stats.ast++; }
    const tier = streakTier(p.run);
    if (tier >= 2 && p.hot < tier) { p.hot = tier; this.bus.emit('heatingUp', { player: p, tier }); }
    this.bus.emit('score', { player: p, pts, ev, team: p.team });
    if (ev.type === 'dunk' && ev.contest > 0.5) { this.popup('POSTERIZED', p); } else if (ev.type === 'dunk') this.popup('DUNK', p);
    if (ev.grade === 'perfect' && p.human !== false && ev.human) this.popup('PERFECT', p);
    b.fromShot = null;
    if (ev.type === 'ft') { this.ftResolved(true); return; }
    // buzzer beater?
    const buzzer = this.clock <= 0.05 && this.clockOn === false;
    if (buzzer) this.bus.emit('buzzer', { player: p });
    if (sh.foul) { this.callFoul(sh.foulDef, p, 'shooting', { shooting: true, andOne: true, made: true, three: ev.three }); return; }
    this.startDead('made', 1.7, () => this.setupInbound(1 - p.team, { x: -this.dirOf(1 - p.team) * -0, z: 0, baseline: this.dirOf(p.team) }), 'made');
  }
  addPoints(team, pts) {
    this.score[team] += pts;
    for (const p of this.teams[team].court) p.stats.pts += 0;
    const shooter = arguments[2]; if (shooter) shooter.stats.pts += pts;
    for (const p of this.teams[team].court) p.stats.pm += pts;
    for (const p of this.teams[1 - team].court) p.stats.pm -= pts;
    if (this.lastScoreTeam === team) this.runs[team] += pts; else { this.runs[team] = pts; this.runs[1 - team] = 0; this.lastScoreTeam = team; }
    this.flow.push([this.t, this.score[0] - this.score[1], this.quarter]);
  }

  /* ----------------------------------------------------------- fouls */
  callFoul(def, victim, kind, info = {}) {
    if (!this.settings.fouls) return;
    def.fouls++; def.stats.pf++;
    const tm = this.teams[def.team]; tm.fouls++;
    if (tm.fouls >= RULES.bonusFouls) tm.bonus = true;
    if (def.fouls >= RULES.foulOut) def.fouledOut = true;
    const flagrant = Math.random() < 0.01;
    this.bus.emit('foul', { by: def, on: victim, kind: flagrant ? 'flagrant' : kind, info });
    this.popup(flagrant ? 'FLAGRANT' : 'FOUL', def);
    this.clockOn = false;
    const b = this.ball; if (b.state === 'loose') this.phys.setActive(false);
    for (const p of this.on) { p.action = p.action?.kind === 'ft' ? p.action : null; p.y = 0; p.vy = 0; }
    const oppTeam = victim.team; victim.noSubUntil = this.t + 8;
    if (info.andOne) { this.startDead('foul', 1.4, () => this.startFreeThrows(victim, 1, 'andone'), 'foul'); return; }
    if (info.shooting) { const n = info.three ? 3 : 2; b.shot = null; this.startDead('foul', 1.4, () => this.startFreeThrows(victim, n, 'shooting'), 'foul'); return; }
    if (flagrant) { this.startDead('foul', 1.4, () => this.startFreeThrows(victim, 2, 'flagrant', { keepBall: true }), 'foul'); return; }
    if (tm.bonus && info.offensive !== true) { this.startDead('foul', 1.3, () => this.startFreeThrows(victim, 2, 'bonus'), 'foul'); return; }
    const spot = this.sidelineSpot(b.pos ?? victim.pos);
    if (info.offensive) { this.turnover(victim, 'offensive foul'); this.startDead('foul', 1.3, () => this.setupInbound(1 - victim.team, spot), 'foul'); return; }
    this.startDead('foul', 1.3, () => this.setupInbound(oppTeam, spot, { keepShot: true }), 'foul');
  }

  startFreeThrows(shooter, n, reason, opts = {}) {
    if (!shooter.onCourt) shooter = [...this.teams[shooter.team].court].sort((a, b) => b.data.attrs.ft - a.data.attrs.ft)[0]; // safety net: fouled player was subbed off
    const side = this.dirOf(shooter.team);
    shooter.pos = { ...ftSpot(side) }; shooter.vel = { x: 0, z: 0 }; shooter.face = Math.atan2(0, -side); shooter.y = 0; shooter.vy = 0; shooter.action = null;
    this.phase = 'ft'; this.clockOn = false; this.dead = null;
    this.ft = { shooter, left: n, total: n, made: 0, reason, side, t: 0, ready: false, shotOut: false, resolved: false, lastOpen: false, keepBall: !!opts.keepBall };
    this.layoutFT();
    this.giveBall(shooter, { quiet: true });
    shooter.dribbling = false;
    this.bus.emit('ftStart', { shooter, n, reason });
  }
  layoutFT() {
    const f = this.ft, s = f.side, spot = ftSpot(s);
    f.marks = new Map();
    f.marks.set(f.shooter, spot);
    const shooterTeam = this.teams[f.shooter.team], other = this.teams[1 - f.shooter.team];
    const dx = -s; // toward the free-throw line from the baseline
    const lane = [
      { x: s * (HALF_L - 2.2), z: -2.9 }, { x: s * (HALF_L - 2.2), z: 2.9 }, { x: s * (HALF_L - 3.7), z: -2.9 }, { x: s * (HALF_L - 3.7), z: 2.9 },
    ];
    const opp = other.court.slice(); const mine = shooterTeam.court.filter((p) => p !== f.shooter);
    const lines = [lane[0], lane[1], lane[2], lane[3]];
    [opp[0], opp[1], mine[0], mine[1]].forEach((p, i) => p && f.marks.set(p, lines[i] ?? lines[0]));
    const back = [{ x: spot.x + dx * 2.5, z: -3.5 }, { x: spot.x + dx * 2.5, z: 3.5 }, { x: spot.x + dx * 3.5, z: 0 }];
    [opp[2], opp[3], opp[4], mine[2], mine[3]].forEach((p, i) => p && f.marks.set(p, back[i % 3]));
  }
  ftResolved(made) {
    const f = this.ft; if (!f || f.resolved) return; f.resolved = true; f.left--; if (made) f.made++;
    f.lastOpen = false;
    if (f.left > 0) { this.ftNext = this.t + 1.0; }
    else {
      // final attempt
      if (made) this.startDead('made', 1.6, () => { const p = f.shooter; if (f.reason === 'technical') return this.setupInbound(p.team, { x: 0, z: HALF_W + 0.8 }); this.setupInbound(1 - p.team, { x: 0, z: 0, baseline: f.side }); }, 'made');
      else this.ftLastMiss();
    }
  }
  ftLastMiss() {
    const f = this.ft; this.phase = 'live'; this.clockOn = false; this.ftReboundLive = true; this.ft = null;
    this.startPossession(1 - f.shooter.team, { keepBall: true }); this.poss.rebPending = true;
    this.ball.fromShot = { ev: f, team: f.shooter.team, type: 'ft' }; this.ball.shot = { ev: { team: f.shooter.team, type: 'ft', made: false }, p: f.shooter, scored: false, ftMiss: true };
  }
  updateFT(dt) {
    const f = this.ft; f.t += dt; const sh = f.shooter;
    if (f.next && this.t >= f.next) { // next attempt of the trip
      f.next = 0; f.resolved = false; f.ready = false; f.shotOut = false; f.t = 0.6; this.ball.shot = null;
      this.giveBall(sh, { quiet: true }); sh.dribbling = false; return;
    }
    if (f.resolved) { if (f.left > 0 && !f.next) f.next = this.t + 0.9; return; }
    if (!f.shotOut) {
      if (f.t > 1.4 && !f.ready) { f.ready = true; f.readyT = this.t; this.bus.emit('ftReady', { shooter: sh }); }
      if (f.ready && !sh.action && sh.hasBall) {
        const human = this.humans.find((h) => h.ctrl === sh);
        if (human ? human.intent.shootPressed : this.t - f.readyT > 0.9) { if (A.beginShot(this, sh, { shootPressed: true })) f.shotOut = true; }
      }
      return;
    }
    // ball in flight: a make resolves from scoreShot(); otherwise call it a miss once it has had time to settle
    const s = this.ball.shot;
    if (!s) { if (!sh.action) { f.shotOut = false; f.ready = false; f.t = 0.6; } return; } // not released yet, or the shot was lost
    if (!s.scored && this.t - s.ev.t > 2.0 && !sh.action) this.ftResolved(false);
  }

  /* ----------------------------------------------------------- dead ball / inbound */
  startDead(reason, secs, after, label) {
    this.phase = 'dead'; this.clockOn = false; this.dead = { reason, t: 0, secs, after, label }; this.bus.emit('dead', { reason });
    this.autoSubs();
    if (reason === 'made' || reason === 'out' || reason === 'violation' || reason === 'foul') this.prepareMarks(reason);
  }
  prepareMarks() { for (const p of this.on) p.ai.forcedMark = null; }
  sidelineSpot(pos) { return { x: clamp(pos.x, -HALF_L + 2.5, HALF_L - 2.5), z: (pos.z >= 0 ? 1 : -1) * (HALF_W + 0.9) }; }
  setupInbound(team, spot, opts = {}) {
    const tm = this.teams[team];
    this.phase = 'inbound'; this.clockOn = false; this.dead = null; this.phys.setActive(false); this.ball.fromShot = null; this.ball.shot = null;
    const side = this.dirOf(team);
    const sp = spot.baseline !== undefined ? { x: spot.baseline * (HALF_L + 0.9), z: spot.z ?? 0 } : spot;
    // after a made basket the inbounding team is the defender of the baseline just scored on
    this.startPossession(team, { shotClock: opts.shotClock });
    const inbounder = [...tm.court].filter((p) => !p.fouledOut).sort((a, b) => (b.data.attrs.pass - a.data.attrs.pass) + (a.height - b.height) * 20)[0];
    const others = tm.court.filter((p) => p !== inbounder);
    inbounder.pos = { x: sp.x, z: sp.z }; inbounder.vel = { x: 0, z: 0 }; inbounder.face = Math.atan2(-sp.z, side * 0.5 - sp.x * 0.0);
    inbounder.face = Math.atan2(-Math.sign(sp.z || 0.0001) * (Math.abs(sp.z) > HALF_W ? 1 : 0), -Math.sign(sp.x) * (Math.abs(sp.x) > HALF_L ? 1 : 0)) || inbounder.face;
    const back = side * sp.x < 0 || Math.abs(sp.x) >= HALF_L;
    const base = back ? { x: clamp(sp.x + side * 6, -HALF_L + 3, HALF_L - 3) } : { x: sp.x };
    const slots = [{ dx: 0, z: -4 }, { dx: 5, z: 3.5 }, { dx: 9, z: -2 }, { dx: 12, z: 4 }];
    others.forEach((p, i) => {
      const s = slots[i % 4]; p.pos = { x: clamp(base.x + side * s.dx * (back ? 1 : 0.4) + (back ? 0 : (i - 2) * 2.2), -HALF_L + 2, HALF_L - 2), z: clamp(s.z + (sp.z > 0 ? -1.5 : 1.5), -6.4, 6.4) }; p.vel = { x: 0, z: 0 }; p.face = side > 0 ? 0 : Math.PI; p.action = null; p.y = 0;
    });
    this.teams[team].court.forEach((p) => { p.action = null; });
    this.giveBall(inbounder, { quiet: true }); inbounder.dribbling = false;
    this.poss.inbound = RULES.inbound; this.poss.inbounder = inbounder;
    // defenders snap to their men
    for (const d of this.teams[1 - team].court) { const g = d.guard; if (g) { const hx = hoopX(side); d.pos = { x: g.pos.x + (hx - g.pos.x) * 0.12, z: g.pos.z * 0.9 + 0.3 }; d.vel = { x: 0, z: 0 }; d.face = Math.atan2(g.pos.z - d.pos.z, g.pos.x - d.pos.x); d.action = null; } }
    // inbounder's guard stands off the line
    this.ball.pos = A.handPos(inbounder, 1.2);
    this.bus.emit('inbound', { team, spot: sp });
    this.assignControl();
    const h = this.humans.find((hh) => hh.team === team); if (h) h.ctrl = inbounder;
  }
  beginLiveFromInbound() { this.phase = 'live'; this.clockOn = true; this.poss.inbound = 0; this.bus.emit('live', {}); }

  /* ----------------------------------------------------------- timeouts / subs */
  canTimeout(team) {
    const tm = this.teams[team];
    if (tm.timeouts <= 0 || this.phase === 'timeout' || this.phase === 'end') return false;
    if (this.phase === 'live' && this.poss.team !== team) return false;
    if (this.quarter >= 1 && this.clock <= 120 && tm.tqCount >= 2) return false;
    return !this.ball.pass && !this.ball.script && this.ball.state !== 'shot';
  }
  callTimeout(team) {
    if (!this.canTimeout(team)) return false;
    const tm = this.teams[team]; tm.timeouts--; if (this.clock <= 120) tm.tqCount++;
    this.timeoutState = { team, prevPhase: this.phase, t: 0 };
    this.prevPhaseSnapshot = { phase: this.phase, inbound: this.poss.inbound };
    this.phase = 'timeout'; this.clockOn = false;
    for (const p of tm.court) p.stamina = Math.min(100, p.stamina + 20);
    this.autoSubs();
    this.bus.emit('timeout', { team });
    return true;
  }
  endTimeout() {
    if (this.phase !== 'timeout') return;
    const t = this.timeoutState.team; this.timeoutState = null;
    const hold = this.ball.holder;
    if (hold && hold.team === this.poss.team) {
      const spot = this.sidelineSpot(hold.pos); const sc = Math.max(this.poss.shotClock, this.poss.shotClock < 14 ? 14 : this.poss.shotClock);
      this.setupInbound(this.poss.team, spot, { shotClock: sc });
    } else this.setupInbound(t, this.sidelineSpot({ x: 0, z: 1 }));
    this.bus.emit('timeoutEnd', {});
  }
  substitute(teamIdx, outP, inP) {
    const tm = this.teams[teamIdx];
    const i = tm.court.indexOf(outP), j = tm.bench.indexOf(inP);
    if (i < 0 || j < 0 || inP.fouledOut) return false;
    if (!['dead', 'timeout', 'ft', 'inbound', 'qend'].includes(this.phase)) return false;
    if (outP.hasBall) return false;
    tm.court[i] = inP; tm.bench[j] = outP; inP.onCourt = true; outP.onCourt = false; outP.action = null;
    inP.pos = { ...outP.pos }; inP.vel = { x: 0, z: 0 }; inP.face = outP.face; inP.guard = outP.guard; inP.guardedBy = outP.guardedBy;
    this.refreshOn(); this.assignGuards();
    const h = this.humans.find((hh) => hh.ctrl === outP); if (h) h.ctrl = inP;
    this.bus.emit('sub', { team: teamIdx, out: outP, in: inP });
    return true;
  }
  autoSubs() {
    for (const tm of this.teams) {
      const human = this.humans.some((h) => h.team === tm.idx);
      if (human && !this.settings.autoSubs) { for (const p of tm.court) if (p.fouledOut) this.forceSub(tm, p); continue; }
      for (const p of [...tm.court]) {
        if (p.hasBall || p.noSubUntil > this.t) continue;
        const tired = this.settings.fatigue && p.stamina < 32;
        const trouble = (p.fouls >= 5 && this.quarter < 4) || (p.fouls >= 4 && this.quarter < 3);
        if (!(tired || trouble || p.fouledOut)) continue;
        this.forceSub(tm, p);
      }
      // starters back when rested
      for (const p of [...tm.bench]) {
        if (p.fouledOut || p.stamina < 80 || p.fouls >= 4) continue;
        const slot = p.slot < 5 ? tm.court.find((c) => c.slot >= 5 && c.stamina < 60 && c.data.pos === p.data.pos && !c.hasBall) : null;
        if (slot) this.substitute(tm.idx, slot, p);
      }
    }
  }
  forceSub(tm, p) {
    if (p.hasBall) return;
    const cand = tm.bench.filter((b) => !b.fouledOut && b.stamina > 50 && b.fouls < 5).sort((a, b) => (b.data.pos === p.data.pos) - (a.data.pos === p.data.pos) || b.data.ovr - a.data.ovr);
    if (cand[0]) this.substitute(tm.idx, p, cand[0]);
  }

  /* ----------------------------------------------------------- violations / dead-ball sources */
  violation(kind, team) {
    this.bus.emit('violation', { kind, team }); this.popup(kind.toUpperCase(), this.ball.holder ?? null);
    const holder = this.ball.holder; if (holder) this.turnover(holder, kind);
    this.clockOn = false;
    const pos = holder?.pos ?? this.ball.pos;
    const spot = this.sidelineSpot(pos);
    this.startDead('violation', 1.3, () => this.setupInbound(1 - team, spot), 'violation');
  }
  outOfBounds() {
    const b = this.ball; const last = b.lastTouchTeam;
    this.bus.emit('out', { team: last }); this.clockOn = false; this.phys.setActive(false);
    const pos = { ...b.pos }; const team = 1 - last;
    const spot = Math.abs(pos.x) > HALF_L ? { baseline: Math.sign(pos.x), z: clamp(pos.z, -6, 6) } : this.sidelineSpot(pos);
    if (b.fromShot && b.shot) b.shot = null;
    this.ball.state = 'dead'; this.ball.fromShot = null;
    const sc = this.poss.team === team ? (this.poss.shotClock < 14 ? 14 : this.poss.shotClock) : RULES.shotClock;
    this.startDead('out', 1.1, () => this.setupInbound(team, spot, { shotClock: sc }), 'out');
  }
  autoFinish(p) {
    // alley-oop catch-and-finish: instant dunk with a sampled timing offset
    const side = this.dirOf(p.team), rim = { x: hoopX(side), y: COURT.rimHeight, z: 0 };
    p.hasBall = true; this.ball.holder = p; this.ball.state = 'held'; this.phys.setActive(false);
    p.action = { kind: 'dunk', t: 0.35, dur: 0.7, D: 0.35, hold: false, variant: 'alleyoop', type: 'dunk', rating: p.data.attrs.vertical, jumpH: 0.5, side, human: false, plannedMs: Math.random() * 20 - 10, released: false, offDribble: false, offBalance: false, catchShoot: false, momentum: 0.6, startPos: { ...p.pos }, startSpeed: 0 };
    p.shotMeter = { t: 0.35, D: 0.35, type: 'dunk', windowMs: 100 };
    p.y = Math.max(p.y, 2.0); p.vy = 0;
    A.releaseShot(this, p); void rim;
  }

  /* ----------------------------------------------------------- update loop */
  update(dt = TICK) {
    if (this.paused || this.hold || this.phase === 'end' || this.phase === 'init') return;
    this.t += dt;
    this.recordHistory();
    for (const h of this.humans) { if (h.intent.pick && h.ctrl?.hasBall && this.phase === 'live') this.requestScreen(h); }
    for (const h of this.humans) { h.switchCd = Math.max(0, h.switchCd - dt); if (h.intent.switchPressed && !(this.ball.holder && this.ball.holder.team === h.team)) this.switchPlayer(h); }
    switch (this.phase) {
      case 'tip': this.updateTip(dt); break;
      case 'dead': this.updateDead(dt); break;
      case 'ft': this.updateFT(dt); break;
      case 'qend': this.updateQEnd(dt); break;
      case 'timeout': this.timeoutState.t += dt; break;
      default: break;
    }
    const live = this.phase === 'live' || this.phase === 'inbound' || this.phase === 'ft' || this.phase === 'tip' || this.phase === 'dead' || this.phase === 'qend' || this.phase === 'timeout';
    if (live) this.stepPlayers(dt);
    this.stepBall(dt);
    if (this.phase === 'live' || this.phase === 'inbound') this.updateRules(dt);
    this.accumulateMinutes(dt);
    for (const h of this.humans) clearEdges(h.intent);
    if (this.over) this.phase = 'end';
  }

  intentFor(p, dt) {
    const h = this.humans.find((hh) => hh.ctrl === p);
    if (h && !(this.phase === 'ft' && this.ft && p !== this.ft.shooter)) return h.intent;
    return this.ai.intent(p, dt);
  }
  stepPlayers(dt) {
    const frozen = this.phase === 'timeout' || this.phase === 'tip';
    for (const p of this.on) {
      let intent;
      if (this.phase === 'tip') intent = {};
      else intent = this.intentFor(p, dt);
      p.intent = intent;
      p.protect = Math.max(0, (p.protect ?? 0) - dt);
      if (this.phase === 'live' || this.phase === 'inbound' || this.phase === 'ft') this.applyActions(p, intent, dt);
      if (!p.action && p.y > 0) { p.vy -= 9.81 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y <= 0) { p.vy = 0; } }
      A.updateShotAction(this, p, dt, intent);
      A.updateBlockAction(this, p, dt);
      if (p.action && (p.action.kind === 'pass' || p.action.kind === 'move' || p.action.kind === 'pump')) { p.action.t += dt; if (p.action.t >= p.action.dur) p.action = null; }
      if (p.spinT > 0) p.spinT -= dt;
      if (p.hesitateBurst > 0) { p.hesitateBurst -= dt; if (p.hesitateBurst <= 0) { const dir = { x: Math.cos(p.face), z: Math.sin(p.face) }; p.vel.x = dir.x * p.topSpeed * 0.9; p.vel.z = dir.z * p.topSpeed * 0.9; } }
      if (!frozen) movePlayer(p, p.action && (p.action.kind === 'oopjump') ? {} : intent, dt, { time: this.t, fatigue: this.settings.fatigue });
      // ball handler follow
      if (p.hasBall && (!p.action || p.action.kind !== 'shoot')) { /* ball is attached in stepBall */ }
      if (p.hasBall && p.action?.kind === 'move' && p.action.type === 'stepback') { /* keep dribbling */ }
    }
    separate(this.on, dt);
  }
  applyActions(p, i, dt) {
    if (p.fouledOut) return;
    if (p.hasBall) {
      if (this.phase === 'inbound') { if (i.passPressed || i.shootPressed) { const tgt = i.passTarget ?? A.bestTargetInDirection(this, p, i.mx ?? 0, i.mz ?? 0); if (tgt) A.startPass(this, p, tgt, i.passType ?? 'chest'); } return; }
      if (this.phase === 'ft') return;
      if (i.shootPressed && !p.action) { A.beginShot(this, p, i); return; }
      if (i.passPressed && !p.action) { const tgt = i.passTarget ?? A.bestTargetInDirection(this, p, i.passAimX ?? i.mx ?? 0, i.passAimZ ?? i.mz ?? 0); if (tgt) { A.startPass(this, p, tgt, i.passType ?? 'chest'); i.passPressed = false; } return; }
      if (i.dribbleMove && !p.action) {
        if (this.settings.travel === 'sim' && p.gathered && p.pumped) { this.violation('double dribble', p.team); return; }
        A.dribbleMove(this, p, i.dribbleMove, i);
      }
      if (i.pump && !p.action) { A.pumpFake(this, p); p.pumped = true; if (this.settings.travel === 'sim') { p.gathered = true; p.gatherPos = { ...p.pos }; } }
      A.postUp(this, p, dt, !!i.post);
      if (this.settings.travel === 'sim' && p.gathered && p.pumped && p.gatherPos && dist2(p.pos, p.gatherPos) > 1.6 && !p.action) { this.violation('travel', p.team); return; }
    } else {
      if (i.stealPressed) { const h = this.ball.holder; if (h && h.team !== p.team) A.attemptSteal(this, p, h); else p.recover = Math.max(p.recover, 0.15); }
      if (i.blockPressed) A.startBlock(this, p);
      if (i.charge) p.chargeUntil = this.t + 0.3;
      if (i.callForBall) p.ai.called = this.t;
    }
    p.cd.steal = Math.max(0, p.cd.steal - dt); p.cd.block = Math.max(0, p.cd.block - dt); p.cd.pump = Math.max(0, p.cd.pump - dt);
    if (!p.hasBall) p.pumped = false;
  }

  /* ----------------------------------------------------------- ball update */
  stepBall(dt) {
    const b = this.ball;
    if (b.state === 'held' && b.holder) {
      const p = b.holder;
      const spd = Math.hypot(p.vel.x, p.vel.z);
      if (p.action && (p.action.kind === 'shoot' || p.action.kind === 'ft' || p.action.kind === 'layup' || p.action.kind === 'dunk')) {
        const rel = (p.data.form.releaseHeight * p.height) / 2.0;
        const u = clamp(p.action.t / p.action.D, 0, 1);
        const ah = p.action.type === 'layup' || p.action.type === 'dunk' ? 1.0 + u * (rel - 1.0) : 1.0 + Math.pow(u, 1.5) * (rel - 1.0);
        b.pos = { x: p.pos.x + Math.cos(p.face) * (0.2 + 0.1 * u), y: p.y + ah, z: p.pos.z + Math.sin(p.face) * (0.2 + 0.1 * u) };
      } else if (p.action?.kind === 'pump') {
        b.pos = { x: p.pos.x + Math.cos(p.face) * 0.2, y: p.y + 1.55, z: p.pos.z + Math.sin(p.face) * 0.2 };
      } else if (p.dribbling) {
        p.dribblePh += dt / (0.62 - 0.22 * clamp(spd / 6, 0, 1));
        const ph = p.dribblePh % 1;
        const hp = A.handPos(p, 0);
        const protect = this.protectOffset(p);
        const h = BALL_R + (0.95 - BALL_R) * Math.abs(Math.cos(Math.PI * ph));
        b.pos = { x: hp.x + protect.x + p.vel.x * 0.05, y: h, z: hp.z + protect.z + p.vel.z * 0.05 };
        const crossing = ph < (p._lastPh ?? 1) && (p._lastPh ?? 1) > 0.9 ? false : false; void crossing;
        if ((p._lastPh ?? 0) < 0.5 && ph >= 0.5) this.bus.emit('dribble', { player: p, pos: { ...b.pos } });
        p._lastPh = ph;
      } else b.pos = { x: p.pos.x + Math.cos(p.face) * 0.3, y: p.y + 1.2, z: p.pos.z + Math.sin(p.face) * 0.3 };
      b.vel = { x: p.vel.x, y: 0, z: p.vel.z };
      return;
    }
    if (b.state === 'pass' && b.pass) { A.updatePass(this, dt); return; }
    if (b.state === 'shot' && b.script) { this.updateScript(dt); return; }
    if (b.state === 'loose' || b.state === 'tip') {
      const steps = Math.round(LOOP.physicsHz / LOOP.logicHz);
      for (let i = 0; i < steps; i++) this.phys.step();
      b.pos = this.phys.pos; b.vel = this.phys.vel; b.quat = this.phys.quat; b.looseT = (b.looseT ?? 0) + dt;
      for (const h of this.phys.drainHits()) this.bus.emit('ballHit', h);
      if (b.state === 'loose') this.checkPhysicalScore();
      if (b.state === 'loose' && this.phase === 'live') {
        if (outOfBounds(b.pos) && b.pos.y < 6 && !(b.fromShot && b.pos.y > 2.8 && Math.abs(b.pos.x) < HALF_L + 0.3 && Math.abs(b.pos.z) < 1.2)) this.outOfBounds();
        else A.resolveLoose(this, dt);
        // dead loose ball resting
        if (b.looseT > 4 && Math.hypot(b.vel.x, b.vel.z) < 0.2 && b.pos.y < 0.2) { const near = [...this.on].sort((a, c) => dist2(a.pos, b.pos) - dist2(c.pos, b.pos))[0]; near && this.giveBall(near); }
      } else if (b.state === 'loose' && (this.phase === 'dead')) { /* falling through the net */ }
    }
  }
  protectOffset(p) {
    const d = A.nearestDefender(this, p, 3);
    const f = { x: Math.cos(p.face), z: Math.sin(p.face) };
    if (!d) return { x: 0, z: 0 };
    const rel = (d.pos.x - p.pos.x) * -f.z + (d.pos.z - p.pos.z) * f.x; // defender lateral side
    const want = rel > 0 ? -1 : 1; // hand opposite the defender
    p.dribbleHand += (want - p.dribbleHand) * 0.02;
    return { x: 0, z: 0 };
  }
  updateScript(dt) {
    const b = this.ball; b.scriptT += dt;
    let seg = b.script[b.scriptI];
    while (seg && b.scriptT >= seg.T) {
      b.scriptT -= seg.T; b.pos = { ...seg.to };
      this.bus.emit('ballHit', { kind: seg.kind === 'swish' || seg.kind === 'dunk' ? 'net' : seg.kind, speed: 6, pos: { ...b.pos } });
      b.scriptI++; seg = b.script[b.scriptI];
      if (!seg) {
        const side = Math.sign(b.pos.x) || 1; b.script = null;
        // hand the ball to physics straight down through the net
        this.scoreShot();
        this.phys.launch({ x: hoopX(side), y: COURT.rimHeight - 0.05, z: 0 }, { x: 0, y: -2.6, z: 0 }); b.state = 'loose'; b.pos = this.phys.pos; b.looseT = 0;
        if (this.phase === 'live') b.state = 'loose';
        return;
      }
    }
    seg = b.script[b.scriptI]; if (!seg) return;
    const s = clamp(b.scriptT / seg.T, 0, 1);
    const f = seg.from, to = seg.to;
    b.pos = { x: f.x + (to.x - f.x) * s, y: f.y + (to.y - f.y) * s + seg.apex * 4 * s * (1 - s), z: f.z + (to.z - f.z) * s };
    b.vel = { x: (to.x - f.x) / seg.T, y: 0, z: (to.z - f.z) / seg.T };
  }
  checkPhysicalScore() {
    const b = this.ball; if (!b.shot || b.shot.scored) return;
    const p = b.pos, v = b.vel;
    for (const side of [-1, 1]) {
      const rim = { x: hoopX(side), z: 0 };
      const dh = Math.hypot(p.x - rim.x, p.z - rim.z);
      const prevY = b._prevY ?? p.y;
      if (prevY > COURT.rimHeight && p.y <= COURT.rimHeight && v.y < 0 && dh < RIM_R - 0.06) {
        const sh = b.shot; sh.made = true; sh.ev.made = true; sh.scored = false; this.scoreShot();
      }
    }
    b._prevY = p.y;
  }

  /* ----------------------------------------------------------- rules (clock, violations, charges, 3-second) */
  updateRules(dt) {
    const b = this.ball, poss = this.poss;
    // clocks
    if (this.clockOn && this.phase === 'live') {
      this.clock = Math.max(0, this.clock - dt); poss.shotClock = Math.max(0, poss.shotClock - dt); poss.elapsed += dt;
      if (!poss.crossed && b.state !== 'dead') { const x = b.holder ? b.holder.pos.x : b.pos.x; if (this.dirOf(poss.team) * x > 0.1) poss.crossed = true; }
      if (!poss.crossed && poss.elapsed > RULES.backcourt && b.holder && b.holder.team === poss.team) { this.violation('8-second', poss.team); return; }
      if (poss.shotClock <= 0 && !b.shot && b.holder?.team === poss.team && !(b.holder.action && b.holder.action.released)) { this.violation('shot clock', poss.team); return; }
      if (poss.shotClock <= 0 && b.shot && b.state === 'loose' && b.looseT > 2.2 && !b.shot.scored) { /* rim contact resets handled by reboundWon */ }
    }
    if (this.phase === 'inbound') {
      poss.inbound -= dt;
      if (poss.inbound <= 0) { const team = poss.team, ib = poss.inbounder; this.turnover(ib, '5-second'); this.violationInbound(team); return; }
    }
    // over and back (simulation rule)
    if (this.settings.travel === 'sim' && poss.crossed && b.holder && b.holder.team === poss.team && this.dirOf(poss.team) * b.holder.pos.x < -0.1 && b.holder.catchTime < this.t - 0.4) {
      if (b.holder.dribbling && this.lastCrossT !== undefined) { this.violation('over and back', poss.team); return; }
    }
    // defensive three seconds
    if (this.settings.threeSecond && this.phase === 'live') this.checkThreeSec(dt);
    // screens: a set offensive player next to the on-ball defender slows him
    this.checkScreens();
    // take-charge / offensive contact
    this.checkCharge();
    // quarter end
    if (this.clock <= 0 && this.phase === 'live' && !b.script && !b.pass && !(b.holder?.action && !b.holder.action.released) && !(b.shot && !b.shot.scored && b.looseT < 2.5 && b.state !== 'held')) this.endQuarter();
    else if (this.clock <= 0 && this.phase === 'live' && b.state === 'held' && !(b.holder?.action)) this.endQuarter();
    if (this.clock <= 0) this.clockOn = false;
    // coach decisions
    this.ai.coach(dt);
    void AI;
  }
  violationInbound(team) { this.clockOn = false; const spot = this.poss.inbounder?.pos ?? { x: 0, z: HALF_W }; this.startDead('violation', 1.1, () => this.setupInbound(1 - team, { x: spot.x, z: spot.z }), 'violation'); }
  checkThreeSec(dt) {
    const side = this.dirOf(this.poss.team);
    for (const d of this.teams[1 - this.poss.team].court) {
      const inP = inPaint(d.pos, -(-side)) || false; void inP;
      const paint = Math.abs(d.pos.z) < COURT.paintWidth / 2 && (HALF_L - side * d.pos.x) < COURT.ftLine + 1.2;
      let guarding = false;
      for (const o of this.teams[this.poss.team].court) if (dist2(o.pos, d.pos) < 2.3) guarding = true;
      if (paint && !guarding) { d.paintTime += dt; if (d.paintTime > RULES.threeSecond) { d.paintTime = 0; this.bus.emit('violation', { kind: 'defensive 3-seconds' }); this.popup('DEFENSIVE 3', d); this.technical(d); return; } } else d.paintTime = 0;
    }
  }
  technical(d) {
    const o = this.ball.holder ?? this.teams[this.poss.team].court[0]; this.clockOn = false;
    d.stats.pf += 0; this.teams[d.team].fouls += 0;
    this.startDead('violation', 1.2, () => { this.startFreeThrows(o, 1, 'technical'); }, 'technical');
  }
  checkScreens() {
    if (this.phase !== 'live') return; const off = this.teams[this.poss.team], def = this.teams[1 - this.poss.team];
    for (const s of off.court) {
      if (s.hasBall || Math.hypot(s.vel.x, s.vel.z) > 1.0) continue;
      for (const d of def.court) if (d.guard !== s && dist2(d.pos, s.pos) < 0.85 && (d.guard?.hasBall || d.guard?.ai.mode === 'drive')) { d.slowUntil = this.t + 0.7; if (!d.screenedAt || this.t - d.screenedAt > 2) { d.screenedAt = this.t; this.bus.emit('screen', { screener: s, defender: d }); } }
    }
  }
  checkCharge() {
    const h = this.ball.holder; if (!h || h.team !== this.poss.team || this.phase !== 'live') return;
    if (h.momentum < 0.4) return;
    for (const d of this.teams[1 - h.team].court) {
      if (d.chargeUntil < this.t) continue;
      if (dist2(d.pos, h.pos) < 0.78 && Math.hypot(d.vel.x, d.vel.z) < 1.6) {
        d.chargeUntil = 0;
        const p = clamp(0.45 + d.data.attrs.iq / 300 + h.momentum * 0.2, 0, 0.95);
        if (Math.random() < p && this.settings.fouls) { h.fouls++; h.stats.pf++; this.teams[h.team].fouls++; if (this.teams[h.team].fouls >= RULES.bonusFouls) this.teams[h.team].bonus = true; this.popup('CHARGE', d); this.bus.emit('charge', { by: d, on: h }); this.turnover(h, 'offensive foul'); this.clockOn = false; this.startDead('foul', 1.2, () => this.setupInbound(d.team, this.sidelineSpot(h.pos)), 'foul'); return; }
        d.stumble = 0.6; h.vel.x *= 0.4; h.vel.z *= 0.4;
      }
    }
  }
  /* ----------------------------------------------------------- phase helpers */
  updateDead(dt) {
    const d = this.dead; d.t += dt;
    // when a make just happened, let the ball finish dropping through the net
    if (d.t >= d.secs) { const fn = d.after; this.dead = null; fn && fn(); }
  }
  endQuarter() {
    this.clockOn = false; this.clock = 0;
    this.bus.emit('quarterEnd', { quarter: this.quarter });
    const finalQ = this.quarter >= 4 && this.score[0] !== this.score[1];
    if (finalQ) { this.finish(); return; }
    this.phase = 'qend'; this.qendT = 0;
    this.phys.setActive(false); this.ball.state = 'dead';
    for (const tm of this.teams) for (const p of tm.players) { p.stamina = Math.min(100, p.stamina + (this.quarter === 2 ? 45 : 18)); p.action = null; p.y = 0; p.hasBall = false; }
    this.ball.holder = null; this.ball.pass = null; this.ball.shot = null;
  }
  updateQEnd(dt) { this.qendT += dt; }
  nextQuarter() {
    if (this.phase !== 'qend') return;
    this.quarter++;
    const ot = this.quarter > 4;
    this.clock = ot ? RULES.otMinutes * 60 : this.qLen;
    if (ot || this.quarter === 3) for (const tm of this.teams) { tm.timeouts = tm.timeouts; }
    for (const tm of this.teams) { tm.fouls = 0; tm.bonus = false; tm.tqCount = 0; }
    this.bus.emit('quarterStart', { quarter: this.quarter, ot });
    if (ot) { this.phase = 'init'; this.start(); this.phase = 'tip'; return; }
    const team = this.arrow; this.arrow = 1 - this.arrow;
    this.setupInbound(team, this.sidelineSpot({ x: 0, z: 1 }), {});
    // swap-side layout already handled by dirOf()
  }
  finish() {
    this.phase = 'end'; this.over = true; this.clockOn = false;
    const box = this.boxScore();
    this.bus.emit('final', { score: [...this.score], box, winner: this.score[0] > this.score[1] ? 0 : 1 });
  }
  forfeit(team) { this.score = team === 0 ? [0, 20] : [20, 0]; this.forfeited = team; this.finish(); }
  boxScore() {
    return this.teams.map((tm) => tm.players.map((p) => ({ id: p.id, name: p.name, number: p.number, pos: p.data.pos, ...p.stats, min: Math.round(p.stats.min / 60), fouledOut: p.fouledOut })));
  }
  accumulateMinutes(dt) { if (this.clockOn) for (const p of this.on) p.stats.min += dt; }
  recordHistory() {
    const h = { ball: { x: this.ball.pos.x, z: this.ball.pos.z }, p: this.on.map((p) => ({ x: p.pos.x, z: p.pos.z })) };
    this.hist.push(h); if (this.hist.length > 48) this.hist.shift();
  }
  /** Delayed world view for AI reaction time. */
  delayed(sec) { const i = Math.max(0, this.hist.length - 1 - Math.round(sec * LOOP.logicHz)); return this.hist[i] ?? this.hist[this.hist.length - 1]; }
}

export const blankIntent = () => ({ mx: 0, mz: 0, sprint: false, shootHeld: false, handsUp: false, post: false, charge: false, blockHeld: false, shootPressed: false, shootReleased: false, passPressed: false, passType: 'chest', dribbleMove: null, pump: false, stealPressed: false, blockPressed: false, switchPressed: false, callForBall: false, dunkMod: false, passAimX: 0, passAimZ: 0 });
export function clearEdges(i) { i.shootPressed = false; i.shootReleased = false; i.passPressed = false; i.dribbleMove = null; i.pump = false; i.stealPressed = false; i.blockPressed = false; i.switchPressed = false; i.callForBall = false; }
void badge; void blankStats; void hoopDist; void clampCourt;
