// Shootaround screen: HUD only. The simulation lives in gfx/gym.js.
import { h, ovrColor } from '../../core/util.js';
import { Gym } from '../../gfx/gym.js';
import { btn } from '../components.js';

export function gymScreen(params, ctx) {
  const { router, state, settings } = ctx;
  const stats = h('div', { class: 'gym-stats mono' });
  const who = h('div', { class: 'gym-who dim' });
  const last = h('div', { class: 'gym-last panel' }, h('div', { class: 'dim' }, 'Take a shot. Hold to fill the meter, release in the green.'));
  const fill = h('i'), zone = h('b'), perfect = h('u');
  const meter = h('div', { class: 'gym-meter hidden' }, h('div', { class: 'gym-bar' }, zone, perfect, fill));
  const machineBtn = btn('Rebound machine: on', () => { gym.toggleMachine(); machineBtn.blur(); }, 'small', { 'data-quiet': '1' });
  const exitBtn = btn('Exit', () => router.back(), 'small');
  const hint = h('div', { class: 'gym-hint' }, 'WASD move · Shift sprint · hold J or Space to shoot, release in the green · T machine · N new shooter · Esc exit');
  const el = h('div', { class: 'gym' }, h('div', { class: 'gym-top' }, h('div', null, stats, who), h('div', { class: 'gym-btns' }, machineBtn, exitBtn)), last, meter, hint);

  let lastW = -1;
  const hud = {
    meter(m, c, w) {
      if (m === null) { meter.classList.add('hidden'); lastW = -1; return; }
      if (!settings.get('shotMeter')) return;
      meter.classList.remove('hidden');
      fill.style.transform = `scaleX(${Math.min(1, m)})`;
      fill.classList.toggle('over', m > 1);
      if (w !== lastW) { lastW = w; zone.style.left = (c - w) * 100 + '%'; zone.style.width = w * 2 * 100 + '%'; perfect.style.left = (c - w * 0.3) * 100 + '%'; perfect.style.width = w * 0.6 * 2 * 100 + '%'; }
    },
    stats(s) {
      const pct = s.att ? Math.round((s.made / s.att) * 100) : 0;
      stats.textContent = `FG ${s.made}/${s.att} (${pct}%)  ·  3PT ${s.m3}/${s.a3}  ·  PTS ${s.pts}  ·  Streak ${s.streak} (best ${s.best})`;
    },
    shooter(f) {
      if (!f) return;
      const r = f.player.ratings;
      who.textContent = `Shooting as ${f.player.name} · ${f.team.city} ${f.team.name} · 3PT ${r.thr} · MID ${r.mid} · CLOSE ${Math.round((r.ins + r.fin) / 2)}`;
    },
    machine(on) { machineBtn.textContent = 'Rebound machine: ' + (on ? 'on' : 'off'); },
    shot(r) {
      last.textContent = '';
      last.append(h('div', { class: 'gym-res', style: { color: r.made ? 'var(--good)' : 'var(--bad)' } }, r.text),
        h('div', { class: 'mono dim' }, `${r.dist.toFixed(1)} ft ${r.three ? '3PT' : '2PT'} · release ${r.timing}`),
        h('div', { class: 'mono dim' }, `arc ${r.arc.toFixed(0)}° · backspin ${r.spin.toFixed(1)} rev/s` + (r.made ? ` · entry ${r.entry.toFixed(0)}°` : '')),
        h('div', { class: 'mono dim' }, 'rating used ', h('span', { style: { color: ovrColor(r.rating) } }, Math.round(r.rating))));
    },
  };
  const gym = new Gym(ctx.scene, ctx.input, settings, ctx.audio, hud);
  const onKey = (e) => {
    if (e.code === 'Escape') { router.back(); }
    else if (e.code === 'Space') e.preventDefault();
    else if (e.code === 'KeyT' && !e.repeat) gym.toggleMachine();
    else if (e.code === 'KeyN' && !e.repeat) gym.newShooter(state.league);
  };
  return {
    el, noNav: true, ticker: false,
    onShow() {
      if (!ctx.scene.setFeatured) { el.append(h('div', { class: 'panel err' }, 'The gym needs WebGL.')); return; }
      ctx.audio.setMood(null); state.setMode('gym'); gym.start();
      addEventListener('keydown', onKey);
    },
    dispose() { removeEventListener('keydown', onKey); if (ctx.scene.setFeatured) gym.stop(); },
  };
}
