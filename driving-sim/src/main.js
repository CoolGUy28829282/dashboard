// NEON DRIVE 3D — night-city driving simulator (Three.js). Everything is procedural: no external assets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const prand = mulberry32(2024);
const R = (a, b) => a + prand() * (b - a);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color().setRGB(0.07, 0.04, 0.11);
scene.background = FOG;
scene.fog = new THREE.FogExp2(FOG, 0.0062);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1800);

// ---------------------------------------------------------------- canvas texture helpers
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const radialTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

// ---------------------------------------------------------------- sky + environment
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vD; uniform float time;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
    void main(){
      vec3 d=normalize(vD); float h=d.y;
      vec3 col=mix(vec3(.10,.055,.16), vec3(.012,.02,.06), smoothstep(0.,.35,h));
      col=mix(col, vec3(.003,.005,.016), smoothstep(.3,.9,h));
      col+=vec3(.30,.10,.16)*exp(-abs(h)*7.)*.55;
      if(h>0.){
        vec2 uv=d.xz/(h+.25)*1.3+vec2(time*.004,0.);
        float c=smoothstep(.42,.9,fbm(uv*1.6));
        col+=vec3(.20,.09,.17)*c*exp(-h*2.2)*smoothstep(0.,.12,h);
        vec2 g=vec2(atan(d.z,d.x)*60.,asin(clamp(h,-1.,1.))*60.);
        vec2 id=floor(g), f=fract(g)-.5; float r=hash(id);
        float st=step(.965,r)*smoothstep(.22,.0,length(f-(vec2(hash(id+1.),hash(id+2.))-.5)*.5));
        col+=vec3(.8,.85,1.)*st*(r-.96)*40.*smoothstep(.06,.4,h)*(1.-c*.8);
      }
      vec3 md=normalize(vec3(-.45,.32,-.83)); float m=dot(d,md);
      col+=vec3(.9,.95,1.)*smoothstep(.99935,.9996,m)*4.;
      col+=vec3(.25,.35,.7)*pow(max(m,0.),160.)*.7+vec3(.1,.15,.3)*pow(max(m,0.),12.)*.25;
      gl_FragColor=vec4(col,1.);
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

(function buildEnv() { // small scene baked to PMREM: gives wet-paint / glass reflections of sky + neon
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat.clone()));
  const strips = [[0xff2d95, -30, 12, -20], [0x20e8ff, 30, 10, -25], [0xffb060, 0, 6, 40], [0xff2d95, 35, 4, 15], [0x20e8ff, -35, 5, 10]];
  for (const [c, x, y, z] of strips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6) }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(es, 0.03).texture;
  scene.environmentIntensity = 0.55;
})();

scene.add(new THREE.HemisphereLight(0x3a4c8c, 0x1a0e22, 0.45));
const moon = new THREE.DirectionalLight(0x8fa6ff, 0.5); moon.position.set(-45, 32, -83); scene.add(moon);

// ---------------------------------------------------------------- road path (heading psi(s); right turn = +psi)
const L = 60, STEP = 2;
const psi = s => 0.7 * Math.sin(s / 420) + 0.4 * Math.sin(s / 170 + 1.2);
const dpsi = s => (0.7 / 420) * Math.cos(s / 420) + (0.4 / 170) * Math.cos(s / 170 + 1.2);
const pts = [{ x: 0, z: 0 }];
function at(s) {
  s = Math.max(0, s);
  while (pts.length * STEP <= s + STEP * 2) { const i = pts.length - 1, p = pts[i], a = psi(i * STEP + STEP / 2); pts.push({ x: p.x + Math.sin(a) * STEP, z: p.z - Math.cos(a) * STEP }); }
  const f = s / STEP, i = Math.floor(f), t = f - i, a = pts[i], b = pts[i + 1];
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), psi: psi(s) };
}
const world = (s, d, y = 0, out = new THREE.Vector3()) => { const p = at(s); return out.set(p.x + Math.cos(p.psi) * d, y, p.z + Math.sin(p.psi) * d); };

function ribbon(s0, s1, d0, d1, y0, y1, uvf) {
  const n = Math.round((s1 - s0) / STEP), pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + i * STEP, p = at(s), c = Math.cos(p.psi), sn = Math.sin(p.psi);
    pos.push(p.x + c * d0, y0, p.z + sn * d0, p.x + c * d1, y1, p.z + sn * d1);
    uv.push(...uvf(s, 0), ...uvf(s, 1));
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function place(geo, s, d, y, yaw = 0) { // orient to road at s, then move to lane offset d / height y
  const p = at(s); geo.rotateY(-(p.psi + yaw)); geo.translate(p.x + Math.cos(p.psi) * d, y, p.z + Math.sin(p.psi) * d); return geo;
}

// ---------------------------------------------------------------- materials
const roadMap = canvasTex(512, 1024, (g, w, h) => {
  g.fillStyle = '#2a2c33'; g.fillRect(0, 0, w, h);
  const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n * 1.1; } g.putImageData(id, 0, 0);
  const px = d => (d + 7) / 14 * w;
  for (const d of [-1.75, 1.75, -5.25, 5.25]) for (const o of [-0.55, 0.55]) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px(d + o) - 14, 0, 28, h); } // tyre wear
  g.fillStyle = 'rgba(0,0,0,.28)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 80, 2 + Math.random() * 6); // patches
  g.fillStyle = '#e9c24a'; g.fillRect(px(-0.2) - 3, 0, 6, h); g.fillRect(px(0.2) - 3, 0, 6, h); // double yellow
  g.fillStyle = '#ddd'; g.fillRect(px(-6.75) - 4, 0, 8, h); g.fillRect(px(6.75) - 4, 0, 8, h); // edges
  for (const d of [-3.5, 3.5]) for (const y0 of [0, 512]) g.fillRect(px(d) - 3.5, y0, 7, 170); // dashes (3 m of 18)
});
roadMap.repeat.set(1, 1);
const roadRough = canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { const x = Math.random() * w, y = Math.random() * h, r = 15 + Math.random() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(30,30,30,.9)'); gr.addColorStop(1, 'rgba(30,30,30,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } // puddles
}, false);
const M = {
  road: new THREE.MeshStandardMaterial({ map: roadMap, roughnessMap: roadRough, roughness: 0.85, metalness: 0.25, envMapIntensity: 1.4 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x0b0d15, roughness: 0.95 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x7c8090, roughness: 0.85, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.8 }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 4.4, 2.4) }),
  lampGlow: new THREE.MeshBasicMaterial({ map: radialTex, color: new THREE.Color().setRGB(1, 0.62, 0.28), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  red: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(8, 0.3, 0.3) }),
  warm: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 3, 1.8) }),
};
function facadeMaps(pal, seedv) {
  const rg = mulberry32(seedv), cols = 8, rows = 16, cw = 32, ch = 32;
  const lit = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lit.push(rg() < 0.3 && !(c === 0 && r === rows - 1) ? pal[Math.floor(rg() * pal.length)] : null);
  const map = canvasTex(256, 512, (g) => {
    g.fillStyle = '#242b3d'; g.fillRect(0, 0, 256, 512);
    for (let r = 0; r < rows; r++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, r * ch, 256, 3); for (let c = 0; c < cols; c++) { g.fillStyle = '#0a101e'; g.fillRect(c * cw + 5, r * ch + 6, cw - 10, ch - 11); g.fillStyle = 'rgba(120,150,220,.12)'; g.fillRect(c * cw + 5, r * ch + 6, cw - 10, 5); } }
    g.fillStyle = '#242b3d'; g.fillRect(0, 480, 32, 32);
  });
  const em = canvasTex(256, 512, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512);
    lit.forEach((col, i) => { if (!col) return; const c = i % cols, r = Math.floor(i / cols); g.fillStyle = col; g.globalAlpha = 0.55 + rg() * 0.45; g.fillRect(c * cw + 5, r * ch + 6, cw - 10, ch - 11); }); g.globalAlpha = 1;
  });
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.55, metalness: 0.35, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.15, envMapIntensity: 0.6 });
}
const facade = [
  facadeMaps(['#ffd9a0', '#ffe9c4', '#ffc880', '#bfe0ff'], 1),
  facadeMaps(['#9fd8ff', '#c8eaff', '#ff7ab8', '#ffe2a8'], 2),
  facadeMaps(['#ffcf8a', '#ff9d5c', '#d8f0ff', '#8ff0ff'], 3),
];

const SIGN_TEXT = ['ラーメン', 'NEON', '夜光', 'HOTEL', 'CLUB 24', '酒', '電気', 'KARAOKE', 'RAMEN', 'パチンコ', 'BAR', '薬局'];
const SIGN_COL = ['#ff2d95', '#22e6ff', '#ffb02e', '#8cff5a', '#c07bff'];
const signTex = SIGN_TEXT.map((t, i) => canvasTex(256, 512, (g, w, h) => {
  const col = SIGN_COL[i % SIGN_COL.length]; g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8,4,16,.88)'; g.fillRect(8, 8, w - 16, h - 16);
  g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 18; g.strokeRect(14, 14, w - 28, h - 28);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 66px sans-serif';
  const chars = [...t]; const step = Math.min(78, (h - 80) / chars.length);
  chars.forEach((ch, j) => g.fillText(ch, w / 2, h / 2 + (j - (chars.length - 1) / 2) * step));
}));
const signMats = signTex.map(t => new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color().setRGB(2.2, 2.2, 2.2) }));
const hwTex = canvasTex(1024, 256, (g, w, h) => {
  g.fillStyle = '#0b5a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#fff'; g.font = 'bold 74px sans-serif'; g.textAlign = 'left'; g.fillText('SHIBUYA   12 km', 60, 110); g.fillText('NEO-KYOTO   38 km', 60, 205);
  g.font = 'bold 120px sans-serif'; g.textAlign = 'right'; g.fillText('↑', w - 50, 130);
});
const hwMat = new THREE.MeshStandardMaterial({ map: hwTex, emissiveMap: hwTex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.6 });

// ---------------------------------------------------------------- city generation (global, deterministic building rows)
const rows = {};
function rowList(side, row) { const k = side + ':' + row; return rows[k] ||= { rng: mulberry32(side * 100 + row * 7 + 5), s: -40, list: [] }; }
function rowUpTo(side, row, s) {
  const r = rowList(side, row);
  while (r.s < s + 80) {
    const wA = 14 + r.rng() * 22, dp = 12 + r.rng() * 16;
    r.list.push({ s: r.s + wA / 2, wA, dp, off: (row ? 52 : 17) + r.rng() * 9, h: row ? 70 + r.rng() * 150 : 28 + r.rng() * 75, v: Math.floor(r.rng() * 3), a: r.rng(), b: r.rng(), c: r.rng() });
    r.s += wA + (row ? r.rng() * 4 : r.rng() * 9);
  }
  return r.list;
}
function boxGeo(w, h, d, uvOn = true) { // facade UV: one texture tile = 25.6 m wide x 57.6 m tall
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i, fw = f < 2 ? d : w;
    if (f === 2 || f === 3 || !uvOn) uv.setXY(k, uv.getX(k) * 0.02, uv.getY(k) * 0.02);
    else uv.setXY(k, uv.getX(k) * fw / 19.2, uv.getY(k) * h / 54.4);
  }
  return g;
}

function buildChunk(k) {
  const grp = new THREE.Group(), s0 = k * L, s1 = s0 + L, rng = mulberry32(k * 9973 + 11), geoms = [];
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); grp.add(m); geoms.push(geo); return m; };
  add(ribbon(s0, s1, -7, 7, 0, 0, (s, sd) => [sd, s / 18]), M.road);
  add(ribbon(s0, s1, -240, 240, -0.12, -0.12, (s, sd) => [sd, s / 20]), M.ground);
  const bar = [];
  for (const sg of [-1, 1]) {
    bar.push(ribbon(s0, s1, sg * 7.4, sg * 7.4, 0, 0.85, (s, v) => [s / 4, v]), ribbon(s0, s1, sg * 7.4, sg * 7.9, 0.85, 0.85, (s, v) => [s / 4, v]), ribbon(s0, s1, sg * 7.9, sg * 7.9, 0.85, 0, (s, v) => [s / 4, v]));
  }
  add(mergeGeometries(bar), M.concrete);
  // street lamps
  const poles = [], heads = [], glows = [];
  for (let j = Math.ceil(s0 / 30); j * 30 < s1; j++) {
    const s = j * 30, sd = j % 2 ? 1 : -1;
    poles.push(place(new THREE.CylinderGeometry(0.11, 0.16, 9, 8).translate(0, 4.5, 0), s, sd * 8.5, 0), place(new THREE.BoxGeometry(3.4, 0.13, 0.13).translate(sd * -1.7, 9, 0), s, sd * 8.5, 0));
    heads.push(place(new THREE.BoxGeometry(1.2, 0.12, 0.45).translate(0, 8.93, 0), s, sd * 5.3, 0));
    glows.push(place(new THREE.PlaneGeometry(17, 17).rotateX(-Math.PI / 2).translate(0, 0.03, 0), s, sd * 3.2, 0));
  }
  if (poles.length) { add(mergeGeometries(poles), M.steel); add(mergeGeometries(heads), M.lamp); add(mergeGeometries(glows), M.lampGlow); }
  // buildings
  const byV = [[], [], []], redLights = [], antennas = [];
  for (const side of [-1, 1]) for (const row of [0, 1]) {
    for (const b of rowUpTo(side, row, s1)) {
      if (b.s < s0 || b.s >= s1) continue;
      const g = boxGeo(b.dp, b.h, b.wA).translate(0, b.h / 2 - 0.1, 0);
      byV[b.v].push(place(g, b.s, side * (b.off + b.dp / 2), 0));
      if (b.a < 0.45) { // rooftop plant + aviation light
        const rw = b.dp * 0.4, rh = 2 + b.b * 3;
        byV[b.v].push(place(boxGeo(rw, rh, b.wA * 0.4).translate(0, b.h + rh / 2 - 0.1, 0), b.s, side * (b.off + b.dp / 2), 0));
        if (row || b.h > 60) { antennas.push(place(new THREE.BoxGeometry(0.25, 14, 0.25).translate(0, b.h + 7, 0), b.s, side * (b.off + b.dp / 2), 0)); redLights.push(place(new THREE.SphereGeometry(0.6, 6, 4).translate(0, b.h + 14, 0), b.s, side * (b.off + b.dp / 2), 0)); }
      }
      if (row === 0 && b.c < 0.5) { // neon sign on road-facing facade
        const si = Math.floor(b.b * SIGN_TEXT.length), horiz = b.a > 0.8;
        const w = horiz ? 9 : 3.4, h = horiz ? 3.6 : 11, y = 5 + b.c * 40;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMats[si]);
        const p = at(b.s), nx = -side * Math.cos(p.psi), nz = -side * Math.sin(p.psi);
        m.position.set(p.x + Math.cos(p.psi) * side * (b.off - 0.15), Math.min(y + h / 2, b.h - h / 2 - 1), p.z + Math.sin(p.psi) * side * (b.off - 0.15)); m.rotation.y = Math.atan2(nx, nz);
        grp.add(m);
      }
    }
  }
  byV.forEach((arr, i) => { if (arr.length) add(mergeGeometries(arr), facade[i]); });
  if (antennas.length) add(mergeGeometries(antennas), M.steel);
  if (redLights.length) add(mergeGeometries(redLights), M.red);
  // overpass
  if (k % 9 === 4) {
    const sc = s0 + L / 2, parts = [
      place(new THREE.BoxGeometry(46, 1.6, 12).translate(0, 7.6, 0), sc, 0, 0),
      place(new THREE.BoxGeometry(46, 1.2, 0.5).translate(0, 8.9, 5.8), sc, 0, 0), place(new THREE.BoxGeometry(46, 1.2, 0.5).translate(0, 8.9, -5.8), sc, 0, 0),
    ];
    for (const d of [-10.5, 10.5, -18, 18]) parts.push(place(new THREE.BoxGeometry(1.6, 7.6, 3.4).translate(0, 3.8, 0), sc, d, 0));
    add(mergeGeometries(parts), M.concrete);
    const strips = [place(new THREE.BoxGeometry(30, 0.08, 0.2).translate(0, 6.75, 2.5), sc, 0, 0), place(new THREE.BoxGeometry(30, 0.08, 0.2).translate(0, 6.75, -2.5), sc, 0, 0)];
    add(mergeGeometries(strips), M.warm);
    add(mergeGeometries([place(new THREE.PlaneGeometry(40, 12).rotateX(-Math.PI / 2).translate(0, 0.04, 0), sc, 0, 0)]), M.lampGlow);
  } else if (k % 5 === 1) { // gantry sign
    const sc = s0 + L / 2, p = at(sc);
    const parts = [place(new THREE.BoxGeometry(0.4, 8, 0.4).translate(0, 4, 0), sc, -8.6, 0), place(new THREE.BoxGeometry(0.4, 8, 0.4).translate(0, 4, 0), sc, 8.6, 0), place(new THREE.BoxGeometry(18, 0.4, 0.5).translate(0, 7.9, 0), sc, 0, 0)];
    add(mergeGeometries(parts), M.steel);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), hwMat);
    m.position.set(p.x, 6.0, p.z); m.rotation.y = -p.psi; grp.add(m);
  }
  grp.userData.geoms = geoms; return grp;
}

const chunks = new Map();
function updateChunks(s, all = false) {
  const kMin = Math.floor(s / L) - 2, kMax = Math.floor(s / L) + 9;
  for (const [k, g] of chunks) if (k < kMin) { scene.remove(g); g.userData.geoms.forEach(x => x.dispose()); chunks.delete(k); }
  let budget = all ? 99 : 2;
  for (let k = Math.max(0, kMin); k <= kMax && budget > 0; k++) if (!chunks.has(k)) { const g = buildChunk(k); chunks.set(k, g); scene.add(g); budget--; }
}

// ---------------------------------------------------------------- car model
const CAR_W = 1.9, CAR_L = 4.5;
const carG = (() => {
  const yb = 0.32, body = new THREE.Shape();
  body.moveTo(-2.2, yb); body.lineTo(-1.82, yb); body.absarc(-1.32, yb, 0.5, Math.PI, 0, true); body.lineTo(0.85, yb); body.absarc(1.35, yb, 0.5, Math.PI, 0, true);
  [[2.2, yb], [2.27, 0.5], [2.12, 0.7], [1.2, 0.9], [0.95, 0.96], [-1.3, 0.99], [-2.1, 0.97], [-2.24, 0.82]].forEach(p => body.lineTo(...p)); body.closePath();
  const ext = (shape, depth, bev) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev * 1.2, bevelSegments: 3, curveSegments: 18 }); g.translate(0, 0, -depth / 2); g.rotateY(Math.PI / 2); return g; };
  const cab = new THREE.Shape(); [[-1.3, 0.96], [-0.72, 1.37], [0.25, 1.37], [0.95, 0.96]].forEach((p, i) => i ? cab.lineTo(...p) : cab.moveTo(...p)); cab.closePath();
  return {
    body: ext(body, CAR_W - 0.16, 0.08), cabin: ext(cab, 1.5, 0.04),
    roof: new THREE.BoxGeometry(1.5, 0.05, 1.05), tire: new THREE.CylinderGeometry(0.34, 0.34, 0.26, 28).rotateZ(Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.23, 0.23, 0.275, 12).rotateZ(Math.PI / 2), spoke: new THREE.BoxGeometry(0.28, 0.4, 0.04),
    head: new THREE.BoxGeometry(0.5, 0.08, 0.1), tail: new THREE.BoxGeometry(1.72, 0.07, 0.08), bar: new THREE.BoxGeometry(1.2, 0.05, 0.1),
    spoiler: new THREE.BoxGeometry(1.7, 0.04, 0.34), strut: new THREE.BoxGeometry(0.05, 0.14, 0.05), exh: new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10).rotateX(Math.PI / 2),
    under: new THREE.PlaneGeometry(2.7, 5.6).rotateX(-Math.PI / 2),
  };
})();
const carM = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x04060b, metalness: 0.9, roughness: 0.04, envMapIntensity: 2.2, clearcoat: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.85 }), rim: new THREE.MeshStandardMaterial({ color: 0xaab0c0, metalness: 1, roughness: 0.22 }),
  head: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 6, 5.2) }), black: new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.6 }),
  shadow: new THREE.MeshBasicMaterial({ map: radialTex, color: 0x000000, transparent: true, opacity: 0.8, depthWrite: false }),
};
const paints = {};
const paint = hex => paints[hex] ||= new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.75, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.9 });
const spriteMat = (col, o = 1) => new THREE.SpriteMaterial({ map: radialTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: o });
const headSprite = spriteMat(new THREE.Color().setRGB(1.3, 1.2, 0.95)), tailSprite = spriteMat(new THREE.Color().setRGB(1.5, 0.12, 0.12));

function makeCar(hex, player = false) {
  const g = new THREE.Group(), wheels = [];
  const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const pm = paint(hex);
  mk(carG.body, pm); mk(carG.cabin, carM.glass); mk(carG.roof, pm, 0, 1.395, 0.22);
  mk(carG.spoiler, pm, 0, 1.06, 1.97); mk(carG.strut, carM.black, -0.5, 0.98, 1.97); mk(carG.strut, carM.black, 0.5, 0.98, 1.97);
  for (const x of [-0.62, 0.62]) { mk(carG.head, carM.head, x, 0.64, -2.2); mk(carG.exh, carM.rim, x * 0.8, 0.4, 2.26); }
  const tailMat = player ? new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(4, 0.15, 0.25) }) : M.red;
  mk(carG.tail, tailMat, 0, 0.74, 2.2); mk(carG.bar, carM.black, 0, 0.44, 2.22);
  for (const [x, z] of [[-1, -1.35], [1, -1.35], [-1, 1.32], [1, 1.32]]) {
    const w = new THREE.Group(); w.position.set(x * (CAR_W / 2 - 0.07), 0.34, z);
    w.add(new THREE.Mesh(carG.tire, carM.tire), new THREE.Mesh(carG.rim, carM.rim));
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(carG.spoke, carM.black); sp.position.x = x * 0.135; sp.rotation.x = i * TAU / 5; w.add(sp); }
    g.add(w); wheels.push(w);
  }
  const sh = mk(carG.under, carM.shadow, 0, 0.02, 0); sh.renderOrder = 1;
  const sprites = [];
  const sp = (mat, x, y, z, s) => { const s1 = new THREE.Sprite(mat); s1.position.set(x, y, z); s1.scale.setScalar(s); g.add(s1); sprites.push(s1); return s1; };
  const hm = player ? headSprite : headSprite, tm = player ? tailSprite.clone() : tailSprite;
  const heads = [sp(hm, -0.62, 0.64, -2.35, player ? 0.5 : 1.6), sp(hm, 0.62, 0.64, -2.35, player ? 0.5 : 1.6)], tails = [sp(tm, -0.7, 0.74, 2.35, player ? 0.8 : 1.3), sp(tm, 0.7, 0.74, 2.35, player ? 0.8 : 1.3)];
  g.rotation.order = 'YXZ'; g.userData = { wheels, tailMat, tails, tm, heads };
  return g;
}

// ---------------------------------------------------------------- player + traffic state
const S = { mode: 'title', s: 200, d: 1.75, v: 0, lat: 0, steer: 0, drift: 0, nitro: 30, score: 0, time: 0, boost: false, shake: 0, cam: 0, rain: true, best: 0, yawOff: 0, camPsi: 0, pitch: 0, roll: 0, spin: 0, wheel: 0, scrape: 0, brake: false };
const player = makeCar(0xc4162c, true); scene.add(player);

// headlights (real lights on the player car)
const spotA = new THREE.SpotLight(0xfff2dc, 2600, 120, 0.42, 0.6, 1.5), spotB = new THREE.SpotLight(0xe6efff, 1400, 240, 0.2, 0.45, 1.3);
for (const sp of [spotA, spotB]) { sp.position.set(0, 0.8, -2); sp.target.position.set(0, 0, -40); player.add(sp, sp.target); }
const under = new THREE.PointLight(0x22e6ff, 30, 6, 2); under.position.set(0, 0.15, 0); player.add(under);
const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { c: { value: new THREE.Color(0.55, 0.6, 0.7) }, k: { value: 0.05 } },
  vertexShader: 'varying float vA; void main(){ vA=1.-uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 c; uniform float k; varying float vA; void main(){ gl_FragColor=vec4(c, vA*vA*k); }' });
for (const x of [-0.62, 0.62]) { const m = new THREE.Mesh(new THREE.ConeGeometry(4.5, 45, 20, 1, true).translate(0, -22.5, 0).rotateX(-Math.PI / 2), beamMat); m.position.set(x, 0.7, -2.3); m.renderOrder = 2; player.add(m); }
// lamp pool
const lampLights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffb868, 380, 45, 2); scene.add(l); return l; });

const PAINTS = [0xe8e8f0, 0x1d3a8a, 0xb8b8c4, 0x0e0e12, 0x7a1018, 0x2c6b4a, 0xd8a020, 0x4a2c7a];
const traffic = [];
const LANES_FWD = [1.75, 5.25], LANES_ONC = [-1.75, -5.25];
function respawn(c, first = false) {
  const onc = Math.random() < 0.5; c.v = onc ? -(16 + Math.random() * 14) : 14 + Math.random() * 12;
  for (let t = 0; t < 8; t++) {
    c.d = (onc ? LANES_ONC : LANES_FWD)[Math.random() < 0.5 ? 0 : 1];
    c.s = S.s + (first ? 60 : 380) + Math.random() * (first ? 520 : 480);
    if (!traffic.some(o => o !== c && Math.abs(o.d - c.d) < 1 && Math.abs(o.s - c.s) < 40)) break;
  }
  c.hit = 0; c.knock = 0; c.spin = 0; c.prev = 1; c.mesh.visible = true;
}
for (let i = 0; i < 16; i++) { const mesh = makeCar(PAINTS[i % PAINTS.length]); scene.add(mesh); const c = { mesh }; traffic.push(c); respawn(c, true); }

// ---------------------------------------------------------------- sparks + rain
const SP_N = 220, spPos = new Float32Array(SP_N * 3), spVel = new Float32Array(SP_N * 3), spLife = new Float32Array(SP_N);
const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ color: new THREE.Color().setRGB(6, 3, 0.8), size: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
sparks.frustumCulled = false; scene.add(sparks);
let spI = 0;
function emitSpark(p, n, spread = 6) {
  for (let i = 0; i < n; i++) { const k = spI++ % SP_N; spPos.set([p.x, p.y, p.z], k * 3); spVel.set([(Math.random() - 0.5) * spread, Math.random() * 4, (Math.random() - 0.5) * spread], k * 3); spLife[k] = 0.3 + Math.random() * 0.5; }
}
const RN = 2600, rSeed = new Float32Array(RN * 6), rEnd = new Float32Array(RN * 2);
for (let i = 0; i < RN; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); rSeed.set([a, b, c, a, b, c], i * 6); rEnd[i * 2] = 0; rEnd[i * 2 + 1] = 1; }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rSeed, 3)); rainGeo.setAttribute('e', new THREE.BufferAttribute(rEnd, 1));
const rainMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { cam: { value: new THREE.Vector3() }, rv: { value: new THREE.Vector3() }, t: { value: 0 }, a: { value: 0.35 } },
  vertexShader: `attribute float e; uniform vec3 cam, rv; uniform float t; varying float vA;
    void main(){ vec3 box=vec3(70.,40.,90.); vec3 p=mod(position*box + rv*t, box)-box*.5; p.y+=box.y*.35;
      vA=(1.-clamp(length(p)/55.,0.,1.))*(1.-e*.6); vec3 w=cam+p-rv*e*.028; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.); }`,
  fragmentShader: 'uniform float a; varying float vA; void main(){ gl_FragColor=vec4(.62,.72,.95,vA*a); }' });
const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.7, 1.1); composer.addPass(bloom);
composer.addPass(new OutputPass());
const fx = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aber: { value: 0.002 }, vig: { value: 0.55 }, grain: { value: 0.045 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, aber, vig, grain; varying vec2 vUv;
    void main(){ vec2 c=vUv-.5; float d=dot(c,c); vec2 o=c*d*aber*6.;
      vec3 col=vec3(texture2D(tDiffuse,vUv+o).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-o).b);
      col*=1.-vig*d*2.3; float n=fract(sin(dot(vUv*vec2(1920.,1080.)+time,vec2(12.9898,78.233)))*43758.5453); col+=(n-.5)*grain;
      gl_FragColor=vec4(col,1.); }`,
}); composer.addPass(fx);
function onResize() { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize);

// ---------------------------------------------------------------- input + audio
const keys = {}; let touchSteer = 0, touchBoost = false, touching = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Enter') start(); if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyC') S.cam = (S.cam + 1) % 3; if (e.code === 'KeyR') { S.rain = !S.rain; toast(S.rain ? 'Rain on' : 'Rain off'); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function ptr(e) {
  touching = !!(e.touches && e.touches.length); if (!touching) { touchSteer = 0; touchBoost = false; return; }
  const f = e.touches[0].clientX / innerWidth; touchSteer = f < 0.33 ? -1 : f > 0.66 ? 1 : 0; touchBoost = f >= 0.33 && f <= 0.66; if (S.mode === 'title') start();
}
['touchstart', 'touchmove', 'touchend'].forEach(n => addEventListener(n, ptr, { passive: true }));
addEventListener('mousedown', () => { if (S.mode === 'title') start(); });
const down = (...c) => c.some(k => keys[k]);
let ac, eng, engGain, muted = false, rainGain;
function startAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; engGain = ac.createGain(); engGain.gain.value = 0.05;
    eng = [ac.createOscillator(), ac.createOscillator()]; eng[0].type = 'sawtooth'; eng[1].type = 'square';
    eng.forEach(o => { o.connect(lp); o.start(); }); lp.connect(engGain); engGain.connect(ac.destination);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = buf; n.loop = true; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    rainGain = ac.createGain(); rainGain.gain.value = 0.03; n.connect(hp); hp.connect(rainGain); rainGain.connect(ac.destination); n.start();
  } catch (e) { ac = null; }
}
function toggleMute() { muted = !muted; if (ac) ac.suspend && (muted ? ac.suspend() : ac.resume()); }
function blip(f, d = 0.1) { if (!ac || muted) return; const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d); }

// ---------------------------------------------------------------- HUD
const el = { score: $('score'), time: $('time'), speed: $('speed'), gear: $('gear'), rpm: $('rpm'), nitro: $('nitro'), toasts: $('toasts'), title: $('title'), flash: $('flash'), best: $('best') };
for (let i = 0; i < 24; i++) el.rpm.appendChild(document.createElement('i'));
function toast(text, cls = '') { const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text; el.toasts.appendChild(d); setTimeout(() => d.remove(), 1300); while (el.toasts.children.length > 3) el.toasts.firstChild.remove(); }
const GEARS = [0, 62, 105, 150, 200, 250];
function updateHud() {
  const kmh = S.v * 3.6; let g = 0; while (g < GEARS.length - 1 && kmh > GEARS[g + 1]) g++;
  const rp = clamp(0.3 + 0.7 * (kmh - GEARS[g]) / ((GEARS[g + 1] || 330) - GEARS[g]), 0, 1);
  el.speed.textContent = Math.round(kmh); el.gear.textContent = S.v < 0.5 ? 'N' : g + 1;
  [...el.rpm.children].forEach((b, i) => { b.className = i / 24 < rp ? (i > 19 ? 'on hot' : 'on') : ''; });
  el.nitro.style.width = S.nitro + '%'; el.score.textContent = String(Math.floor(S.score)).padStart(6, '0');
  el.time.textContent = String(Math.floor(S.time / 60)).padStart(2, '0') + ':' + String(Math.floor(S.time % 60)).padStart(2, '0');
}

function start() {
  startAudio(); if (S.mode === 'play') return;
  Object.assign(S, { mode: 'play', v: 0, lat: 0, steer: 0, drift: 0, nitro: 30, score: 0, time: 0, d: 1.75, yawOff: 0, spin: 0 });
  S.s = Math.max(S.s, 200); traffic.forEach(c => respawn(c, true));
  el.title.classList.add('hide'); document.body.classList.add('playing'); toast('GO', 'go');
}

// ---------------------------------------------------------------- simulation
const tmpV = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camVel = new THREE.Vector3();
let lastPos = new THREE.Vector3(), t0 = 0;
function update(dt) {
  const play = S.mode === 'play'; S.time += play ? dt : 0; t0 += dt;
  let steerIn, thr, brk = false, boostIn = false, driftKey = false;
  if (play) {
    steerIn = (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0) + touchSteer; thr = down('ArrowUp', 'KeyW') || touching; brk = down('ArrowDown', 'KeyS');
    boostIn = down('ShiftLeft', 'ShiftRight', 'KeyB') || touchBoost; driftKey = down('Space');
  } else { steerIn = clamp((1.75 + Math.sin(t0 * 0.3) * 1.2 - S.d) * 0.9 - S.lat * 0.25, -1, 1); thr = S.v < 26; }
  steerIn = clamp(steerIn, -1, 1);
  S.steer = lerp(S.steer, steerIn, Math.min(1, dt * 7)); S.brake = brk;
  S.boost = boostIn && S.nitro > 0 && thr;
  const vmax = S.boost ? 96 : 76;
  if (S.boost) { S.nitro = Math.max(0, S.nitro - 24 * dt); S.v += 30 * dt; }
  if (thr) S.v += 15 * dt * (1 - S.v / 82);
  S.v -= (brk ? 40 : 2.2) * dt + 0.0007 * S.v * S.v * dt * (thr ? 0 : 1);
  if (S.v > vmax) S.v = S.boost ? vmax : Math.max(vmax, S.v - 25 * dt);
  S.v = Math.max(0, S.v);
  const kappa = dpsi(S.s), drifting = play && driftKey && Math.abs(S.steer) > 0.25 && S.v > 28;
  S.drift = lerp(S.drift, drifting ? Math.sign(S.steer) : 0, Math.min(1, dt * 5));
  const target = S.steer * (3.2 + S.v * 0.17) * Math.min(1, S.v / 9) * (drifting ? 1.3 : 1) - kappa * S.v * S.v * 0.12 * (drifting ? 0.5 : 1);
  S.lat = lerp(S.lat, target, Math.min(1, dt * 5)); S.d += S.lat * dt;
  if (Math.abs(S.d) > 6.3) {
    S.d = Math.sign(S.d) * 6.3; if (Math.sign(S.lat) === Math.sign(S.d)) S.lat = -S.lat * 0.3;
    if (S.v > 6) { S.v *= Math.exp(-dt * 1.4); S.shake = Math.max(S.shake, 0.18); world(S.s, S.d + Math.sign(S.d) * 0.9, 0.3, tmpV); emitSpark(tmpV, 4); if (play && S.scrape <= 0) { toast('Scrape', 'bad'); S.scrape = 1.2; } }
  }
  S.scrape -= dt;
  S.s += S.v * dt; if (play) S.score += S.v * dt * 0.08;
  if (drifting) { S.nitro = Math.min(100, S.nitro + 16 * dt * (S.v / 60)); S.score += dt * S.v * 0.7; }
  S.shake *= Math.pow(0.002, dt);
  S.yawOff = lerp(S.yawOff, Math.atan2(S.lat, Math.max(S.v, 10)) + S.drift * 0.42 + S.spin, Math.min(1, dt * 8)); S.spin *= Math.pow(0.05, dt);
  S.pitch = lerp(S.pitch, (brk ? 0.02 : thr ? -0.012 : 0) + (S.boost ? -0.02 : 0), Math.min(1, dt * 4));
  S.roll = lerp(S.roll, S.lat * -0.006 - S.drift * 0.02, Math.min(1, dt * 5));
  S.wheel += S.v * dt / 0.34;

  // player mesh
  const p = at(S.s); world(S.s, S.d, 0, player.position);
  player.rotation.set(S.pitch, -(p.psi + S.yawOff), S.roll); player.visible = S.cam !== 2;
  player.userData.wheels.forEach(w => { w.rotation.x = -S.wheel; });
  player.userData.tailMat.color.setRGB(brk ? 14 : 3.5, brk ? 0.3 : 0.12, brk ? 0.4 : 0.2);
  player.userData.tm.opacity = brk ? 1 : 0.6; beamMat.uniforms.k.value = 0.035 + (S.rain ? 0.025 : 0);

  // traffic
  for (const c of traffic) {
    c.s += c.v * dt; c.d += c.knock * dt; c.knock *= Math.pow(0.2, dt); c.spin *= Math.pow(0.4, dt); c.hit -= dt;
    const dz = c.s - S.s;
    if (Math.abs(dz) > 900 || (c.v < 0 && dz < -70) || (c.v > 0 && dz < -120)) { respawn(c); continue; }
    const pp = at(c.s); world(c.s, c.d, 0, c.mesh.position);
    c.mesh.rotation.y = -(pp.psi + (c.v < 0 ? Math.PI : 0) + c.spin); c.mesh.userData.wheels.forEach(w => { w.rotation.x -= c.v * dt / 0.34 * (c.v < 0 ? -1 : 1); });
    if (!play) continue;
    if (c.hit <= 0 && Math.abs(dz) < 4.5 && Math.abs(c.d - S.d) < 1.95) {
      c.hit = 1.5; c.knock = Math.sign(c.d - S.d || 1) * 6; c.spin = Math.sign(c.knock) * 0.6; S.lat -= c.knock * 0.6; S.v *= 0.35; S.nitro *= 0.5; S.shake = 0.9; S.spin = -Math.sign(c.knock) * 0.3;
      emitSpark(tmpV.copy(c.mesh.position).setY(0.6), 40, 14); toast('Collision', 'bad'); el.flash.classList.add('on'); setTimeout(() => el.flash.classList.remove('on'), 90); blip(80, 0.3);
    }
    const sgn = Math.sign(dz) || 1;
    if (sgn !== c.prev) { c.prev = sgn; if (c.hit <= 0 && Math.abs(c.d - S.d) < 3.6 && S.v > 25) { const b = c.v < 0 ? 100 : 50; S.score += b; S.nitro = Math.min(100, S.nitro + 8); toast(`Close call +${b}`, 'gold'); blip(880, 0.08); } }
  }
  S.best = Math.max(S.best, S.score);

  // lamp light pool
  const j0 = Math.floor((S.s - 20) / 30);
  lampLights.forEach((l, i) => { const j = j0 + i; world(j * 30, (j % 2 ? 1 : -1) * 5.3, 8.4, l.position); });

  // sparks
  for (let i = 0; i < SP_N; i++) if (spLife[i] > 0) { spLife[i] -= dt; spVel[i * 3 + 1] -= 14 * dt; spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt; if (spPos[i * 3 + 1] < 0) { spPos[i * 3 + 1] = 0; spVel[i * 3 + 1] *= -0.3; } if (spLife[i] <= 0) spPos[i * 3 + 1] = -50; }
  spGeo.attributes.position.needsUpdate = true;
  if (drifting) { world(S.s, S.d - S.drift * 0.0, 0.1, tmpV); emitSpark(tmpV, 1, 3); }

  // camera
  const fwdPsi = p.psi + S.yawOff * 0.35; S.camPsi = lerp(S.camPsi || fwdPsi, fwdPsi, Math.min(1, dt * 6));
  const fx_ = Math.sin(S.camPsi), fz_ = -Math.cos(S.camPsi), px = player.position.x, pz = player.position.z;
  if (S.cam === 2) { camPos.set(px + fx_ * 0.4, 0.95, pz + fz_ * 0.4); camLook.set(px + fx_ * 30, 0.9, pz + fz_ * 30); }
  else { const back = (S.cam === 1 ? 5 : 7) + S.v * 0.012, hgt = S.cam === 1 ? 1.7 : 2.7; camPos.set(px - fx_ * back, hgt + (S.boost ? -0.2 : 0), pz - fz_ * back); camLook.set(px + fx_ * 12, 1.1, pz + fz_ * 12); }
  if (S.cam === 2) camera.position.copy(camPos); else camera.position.lerp(camPos, 1 - Math.exp(-dt * 14));
  if (S.shake > 0.01) camera.position.add(tmpV.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(S.shake * 0.25 + (S.boost ? 0.03 : 0)));
  camera.lookAt(camLook); camera.rotateZ(S.roll * -2.2);
  const fov = (S.cam === 2 ? 70 : 62) + S.v * 0.22 + (S.boost ? 10 : 0); camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4)); camera.updateProjectionMatrix();
  camVel.copy(player.position).sub(lastPos).divideScalar(Math.max(dt, 1e-3)); lastPos.copy(player.position);
  sky.position.copy(camera.position); skyMat.uniforms.time.value = t0;
  rainMat.uniforms.cam.value.copy(camera.position); rainMat.uniforms.rv.value.set(-camVel.x, -9 - 0, -camVel.z).add(tmpV.set(0, -8, 0)); rainMat.uniforms.t.value = t0; rainMat.uniforms.a.value = S.rain ? 0.32 : 0; rain.visible = S.rain;
  fx.uniforms.time.value = t0 % 100; fx.uniforms.aber.value = 0.0015 + S.v / 80 * 0.003 + (S.boost ? 0.004 : 0) + S.shake * 0.004;
  if (eng) { const f = 38 + (S.v * 3.6 % 70) * 1.4 + S.v * 0.6; eng[0].frequency.value = f; eng[1].frequency.value = f * 0.503; engGain.gain.value = muted ? 0 : 0.035 + (thr ? 0.02 : 0); }
  updateHud(); el.best.textContent = S.best > 0 ? 'Best ' + Math.floor(S.best) : '';
  updateChunks(S.s);
}

updateChunks(S.s, true);
let last = performance.now();
renderer.setAnimationLoop(now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); composer.render(); });
window.__g = { S, camera, scene, traffic, renderer };
document.body.classList.add('ready');
