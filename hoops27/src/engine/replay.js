// Replay ring buffer: last 8 seconds of transforms at 60 Hz, with slow-mo playback.
import { LOOP } from '../tuning.js';

export class ReplayBuffer {
  constructor(seconds = 8) { this.cap = seconds * LOOP.logicHz; this.frames = []; }
  record(game) {
    const pl = game.on.map((p) => ({
      id: p.id, x: p.pos.x, z: p.pos.z, y: p.y, face: p.face, vx: p.vel.x, vz: p.vel.z, hasBall: p.hasBall, hu: p.handsUp, dh: p.dribbleHand, st: p.stumble, state: p.state,
      action: p.action ? { kind: p.action.kind, t: p.action.t, D: p.action.D, type: p.action.type, released: p.action.released, releaseT: p.action.releaseT, variant: p.action.variant, dur: p.action.dur, load: p.action.load, air: p.action.air, rebound: p.action.rebound } : null,
    }));
    const b = game.ball;
    this.frames.push({ pl, ball: { x: b.pos.x, y: b.pos.y, z: b.pos.z, q: b.quat ? { x: b.quat.x, y: b.quat.y, z: b.quat.z, w: b.quat.w } : null, held: b.state === 'held' }, score: [...game.score], clock: game.clock });
    if (this.frames.length > this.cap) this.frames.shift();
  }
  /** Returns a clip of the last `sec` seconds. */
  clip(sec = 6) { const n = Math.min(this.frames.length, Math.round(sec * LOOP.logicHz)); return this.frames.slice(this.frames.length - n); }
}
export class ReplayPlayer {
  constructor(clip, { speed = 0.5 } = {}) { this.clip = clip; this.t = 0; this.speed = speed; this.done = false; }
  step(dt) { this.t += dt * this.speed * LOOP.logicHz; if (this.t >= this.clip.length - 1) { this.t = this.clip.length - 1; this.done = true; } }
  frame() { return this.clip[Math.floor(this.t)]; }
  alpha() { return this.t - Math.floor(this.t); }
  next() { return this.clip[Math.min(this.clip.length - 1, Math.floor(this.t) + 1)]; }
}
