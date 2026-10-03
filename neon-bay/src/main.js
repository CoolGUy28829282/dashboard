// NEON BAY — bootstrap. Phase A: world + environment + orbit camera.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CFG, loadCfg } from './config.js';
import { buildWorld, X1, Z0, H } from './world.js';
import { createEnv } from './env.js';

loadCfg();
const q = new URLSearchParams(location.search);
if (q.has('hour')) CFG.startHour = +q.get('hour'); if (q.has('weather')) CFG.weather = q.get('weather'); if (q.has('shadows')) CFG.shadows = q.get('shadows') === '1';
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.15, 4000);
const G = { cfg: CFG, scene, camera, renderer, uniforms: { time: { value: 0 }, night: { value: 0.5 } }, clock: 0, focus: new THREE.Vector3(), audio: null };
window.__G = G;
const bar = document.getElementById('loadbar'), msg = document.getElementById('loadmsg');

const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 1.0); composer.addPass(bloom); composer.addPass(new OutputPass());
const fx = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aber: { value: 0.002 }, vig: { value: 0.5 }, grain: { value: 0.03 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, aber, vig, grain; varying vec2 vUv;
    void main(){ vec2 c=vUv-.5; float d=dot(c,c); vec2 o=c*d*aber*6.; vec3 col=vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b);
      col*=1.-vig*d*2.3; float n=fract(sin(dot(vUv*vec2(1920.,1080.)+time,vec2(12.9898,78.233)))*43758.5453); col+=(n-.5)*grain; gl_FragColor=vec4(col,1.); }` }); composer.addPass(fx);
G.composer = composer; G.fx = fx; G.bloom = bloom;
function resize() { const pr = Math.min(devicePixelRatio, CFG.resScale); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
G.resize = resize; addEventListener('resize', resize); resize();
G.applyGfx = () => { bloom.strength = CFG.bloom; bloom.enabled = CFG.bloom > 0.001; fx.uniforms.vig.value = CFG.vignette; fx.uniforms.grain.value = CFG.grain; fx.uniforms.aber.value = 0.0035 * CFG.aberration; camera.fov = CFG.fov; camera.updateProjectionMatrix(); resize(); };
G.applyGfx();

(async () => {
  G.env = createEnv(G); G.env.setHour(CFG.startHour); G.env.setWeather(CFG.weather);
  const prog = f => { bar.style.width = (f * 100).toFixed(0) + '%'; };
  G.world = await buildWorld(G, prog);
  G.env.update(0.01);
  msg.textContent = 'READY'; document.getElementById('load').classList.add('hide');
  let last = performance.now(), orbit = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; G.clock += dt; G.uniforms.time.value = G.clock % 1000; orbit += dt * 0.05;
    if (q.has('cam')) { const [x, y, z, tx, ty, tz] = q.get('cam').split(',').map(Number); camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); }
    else { const cx = X1 - 300, cz = Z0 + H * 0.5; camera.position.set(cx + Math.cos(orbit) * 260, 60, cz + Math.sin(orbit) * 260); camera.lookAt(cx, 25, cz); }
    G.focus.copy(camera.position); G.focus.y = 0; G.env.update(dt); G.world.update(G, dt); fx.uniforms.time.value = G.clock % 100; composer.render();
  });
})().catch(e => { console.error(e); const l = document.getElementById('load'); l.classList.remove('hide'); l.querySelector('p').textContent = 'ERROR: ' + (e && e.message); });
