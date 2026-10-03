/*
 * COURTLINE — Pro Basketball (browser, Three.js, no external assets)
 * ---------------------------------------------------------------------------------------------------------
 * CHANGELOG
 *  Phase 1  Game shell                                                                         [complete]
 *           - Boot flow: studio splash -> title ("Press any button") -> main menu, loading screens with tips + progress
 *           - Main menu: tile layout over a live 3D arena (a league player shoots; solved with the real ball model,
 *             slow critically-damped orbit camera, ambient crowd/arena sound, procedural menu music), league news ticker
 *           - Settings: gameplay, controls (full kb + pad remap), camera, graphics (presets + individual), audio,
 *             accessibility & HUD. Every option saves and applies instantly. Controls guide screen.
 *           - Save system: IndexedDB (localStorage fallback), 5 slots + autosave, export/import JSON
 *           - League generation (Web Worker, chunked fallback): 30 teams / 2 conferences, 15-man rosters, 450 players,
 *             logos, 3 uniforms each, unique arenas, ratings, tendencies, contracts; talent distributed like a pro league
 *           - Smoothness infrastructure: fixed 120 Hz step + interpolated render, clamped gaps, hidden-tab pause,
 *             frame cap incl. 120/144 Hz, adaptive resolution, shader/texture warm-up at load, pooled audio voices,
 *             performance overlay (F3 or Settings > Graphics)
 *  Phase 2+ Not started (tiles show as locked): Gym, Play Now, Streetball, Career, Franchise, Team Builder, Creator, Stats.
 *
 * KNOWN ISSUES
 *  - Floor reflections are environment-based gloss; planar mirror reflections arrive with broadcast presentation (Phase 5).
 *  - Menu shooter always scores (rim/backboard collision, torus rim and cloth net are Phase 2).
 *  - Foot planting uses a distance-driven stride with analytic IK, not full ground-contact solving (Phase 3).
 *  - Anti-aliasing changes rebuild the renderer, which takes a brief moment.
 *  - Web Audio node creation per sound is unavoidable; voices are capped and gain nodes are pooled.
 *
 * ARCHITECTURE (see README.md): core/ (loop, settings, input, audio, save, quality, perf, state) · league/ (generator, worker,
 * logos, news) · game/ (court, ball physics) · gfx/ (renderer, humanoid, menu arena) · ui/ (router, focus nav, screens).
 */
import { Settings } from './core/settings.js';
import { GameState } from './core/state.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { Perf } from './core/perf.js';
import { Quality } from './core/quality.js';
import { createLoop } from './core/loop.js';
import { save, SLOTS } from './core/save.js';
import { Gfx } from './gfx/gfx.js';
import { MenuArena } from './gfx/menuArena.js';
import { createLeague } from './league/api.js';
import { Nav } from './ui/nav.js';
import { Router } from './ui/router.js';
import { Loading, toast } from './ui/components.js';
import { splashScreen, titleScreen } from './ui/screens/intro.js';
import { menuScreen } from './ui/screens/menu.js';
import { settingsScreen, controlsScreen } from './ui/screens/settings.js';
import { leagueScreen } from './ui/screens/league.js';
import { gymScreen } from './ui/screens/gym.js';
import { h } from './core/util.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

async function main() {
  const settings = new Settings();
  const state = new GameState();
  const audio = new AudioEngine(settings);
  const input = new Input(settings);
  const perf = new Perf($('perf'), $('fps'));
  const gfx = new Gfx($('stage'), settings);
  const loading = new Loading();
  const nav = new Nav(input, audio);
  const quality = new Quality(gfx, settings);
  const ctx = { settings, state, audio, input, nav, gfx, loading, save, perf, scene: null, actions: {} };
  const router = new Router($('ui'), nav, audio, input, $('prompts'), ctx);
  ctx.router = router;
  ctx.scene = gfx.available ? new MenuArena(settings, audio) : { featured: null };

  router.register('splash', splashScreen);
  router.register('title', titleScreen);
  router.register('menu', menuScreen);
  router.register('settings', settingsScreen);
  router.register('controls', controlsScreen);
  router.register('league', leagueScreen);
  router.register('gym', gymScreen);
  router.register('error', (p) => ({
    el: h('div', { class: 'center' }, h('div', { class: 'panel err' }, h('h1', { class: 'h1' }, p.title), h('p', { class: 'dim' }, p.message),
      h('button', { class: 'btn primary', 'data-nav': '', 'data-autofocus': '', onClick: () => location.reload() }, 'Reload'))),
    ticker: false,
  }));
  input.attach();

  // ---------- settings -> live effects ----------
  let aaTimer = 0;
  const extra = { scale: 1, dpr: 1, refresh: 0, cap: 0 };
  function applySetting(k) {
    const v = settings.get(k);
    switch (k) {
      case 'colorblind': if (v === 'off') delete root.dataset.cb; else root.dataset.cb = v; break;
      case 'textSize': root.style.setProperty('--ts', v); break;
      case 'reduceMotion': if (v) root.dataset.rm = ''; else delete root.dataset.rm; break;
      case 'volMaster': case 'volMusic': case 'volSfx': case 'volCrowd': case 'volVoice': audio.applyVolumes(); break;
      case 'resScale': gfx.resize(); break;
      case 'shadows': gfx.applyAll(); if (gfx.available) ctx.scene.applyGraphics(); break;
      case 'reflections': case 'crowd': if (gfx.available) ctx.scene.applyGraphics(); break;
      case 'post': gfx.applyAll(); $('vignette').classList.toggle('on', !!v); break;
      case 'aa':
        clearTimeout(aaTimer);
        aaTimer = setTimeout(async () => {
          if (!gfx.available) return;
          loading.show('Applying anti-aliasing'); loading.set(0.3, 'Rebuilding the renderer');
          try {
            gfx.recreate(); loading.set(0.6, 'Compiling shaders');
            if (gfx.renderer) { ctx.scene.applyGraphics(); await ctx.scene.warm(gfx.renderer); }
          } catch (e) { toast('Could not rebuild the renderer: ' + e.message); }
          loading.set(1, ''); loading.hide();
        }, 250);
        break;
      case 'fpsCap': loop.setCap(v); break;
      case 'fpsCounter': perf.setMini(!!v); break;
      case 'perfOverlay': perf.setEnabled(!!v); break;
    }
  }
  settings.on('change', applySetting);
  settings.on('bindings', () => {});
  input.on('hotkey', (h2) => {
    if (h2 === 'perf') settings.set('perfOverlay', !settings.get('perfOverlay'));
    else if (h2 === 'perfReset') perf.resetSpikes();
  });
  state.on('screen', (id) => { if (ctx.scene && 'shiftTarget' in ctx.scene) ctx.scene.shiftTarget = id === 'menu' ? 0.28 : 0; });
  input.on('any', () => { if (!audio.ctx || audio.ctx.state !== 'running') audio.unlock(); });

  // ---------- frame loop ----------
  const loop = createLoop({
    begin: () => perf.begin(),
    step: (dt) => gfx.step(dt),
    render: (alpha, dt) => { input.poll(performance.now()); gfx.render(alpha, dt); },
    end: (gap) => {
      perf.info = gfx.info; extra.scale = gfx.dyn; extra.dpr = gfx.pr; extra.refresh = quality.refresh; extra.cap = settings.get('fpsCap'); perf.extra = extra;
      perf.end(gap);
      quality.update(performance.now(), gap, perf.lastWork, loop.capMs);
    },
  });
  for (const k of ['colorblind', 'textSize', 'reduceMotion', 'post', 'fpsCap', 'fpsCounter', 'perfOverlay']) applySetting(k);
  if (!gfx.available) $('stage').style.background = 'radial-gradient(ellipse at 50% 30%,#14213d,#05070d)';

  // ---------- save / league actions ----------
  const fail = (e) => { audio.sfx('error', 0.7); toast((e && e.message) || String(e)); };
  const download = (name, text) => {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  const adopt = (league, news) => {
    state.setLeague(league, news);
    if (gfx.available && ctx.scene.setFeatured && gfx.active) { ctx.scene.setFeatured(league); ctx.scene.applyGraphics(); }
  };
  const A = ctx.actions;
  A.autosave = async () => {
    if (!state.league || !state.dirty) return;
    state.dirty = false;
    try { await save.write('auto', state.meta('Autosave'), state.snapshot()); } catch (e) { state.dirty = true; }
  };
  A.newLeague = async (seed) => {
    loading.show('Generating league');
    try {
      const league = await createLeague(seed, (m) => loading.set(m.p, m.label));
      adopt(league, []);
      state.slot = null;
      state.postNews(`A new league begins: ${league.teams.length} franchises, ${league.players.length} players, seed ${league.seed}`);
      await A.autosave();
      toast('League generated');
    } catch (e) { fail(e); }
    loading.hide();
  };
  A.saveSlot = async (slot) => {
    try { state.postNews(`Game saved to slot ${slot.slice(4)}`); await save.write(slot, state.meta(), state.snapshot()); state.slot = slot; toast('Saved to slot ' + slot.slice(4)); audio.sfx('confirm', 0.7); } catch (e) { fail(e); }
  };
  A.loadSlot = async (slot) => {
    loading.show('Loading save');
    try {
      loading.set(0.3, 'Reading save');
      const rec = await save.read(slot);
      if (!rec || !rec.league) throw new Error('That slot is empty.');
      loading.set(0.7, 'Dressing the arena');
      adopt(rec.league, rec.news || []); state.slot = slot;
      state.postNews(slot === 'auto' ? 'Autosave loaded' : `Save slot ${slot.slice(4)} loaded`);
      toast('Save loaded');
    } catch (e) { fail(e); }
    loading.hide();
  };
  A.deleteSlot = async (slot) => { try { await save.remove(slot); toast('Save deleted'); } catch (e) { fail(e); } };
  A.exportSlot = async (slot) => { try { download(`courtline-${slot}.json`, await save.exportSlot(slot)); toast('Save exported'); } catch (e) { fail(e); } };
  A.importFile = async (file) => {
    try {
      const { meta, data } = save.parseImport(await file.text());
      const all = await save.list();
      const target = (all.find((x) => x.slot !== 'auto' && !x.meta) || { slot: 'slot5' }).slot;
      await save.write(target, meta || state.meta('Imported'), data);
      adopt(data.league, data.news || []); state.slot = target;
      state.postNews(`Imported save loaded into slot ${target.slice(4)}`);
      toast('Imported into slot ' + target.slice(4));
    } catch (e) { fail(e); }
  };
  setInterval(() => { if (!document.hidden) A.autosave(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) A.autosave(); });

  // ---------- ticker ----------
  const track = $('tickerTrack');
  const renderTicker = () => {
    const items = state.tickerItems();
    track.textContent = '';
    for (let rep = 0; rep < 2; rep++) for (const t of items) track.append(h('span', null, t));
    const chars = items.reduce((s, t) => s + t.length, 0);
    track.style.setProperty('--dur', Math.max(30, chars * 0.17) + 's');
  };
  state.on('news', renderTicker);

  // ---------- boot ----------
  let bootDone = false, bootError = null, bootP = 0, bootLabel = 'Starting';
  const prog = (p, label) => { bootP = p; bootLabel = label; if (loading.visible) loading.set(p, label); };
  const boot = (async () => {
    await save.init();
    prog(0.02, 'Opening save storage');
    let league = null, news = [], fresh = false;
    try { const rec = await save.read('auto'); if (rec && rec.league && Array.isArray(rec.league.teams)) { league = rec.league; news = rec.news || []; state.slot = 'auto'; } } catch (e) { /* unreadable autosave: generate a fresh league */ }
    if (!league) {
      fresh = true;
      league = await createLeague(Date.now() % 1000000000, (m) => prog(0.03 + 0.35 * m.p, m.label));
    }
    state.setLeague(league, news);
    state.postNews(fresh ? `${league.name} ${league.season.label} tips off: ${league.teams.length} teams, ${league.players.length} players` : 'Welcome back: autosave loaded');
    if (fresh) await A.autosave();
    await audio.prepare((p) => prog(0.4 + 0.2 * p, 'Synthesising sound'));
    if (gfx.available) {
      await ctx.scene.build(gfx, league, (p) => prog(0.6 + 0.3 * p, 'Building the arena'));
      gfx.setActive(ctx.scene);
      prog(0.92, 'Compiling shaders');
      await ctx.scene.warm(gfx.renderer);
    } else toast('WebGL is unavailable: menus work, the 3D background is off.');
    prog(1, 'Ready');
    bootDone = true;
  })().catch((e) => { bootError = e; console.error(e); });

  A.enterMenu = async () => {
    audio.unlock();
    if (!bootDone) {
      loading.show('Getting the arena ready'); loading.set(bootP, bootLabel);
      await boot;
      loading.hide();
    }
    if (bootError) { router.go('error', { title: 'Could not start', message: String((bootError && bootError.message) || bootError) }); return; }
    audio.sfx('confirm', 0.8);
    router.go('menu');
  };

  window.__courtline = { ctx, perf, loop, quality }; // handy for the console and automated checks
  router.go('splash');
  loop.start();
}

main().catch((e) => {
  console.error(e);
  document.getElementById('ui').append(h('div', { class: 'center' }, h('div', { class: 'panel err' }, h('h1', { class: 'h1' }, 'Courtline could not start'), h('p', { class: 'dim' }, String((e && e.message) || e)))));
});
