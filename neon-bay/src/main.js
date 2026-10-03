// NEON BAY — bootstrap and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CFG, loadCfg, saveCfg, loadSave, writeSave } from './config.js';
import { buildWorld, X1, Z0, H } from './world.js';
import { createEnv } from './env.js';
import { createFx } from './fx.js';
import { VehicleManager } from './vehicles.js';
import { createCombat } from './combat.js';
import { Player } from './player.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { AudioSys } from './audio.js';
import { createMenu } from './menu.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';

loadCfg();
const q = new URLSearchParams(location.search);
if (q.has('hour')) CFG.startHour = +q.get('hour'); if (q.has('weather')) CFG.weather = q.get('weather'); if (q.has('shadows')) CFG.shadows = q.get('shadows') === '1'; if (q.has('res')) CFG.resScale = +q.get('res');
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.15, 4500);
const G = { cfg: CFG, scene, camera, renderer, uniforms: { time: { value: 0 }, night: { value: 0.5 } }, clock: 0, focus: new THREE.Vector3(), state: 'loading', paused: false, timeScale: 1, difficultyMul: 1, shake: 0, waypoint: null };
window.__G = G;
const bar = document.getElementById('loadbar'), msg = document.getElementById('loadmsg'), loadEl = document.getElementById('load');

const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 1.15); composer.addPass(bloom); composer.addPass(new OutputPass());
const fx = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aber: { value: 0.002 }, vig: { value: 0.5 }, grain: { value: 0.03 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, aber, vig, grain, hurt; varying vec2 vUv;
    void main(){ vec2 c=vUv-.5; float d=dot(c,c); vec2 o=c*d*aber*6.; vec3 col=vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b);
      float l=dot(col,vec3(.3,.5,.2)); col=mix(col, vec3(l)*vec3(1.,.6,.6), hurt); col*=1.-vig*d*2.3; float n=fract(sin(dot(vUv*vec2(1920.,1080.)+time,vec2(12.9898,78.233)))*43758.5453); col+=(n-.5)*grain; gl_FragColor=vec4(col,1.); }` }); composer.addPass(fx);
G.composer = composer; G.fxPass = fx; G.bloom = bloom;
function resize() { const pr = Math.min(devicePixelRatio, CFG.resScale); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
G.applyGfx = () => { bloom.strength = CFG.bloom; bloom.enabled = CFG.bloom > 0.001; fx.uniforms.vig.value = CFG.vignette; fx.uniforms.grain.value = CFG.grain; fx.uniforms.aber.value = 0.0035 * CFG.aberration; camera.fov = CFG.fov; camera.updateProjectionMatrix(); G.difficultyMul = { Easy: 0.6, Normal: 1, Hard: 1.5 }[CFG.difficulty] || 1; if (G.audio) G.audio.apply(); resize(); };
G.applyGfx();

G.alert = (x, z, r, kind) => { if (G.peds) G.peds.alert(x, z, r, kind); if (G.police) G.police.alert(x, z, r, kind); };

// ------------------------------------------------------------------ game flow
G.startGame = (opts = {}) => {
  const P = G.player, W = G.world; loadEl.classList.add('hide'); G.menu.hide(); document.getElementById('hud').style.display = 'block';
  if (G.audio) { G.audio.init(); G.audio.apply(); }
  const save = opts.save, sp = W.spawns.beach;
  P.hp = 100; P.armor = 0; P.state = 'foot'; P.model.rotation.set(0, 0, 0); P.model.visible = true;
  if (save) { P.cash = save.cash; P.hp = save.hp || 100; P.armor = save.armor || 0; P.owned = save.owned || P.owned; P.ammo = save.ammo || P.ammo; P.mags = save.mags || P.mags; P.setPos(save.x, save.z); G.env.setHour(save.hour); }
  else { P.cash = 2500; P.setPos(X1 + 10.6, sp.z + 6); P.camYaw = Math.PI; P.a = Math.PI; G.env.setHour(CFG.startHour); const v = G.vehicles.spawn('super', X1 + 6.4, sp.z + 8, -Math.PI / 2, { paint: '#ff2d95', neon: true }); v.parked = true; v.stolen = true; const c2 = G.vehicles.spawn('coupe', X1 + 6.4, sp.z + 22, -Math.PI / 2, { paint: '#22d6c8' }); c2.parked = true; c2.stolen = true; }
  G.state = 'play'; G.paused = false; G.focus.set(P.x, 0, P.z); G.camera.position.set(P.x, 3, P.z); if (G.police) G.police.clear(); if (G.traffic) G.traffic.prime(); if (G.peds) G.peds.prime(); G.hud.notify('Welcome to Neon Bay'); G.hud.notify('Press M for the map · Esc to pause');
  canvas.focus();
};
G.saveGame = () => { const P = G.player; writeSave({ x: P.x, z: P.z, cash: P.cash, hp: P.hp, armor: P.armor, owned: P.owned, ammo: P.ammo, mags: P.mags, hour: G.env.hour }); G.hud.notify('Game saved'); };
G.setPaused = (b) => { if (G.state !== 'play') return; G.paused = b; if (b) { G.input.release(); G.menu.showPause(); if (G.audio && G.audio.ctx) G.audio.engineOff(); } else { G.menu.hideAll(); } };
G.toMenu = () => { G.state = 'menu'; G.paused = false; G.input.release(); document.getElementById('hud').style.display = 'none'; G.menu.hideAll(); G.menu.show(); if (G.audio) G.audio.engineOff(); if (G.player.vehicle) G.player.exitVehicleInstant(); };
G.onLockLost = () => { if (G.state === 'play' && !G.paused && document.getElementById('bigmap').hidden) G.setPaused(true); };

// ------------------------------------------------------------------ boot
(async () => {
  G.env = createEnv(G); G.env.setHour(CFG.startHour); G.env.setWeather(CFG.weather);
  const prog = f => { bar.style.width = (f * 100).toFixed(0) + '%'; };
  G.world = await buildWorld(G, prog); msg.textContent = 'SPAWNING TRAFFIC…'; await new Promise(r => setTimeout(r, 0));
  G.audio = new AudioSys(); G.input = createInput(G); G.fx = createFx(G); G.vehicles = new VehicleManager(G); G.combat = createCombat(G); G.player = new Player(G);
  G.peds = createPeds(G); G.traffic = createTraffic(G); G.police = createPolice(G); G.missions = createMissions(G); G.hud = createHud(G); G.menu = createMenu(G);
  G.audio.onStation = st => G.hud.notify('♪ ' + st.name);
  G.env.update(0.01); prog(1); msg.textContent = 'READY';
  G.state = 'menu'; G.menu.show(); loadEl.classList.add('hide'); G.player.setPos(X1 + 11, G.world.spawns.beach.z + 6);
  if (q.has('autostart')) { G.startGame(); if (q.has('give')) G.player.giveAll(); if (q.has('wanted') && G.police) G.police.setStars(+q.get('wanted')); if (q.has('car')) { const v = G.vehicles.spawn(q.get('car'), G.player.x - 4, G.player.z, Math.PI / 2); G.player.enter(v); } if (q.has('at')) { const [x, z] = q.get('at').split(',').map(Number); G.player.setPos(x, z); G.focus.set(x, 0, z); G.traffic.prime(); G.peds.prime(); } }
  let last = performance.now(), orbit = 0;
  renderer.setAnimationLoop(now => {
    const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; G.clock += rdt; G.uniforms.time.value = G.clock % 1000;
    const I = G.input;
    if (G.state === 'play' && !G.paused) {
      const dt = rdt * G.timeScale;
      if (I.pressed('KeyM')) { const bm = document.getElementById('bigmap'); bm.hidden = !bm.hidden; if (!bm.hidden) { I.release(); G.paused = true; G.hud.drawBigMap(); } }
      I.frameBegin && I.frameBegin();
      G.player.update(dt); if (G.traffic) G.traffic.update(dt); if (G.peds) G.peds.update(dt); if (G.police) G.police.update(dt); if (G.missions) G.missions.update(dt); G.vehicles.update(dt); G.combat.update(dt);
      G.fx.update(dt); G.env.update(rdt); G.world.update(G, rdt); G.hud.update(rdt);
      if (G.audio.ctx) { G.audio.setRain(G.env.rainAmt); G.audio.setInCar(!!G.player.vehicle); if (!G.player.vehicle) G.audio.engineOff(); }
      fx.uniforms.hurt.value = G.player.state === 'dead' ? 0.85 : Math.max(0, 0.5 - G.player.hp / 100) * 0.8 * (G.player.state === 'foot' || G.player.state === 'vehicle' ? 1 : 0);
    } else if (G.state === 'play' && G.paused) { // paused or map open: keep the frame alive without simulating
      if (I.pressed('KeyM') || I.pressed('Escape')) { const bm = document.getElementById('bigmap'); if (!bm.hidden) { bm.hidden = true; G.paused = false; } }
      G.env.update(0); G.hud.update(0);
    } else { // menu: cinematic orbit over the bay
      orbit += rdt * 0.045; const cx = X1 - 380 + Math.cos(orbit * 0.7) * 120, cz = Z0 + H * 0.5 + Math.sin(orbit) * 340; camera.position.set(cx + Math.cos(orbit) * 180, 55 + Math.sin(orbit * 1.3) * 25, cz); camera.lookAt(cx - 60, 28, cz + Math.sin(orbit) * 30); G.focus.set(camera.position.x, 0, camera.position.z); G.env.update(rdt); G.world.update(G, rdt); G.fx.update(rdt);
      if (G.traffic) { G.traffic.update(rdt); G.vehicles.update(rdt); }
    }
    I.frameEnd(); fx.uniforms.time.value = G.clock % 100; composer.render();
  });
  if (q.has('hold')) { /* keep loading overlay hidden for screenshots */ }
})().catch(e => { console.error(e); loadEl.classList.remove('hide'); loadEl.querySelector('p').textContent = 'ERROR: ' + (e && e.message); });
