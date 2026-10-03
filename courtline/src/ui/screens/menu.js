// Main menu: tile layout over the live 3D arena.
import { h } from '../../core/util.js';
import { icon, btn, toast } from '../components.js';

const TILES = [
  { id: 'play', name: 'Play Now', desc: 'Pick two teams and tip off.', phase: 4, hue: 22, icon: 'play' },
  { id: 'career', name: 'Career', desc: 'Create a player and chase the Hall of Fame.', phase: 7, hue: 262, icon: 'career' },
  { id: 'franchise', name: 'Franchise', desc: 'Run a team across seasons.', phase: 8, hue: 200, icon: 'franchise' },
  { id: 'builder', name: 'Team Builder', desc: 'Collect cards and build a lineup.', phase: 9, hue: 150, icon: 'builder' },
  { id: 'street', name: 'Streetball', desc: 'Park, rooftop and beach games.', phase: 6, hue: 340, icon: 'street' },
  { id: 'gym', name: 'Gym', desc: 'Shootaround, drills and tutorials.', phase: 2, hue: 48, icon: 'gym' },
  { id: 'stats', name: 'Stats & Records', desc: 'Leaders, records and trophies.', phase: 9, hue: 175, icon: 'stats' },
  { id: 'creator', name: 'Creator', desc: 'Edit players, teams and logos.', phase: 9, hue: 300, icon: 'creator' },
  { id: 'settings', name: 'Settings', desc: 'Gameplay, controls, camera, graphics, audio.', phase: 0, hue: 215, icon: 'settings' },
];

export function menuScreen(params, ctx) {
  const { router, state, audio } = ctx;
  const who = h('div', { class: 'menu-who dim' });
  const refresh = () => {
    const f = ctx.scene.featured;
    who.textContent = '';
    if (f) who.append(h('div', null, `Now showing: ${f.player.name} · ${f.team.city} ${f.team.name}`), h('div', null, f.team.arena.name));
    who.append(h('div', null, state.league ? `${state.league.name} · ${state.league.season.label}` : ''));
  };
  const tiles = TILES.map((t) => {
    const locked = t.phase > 1;
    const el = h('button', { class: 'tile' + (locked ? ' locked' : ''), 'data-nav': '', 'data-quiet': locked ? '1' : null, style: { '--h': t.hue }, 'data-autofocus': t.id === 'play' ? '' : null,
      onClick: () => {
        if (t.id === 'settings') router.push('settings');
        else { audio.sfx('error', 0.6); toast(`${t.name} unlocks in Phase ${t.phase}`); }
      } },
    icon(t.icon),
    h('div', { class: 't-name' }, t.name),
    h('div', { class: 't-desc' }, t.desc),
    locked ? h('span', { class: 'pill lock' }, 'Phase ' + t.phase) : null);
    return el;
  });
  const offLeague = state.on('league', refresh);
  const el = h('div', { class: 'menu' },
    h('div', { class: 'menu-head' }, h('div', { class: 'logo' }, 'COURTLINE'), who),
    h('div', { class: 'tiles' }, tiles),
    h('div', { class: 'menu-foot' },
      btn('League & saves', () => router.push('league'), 'small'),
      btn('Controls guide', () => router.push('controls'), 'small')));
  return {
    el,
    onShow() { refresh(); ctx.audio.setMood('menu'); state.setMode('menu'); },
    onFocus() {},
    prompts: [['move', 'Move'], ['accept', 'Select']],
    dispose() { offLeague(); },
  };
}
