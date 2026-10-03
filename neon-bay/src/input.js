// Keyboard / mouse input with edge detection and pointer lock.
export function createInput(G) {
  const I = { keys: new Set(), edge: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, wheel: 0, locked: false };
  I.down = (...c) => c.some(k => I.keys.has(k)); I.pressed = c => I.edge.has(c);
  const GAME = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  addEventListener('keydown', e => {
    if (G.state !== 'play') return; if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; if (GAME.has(e.code)) e.preventDefault(); if (e.repeat) return;
    I.keys.add(e.code); I.edge.add(e.code);
  });
  addEventListener('keyup', e => { I.keys.delete(e.code); });
  addEventListener('blur', () => { I.keys.clear(); I.lmb = I.rmb = false; });
  const cv = document.getElementById('gl');
  addEventListener('mousedown', e => { if (G.state !== 'play' || G.paused) return; if (!I.locked && cv.requestPointerLock) { try { cv.requestPointerLock(); } catch (err) { /* lock unavailable */ } if (e.button === 0) return; } if (e.button === 0) { I.lmb = true; I.lmbPressed = true; } if (e.button === 2) { I.rmb = true; I.rmbPressed = true; } });
  addEventListener('mouseup', e => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
  addEventListener('contextmenu', e => { if (G.state === 'play') e.preventDefault(); });
  addEventListener('mousemove', e => { if (I.locked || (I.rmb && G.state === 'play' && !G.paused)) { I.mdx += e.movementX; I.mdy += e.movementY; } });
  addEventListener('wheel', e => { if (G.state === 'play' && !G.paused) I.wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === cv; if (!I.locked && G.state === 'play' && !G.paused && G.onLockLost) G.onLockLost(); });
  I.frameEnd = () => { I.edge.clear(); I.mdx = 0; I.mdy = 0; I.lmbPressed = false; I.rmbPressed = false; I.wheel = 0; };
  I.release = () => { if (document.pointerLockElement) document.exitPointerLock(); I.keys.clear(); I.lmb = I.rmb = false; };
  return I;
}
