// Central event bus. Gameplay emits; UI, audio, camera, replay and commentary subscribe.
export class EventBus {
  constructor() { this.l = new Map(); this.log = []; }
  on(type, fn) { (this.l.get(type) ?? this.l.set(type, new Set()).get(type)).add(fn); return () => this.l.get(type)?.delete(fn); }
  emit(type, data = {}) {
    this.log.length > 200 && this.log.shift(); this.log.push({ type, data });
    this.l.get(type)?.forEach((f) => f(data)); this.l.get('*')?.forEach((f) => f(type, data));
  }
}
