// Particles (smoke / fire / sparks / dust), tracers, explosions and floating text.
import * as THREE from 'three';
import { rnd, TAU, clamp } from './util.js';

class Particles {
  constructor(scene, max, additive, uScale) {
    this.max = max; this.i = 0; this.alive = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.a0 = new Float32Array(max); this.color = new Float32Array(max * 3); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry(); this.geo = g;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: uScale },
      vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; uniform float scale; varying float vA; varying vec3 vC; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(size*scale/max(-mv.z,.1),0.,260.); vA=alpha; vC=color; }',
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.0,d); a*=a; if(a*vA<.003) discard; gl_FragColor=vec4(vC,a*vA); }' });
    this.pts = new THREE.Points(g, m); this.pts.frustumCulled = false; scene.add(this.pts);
    for (let k = 0; k < max; k++) this.pos[k * 3 + 1] = -999;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0.5) {
    const k = this.i++ % this.max; this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z; this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz; this.life[k] = life; this.maxLife[k] = life;
    this.s0[k] = s0; this.s1[k] = s1; this.color[k * 3] = r; this.color[k * 3 + 1] = g; this.color[k * 3 + 2] = b; this.a0[k] = a; this.grav[k] = grav; this.drag[k] = drag; this.size[k] = s0; this.alpha[k] = a;
  }
  update(dt) {
    const { pos, vel, life, maxLife, s0, s1, size, alpha, a0, grav, drag } = this;
    for (let k = 0; k < this.max; k++) {
      if (life[k] <= 0) continue; life[k] -= dt; const t = 1 - life[k] / maxLife[k];
      if (life[k] <= 0) { pos[k * 3 + 1] = -999; alpha[k] = 0; continue; }
      const dg = Math.exp(-drag[k] * dt); vel[k * 3] *= dg; vel[k * 3 + 1] = vel[k * 3 + 1] * dg - grav[k] * dt; vel[k * 3 + 2] *= dg;
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt; if (pos[k * 3 + 1] < 0.05 && grav[k] > 0) { pos[k * 3 + 1] = 0.05; vel[k * 3 + 1] *= -0.3; }
      size[k] = s0[k] + (s1[k] - s0[k]) * t; alpha[k] = a0[k] * (1 - t) * (t < 0.1 ? t * 10 : 1);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.size.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

export function createFx(G) {
  const scene = G.scene, uScale = { value: 800 };
  const add = new Particles(scene, 2600, true, uScale), norm = new Particles(scene, 2600, false, uScale), fx = { add, norm, texts: [] };
  // tracers
  const TN = 32, tpos = new Float32Array(TN * 6), tlife = new Float32Array(TN), tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  const tl = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(5, 4, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); tl.frustumCulled = false; scene.add(tl); let ti = 0;
  fx.tracer = (a, b) => { const k = ti++ % TN; tpos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); tlife[k] = 0.06; };
  // flash light for explosions / muzzle
  const flash = new THREE.PointLight(0xffa040, 0, 60, 2); scene.add(flash); fx.flashT = 0;
  fx.flash = (x, y, z, intensity, color = 0xffa040) => { flash.position.set(x, y, z); flash.color.setHex(color); flash.intensity = intensity; fx.flashT = 0.18; };
  fx.sparks = (x, y, z, n = 8, spread = 6) => { for (let i = 0; i < n; i++) add.emit(x, y, z, rnd(-spread, spread), rnd(1, spread), rnd(-spread, spread), rnd(0.2, 0.5), 0.12, 0.04, 4, 2.4, 0.8, 1, 14, 0.8); };
  fx.smoke = (x, y, z, n = 1, dark = 0.25, size = 1.4) => { for (let i = 0; i < n; i++) norm.emit(x + rnd(-0.2, 0.2), y, z + rnd(-0.2, 0.2), rnd(-0.4, 0.4), rnd(1.2, 2.6), rnd(-0.4, 0.4), rnd(1.4, 2.4), size * 0.5, size * 2.6, dark, dark, dark, 0.55, -0.4, 0.6); };
  fx.fire = (x, y, z, n = 1, s = 1) => { for (let i = 0; i < n; i++) add.emit(x + rnd(-0.4, 0.4) * s, y, z + rnd(-0.4, 0.4) * s, rnd(-0.6, 0.6), rnd(1.5, 3.5), rnd(-0.6, 0.6), rnd(0.4, 0.9), 1.0 * s, 0.2, 3.5, 1.4, 0.25, 0.9, -1, 0.5); };
  fx.dust = (x, y, z, n = 2, c = 0.55) => { for (let i = 0; i < n; i++) norm.emit(x, y, z, rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1), rnd(0.6, 1.2), 0.5, 2.2, c, c * 0.95, c * 0.9, 0.35, -0.2, 1.5); };
  fx.tireSmoke = (x, z, y = 0.15) => norm.emit(x + rnd(-0.2, 0.2), y, z + rnd(-0.2, 0.2), rnd(-0.5, 0.5), rnd(0.2, 0.8), rnd(-0.5, 0.5), rnd(0.8, 1.4), 0.6, 2.4, 0.7, 0.7, 0.72, 0.35, -0.1, 1.2);
  fx.blood = (x, y, z, n = 6) => { for (let i = 0; i < n; i++) norm.emit(x, y, z, rnd(-2, 2), rnd(0.5, 3), rnd(-2, 2), rnd(0.3, 0.7), 0.18, 0.05, 0.55, 0.02, 0.04, 0.9, 12, 0.6); };
  fx.explosion = (x, y, z, radius = 9, damage = 220, owner = null) => {
    for (let i = 0; i < 46; i++) add.emit(x + rnd(-1, 1), y + rnd(0, 1.5), z + rnd(-1, 1), rnd(-5, 5), rnd(1, 9), rnd(-5, 5), rnd(0.5, 1.3), rnd(1.5, 3.2), 0.4, 4, rnd(1.2, 2.2), 0.3, 1, -0.5, 1.2);
    for (let i = 0; i < 40; i++) norm.emit(x + rnd(-2, 2), y + rnd(0.5, 2), z + rnd(-2, 2), rnd(-3, 3), rnd(2, 7), rnd(-3, 3), rnd(1.6, 3.2), 2, 8, 0.1, 0.1, 0.1, 0.75, -0.8, 0.8);
    fx.sparks(x, y + 1, z, 28, 14); fx.flash(x, y + 2, z, 900, 0xffa040); G.shake = Math.max(G.shake || 0, clamp(1.4 - Math.hypot(G.camera.position.x - x, G.camera.position.z - z) / 80, 0, 1.4));
    if (G.audio) G.audio.boom(Math.hypot(G.camera.position.x - x, G.camera.position.z - z));
    if (G.damageArea) G.damageArea(x, z, radius, damage, owner);
  };
  // floating text (cash, kill feed)
  fx.floatText = (text, x, y, z, color = '#7dff9a') => { const div = document.createElement('div'); div.className = 'ftext'; div.textContent = text; div.style.color = color; document.getElementById('ftexts').appendChild(div); fx.texts.push({ div, x, y, z, t: 1.2 }); };
  const tmp = new THREE.Vector3();
  fx.update = dt => {
    uScale.value = renderHeight() * 0.5 / Math.tan(G.camera.fov * Math.PI / 360);
    add.update(dt); norm.update(dt);
    for (let k = 0; k < TN; k++) if (tlife[k] > 0) { tlife[k] -= dt; if (tlife[k] <= 0) tpos.fill(0, k * 6, k * 6 + 6); } tg.attributes.position.needsUpdate = true;
    if (fx.flashT > 0) { fx.flashT -= dt; flash.intensity *= Math.pow(0.001, dt); if (fx.flashT <= 0) flash.intensity = 0; }
    for (let i = fx.texts.length - 1; i >= 0; i--) { const t = fx.texts[i]; t.t -= dt; t.y += dt * 1.2; tmp.set(t.x, t.y, t.z).project(G.camera); const vis = tmp.z < 1 && tmp.z > -1; t.div.style.opacity = vis ? Math.min(1, t.t * 2) : 0; t.div.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px,${(-tmp.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`; if (t.t <= 0) { t.div.remove(); fx.texts.splice(i, 1); } }
  };
  const renderHeight = () => G.renderer.domElement.height / G.renderer.getPixelRatio() * G.renderer.getPixelRatio();
  return fx;
}
