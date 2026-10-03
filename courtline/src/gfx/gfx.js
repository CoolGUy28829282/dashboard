// Renderer owner: applies graphics settings instantly, handles resolution scaling (user + adaptive) and MSAA rebuilds.
import * as THREE from 'three';

export class Gfx {
  constructor(host, settings) {
    this.host = host; this.settings = settings;
    this.dyn = 1; this.active = null; this.renderer = null; this.available = false; this.error = '';
    this.pr = 1;
    this.create();
    let t = 0;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.resize(), 60); });
  }
  create() {
    try {
      const aa = this.settings.get('aa') === 'msaa';
      const r = new THREE.WebGLRenderer({ antialias: aa, powerPreference: 'high-performance', stencil: false, alpha: false });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.info.autoReset = true;
      this.host.appendChild(r.domElement);
      this.renderer = r; this.available = true;
      this.applyAll();
    } catch (e) {
      this.available = false; this.error = String((e && e.message) || e);
    }
  }
  /** Rebuild the renderer (needed to change MSAA). The active scene keeps its geometry and gets recompiled by the caller. */
  recreate() {
    if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); this.renderer = null; }
    this.create();
    if (this.active && this.active.rebuildEnv && this.renderer) this.active.rebuildEnv(this.renderer);
  }
  applyAll() {
    const r = this.renderer, s = this.settings;
    if (!r) return;
    r.shadowMap.enabled = s.get('shadows') !== 'off';
    r.toneMapping = s.get('post') ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = 1.05;
    this.resize();
  }
  setDynamicScale(v) { this.dyn = v; this.resize(); }
  resize() {
    const r = this.renderer;
    if (!r) return;
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    const pr = Math.max(0.35, Math.min(2, (devicePixelRatio || 1) * this.settings.get('resScale') * this.dyn));
    this.pr = pr;
    r.setPixelRatio(pr); r.setSize(w, h, false);
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    if (this.active && this.active.resize) this.active.resize(w / h);
  }
  setActive(scene) { this.active = scene; this.resize(); }
  step(dt) { if (this.active) this.active.step(dt); }
  render(alpha, dt) { if (this.renderer && this.active) this.active.render(this.renderer, alpha, dt); }
  get info() { return this.renderer ? this.renderer.info : null; }
}
