// Developer harness: spectate CPU vs CPU with the full 3D view (used for smoke tests / screenshots).
import { generateLeague, ARENAS } from './data/generator.js';
import { BallPhysics } from './physics/world.js';
import { EventBus } from './engine/bus.js';
import { Game } from './gameplay/game.js';
import { Renderer } from './engine/renderer.js';
import { GameView } from './engine/view.js';

const q = new URLSearchParams(location.search);
const league = generateLeague();
const bus = new EventBus();
const phys = await BallPhysics.create();
const rend = new Renderer(document.getElementById('game'));
rend.applyPreset(q.get('q') ?? 'medium');
const game = new Game({ teams: [league.teams[+(q.get('a') ?? 0)], league.teams[+(q.get('b') ?? 5)]], settings: { quarterMinutes: 3 }, bus, physics: phys, seed: 5 });
const view = new GameView(rend, game, { arena: ARENAS[+(q.get('arena') ?? 0)], settings: { gameplay: {}, access: {} }, bus });
view.setCameraMode(q.get('cam') ?? 'broadcast');
game.start();
window.__g = { game, view, rend, bus };
addEventListener('resize', () => rend.resize());
let acc = 0, last = performance.now(), frames = 0, errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message)));
window.__errors = errors; window.__frames = () => frames;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
  const speed = +(q.get('speed') ?? 1);
  while (acc >= 1 / 60) { for (let i = 0; i < speed; i++) game.update(1 / 60); view.capture(); acc -= 1 / 60; if (game.phase === 'qend') game.nextQuarter(); if (game.phase === 'timeout') game.endTimeout(); }
  view.update(dt, acc * 60, { active: [] }); frames++; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
