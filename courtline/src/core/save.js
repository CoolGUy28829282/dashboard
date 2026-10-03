// Save system: IndexedDB with localStorage fallback. Every call is wrapped; failures reject with a readable message.
// Two stores: `meta` (small, listed in menus) and `saves` (the full league), written in one transaction.
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
const DB_NAME = 'courtline', DB_VER = 1, LS = 'courtline.save.';
const FORMAT = 'courtline-save';

let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      if (!('indexedDB' in globalThis)) return res(null);
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => { r.result.createObjectStore('saves'); r.result.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted')); });

export const save = {
  backend: 'pending',
  async init() {
    const db = await openDB();
    this.backend = db ? 'IndexedDB' : 'localStorage';
    return this.backend;
  },
  /** Metadata for every slot: {slot, meta|null}. */
  async list() {
    const db = await openDB();
    const out = [];
    for (const slot of SLOTS) {
      let meta = null;
      try {
        if (db) meta = (await req(db.transaction('meta').objectStore('meta').get(slot))) || null;
        else { const s = localStorage.getItem(LS + 'meta.' + slot); meta = s ? JSON.parse(s) : null; }
      } catch (e) { meta = null; }
      out.push({ slot, meta });
    }
    return out;
  },
  async read(slot) {
    const db = await openDB();
    try {
      if (db) return (await req(db.transaction('saves').objectStore('saves').get(slot))) || null;
      const s = localStorage.getItem(LS + 'data.' + slot);
      return s ? JSON.parse(s) : null;
    } catch (e) { throw new Error('Could not read save: ' + (e.message || e)); }
  },
  async write(slot, meta, data) {
    const db = await openDB();
    try {
      if (db) {
        const t = db.transaction(['saves', 'meta'], 'readwrite');
        t.objectStore('saves').put(data, slot);
        t.objectStore('meta').put(meta, slot);
        await done(t);
      } else {
        localStorage.setItem(LS + 'data.' + slot, JSON.stringify(data));
        localStorage.setItem(LS + 'meta.' + slot, JSON.stringify(meta));
      }
    } catch (e) { throw new Error('Could not write save (storage full or blocked): ' + (e.message || e)); }
  },
  async remove(slot) {
    const db = await openDB();
    try {
      if (db) {
        const t = db.transaction(['saves', 'meta'], 'readwrite');
        t.objectStore('saves').delete(slot); t.objectStore('meta').delete(slot);
        await done(t);
      } else { localStorage.removeItem(LS + 'data.' + slot); localStorage.removeItem(LS + 'meta.' + slot); }
    } catch (e) { throw new Error('Could not delete save: ' + (e.message || e)); }
  },
  async exportSlot(slot) {
    const [data, all] = [await this.read(slot), await this.list()];
    if (!data) throw new Error('That slot is empty.');
    const meta = all.find((x) => x.slot === slot).meta;
    return JSON.stringify({ format: FORMAT, version: 1, exportedAt: Date.now(), meta, data });
  },
  /** Validates and returns {meta,data}; does not write. */
  parseImport(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!o || o.format !== FORMAT || !o.data || !o.data.league || !Array.isArray(o.data.league.teams) || !Array.isArray(o.data.league.players)) throw new Error('That file is not a Courtline save.');
    if (o.version > 1) throw new Error('That save was made by a newer version.');
    return { meta: o.meta || null, data: o.data };
  },
};
