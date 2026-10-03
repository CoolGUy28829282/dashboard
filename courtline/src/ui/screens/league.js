// League hub: browse teams and players, manage save slots, generate a new league, import/export saves.
import { h, ovrColor, fmtHeight, fmtMoney, hex } from '../../core/util.js';
import { RATING_KEYS, RATING_LABEL } from '../../league/generate.js';
import { logoURL, drawJersey } from '../../league/logo.js';
import { SLOTS } from '../../core/save.js';
import { btn, toast } from '../components.js';

const ovrPill = (o) => h('span', { class: 'ovr mono', style: { background: ovrColor(o) } }, o);
const fmtDate = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function leagueScreen(params, ctx) {
  const { state, router, actions } = ctx;
  let view = 'teams', teamId = 0, posFilter = 'ALL', selected = null;
  const tabs = ['teams', 'players', 'saves'];
  const tabEls = tabs.map((t) => h('button', { class: 'tab', 'data-nav': '', 'data-quiet': '1', onClick: () => { view = t; render(); } }, { teams: 'Teams', players: 'Players', saves: 'Saves' }[t]));
  const content = h('div', { class: 'scroll', style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } });
  const el = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', { class: 'h1' }, 'League & saves'), h('div', { class: 'tabs' }, tabEls), h('span', { class: 'dim', id: 'lgInfo' })), content);

  function info() {
    const l = state.league;
    el.querySelector('#lgInfo').textContent = l ? `${l.name} · ${l.season.label} · seed ${l.seed} · ${ctx.save.backend}` : '';
  }
  function card(p) {
    const l = state.league, t = l.teams[p.teamId], r = p.ratings;
    const bars = RATING_KEYS.map((k) => h('div', { class: 'rbar' }, h('span', { class: 'dim' }, RATING_LABEL[k]),
      h('i', null, h('b', { style: { background: ovrColor(r[k]), transform: `scaleX(${r[k] / 100})` } })), h('span', { class: 'mono' }, r[k])));
    const tm = p.tendencies.shotMix;
    return h('div', { class: 'panel', style: { padding: '1rem', overflow: 'auto', minHeight: 0 } },
      h('div', { style: { display: 'flex', gap: '.8rem', alignItems: 'center' } }, h('img', { src: logoURL(t, 96), width: 48, height: 48 }),
        h('div', null, h('div', { style: { fontWeight: 800, fontSize: '1.25rem' } }, `#${p.num} ${p.name}`), h('div', { class: 'dim' }, `${p.pos} · ${p.arch} · ${t.city} ${t.name}`))),
      h('div', { style: { display: 'flex', gap: '.5rem', margin: '.8rem 0', flexWrap: 'wrap' } }, ovrPill(p.ovr), h('span', { class: 'pill' }, 'POT ' + p.potential), h('span', { class: 'pill' }, p.personality)),
      h('div', { class: 'dim', style: { fontSize: '.85rem', marginBottom: '.7rem' } },
        `Age ${p.age} · ${fmtHeight(p.heightIn)} · wingspan ${fmtHeight(p.wingIn)} · ${p.weightLb} lb · ${fmtMoney(p.contract.salary)} × ${p.contract.years} yr`),
      bars,
      h('div', { class: 'grp' }, 'Tendencies'),
      h('div', { class: 'dim', style: { fontSize: '.85rem', lineHeight: 1.6 } },
        `Shot mix: ${tm.rim}% rim · ${tm.mid}% mid · ${tm.three}% three · ${tm.post}% post`, h('br'),
        `Pass-first ${p.tendencies.passFirst} · Drives ${p.tendencies.drive} · Isolation ${p.tendencies.iso} · Off-ball ${p.tendencies.offBall}`, h('br'),
        `Crashes boards ${p.tendencies.crashBoards} · Gambles ${p.tendencies.gamble} · Helps ${p.tendencies.helpD} · Foul-prone ${p.tendencies.foulProne}`));
  }
  function playerRows(list, withTeam) {
    const l = state.league;
    const head = ['OVR', 'Player', withTeam ? 'Team' : 'Pos', 'Age', 'Ht', 'Wt', 'Salary', 'Yrs'];
    return h('table', { class: 't' }, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))),
      h('tbody', null, list.map((p) => {
        const tr = h('tr', { 'data-nav': '', 'data-quiet': '1', onClick: () => pick(p) },
          h('td', null, ovrPill(p.ovr)), h('td', null, `${p.name}`, h('span', { class: 'dim' }, `  ${p.pos}`)), h('td', null, withTeam ? l.teams[p.teamId].abbr : p.pos),
          h('td', { class: 'mono' }, p.age), h('td', { class: 'mono' }, fmtHeight(p.heightIn)), h('td', { class: 'mono' }, p.weightLb), h('td', { class: 'mono' }, fmtMoney(p.contract.salary)), h('td', { class: 'mono' }, p.contract.years));
        tr._player = p; return tr;
      })));
  }
  let cardHost = null;
  function pick(p) { selected = p; if (cardHost) { cardHost.textContent = ''; cardHost.append(card(p)); } }

  function renderTeams() {
    const l = state.league;
    for (const conf of l.conferences) {
      content.append(h('div', { class: 'grp' }, `${conf}ern conference`));
      content.append(h('div', { class: 'teams' }, l.teams.filter((t) => t.conf === conf).map((t) =>
        h('button', { class: 'team-card', 'data-nav': '', 'data-quiet': '1', onClick: () => { teamId = t.id; view = 'team'; selected = null; render(); } },
          h('img', { src: logoURL(t, 128) }),
          h('div', null, h('div', { class: 'tn' }, `${t.city} ${t.name}`), h('div', { class: 'ts' }, `${t.div} · OVR ${t.rating.ovr} · ${fmtMoney(t.payroll)}`))))));
    }
  }
  function renderTeam() {
    const l = state.league, t = l.teams[teamId], ps = t.roster.map((i) => l.players[i]).sort((a, b) => b.ovr - a.ovr);
    const jerseys = ['home', 'away', 'alt'].map((k) => { const cv = h('canvas', { width: 84, height: 84, title: k }); drawJersey(cv, t.uniforms[k], ps[0].num); return h('div', { style: { textAlign: 'center' } }, cv, h('div', { class: 'dim', style: { fontSize: '.7rem' } }, k)); });
    cardHost = h('div', { style: { minHeight: 0, display: 'flex', flexDirection: 'column' } });
    content.append(
      h('div', { class: 'panel', style: { padding: '.8rem 1rem', display: 'flex', gap: '1.2rem', alignItems: 'center', flexWrap: 'wrap' } },
        btn('‹ Teams', () => { view = 'teams'; render(); }, 'small', { 'data-autofocus': '' }),
        h('img', { src: logoURL(t, 160), width: 64, height: 64 }),
        h('div', null, h('div', { style: { fontSize: '1.4rem', fontWeight: 800 } }, `${t.city} ${t.name}`), h('div', { class: 'dim' }, `${t.conf} · ${t.div} division · ${t.arena.name} (${t.arena.capacity.toLocaleString()})`)),
        h('div', { class: 'mono' }, `OVR ${t.rating.ovr} · OFF ${t.rating.off} · DEF ${t.rating.def}`, h('br'), h('span', { class: 'dim' }, `Payroll ${fmtMoney(t.payroll)} of ${fmtMoney(l.cap.salaryCap)} cap`)),
        h('div', { class: 'swatches' }, ['primary', 'secondary', 'accent'].map((k) => h('i', { class: 'sw', style: { background: hex(t.colors[k]) }, title: k }))),
        h('div', { style: { display: 'flex', gap: '.4rem' } }, jerseys)),
      h('div', { class: 'cols', style: { marginTop: '.8rem' } }, h('div', { class: 'panel scroll', style: { padding: '0 .6rem' } }, playerRows(ps, false)), cardHost));
    pick(selected && selected.teamId === teamId ? selected : ps[0]);
  }
  function renderPlayers() {
    const l = state.league;
    const chips = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map((p) => h('button', { class: 'tab' + (p === posFilter ? ' on' : ''), 'data-nav': '', 'data-quiet': '1', onClick: () => { posFilter = p; render(); } }, p));
    const list = l.players.filter((p) => posFilter === 'ALL' || p.pos === posFilter).sort((a, b) => b.ovr - a.ovr).slice(0, 80);
    cardHost = h('div', { style: { minHeight: 0, display: 'flex', flexDirection: 'column' } });
    content.append(h('div', { class: 'tabs', style: { marginBottom: '.7rem' } }, chips, h('span', { class: 'dim', style: { alignSelf: 'center', marginLeft: '.6rem' } }, `Top ${list.length} of ${l.players.length} players`)),
      h('div', { class: 'cols' }, h('div', { class: 'panel scroll', style: { padding: '0 .6rem' } }, playerRows(list, true)), cardHost));
    pick(selected && list.includes(selected) ? selected : list[0]);
  }
  function renderSaves() {
    const seed = h('input', { type: 'text', value: String((Math.random() * 1e6) | 0), 'data-nav': '', 'data-quiet': '1', style: { width: '8rem' } });
    const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    file.addEventListener('change', async () => { if (file.files[0]) { await actions.importFile(file.files[0]); file.value = ''; render(); } });
    const list = h('div', { class: 'panel' }, h('div', { class: 'dim', style: { padding: '.8rem 1rem' } }, 'Loading saves…'));
    content.append(
      h('div', { class: 'panel', style: { padding: '1rem', display: 'flex', gap: '.7rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.8rem' } },
        h('b', null, 'New league'), h('span', { class: 'dim' }, 'Seed'), seed,
        btn('Generate', async () => { const n = parseInt(seed.value, 10); await actions.newLeague(Number.isFinite(n) ? n : (Math.random() * 1e9) | 0); info(); render(); }, 'primary small', { 'data-autofocus': '' }),
        btn('Import save…', () => file.click(), 'small'), file,
        h('span', { class: 'dim' }, 'Generating happens off the main thread; menus keep animating.')),
      list);
    ctx.save.list().then((all) => {
      list.textContent = '';
      for (const { slot, meta } of all) {
        const isAuto = slot === 'auto';
        const acts = h('div', { class: 'acts' });
        if (!isAuto) acts.append(btn('Save here', async () => { await actions.saveSlot(slot); render(); }, 'small', { 'data-quiet': '1' }));
        if (meta) acts.append(btn('Load', async () => { await actions.loadSlot(slot); info(); render(); }, 'small'), btn('Export', () => actions.exportSlot(slot), 'small'), btn('Delete', async () => { await actions.deleteSlot(slot); render(); }, 'small danger'));
        list.append(h('div', { class: 'slot' },
          h('div', null, h('div', { style: { fontWeight: 700 } }, isAuto ? 'Autosave' : 'Slot ' + slot.slice(4), meta ? ` · ${meta.name}` : ''),
            h('div', { class: 'dim', style: { fontSize: '.85rem' } }, meta ? `${meta.season} · ${meta.teams} teams · ${meta.players} players · seed ${meta.seed} · saved ${fmtDate(meta.savedAt)}` : 'Empty')),
          acts));
      }
      ctx.nav.refocus();
    });
  }
  function render() {
    content.textContent = ''; cardHost = null;
    tabEls.forEach((t, i) => t.classList.toggle('on', (view === 'team' ? 'teams' : view) === tabs[i]));
    if (!state.league) { content.append(h('div', { class: 'dim', style: { padding: '2rem' } }, 'No league loaded yet.')); return; }
    if (view === 'teams') renderTeams(); else if (view === 'team') renderTeam(); else if (view === 'players') renderPlayers(); else renderSaves();
    info();
    content.scrollTop = 0;
    if (ctx.nav.root) ctx.nav.refocus();
  }
  render();
  return {
    el,
    onShow() { info(); },
    onTab(d) { const i = (tabs.indexOf(view === 'team' ? 'teams' : view) + d + tabs.length) % tabs.length; view = tabs[i]; render(); ctx.audio.sfx('click', 0.6); },
    onBack() { if (view === 'team') { view = 'teams'; render(); return true; } return false; },
    onFocus(e) { if (e._player) pick(e._player); },
    prompts: [['move', 'Move'], ['accept', 'Select'], ['tabs', 'Tab'], ['back', 'Back']],
  };
}
