// Tiny DOM helpers + spatial controller navigation used by every menu.
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; else if (k === 'dataset') Object.assign(el.dataset, v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid === null || kid === undefined || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const fmtClock = (c) => (c < 60 ? `${Math.floor(c)}.${Math.floor((c % 1) * 10)}` : `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`);
export const periodName = (q) => (q > 4 ? `OT${q - 4 > 1 ? q - 4 : ''}` : `Q${q}`);

const FOCUSABLE = 'button:not(:disabled), .focusable, .tc, .mm-item, input[type=range], select, .card, .pcard, .tab, .tile:not(.locked)';
export class Nav {
  constructor(input, audio) { this.audio = audio; this.root = null; this.cur = null; this.enabled = true; input.menuHandlers.add((kind, v, e) => this.handle(kind, v, e)); }
  setRoot(el) { this.root = el; this.cur = null; queueMicrotask(() => this.focusFirst()); }
  items() { return this.root ? [...this.root.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetParent !== null && !e.closest('[inert]')) : []; }
  focusFirst() { const it = this.items(); this.focus(it.find((e) => e.dataset.default !== undefined) ?? it[0]); }
  focus(el) { if (!el) return; this.cur?.classList.remove('focus'); this.cur = el; el.classList.add('focus'); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); if (el.focus && !el.matches('.tile')) try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }
  move(dir) {
    const items = this.items(); if (!items.length) return; if (!this.cur || !items.includes(this.cur)) return this.focus(items[0]);
    const r = this.cur.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; let best = null, bs = 1e9;
    for (const it of items) {
      if (it === this.cur) continue; const b = it.getBoundingClientRect(), p = { x: b.left + b.width / 2, y: b.top + b.height / 2 }; const dx = p.x - c.x, dy = p.y - c.y;
      const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4; if (!ok) continue;
      const major = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy), minor = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const s = major + minor * 2.2; if (s < bs) { bs = s; best = it; }
    }
    if (best) { this.focus(best); this.audio?.ui('tick'); }
  }
  handle(kind, v, e) {
    if (!this.enabled || !this.root) return;
    if (kind === 'key') {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (map[v]) { const cur = this.cur; if (cur?.matches('input[type=range]') && (v === 'ArrowLeft' || v === 'ArrowRight')) return; if (cur?.matches('select')) return; e.preventDefault(); this.move(map[v]); }
      else if (v === 'Enter' || v === 'NumpadEnter') { if (this.cur && !this.cur.matches('input,select')) { e.preventDefault(); this.cur.click(); this.audio?.ui('ok'); } }
      else if (v === 'Escape' || v === 'Backspace') { const b = this.root.querySelector('[data-back]'); if (b) { e.preventDefault(); b.click(); this.audio?.ui('back'); } }
    } else if (kind === 'nav') {
      if (v === 'ok') { this.cur?.click(); this.audio?.ui('ok'); } else if (v === 'back') { this.root.querySelector('[data-back]')?.click(); this.audio?.ui('back'); }
      else if (this.cur?.matches('input[type=range]') && (v === 'left' || v === 'right')) { const r = this.cur; r.value = +r.value + (v === 'left' ? -1 : 1) * (+r.step || 0.05) * 2; r.dispatchEvent(new Event('input', { bubbles: true })); }
      else this.move(v);
    }
  }
}
export function toast(parent, text, cls = 'cyan', ms = 2600) { const t = h('div', { class: `panel toast ${cls}`, style: { padding: '8px 14px', fontSize: '12px' } }, text); parent.append(t); setTimeout(() => t.remove(), ms); return t; }
export const seg = (opts, value, onPick) => { const el = h('div', { class: 'seg' }); const render = (v) => { clear(el); opts.forEach(([k, label]) => el.append(h('button', { class: v === k ? 'on' : '', onclick: () => { onPick(k); render(k); } }, label))); }; render(value); return el; };
export const toggle = (value, onChange) => { const el = h('div', { class: `switch focusable ${value ? 'on' : ''}`, role: 'switch', onclick: () => { value = !value; el.classList.toggle('on', value); onChange(value); } }); return el; };
export const slider = (value, onChange, min = 0, max = 1, step = 0.05) => h('input', { type: 'range', min, max, step, value, oninput: (e) => onChange(+e.target.value) });
