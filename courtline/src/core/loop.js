// Frame pacing: fixed 120 Hz simulation, rendering interpolated between the last two steps.
// Large gaps (tab switch, debugger) are clamped; the loop fully stops while the tab is hidden.
export const FIXED_DT = 1 / 120;
const MAX_FRAME = 0.05; // at most 6 catch-up steps

export function createLoop({ step, render, begin, end }) {
  let raf = 0, last = -1, acc = 0, capMs = 0, running = false, lastRender = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (capMs > 0 && now - lastRender < capMs - 1.5) return; // frame-capped: skip, keep accumulating
    if (last < 0) { last = now; lastRender = now; return; }
    begin(now);
    let dt = (now - last) / 1000;
    const gap = now - lastRender;
    last = now; lastRender = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    else if (dt < 0) dt = 0;
    acc += dt;
    while (acc >= FIXED_DT) { step(FIXED_DT); acc -= FIXED_DT; }
    render(acc / FIXED_DT, dt);
    end(gap);
  }
  const api = {
    start() { if (running) return; running = true; last = -1; acc = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setCap(fps) { capMs = fps > 0 ? 1000 / fps : 0; },
    get capMs() { return capMs; },
    get running() { return running; },
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (running) cancelAnimationFrame(raf); }
    else if (running) { last = -1; acc = 0; raf = requestAnimationFrame(frame); }
  });
  return api;
}
