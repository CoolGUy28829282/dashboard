// Settings: rendered from the schema. Every control writes to the store immediately; the store saves and notifies.
import { h, clamp } from '../../core/util.js';
import { SCHEMA, ACTIONS, codeLabel, PAD_NAMES } from '../../core/settings.js';
import { btn, toast } from '../components.js';

export function settingsScreen(params, ctx) {
  const { settings, input, router, audio } = ctx;
  let cat = SCHEMA[params.cat || 0] ? params.cat || 0 : 0, rows = [];
  const side = h('div', { class: 'panel side' });
  const body = h('div', { class: 'panel body' });
  const help = h('div', { class: 'panel help' }, 'Changes apply instantly and are saved automatically.');
  const tabs = SCHEMA.map((c, i) => h('button', { class: 'tab', 'data-nav': '', 'data-quiet': '1', onClick: () => { select(i); audio.sfx('click', 0.6); } }, c.title));
  tabs.forEach((t) => side.append(t));
  const reset = btn('Reset this page', () => { settings.resetCategory(SCHEMA[cat].id); render(); toast('Reset to defaults'); }, 'small');
  reset.style.marginTop = 'auto';
  side.append(reset);

  function mkRow(label, ctl, o = {}) {
    const el = h('div', { class: 'row', 'data-nav': '', 'data-quiet': '1', tabindex: -1 }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctl' }, ctl));
    el._help = o.desc || ''; el._adjust = o.adjust; el._refresh = o.refresh;
    if (o.click) el.addEventListener('click', (e) => { if (!e.target.closest('.arr, input')) o.click(); });
    return el;
  }
  function buildItem(it) {
    const k = it.k, val = () => settings.get(k);
    if (it.type === 'toggle') {
      const t = h('div', { class: 'tog' }, h('i'));
      const row = mkRow(it.label, t, { desc: it.desc, click: () => settings.set(k, !val()), adjust: (d) => settings.set(k, d > 0), refresh: () => t.classList.toggle('on', !!val()) });
      row._refresh(); return row;
    }
    if (it.type === 'select') {
      const v = h('span', { class: 'val' });
      const cycle = (d) => { const i = it.options.findIndex((o) => o[0] === val()); settings.set(k, it.options[(i + d + it.options.length) % it.options.length][0]); };
      const ctl = h('div', { class: 'sel' }, h('span', { class: 'arr', onClick: () => cycle(-1) }, '‹'), v, h('span', { class: 'arr', onClick: () => cycle(1) }, '›'));
      const row = mkRow(it.label, ctl, { desc: it.desc, click: () => cycle(1), adjust: cycle, refresh: () => { const o = it.options.find((x) => x[0] === val()); v.textContent = o ? o[1] : String(val()); } });
      row._refresh(); return row;
    }
    const inp = h('input', { type: 'range', min: it.min, max: it.max, step: it.step, 'data-quiet': '1' });
    const rv = h('span', { class: 'rv mono' });
    inp.addEventListener('input', () => settings.set(k, +inp.value));
    const row = mkRow(it.label, [inp, rv], {
      desc: it.desc,
      adjust: (d) => settings.set(k, clamp(Math.round((val() + d * it.step) / it.step) * it.step, it.min, it.max)),
      refresh: () => { inp.value = val(); rv.textContent = it.fmt(val()); },
    });
    row._refresh(); return row;
  }
  function buildRemap() {
    const frag = [];
    let group = '';
    const note = h('div', { class: 'help', style: { padding: '.4rem .8rem' } }, 'Click a binding, then press a key or controller button. Esc cancels. Duplicates in the same group swap.');
    frag.push(note);
    for (const a of ACTIONS) {
      if (a.group !== group) { group = a.group; frag.push(h('div', { class: 'grp' }, group)); }
      const mk = (kind) => {
        const b = h('button', { class: 'btn small', 'data-nav': '', 'data-quiet': '1', style: { minWidth: '5.5rem' } });
        const paint = () => { b.textContent = kind === 'kb' ? codeLabel(settings.bind.kb[a.id]) : PAD_NAMES[settings.bind.pad[a.id]] || 'Btn ' + settings.bind.pad[a.id]; };
        paint();
        b.addEventListener('click', () => {
          b.textContent = kind === 'kb' ? 'Press a key…' : 'Press a button…'; b.classList.add('capture');
          input.capture(kind, (code) => { b.classList.remove('capture'); if (code !== null && code !== undefined) { settings.setBinding(kind, a.id, code); audio.sfx('confirm', 0.7); } render(); });
        });
        return b;
      };
      const row = mkRow(a.label, [mk('kb'), mk('pad')], { desc: 'Keyboard on the left, controller on the right.' });
      frag.push(row);
    }
    frag.push(h('div', { style: { padding: '.8rem', display: 'flex', gap: '.6rem' } },
      btn('Controls reference', () => router.push('controls'), 'small'),
      btn('Reset bindings', () => { settings.resetBindings(); render(); toast('Bindings reset'); }, 'small')));
    return frag;
  }
  function render() {
    input.cancelCapture();
    body.textContent = ''; rows = [];
    const c = SCHEMA[cat];
    body.append(h('h2', { class: 'h1', style: { fontSize: '1.3rem', margin: '.6rem .4rem' } }, c.title));
    for (const it of c.items) {
      if (it.type === 'remap') { for (const n of buildRemap()) body.append(n); continue; }
      const r = buildItem(it); rows.push(r); body.append(r);
    }
    tabs.forEach((t, i) => t.classList.toggle('on', i === cat));
    body.scrollTop = 0;
    if (ctx.nav.root) ctx.nav.refocus();
  }
  function select(i) { cat = (i + SCHEMA.length) % SCHEMA.length; render(); const f = body.querySelector('[data-nav]'); if (f) ctx.nav.focus(f, true); }
  const off = settings.on('change', () => rows.forEach((r) => r._refresh && r._refresh()));
  const off2 = settings.on('bindings', () => {});
  const el = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', { class: 'h1' }, 'Settings'), h('span', { class: 'dim' }, 'Saved instantly')), h('div', { class: 'split' }, side, body), help);
  render();
  return {
    el,
    onShow() { const f = body.querySelector('[data-nav]'); if (f) ctx.nav.focus(f, true); },
    onTab: (d) => { select(cat + d); audio.sfx('click', 0.6); },
    onBack() { if (input._capture) { input.cancelCapture(); render(); return true; } return false; },
    onFocus(e) { help.textContent = e._help || 'Changes apply instantly and are saved automatically.'; },
    prompts: [['move', 'Move'], ['adjust', 'Change'], ['tabs', 'Category'], ['back', 'Back']],
    dispose() { off(); off2(); input.cancelCapture(); },
  };
}

export function controlsScreen(params, ctx) {
  const { settings } = ctx;
  const kb = (id) => h('span', { class: 'kbd' }, codeLabel(settings.bind.kb[id]));
  const pad = (id) => h('span', { class: 'kbd' }, PAD_NAMES[settings.bind.pad[id]] || '?');
  let group = '';
  const rows = [];
  for (const a of ACTIONS) {
    if (a.group !== group) { group = a.group; rows.push(h('div', { class: 'grp' }, group)); }
    rows.push(h('div', { class: 'row', style: { cursor: 'default' } }, h('span', { class: 'lbl' }, a.label), h('div', { class: 'ctl', style: { minWidth: '9rem' } }, kb(a.id), pad(a.id))));
  }
  const fixed = [
    ['Move', 'W A S D / arrows', 'Left stick'], ['Menu: select', 'Enter / Space / click', 'A'], ['Menu: back', 'Esc / Backspace', 'B'], ['Menu: change tab', 'Q / E', 'LB / RB'],
    ['Performance overlay', 'F3', '—'],
  ];
  const el = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', { class: 'h1' }, 'Controls guide'), h('span', { class: 'dim' }, 'Reflects your current bindings')),
    h('div', { class: 'panel body', style: { flex: 1 } },
      h('div', { class: 'grp' }, 'Fixed'),
      fixed.map(([l, a, b]) => h('div', { class: 'row', style: { cursor: 'default' } }, h('span', { class: 'lbl' }, l), h('div', { class: 'ctl', style: { minWidth: '16rem' } }, h('span', { class: 'kbd' }, a), h('span', { class: 'kbd' }, b)))),
      rows, h('div', { style: { padding: '1rem' } }, btn('Edit bindings', () => { const prev = ctx.router.stack[ctx.router.stack.length - 2]; ctx.router.pop(); if (!prev || prev.id !== 'settings') ctx.router.push('settings', { cat: 1 }); }, 'small', { 'data-autofocus': '' }))));
  return { el, prompts: [['back', 'Back']] };
}
