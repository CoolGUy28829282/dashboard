// Broadcast-style HUD (DOM): scoreboard, player ring card, kinetic popups, commentary ticker, play-call UI, F3 debug overlay.
import { h, clear, fmtClock, periodName } from './dom.js';
import { BADGES, TIERS } from '../gameplay/badges.js';
import { ARCHETYPES } from '../data/generator.js';
import { PLAYS } from '../data/plays.js';
import { RULES, SHOT } from '../tuning.js';

const GRADE_TEXT = { perfect: 'PERFECT', excellent: 'EXCELLENT', good: 'GOOD', early: 'EARLY', late: 'LATE', wayoff: 'WAY OFF' };
export const HUD_PLAYS = ['Pick-and-Roll', 'Pick-and-Pop', 'Isolation', 'Post Split', 'Horns'];

export class Hud {
  constructor(root, ctx) {
    this.ctx = ctx; const { game, bus } = ctx; this.g = game; this.root = root; this.fpsAcc = 0; this.fpsN = 0; this.fps = 0; this.dbgT = 0; this.sbT = 0; this.offs = []; this.tickerT = 0;
    this.el = h('div', { id: 'hud' });
    const T = game.teams.map((t) => t.data);
    this.sb = h('div', { id: 'sb' },
      h('div', { class: 'team' }, h('div', { class: 'abbr', style: { color: T[0].colors.primary } }, T[0].abbr), h('div', { class: 'score', id: 'sc0', style: { color: T[0].colors.primary } }, '0'), h('div', { class: 'sub', id: 'sub0' })),
      h('div', { class: 'mid' }, h('div', { class: 'per', id: 'per' }, 'Q1'), h('div', { class: 'clock', id: 'clk' }, '5:00'), h('div', { class: 'sub', id: 'subm' })),
      h('div', { class: 'sc', id: 'shc' }, '24'),
      h('div', { class: 'team right' }, h('div', { class: 'abbr', style: { color: T[1].colors.primary } }, T[1].abbr), h('div', { class: 'score', id: 'sc1', style: { color: T[1].colors.primary } }, '0'), h('div', { class: 'sub', id: 'sub1' })));
    this.clutchEl = h('div', { id: 'clutch' }); this.pcard = h('div', { id: 'pcard', class: 'panel cyan' }); this.ticker = h('div', { id: 'ticker' }); this.popups = h('div', { id: 'popups' }); this.toasts = h('div', { id: 'toast' });
    this.debug = h('div', { id: 'debug' }); this.fpsEl = h('div', { id: 'fps' }); this.replayTag = h('div', { id: 'replayTag', class: 'panel mag hide', style: { padding: '6px 18px' } }, h('span', { class: 'display mg' }, '● Replay'), h('span', { class: 'muted', style: { marginLeft: '12px', fontSize: '11px' } }, 'Space skip · O slow-mo speed · drag to orbit'));
    this.routeUi = h('div', { class: 'route-ui' }); this.buildPlayUi();
    this.el.append(this.clutchEl, this.sb, this.pcard, this.ticker, this.popups, this.toasts, this.debug, this.fpsEl, this.replayTag, this.routeUi); root.append(this.el);
    this.wire(bus); this.lastCard = ''; this.shown = { sc: [-1, -1] };
  }
  buildPlayUi() {
    clear(this.routeUi); if (!this.ctx.settings.gameplay.playCallUI || !this.g.humans.length) return;
    const t = this.g.humans[0].team;
    HUD_PLAYS.forEach((n, i) => this.routeUi.append(h('button', { class: 'btn sm', dataset: { play: i }, style: { pointerEvents: 'auto' }, onclick: () => this.ctx.callPlay(i, t) }, `${i + 1} · ${n}`)));
    this.routeUi.append(h('button', { class: 'btn sm', style: { pointerEvents: 'auto' }, onclick: () => this.ctx.requestTimeout() }, 'Timeout'));
  }
  wire(bus) {
    const on = (e, f) => this.offs.push(bus.on(e, f));
    on('popup', ({ text }) => this.popup(text, `pop-${text.replace(/[^A-Z]/g, '')}`));
    on('shotGrade', ({ grade, offsetMs, contest, windowMs }) => {
      const dir = grade === 'early' ? '◀ EARLY' : grade === 'late' ? 'LATE ▶' : GRADE_TEXT[grade];
      this.popup(dir, `grade-${GRADE_TEXT[grade].replace(' ', '')}`, `${offsetMs > 0 ? '+' : ''}${Math.round(offsetMs)} ms · window ${Math.round(windowMs)} ms · contest ${Math.round(contest * 100)}%`);
    });
    on('foul', ({ info, by }) => { if (info?.andOne) this.popup('AND-ONE', 'pop-ANDONE'); this.ctx.audio?.whistle(); void by; });
    on('timeout', ({ team }) => this.toast(`${this.g.teams[team].data.city} timeout`, 'amb'));
    on('sub', ({ in: p, out }) => this.toast(`Sub: ${p.name} for ${out.name}`, 'cyan'));
    on('quarterStart', ({ quarter, ot }) => this.toast(ot ? 'Overtime' : `${periodName(quarter)} begins`, 'mag'));
    on('heatingUp', ({ player, tier }) => this.toast(`${player.name} ${tier >= 3 ? 'is ON FIRE' : 'is heating up'}`, 'amb'));
    on('shotRelease', ({ ev, player }) => this.badgeToasts(ev, player));
    on('violation', ({ kind }) => this.toast(`Violation: ${kind}`, 'red'));
  }
  badgeToasts(ev, p) {
    if (!ev.human) return; const out = [];
    const t = (k) => p.tiers[k]; const tier = (k) => TIERS[t(k)];
    if ((p.perfectChain ?? 0) > 1 && t('greenMachine') !== undefined) out.push(`Green Machine · ${tier('greenMachine')}`);
    if (ev.assist === undefined && ev.mods && ev.mods.situation > 1 && t('catchShoot') !== undefined) out.push(`Catch & Shoot · ${tier('catchShoot')}`);
    if (ev.contest > 0.3 && (ev.type === 'three' || ev.type === 'midrange') && t('deadeye') !== undefined) out.push(`Deadeye · ${tier('deadeye')}`);
    if (ev.type === 'dunk' && t('posterizer') !== undefined) out.push(`Posterizer · ${tier('posterizer')}`);
    out.slice(0, 2).forEach((s) => this.toast(`BADGE ACTIVE — ${s}`, 'lime'));
  }
  popup(text, cls = '', sub = '') {
    const el = h('div', { class: `popup ${cls}` }, [...text].map((c, i) => h('span', { class: 'ch', style: { animationDelay: `${i * 22}ms` } }, c === ' ' ? ' ' : c)), sub ? h('small', {}, sub) : null);
    this.popups.append(el); setTimeout(() => el.remove(), 1150); if (this.popups.children.length > 3) this.popups.firstChild.remove(); this.ctx.audio?.popup();
  }
  toast(text, cls = 'cyan') { const t = h('div', { class: `panel toast ${cls}`, style: { padding: '7px 14px', fontSize: '12px' } }, text); this.toasts.append(t); setTimeout(() => t.remove(), 3000); if (this.toasts.children.length > 4) this.toasts.firstChild.remove(); }
  say(text) { this.ticker.textContent = text; this.ticker.classList.add('on'); this.tickerT = 3.4; this.ctx.audio?.speak(text); }
  setReplay(on) { this.replayTag.classList.toggle('hide', !on); this.sb.style.opacity = on ? 0.55 : 1; }
  update(dt, ctrl, fps) {
    const g = this.g;
    this.tickerT -= dt; if (this.tickerT < 0) this.ticker.classList.remove('on');
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.fpsEl.textContent = this.ctx.settings.video.showFps ? `${this.fps.toFixed(0)} FPS` : '';
    this.sbT -= dt; if (this.sbT <= 0) { this.sbT = 0.08; this.drawScore(); this.drawCard(ctrl); }
    this.clutchEl.classList.toggle('on', !!g.isClutch?.() && g.phase !== 'end');
    this.dbgT -= dt; if (this.debug.classList.contains('on') && this.dbgT <= 0) { this.dbgT = 0.1; this.drawDebug(ctrl, fps ?? this.fps); }
  }
  pips(n, max) { const f = document.createDocumentFragment(); for (let i = 0; i < max; i++) f.append(h('i', { class: `pip ${i < n ? '' : 'off'}` })); return f; }
  drawScore() {
    const g = this.g, $ = (id) => this.sb.querySelector('#' + id);
    for (const i of [0, 1]) { const s = $('sc' + i); if (this.shown.sc[i] !== g.score[i]) { s.textContent = g.score[i]; if (this.shown.sc[i] >= 0) { s.animate([{ transform: 'scale(1.5)', filter: 'brightness(2)' }, { transform: 'none', filter: 'none' }], { duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' }); } this.shown.sc[i] = g.score[i]; } }
    const c = g.clock; $('clk').textContent = fmtClock(c); $('clk').classList.toggle('low', c < 30 && g.quarter >= 4); $('per').textContent = periodName(g.quarter);
    const sc = Math.ceil(g.poss.shotClock); const shc = $('shc'); shc.textContent = g.poss.shotClock > 0 ? String(sc) : '0'; shc.classList.toggle('low', g.poss.shotClock <= 5 && g.clockOn);
    for (const i of [0, 1]) { const el = $('sub' + i); clear(el); const t = g.teams[i]; el.append(h('span', {}, 'TO'), this.pips(t.timeouts, RULES.timeouts > 5 ? 7 : RULES.timeouts)); el.append(h('span', {}, `F ${t.fouls}`)); if (t.bonus) el.append(h('span', { class: 'bonus' }, 'BONUS')); }
    $('subm').textContent = g.phase === 'ft' && g.ft ? `FT ${g.ft.total - g.ft.left + (g.ft.resolved ? 0 : 1)}/${g.ft.total}` : g.phase === 'inbound' ? `INBOUND ${Math.max(0, g.poss.inbound).toFixed(0)}` : g.isClutch?.() ? 'CLUTCH' : g.poss.team === 0 ? `◀ ${g.teams[0].data.abbr}` : `${g.teams[1].data.abbr} ▶`;
  }
  drawCard(p) {
    const el = this.pcard; if (!p) return;
    const A = ARCHETYPES[p.data.archetype]; const key = `${p.id}|${Math.round(p.stamina / 2)}|${p.run}|${p.fouls}|${Math.round(p.momentum * 10)}`; if (key === this.lastCard) return; this.lastCard = key;
    clear(el); const hot = p.run >= 4 ? 'ON FIRE' : p.run >= 2 ? 'HEATING UP' : p.run <= -3 ? 'COLD' : '';
    el.append(h('div', { class: 'row' }, h('span', { class: 'num', style: { fontSize: '26px', color: this.g.teams[p.team].data.colors.primary } }, '#' + p.number), h('div', {}, h('div', { class: 'nm' }, p.name), h('div', { class: 'ar' }, `${A.label} · ${p.data.pos} · OVR ${p.data.ovr}`)), h('div', { class: 'spacer' }), hot ? h('span', { class: `pill ${p.run >= 4 ? 'am' : ''}`, style: { color: p.run <= -3 ? 'var(--cyan)' : 'var(--amber)' } }, hot) : null),
      h('div', { class: 'row', style: { marginTop: '10px', gap: '10px' } }, h('span', { class: 'muted', style: { fontSize: '10px', letterSpacing: '.12em' } }, 'STAMINA'), h('div', { class: 'bar grow' }, h('i', { style: { width: `${p.stamina}%`, background: p.stamina < 30 ? 'var(--danger)' : '' } })), h('span', { class: 'num', style: { fontSize: '12px' } }, Math.round(p.stamina))),
      h('div', { class: 'row', style: { marginTop: '6px', gap: '10px' } }, h('span', { class: 'muted', style: { fontSize: '10px', letterSpacing: '.12em' } }, 'MOMENTUM'), h('div', { class: 'bar grow' }, h('i', { style: { width: `${p.momentum * 100}%`, background: 'linear-gradient(90deg,var(--magenta),var(--amber))' } })), h('span', { class: 'muted', style: { fontSize: '11px' } }, `PF ${p.fouls}`)));
  }
  drawDebug(p, fps) {
    const g = this.g, b = g.ball, s = g.lastShotInfo; const f = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : n);
    const lines = [`FPS ${f(fps, 0)}  phase ${g.phase}  t ${f(g.t, 1)}  q${g.quarter} ${f(g.clock, 1)}  poss ${g.poss.team}  SC ${f(g.poss.shotClock, 1)}`,
      `BALL ${b.state}  pos ${f(b.pos.x)},${f(b.pos.y)},${f(b.pos.z)}  vel ${f(b.vel.x)},${f(b.vel.y)},${f(b.vel.z)}  holder ${b.holder?.name ?? '-'}`, '--- live shot math ---'];
    const m = p?.shotMeter, a = p?.action;
    if (m && a) lines.push(`LIVE ${a.variant}: meter ${f((m.t / m.D) * 100, 0)}%  window ${f(m.windowMs, 0)} ms  contest ${f(m.contest ?? 0)}  rating ${a.rating}`);
    if (s) {
      lines.push(`LAST ${s.shooterName} ${s.variant}  dist ${f(s.distance, 1)} m  contest ${f(s.contest)}  offset ${f(s.offsetMs, 0)} ms  grade ${s.grade}  window ${f(s.windowMs, 0)} ms`, `  make% ${f(s.makePct * 100, 1)}  made ${s.made}  mods: ` + Object.entries(s.mods ?? {}).map(([k, v]) => `${k} ${f(v, 3)}`).join(' | '));
    }
    lines.push('--- FSM / AI utility ---');
    for (const q of g.on) lines.push(`${q.team}:${q.name.slice(0, 12).padEnd(12)} ${String(q.state).padEnd(6)} ${String(q.ai.fsm ?? '-').padEnd(10)} stam ${f(q.stamina, 0).padStart(3)}  ${q.ai.utility && q.hasBall ? JSON.stringify(q.ai.utility) : ''}`);
    this.debug.textContent = lines.join('\n');
  }
  toggleDebug() { this.debug.classList.toggle('on'); }
  highlightPlay(i) { this.routeUi.querySelectorAll('[data-play]').forEach((b) => b.classList.toggle('primary', +b.dataset.play === i)); }
  dispose() { this.offs.forEach((f) => f()); this.el.remove(); }
}
void BADGES; void PLAYS; void SHOT;
