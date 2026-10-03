// Main menu, pause menu, settings, controls and sandbox (cheats / spawners / teleports).
import { CFG, SCHEMA, QUALITY, DEFAULTS, saveCfg, loadSave } from './config.js';
import { el } from './util.js';
import { TYPES } from './vehicles.js';
import { WEAPONS } from './combat.js';
import { lineX, lineZ, PIER } from './world.js';

export function createMenu(G) {
  const $ = id => document.getElementById(id), menu = $('menu'), btns = $('menu-btns'), screen = $('screen'), card = $('card'), M = {};
  const fmt = (v, it) => (it.step && it.step < 1 ? Number(v).toFixed(it.step < 0.05 ? 3 : 2) : Math.round(v));
  function btn(label, fn, cls = 'mbtn', parent = btns) { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; parent.appendChild(b); return b; }
  function mainButtons() {
    btns.innerHTML = ''; const save = loadSave();
    btn('New Game', () => G.startGame()); const c = btn('Continue', () => G.startGame({ save })); c.disabled = !save;
    btn('Settings', () => M.settings('menu')); btn('Controls', () => M.controls('menu')); btn('Sandbox Cheats', () => { M.sandbox('menu'); });
    const bs = [...btns.children]; let idx = 0; const mark = () => bs.forEach((b, i) => b.classList.toggle('on', i === idx)); mark();
    M._nav = e => { if (G.state !== 'menu' || screen.classList.contains('show')) return; if (e.code === 'ArrowDown' || e.code === 'KeyS') { do { idx = (idx + 1) % bs.length; } while (bs[idx].disabled); mark(); } else if (e.code === 'ArrowUp' || e.code === 'KeyW') { do { idx = (idx - 1 + bs.length) % bs.length; } while (bs[idx].disabled); mark(); } else if (e.code === 'Enter') bs[idx].click(); };
  }
  addEventListener('keydown', e => { if (M._nav) M._nav(e); if (e.code === 'Escape' && G.state === 'play') { if (screen.classList.contains('show') && G.paused && M.pauseOpen) { G.setPaused(false); } else if (!G.paused) G.setPaused(true); } if (e.code === 'Escape' && G.state === 'menu' && screen.classList.contains('show')) M.hideAll(); });
  M.show = () => { mainButtons(); menu.classList.add('show'); }; M.hide = () => { menu.classList.remove('show'); M.hideAll(); };
  M.hideAll = () => { screen.classList.remove('show'); card.innerHTML = ''; M.pauseOpen = false; };
  const open = (title, back) => { card.innerHTML = ''; const h = el('header'); h.appendChild(el('b', '', title)); const x = el('button', 'x', '×'); x.onclick = () => (back === 'pause' ? M.showPause() : M.hideAll()); h.appendChild(x); card.appendChild(h); screen.classList.add('show'); M.pauseOpen = false; };
  M.showPause = () => {
    open('Paused'); M.pauseOpen = true; card.querySelector('.x').onclick = () => G.setPaused(false); const body = el('div', 'body'); card.appendChild(body); const grid = el('div', 'grid'); body.appendChild(grid);
    const add = (l, f, cls = 'mini') => btn(l, f, cls, grid);
    add('▶ Resume', () => G.setPaused(false)); add('🗺 Map', () => { G.setPaused(false); const bm = $('bigmap'); bm.hidden = false; G.paused = true; G.hud.drawBigMap(); }); add('⚙ Settings', () => M.settings('pause')); add('🎮 Controls', () => M.controls('pause')); add('🧪 Sandbox', () => M.sandbox('pause')); add('💾 Save game', () => G.saveGame()); add('⏏ Main menu', () => { G.saveGame(); G.toMenu(); });
  };
  M.settings = (back) => {
    open('Settings', back); const tabs = el('div', 'tabs'), body = el('div', 'body'); card.append(tabs, body); let active = SCHEMA[0].id; const ctrls = {};
    function show() { tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.id === active)); body.querySelectorAll('section').forEach(s => { s.hidden = s.dataset.id !== active; }); }
    function apply(k, v, it) { CFG[k] = v; saveCfg(); if (k === 'weather') G.env.setWeather(v); if (k === 'startHour') G.env.setHour(v); if (it.special === 'quality') return; G.applyGfx(); }
    SCHEMA.forEach(g => {
      const t = el('button', 'tab', g.label); t.dataset.id = g.id; t.onclick = () => { active = g.id; show(); }; tabs.appendChild(t); const sec = el('section'); sec.dataset.id = g.id;
      g.items.forEach(it => {
        const r = el('label', 'row'), nm = el('span', '', it.label); if (it.hint) nm.appendChild(el('em', 'hint', it.hint)); r.appendChild(nm); let setv;
        if (it.t === 'range') { const i = el('input'); i.type = 'range'; i.min = it.min; i.max = it.max; i.step = it.step; const val = el('span', 'val'); i.oninput = () => { val.textContent = fmt(i.value, it); apply(it.k, +i.value, it); }; setv = v => { i.value = v; val.textContent = fmt(v, it); }; r.append(i, val); }
        else if (it.t === 'toggle') { const i = el('input'); i.type = 'checkbox'; i.className = 'sw'; i.onchange = () => apply(it.k, i.checked, it); setv = v => { i.checked = !!v; }; r.appendChild(i); }
        else if (it.t === 'select') { const s = el('select'); it.opts.forEach(o => { const op = el('option', '', o); op.value = o; s.appendChild(op); }); s.onchange = () => { apply(it.k, s.value, it); s.blur(); }; setv = v => { s.value = v; }; r.appendChild(s); }
        else if (it.t === 'buttons') { const w = el('div', 'btns'); it.opts.forEach(o => { const b = el('button', 'mini', o); b.type = 'button'; b.onclick = e => { e.preventDefault(); Object.assign(CFG, QUALITY[o]); CFG.quality = o; saveCfg(); G.applyGfx(); Object.keys(ctrls).forEach(k => ctrls[k](CFG[k])); w.querySelectorAll('.mini').forEach(x => x.classList.toggle('on', x.textContent === o)); }; if (CFG.quality === o) b.classList.add('on'); w.appendChild(b); }); r.appendChild(w); setv = () => {}; }
        ctrls[it.k] = setv; setv(CFG[it.k]); sec.appendChild(r);
      }); body.appendChild(sec);
    });
    show(); const f = el('div', 'foot2'); btn('Reset to defaults', () => { Object.assign(CFG, DEFAULTS); saveCfg(); G.applyGfx(); G.env.setWeather(CFG.weather); Object.keys(ctrls).forEach(k => ctrls[k](CFG[k])); }, 'pbtn warn', f); btn('Back', () => (back === 'pause' ? M.showPause() : M.hideAll()), 'pbtn', f); card.appendChild(f);
  };
  M.controls = (back) => {
    open('Controls', back); const body = el('div', 'body'); card.appendChild(body);
    const sec = (t, rows) => { body.appendChild(el('h3', '', t)); const g = el('div', 'keys'); rows.forEach(([a, b]) => { const d = el('div'); d.appendChild(el('span', '', a)); const k = el('span'); k.innerHTML = b; d.appendChild(k); g.appendChild(d); }); body.appendChild(g); };
    sec('On foot', [['Move', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>'], ['Look', 'Mouse'], ['Sprint', '<kbd>Shift</kbd>'], ['Jump', '<kbd>Space</kbd>'], ['Aim / Fire', '<kbd>RMB</kbd> / <kbd>LMB</kbd>'], ['Reload', '<kbd>R</kbd>'], ['Weapons', '<kbd>1</kbd>–<kbd>5</kbd> · <kbd>Q</kbd><kbd>E</kbd> · wheel'], ['Enter / carjack vehicle', '<kbd>F</kbd>']]);
    sec('Driving', [['Accelerate / Brake·Reverse', '<kbd>W</kbd> / <kbd>S</kbd>'], ['Steer', '<kbd>A</kbd> <kbd>D</kbd>'], ['Handbrake (drift)', '<kbd>Space</kbd>'], ['Horn', '<kbd>H</kbd>'], ['Look behind', '<kbd>C</kbd>'], ['Radio prev / next', '<kbd>Q</kbd> / <kbd>E</kbd>'], ['Exit vehicle', '<kbd>F</kbd>'], ['Camera', 'Mouse']]);
    sec('General', [['Map / waypoint', '<kbd>M</kbd>'], ['Pause', '<kbd>Esc</kbd>'], ['Jobs / interact', '<kbd>F</kbd> at yellow marker']]);
    const f = el('div', 'foot2'); btn('Back', () => (back === 'pause' ? M.showPause() : M.hideAll()), 'pbtn', f); card.appendChild(f);
  };
  M.sandbox = (back) => {
    open('Sandbox', back); const body = el('div', 'body'); card.appendChild(body); const P = G.player;
    const sec = (t, items) => { body.appendChild(el('h3', '', t)); const g = el('div', 'grid'); items.forEach(([l, f]) => btn(l, f, 'mini', g)); body.appendChild(g); };
    const ahead = () => { const a = P.state === 'vehicle' ? P.vehicle.a : P.a; return { x: P.x + Math.cos(a) * 7, z: P.z + Math.sin(a) * 7, a }; };
    sec('Wanted level', [0, 1, 2, 3, 4, 5].map(n => [n === 0 ? 'Clear wanted' : '★'.repeat(n), () => { if (G.police) G.police.setStars(n); G.hud.notify('Wanted: ' + n); }]));
    sec('Spawn vehicle', Object.keys(TYPES).map(k => [TYPES[k].name, () => { const p = ahead(); const v = G.vehicles.spawn(k, p.x, p.z, p.a); G.hud.notify('Spawned ' + v.name); }]));
    sec('Player', [['Heal + armor', () => { P.hp = 100; P.armor = 100; }], ['+$10,000', () => { P.cash += 10000; }], ['All weapons', () => { P.giveAll(); G.hud.notify('Armed'); }], ['Toggle god mode', () => { CFG.godMode = !CFG.godMode; saveCfg(); G.hud.notify('God mode ' + (CFG.godMode ? 'on' : 'off')); }]]);
    const W = G.world.spawns; sec('Teleport', [['Ocean Drive', W.beach], ['Chrome Heights', W.downtown], ['Neon Mile', W.neon], ['Wynwood Arts', W.arts], ['Harbor Yards', W.port], ['Pier end', W.pier]].map(([n, p]) => [n, () => { P.teleport(p.x, p.z); G.setPaused(false); }]));
    sec('Time & weather', [['Dawn 6:30', 6.5], ['Noon', 12], ['Sunset 18:15', 18.25], ['Midnight', 0]].map(([n, h]) => [n, () => G.env.setHour(h)]).concat(['Clear', 'Overcast', 'Rain', 'Storm'].map(w => [w, () => { G.env.setWeather(w); CFG.weather = w; saveCfg(); }])));
    const f = el('div', 'foot2'); btn('Back', () => (back === 'pause' ? M.showPause() : M.hideAll()), 'pbtn', f); card.appendChild(f);
  };
  return M;
}
