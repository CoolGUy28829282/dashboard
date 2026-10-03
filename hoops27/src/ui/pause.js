// Pause menu (glass overlay): Resume, Substitutions, Play Calls, Strategy Sliders, Stats, Camera, Controls, Settings, Forfeit.
import { h, clear, slider, seg } from './dom.js';
import { settingsPanel, confirmDialog } from './settings.js';
import { boxScoreView } from './boxscore.js';
import { HUD_PLAYS } from './hud.js';
import { PLAYS, DEFENSE_SCHEMES } from '../data/plays.js';
import { CAMERA_PRESETS, CAMERA_LABEL } from '../engine/camera.js';
import { ARCHETYPES } from '../data/generator.js';
import { ACTION_LABEL, DEFAULT_KEYS, padLabels } from '../engine/input.js';

const SCHEME_KEY = { 'Man-to-Man': 'man', 'Switch Everything': 'switch', 'Drop Coverage': 'drop', '2-3 Zone': 'zone', 'Full-Court Press': 'press' };

export class PauseMenu {
  constructor(app, session) {
    this.app = app; this.s = session; this.g = session.game; this.team = session.humanTeam ?? 0; this.ov = h('div', { class: 'overlay' }); this.panel = h('div', { class: 'panel', style: { minWidth: '360px' } }); this.ov.append(this.panel); app.uiRoot.append(this.ov); this.home();
  }
  mount(content, title, back = true) {
    clear(this.panel); this.panel.append(h('div', { class: 'title-row' }, h('h2', {}, title)), content);
    if (back) this.panel.append(h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.home() }, '← Back')));
    this.app.nav.setRoot(this.ov);
  }
  home() {
    const s = this.s, ranked = s.cfg.ranked; const left = ranked ? Math.max(0, 30 - s.pauseUsed).toFixed(0) : null;
    const items = [['Resume', () => this.resume(), true], ['Substitutions', () => this.subs()], ['Play calls', () => this.plays()], ['Strategy sliders', () => this.strategy()], ['Stats', () => this.stats()], ['Camera', () => this.camera()], ['Controls', () => this.controls()], ['Settings', () => this.settings()], ['Forfeit', () => confirmDialog(this.app, 'Forfeit game?', ranked ? 'A forfeit counts as a loss in Ranked.' : 'The game ends and you leave the court.', () => { this.close(); s.forfeit(); }, 'Forfeit'), false, 'danger']];
    clear(this.panel); this.panel.append(h('div', { class: 'title-row' }, h('h2', {}, 'Paused'), h('span', { class: 'crumbs' }, `${this.g.teams[0].data.abbr} ${this.g.score[0]} – ${this.g.score[1]} ${this.g.teams[1].data.abbr}`)),
      ranked ? h('div', { class: 'pill', style: { color: s.pauseUsed > 20 ? 'var(--danger)' : 'var(--amber)', marginBottom: '10px' } }, `Ranked pause budget: ${left}s left — forfeits at 0`) : null,
      h('div', { class: 'menu-list' }, items.map(([label, fn, def, cls]) => h('button', { class: `btn ${def ? 'primary' : ''} ${cls ?? ''}`, dataset: def ? { default: '', back: '' } : {}, onclick: fn }, label))));
    this.app.nav.setRoot(this.ov);
  }
  resume() { this.close(); this.s.resume(); }
  close() { this.ov.remove(); this.app.nav.setRoot(null); }
  subs() {
    const g = this.g, tm = g.teams[this.team]; const wrap = h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '24px' } }); let sel = null;
    const info = h('div', { class: 'muted', style: { fontSize: '12px', margin: '8px 0' } }, g.phase === 'live' ? 'Live play: substitutions are queued for the next dead ball.' : 'Dead ball: substitutions apply immediately.');
    const render = () => {
      clear(wrap);
      const col = (title, list, court) => h('div', { class: 'col', style: { minWidth: '300px' } }, h('div', { class: 'display', style: { fontSize: '12px' } }, title), list.map((p) => h('div', { class: `pcard ${sel === p ? 'sel' : ''}`, style: { '--tc': tm.data.colors.primary, opacity: p.fouledOut ? 0.4 : 1 }, onclick: () => pick(p, court) }, h('div', { class: 'pn' }, p.number), h('div', {}, h('div', { class: 'nm' }, `${p.name} · ${p.data.pos}`), h('div', { class: 'ar' }, `${ARCHETYPES[p.data.archetype].label} · STA ${Math.round(p.stamina)} · PF ${p.fouls}`)), h('div', { class: 'ovr' }, p.data.ovr))));
      wrap.append(col('On court', tm.court, true), col('Bench', tm.bench, false));
    };
    const pick = (p, court) => {
      if (!sel) { sel = p; return render(); }
      const a = tm.court.includes(sel) ? sel : p, b = tm.court.includes(sel) ? p : sel;
      if (tm.court.includes(a) && tm.bench.includes(b)) { if (!this.s.queueSub(this.team, a, b)) this.app.toast('Cannot substitute that player', 'red'); }
      sel = null; render(); void court;
    };
    render(); this.mount(h('div', {}, info, wrap), 'Substitutions');
  }
  plays() {
    const g = this.g, wrap = h('div', { class: 'col' }); const cur = g.teams[this.team].call;
    wrap.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Choose an offensive set. The holographic routes appear on the floor and your team runs the play next possession.'));
    [...HUD_PLAYS, 'Motion', 'Transition'].forEach((n, i) => wrap.append(h('button', { class: `btn ${cur === n ? 'primary' : ''}`, onclick: () => { this.s.callPlay(i < 5 ? i : -1, this.team, n); this.plays(); } }, `${i < 5 ? i + 1 + ' · ' : ''}${n}${cur === n ? '  ✓' : ''}`)));
    wrap.append(h('button', { class: 'btn', onclick: () => { g.teams[this.team].call = null; this.plays(); } }, 'Auto (coach picks)'));
    this.mount(wrap, 'Play calls');
  }
  strategy() {
    const tm = this.g.teams[this.team], st = tm.strategy; const wrap = h('div', { class: 'col' });
    for (const [k, label] of [['pace', 'Pace'], ['threeFreq', 'Three-point frequency'], ['pressure', 'Pressure'], ['help', 'Help intensity']]) wrap.append(h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'row' }, slider(st[k], (v) => { st[k] = v; }, 0, 1, 0.05))));
    wrap.append(h('div', { class: 'field' }, h('label', {}, 'Defensive scheme'), seg(DEFENSE_SCHEMES.map((n) => [SCHEME_KEY[n], n]), tm.scheme, (v) => { tm.scheme = v; })));
    this.mount(wrap, 'Strategy');
  }
  stats() { this.mount(boxScoreView(this.g), 'Stats'); }
  camera() {
    const rig = this.s.view.rig; const wrap = h('div', { class: 'menu-list' });
    CAMERA_PRESETS.forEach((m) => wrap.append(h('button', { class: `btn ${rig.mode === m ? 'primary' : ''}`, onclick: () => { rig.setMode(m); this.app.settings.gameplay.camera = m; this.app.saveSettings(); this.camera(); } }, CAMERA_LABEL[m] + (rig.mode === m ? '  ✓' : ''))));
    this.mount(wrap, 'Camera');
  }
  controls() {
    const keys = { ...DEFAULT_KEYS, ...this.app.settings.controls.keys }; const pad = padLabels(this.app.input.lastPadId);
    const rows = Object.keys(ACTION_LABEL).map((a) => h('tr', {}, h('td', {}, ACTION_LABEL[a]), h('td', {}, h('span', { class: 'kbd' }, (keys[a] ?? '').replace('Key', '').replace('Digit', '')))));
    this.mount(h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '24px' } }, h('table', { class: 'box', style: { minWidth: '320px' } }, h('tbody', {}, rows)), h('div', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.9, maxWidth: '300px' } }, h('div', { class: 'display cy' }, 'Gamepad'), `Move: L-stick · Sprint ${pad[7]} · Shoot/steal ${pad[2]} · Pass ${pad[0]} · Lob/block ${pad[3]} · Step-back ${pad[1]} · Pump ${pad[5]} · Switch/call ${pad[4]} · Post/charge ${pad[6]} · Pause ${pad[9]} · Camera ${pad[8]} · Plays: D-pad`)), 'Controls');
  }
  settings() { this.mount(settingsPanel(this.app, { onChange: () => this.s.applySettings() }), 'Settings'); }
}
void PLAYS;
