// AI: per-player FSM (Idle, Defend, Cut, Screen, Spot-Up, Drive, Shoot, Pass, Rebound, Inbound, Transition) driven by a
// utility evaluation every ~100 ms, with steering for movement. Difficulty tables live in tuning.js.
import { AI, RULES, COURT, SHOT } from '../tuning.js';
import { PLAYS, PLAY_BY_NAME } from '../data/plays.js';
import { makeProbability, gaussian, streakTier } from '../gameplay/shooting.js';
import { hoopX, hoopDist, dist2, isThree, toWorld, HALF_L, HALF_W, segDist } from '../gameplay/court.js';
import { shotRatingOf, badge } from '../gameplay/movement.js';
import { arrive, seek, separation, avoid, interpose } from './steering.js';
import { bestSpot } from './spacing.js';
import { clamp } from '../engine/rng.js';
import { POSITIONS } from '../data/generator.js';

const lvl = (g) => AI.levels[g.settings.difficulty] ?? AI.levels.allstar;
const fresh = () => ({ mx: 0, mz: 0, sprint: false, shootHeld: false, shootPressed: false, shootReleased: false, passPressed: false, passType: 'chest', passTarget: null, dribbleMove: null, pump: false, stealPressed: false, blockPressed: false, handsUp: false, post: false, charge: false });

export class AIController {
  constructor(g) { this.g = g; this.teamCoach = [{ lastSub: 0, tmo: 0 }, { lastSub: 0, tmo: 0 }]; }

  /* ----------------------------------------------------------- team-level */
  onPossession(team) {
    const g = this.g, tm = g.teams[team];
    // roles by lineup position so slot 0 = PG ... 4 = C
    const order = [...tm.court].sort((a, b) => POSITIONS.indexOf(a.data.pos) - POSITIONS.indexOf(b.data.pos));
    order.forEach((p, i) => { p.ai.slot = i; });
    // best ball-handler first: the PG slot goes to the best handler
    const handler = [...tm.court].sort((a, b) => b.data.attrs.ball + b.data.attrs.pass - (a.data.attrs.ball + a.data.attrs.pass))[0];
    const slot0 = tm.court.find((p) => p.ai.slot === 0);
    if (handler !== slot0) { const s = handler.ai.slot; handler.ai.slot = 0; slot0.ai.slot = s; }
    g.poss.plan = null;
  }
  pickPlay(team) {
    const g = this.g, tm = g.teams[team];
    if (tm.call) return PLAY_BY_NAME[tm.call] ?? PLAYS[0];
    const names = tm.plays?.length ? tm.plays : ['Motion', 'Pick-and-Roll'];
    const roll = Math.random();
    if (roll < 0.75) return PLAY_BY_NAME[names[(Math.random() * names.length) | 0]] ?? PLAYS[5];
    return PLAYS[(Math.random() * 6) | 0];
  }
  /** Coach AI: subs happen at dead balls (Game.autoSubs); here: timeouts, intentional fouls, 2-for-1, last-possession plays. */
  coach(dt) {
    const g = this.g;
    for (const tm of g.teams) {
      if (g.humans.some((h) => h.team === tm.idx)) continue;
      const c = this.teamCoach[tm.idx]; c.tmo -= dt;
      if (c.tmo > 0) continue;
      const run = g.runs[1 - tm.idx];
      if (run >= 9 && g.phase === 'live' && g.canTimeout(tm.idx)) { c.tmo = 40; g.callTimeout(tm.idx); this.timeoutEnds = g.t + 3.5; }
      else if (g.quarter >= 4 && g.clock < 25 && g.poss.team === tm.idx && g.canTimeout(tm.idx) && Math.abs(g.score[0] - g.score[1]) <= 3 && g.poss.elapsed < 2 && g.poss.crossed === false) { c.tmo = 40; g.callTimeout(tm.idx); this.timeoutEnds = g.t + 3.5; }
    }
    if (g.phase === 'timeout' && this.timeoutEnds && g.t > this.timeoutEnds && !g.humans.some((h) => g.timeoutState?.team === h.team)) { this.timeoutEnds = 0; g.endTimeout(); }
    // intentional fouls
    for (const tm of g.teams) {
      const behind = g.score[1 - tm.idx] - g.score[tm.idx];
      tm.intentionalFoul = g.quarter >= 4 && g.clock < 40 && behind > 0 && behind <= 8 && g.poss.team !== tm.idx;
    }
  }

  /* ----------------------------------------------------------- per-player */
  intent(p, dt) {
    const I = this._intent(p, dt); const g = this.g;
    // explicit FSM label for the debug overlay: Idle, Defend, Cut, Screen, Spot-Up, Drive, Shoot, Pass, Rebound, Inbound, Transition
    const ph = g.phase; const off = g.poss.team === p.team;
    p.ai.fsm = ph === 'inbound' ? 'Inbound' : (g.ball.state === 'loose' || g.ball.state === 'tip') && ph === 'live' ? 'Rebound' : ph !== 'live' ? 'Idle'
      : I.shootPressed || p.action?.kind === 'shoot' || p.action?.kind === 'layup' || p.action?.kind === 'dunk' ? 'Shoot' : I.passPressed ? 'Pass'
      : off ? (p.hasBall ? ({ drive: 'Drive', shoot: 'Shoot', pass: 'Pass', transition: 'Transition' }[p.ai.mode] ?? 'Idle') : p.ai.screening ? 'Screen' : p.ai.cutting ? 'Cut' : g.poss.crossed ? 'Spot-Up' : 'Transition') : 'Defend';
    return I;
  }
  _intent(p, dt) {
    const g = this.g; const I = p.ai.I = fresh(); p.ai.t -= dt;
    if (p.fouledOut) return I;
    const ph = g.phase;
    if (ph === 'ft') return this.ftIntent(p, I);
    if (ph === 'inbound') return this.inboundIntent(p, I);
    if (ph !== 'live') return I;
    const off = g.poss.team === p.team;
    const ball = g.ball;
    if (ball.state === 'pass' && ball.pass?.to === p) { const a = arrive(p, ball.pass.p1, 0.5); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 2; I.handsUp = false; return I; }
    if (ball.state === 'loose' || ball.state === 'tip') return this.reboundIntent(p, I);
    if (ball.state === 'shot') return this.shotInFlightIntent(p, I);
    if (off) return p.hasBall ? this.handlerIntent(p, I, dt) : this.offBallIntent(p, I, dt);
    return this.defenseIntent(p, I, dt);
  }

  /* --- free throws & inbounds */
  ftIntent(p, I) {
    const f = this.g.ft; if (!f || p === f.shooter) return I;
    const mark = f.marks?.get(p); if (mark) { const a = arrive(p, mark, 1.2); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 6; }
    return I;
  }
  inboundIntent(p, I) {
    const g = this.g, poss = g.poss, ib = poss.inbounder;
    if (p.team !== poss.team) { // defenders deny
      const guard = p.guard; if (guard && guard.team === poss.team && guard !== ib) { const t = interpose(guard.pos, { x: hoopX(g.dirOf(poss.team)), z: 0 }, 0.12); const a = arrive(p, t, 0.8); I.mx = a.x; I.mz = a.z; I.handsUp = true; }
      return I;
    }
    if (p === ib) {
      p.ai.wait = (p.ai.wait ?? 0) + 1 / 60;
      if (p.ai.wait > Math.max(0.5, lvl(g).react * 3) && (g.t - (poss.since ?? 0)) > 0.8) {
        const tgt = this.bestReceiver(p, true);
        if (tgt) { I.passPressed = true; I.passTarget = tgt; p.ai.wait = 0; }
      }
      return I;
    }
    // receivers get open: run toward the ball side, shake the defender
    const spot = this.spacingSpot(p, false);
    const t = { x: spot.x, z: spot.z + Math.sin(g.t * 2 + p.slot) * 1.2 };
    const a = arrive(p, t, 1.0); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 3; I.callForBall = Math.random() < 0.02;
    return I;
  }

  /* --- shared helpers */
  openness(q) {
    const g = this.g; let md = 6;
    for (const d of g.teams[1 - q.team].court) md = Math.min(md, dist2(d.pos, q.pos));
    return clamp(md / 3.2, 0, 1);
  }
  estimateShot(p, from = p.pos) {
    const g = this.g, side = g.dirOf(p.team), d = hoopDist(from, side), three = isThree(from, side);
    const type = d < 2.2 ? 'layup' : three ? 'three' : d < 3.8 ? 'floater' : 'midrange';
    let md = 6; for (const o of g.teams[1 - p.team].court) md = Math.min(md, dist2(o.pos, from));
    const contest = clamp((1.8 - md) / 1.8, 0, 1) * 0.75;
    const mp = makeProbability({ type, rating: shotRatingOf(p, type), distance: d, contest, staminaPct: p.stamina, streak: streakTier(p.run), difficulty: g.settings.difficulty, grade: 'good', usersShot: false });
    return { p: clamp(mp.p / SHOT.gradeMod.good * 0.62, 0.02, 0.9), pts: three ? 3 : 2, type, d, contest, three };
  }
  bestReceiver(p, inbound = false) {
    const g = this.g; let best = null, bs = -9;
    for (const q of g.teams[p.team].court) {
      if (q === p) continue;
      const d = dist2(q.pos, p.pos); if (d < 2.5 && !inbound) continue;
      const seg = this.laneRisk(p, q);
      const est = this.estimateShot(q);
      const adv = hoopDist(q.pos, g.dirOf(p.team));
      let s = this.openness(q) * 1.3 + est.p * est.pts * 0.9 - seg * 1.5 - adv / 30 + (q.ai.called && g.t - q.ai.called < 2 ? 0.4 : 0) + p.data.attrs.pass / 400;
      if (inbound && d > 24) s -= 1;
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }
  laneRisk(p, q) {
    const g = this.g; let r = 0;
    for (const d of g.teams[1 - p.team].court) { const { d: ld, t } = segDist(d.pos, p.pos, q.pos); if (t > 0.1 && t < 0.95) r = Math.max(r, clamp(1.4 - ld, 0, 1.4) / 1.4); }
    return r;
  }
  spacingSpot(p, shooter) {
    const g = this.g, side = g.dirOf(p.team);
    if (p.ai.spotT === undefined || g.t - p.ai.spotT > 0.5 || !p.ai.spot) {
      const sh = p.data.attrs.three > 70 || p.data.archetype === 'sharpshooter' || p.data.archetype === 'stretchBig';
      p.ai.spot = bestSpot({ me: p, side, mates: g.teams[p.team].court, defenders: g.teams[1 - p.team].court, shooter: shooter || sh, prefer: p.data.pos === 'C' || p.data.archetype === 'postScorer' ? 'inside' : 'mid' });
      p.ai.spotT = g.t;
    }
    return p.ai.spot;
  }
  currentPlan() {
    const g = this.g, poss = g.poss;
    if (!poss.crossed) return null;
    if (!poss.plan) {
      const trans = poss.elapsed < 4.5 && g.poss.team === g.ball.lastTouchTeam && poss.fast;
      const play = trans ? PLAYS.find((x) => x.id === 'transition') : this.pickPlay(poss.team);
      poss.plan = { play, step: 0, t: 0, started: g.t };
      g.bus.emit('playStart', { team: poss.team, play: play.name });
    }
    const pl = poss.plan; pl.t = g.t - pl.started;
    let acc = 0, step = 0;
    for (let i = 0; i < pl.play.steps.length; i++) { acc += pl.play.steps[i].dur; if (pl.t < acc) { step = i; break; } step = pl.play.steps.length; }
    pl.step = step; pl.done = step >= pl.play.steps.length;
    return pl;
  }
  slotTarget(p, pl) {
    if (!pl || pl.done) return null;
    const s = pl.play.steps[pl.step]?.slots[p.ai.slot]; if (!s) return null;
    return { ...toWorld(this.g.dirOf(p.team), s.d, s.l), act: s.act };
  }

  /* --- ball handler */
  handlerIntent(p, I, dt) {
    const g = this.g, L = lvl(g), side = g.dirOf(p.team), rim = { x: hoopX(side), z: 0 };
    const d = hoopDist(p.pos, side), sp = Math.hypot(p.vel.x, p.vel.z);
    const tm = g.teams[p.team], pace = tm.strategy.pace;
    const backcourt = !g.poss.crossed;
    const defNear = g.teams[1 - p.team].court.map((o) => ({ o, d: dist2(o.pos, p.pos) })).sort((a, b) => a.d - b.d);
    const onBall = defNear[0];
    const pl = this.currentPlan();
    // run & push the ball up the floor
    if (backcourt) {
      g.poss.fast = pace > 0.65 || g.poss.elapsed < 2;
      const t = { x: side * (HALF_L - 14), z: clamp(p.pos.z * 0.5, -4, 4) };
      const e = arrive(p, t, 1.5); I.mx = e.x; I.mz = e.z; I.sprint = pace > 0.35 || g.poss.elapsed > 5; p.ai.mode = 'transition';
      const mates = g.teams[p.team].court.filter((q) => q !== p);
      const ahead = mates.filter((q) => side * (q.pos.x - p.pos.x) > 4 && this.openness(q) > 0.6);
      if (ahead.length && p.ai.t <= 0 && this.laneRisk(p, ahead[0]) < 0.4 && Math.random() < 0.25 + L.decision * 0.15) { I.passPressed = true; I.passTarget = ahead[0]; I.passType = d > 20 ? 'overhead' : 'chest'; }
      this.poss8(p, I);
      return this.avoidLane(p, I, defNear);
    }
    // fast-break / early-offence finishes
    const est = this.estimateShot(p);
    if (p.ai.mode === 'drive' && g.t < (p.ai.driveUntil ?? 0)) return this.moveHandler(p, I, pl, defNear);
    if (p.ai.t > 0) return this.moveHandler(p, I, pl, defNear);
    const sinceCatch = g.t - p.catchTime;
    if (sinceCatch < 0.22) return this.moveHandler(p, I, pl, defNear);
    p.ai.t = Math.max(AI.think, L.react * 0.6) * (0.8 + Math.random() * 0.5);
    // utility scores
    const shotClock = g.poss.shotClock;
    const timeBias = shotClock < 5 ? 2.2 : shotClock < 9 ? 1.2 : 0.7;
    const lastPoss = g.quarter >= 4 && g.clock < 24 && g.score[1 - p.team] - g.score[p.team] <= 3;
    const holdForLast = lastPoss && g.clock > 9 && shotClock > 4;
    const twoForOne = g.quarter < 4 && g.clock < 42 && g.clock > 26 && g.poss.elapsed < 14;
    const style = p.data.archetype; const tend = ARCH_TEND(style);
    const threeBias = est.three ? 0.5 + tm.strategy.threeFreq * 0.45 + tend.threeFreq * 0.5 : 1;
    let uShoot = est.p * est.pts * threeBias * timeBias * (est.d < 8.5 ? 1 : 0.7) * (0.82 + 0.5 * L.decision * 0) + (twoForOne ? 0.25 : 0);
    if (est.contest > 0.6) uShoot *= 0.55;
    if (p.ai.shotAt && g.t - p.ai.shotAt < 3) uShoot *= 0.6;
    const lane = this.laneOpenness(p, rim, defNear);
    let uDrive = 2.6 * (0.45 + tend.drive) * (onBall.d > 2 ? 1.4 : 1) * lane * (1.05 - clamp(d / 18, 0, 1)) * (1.1 - tm.strategy.threeFreq * 0.4) * (p.stamina > 25 ? 1 : 0.5);
    const tgt = this.bestReceiver(p);
    const tgtEst = tgt ? this.estimateShot(tgt) : null;
    let uPass = tgt && sinceCatch > 0.75 ? (tgtEst.p * tgtEst.pts * 0.95 + this.openness(tgt) * 0.35 - this.laneRisk(p, tgt) * 0.7) * (0.7 + (tend.pass ?? 0.2) * 0.8) : 0;
    // patience: run the set before settling for a shot; open looks and a draining shot clock override it
    const fastBreak = g.poss.fast && g.poss.elapsed < 5.5;
    const patience = fastBreak ? 1 : clamp((g.poss.elapsed - 3.5) / 9, 0.12, 1) * (0.7 + 0.6 * (1 - tm.strategy.pace));
    const greatLook = est.p * est.pts > 1.1 && est.contest < 0.25;
    uShoot *= greatLook ? Math.max(patience, 0.55) : patience;
    uDrive *= fastBreak ? 1 : clamp(0.35 + patience, 0.35, 1);
    if (pl && !pl.done && pl.step === 0) { uShoot *= 0.5; uDrive *= 0.7; uPass *= 0.9; }
    if (pl && !pl.done && pl.play.id === 'iso') { uPass *= 0.35; uShoot *= 1.0; }
    if (holdForLast) { uShoot *= 0.15; uDrive *= 0.4; uPass *= 0.5; }
    const uHold = 0.28;
    const noise = (1 - L.decision) * 0.5;
    const opts = [['shoot', uShoot], ['drive', uDrive], ['pass', uPass], ['hold', uHold]].map(([k, v]) => [k, v + (Math.random() - 0.5) * noise]);
    p.ai.utility = Object.fromEntries(opts.map(([k, v]) => [k, +v.toFixed(2)]));
    opts.sort((a, b) => b[1] - a[1]);
    const choice = opts[0][0];
    p.ai.mode = choice; if (choice === 'drive') p.ai.driveUntil = g.t + 1.6;
    if (choice === 'shoot' && est.d < 11.5) { I.shootPressed = true; I.shootHeld = true; p.face = Math.atan2(rim.z - p.pos.z, rim.x - p.pos.x); }
    else if (choice === 'pass' && tgt) { I.passPressed = true; I.passTarget = tgt; I.passType = this.passTypeFor(p, tgt); p.ai.mode = 'pass'; }
    if (I.shootPressed || I.passPressed) { p.ai.t = 0.25; return I; }
    return this.moveHandler(p, I, pl, defNear);
  }
  passTypeFor(p, tgt) {
    const g = this.g, side = g.dirOf(p.team);
    const rimD = hoopDist(tgt.pos, side); const cutting = tgt.ai.cutting && Math.hypot(tgt.vel.x, tgt.vel.z) > 3;
    if (rimD < 4.6 && cutting && p.data.attrs.pass > 55) return 'lob';
    const r = this.laneRisk(p, tgt);
    if (r > 0.55) return Math.random() < 0.5 ? 'bounce' : 'overhead';
    return dist2(p.pos, tgt.pos) > 14 ? 'overhead' : 'chest';
  }
  laneOpenness(p, rim, defNear) {
    let o = 1; const dir = seek(p, rim);
    for (const { o: q } of defNear.slice(0, 3)) {
      const rx = q.pos.x - p.pos.x, rz = q.pos.z - p.pos.z, ahead = rx * dir.x + rz * dir.z;
      if (ahead > 0 && ahead < dist2(p.pos, rim)) { const lat = Math.abs(rx * -dir.z + rz * dir.x); if (lat < 1.3) o *= clamp(lat / 1.3 + 0.1, 0.05, 1); }
    }
    return o;
  }
  moveHandler(p, I, pl, defNear) {
    const g = this.g, L = lvl(g), side = g.dirOf(p.team), rim = { x: hoopX(side), z: 0 }, d = hoopDist(p.pos, side);
    const mode = p.ai.mode;
    if (mode === 'drive') {
      const e = seek(p, rim); const av = avoid(p, { x: e.x, z: e.z }, defNear.slice(0, 3).map((x) => x.o), 2.2);
      I.mx = av.x; I.mz = av.z; I.sprint = true;
      if (defNear[0].d < 2 && p.cd.move <= 0 && Math.random() < 0.05 + L.decision * 0.05) I.dribbleMove = ['cross', 'spin', 'behind', 'hesitate'][(Math.random() * 4) | 0];
      if (d < 2.6 || (d < 4.2 && defNear[0].d < 1.0 && Math.random() < 0.15)) { I.shootPressed = true; I.shootHeld = true; I.dunkMod = p.data.attrs.vertical > 70 && Math.random() < 0.6; }
      return I;
    }
    // probe: move toward the play's handler target or hover at the top
    const tgt = this.slotTarget(p, pl) ?? { x: side * (HALF_L - 9), z: p.pos.z * 0.8, act: 'ball' };
    const wobble = { x: tgt.x + Math.sin(g.t * 1.3 + p.slot) * 0.9, z: tgt.z + Math.cos(g.t * 1.7) * 1.2 };
    const e = arrive(p, wobble, 1.4); I.mx = e.x * 0.8; I.mz = e.z * 0.8; I.sprint = e.d > 5;
    if (tgt.act === 'drive' && pl && pl.step >= 1) p.ai.mode = 'drive';
    if (defNear[0] && defNear[0].d < 1.6 && p.cd.move <= 0 && Math.random() < 0.02 + 0.03 * L.decision) I.dribbleMove = ['cross', 'stepback', 'hesitate', 'behind'][(Math.random() * 4) | 0];
    if (p.data.archetype === 'postScorer' && d < 5 && !I.shootPressed) { I.post = true; p.ai.postT = (p.ai.postT ?? 0) + 0.05; if (p.ai.postT > 1.6) { I.shootPressed = true; I.shootHeld = true; p.ai.postT = 0; } }
    return this.avoidLane(p, I, defNear);
  }
  avoidLane(p, I, defNear) { const av = avoid(p, { x: I.mx, z: I.mz }, defNear.slice(0, 2).map((x) => x.o), 1.4); I.mx = av.x; I.mz = av.z; return I; }
  poss8(p, I) { void p; return I; }

  /* --- off-ball offense */
  offBallIntent(p, I) {
    const g = this.g, side = g.dirOf(p.team), poss = g.poss; const rim = { x: hoopX(side), z: 0 };
    const holder = g.ball.holder ?? g.ball.pass?.to;
    if (!poss.crossed) { // run the lanes
      const lane = { x: side * (HALF_L - 11 - p.ai.slot * 0.6), z: [-5, 5, 0, -2.5, 2.5][p.ai.slot % 5] };
      const a = arrive(p, { x: Math.max(side * p.pos.x + 0, 0) > -1 ? lane.x : lane.x, z: lane.z }, 1.4); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 3; return I;
    }
    const pr = g.pickReq; const called = pr && pr.screener === p && g.t - pr.last < 0.6; if (pr && pr.screener === p && !called && g.t - pr.last < 1.4 && !p.ai.cutUntil) p.ai.cutUntil = g.t + 1.0; // roll after the screen
    const pl = this.currentPlan(); const t = called ? { act: 'screen' } : this.slotTarget(p, pl);
    p.ai.cutting = false;
    let target = null;
    if (t && t.act !== 'ball') {
      target = { x: t.x, z: t.z };
      if (t.act === 'screen' && holder) {
        const gd = holder.guardedBy ?? g.teams[1 - p.team].court[0];
        const behind = interpose(gd.pos, rim, 0.0);
        target = { x: behind.x - side * 0.2, z: behind.z + (holder.pos.z > 0 ? -0.3 : 0.3) };
        p.ai.screening = true;
      } else p.ai.screening = false;
      if (t.act === 'roll' || t.act === 'cut') { p.ai.cutting = true; I.sprint = true; }
      if (t.act === 'pop') { I.sprint = false; }
      if (t.act === 'post') { target = { x: t.x, z: t.z }; }
    } else {
      const sp = this.spacingSpot(p, false); target = { x: sp.x, z: sp.z };
      // basket cut when the defender is ball-watching
      const gd = p.guardedBy;
      if (gd && g.ball.holder && p.ai.slot > 1 && hoopDist(p.pos, side) > 3.5 && Math.random() < 0.004 && dist2(gd.pos, g.ball.holder.pos) < dist2(gd.pos, p.pos)) { p.ai.cutUntil = g.t + 1.0; }
      if (p.ai.cutUntil > g.t) { target = { x: hoopX(side) - side * 1.8, z: p.pos.z * 0.3 }; p.ai.cutting = true; I.sprint = true; }
      // when the handler drives, shooters fill corners
      if (holder && holder.ai.mode === 'drive' && !p.ai.cutting) { const sp2 = this.spacingSpot(p, true); target = { x: sp2.x, z: sp2.z }; }
    }
    const a = arrive(p, target, 1.1);
    let m = { x: a.x, z: a.z };
    const sep = separation(p, g.teams[p.team].court, 1.8); m = { x: m.x + sep.x * 0.5, z: m.z + sep.z * 0.5 };
    I.mx = m.x; I.mz = m.z; I.sprint = I.sprint || a.d > 5;
    if (Math.random() < 0.01) I.callForBall = true;
    if (holder && holder !== p) p.face = Math.atan2(holder.pos.z - p.pos.z, holder.pos.x - p.pos.x);
    // screens: stand still when set
    if (p.ai.screening && a.d < 0.5) { I.mx = 0; I.mz = 0; }
    // catch-and-shoot when it comes to me: AI shoots from handlerIntent (hasBall)
    return I;
  }

  /* --- defence */
  defenseIntent(p, I, dt) {
    const g = this.g, off = g.teams[g.poss.team], side = g.dirOf(g.poss.team), rim = { x: hoopX(side), z: 0 };
    const tm = g.teams[p.team], L = lvl(g), pressure = tm.strategy.pressure * L.contest;
    const view = g.delayed(L.react);
    const ballPos = view.ball;
    const holder = g.ball.holder ?? g.ball.pass?.to ?? null;
    const scheme = tm.scheme;
    let guard = p.guard && p.guard.team === off.idx ? p.guard : off.court[p.slot % 5];
    if (scheme === 'switch' && holder && guard !== holder) {
      const hd = holder.guardedBy; if (hd && hd !== p && dist2(p.pos, holder.pos) < dist2(hd.pos, holder.pos) - 1 && dist2(p.pos, holder.pos) < 2.2) { guard = holder; }
    }
    const idx = off.court.indexOf(guard);
    const gp = view.p[off.court.indexOf(guard) + (g.poss.team === 0 ? 0 : 5)] ?? guard.pos;
    const onBall = holder && guard === holder;
    let target;
    const helpPt = { x: rim.x - side * 3.2, z: 0 };
    const press = scheme === 'press' || pressure > 0.78;
    if (scheme === 'zone') {
      const zs = zoneSpots(side, ballPos); const mine = zs[(p.ai.slot ?? p.slot) % 5];
      let nearest = null, bd = 99; for (const o of off.court) { const d = dist2(o.pos, mine); if (d < bd) { bd = d; nearest = o; } }
      target = bd < 2.4 ? interpose(mine, nearest.pos, 0.5) : mine;
      if (holder && dist2(holder.pos, mine) < 2.3) { target = interpose(holder.pos, rim, 0.14); }
    } else if (onBall) {
      const gap = (holder.dribbling ? 0.95 : 0.8) + 0.9 * (1 - pressure) + (holder.data.attrs.three > 80 && !isThreeSafe(g, holder) ? 0 : 0);
      const ref = holder.pos;
      const toRim = seek({ pos: ref }, rim);
      target = { x: ref.x + toRim.x * gap, z: ref.z + toRim.z * gap };
      if (press && !g.poss.crossed) { target = { x: ref.x + toRim.x * 0.9, z: ref.z + toRim.z * 0.9 }; }
      I.handsUp = dist2(p.pos, ref) < 2.6;
      // closeout: sprint at a catching shooter and get hands up before he can set his feet
      if (dist2(p.pos, holder.pos) > 1.3 && dist2(p.pos, holder.pos) < 7 && g.t - holder.catchTime < 1.2) { I.sprint = true; I.handsUp = true; }
      // on-ball steal attempt
      if (dist2(p.pos, ref) < 1.3 && p.cd.steal <= 0 && Math.random() < dt * 0.22 * L.steal * (0.35 + 0.6 * p.data.attrs.steal / 99) * (0.5 + pressure)) I.stealPressed = true;
      if (g.teams[p.team].intentionalFoul && dist2(p.pos, ref) < 1.4 && !holder.action && Math.random() < 0.08) { g.callFoul(p, holder, 'personal', { intentional: true }); return I; }
      if (holder.ai.mode === 'drive' && holder.momentum > 0.5 && Math.random() < 0.01 * L.decision) I.charge = true;
    } else {
      const dr = hoopDist(gp, g.dirOf(g.poss.team)); const bd = holder ? dist2(holder.pos, rim) : 99;
      const hold = interpose(gp, rim, clamp(0.38 + 0.18 * (1 - pressure), 0.25, 0.55));
      target = hold;
      // help defence: sag toward the paint when the ball handler is attacking the rim
      const helpAmt = tm.strategy.help * (bd < 7 || (holder?.ai.mode === 'drive') ? 1 : 0.35) * (scheme === 'drop' && p.data.pos === 'C' ? 1.4 : 1) * (dr > 6 ? 1 : 0.5);
      target = { x: target.x + (helpPt.x - target.x) * clamp(helpAmt * 0.5, 0, 0.7), z: target.z + (helpPt.z - target.z) * clamp(helpAmt * 0.5, 0, 0.7) };
      // deny passing lanes
      if (holder && pressure > 0.55 && dist2(gp, holder.pos) < 9) { const den = interpose(gp, holder.pos, 0.22); target = { x: (target.x + den.x) / 2, z: (target.z + den.z) / 2 }; I.handsUp = true; }
      if (scheme === 'drop' && p.data.pos === 'C') target = { x: rim.x - side * 3.6, z: holder ? holder.pos.z * 0.35 : 0 };
    }
    // contest shooters & plan blocks
    const sh = holder && holder.action && (holder.action.kind === 'shoot' || holder.action.kind === 'layup' || holder.action.kind === 'dunk') ? holder : null;
    if (sh) {
      const dd = dist2(p.pos, sh.pos);
      if (dd < 3.2) { target = interpose(sh.pos, rim, 0.0); target = { x: sh.pos.x + (rim.x - sh.pos.x) * 0.0, z: sh.pos.z }; I.handsUp = true; if (dd > 1.0) I.sprint = true; }
      if (dd < 2.3 && !p.ai.blockPlan && sh.action.t < sh.action.D && p.cd.block <= 0) {
        const want = L.contest * 0.42 * (0.4 + p.data.attrs.block / 120) * (sh.action.type === 'layup' || sh.action.type === 'dunk' ? 1.1 : 0.7);
        if (Math.random() < want) p.ai.blockPlan = g.t + (sh.action.D - sh.action.t) + gaussian(Math.random, 0, 0.05 + (1 - L.decision) * 0.12);
        else p.ai.blockPlan = -1;
      }
    } else if (p.ai.blockPlan) { if (p.ai.blockPlan < g.t - 0.5) p.ai.blockPlan = 0; if (!holder?.action) p.ai.blockPlan = 0; }
    if (p.ai.blockPlan > 0 && g.t >= p.ai.blockPlan - 0.22 && !p.action) { I.blockPressed = true; p.ai.blockPlan = 0; }
    if (p.paintTime > 1.8 && !onBall) target = { x: target.x - side * -0 , z: Math.sign(target.z || 1) * 3.2 };
    const a = arrive(p, target, 1.0);
    let m = { x: a.x, z: a.z };
    const near = [...g.on].filter((q) => q.team === p.team);
    const sep = separation(p, near, 1.5); m.x += sep.x * 0.3; m.z += sep.z * 0.3;
    // pick dodger: a screener standing in the way slows the defender
    I.mx = m.x; I.mz = m.z; I.sprint = I.sprint || a.d > 4.5 || (press && a.d > 1.6) || (onBall && a.d > 1.2);
    if (onBall) I.latBoost = badge(p, 'clamps', 'lateralSpeed');
    p.face = p.hasBall ? p.face : Math.atan2((holder?.pos.z ?? 0) - p.pos.z, (holder?.pos.x ?? rim.x) - p.pos.x);
    void idx;
    return I;
  }

  /* --- ball in flight (shot) */
  shotInFlightIntent(p, I) {
    const g = this.g, sh = g.ball.shot; const off = sh ? sh.ev.team === p.team : g.poss.team === p.team;
    const rim = { x: hoopX(Math.sign(g.ball.pos.x) || 1), z: 0 };
    if (p.action) return I;
    if (!off) { // box out
      const man = p.guard ?? g.teams[1 - p.team].court[0];
      const t = interpose(man.pos, rim, 0.35); const a = arrive(p, t, 0.6); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 3;
      if (dist2(p.pos, man.pos) < 1.5) man.boxedUntil = g.t + 0.6;
      I.handsUp = true;
    } else {
      const crash = (p.data.attrs.reb + (p.data.pos === 'C' || p.data.pos === 'PF' ? 18 : -10) + (p.ai.slot === 0 ? -40 : 0) + Math.random() * 20) > 95;
      const side = Math.sign(rim.x);
      const t = crash ? { x: rim.x - side * 1.4, z: clamp(p.pos.z, -2.5, 2.5) } : { x: side * (HALF_L - 9), z: p.pos.z };
      const a = arrive(p, t, 0.8); I.mx = a.x; I.mz = a.z; I.sprint = crash && a.d > 2;
    }
    return I;
  }

  /* --- rebounds */
  reboundIntent(p, I) {
    const g = this.g, b = g.ball;
    const land = this.predictLanding();
    const mine = [...g.on].sort((a, c) => dist2(a.pos, land) - dist2(c.pos, land));
    const rank = mine.indexOf(p);
    const chase = rank < 3 || p.data.attrs.reb > 80 && rank < 4;
    if (chase) {
      const a = arrive(p, land, 0.4); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 1; I.handsUp = true;
      if (a.d < 1.6 && b.pos.y > 1.8 && b.pos.y < 4 && !p.action && p.y === 0 && Math.random() < 0.12) { p.action = { kind: 'oopjump', t: 0, dur: 0.6 }; p.vy = 3.2 + p.data.attrs.vertical / 40; }
    } else {
      const side = g.dirOf(g.poss.team);
      const mate = p.team === g.poss.team; const rim = { x: hoopX(Math.sign(land.x) || side), z: 0 };
      const home = mate ? { x: Math.sign(rim.x) * (HALF_L - 10), z: p.pos.z * 0.6 } : interpose(p.guard?.pos ?? rim, rim, 0.3);
      const a = arrive(p, home, 1); I.mx = a.x; I.mz = a.z; I.sprint = a.d > 4;
    }
    return I;
  }
  predictLanding() {
    const b = this.g.ball, p = b.pos, v = b.vel; const target = 1.6;
    // solve y(t) = target on the way down
    const gy = 9.81, a = -0.5 * gy, bb = v.y, c = p.y - target; const disc = bb * bb - 4 * a * c;
    if (disc < 0) return { x: p.x, z: p.z };
    const t = (-bb - Math.sqrt(disc)) / (2 * a); const tt = Math.max(0, t);
    return { x: p.x + v.x * tt * 0.85, z: p.z + v.z * tt * 0.85 };
  }
}
const ARCH_TEND = (key) => ({ sharpshooter: { threeFreq: 0.5, drive: 0.1, pass: 0.1 }, slasher: { threeFreq: 0.1, drive: 0.6, pass: 0.15 }, playmaker: { threeFreq: 0.2, drive: 0.3, pass: 0.5 }, lockdown: { threeFreq: 0.2, drive: 0.15, pass: 0.2 }, rimProtector: { threeFreq: 0, drive: 0.1, pass: 0.2 }, glassCleaner: { threeFreq: 0, drive: 0.1, pass: 0.2 }, postScorer: { threeFreq: 0, drive: 0.15, pass: 0.2 }, twoWayWing: { threeFreq: 0.25, drive: 0.3, pass: 0.25 }, stretchBig: { threeFreq: 0.45, drive: 0.05, pass: 0.15 }, floorGeneral: { threeFreq: 0.25, drive: 0.25, pass: 0.5 } }[key] ?? { threeFreq: 0.2, drive: 0.2, pass: 0.2 });
function zoneSpots(side, ballPos) {
  const rimX = hoopX(side); const shift = clamp((ballPos?.z ?? 0) * 0.35, -2.5, 2.5); const x = (d) => rimX - side * d;
  return [{ x: x(5.4), z: -3.4 + shift }, { x: x(5.4), z: 3.4 + shift }, { x: x(2.2), z: -3.6 + shift * 0.4 }, { x: x(2.0), z: 0 }, { x: x(2.2), z: 3.6 + shift * 0.4 }];
}
const isThreeSafe = (g, p) => isThree(p.pos, g.dirOf(p.team));
void RULES; void COURT; void HALF_W;
