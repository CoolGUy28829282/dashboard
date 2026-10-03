// League generation off the main thread.
import { generateLeague } from './generate.js';

self.onmessage = (e) => {
  try {
    const league = generateLeague(e.data.seed, (p) => self.postMessage({ type: 'progress', ...p }));
    self.postMessage({ type: 'done', league });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
