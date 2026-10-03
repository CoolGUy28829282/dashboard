// NEON BAY world: a Miami x cyberpunk city on a 18x16 block grid with beach, pier, port, downtown towers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Grid, mulberry32, colorize, canvasTex, col, clamp, lerp, TAU } from './util.js';

export const P = 96, ROAD = 16, BLK = 80, NBX = 18, NBZ = 16, W = NBX * P, H = NBZ * P, X0 = -W / 2, Z0 = -H / 2, X1 = W / 2, Z1 = Z0 + H;
export const lineX = i => X0 + i * P, lineZ = j => Z0 + j * P;
export const blockCenter = (bx, bz) => ({ x: X0 + bx * P + P / 2, z: Z0 + bz * P + P / 2 });
export const BEACH = { board: X1 + 16, sand: X1 + 34, shore: X1 + 116, end: X1 + 150 };
export const BOUNDS = { x0: X0 - 14, x1: X1 + 112, z0: Z0 - 14, z1: Z1 + 14 };
export const PIER = { z: Z0 + H * 0.42, x0: X1 + 34, x1: X1 + 250, hw: 3.2, y: 0.45 };

const DISTRICT_NAMES = { deco: 'Ocean Drive', neon: 'Neon Mile', downtown: 'Chrome Heights', arts: 'Wynwood Arts', port: 'Harbor Yards', park: 'Palm Gardens', mid: 'Little Havana' };
const NAMES_X = ['Bay Shore Dr', '2nd Ave', 'Flagler St', '4th Ave', 'Wynwood Way', 'Biscayne Blvd', 'Chrome Ave', 'Brickell Ave', 'Circuit Ave', 'Galaxy Ave', 'Magnolia Ave', 'Calle Ocho', 'Neon Blvd', 'Synth St', 'Arcade Ave', 'Collins Ave', 'Washington Ave', 'Alton Rd', 'Ocean Drive'];
const NAMES_Z = ['Harbor Rd', 'NW 36th St', 'Lincoln Rd', 'Española Way', 'Coral Way', 'Venetian Cswy', 'Palm Ave', 'Tech Row', 'Mainframe St', 'Sunset Blvd', 'Marina Blvd', 'Dixie Hwy', 'Container Rd', 'Dock St', 'Freight Ln', 'Seawall Rd', 'Pier Rd'];
const PARKS = new Set(['4,10', '5,4', '13,12', '16,8', '2,12', '10,1']);
export function districtOf(bx, bz) {
  if (PARKS.has(bx + ',' + bz)) return 'park';
  if (bx >= 15) return 'deco';
  if (bx >= 12) return 'neon';
  if (bx >= 6 && bx <= 11 && bz >= 3 && bz <= 10) return 'downtown';
  if (bz >= 12 && bx <= 11) return 'port';
  if (bx <= 3 && bz >= 1 && bz <= 9) return 'arts';
  return 'mid';
}

const PASTELS = ['#ff9ec8', '#8fe8e0', '#fff3a8', '#ffd0b0', '#c9b6ff', '#ffffff', '#ff8fa3', '#9ee6ff', '#b8f5c0'];
const HAVANA = ['#f4c58a', '#e88d6b', '#7fc4c8', '#f2e0a0', '#d96c8a', '#9bb8e8', '#cfe3a0'];
const GLASS = ['#6a86b0', '#4d6a8f', '#7a5fa0', '#5f8f9a', '#8a7ab8'];
const NEONS = ['#ff2d95', '#22e6ff', '#ffb02e', '#8cff5a', '#b86bff'];
const BOX_COLORS = ['#c8372d', '#2d6fc8', '#e0a82e', '#3f9a5a', '#d8d8d8', '#7a4ab8', '#e8683a'];

// ------------------------------------------------------------------ textures
function facadeTex(kind) {
  const rg = mulberry32(kind.length * 977 + 3);
  if (kind === 'deco') { // 4x4 cells of 3 m, pastel stucco: tile 12 x 12 m
    const map = canvasTex(256, 256, (g) => { g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = c * 64, y = r * 64; g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x, y + 3, 64, 3); g.fillStyle = '#1a2438'; g.fillRect(x + 17, y + 14, 30, 40); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x + 14, y + 11, 36, 4); g.fillRect(x + 14, y + 52, 36, 3); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 12, y + 6, 40, 5); g.fillStyle = 'rgba(140,170,220,.18)'; g.fillRect(x + 17, y + 14, 30, 8); } });
    const em = canvasTex(256, 256, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (rg() < 0.38) { g.fillStyle = ['#ffd9a0', '#ffe9c4', '#ffb4d8', '#a8ecff'][Math.floor(rg() * 4)]; g.fillRect(c * 64 + 17, r * 64 + 14, 30, 40); } });
    return { map, em, tw: 12, th: 12, rough: 0.8, metal: 0.05 };
  }
  if (kind === 'mid') { // 8 x 16 cells of 3.2 m
    const map = canvasTex(256, 512, (g) => { g.fillStyle = '#d6d8de'; g.fillRect(0, 0, 256, 512); for (let r = 0; r < 16; r++) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, r * 32, 256, 3); for (let c = 0; c < 8; c++) { g.fillStyle = '#0b1120'; g.fillRect(c * 32 + 5, r * 32 + 6, 22, 21); g.fillStyle = 'rgba(130,160,220,.14)'; g.fillRect(c * 32 + 5, r * 32 + 6, 22, 5); } } for (let c = 0; c <= 8; c++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(c * 32 - 1, 0, 2, 512); } });
    const em = canvasTex(256, 512, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512); for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) if (rg() < (r > 13 ? 0.7 : 0.33)) { g.fillStyle = ['#ffd9a0', '#ffe9c4', '#bfe0ff', '#ffb4d8'][Math.floor(rg() * 4)]; g.globalAlpha = 0.55 + rg() * 0.45; g.fillRect(c * 32 + 5, r * 32 + 6, 22, 21); } g.globalAlpha = 1; });
    return { map, em, tw: 25.6, th: 51.2, rough: 0.7, metal: 0.1 };
  }
  if (kind === 'glass') { // 8 x 16 cells of 3 m, dark curtain wall
    const map = canvasTex(256, 512, (g) => { const gr = g.createLinearGradient(0, 0, 256, 512); gr.addColorStop(0, '#9fb4d4'); gr.addColorStop(1, '#6c7fa0'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512); g.fillStyle = 'rgba(10,16,32,.78)'; for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) g.fillRect(c * 32 + 2, r * 32 + 2, 28, 28); g.fillStyle = 'rgba(255,255,255,.08)'; for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) g.fillRect(c * 32 + 2, r * 32 + 2, 28, 7); });
    const em = canvasTex(256, 512, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 512); for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) if (rg() < 0.42) { g.fillStyle = ['#cfe6ff', '#ffe6bf', '#ffffff', '#ff9fd0', '#8ff0ff'][Math.floor(rg() * 5)]; g.globalAlpha = 0.5 + rg() * 0.5; g.fillRect(c * 32 + 4, r * 32 + 4, 24, 24); } g.globalAlpha = 1; });
    return { map, em, tw: 24, th: 48, rough: 0.16, metal: 0.85 };
  }
  if (kind === 'ind') { // corrugated, tile 24 x 12
    const map = canvasTex(256, 128, (g) => { g.fillStyle = '#b9bdc6'; g.fillRect(0, 0, 256, 128); for (let x = 0; x < 256; x += 4) { g.fillStyle = x % 8 ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.12)'; g.fillRect(x, 0, 2, 128); } g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 60, 256, 3); for (let c = 0; c < 4; c++) { g.fillStyle = '#26303f'; g.fillRect(c * 64 + 14, 10, 36, 14); } });
    const em = canvasTex(256, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128); for (let c = 0; c < 4; c++) if (rg() < 0.4) { g.fillStyle = '#ffd9a0'; g.fillRect(c * 64 + 14, 10, 36, 14); } });
    return { map, em, tw: 24, th: 12, rough: 0.75, metal: 0.35 };
  }
  const map = canvasTex(128, 128, (g) => { g.fillStyle = '#efe9de'; g.fillRect(0, 0, 128, 128); const id = g.getImageData(0, 0, 128, 128); for (let i = 0; i < id.data.length; i += 4) { const n = (rg() - 0.5) * 14; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0); });
  const em = canvasTex(8, 8, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 8, 8); });
  return { map, em, tw: 20, th: 20, rough: 0.85, metal: 0.02 };
}

function asphalt(plain) {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#2b2d34'; g.fillRect(0, 0, w, h); const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 24; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n * 1.1; } g.putImageData(id, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 36; i++) g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 90, 2 + Math.random() * 5);
    if (plain) return; const px = m => (m + 8) / 16 * w; // across 16 m
    for (const m of [-5.7, -2, 2, 5.7]) for (const o of [-0.6, 0.6]) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(px(m + o) - 12, 0, 24, h); }
    g.fillStyle = '#e9c24a'; g.fillRect(px(-0.22) - 3, 0, 6, h); g.fillRect(px(0.22) - 3, 0, 6, h);
    g.fillStyle = '#e8e8ec'; g.fillRect(px(-7.55) - 5, 0, 10, h); g.fillRect(px(7.55) - 5, 0, 10, h);
    for (const m of [-3.85, 3.85]) for (const y0 of [0, 512]) g.fillRect(px(m) - 3.5, y0 + 10, 7, 170);
  });
}
const zebraTex = canvasTex(512, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(235,235,240,.92)'; const n = 16; for (let i = 0; i < n; i += 2) g.fillRect(i * w / n, 0, w / n, h); });
const radialTex = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, true, false);

const SIGN_TEXT = ['HOTEL', 'BAR', 'CLUB', '24H', 'TACOS', 'PIZZA', 'ラーメン', '夜', 'SALON', 'OPEN', 'CAFÉ', 'LIQUOR', 'ARCADE', 'NOODLES', 'CIGARS', 'MOTEL'];
const AD_TEXT = [['NEXUS', 'CORP'], ['SYNTH//COLA', 'ICE COLD'], ['VOID RAMEN', '24H'], ['OMNI BANK', '信用']];
function signAtlas() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    SIGN_TEXT.forEach((t, i) => { const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 256, c = NEONS[i % 5]; g.save(); g.translate(cx, cy); g.fillStyle = 'rgba(6,3,14,.9)'; g.fillRect(14, 14, 228, 228); g.strokeStyle = c; g.lineWidth = 7; g.shadowColor = c; g.shadowBlur = 16; g.strokeRect(22, 22, 212, 212); g.fillStyle = c; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${t.length > 5 ? 42 : 62}px sans-serif`; g.fillText(t, 128, 130); g.restore(); });
  }, true, false);
}
function adAtlas() {
  return canvasTex(1024, 512, (g) => {
    AD_TEXT.forEach((t, i) => { const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 256, c1 = NEONS[i % 5], c2 = NEONS[(i + 2) % 5]; g.save(); g.translate(cx, cy); const gr = g.createLinearGradient(0, 0, 512, 256); gr.addColorStop(0, '#05030c'); gr.addColorStop(1, '#160a28'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.strokeStyle = c2; g.globalAlpha = 0.35; g.lineWidth = 2; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 60, 256); g.stroke(); } g.globalAlpha = 1; g.fillStyle = c1; g.shadowColor = c1; g.shadowBlur = 22; g.font = 'bold 66px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t[0], 256, 100); g.fillStyle = c2; g.shadowColor = c2; g.font = 'bold 40px sans-serif'; g.fillText(t[1], 256, 190); g.strokeStyle = c1; g.lineWidth = 6; g.strokeRect(8, 8, 496, 240); g.restore(); });
  }, true, false);
}
function muralAtlas() {
  const rg = mulberry32(99);
  return canvasTex(1024, 1024, (g) => {
    for (let i = 0; i < 4; i++) { const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 512; g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, 512, 512); g.clip(); const bg = g.createLinearGradient(0, 0, 512, 512); bg.addColorStop(0, NEONS[i % 5]); bg.addColorStop(1, '#10122a'); g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
      for (let k = 0; k < 26; k++) { g.globalAlpha = 0.55 + rg() * 0.4; g.fillStyle = [...NEONS, '#ffffff', '#101020', '#ffe0f0'][Math.floor(rg() * 8)]; g.beginPath(); const x = rg() * 512, y = rg() * 512, r = 20 + rg() * 110; if (k % 3 === 0) g.arc(x, y, r, 0, TAU); else if (k % 3 === 1) g.rect(x - r, y - r * 0.3, r * 2, r * 0.6); else { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); } g.fill(); }
      g.globalAlpha = 1; g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 504); g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.fillText(['ARTE', 'VIVA', 'NEON', 'BAY'][i], 30, 90); g.restore(); }
  }, true, false);
}
function setCell(g, col, row, cols, rows) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / cols, (rows - 1 - row + uv.getY(i)) / rows); return g; }

// ------------------------------------------------------------------ geometry helpers
function boxUV(w, h, d, tw, th, uOff) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i, fw = f < 2 ? d : w; if (f === 2 || f === 3) uv.setXY(k, 0.02, 0.02); else uv.setXY(k, uv.getX(k) * fw / tw + uOff, uv.getY(k) * h / th); }
  return g;
}

export async function buildWorld(G, progress = () => {}) {
  const scene = G.scene, rng = mulberry32(1337), world = { colliders: new Grid(24), circles: new Grid(24), chunks: [], signals: [], signalStates: [], names: DISTRICT_NAMES };
  const wetUniforms = G.uniforms;
  // ---- materials
  const tex = { deco: facadeTex('deco'), mid: facadeTex('mid'), glass: facadeTex('glass'), ind: facadeTex('ind'), art: facadeTex('art') };
  const mats = {};
  for (const k in tex) mats[k] = new THREE.MeshStandardMaterial({ map: tex[k].map, vertexColors: true, roughness: tex[k].rough, metalness: tex[k].metal, emissive: 0xffffff, emissiveMap: tex[k].em, emissiveIntensity: 1, envMapIntensity: k === 'glass' ? 1.6 : 0.5 });
  mats.trim = new THREE.MeshBasicMaterial({ vertexColors: true }); mats.shop = new THREE.MeshBasicMaterial({ vertexColors: true });
  mats.concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.55, metalness: 0.7 });
  mats.red = new THREE.MeshBasicMaterial({ color: col('#ff2a2a', 5) });
  const signTex = signAtlas(), adTex = adAtlas(), muralTex = muralAtlas();
  mats.sign = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  mats.mural = new THREE.MeshStandardMaterial({ map: muralTex, roughness: 0.9 });
  mats.ad = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: adTex } }]), { time: G.uniforms.time, night: G.uniforms.night }),
    vertexShader: 'varying vec2 vUv;\n#include <fog_pars_vertex>\nvoid main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.); vUv=uv; gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: '#include <fog_pars_fragment>\nuniform sampler2D map; uniform float time, night; varying vec2 vUv;\nvoid main(){ vec2 uv=vUv; float g=step(.985,fract(sin(floor(time*6.+uv.x*2.)*12.9)*43758.)); uv.x+=g*.01*sin(uv.y*40.+time*30.);\n vec3 c=texture2D(map,uv).rgb; float scan=.82+.18*sin(vUv.y*300.-time*8.); c*=scan*(.95+.05*sin(time*23.))*(.9+1.6*night);\n float fogF=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth); c*=(1.-fogF); gl_FragColor=vec4(c,1.); }' });
  const roadTex = asphalt(false), plainTex = asphalt(true); roadTex.repeat.set(1, 1);
  mats.road = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, metalness: 0.2, envMapIntensity: 1.2 });
  mats.roadPlain = new THREE.MeshStandardMaterial({ map: plainTex, roughness: 0.85, metalness: 0.2, envMapIntensity: 1.2 });
  mats.zebra = new THREE.MeshStandardMaterial({ map: zebraTex, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  mats.ground = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95 });
  mats.grass = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 1 });
  mats.vegetation = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  mats.lampHead = new THREE.MeshBasicMaterial({ color: col('#ffd9a0', 4) });
  mats.pond = new THREE.MeshStandardMaterial({ color: 0x1d6a8a, roughness: 0.1, metalness: 0.6, envMapIntensity: 2 });
  mats.wood = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.12})`; g.fillRect(0, y, w, 2); g.fillStyle = `rgba(255,220,170,${Math.random() * 0.1})`; g.fillRect(0, y + 3, w, 12); } }), roughness: 0.8 });
  mats.sand = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e8d3a2'; g.fillRect(0, 0, w, h); const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 22; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0); }), roughness: 1 });
  mats.sand.map.repeat.set(60, 60);
  world.mats = mats; world.tex = tex;

  // ---- chunk containers
  const chunkMap = new Map();
  const chunkOf = (bx, bz) => { const k = (bx >> 1) + ',' + (bz >> 1); let c = chunkMap.get(k); if (!c) { c = { parts: {}, x: X0 + ((bx >> 1) * 2 + 1) * P, z: Z0 + ((bz >> 1) * 2 + 1) * P }; chunkMap.set(k, c); } return c; };
  const put = (c, key, geo) => { (c.parts[key] ||= []).push(geo); };
  const addCollider = (x0, z0, x1, z1, h = 10) => { const b = { x0, z0, x1, z1, h }; world.colliders.add(b, x0, z0, x1, z1); return b; };
  const addCircle = (x, z, r) => { const c = { x, z, r }; world.circles.add(c, x - r, z - r, x + r, z + r); };

  const palms = [], lamps = [], umbrellas = [], towers = [];
  const palm = (x, z) => { palms.push({ x, z, s: 0.8 + rng() * 0.5, r: rng() * TAU }); addCircle(x, z, 0.4); };
  const lamp = (x, z, rot) => { lamps.push({ x, z, rot }); addCircle(x, z, 0.25); };

  // ---- building helpers (all in chunk c)
  const facade = (c, key, w, h, d, x, y, z, color) => { const g = boxUV(w, h, d, tex[key].tw, tex[key].th, Math.floor(rng() * 8) / 8).translate(x, y + h / 2, z); colorize(g, new THREE.Color(color)); put(c, key, g); };
  const trim = (c, w, h, d, x, y, z, color) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); colorize(g, new THREE.Color(color)); put(c, 'trim', g); };
  const dark = (c, w, h, d, x, y, z) => put(c, 'dark', new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  const cyl = (c, r, h, x, y, z) => put(c, 'dark', new THREE.CylinderGeometry(r, r, h, 10).translate(x, y + h / 2, z));
  const slabC = (c, w, h, d, x, y, z, color) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); colorize(g, new THREE.Color(color)); put(c, 'concrete', g); };
  const signPlane = (c, side, p, y, size, cell) => { // neon sign on outward facade
    const g = new THREE.PlaneGeometry(size, size); setCell(g, cell % 4, Math.floor(cell / 4), 4, 4);
    const off = (rng() - 0.5) * 0.5; let x = p.cx, z = p.cz;
    if (side === 'n') { g.rotateY(Math.PI); x += off * p.w; z -= p.d / 2 + 0.15; } else if (side === 's') { x += off * p.w; z += p.d / 2 + 0.15; } else if (side === 'w') { g.rotateY(-Math.PI / 2); x -= p.w / 2 + 0.15; z += off * p.d; } else { g.rotateY(Math.PI / 2); x += p.w / 2 + 0.15; z += off * p.d; }
    g.translate(x, y + size / 2, z); put(c, 'sign', g);
  };
  const flatPlane = (c, key, side, p, y, w, h, cell, cols, rows) => { // ad / mural flush on facade
    const g = new THREE.PlaneGeometry(w, h); setCell(g, cell % cols, Math.floor(cell / cols), cols, rows); const off = (rng() - 0.5) * 0.3; let x = p.cx, z = p.cz;
    if (side === 'n') { g.rotateY(Math.PI); x += off * p.w; z -= p.d / 2 + 0.2; } else if (side === 's') { x += off * p.w; z += p.d / 2 + 0.2; } else if (side === 'w') { g.rotateY(-Math.PI / 2); x -= p.w / 2 + 0.2; z += off * p.d; } else { g.rotateY(Math.PI / 2); x += p.w / 2 + 0.2; z += off * p.d; }
    g.translate(x, y + h / 2, z); put(c, key, g);
  };
  const frontStrip = (c, side, p, y, hgt, color, th = 0.25) => { // shopfront band on an outward side
    const L = (side === 'n' || side === 's' ? p.w : p.d) - 1.5;
    const shop = (w, h, d, x, yy, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, yy + h / 2, z); colorize(g, new THREE.Color(color)); put(c, 'shop', g); };
    if (side === 'n') shop(L, hgt, th, p.cx, y, p.cz - p.d / 2 - th / 2); else if (side === 's') shop(L, hgt, th, p.cx, y, p.cz + p.d / 2 + th / 2);
    else if (side === 'w') shop(th, hgt, L, p.cx - p.w / 2 - th / 2, y, p.cz); else shop(th, hgt, L, p.cx + p.w / 2 + th / 2, y, p.cz);
  };
  const roofStuff = (c, p, h) => { const n = 1 + Math.floor(rng() * 3); for (let i = 0; i < n; i++) dark(c, 1.5 + rng() * 2, 1 + rng() * 1.2, 1.5 + rng() * 2, p.cx + (rng() - 0.5) * p.w * 0.6, h, p.cz + (rng() - 0.5) * p.d * 0.6); if (rng() < 0.3) cyl(c, 1.2, 2.6, p.cx + (rng() - 0.5) * p.w * 0.5, h, p.cz + (rng() - 0.5) * p.d * 0.5); };
  const sidesOf = (p, cols, rows) => { const s = []; if (p.r === 0) s.push('n'); if (p.r === rows - 1) s.push('s'); if (p.c === 0) s.push('w'); if (p.c === cols - 1) s.push('e'); return s; };
  const grid = (cols, rows, gap = 4, lot = 68) => { const cw = (lot - (cols - 1) * gap) / cols, rh = (lot - (rows - 1) * gap) / rows, out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ c, r, cx: -lot / 2 + cw / 2 + c * (cw + gap), cz: -lot / 2 + rh / 2 + r * (rh + gap), w: cw, d: rh }); return out; };

  function building(c, bx, bz, p, h, key, color, style) {
    const ax = p.cx, az = p.cz; facade(c, key, p.w, h, p.d, ax, 0.25, az, color); addCollider(ax - p.w / 2, az - p.d / 2, ax + p.w / 2, az + p.d / 2, h);
    const sides = sidesOf(p.__abs ? p : { ...p }, p.cols, p.rows), ac = NEONS[Math.floor(rng() * 5)], ac2 = NEONS[Math.floor(rng() * 5)];
    roofStuff(c, p, h + 0.25);
    if (style === 'deco') { trim(c, p.w + 0.3, 0.3, p.d + 0.3, ax, h + 0.15, az, ac); trim(c, p.w + 0.5, 0.25, p.d + 0.5, ax, h * 0.5, az, ac2); }
    if (style === 'neon') { trim(c, p.w + 0.3, 0.4, p.d + 0.3, ax, h + 0.1, az, ac); for (let i = 1; i < 4; i++) if (rng() < 0.6) trim(c, p.w + 0.4, 0.3, p.d + 0.4, ax, h * i / 4, az, NEONS[(i + Math.floor(rng() * 5)) % 5]); }
    for (const s of sides) {
      const warm = ['#ffd9a0', '#ff9fd0', '#8ff0ff', '#ffb04a', '#c9a0ff'][Math.floor(rng() * 5)];
      if (style !== 'ind') frontStrip(c, s, p, 0.45, 3.0, warm, 0.18);
      if (rng() < (style === 'neon' ? 0.9 : style === 'deco' ? 0.6 : 0.35)) signPlane(c, s, p, 3.6 + rng() * Math.min(10, h * 0.5), 2.4 + rng() * 1.6, Math.floor(rng() * 16));
      if ((style === 'neon' || style === 'glass') && h > 20 && rng() < 0.5) flatPlane(c, 'ad', s, p, Math.min(h - 12, 12 + rng() * 22), 16, 8, Math.floor(rng() * 4), 2, 2);
      if (style === 'arts' && rng() < 0.85) flatPlane(c, 'mural', s, p, 0.6, Math.min(p.w, p.d) * 0.8, Math.min(h - 1.5, 9), Math.floor(rng() * 4), 2, 2);
    }
    if (h > 40) { trim(c, 0.5, h * 0.9, 0.5, ax - p.w / 2 + 0.2, 0.25, az - p.d / 2 + 0.2, ac); trim(c, 0.5, h * 0.9, 0.5, ax + p.w / 2 - 0.2, 0.25, az + p.d / 2 - 0.2, ac2); }
  }

  function buildBlock(bx, bz) {
    const c = chunkOf(bx, bz), { x, z } = blockCenter(bx, bz), d = districtOf(bx, bz), r0 = mulberry32(bx * 7919 + bz * 104729 + 17);
    const R = () => r0(); const abs = (p, cols, rows) => ({ ...p, cx: p.cx + x, cz: p.cz + z, cols, rows, __abs: true });
    slabC(c, BLK, 0.25, BLK, x, 0, z, d === 'port' ? '#6b6e76' : '#a9a8a6');
    if (d === 'park') {
      const g = new THREE.PlaneGeometry(BLK - 10, BLK - 10).rotateX(-Math.PI / 2).translate(x, 0.27, z); put(c, 'grass', g);
      put(c, 'pond', new THREE.CircleGeometry(12, 28).rotateX(-Math.PI / 2).translate(x + (R() - 0.5) * 20, 0.3, z + (R() - 0.5) * 20));
      for (let i = 0; i < 26; i++) { const px = x + (R() - 0.5) * 66, pz = z + (R() - 0.5) * 66; if (Math.hypot(px - x, pz - z) > 14) palm(px, pz); }
      return;
    }
    const sets = { deco: [3, 2, 'deco'], neon: [3, 3, 'mid'], mid: [3, 3, 'mid'], arts: [3, 2, 'art'], downtown: [2, 2, 'glass'] };
    if (d === 'port') { portBlock(c, x, z, R); return; }
    const [cols, rows, key] = sets[d];
    for (const p0 of grid(cols, rows, d === 'downtown' ? 5 : 4)) {
      const p = abs(p0, cols, rows);
      if (d === 'downtown') {
        const tall = bx === 9 && bz === 6 ? 330 : 90 + R() * 150, col = GLASS[Math.floor(R() * 5)], tw = p.w - 6, td = p.d - 6;
        facade(c, 'glass', p.w, 10, p.d, p.cx, 0.25, p.cz, col); addCollider(p.cx - p.w / 2, p.cz - p.d / 2, p.cx + p.w / 2, p.cz + p.d / 2, tall);
        const tp = { ...p, w: tw, d: td };
        facade(c, 'glass', tw, tall, td, p.cx, 10.25, p.cz, col); facade(c, 'glass', tw * 0.7, tall * 0.25, td * 0.7, p.cx, 10.25 + tall, p.cz, col);
        const top = 10.25 + tall * 1.25, ac = NEONS[Math.floor(R() * 5)], ac2 = NEONS[Math.floor(R() * 5)];
        dark(c, 0.6, 28 + R() * 16, 0.6, p.cx, top, p.cz); put(c, 'red', new THREE.SphereGeometry(0.9, 6, 4).translate(p.cx, top + 36, p.cz));
        for (const [sx, sz] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) trim(c, 0.6, tall * 1.2, 0.6, p.cx + sx * (tw / 2 + 0.05), 10.25, p.cz + sz * (td / 2 + 0.05), sx * sz > 0 ? ac : ac2);
        for (let k = 1; k < 5; k++) if (R() < 0.7) trim(c, tw + 0.5, 0.5, td + 0.5, p.cx, 10.25 + tall * k / 5, p.cz, NEONS[(k + Math.floor(R() * 5)) % 5]);
        trim(c, p.w + 0.4, 0.4, p.d + 0.4, p.cx, 10.3, p.cz, ac);
        for (const s of ['n', 's', 'w', 'e']) { if (R() < 0.7) flatPlane(c, 'ad', s, tp, 28 + R() * Math.min(60, tall * 0.5), 20, 10, Math.floor(R() * 4), 2, 2); if (R() < 0.5) signPlane(c, s, p, 3.6 + R() * 4, 3, Math.floor(R() * 16)); frontStrip(c, s, p, 0.45, 3, ['#ffd9a0', '#8ff0ff', '#ff9fd0'][Math.floor(R() * 3)], 0.18); }
        if (bx === 9 && bz === 6) for (let k = 1; k < 7; k++) trim(c, tw + 2, 1.2, td + 2, p.cx, 10 + tall * k / 6.5, p.cz, NEONS[k % 5]);
        continue;
      }
      let h, color, style = key;
      if (d === 'deco') { h = 10 + Math.floor(R() * 5) * 3; color = PASTELS[Math.floor(R() * PASTELS.length)]; style = 'deco'; }
      else if (d === 'neon') { h = 24 + R() * 55; color = ['#9aa2c0', '#c8b0d8', '#a0b8d0', '#d0c0a0'][Math.floor(R() * 4)]; style = 'neon'; }
      else if (d === 'arts') { h = 8 + R() * 11; color = ['#ffffff', '#ffe9f0', '#e9ffff', '#fff6d8'][Math.floor(R() * 4)]; style = 'arts'; }
      else { h = 14 + R() * 32; color = HAVANA[Math.floor(R() * HAVANA.length)]; style = 'mid'; }
      building(c, bx, bz, p, h, key, color, style);
    }
    if (d === 'deco' && bx === NBX - 1) for (let k = -3; k <= 3; k++) { /* beachfront palms between block and road handled in props */ }
  }

  function portBlock(c, x, z, R) {
    if (R() < 0.45) { // warehouses
      for (const zz of [-18, 18]) { const w = 62, dd = 26, h = 11 + R() * 5; const p = { cx: x, cz: z + zz, w, d: dd, cols: 1, rows: 2, r: zz < 0 ? 0 : 1, c: 0 }; facade(c, 'ind', w, h, dd, p.cx, 0.25, p.cz, ['#c0c4cc', '#a8b0bc', '#c8b8a0'][Math.floor(R() * 3)]); addCollider(p.cx - w / 2, p.cz - dd / 2, p.cx + w / 2, p.cz + dd / 2, h); roofStuff(c, p, h + 0.25); trim(c, w + 0.2, 0.3, dd + 0.2, p.cx, h + 0.1, p.cz, NEONS[Math.floor(R() * 5)]); flatPlane(c, 'ad', zz < 0 ? 'n' : 's', p, h * 0.55, 14, 7, Math.floor(R() * 4), 2, 2); }
    } else { // container yard + crane
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const hgt = 1 + Math.floor(R() * 3); if (R() < 0.12) continue; const cx = x - 30 + i * 14, cz = z - 28 + j * 18; for (let k = 0; k < hgt; k++) facade(c, 'ind', 12, 2.6, 2.6, cx, 0.25 + k * 2.6, cz, BOX_COLORS[Math.floor(R() * BOX_COLORS.length)]); addCollider(cx - 6, cz - 1.3, cx + 6, cz + 1.3, hgt * 2.6); if (R() < 0.5) { facade(c, 'ind', 12, 2.6, 2.6, cx, 0.25, cz + 3.4, BOX_COLORS[Math.floor(R() * BOX_COLORS.length)]); addCollider(cx - 6, cz + 2.1, cx + 6, cz + 4.7, 2.6); } }
      if (R() < 0.7) { const cx = x, cz = z + 33; for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dark(c, 1.2, 38, 1.2, cx + sx * 16, 0.25, cz + sz * 6); dark(c, 36, 2.4, 16, cx, 38, cz); dark(c, 70, 2, 3, cx, 36, cz); put(c, 'red', new THREE.SphereGeometry(0.8, 6, 4).translate(cx, 41.5, cz)); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addCircle(cx + sx * 16, cz + sz * 6, 1); }
    }
  }

  // ---- generate all blocks (yielding for progress)
  let done = 0; const total = NBX * NBZ;
  for (let bx = 0; bx < NBX; bx++) { for (let bz = 0; bz < NBZ; bz++) { buildBlock(bx, bz); done++; } progress(0.1 + 0.4 * done / total); await new Promise(r => setTimeout(r, 0)); }

  // ---- roads, intersections, crosswalks (global meshes)
  const roadPos = [], roadUv = [], roadIdx = [], plainPos = [], plainUv = [], plainIdx = [], zebraPos = [], zebraUv = [], zebraIdx = [];
  const quad = (pos, uv, idx, x0, z0, x1, z1, y, uvs) => { const b = pos.length / 3; pos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1); uv.push(...uvs); idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); };
  for (let j = 0; j <= NBZ; j++) for (let i = 0; i < NBX; i++) { const xa = lineX(i) + ROAD / 2, xb = lineX(i + 1) - ROAD / 2, z = lineZ(j), L = xb - xa; quad(roadPos, roadUv, roadIdx, xa, z - ROAD / 2, xb, z + ROAD / 2, 0.01, [0, 0, 1, 0, 0, L / 18, 1, L / 18]); }
  for (let i = 0; i <= NBX; i++) for (let j = 0; j < NBZ; j++) { const za = lineZ(j) + ROAD / 2, zb = lineZ(j + 1) - ROAD / 2, x = lineX(i), L = zb - za; quad(roadPos, roadUv, roadIdx, x - ROAD / 2, za, x + ROAD / 2, zb, 0.01, [0, 0, 0, L / 18, 1, 0, 1, L / 18]); }
  for (let i = 0; i <= NBX; i++) for (let j = 0; j <= NBZ; j++) {
    const x = lineX(i), z = lineZ(j); quad(plainPos, plainUv, plainIdx, x - ROAD / 2, z - ROAD / 2, x + ROAD / 2, z + ROAD / 2, 0.012, [0, 0, 0, 1, 1, 0, 1, 1].map((v, k) => v * 0.9));
    world.signals.push({ i, j, x, z });
    const cw = 3.4, gap = 1.2, e = ROAD / 2 + gap;
    if (i > 0) quad(zebraPos, zebraUv, zebraIdx, x - e - cw, z - ROAD / 2, x - e, z + ROAD / 2, 0.03, [0, 0, 1, 0, 0, 1, 1, 1].length ? [0, 0, 1, 0, 0, 1, 1, 1] : []);
    if (i < NBX) quad(zebraPos, zebraUv, zebraIdx, x + e, z - ROAD / 2, x + e + cw, z + ROAD / 2, 0.03, [0, 0, 1, 0, 0, 1, 1, 1]);
    if (j > 0) quad(zebraPos, zebraUv, zebraIdx, x - ROAD / 2, z - e - cw, x + ROAD / 2, z - e, 0.03, [0, 0, 0, 1, 1, 0, 1, 1]);
    if (j < NBZ) quad(zebraPos, zebraUv, zebraIdx, x - ROAD / 2, z + e, x + ROAD / 2, z + e + cw, 0.03, [0, 0, 0, 1, 1, 0, 1, 1]);
  }
  const mkMesh = (pos, uv, idx, mat, name) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3)); g.setIndex(idx); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = name; scene.add(m); return m; };
  world.roadMesh = mkMesh(roadPos, roadUv, roadIdx, mats.road, 'roads'); mkMesh(plainPos, plainUv, plainIdx, mats.roadPlain, 'intersections'); mkMesh(zebraPos, zebraUv, zebraIdx, mats.zebra, 'zebra');
  progress(0.55); await new Promise(r => setTimeout(r, 0));

  // ---- ground, beach, ocean floor
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), mats.ground); ground.position.set(X0 + W / 2 - 1500, -0.05, Z0 + H / 2); ground.receiveShadow = true; scene.add(ground);
  const xs = [X1 + 8, BEACH.sand, X1 + 110, BEACH.end, X1 + 400], ys = [0.25, 0.2, -0.3, -2.2, -6], zs0 = Z0 - 60, zs1 = Z1 + 60, sandPos = [], sandUv = [], sandIdx = [];
  xs.forEach((xx, k) => { sandPos.push(xx, ys[k], zs0, xx, ys[k], zs1); sandUv.push(k * 3, 0, k * 3, 40); if (k < xs.length - 1) { const b = k * 2; sandIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } });
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sandPos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(sandUv, 2)); sg.setIndex(sandIdx); sg.computeVertexNormals();
  const sand = new THREE.Mesh(sg, mats.sand); sand.receiveShadow = true; scene.add(sand);
  const board = new THREE.Mesh(new THREE.BoxGeometry(BEACH.sand - BEACH.board, 0.3, H + 120).translate((BEACH.board + BEACH.sand) / 2, 0.1, Z0 + H / 2), mats.wood); board.receiveShadow = true; scene.add(board);
  mats.wood.map.repeat.set(4, 100);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(BEACH.board - X1 - 8, 0.25, H + 120).translate((X1 + 8 + BEACH.board) / 2, 0.125, Z0 + H / 2), new THREE.MeshStandardMaterial({ color: 0xb5b2ad, roughness: 0.9 })); walk.receiveShadow = true; scene.add(walk);
  // pier
  { const len = PIER.x1 - PIER.x0, deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, PIER.hw * 2).translate(PIER.x0 + len / 2, PIER.y - 0.15, PIER.z), mats.wood); deck.receiveShadow = true; scene.add(deck);
    const piles = []; for (let x = PIER.x0 + 4; x < PIER.x1; x += 8) for (const s of [-1, 1]) piles.push(new THREE.CylinderGeometry(0.28, 0.28, 6, 6).translate(x, PIER.y - 3.2, PIER.z + s * (PIER.hw - 0.4)));
    scene.add(new THREE.Mesh(mergeGeometries(piles), mats.dark));
    const pl = []; for (let x = PIER.x0 + 10; x < PIER.x1; x += 20) for (const s of [-1, 1]) { pl.push(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6).translate(x, PIER.y + 2.2, PIER.z + s * PIER.hw)); lamps.push({ x, z: PIER.z + s * PIER.hw, rot: 0, pier: true }); }
    scene.add(new THREE.Mesh(mergeGeometries(pl), mats.dark));
    const endB = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 14).translate(PIER.x1 - 2, PIER.y + 3.5, PIER.z), new THREE.MeshStandardMaterial({ color: 0xff7ab8, roughness: 0.6, emissive: 0x501030 })); scene.add(endB); addCollider(PIER.x1 - 11, PIER.z - 7, PIER.x1 + 5, PIER.z + 7, 7); }
  progress(0.62); await new Promise(r => setTimeout(r, 0));

  // ---- props along roads: palms, lamps, signals
  for (let j = 0; j <= NBZ; j++) for (let i = 0; i < NBX; i++) { const xa = lineX(i) + ROAD / 2 + 4, xb = lineX(i + 1) - ROAD / 2 - 4, z = lineZ(j); for (let x = xa + 6; x < xb - 2; x += 16) { const dz = ROAD / 2 + 1.6; const palmy = districtOf(Math.min(i, NBX - 1), Math.min(j, NBZ - 1)) !== 'downtown'; if (palmy) { palm(x, z - dz); palm(x + 8, z + dz); } } for (let x = xa + 10; x < xb; x += 32) { lamp(x, z + ROAD / 2 + 0.6, Math.PI / 2); lamp(x + 16, z - ROAD / 2 - 0.6, -Math.PI / 2); } }
  for (let i = 0; i <= NBX; i++) for (let j = 0; j < NBZ; j++) { const x = lineX(i), za = lineZ(j) + ROAD / 2 + 4, zb = lineZ(j + 1) - ROAD / 2 - 4; for (let z = za + 8; z < zb - 2; z += 16) { if ((i + j) % 2 === 0) { palm(x - ROAD / 2 - 1.6, z); palm(x + ROAD / 2 + 1.6, z + 8); } } for (let z = za + 10; z < zb; z += 32) { lamp(x + ROAD / 2 + 0.6, z, 0); lamp(x - ROAD / 2 - 0.6, z + 16, Math.PI); } }
  // beach: palms along the boardwalk, umbrellas, lifeguard towers
  for (let z = Z0; z < Z1; z += 14) { palm(BEACH.board + 2, z + 4); if (rng() < 0.7) palm(BEACH.sand + 6 + rng() * 10, z + rng() * 10); }
  for (let k = 0; k < 90; k++) { const x = BEACH.sand + 14 + rng() * 48, z = Z0 + rng() * H; if (Math.abs(z - PIER.z) < 8) continue; umbrellas.push({ x, z, c: NEONS[Math.floor(rng() * 5)], s: 0.9 + rng() * 0.3 }); }
  const towersGeo = []; for (const z of [Z0 + H * 0.2, Z0 + H * 0.65, Z0 + H * 0.88]) { const x = BEACH.sand + 40; const g1 = new THREE.BoxGeometry(2.4, 0.3, 2.4).translate(x, 2.6, z), g2 = new THREE.BoxGeometry(2, 1.6, 2).translate(x, 3.6, z), g3 = new THREE.BoxGeometry(2.8, 0.2, 2.8).translate(x, 4.6, z); colorize(g1, new THREE.Color('#ffffff')); colorize(g2, new THREE.Color('#ff7ab8')); colorize(g3, new THREE.Color('#22e6ff')); towersGeo.push(g1, g2, g3); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lg = new THREE.CylinderGeometry(0.1, 0.1, 2.6, 5).translate(x + dx * 1.1, 1.3, z + dz * 1.1); colorize(lg, new THREE.Color('#ffffff')); towersGeo.push(lg); } addCircle(x, z, 1.8); }
  { const m = new THREE.Mesh(mergeGeometries(towersGeo.map(g => g.index ? g : g)), mats.concrete); scene.add(m); }

  // ---- instanced props
  const palmGeo = (() => { const parts = [], trunkC = new THREE.Color('#7a6850'), leafA = new THREE.Color('#2f8f3c'), leafB = new THREE.Color('#1f6a30'); let y = 0, ox = 0; for (let s = 0; s < 5; s++) { const g = new THREE.CylinderGeometry(0.2 - s * 0.02, 0.26 - s * 0.02, 1.9, 6); g.translate(ox, y + 0.95, 0); colorize(g, trunkC); parts.push(g); y += 1.85; ox += 0.1; }
    for (let f = 0; f < 9; f++) { const a = f / 9 * TAU, segs = 4, pos = [], idx = [], colr = []; for (let s = 0; s <= segs; s++) { const t = s / segs, r = t * 3.4, hh = y + 0.3 + Math.sin(t * 2.2) * 0.9 - t * t * 1.6, wd = 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05; const cx = ox + Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * wd, pz = Math.cos(a) * wd; pos.push(cx + px, hh, cz + pz, cx - px, hh, cz - pz); const c = leafA.clone().lerp(leafB, t); colr.push(c.r, c.g, c.b, c.r, c.g, c.b); if (s < segs) { const b = s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); g.setIndex(idx); parts.push(g); }
    return mergeGeometries(parts); })();
  const inst = (geo, mat, list, fn) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), o = new THREE.Object3D(); list.forEach((it, i) => { fn(o, it); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }); m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = true; scene.add(m); return m; };
  inst(palmGeo, mats.vegetation, palms, (o, p) => { o.position.set(p.x, 0.25, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); });
  const lampPole = new THREE.CylinderGeometry(0.1, 0.15, 8.5, 6).translate(0, 4.25, 0), lampArm = new THREE.BoxGeometry(0.12, 0.12, 2.4).translate(0, 8.45, 1.2), lampHead = new THREE.BoxGeometry(0.5, 0.15, 1).translate(0, 8.38, 2.3);
  inst(mergeGeometries([lampPole, lampArm]), mats.dark, lamps.filter(l => !l.pier), (o, l) => { o.position.set(l.x, 0.25, l.z); o.rotation.set(0, l.rot, 0); o.scale.setScalar(1); });
  world.lampHeads = inst(lampHead, mats.lampHead, lamps.filter(l => !l.pier), (o, l) => { o.position.set(l.x, 0.25, l.z); o.rotation.set(0, l.rot, 0); });
  world.lampHeads.castShadow = false;
  const umbrellaGeo = mergeGeometries([colorize(new THREE.ConeGeometry(1.6, 0.6, 8).translate(0, 2.1, 0), new THREE.Color('#ffffff')), colorize(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5).translate(0, 1.05, 0), new THREE.Color('#dddddd'))]);
  const umbMesh = new THREE.InstancedMesh(umbrellaGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), Math.max(1, umbrellas.length)), uo = new THREE.Object3D(); umbrellas.forEach((u, i) => { uo.position.set(u.x, 0.05, u.z); uo.scale.setScalar(u.s); uo.updateMatrix(); umbMesh.setMatrixAt(i, uo.matrix); umbMesh.setColorAt(i, new THREE.Color(u.c)); }); umbMesh.frustumCulled = false; scene.add(umbMesh);
  progress(0.7); await new Promise(r => setTimeout(r, 0));

  // ---- traffic signals (instanced poles + heads + lamps)
  const sigPoles = [], approach = [[1, 0, -9.8, 9.8], [-1, 0, 9.8, -9.8], [0, 1, -9.8, -9.8], [0, -1, 9.8, 9.8]]; // [dirx,dirz,offx,offz]
  for (const s of world.signals) for (let a = 0; a < 4; a++) sigPoles.push({ x: s.x + approach[a][2], z: s.z + approach[a][3], a, s });
  const poleG = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6).translate(0, 2.6, 0), headG = new THREE.BoxGeometry(0.5, 1.3, 0.35).translate(0, 5.0, 0);
  inst(mergeGeometries([poleG, headG]), mats.dark, sigPoles, (o, p) => { o.position.set(p.x, 0.25, p.z); o.rotation.set(0, 0, 0); });
  sigPoles.forEach(p => addCircle(p.x, p.z, 0.2));
  const lampN = sigPoles.length * 3, sigLamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshBasicMaterial({ fog: false }), lampN), so = new THREE.Object3D(), tmpC = new THREE.Color();
  sigPoles.forEach((p, k) => { const dirx = approach[p.a][0], dirz = approach[p.a][1]; for (let l = 0; l < 3; l++) { so.position.set(p.x - dirx * 0.2, 0.25 + 5.4 - l * 0.4, p.z - dirz * 0.2); so.rotation.set(0, Math.atan2(-dirx, -dirz), 0); so.updateMatrix(); sigLamp.setMatrixAt(k * 3 + l, so.matrix); sigLamp.setColorAt(k * 3 + l, tmpC.set('#220000')); } });
  sigLamp.frustumCulled = false; scene.add(sigLamp); world.sigLamp = sigLamp; world.sigPoles = sigPoles;
  world.signalState = (i, j, axis, t) => { const u = (t + (i * 7 + j * 13) % 18) % 18; if (axis === 0) return u < 7.5 ? 2 : u < 9 ? 1 : 0; return u < 9 ? 0 : u < 16.5 ? 2 : 1; }; // 0 red 1 yellow 2 green; axis 0 = travel along x
  world.sigCache = new Int8Array(world.signals.length * 2).fill(-1);

  // ---- finalize chunk meshes
  const keyMat = { deco: mats.deco, mid: mats.mid, glass: mats.glass, ind: mats.ind, art: mats.art, trim: mats.trim, shop: mats.shop, dark: mats.dark, concrete: mats.concrete, sign: mats.sign, ad: mats.ad, mural: mats.mural, red: mats.red, grass: mats.grass, pond: mats.pond };
  let ci = 0, cn = chunkMap.size;
  for (const c of chunkMap.values()) {
    const grp = new THREE.Group();
    for (const k in c.parts) { const arr = c.parts[k]; if (!arr.length) continue; const g = mergeGeometries(arr, false); if (!g) { console.warn('merge failed', k); continue; } arr.forEach(a => a.dispose()); const m = new THREE.Mesh(g, keyMat[k]); m.castShadow = !['sign', 'ad', 'trim', 'shop', 'grass', 'pond', 'red', 'mural'].includes(k); m.receiveShadow = ['deco', 'mid', 'glass', 'ind', 'art', 'concrete', 'grass', 'dark'].includes(k); grp.add(m); }
    scene.add(grp); world.chunks.push({ group: grp, x: c.x, z: c.z }); if (++ci % 6 === 0) { progress(0.7 + 0.2 * ci / cn); await new Promise(r => setTimeout(r, 0)); }
  }

  // ---- distant skyline ring (always visible, fogged)
  { const geos = [], rr = mulberry32(5); const addT = (x, z) => { const w = 30 + rr() * 60, d = 30 + rr() * 60, h = 60 + rr() * 260; const g = boxUV(w, h, d, tex.glass.tw, tex.glass.th, 0).translate(x, h / 2, z); colorize(g, new THREE.Color(GLASS[Math.floor(rr() * 5)])); geos.push(g); if (rr() < 0.5) { const t = new THREE.BoxGeometry(w + 1, 1.2, d + 1).translate(x, h * (0.3 + rr() * 0.6), z); colorize(t, new THREE.Color(NEONS[Math.floor(rr() * 5)])); (world.farTrim ||= []).push(t); } };
    for (let k = 0; k < 150; k++) { const side = k % 3, t = rr(); if (side === 0) addT(X0 - 450 - rr() * 800, Z0 - 300 + t * (H + 600)); else if (side === 1) addT(X0 + t * (W + 200), Z0 - 450 - rr() * 700); else addT(X0 + t * W, Z1 + 450 + rr() * 700); }
    for (let k = 0; k < 40; k++) addT(X1 + 900 + rr() * 800, Z0 - 600 + rr() * (H + 1200));
    const far = new THREE.Mesh(mergeGeometries(geos), mats.glass); scene.add(far); world.far = far; if (world.farTrim) { const m = new THREE.Mesh(mergeGeometries(world.farTrim), mats.trim); scene.add(m); } }

  // ---- queries
  world.districtAt = (x, z) => { if (x > X1 + 8) return 'beach'; const bx = clamp(Math.floor((x - X0) / P), 0, NBX - 1), bz = clamp(Math.floor((z - Z0) / P), 0, NBZ - 1); return districtOf(bx, bz); };
  world.nameAt = (x, z) => {
    if (x > X1 + 8) return x > BEACH.sand ? 'South Beach' : 'Ocean Drive Promenade';
    const fi = (x - X0) / P, fj = (z - Z0) / P, ri = Math.round(fi), rj = Math.round(fj);
    if (Math.abs(x - lineX(ri)) < ROAD / 2 + 1 && ri >= 0 && ri <= NBX) return NAMES_X[ri];
    if (Math.abs(z - lineZ(rj)) < ROAD / 2 + 1 && rj >= 0 && rj <= NBZ) return NAMES_Z[rj];
    return DISTRICT_NAMES[world.districtAt(x, z)] || 'Neon Bay';
  };
  world.districtName = (x, z) => { const d = world.districtAt(x, z); return d === 'beach' ? 'South Beach' : DISTRICT_NAMES[d]; };
  world.onRoad = (x, z) => { const ox = (((x - X0) % P) + P) % P, oz = (((z - Z0) % P) + P) % P; const inX = ox < ROAD / 2 || ox > P - ROAD / 2, inZ = oz < ROAD / 2 || oz > P - ROAD / 2; return inX || inZ; };
  world.groundY = (x, z) => {
    if (x > BEACH.sand) { if (Math.abs(z - PIER.z) < PIER.hw && x >= PIER.x0 && x <= PIER.x1) return PIER.y; for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return lerp(ys[k - 1], ys[k], (x - xs[k - 1]) / (xs[k] - xs[k - 1])); return ys[ys.length - 1]; }
    if (x > X1 + 8) return 0.2; return world.onRoad(x, z) ? 0 : 0.25;
  };
  world.collideCircle = (x, z, r, out) => { // returns push vector via out {nx,nz,depth,h}; resolves against first/deepest hit
    let best = 0; out.depth = 0;
    world.colliders.query(x - r, z - r, x + r, z + r, b => { const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1); let dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz; if (d2 >= r * r) return; let d = Math.sqrt(d2), nx, nz, dep; if (d > 1e-5) { nx = dx / d; nz = dz / d; dep = r - d; } else { const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z, m = Math.min(l, rr, t, bt); if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; } dep = r + m; } if (dep > best) { best = dep; out.nx = nx; out.nz = nz; out.depth = dep; out.h = b.h; } });
    world.circles.query(x - r - 0.6, z - r - 0.6, x + r + 0.6, z + r + 0.6, c => { const dx = x - c.x, dz = z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz; if (d2 >= rr * rr) return; const d = Math.sqrt(d2) || 1e-4, dep = rr - d; if (dep > best) { best = dep; out.nx = dx / d; out.nz = dz / d; out.depth = dep; out.h = 3; } });
    // map edges
    if (x - r < BOUNDS.x0) { const dep = BOUNDS.x0 - (x - r); if (dep > best) { best = dep; out.nx = 1; out.nz = 0; out.depth = dep; out.h = 99; } }
    const onPier = Math.abs(z - PIER.z) < PIER.hw + 1 && x > X1 + 20;
    if (onPier) { const rail = PIER.hw - 0.2; if (z - r < PIER.z - rail && x > PIER.x0) { const dep = PIER.z - rail - (z - r); if (dep > best) { best = dep; out.nx = 0; out.nz = 1; out.depth = dep; out.h = 1; } } if (z + r > PIER.z + rail && x > PIER.x0) { const dep = z + r - (PIER.z + rail); if (dep > best) { best = dep; out.nx = 0; out.nz = -1; out.depth = dep; out.h = 1; } } if (x + r > PIER.x1 - 1) { const dep = x + r - (PIER.x1 - 1); if (dep > best) { best = dep; out.nx = -1; out.nz = 0; out.depth = dep; out.h = 1; } } }
    else if (x + r > BOUNDS.x1) { const dep = x + r - BOUNDS.x1; if (dep > best) { best = dep; out.nx = -1; out.nz = 0; out.depth = dep; out.h = 99; } }
    if (z - r < BOUNDS.z0) { const dep = BOUNDS.z0 - (z - r); if (dep > best) { best = dep; out.nx = 0; out.nz = 1; out.depth = dep; out.h = 99; } }
    if (z + r > BOUNDS.z1) { const dep = z + r - BOUNDS.z1; if (dep > best) { best = dep; out.nx = 0; out.nz = -1; out.depth = dep; out.h = 99; } }
    return best > 0;
  };
  world.rayHitsBuilding = (ox, oz, dx, dz, maxD, oy = 0, dy = 0) => { let best = Infinity; world.colliders.query(Math.min(ox, ox + dx * maxD) - 1, Math.min(oz, oz + dz * maxD) - 1, Math.max(ox, ox + dx * maxD) + 1, Math.max(oz, oz + dz * maxD) + 1, b => { let t0 = 0, t1 = maxD; for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oz, dz, b.z0, b.z1]]) { if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return; } else { let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return; } } if (oy + dy * t0 > b.h) return; if (t0 < best) best = t0; }); return best; };

  // ---- per-frame world update: chunk visibility, signals, night scaling
  let visT = 0;
  world.update = (G2, dt) => {
    visT -= dt;
    if (visT <= 0) { visT = 0.25; const cp = G2.camera.position, vd = G2.cfg.viewDist + 130; for (const c of world.chunks) { const dx = c.x - cp.x, dz = c.z - cp.z; c.group.visible = dx * dx + dz * dz < vd * vd; } }
    const night = G2.uniforms.night.value, t = G2.clock;
    // signals
    for (let k = 0; k < world.signals.length; k++) { const s = world.signals[k]; for (let ax = 0; ax < 2; ax++) { const st = world.signalState(s.i, s.j, ax, t); if (world.sigCache[k * 2 + ax] === st) continue; world.sigCache[k * 2 + ax] = st; for (let a = 0; a < 4; a++) { const axisOfApproach = a < 2 ? 0 : 1; if (axisOfApproach !== ax) continue; const base = (k * 4 + a) * 3; for (let l = 0; l < 3; l++) { const on = (l === 0 && st === 0) || (l === 1 && st === 1) || (l === 2 && st === 2); world.sigLamp.setColorAt(base + l, tmpC.set(on ? (l === 0 ? '#ff2020' : l === 1 ? '#ffc020' : '#20ff60') : '#1a0a0a').multiplyScalar(on ? 3 : 1)); } } world.sigLamp.instanceColor.needsUpdate = true; } }
    // night scaling of emissive things
    const em = 0.05 + 1.15 * night; for (const k of ['deco', 'mid', 'glass', 'ind', 'art']) mats[k].emissiveIntensity = em;
    mats.trim.color.setScalar(0.3 + 1.7 * night); mats.shop.color.setScalar(0.1 + 0.85 * night); mats.sign.opacity = 0.25 + 0.75 * night; mats.sign.color.setScalar(0.3 + 1.7 * night); mats.lampHead.color.copy(col('#ffd9a0', 0.2 + 4 * night)); mats.red.color.copy(col('#ff2a2a', 2 + 3 * night));
  };

  // ---- pre-rendered city map (minimap + pause map)
  const MX0 = X0 - 40, MZ0 = Z0 - 40, MW = (X1 + 300) - MX0, MH = H + 80, MS = 1;
  const mc = document.createElement('canvas'); mc.width = Math.ceil(MW * MS); mc.height = Math.ceil(MH * MS); const g = mc.getContext('2d');
  g.fillStyle = '#0a3550'; g.fillRect(0, 0, mc.width, mc.height); const mx = x => (x - MX0) * MS, mz = z => (z - MZ0) * MS;
  g.fillStyle = '#e8d3a2'; g.fillRect(mx(X1 + 8), 0, (X1 + 116 - (X1 + 8)) * MS, mc.height); g.fillStyle = '#1b1f2b'; g.fillRect(mx(X0 - 40), 0, (X1 + 8 - X0 + 40) * MS, mc.height);
  const dcol = { deco: '#c97aa8', neon: '#6f4aa8', downtown: '#4a5f8a', arts: '#a85a78', port: '#59605e', park: '#2f7a3a', mid: '#8a6f55' };
  for (let bx = 0; bx < NBX; bx++) for (let bz = 0; bz < NBZ; bz++) { const { x, z } = blockCenter(bx, bz); g.fillStyle = dcol[districtOf(bx, bz)]; g.fillRect(mx(x - BLK / 2), mz(z - BLK / 2), BLK * MS, BLK * MS); }
  g.fillStyle = '#9aa2b8'; for (let i = 0; i <= NBX; i++) g.fillRect(mx(lineX(i) - 0.5), mz(Z0 - 8), 1, (H + 16) * MS); for (let j = 0; j <= NBZ; j++) g.fillRect(mx(X0 - 8), mz(lineZ(j) - 0.5), (W + 16) * MS, 1);
  g.fillStyle = '#7a5a3a'; g.fillRect(mx(PIER.x0), mz(PIER.z - 3), (PIER.x1 - PIER.x0) * MS, 6 * MS);
  world.map = { canvas: mc, x0: MX0, z0: MZ0, s: MS, w: mc.width, h: mc.height };
  world.spawns = { beach: { x: X1 - 3, z: Z0 + H * 0.55 }, downtown: { x: lineX(9) + 4, z: lineZ(7) + 12 }, port: { x: lineX(5) + 10, z: lineZ(14) + 10 }, arts: { x: lineX(2) + 10, z: lineZ(4) + 10 }, neon: { x: lineX(13) + 10, z: lineZ(8) + 10 }, pier: { x: PIER.x0 + 30, z: PIER.z } };
  world.hospital = { x: lineX(4) + 12, z: lineZ(5) + 12 }; world.station = { x: lineX(10) + 12, z: lineZ(11) + 12 };
  progress(1);
  return world;
}
