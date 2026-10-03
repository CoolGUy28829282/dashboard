// WebGL2 renderer + post-processing stack: bloom, SSAO, chromatic aberration (big plays), directional motion blur, ACES, FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FX_SHADER } from '../shaders/postfx.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';


export const PRESETS = {
  low: { scale: 0.6, shadows: false, reflection: 0, bloom: false, ssao: false, fxaa: true, crowd: 0.4, motionBlur: false, ca: false },
  medium: { scale: 0.85, shadows: true, reflection: 0.35, bloom: true, ssao: false, fxaa: true, crowd: 0.7, motionBlur: false, ca: true },
  high: { scale: 1.0, shadows: true, reflection: 0.6, bloom: true, ssao: false, fxaa: true, crowd: 1.0, motionBlur: false, ca: true },
  ultra: { scale: 1.0, shadows: true, reflection: 1.0, bloom: true, ssao: true, fxaa: true, crowd: 1.0, motionBlur: true, ca: true },
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.toneMapping = THREE.NoToneMapping; // ACES applied in OutputPass
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x05060d, 1);
    this.cfg = { ...PRESETS.high };
    this.canvas = canvas;
    this.caAmount = 0; this.caTarget = 0; this.shake = 0;
    this.camVel = new THREE.Vector3();
  }
  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.build();
  }
  build() {
    const r = this.renderer, size = new THREE.Vector2();
    r.getSize(size);
    this.composer?.dispose?.();
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ssao = new SSAOPass(this.scene, this.camera, size.x || 1280, size.y || 720); this.ssao.kernelRadius = 0.6; this.ssao.minDistance = 0.002; this.ssao.maxDistance = 0.1; this.ssao.enabled = this.cfg.ssao;
    this.composer.addPass(this.ssao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x || 1280, size.y || 720), 0.65, 0.7, 0.82); this.bloom.enabled = this.cfg.bloom;
    this.composer.addPass(this.bloom);
    this.fx = new ShaderPass(FX_SHADER); this.composer.addPass(this.fx);
    this.composer.addPass(new OutputPass()); // ACES tone mapping + sRGB
    this.fxaa = new ShaderPass(FXAAShader); this.fxaa.enabled = this.cfg.fxaa; this.composer.addPass(this.fxaa);
    this.renderer.shadowMap.enabled = this.cfg.shadows;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.resize();
  }
  apply(cfg) { Object.assign(this.cfg, cfg); if (this.scene) { this.build(); } this.onApply?.(this.cfg); }
  applyPreset(name) { this.apply({ ...(PRESETS[name] ?? PRESETS.high) }); }
  resize() {
    const w = window.innerWidth, h = window.innerHeight, s = this.cfg.scale * Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(s); this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.composer?.setPixelRatio?.(s); this.composer?.setSize(w, h);
    if (this.fxaa) { const pr = this.renderer.getPixelRatio(); this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); }
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  kick(amount = 0.012) { this.caTarget = Math.max(this.caTarget, amount); }
  render(dt, camSpeed = 0) {
    this.caTarget = Math.max(0, this.caTarget - dt * 0.04); this.caAmount += (this.caTarget - this.caAmount) * Math.min(1, dt * 14);
    const u = this.fx.uniforms;
    u.aberration.value = this.cfg.ca && !this.cfg.reducedMotion ? this.caAmount : 0;
    if (this.cfg.motionBlur && !this.cfg.reducedMotion) { const b = Math.min(0.012, camSpeed * 0.0006); u.blurDir.value.set(b, 0); } else u.blurDir.value.set(0, 0);
    this.composer.render(dt);
  }
}
