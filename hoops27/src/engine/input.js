// Input: keyboard, mouse and Gamepad API (Xbox/PlayStation), with rebinding, dead-zones, shot-stick mode, gesture-based dribble moves
// (flick, diagonal, circle) and rumble. Writes into each human's `intent` object; the game clears edge flags after every logic tick.
import { clearEdges } from '../gameplay/game.js';

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', shoot: 'KeyE', pass: 'KeyF', lob: 'KeyU', pump: 'KeyZ', hesitate: 'KeyC',
  stepback: 'KeyL', switch: 'KeyQ', steal: 'KeyR', post: 'KeyV', callBall: 'KeyG', pick: 'KeyT', pause: 'Escape', camera: 'Tab', replaySkip: 'Space',
  rUp: 'ArrowUp', rDown: 'ArrowDown', rLeft: 'ArrowLeft', rRight: 'ArrowRight', play1: 'Digit1', play2: 'Digit2', play3: 'Digit3', play4: 'Digit4', play5: 'Digit5',
};
export const P2_KEYS = { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', sprint: 'ShiftRight', shoot: 'Period', pass: 'Comma', lob: 'KeyM', pump: 'KeyN', hesitate: 'KeyH', stepback: 'KeyB', switch: 'KeyO', steal: 'Slash', post: 'Semicolon', callBall: 'KeyP', pick: 'Quote', rUp: 'Numpad8', rDown: 'Numpad5', rLeft: 'Numpad4', rRight: 'Numpad6' };
export const PAD_ACTIONS = ['shoot', 'pass', 'lob', 'stepback', 'callBall', 'pump', 'sprint', 'post', 'camera', 'pause'];
export const PAD_DEFAULT = { shoot: 2, pass: 0, lob: 3, stepback: 1, callBall: 4, pump: 5, sprint: 7, post: 6, pause: 9, camera: 8, play1: 12, play2: 13, play3: 14, play4: 15 }; // standard mapping indices
export const ACTION_LABEL = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', sprint: 'Sprint', shoot: 'Shoot / block', pass: 'Pass', lob: 'Lob pass / block', pump: 'Pump fake', hesitate: 'Hesitation / take charge', stepback: 'Step-back', switch: 'Switch player', steal: 'Steal / shoot', post: 'Post-up', callBall: 'Call for ball', pick: 'Call screen', pause: 'Pause', camera: 'Cycle camera', replaySkip: 'Skip replay', rUp: 'Shot stick / dribble up', rDown: 'Dribble down', rLeft: 'Dribble left', rRight: 'Dribble right' };
export const padLabels = (id = '') => (/054c|dualshock|dualsense|playstation|wireless controller/i.test(id) ? { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Share', 9: 'Options' } : { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu' });

const dz = (v, d) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));
const SECTORS = 8;
const sectorOf = (x, y) => { const a = Math.atan2(x, -y); return ((Math.round(a / (Math.PI / 4)) % SECTORS) + SECTORS) % SECTORS; }; // 0=N, 1=NE, 2=E, ... clockwise
const DIAG = new Set([1, 3, 5, 7]);

export class Input {
  constructor(settings, bus) {
    this.s = settings; this.bus = bus; this.appBus = bus; this.keys = new Set(); this.pressedOnce = new Set(); this.game = null; this.view = null; this.mouseDown = false;
    this.pads = []; this.padPrev = new Map(); this.listeners = []; this.lastPadId = ''; this.rebinding = null; this.menuHandlers = new Set(); this.humanState = new Map();
    this.on(window, 'keydown', (e) => this.keydown(e)); this.on(window, 'keyup', (e) => this.keyup(e));
    this.on(window, 'mousedown', (e) => { if (e.button === 0 && !e.target.closest?.('button, .panel, input')) { this.mouseDown = true; this.mouseEdge = 'down'; } });
    this.on(window, 'mouseup', (e) => { if (e.button === 0 && this.mouseDown) { this.mouseDown = false; this.mouseEdge = 'up'; } });
    this.on(window, 'blur', () => { this.keys.clear(); this.mouseDown = false; });
    this.on(window, 'gamepadconnected', (e) => { this.lastPadId = e.gamepad.id; this.bus.emit('padConnected', { id: e.gamepad.id }); });
  }
  on(t, ev, fn) { t.addEventListener(ev, fn); this.listeners.push(() => t.removeEventListener(ev, fn)); }
  dispose() { this.listeners.forEach((f) => f()); }
  keymap(h) { return h.device === 'kb2' ? { ...DEFAULT_KEYS, ...P2_KEYS } : { ...DEFAULT_KEYS, ...(this.s.controls?.keys ?? {}) }; }
  keydown(e) {
    if (this.rebinding) { e.preventDefault(); this.rebinding(e.code); return; }
    if (e.repeat) { if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.game) e.preventDefault(); return; }
    if (this.game && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code); this.pressedOnce.add(e.code);
    for (const f of this.menuHandlers) f('key', e.code, e);
    if (!this.game) return;
    for (const h of this.game.humans) { const km = this.keymap(h); if (h.device === 'pad0' || h.device === 'pad1') continue; this.keyAction(h, km, e.code, true); }
    if (e.code === 'F3') { e.preventDefault(); this.bus.emit('toggleDebug', {}); }
    if (e.code === 'KeyO') this.bus.emit('replayOrbit', {});
  }
  keyup(e) {
    this.keys.delete(e.code);
    if (!this.game) return;
    for (const h of this.game.humans) { const km = this.keymap(h); if (h.device === 'pad0' || h.device === 'pad1') continue; this.keyAction(h, km, e.code, false); }
  }
  /** Map a raw key to intent edges for one human. */
  keyAction(h, km, code, down) {
    const i = h.intent; const is = (a) => km[a] === code; const st = this.hs(h);
    const stickMode = (this.s.gameplay?.shotInput ?? 'button') === 'stick';
    if (down) {
      if (is('shoot')) { i.shootPressed = true; i.blockPressed = true; i.shootHeld = true; i.dunkMod = this.keys.has(km.sprint); }
      if (is('steal')) { i.stealPressed = true; if (!stickMode) { /* X is shoot on the pad; keyboard E is steal only */ } }
      if (is('pass')) { i.passPressed = true; i.passType = this.passType(h, 'chest'); }
      if (is('lob')) { i.passPressed = true; i.passType = 'lob'; i.blockPressed = true; }
      if (is('sprint') && this.s.gameplay?.sprintToggle) st.sprintToggle = !st.sprintToggle;
      if (is('pump')) i.pump = true;
      if (is('hesitate')) { i.dribbleMove = 'hesitate'; i.charge = true; }
      if (is('stepback')) i.dribbleMove = 'stepback';
      if (is('switch')) i.switchPressed = true;
      if (is('callBall')) i.callForBall = true;
      if (is('pause')) this.bus.emit('pauseToggle', {});
      if (is('camera')) this.bus.emit('cameraCycle', {});
      if (is('replaySkip')) this.bus.emit('replaySkip', {});
      for (let n = 1; n <= 5; n++) if (is('play' + n)) this.bus.emit('playCall', { index: n - 1, team: h.team });
      if (stickMode && is('rUp')) { i.shootPressed = true; i.blockPressed = true; i.shootHeld = true; }
    } else {
      if (is('shoot') || (stickMode && is('rUp'))) { i.shootHeld = false; i.shootReleased = true; }
    }
    st.arrows = { up: this.keys.has(km.rUp), down: this.keys.has(km.rDown), left: this.keys.has(km.rLeft), right: this.keys.has(km.rRight) };
  }
  passType(h, base) { const sprint = this.keys.has(this.keymap(h).sprint); return sprint ? 'nolook' : base; }
  hs(h) { let s = this.humanState.get(h); if (!s) { s = { seq: [], lastSector: -1, lastT: 0, rsHeld: false, lt: false, arrows: {} }; this.humanState.set(h, s); } return s; }

  /** Per-frame: continuous axes + gamepad edges + gesture detection. */
  poll(dt, t) {
    this.pads = (navigator.getGamepads?.() ?? []).filter(Boolean);
    this.pad = this.pads[0];
    if (this.rebindPad && this.pad) { const prev = this.padPrev.get(this.pad.index) ?? []; const n = this.pad.buttons.findIndex((b, k) => b.pressed && !prev[k]); this.padPrev.set(this.pad.index, this.pad.buttons.map((b) => b.pressed)); if (n >= 0) { const cb = this.rebindPad; this.rebindPad = null; cb(n); } return; }
    if (this.pad) this.lastPadId = this.pad.id;
    // menu navigation via pad (dpad / left stick / A / B)
    if (!this.game) this.menuPad();
    if (!this.game) { this.pressedOnce.clear(); return; }
    const g = this.game; const stickDz = this.s.controls?.deadzone ?? 0.15; const view = this.view; const PM = { ...PAD_DEFAULT, ...(this.s.controls?.pad ?? {}) }; const stickThr = 1 - 0.5 * (this.s.controls?.shotStickSens ?? 0.6);
    const fwd = view?.rig ? this.camForward(view.rig) : { x: 0, z: -1 }; const right = { x: -fwd.z, z: fwd.x };
    for (const h of g.humans) {
      const i = h.intent; const km = this.keymap(h); const st = this.hs(h);
      const padIndex = h.device === 'pad1' ? 1 : (h.device === 'pad0' || h.device === 'auto') ? 0 : -1;
      const pad = padIndex >= 0 ? this.pads[padIndex] : null;
      let sx = 0, sy = 0, rx = 0, ry = 0;
      if (h.device !== 'pad0' && h.device !== 'pad1') { sx += (this.keys.has(km.right) ? 1 : 0) - (this.keys.has(km.left) ? 1 : 0); sy += (this.keys.has(km.down) ? 1 : 0) - (this.keys.has(km.up) ? 1 : 0); rx += (this.keys.has(km.rRight) ? 1 : 0) - (this.keys.has(km.rLeft) ? 1 : 0); ry += (this.keys.has(km.rDown) ? 1 : 0) - (this.keys.has(km.rUp) ? 1 : 0); }
      let sprint = this.keys.has(km.sprint) && h.device !== 'pad0' && h.device !== 'pad1'; let post = this.keys.has(km.post); let handsUp = this.keys.has(km.sprint);
      if (pad) {
        const ax = dz(pad.axes[0] ?? 0, stickDz), ay = dz(pad.axes[1] ?? 0, stickDz); if (ax || ay) { sx = ax; sy = ay; }
        const bx = dz(pad.axes[2] ?? 0, stickDz), by = dz(pad.axes[3] ?? 0, stickDz); if (bx || by) { rx = bx; ry = by; }
        const prev = this.padPrev.get(pad.index) ?? [];
        const bp = (n) => !!pad.buttons[n]?.pressed; const edge = (n) => bp(n) && !prev[n]; const rel = (n) => !bp(n) && prev[n];
        sprint = sprint || bp(PM.sprint) || (PM.sprint === 7 && (pad.buttons[7]?.value ?? 0) > 0.4); post = post || bp(PM.post); handsUp = handsUp || bp(PM.sprint);
        const stickMode = (this.s.gameplay?.shotInput ?? 'button') === 'stick';
        if (edge(PM.shoot)) { i.shootPressed = true; i.stealPressed = true; i.shootHeld = true; i.dunkMod = bp(7); }
        if (rel(PM.shoot)) { i.shootHeld = false; i.shootReleased = true; }
        if (edge(PM.pass)) { i.passPressed = true; i.passType = bp(7) ? 'nolook' : 'chest'; }
        if (edge(PM.lob)) { st.lobT = t; }
        if (bp(PM.lob) && st.lobT !== undefined && t - st.lobT > 0.35) { i.pick = true; }            // hold = call a screen
        if (rel(PM.lob)) { if (st.lobT !== undefined && t - st.lobT <= 0.35) { i.passPressed = true; i.passType = 'lob'; i.blockPressed = true; } st.lobT = undefined; } // tap = lob / block
        if (edge(PM.stepback)) i.dribbleMove = 'stepback';
        if (edge(PM.sprint) && this.s.gameplay?.sprintToggle) st.sprintToggle = !st.sprintToggle;
        if (edge(PM.pump)) i.pump = true;
        if (edge(4)) { i.callForBall = true; i.switchPressed = true; }
        if (rel(6)) i.dribbleMove = i.dribbleMove ?? 'hesitate';
        if (bp(6)) i.charge = true;
        if (edge(PM.pause)) this.bus.emit('pauseToggle', {});
        if (edge(PM.camera)) this.bus.emit('cameraCycle', {});
        if (edge(0)) this.bus.emit('replaySkip', {});
        [12, 13, 14, 15].forEach((b, n) => { if (edge(b)) this.bus.emit('playCall', { index: n, team: h.team }); });
        if (stickMode) { const up = ry < -stickThr && Math.abs(rx) < 0.5; if (up && !st.rsUp) { i.shootPressed = true; i.stealPressed = true; i.shootHeld = true; } if (!up && st.rsUp) { i.shootHeld = false; i.shootReleased = true; } st.rsUp = up; }
        this.padPrev.set(pad.index, pad.buttons.map((b) => b.pressed));
      }
      // mouse = shot stick (hold to shoot, release to let go)
      if (h.device !== 'pad0' && h.device !== 'pad1' && h.device !== 'kb2') {
        if (this.mouseEdge === 'down') { i.shootPressed = true; i.blockPressed = true; i.shootHeld = true; }
        if (this.mouseEdge === 'up') { i.shootHeld = false; i.shootReleased = true; }
      }
      // movement relative to the camera
      const mag = Math.hypot(sx, sy); if (mag > 1) { sx /= mag; sy /= mag; }
      i.mx = right.x * sx + fwd.x * -sy; i.mz = right.z * sx + fwd.z * -sy;
      i.sprint = this.s.gameplay?.sprintToggle ? !!st.sprintToggle : sprint; i.pick = i.pick || this.keys.has(km.pick); i.handsUp = handsUp && !h.ctrl?.hasBall; i.post = post && !!h.ctrl?.hasBall; i.blockHeld = false;
      // aim for passes follows the left stick (camera relative) — assisted
      i.passAimX = i.mx; i.passAimZ = i.mz;
      // dribble gestures from the right stick / arrow keys (unless used as the shot stick)
      this.gestures(h, i, st, rx, ry, t);
      // the shot input can be a held key while the meter is running
      if (h.ctrl?.action?.kind && ['shoot', 'ft', 'layup', 'dunk'].includes(h.ctrl.action.kind) && !h.ctrl.action.released) { const km2 = km; i.shootHeld = i.shootHeld || this.keys.has(km2.shoot) || this.mouseDown || ((this.s.gameplay?.shotInput ?? 'button') === 'stick' && (this.keys.has(km2.rUp) || ry < -0.7)); }
      else if (!i.shootPressed) i.shootHeld = false;
    }
    this.mouseEdge = null; this.pressedOnce.clear();
  }
  camForward(rig) { const dx = rig.look.x - rig.pos.x, dz = rig.look.z - rig.pos.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; }
  gestures(h, i, st, rx, ry, t) {
    const stickMode = (this.s.gameplay?.shotInput ?? 'button') === 'stick';
    const mag = Math.hypot(rx, ry); const sector = mag > 0.6 ? sectorOf(rx, ry) : -1;
    if (sector !== st.lastSector) {
      if (sector >= 0) st.seq.push({ s: sector, t }); st.lastSector = sector; st.changeT = t;
      if (st.seq.length > 8) st.seq.shift();
    }
    // evaluate once the stick has settled for 120 ms or returned to centre
    if (st.seq.length && (t - (st.changeT ?? t) > 0.12 || sector < 0)) {
      const seq = st.seq.filter((e) => t - e.t < 0.6); st.seq = [];
      if (!seq.length) return;
      const secs = seq.map((e) => e.s);
      let turns = 0, dirSign = 0;
      for (let k = 1; k < secs.length; k++) { const d = (secs[k] - secs[k - 1] + 8) % 8, step = d > 4 ? d - 8 : d; if (step !== 0 && Math.abs(step) <= 2) { const sg = Math.sign(step); if (dirSign === 0 || sg === dirSign) { dirSign = sg; turns++; } } }
      if (secs.length >= 4 && turns >= 3) { i.dribbleMove = 'spin'; return; }
      const hasW = secs.some((x) => x === 6), hasE = secs.some((x) => x === 2);
      if (hasW && hasE) { i.dribbleMove = 'cross'; return; }
      if (secs.length === 1) {
        const s = secs[0]; if (stickMode && (s === 0)) return; // N = shot stick
        if (DIAG.has(s)) i.dribbleMove = 'behind'; else if (s === 4) i.dribbleMove = 'hesitate'; else if (s === 2 || s === 6) i.dribbleMove = 'cross';
      }
    }
  }
  /** Gamepad rumble: shots (light), contact (heavy), perfect releases (pulse). */
  rumble(strong = 0.3, weak = 0.3, ms = 120) {
    if (!this.s.controls?.vibration) return;
    const pad = this.pads[0]; const act = pad?.vibrationActuator; if (!act?.playEffect) return;
    try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* ignore */ }
  }
  menuPad() {
    const pad = this.pad; if (!pad) return; const prev = this.padPrev.get(pad.index) ?? []; const bp = (n) => !!pad.buttons[n]?.pressed;
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    const dirs = { up: bp(12) || ay < -0.6, down: bp(13) || ay > 0.6, left: bp(14) || ax < -0.6, right: bp(15) || ax > 0.6 };
    const pd = this.padDirPrev ?? {}; for (const k of Object.keys(dirs)) if (dirs[k] && !pd[k]) for (const f of this.menuHandlers) f('nav', k);
    this.padDirPrev = dirs;
    if (bp(0) && !prev[0]) for (const f of this.menuHandlers) f('nav', 'ok'); if (bp(1) && !prev[1]) for (const f of this.menuHandlers) f('nav', 'back');
    this.padPrev.set(pad.index, pad.buttons.map((b) => b.pressed));
  }
  /** Gameplay events (pause, camera, play calls...) go to the session's own bus while a match is attached. */
  attach(game, view, bus) { this.game = game; this.view = view; if (bus) this.bus = bus; }
  detach() { this.game = null; this.view = null; this.bus = this.appBus; }
}
void clearEdges;
