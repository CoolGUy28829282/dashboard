// Unified input: keyboard, mouse and gamepad. Menu navigation events plus gameplay action state with an input buffer.
// Key events stamp their time directly in the handler, so a press registers on the very next frame.
import { Emitter } from './util.js';
import { ACTIONS } from './settings.js';

const NAV_KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back', KeyQ: 'prev', PageUp: 'prev', KeyE: 'next', PageDown: 'next',
};
const PAD_NAV = { 0: 'accept', 1: 'back', 4: 'prev', 5: 'next', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DEAD = 0.22;

export class Input extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.device = 'kb';
    this.navEnabled = true;
    this.count = ACTIONS.length;
    this.down = new Uint8Array(this.count);
    this.pressedAt = new Float64Array(this.count);
    this.consumed = new Uint8Array(this.count);
    this.mx = 0; this.my = 0; // movement vector (-1..1)
    this.codeMap = new Map();
    this.padMap = new Map();
    this.prevBtn = new Uint8Array(32);
    this.pads = 0;
    this.repeatAt = 0; this.heldDir = '';
    this._capture = null;
    this._mx = 0; this._my = 0;
    this.keys = new Set();
    this._rebuild();
    settings.on('bindings', () => this._rebuild());
  }
  _rebuild() {
    this.codeMap.clear(); this.padMap.clear();
    ACTIONS.forEach((a, i) => {
      this.codeMap.set(this.settings.bind.kb[a.id], i);
      let l = this.padMap.get(this.settings.bind.pad[a.id]);
      if (!l) this.padMap.set(this.settings.bind.pad[a.id], (l = []));
      l.push(i);
    });
  }
  attach() {
    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    addEventListener('pointermove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 1 || e.pointerType !== 'mouse') this._dev('mouse'); }, { passive: true });
    addEventListener('pointerdown', () => { this._dev('mouse'); this.emit('any'); }, { passive: true });
    addEventListener('gamepadconnected', () => { this.pads++; });
    addEventListener('gamepaddisconnected', () => { this.pads = Math.max(0, this.pads - 1); });
    addEventListener('blur', () => { this.down.fill(0); this.keys.clear(); this._mx = this._my = 0; });
  }
  _dev(d) { if (this.device !== d) { this.device = d; this.emit('device', d); } }

  /** Ask for the next key press (kind 'kb') or pad button ('pad'). cb(code|null). Escape cancels. */
  capture(kind, cb) { this._capture = { kind, cb }; }
  cancelCapture() { this._capture = null; }

  _key(e, isDown) {
    if (isDown && this._capture && this._capture.kind === 'kb') {
      e.preventDefault();
      const c = this._capture; this._capture = null;
      c.cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number');
    if (isDown) {
      this._dev('kb');
      if (!e.repeat) this.emit('any');
      if (this.navEnabled && !(typing && e.code !== 'Escape' && e.code !== 'Enter')) {
        const n = NAV_KEYS[e.code];
        if (n) {
          e.preventDefault();
          this.emit('nav', n);
        }
      }
      if (e.code === 'F3') { e.preventDefault(); this.emit('hotkey', 'perf'); }
      if (e.code === 'F4') { e.preventDefault(); this.emit('hotkey', 'perfReset'); }
    }
    if (typing) return;
    if (isDown) this.keys.add(e.code); else this.keys.delete(e.code);
    const idx = this.codeMap.get(e.code);
    if (idx !== undefined) {
      if (isDown && !this.down[idx]) { this.pressedAt[idx] = e.timeStamp; this.consumed[idx] = 0; }
      this.down[idx] = isDown ? 1 : 0;
    }
    this._moveKeys();
  }
  _moveKeys() {
    const k = this.keys;
    this._mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this._my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  }
  /** True once if `action` was pressed within the last `windowMs` (input buffer for slightly-early presses). */
  consume(actionIndex, windowMs, now) {
    if (this.consumed[actionIndex]) return false;
    if (now - this.pressedAt[actionIndex] <= windowMs) { this.consumed[actionIndex] = 1; return true; }
    return false;
  }

  /** Polled once per rendered frame. navigator.getGamepads() is only called while a pad is connected. */
  poll(now) {
    let mx = this._mx, my = this._my;
    if (this.pads > 0) {
      const list = navigator.getGamepads ? navigator.getGamepads() : null;
      let pad = null;
      if (list) for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { pad = list[i]; break; }
      if (pad) {
        const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        const mag = Math.hypot(ax, ay);
        if (mag > DEAD) { const s = (mag - DEAD) / (1 - DEAD) / mag; mx = ax * s; my = ay * s; this._dev('pad'); }
        const b = pad.buttons;
        for (let i = 0; i < b.length && i < 32; i++) {
          const pr = b[i].pressed ? 1 : 0;
          if (pr !== this.prevBtn[i]) {
            this.prevBtn[i] = pr;
            if (pr) this._padPress(i, now);
            const acts = this.padMap.get(i);
            if (acts) for (const a of acts) { if (pr) { this.pressedAt[a] = now; this.consumed[a] = 0; } this.down[a] = pr; }
          }
        }
        // stick / d-pad menu repeat
        let dir = '';
        if (b[12] && b[12].pressed) dir = 'up'; else if (b[13] && b[13].pressed) dir = 'down'; else if (b[14] && b[14].pressed) dir = 'left'; else if (b[15] && b[15].pressed) dir = 'right';
        else if (mag > 0.6) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
        if (dir !== this.heldDir) {
          this.heldDir = dir;
          if (dir) { this.repeatAt = now + 380; if (this.navEnabled && !this._capture) this.emit('nav', dir); }
        } else if (dir && now >= this.repeatAt) {
          this.repeatAt = now + 110;
          if (this.navEnabled && !this._capture) this.emit('nav', dir);
        }
      }
    }
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    this.mx = mx; this.my = my;
  }
  _padPress(i, now) {
    this._dev('pad');
    if (this._capture && this._capture.kind === 'pad') { const c = this._capture; this._capture = null; c.cb(i === 9 ? null : i); return; }
    this.emit('any');
    const n = PAD_NAV[i];
    if (n && this.navEnabled && !this._capture) this.emit('nav', n);
  }
}
