// createLeague(): generate in a module Worker; if workers are unavailable (file://, old browsers), fall back to
// running the same generator one slice per animation frame so the UI keeps animating.
import { leagueSteps } from './generate.js';

function chunked(seed, onProgress) {
  return new Promise((resolve, reject) => {
    const g = leagueSteps(seed);
    const tick = () => {
      try {
        const t0 = performance.now();
        for (;;) {
          const r = g.next();
          if (r.done) return resolve(r.value);
          onProgress(r.value);
          if (performance.now() - t0 > 5) break;
        }
        requestAnimationFrame(tick);
      } catch (e) { reject(e); }
    };
    requestAnimationFrame(tick);
  });
}

export function createLeague(seed, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch (e) { chunked(seed, onProgress).then(resolve, reject); return; }
    let finished = false;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m);
      else if (m.type === 'done') { finished = true; w.terminate(); resolve(m.league); }
      else if (m.type === 'error') { finished = true; w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = () => { if (!finished) { finished = true; w.terminate(); chunked(seed, onProgress).then(resolve, reject); } };
    w.postMessage({ seed });
  });
}
