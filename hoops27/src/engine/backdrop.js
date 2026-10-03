// Menu backdrop: the arena with an orbiting camera and a rotating holographic ball. Also used for the first-run benchmark.
import * as THREE from 'three';
import { Arena } from './arena.js';

export class Backdrop {
  constructor(rend, arenaCfg) {
    this.R = rend; this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 300); this.t = 0;
    this.arena = new Arena(this.scene, arenaCfg, { reflection: rend.cfg.reflection, crowd: rend.cfg.crowd });
    const g = new THREE.Group(); this.holo = g;
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), new THREE.MeshBasicMaterial({ color: arenaCfg.accent, wireframe: true, transparent: true, opacity: 0.8 }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), new THREE.MeshBasicMaterial({ color: arenaCfg.accent2, transparent: true, opacity: 0.35 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.015, 8, 80), new THREE.MeshBasicMaterial({ color: arenaCfg.accent2 })); ring.rotation.x = Math.PI / 2; g.add(wire, core, ring); g.position.set(0, 2.3, 0); this.scene.add(g); this.ring = ring; this.wire = wire;
    this.mx = 0; this.my = 0; this.focus = { x: 0, y: 2.2, z: 0 };
  }
  setParallax(x, y) { this.mx = x; this.my = y; }
  update(dt) {
    this.t += dt; const a = this.t * 0.07 + 0.6; const r = 17 + Math.sin(this.t * 0.2) * 2;
    this.camera.position.set(Math.cos(a) * r + this.mx * 1.4, 5.2 + Math.sin(this.t * 0.3) * 0.8 - this.my * 0.8, Math.sin(a) * r * 0.75);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z); this.holo.rotation.y += dt * 0.5; this.wire.rotation.x += dt * 0.3; this.ring.rotation.z += dt * 0.6; this.holo.position.y = 2.3 + Math.sin(this.t * 1.2) * 0.15;
    this.arena.update(dt); this.R.render(dt, 0);
  }
  activate() { this.R.setScene(this.scene, this.camera); this.R.resize(); }
  dispose() { this.arena.dispose(); this.scene.clear(); }
}
