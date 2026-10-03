// Settings panel generated from SCHEMA. All state lives in CFG; the host reacts through handlers.
import { SCHEMA, QUALITY, CFG, savedPresets, storePresets } from './config.js';

export function initUI(h) {
  const root = document.getElementById('panel'), body = root.querySelector('.body'), tabs = root.querySelector('.tabs');
  const ctrls = {}; let active = SCHEMA[0].id, open = false;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const fmt = (v, it) => (it.step && it.step < 1 ? Number(v).toFixed(it.step < 0.05 ? 3 : 2) : Math.round(v));

  function row(it) {
    const r = el('label', 'row'); r.dataset.k = it.k; const name = el('span', 'name', it.label); r.appendChild(name);
    if (it.hint) { const hi = el('em', 'hint', it.hint); name.appendChild(hi); }
    let input, setv;
    if (it.t === 'range') {
      input = el('input'); input.type = 'range'; input.min = it.min; input.max = it.max; input.step = it.step; const val = el('span', 'val');
      input.oninput = () => { val.textContent = fmt(input.value, it); h.set(it.k, +input.value, it); };
      setv = v => { input.value = v; val.textContent = fmt(v, it); }; r.append(input, val);
    } else if (it.t === 'color') {
      input = el('input'); input.type = 'color'; input.oninput = () => h.set(it.k, input.value, it); setv = v => { input.value = v; }; r.appendChild(input);
    } else if (it.t === 'toggle') {
      input = el('input'); input.type = 'checkbox'; input.className = 'sw'; input.onchange = () => h.set(it.k, input.checked, it); setv = v => { input.checked = !!v; }; r.appendChild(input);
    } else if (it.t === 'select') {
      input = el('select'); it.opts.forEach(o => { const op = el('option', '', o); op.value = o; input.appendChild(op); });
      input.onchange = () => { h.set(it.k, input.value, it); input.blur(); }; setv = v => { input.value = v; }; r.appendChild(input);
    } else if (it.t === 'text') {
      input = el('input'); input.type = 'text'; input.maxLength = 10; input.onchange = () => h.set(it.k, input.value.toUpperCase(), it); setv = v => { input.value = v; }; r.appendChild(input);
    } else if (it.t === 'number') {
      input = el('input'); input.type = 'number'; const dice = el('button', 'mini', '🎲'); dice.type = 'button';
      input.onchange = () => h.set(it.k, Math.floor(+input.value || 0), it); dice.onclick = e => { e.preventDefault(); const v = Math.floor(Math.random() * 99999); input.value = v; h.set(it.k, v, it); };
      setv = v => { input.value = v; }; r.append(input, dice);
    } else if (it.t === 'buttons') {
      const wrap = el('div', 'btns'); it.opts.forEach(o => { const b = el('button', 'mini', o); b.type = 'button'; b.onclick = e => { e.preventDefault(); h.quality(o); }; wrap.appendChild(b); }); r.appendChild(wrap); setv = () => {};
    }
    if (it.t === 'toggle' || it.t === 'select' || it.t === 'range' || it.t === 'color') input.addEventListener('keydown', e => { if (e.code === 'Escape') toggle(false); });
    ctrls[it.k] = setv; return r;
  }
  SCHEMA.forEach(g => {
    const t = el('button', 'tab', g.label); t.type = 'button'; t.dataset.id = g.id; t.onclick = () => { active = g.id; show(); }; tabs.appendChild(t);
    const sec = el('section'); sec.dataset.id = g.id; g.items.forEach(it => sec.appendChild(row(it))); body.appendChild(sec);
  });
  function show() { tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.id === active)); body.querySelectorAll('section').forEach(s => { s.hidden = s.dataset.id !== active; }); }
  function refresh() { for (const k in ctrls) if (CFG[k] !== undefined) ctrls[k](CFG[k]); }

  // footer actions
  const foot = root.querySelector('.foot'); const btn = (label, fn, cls = '') => { const b = el('button', 'act ' + cls, label); b.type = 'button'; b.onclick = fn; foot.appendChild(b); return b; };
  btn('🎲 Randomize look', () => { h.randomize(); refresh(); });
  btn('Reset all', () => { h.reset(); refresh(); }, 'warn');
  const sel = el('select', 'act'); foot.appendChild(sel);
  function fillPresets() { sel.innerHTML = ''; const o0 = el('option', '', 'Saved presets…'); o0.value = ''; sel.appendChild(o0); Object.keys(savedPresets()).forEach(n => { const o = el('option', '', n); o.value = n; sel.appendChild(o); }); }
  fillPresets(); sel.onchange = () => { const p = savedPresets()[sel.value]; if (p) { h.load(p); refresh(); } sel.value = ''; sel.blur(); };
  btn('Save preset', () => { const n = prompt('Preset name?'); if (!n) return; const all = savedPresets(); all[n.slice(0, 30)] = { ...CFG }; storePresets(all); fillPresets(); });
  btn('Export', () => { const j = JSON.stringify(CFG); if (navigator.clipboard) navigator.clipboard.writeText(j).catch(() => {}); prompt('Copy your settings JSON:', j); });
  btn('Import', () => { const j = prompt('Paste settings JSON:'); if (!j) return; try { h.load(JSON.parse(j)); refresh(); } catch (e) { alert('That is not valid settings JSON.'); } });

  function toggle(v = !open) { open = v; root.classList.toggle('open', open); document.body.classList.toggle('panel-open', open); if (!open && document.activeElement) document.activeElement.blur(); h.toggled && h.toggled(open); }
  document.getElementById('gear').onclick = () => toggle();
  root.querySelector('.x').onclick = () => toggle(false);
  show(); refresh();
  return { toggle, refresh, isOpen: () => open };
}
