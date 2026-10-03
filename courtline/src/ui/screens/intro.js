// Studio splash and title screen ("Press any button").
import { h } from '../../core/util.js';

function lantern() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'studio-mark'); s.setAttribute('viewBox', '0 0 64 64');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', '#ff7a1a'); s.setAttribute('stroke-width', '3'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = '<path d="M24 12h16M28 12V8h8v4M20 18h24l-3 30H23zM32 18v30M25 56h14"/><circle cx="32" cy="33" r="5" fill="#ff7a1a" stroke="none"/>';
  return s;
}

export function splashScreen(params, ctx) {
  let t = 0, born = performance.now(), off;
  const mark = lantern();
  const el = h('div', { class: 'center' },
    h('div', null,
      mark,
      h('div', { class: 'studio' }, 'LANTERN ', h('b', null, 'PEAK'), ' GAMES')));
  const go = () => ctx.router.go('title');
  return {
    el, noNav: true, ticker: false,
    onShow() {
      t = setTimeout(go, 2600);
      off = ctx.input.on('any', () => { if (performance.now() - born > 500) go(); });
    },
    dispose() { clearTimeout(t); off && off(); },
  };
}

export function titleScreen(params, ctx) {
  let off, born = performance.now(), fired = false;
  const el = h('div', { class: 'center' },
    h('div', null,
      h('div', { class: 'logo' }, 'COURTLINE'),
      h('div', { class: 'logo-sub' }, 'Pro Basketball'),
      h('div', { class: 'press', id: 'pressAny' }, 'Press any button')));
  return {
    el, noNav: true, ticker: false,
    onShow() {
      off = ctx.input.on('any', () => {
        if (fired || performance.now() - born < 500) return;
        fired = true;
        ctx.actions.enterMenu();
      });
    },
    setWaiting(w) { el.querySelector('#pressAny').textContent = w ? 'Loading…' : 'Press any button'; },
    dispose() { off && off(); },
  };
}
