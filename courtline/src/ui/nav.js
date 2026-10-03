// Focus manager shared by keyboard, mouse and gamepad. Focusable things carry data-nav; the focused one gets .focused.
// Layout is only measured in response to input events, never per frame.
export class Nav {
  constructor(input, audio) {
    this.input = input; this.audio = audio; this.root = null; this.cur = null; this.screen = null; this.router = null;
    input.on('nav', (a) => this.handle(a));
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-nav]');
      if (el && this.root && this.root.contains(el) && el !== this.cur) this.focus(el, false, true);
    });
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-nav]');
      if (el && this.root && this.root.contains(el)) { this.focus(el, true, true); if (!el.dataset.quiet && !el.disabled) this.audio.sfx('click', 0.7); }
    });
  }
  setRoot(el, screen) {
    this.root = el; this.screen = screen; this.cur = null;
    const first = el.querySelector('[data-autofocus]') || this.items()[0];
    if (first) this.focus(first, true);
  }
  items() {
    if (!this.root) return [];
    return Array.from(this.root.querySelectorAll('[data-nav]')).filter((e) => !e.disabled && e.offsetParent !== null);
  }
  focus(el, silent, fromMouse) {
    if (this.cur === el) return;
    if (this.cur) this.cur.classList.remove('focused');
    this.cur = el;
    if (!el) return;
    el.classList.add('focused');
    if (!fromMouse) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!silent) this.audio.sfx('hover', 0.6);
    if (this.screen && this.screen.onFocus) this.screen.onFocus(el);
  }
  refocus() { // after a view re-render
    const items = this.items();
    if (!items.includes(this.cur)) { this.cur = null; const f = this.root.querySelector('[data-autofocus]') || items[0]; if (f) this.focus(f, true); }
  }
  move(dir) {
    const items = this.items();
    if (!items.length) return;
    if (!this.cur || !items.includes(this.cur)) { this.focus(items[0], true); return; }
    const a = this.cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of items) {
      if (el === this.cur) continue;
      const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      let prim, sec;
      if (dir === 'left') { prim = -dx; sec = Math.abs(dy); } else if (dir === 'right') { prim = dx; sec = Math.abs(dy); }
      else if (dir === 'up') { prim = -dy; sec = Math.abs(dx); } else { prim = dy; sec = Math.abs(dx); }
      if (prim < 4) continue;
      const s = prim + sec * 2.2;
      if (s < bs) { bs = s; best = el; }
    }
    if (best) this.focus(best);
  }
  handle(a) {
    if (!this.root) return;
    const c = this.cur;
    switch (a) {
      case 'accept': if (c && !c.disabled) { this.audio.sfx('click', 0.7); c.click(); } break;
      case 'back': this.router.back(); break;
      case 'left': case 'right':
        if (c && c._adjust) { c._adjust(a === 'right' ? 1 : -1); this.audio.sfx('hover', 0.7); } else this.move(a);
        break;
      case 'up': case 'down': this.move(a); break;
      case 'prev': case 'next': if (this.screen && this.screen.onTab) this.screen.onTab(a === 'next' ? 1 : -1); break;
    }
  }
}
