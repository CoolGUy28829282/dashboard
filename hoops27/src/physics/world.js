// Rapier (WASM) world: ball, floor, backboards and rims. Fixed 120 Hz stepping is driven by the game loop.
import RAPIER from '@dimforge/rapier3d-compat';
import { COURT, LOOP } from '../tuning.js';

export const BALL_R = COURT.ballDiameter / 2;
export const RIM_TUBE = 0.0095;
export const RIM_R = COURT.rimInnerDiameter / 2 + RIM_TUBE;
export const HALF_L = COURT.length / 2;
export const HALF_W = COURT.width / 2;
export const RIM_X = HALF_L - 1.575; // rim centre distance from centre court along x
export const hoopCenter = (side) => ({ x: side * RIM_X, y: COURT.rimHeight, z: 0 });

let ready;
export const initPhysics = () => (ready ??= RAPIER.init());

export class BallPhysics {
  static async create() { await initPhysics(); return new BallPhysics(); }
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / LOOP.physicsHz;
    this.events = new RAPIER.EventQueue(true);
    this.kinds = new Map();
    this.hits = [];
    this.active = false;
    const R = RAPIER;
    const tag = (collider, kind) => { this.kinds.set(collider.handle, kind); return collider; };
    const floorBody = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    tag(this.world.createCollider(R.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setRestitution(0.82).setFriction(0.7).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), floorBody), 'floor');
    for (const side of [-1, 1]) {
      const bx = side * (HALF_L - COURT.backboardOffset);
      const boardY = COURT.rimHeight - 0.148 + COURT.backboardH / 2;
      tag(this.world.createCollider(R.ColliderDesc.cuboid(0.03, COURT.backboardH / 2, COURT.backboardW / 2).setTranslation(bx - side * 0.03, boardY, 0).setRestitution(0.62).setFriction(0.3).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), floorBody), 'board');
      const c = hoopCenter(side);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        tag(this.world.createCollider(R.ColliderDesc.ball(RIM_TUBE).setTranslation(c.x + Math.cos(a) * RIM_R, c.y, Math.sin(a) * RIM_R).setRestitution(0.5).setFriction(0.4).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), floorBody), 'rim');
      }
    }
    this.body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 1, 0).setCcdEnabled(true).setLinearDamping(0).setAngularDamping(0.4).setCanSleep(false));
    this.ballCollider = this.world.createCollider(R.ColliderDesc.ball(BALL_R).setMass(COURT.ballMass).setRestitution(0.8).setFriction(0.6).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), this.body);
    this.kinds.set(this.ballCollider.handle, 'ball');
    this.setActive(false);
  }
  /** While held / scripted the body is parked as a kinematic-style follower (gravity off, no velocity). */
  setActive(on) {
    this.active = on;
    this.body.setGravityScale(on ? 1 : 0, true);
    this.ballCollider.setEnabled(on);
    if (!on) { this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  }
  place(x, y, z) { this.body.setTranslation({ x, y, z }, true); }
  launch(p, v, spin = { x: 0, y: 0, z: 0 }) {
    this.place(p.x, p.y, p.z); this.setActive(true);
    this.body.setLinvel(v, true); this.body.setAngvel(spin, true);
  }
  get pos() { const t = this.body.translation(); return { x: t.x, y: t.y, z: t.z }; }
  get vel() { const v = this.body.linvel(); return { x: v.x, y: v.y, z: v.z }; }
  get quat() { return this.body.rotation(); }
  impulse(v) { this.body.applyImpulse({ x: v.x * COURT.ballMass, y: v.y * COURT.ballMass, z: v.z * COURT.ballMass }, true); }
  step() {
    if (!this.active) return;
    const pre = this.vel;
    this.world.step(this.events);
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const k1 = this.kinds.get(h1), k2 = this.kinds.get(h2);
      const other = k1 === 'ball' ? k2 : k1;
      if (other) this.hits.push({ kind: other, speed: Math.hypot(pre.x, pre.y, pre.z), pos: this.pos });
    });
  }
  drainHits() { const h = this.hits; this.hits = []; return h; }
}

/** Ballistic launch velocity from p0 to p1 with flight time T. */
export function ballistic(p0, p1, T, g = 9.81) {
  return { x: (p1.x - p0.x) / T, y: (p1.y - p0.y + 0.5 * g * T * T) / T, z: (p1.z - p0.z) / T };
}
/** Flight time for an arc that peaks `apexAbove` metres above the higher endpoint. */
export function arcTime(p0, p1, apexAbove, g = 9.81) {
  const top = Math.max(p0.y, p1.y) + apexAbove;
  return Math.sqrt((2 * (top - p0.y)) / g) + Math.sqrt((2 * (top - p1.y)) / g);
}
