// All menu screens: main carousel, Play Now flow, Ranked flow, settings, loading and post-game.
import { h, clear, $, seg, toggle, toast } from './dom.js';
import { settingsPanel, confirmDialog } from './settings.js';
import { boxScoreView, gameScore } from './boxscore.js';
import { ARCHETYPES, ATTRS, ATTR_LABEL, ARENAS, POSITIONS } from '../data/generator.js';
import { BADGES, TIERS } from '../gameplay/badges.js';
import { CAMERA_PRESETS, CAMERA_LABEL } from '../engine/camera.js';
import { TIPS } from '../data/defaults.js';
import { RANKED, AI } from '../tuning.js';
import { rankFromMmr, divisionProgress, rankLabel } from '../gameplay/elo.js';
import * as R from '../modes/ranked.js';
import { PLAY_BY_NAME } from '../data/plays.js';

const DIFFS = [['rookie', 'Rookie'], ['pro', 'Pro'], ['allstar', 'All-Star'], ['superstar', 'Superstar'], ['hof', 'Hall of Fame']];
const rankClass = (p) => `t-${R.rankOf(p).tier}`;

export class Screens {
  constructor(app) { this.app = app; this.flow = {}; }
  get root() { return this.app.uiRoot; }
  show(el, { nav = true, scrim = true, grid = true, chip = true } = {}) {
    this.cleanup?.(); this.cleanup = null;
    this.root.querySelectorAll('.screen, .overlay').forEach((n) => n.remove());
    el.classList.add('screen'); if (scrim) el.classList.add('scrim'); if (grid) el.prepend(h('div', { class: 'grid-bg' })); if (chip) el.append(this.profileChip());
    this.root.append(el);
    this.app.nav.enabled = nav; this.app.nav.setRoot(nav ? el : null); this.current = el; return el;
  }
  title(text, crumb, back) { return h('div', { class: 'title-row' }, back ? h('button', { class: 'btn sm', dataset: { back: '' }, onclick: back }, '← Back') : null, h('h2', {}, text), h('span', { class: 'crumbs' }, crumb ?? '')); }
  profileChip() {
    const p = this.app.profile;
    return h('div', { class: 'profile-chip' }, h('span', { class: 'avatar-s' }, p.name[0].toUpperCase()), h('span', { class: 'nm' }, p.name), h('span', { class: `rank-badge ${rankClass(p)}` }, R.rankText(p)), h('span', { class: 'muted' }, `LVL ${p.level} · ${R.winPct(p)}% W`));
  }
  profileCard() {
    const p = this.app.profile, rk = R.rankOf(p);
    return h('div', { class: 'profile-card panel cyan' }, h('div', { class: 'avatar' }, p.name[0].toUpperCase()), h('div', {}, h('div', { class: 'display', style: { fontSize: '14px' } }, p.name), h('div', { class: 'row', style: { gap: '8px', marginTop: '4px' } }, h('span', { class: 'muted', style: { fontSize: '11px' } }, `LVL ${p.level}`), h('span', { class: `rank-badge ${rankClass(p)}` }, R.placementDone(p) ? R.rankText(p) : rk.tier === 'Unranked' ? `Placement ${p.games}/${RANKED.placementGames}` : rk.tier)),
      h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' } }, `Win rate ${R.winPct(p)}% · ${p.wins}W–${p.losses}L`)));
  }
  /* -------------------------------------------------------------- main menu: 3D rotating holographic carousel */
  main() {
    const app = this.app; const tiles = [
      { id: 'play', name: 'Play now', glyph: '🏀', desc: 'Exhibition: CPU, local versus, or spectate.', go: () => this.modeSelect() },
      { id: 'ranked', name: 'Ranked', glyph: '⚡', desc: 'Placements, MMR, tiers and a 30-day season.', go: () => this.rankedHub() },
      { id: 'settings', name: 'Settings', glyph: '⚙', desc: 'Audio, controls, video, accessibility.', go: () => this.settingsScreen() },
      { id: 'quit', name: 'Quit', glyph: '⏻', desc: 'Leave the arena.', go: () => this.quit() },
      { id: 'career', name: 'MyCareer', glyph: '★', locked: true }, { id: 'team', name: 'MyTEAM', glyph: '◈', locked: true }, { id: 'fran', name: 'Franchise', glyph: '▣', locked: true }, { id: 'play2', name: 'Playgrounds', glyph: '◉', locked: true },
    ];
    let idx = 0; const N = tiles.length, step = 360 / N, radius = 440;
    const car = h('div', { class: 'carousel' }); const wrap = h('div', { class: 'carousel-wrap' }, car);
    const els = tiles.map((t, i) => { const el = h('div', { class: `tile ${t.locked ? 'locked' : ''}`, onclick: () => { if (i === idx && !t.locked) { app.audio.ui('ok'); t.go(); } else { idx = i; place(); app.audio.ui('tick'); } } }, h('div', { class: 'face' }, h('div', { class: 'glyph', style: { color: i % 2 ? 'var(--magenta)' : 'var(--cyan)' } }, t.glyph), h('div', { class: 'tname' }, t.name.toUpperCase()), t.desc ? h('div', { class: 'tdesc' }, t.desc) : h('div', { class: 'tdesc' }, 'Coming in a future update.'), t.locked ? h('div', { class: 'soon' }, 'COMING SOON') : null)); el.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`; car.append(el); return el; });
    const place = () => { car.style.transform = `translateZ(-${radius}px) rotateY(${-idx * step}deg)`; els.forEach((e, i) => { e.classList.toggle('active', i === idx); const d = Math.min((i - idx + N) % N, (idx - i + N) % N); e.style.opacity = d > 2 ? 0.35 : 1; }); };
    place();
    const el = h('div', { style: { position: 'absolute', inset: 0 } }, h('div', { id: 'brand' }, h('div', { class: 'logo' }, 'HOOPS ', h('span', {}, '27')), h('div', { class: 'sub' }, 'NEON ERA')), this.profileCard(), wrap,
      h('div', { class: 'menu-hint' }, h('span', { class: 'kbd' }, '← →'), ' rotate  ', h('span', { class: 'kbd' }, 'Enter'), ' select  ·  controller: stick + A'));
    this.show(el, { nav: false, scrim: false, grid: false, chip: false });
    const handler = (kind, v, e) => {
      if (this.current !== el) return;
      const dir = kind === 'key' ? ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[v] ?? (v === 'Enter' ? 'ok' : null)) : v;
      if (dir === 'left') { idx = (idx - 1 + N) % N; place(); app.audio.ui('tick'); } else if (dir === 'right') { idx = (idx + 1) % N; place(); app.audio.ui('tick'); } else if (dir === 'ok') { const t = tiles[idx]; if (t.locked) { app.audio.ui('err'); toast(this.root, `${t.name} — coming soon`, 'amb'); } else { app.audio.ui('ok'); t.go(); } }
      if (e && ['ArrowLeft', 'ArrowRight', 'Enter'].includes(v)) e.preventDefault();
    };
    const mm = (e) => { const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5; wrap.style.transform = `rotateX(${-y * 6}deg) rotateY(${x * 8}deg)`; app.backdrop?.setParallax(x, y); };
    app.input.menuHandlers.add(handler); window.addEventListener('mousemove', mm);
    this.cleanup = () => { app.input.menuHandlers.delete(handler); window.removeEventListener('mousemove', mm); };
  }
  quit() { confirmDialog(this.app, 'Quit HOOPS 27?', 'Your progress is saved automatically.', () => { this.show(h('div', { class: 'col', style: { alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' } }, h('div', { class: 'display', style: { fontSize: '34px' } }, 'See you in the Neon Era'), h('button', { class: 'btn primary', onclick: () => this.main() }, 'Back to menu')), { nav: true }); try { window.close(); } catch { /* browsers may block */ } }, 'Quit'); }
  settingsScreen() { const app = this.app; this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Settings', 'Preferences saved locally', () => this.main()), h('div', { class: 'panel grow', style: { overflow: 'auto' } }, settingsPanel(app, {})), h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.main() }, '← Back')))); }

  /* -------------------------------------------------------------- PLAY NOW */
  modeSelect() {
    const m = (id, name, desc, glyph) => h('div', { class: 'card focusable', style: { padding: '26px', minHeight: '190px' }, onclick: () => { this.flow = { mode: id, picks: [], humans: id === 'cpu' ? [] : id === 'pvc' ? [{ team: 0, device: 'auto' }] : [{ team: 0, device: this.app.input.pads.length ? 'pad0' : 'kb1' }, { team: 1, device: this.app.input.pads.length > 1 ? 'pad1' : 'kb2' }] }; this.teamSelect(0); } },
      h('div', { style: { fontSize: '44px' } }, glyph), h('div', { class: 'display', style: { fontSize: '18px', margin: '10px 0 6px' } }, name), h('div', { class: 'muted', style: { fontSize: '13px', lineHeight: 1.5 } }, desc));
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Play now', 'Mode select', () => this.main()),
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '18px', marginTop: '10px' } }, m('pvc', 'Player vs CPU', 'You control the active player on your team. Pick a difficulty from Rookie to Hall of Fame.', '🎮'), m('pvp', 'Player vs player', 'Local versus on two controllers or a split keyboard (WASD + IJKL cluster).', '🕹'), m('cpu', 'CPU vs CPU', 'Spectate with the free camera cycle (Tab) and dynamic broadcast cuts.', '👁')),
      h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.main() }, '← Back'))));
  }
  teamCard(t, cb, sel) {
    return h('div', { class: `card ${sel ? 'sel' : ''}`, style: { '--tc': t.colors.primary, '--tcg': t.colors.primary + '66' }, onclick: () => cb(t) }, h('div', { class: 'logo', html: t.logoSvg }), h('div', { class: 'tn' }, `${t.city} ${t.name}`), h('div', { class: 'ts' }, t.style), h('div', { class: 'ts' }, 'Arena: ' + ARENAS.find((a) => a.id === t.arenaId).name),
      h('div', { class: 'rating-row' }, ...[['OVR', t.ratings.ovr], ['OFF', t.ratings.off], ['DEF', t.ratings.def], ['ATH', t.ratings.ath]].map(([k, v]) => h('div', {}, h('b', {}, v), h('small', {}, k)))));
  }
  teamSelect(step) {
    const f = this.flow, L = this.app.league; const who = f.mode === 'pvc' ? ['Your team', 'Opponent'] : f.mode === 'pvp' ? ['Player 1 team', 'Player 2 team'] : ['Home team', 'Away team'];
    const g = h('div', { class: 'grid teams scroll grow', style: { paddingBottom: '10px' } });
    L.teams.forEach((t, i) => g.append(this.teamCard(t, () => { if (step === 1 && f.picks[0] === i) { toast(this.root, 'Pick a different team', 'amb'); return; } f.picks[step] = i; this.app.audio.ui('ok'); step === 0 ? this.teamSelect(1) : this.rules(); }, f.picks[step] === i)));
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title(who[step], step === 0 ? 'Step 1 of 2' : `Step 2 of 2 · vs ${L.teams[f.picks[0]].city}`, () => (step === 0 ? this.modeSelect() : this.teamSelect(0))), g, h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => (step === 0 ? this.modeSelect() : this.teamSelect(0)) }, '← Back'), step === 1 ? h('button', { class: 'btn', onclick: () => { f.picks[1] = this.randomOther(f.picks[0]); this.rules(); } }, 'Random opponent') : null)));
  }
  randomOther(i) { let j; do { j = Math.floor(Math.random() * this.app.league.teams.length); } while (j === i); return j; }
  rules() {
    const f = this.flow; const S = this.app.settings; f.rules = f.rules ?? { difficulty: 'allstar', quarterMinutes: 5, fouls: true, fatigue: true, injuries: false, arenaId: this.app.league.teams[f.picks[0]].arenaId };
    const r = f.rules; const body = h('div', { class: 'panel grow scroll' });
    const fld = (l, c, hint) => h('div', { class: 'field' }, h('label', {}, l), h('div', { class: 'row' }, c, hint ? h('span', { class: 'dim', style: { fontSize: '11px' } }, hint) : null));
    const arenas = h('div', { class: 'row', style: { gap: '12px' } }); const drawArenas = () => { clear(arenas); ARENAS.forEach((a) => arenas.append(h('div', { class: `card focusable ${r.arenaId === a.id ? 'sel' : ''}`, style: { '--tc': a.accent, minWidth: '170px' }, onclick: () => { r.arenaId = a.id; drawArenas(); this.app.audio.ui('tick'); } }, h('div', { class: 'tn', style: { color: a.accent } }, a.name), h('div', { class: 'ts' }, `Accent ${a.accent} / ${a.accent2}`)))); }; drawArenas();
    body.append(fld('Difficulty', seg(DIFFS, r.difficulty, (v) => { r.difficulty = v; }), f.mode === 'cpu' ? 'AI vs AI' : 'Hall of Fame: 120 ms reaction; perfect release is no longer a forced make'),
      fld('Quarter length', seg([[3, '3 min'], [5, '5 min'], [6, '6 min'], [8, '8 min'], [12, '12 min']], r.quarterMinutes, (v) => { r.quarterMinutes = v; })), fld('Fouls', toggle(r.fouls, (v) => { r.fouls = v; })), fld('Fatigue', toggle(r.fatigue, (v) => { r.fatigue = v; })),
      fld('Injuries', h('span', { class: 'pill' }, 'Off by default · not in this build'), ''),
      fld('Shot meter', seg([['standard', 'Standard'], ['minimal', 'Minimal'], ['off', 'Off']], S.gameplay.shotMeter, (v) => { S.gameplay.shotMeter = v; this.app.saveSettings(); })), fld('Camera', h('select', { onchange: (e) => { S.gameplay.camera = e.target.value; this.app.saveSettings(); } }, CAMERA_PRESETS.map((c) => h('option', { value: c, selected: S.gameplay.camera === c }, CAMERA_LABEL[c])))),
      fld('Shot input', seg([['button', 'Button'], ['stick', 'Shot stick']], S.gameplay.shotInput, (v) => { S.gameplay.shotInput = v; this.app.saveSettings(); })), fld('Arena', arenas));
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Arena & rules', `${this.app.league.teams[f.picks[0]].abbr} vs ${this.app.league.teams[f.picks[1]].abbr}`, () => this.teamSelect(1)), body, h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.teamSelect(1) }, '← Back'), h('div', { class: 'spacer' }), h('button', { class: 'btn primary', dataset: { default: '' }, onclick: () => this.lineup(0) }, 'Review lineup →'))));
  }
  /* lineup & play style review (starters swap + archetype card) */
  lineup(side, ranked) {
    const f = this.flow, L = this.app.league; const humanTeams = f.humans.length ? f.humans.map((x) => x.team) : [0]; const ti = humanTeams[Math.min(side, humanTeams.length - 1)] ?? 0; const team = L.teams[f.picks[ti]];
    f.lineups = f.lineups ?? [null, null]; const order = (f.lineups[ti] ??= team.roster.map((p) => p.id)); let sel = null, detail = team.roster.find((p) => p.id === order[0]);
    const list = h('div', { class: 'col scroll', style: { minWidth: '380px' } }); const side2 = h('div', { class: 'panel grow scroll' });
    const renderDetail = () => { clear(side2); const p = detail, A = ARCHETYPES[p.archetype];
      side2.append(h('div', { class: 'row' }, h('span', { class: 'num', style: { fontSize: '34px', color: team.colors.primary } }, '#' + p.number), h('div', {}, h('div', { class: 'display', style: { fontSize: '18px' } }, p.name), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${p.pos} · ${(p.heightM * 3.28084 | 0)}'${Math.round(((p.heightM * 3.28084) % 1) * 12)}" (${p.heightM.toFixed(2)} m) · ${p.weightKg} kg · wingspan ${p.wingspanM.toFixed(2)} m`)), h('div', { class: 'spacer' }), h('div', { class: 'ovr', style: { fontSize: '34px' } }, p.ovr)),
        h('div', { class: 'panel flat', style: { margin: '12px 0', '--c': '10px' } }, h('div', { class: 'display cy', style: { fontSize: '13px' } }, A.label), h('div', { style: { fontSize: '12px', lineHeight: 1.6, marginTop: '6px' } }, h('div', {}, h('b', { class: 'li' }, 'Strength: '), A.strength), h('div', {}, h('b', { class: 'dg' }, 'Weakness: '), A.weakness), h('div', {}, h('b', { class: 'am' }, 'Recommended plays: '), A.plays.join(', ')))),
        h('div', { class: 'display', style: { fontSize: '11px', margin: '6px 0' } }, 'Badges'), h('div', {}, p.badges.length ? p.badges.map((b) => h('span', { class: `badge-chip bt${b.tier}`, title: BADGES[b.key].effect }, `${BADGES[b.key].name} · ${TIERS[b.tier]}`)) : h('span', { class: 'muted' }, 'None')),
        h('div', { class: 'display', style: { fontSize: '11px', margin: '12px 0 6px' } }, `Ratings — shooting form: ${p.form.name}`), h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '4px 18px' } }, ATTRS.map((k) => h('div', { class: 'attr' }, h('span', {}, ATTR_LABEL[k]), h('div', { class: 'bar' }, h('i', { style: { width: `${p.attrs[k]}%`, background: p.attrs[k] >= 85 ? 'linear-gradient(90deg,var(--lime),var(--cyan))' : '' } })), h('b', {}, p.attrs[k])))));
    };
    const renderList = () => { clear(list); order.forEach((id, i) => { const p = team.roster.find((x) => x.id === id); if (i === 0) list.append(h('div', { class: 'display', style: { fontSize: '11px' } }, 'Starters')); if (i === 5) list.append(h('div', { class: 'display', style: { fontSize: '11px', marginTop: '8px' } }, 'Bench'));
      list.append(h('div', { class: `pcard ${sel === i ? 'sel' : ''}`, style: { '--tc': team.colors.primary }, onclick: () => { detail = p; if (sel === null) sel = i; else { [order[sel], order[i]] = [order[i], order[sel]]; sel = null; this.app.audio.ui('ok'); } renderList(); renderDetail(); } }, h('div', { class: 'pn' }, p.number), h('div', {}, h('div', { class: 'nm' }, `${p.name} · ${p.pos}`), h('div', { class: 'ar' }, ARCHETYPES[p.archetype].label)), h('div', { class: 'ovr' }, p.ovr))); }); };
    renderList(); renderDetail();
    const nextSide = side + 1 < humanTeams.length; const go = () => (nextSide ? this.lineup(side + 1, ranked) : ranked ? this.rankedStart() : this.loading());
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Lineup & play style', `${team.city} ${team.name} · ${team.style}${humanTeams.length > 1 ? ` · Player ${side + 1}` : ''}`, () => (ranked ? this.rankedHub() : this.rules())), h('div', { class: 'row grow', style: { alignItems: 'stretch', minHeight: 0 } }, list, side2), h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => (ranked ? this.rankedHub() : this.rules()) }, '← Back'), h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Click one player, then another, to swap. Top five start.'), h('div', { class: 'spacer' }), h('button', { class: 'btn primary', dataset: { default: '' }, onclick: go }, nextSide ? 'Next player →' : ranked ? 'Find match →' : 'Start game →'))));
  }
  /* loading with tip cards */
  loading(ranked) {
    const f = this.flow, L = this.app.league; const A = L.teams[f.picks[0]], B = L.teams[f.picks[1]]; const bar = h('i', {}); let tipI = Math.floor(Math.random() * TIPS.length); const tip = h('div', { class: 'tip-card panel flat' }, h('div', { class: 'display cy', style: { fontSize: '11px', marginBottom: '6px' } }, 'Tip'), h('div', { id: 'tiptext' }, TIPS[tipI]));
    const el = h('div', { class: 'loading col', style: { height: '100%', justifyContent: 'center', alignItems: 'center' } }, h('div', { class: 'vs-row' }, h('div', { class: 'logo', html: A.logoSvg, style: { color: A.colors.primary } }), h('div', { class: 'vs' }, 'VS'), h('div', { class: 'logo', html: B.logoSvg, style: { color: B.colors.primary } })), h('div', { class: 'display', style: { fontSize: '20px' } }, `${A.city} ${A.name}  ·  ${B.city} ${B.name}`), tip, h('div', { class: 'load-bar' }, bar), h('div', { class: 'muted', style: { fontSize: '11px', letterSpacing: '.2em' } }, 'LOADING ARENA'));
    this.show(el, { nav: false });
    const t0 = performance.now(); const timer = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / 3200); bar.style.width = `${k * 100}%`; if (Math.floor(k * 3) !== Math.floor(((performance.now() - t0 - 200) / 3200) * 3)) { tipI = (tipI + 1) % TIPS.length; $('#tiptext', el).textContent = TIPS[tipI]; } if (k >= 1) { clearInterval(timer); this.launch(ranked); } }, 100);
    this.cancelLoad = () => clearInterval(timer);
  }
  launch(ranked) {
    const f = this.flow; const cfg = { teams: f.picks.slice(0, 2), humans: f.humans, rules: ranked ? { difficulty: AI_FOR(f.opp), quarterMinutes: 5, fouls: true, fatigue: true, injuries: false, arenaId: f.rules?.arenaId ?? this.app.league.teams[f.picks[0]].arenaId } : f.rules, lineups: f.lineups, mode: f.mode, ranked: ranked ? { opp: f.opp } : null };
    this.app.startGame(cfg);
  }
  /* -------------------------------------------------------------- post-game */
  postgame(session, res) {
    const app = this.app, g = res.game, f = res.cfg; const ranked = !!f.ranked; const userWon = res.humans ? res.winner === res.humanTeam : res.winner === 0;
    const stage = h('div', { class: 'col', style: { height: '100%' } }); const t = g.teams.map((x) => x.data);
    const head = h('div', { class: 'row', style: { justifyContent: 'center', gap: '40px', margin: '8px 0 14px' } }, h('div', { style: { textAlign: 'right' } }, h('div', { class: 'display', style: { color: t[0].colors.primary } }, `${t[0].city} ${t[0].name}`), h('div', { class: `big-score ${res.winner === 0 ? 'lime-t' : ''}` }, res.score[0])), h('div', { class: 'vs' }, res.forfeited !== undefined ? 'FF' : 'FINAL'), h('div', {}, h('div', { class: 'display', style: { color: t[1].colors.primary } }, `${t[1].city} ${t[1].name}`), h('div', { class: `big-score ${res.winner === 1 ? 'lime-t' : ''}` }, res.score[1])));
    const mvpLine = h('div', { class: 'row', style: { justifyContent: 'center', gap: '18px' } }, h('span', { class: 'pill', style: { color: 'var(--lime)' } }, `MVP · ${res.mvp.name}`), res.humans ? h('span', { class: 'display', style: { color: userWon ? 'var(--lime)' : 'var(--danger)' } }, userWon ? 'VICTORY' : 'DEFEAT') : null);
    const panelFor = h('div', { class: 'panel grow scroll' }, boxScoreView(g, { mvp: res.mvp.id }));
    const acts = h('div', { class: 'footer-bar', style: { justifyContent: 'center' } });
    const done = (ranked) => { session.dispose(); app.endSession(); ranked ? this.rankedHub() : this.main(); };
    acts.append(h('button', { class: 'btn', onclick: () => { if (!res.highlights.length) return toast(this.root, 'No highlights recorded', 'amb'); const hide = this.current; hide.style.display = 'none'; session.playReel(() => { hide.style.display = ''; }); } }, `Top plays reel (${res.highlights.length})`));
    let ranking = null;
    if (ranked) {
      const profile = app.profile; const opp = f.ranked.opp; const forfeit = res.forfeited !== undefined; const won = userWon && !forfeit;
      const r = R.applyResult(profile, { won, opp, userPts: res.score[res.humanTeam], oppPts: res.score[1 - res.humanTeam], forfeit, mvp: res.mvp.name, archetype: res.userArchetype }); R.saveProfile(profile);
      ranking = this.rankingPanel(r, opp, won);
      acts.append(h('button', { class: 'btn primary', dataset: { default: '', back: '' }, onclick: () => done(true) }, 'Continue to ranked hub'));
    } else {
      if (res.humans) (userWon ? app.profile.playNow.wins++ : app.profile.playNow.losses++), R.saveProfile(app.profile);
      acts.append(h('button', { class: 'btn primary', dataset: { default: '' }, onclick: () => { const cfg = { ...f }; session.dispose(); app.endSession(); app.startGame({ ...cfg, skipIntro: false }); } }, 'Rematch'), h('button', { class: 'btn', dataset: { back: '' }, onclick: () => done(false) }, 'Main menu'));
    }
    stage.append(this.title('Post-game', ranked ? 'Ranked' : 'Exhibition'), head, mvpLine, ranking ?? '', panelFor, acts);
    this.show(stage); if (ranking?.promo) ranking.promo();
  }
  rankingPanel(r, opp, won) {
    const p = this.app.profile; const el = h('div', { class: 'panel cyan', style: { margin: '10px auto', minWidth: '520px', maxWidth: '720px' } });
    const num = h('span', { class: `num ${r.delta >= 0 ? 'li' : 'dg'}`, style: { fontSize: '40px' } }, '0'); const bar = h('div', { class: 'bar', style: { height: '10px', margin: '10px 0' } }, h('i', { style: { width: `${divisionProgress(r.before) * 100}%` } })); const mmrText = h('span', { class: 'num', style: { fontSize: '20px' } }, String(r.before));
    el.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', {}, h('div', { class: 'crumbs' }, 'MMR change'), num, h('span', { class: 'muted', style: { marginLeft: '10px' } }, `vs ${opp.tag} (${opp.mmr})`)), h('div', { style: { textAlign: 'right' } }, h('div', { class: 'crumbs' }, 'Rating'), mmrText, h('div', { class: `rank-badge t-${rankFromMmr(r.after).tier}` }, R.placementDone(p) ? rankLabel(r.after) : `Placement ${p.games}/${RANKED.placementGames}`))), bar,
      h('div', { class: 'muted', style: { fontSize: '12px' } }, R.placementDone(p) ? `Progress to next division: ${Math.round(divisionProgress(r.after) * 100)}%${p.winStreak >= RANKED.streakStartAt ? ` · win-streak bonus active (${p.winStreak} wins)` : ''}` : `${R.placementLeft(p)} placement ${R.placementLeft(p) === 1 ? 'match' : 'matches'} left`));
    const t0 = performance.now(), dur = 1400; const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3); const d = Math.round(r.delta * e); num.textContent = (d >= 0 ? '+' : '') + d; mmrText.textContent = String(Math.round(r.before + r.delta * e)); bar.firstChild.style.width = `${(divisionProgress(r.before + r.delta * e)) * 100}%`; if (k < 1 && el.isConnected !== false) requestAnimationFrame(tick); }; setTimeout(() => requestAnimationFrame(tick), 300);
    el.promo = () => { if (!(r.promoted || r.demoted || r.placed)) return; setTimeout(() => this.promotion(r), 1900); };
    return el;
  }
  promotion(r) {
    const up = r.promoted || r.placed; const ov = h('div', { class: 'overlay', style: { background: 'rgba(5,6,13,.82)' } }, h('div', { class: 'promo col', style: { alignItems: 'center', gap: '10px' } }, h('div', { class: 'crumbs' }, r.placed ? 'Placements complete' : up ? 'Promotion' : 'Demotion'), h('div', { class: `display big t-${rankFromMmr(r.after).tier}`, style: { fontSize: '56px' } }, r.rankAfter), h('div', { class: 'muted' }, up ? `${r.rankBefore} → ${r.rankAfter}` : `${r.rankBefore} → ${r.rankAfter}  ·  win the next match to climb back`), h('button', { class: 'btn primary', style: { marginTop: '12px' }, onclick: () => { ov.remove(); this.app.nav.setRoot(this.current); } }, 'Continue')));
    this.root.append(ov); this.app.nav.setRoot(ov); this.app.audio.cheer(1.5); this.app.audio.chime(up ? 'perfect' : 'wayoff');
    const c = h('canvas', { width: 700, height: 300, style: { position: 'absolute', pointerEvents: 'none', top: '20%' } }); ov.append(c); const g = c.getContext('2d'); const parts = Array.from({ length: 90 }, () => ({ x: 350, y: 150, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.5) * 9 - 2, c: up ? ['#00F0FF', '#FF2BD6', '#B6FF00'][(Math.random() * 3) | 0] : '#FF3355', l: 1 })); const anim = () => { g.clearRect(0, 0, 700, 300); parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.l -= 0.011; g.globalAlpha = Math.max(0, p.l); g.fillStyle = p.c; g.fillRect(p.x, p.y, 5, 5); }); if (parts[0].l > 0 && ov.isConnected) requestAnimationFrame(anim); }; anim();
  }
  /* -------------------------------------------------------------- RANKED */
  rankedHub() {
    const app = this.app, p = app.profile; const rk = R.rankOf(p); const lb = R.leaderboard(p);
    const graph = h('canvas', { width: 520, height: 150, style: { width: '100%', background: 'rgba(0,0,0,.3)' } }); this.drawMmr(graph, p);
    const left = h('div', { class: 'col scroll', style: { flex: 1.1, minWidth: 0, paddingRight: '6px' } },
      h('div', { class: 'panel cyan' }, h('div', { class: 'row' }, h('div', { class: 'avatar', style: { width: '64px', height: '64px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'conic-gradient(var(--cyan),var(--magenta),var(--lime),var(--cyan))', color: '#05060D', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '26px' } }, p.name[0].toUpperCase()), h('div', {}, h('div', { class: 'display', style: { fontSize: '20px' } }, p.name), h('span', { class: `rank-badge ${rankClass(p)}`, style: { fontSize: '14px' } }, R.rankText(p)), h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, R.placementDone(p) ? `MMR ${p.mmr} · season high ${p.seasonHigh}` : `${R.placementLeft(p)} placement matches to go · K=${RANKED.kPlacement}`)), h('div', { class: 'spacer' }), h('div', { style: { textAlign: 'right' } }, h('div', { class: 'crumbs' }, 'Season'), h('div', { class: 'display', style: { fontSize: '20px' } }, `${R.seasonDaysLeft(p)} days left`))),
        h('div', { class: 'bar', style: { margin: '12px 0 4px', height: '8px' } }, h('i', { style: { width: `${(R.placementDone(p) ? divisionProgress(p.mmr) : p.games / RANKED.placementGames) * 100}%` } })), h('div', { class: 'muted', style: { fontSize: '11px' } }, R.placementDone(p) ? (rk.next ? `${rk.next - p.mmr} MMR to the next division` : 'Top tier reached') : 'Placement progress')),
      h('div', { class: 'panel' }, h('div', { class: 'stat-grid' }, [['Win rate', R.winPct(p) + '%'], ['W–L', `${p.wins}–${p.losses}`], ['Win streak', p.winStreak], ['Best streak', p.bestStreak], ['Avg points', R.avgPoints(p)], ['Favorite', (ARCHETYPES[R.favoriteArchetype(p)]?.label ?? '—').split(' ')[0]], ['Games', p.games], ['Points', p.points]].map(([k, v]) => h('div', {}, h('b', {}, v), h('small', {}, k)))), h('div', { class: 'row', style: { marginTop: '12px' } }, h('span', { class: 'muted', style: { fontSize: '11px' } }, 'LAST 10'), h('div', { class: 'pb-form' }, R.last10(p).map((x) => h('i', { class: x }, x)))), h('div', { class: 'crumbs', style: { margin: '12px 0 4px' } }, 'MMR history'), graph),
      h('div', { class: 'panel scroll', style: { maxHeight: '170px' } }, h('div', { class: 'crumbs', style: { marginBottom: '6px' } }, 'Match history'), p.history.length ? [...p.history].reverse().slice(0, 12).map((m) => h('div', { class: 'lb-row', style: { gridTemplateColumns: '40px 1fr 70px 70px' } }, h('b', { class: m.won ? 'li' : 'dg' }, m.won ? 'W' : 'L'), h('span', {}, `vs ${m.opp.tag} (${m.opp.mmr})`), h('span', {}, `${m.userPts}–${m.oppPts}`), h('b', { class: m.delta >= 0 ? 'li' : 'dg' }, (m.delta >= 0 ? '+' : '') + m.delta))) : h('div', { class: 'muted' }, 'No ranked matches yet.')));
    const right = h('div', { class: 'col', style: { flex: 0.9, minWidth: 0 } }, h('div', { class: 'panel grow scroll', style: { minHeight: 0 } }, h('div', { class: 'row' }, h('div', { class: 'display', style: { fontSize: '14px' } }, 'Season leaderboard'), h('div', { class: 'spacer' }), h('span', { class: 'crumbs' }, `You: #${lb.find((x) => x.you).rank} of ${lb.length}`)), h('div', { class: 'lb-row head' }, h('span', {}, '#'), h('span', {}, 'Gamertag'), h('span', {}, 'MMR'), h('span', {}, 'LVL'), h('span', {}, 'W–L')), lb.map((r) => h('div', { class: `lb-row ${r.you ? 'you' : ''}` }, h('span', {}, r.rank), h('span', {}, r.tag), h('span', {}, r.mmr), h('span', {}, r.level), h('span', {}, `${r.wins}–${r.losses}`)))),
      h('div', { class: 'panel amb' }, h('div', { class: 'crumbs', style: { marginBottom: '6px' } }, 'Season rewards preview'), h('div', { class: 'row wrap', style: { gap: '6px 12px', fontSize: '11px' } }, R.REWARDS.map(([t, r]) => h('span', { class: `t-${t}` }, `${t}: ${r}`)))),
      h('div', { class: 'panel flat', style: { fontSize: '12px', lineHeight: 1.6 } }, h('b', { class: 'cy' }, 'Ranked rules  '), `5-min quarters · fouls on · fatigue on · shot meter forced to Standard · no rematch · ${RANKED.pauseBudgetSec}s total pause (then forfeit) · rage-quit = loss × ${RANKED.rageQuitMult} MMR · K ${RANKED.kPlacement} (placement) / ${RANKED.kNormal} · streak bonus +${RANKED.streakBonus} from win ${RANKED.streakStartAt} (max +${RANKED.streakCap})`));
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Ranked', `Season ${p.seasonId}`, () => this.main()), h('div', { class: 'row grow', style: { alignItems: 'stretch', minHeight: 0, gap: '16px' } }, left, right), h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.main() }, '← Back'), h('div', { class: 'spacer' }), h('button', { class: 'btn primary', dataset: { default: '' }, onclick: () => this.rankedTeam() }, R.placementDone(p) ? 'Play ranked match' : `Play placement ${p.games + 1}/${RANKED.placementGames}`))));
  }
  drawMmr(c, p) {
    const g = c.getContext('2d'), W = c.width, H = c.height, s = p.mmrSeries.slice(-30); const lo = Math.min(...s) - 20, hi = Math.max(...s) + 20; const X = (i) => 12 + (i / Math.max(1, s.length - 1)) * (W - 24), Y = (v) => H - 14 - ((v - lo) / (hi - lo)) * (H - 28);
    g.strokeStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 14 + k * 40); g.lineTo(W, 14 + k * 40); g.stroke(); }
    const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#00F0FF'); grad.addColorStop(1, '#FF2BD6'); g.strokeStyle = grad; g.lineWidth = 2.5; g.beginPath(); s.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
    s.forEach((v, i) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(i), Y(v), 2.5, 0, 7); g.fill(); }); g.fillStyle = '#8C9AC0'; g.font = '10px Inter'; g.fillText(`${hi - 20}`, 4, 12); g.fillText(`${lo + 20}`, 4, H - 4);
  }
  rankedTeam() {
    const f = this.flow = { mode: 'pvc', picks: [], humans: [{ team: 0, device: 'auto' }], ranked: true }; const L = this.app.league; const g = h('div', { class: 'grid teams scroll grow' });
    L.teams.forEach((t, i) => g.append(this.teamCard(t, () => { f.picks[0] = i; this.lineup(0, true); })));
    this.show(h('div', { class: 'col', style: { height: '100%' } }, this.title('Choose your team', 'Ranked', () => this.rankedHub()), g, h('div', { class: 'footer-bar' }, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => this.rankedHub() }, '← Back'))));
  }
  rankedStart() {
    const app = this.app, p = app.profile, f = this.flow; const opp = R.generateOpponent(p); f.opp = opp; f.picks[1] = this.randomOther(f.picks[0]); f.rules = { arenaId: app.league.teams[f.picks[0]].arenaId };
    const found = h('div', { class: 'col', style: { alignItems: 'center', gap: '8px' } }, h('div', { class: 'display', style: { fontSize: '16px' } }, 'SEARCHING'), h('div', { class: 'muted', style: { fontSize: '12px' } }, `Looking for an opponent within ±${RANKED.matchRange} MMR…`));
    const radar = h('div', { class: 'radar' }, h('div', { class: 'sweep' })); const blip = h('div', { class: 'blip', style: { left: `${30 + Math.random() * 40}%`, top: `${25 + Math.random() * 50}%`, display: 'none' } }); radar.append(blip);
    const el = h('div', { class: 'col', style: { height: '100%', alignItems: 'center', justifyContent: 'center', gap: '20px' } }, radar, found, h('button', { class: 'btn', dataset: { back: '' }, onclick: () => { clearTimeout(t1); clearTimeout(t2); this.rankedHub(); } }, 'Cancel'));
    this.show(el); const t1 = setTimeout(() => { blip.style.display = 'block'; app.audio.ui('ok'); }, Math.max(800, opp.searchSeconds * 1000 - 900));
    const t2 = setTimeout(() => { clear(found); found.append(h('div', { class: 'display lime-t', style: { fontSize: '18px' } }, 'MATCH FOUND'), h('div', { class: 'panel mag', style: { minWidth: '360px' } }, h('div', { class: 'row' }, h('span', { style: { fontSize: '28px' } }, opp.badge), h('div', {}, h('div', { class: 'display', style: { fontSize: '16px' } }, opp.tag), h('div', { class: 'muted', style: { fontSize: '12px' } }, `LVL ${opp.level} · ${opp.rank} · MMR ${opp.mmr}`)), h('div', { class: 'spacer' }), h('span', { class: 'pill' }, `AI: ${DIFFS.find((d) => d[0] === AI_FOR(opp))[1]}`)), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '8px' } }, `Opponent AI difficulty maps from MMR (reaction ${Math.round(AI.levels[AI_FOR(opp)].react * 1000)} ms). Rubber-banding is off.`))); app.audio.chime('perfect'); setTimeout(() => this.loading(true), 1800); }, opp.searchSeconds * 1000);
  }
}
export const AI_FOR = (opp) => R.aiLevelForOpponent(opp);
void POSITIONS; void PLAY_BY_NAME; void gameScore;
