// Screen router: a stack of screens with GPU-friendly (opacity/transform) transitions and a device-aware prompt bar.
// Screen factory: (params, ctx) => { el, onShow?, onBack?, onTab?, onFocus?, dispose?, prompts?, noNav?, ticker? }
import { h } from '../core/util.js';
import { glyphs } from './components.js';

export class Router {
  constructor(host, nav, audio, input, promptsEl, ctx) {
    this.host = host; this.nav = nav; this.audio = audio; this.input = input; this.promptsEl = promptsEl; this.ctx = ctx;
    this.reg = new Map(); this.stack = [];
    nav.router = this;
    input.on('device', () => this.renderPrompts());
  }
  register(id, factory) { this.reg.set(id, factory); }
  get top() { return this.stack[this.stack.length - 1]; }
  _mount(id, params) {
    const f = this.reg.get(id);
    if (!f) throw new Error('Unknown screen: ' + id);
    const scr = f(params || {}, this.ctx);
    scr.id = id;
    scr.el.classList.add('screen', 'pre');
    this.host.appendChild(scr.el);
    return scr;
  }
  _leave(scr, keep) {
    scr.el.classList.add('out');
    scr._t = setTimeout(() => { if (keep) scr.el.classList.add('gone'); else { scr.dispose && scr.dispose(); scr.el.remove(); } }, 240);
  }
  _enter(scr) {
    clearTimeout(scr._t);
    scr.el.classList.remove('gone'); void scr.el.offsetWidth;
    scr.el.classList.remove('pre', 'out');
    this.input.navEnabled = !scr.noNav;
    this.nav.setRoot(scr.el, scr);
    this.ctx.state.emit('screen', scr.id);
    document.getElementById('ticker').classList.toggle('hidden', scr.ticker === false);
    this.renderPrompts();
    scr.onShow && scr.onShow();
  }
  go(id, params) {
    const old = this.stack.slice(); this.stack = [];
    for (const o of old) this._leave(o, false);
    const scr = this._mount(id, params); this.stack.push(scr); this._enter(scr);
    return scr;
  }
  push(id, params) {
    const t = this.top; if (t) this._leave(t, true);
    const scr = this._mount(id, params); this.stack.push(scr); this._enter(scr);
    return scr;
  }
  pop() {
    if (this.stack.length < 2) return false;
    this._leave(this.stack.pop(), false);
    this._enter(this.top);
    return true;
  }
  back() {
    const t = this.top;
    if (!t) return;
    if (t.onBack && t.onBack()) { this.audio.sfx('back', 0.7); return; }
    if (this.pop()) this.audio.sfx('back', 0.7);
  }
  renderPrompts() {
    const t = this.top, g = glyphs(this.input.device);
    this.promptsEl.textContent = '';
    if (!t || t.noNav) return;
    const list = t.prompts || [['move', 'Move'], ['accept', 'Select'], ['back', 'Back']];
    for (const [k, label] of list) this.promptsEl.append(h('span', null, h('b', { class: 'kbd' }, g[k] || k), label));
  }
}
