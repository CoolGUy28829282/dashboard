// Persistence: IndexedDB (profile, ranked data, settings) with an in-memory fallback when IndexedDB is unavailable.
const DB_NAME = 'hoops27-neon-era', STORE = 'kv';
const mem = new Map();
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
export async function dbGet(key, fallback = null) {
  const db = await open();
  if (!db) return mem.has(key) ? structuredClone(mem.get(key)) : fallback;
  return new Promise((resolve) => { try { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result ?? fallback); r.onerror = () => resolve(fallback); } catch { resolve(fallback); } });
}
export async function dbSet(key, value) {
  const db = await open(); mem.set(key, structuredClone(value));
  if (!db) return;
  return new Promise((resolve) => { try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch { resolve(); } });
}
export async function dbClear() {
  mem.clear(); const db = await open(); if (!db) return;
  return new Promise((resolve) => { try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch { resolve(); } });
}
