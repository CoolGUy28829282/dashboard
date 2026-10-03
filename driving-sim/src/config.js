// Config, presets and the settings schema that drives the customization panel.
// fx = what has to happen when the value changes: live (cheap, just re-apply) | city (rebuild chunks) | theme (rebuild palettes + city)
//      car (rebuild player car) | traffic (rebuild traffic pool) | fly (rebuild flyers/drones) | path (rebuild road path + city)

export const THEMES = {
  'Neon Tokyo': { accentA: '#ff2d95', accentB: '#22e6ff', accentC: '#ffb02e', lampColor: '#ffb868', atmosphere: 'Midnight', skyBody: 'Moon' },
  'Rain Noir': { accentA: '#ff7a1a', accentB: '#2fd4c0', accentC: '#ffd070', lampColor: '#ff9a40', atmosphere: 'Smog', skyBody: 'None' },
  'Synthwave': { accentA: '#ff3df0', accentB: '#46a5ff', accentC: '#ffe14a', lampColor: '#ff7be0', atmosphere: 'Dusk', skyBody: 'Ringed planet' },
  'Toxic Grid': { accentA: '#7dff3a', accentB: '#00ffa8', accentC: '#e6ff4a', lampColor: '#9dff6a', atmosphere: 'Acid storm', skyBody: 'Twin moons' },
  'Ice Corp': { accentA: '#7fd4ff', accentB: '#c8f0ff', accentC: '#ffffff', lampColor: '#cfeaff', atmosphere: 'Dawn', skyBody: 'Moon' },
  'Crimson Sector': { accentA: '#ff2038', accentB: '#ff7a3c', accentC: '#ffd0a0', lampColor: '#ff5a3a', atmosphere: 'Smog', skyBody: 'Ringed planet' },
};

// hor/mid/top = sky colours (linear), fog = fog colour, glow = city-glow tint added at the horizon
export const ATMOS = {
  'Midnight': { hor: [0.10, 0.055, 0.16], mid: [0.012, 0.02, 0.06], top: [0.003, 0.005, 0.016], fog: [0.07, 0.04, 0.11], expo: 0.85, hemi: 0.45, moon: 0.5, stars: 1 },
  'Dusk': { hor: [0.62, 0.20, 0.20], mid: [0.12, 0.07, 0.22], top: [0.015, 0.025, 0.08], fog: [0.17, 0.08, 0.13], expo: 0.95, hemi: 0.7, moon: 0.35, stars: 0.5 },
  'Dawn': { hor: [0.55, 0.30, 0.34], mid: [0.10, 0.13, 0.28], top: [0.02, 0.04, 0.11], fog: [0.14, 0.11, 0.17], expo: 1.0, hemi: 0.8, moon: 0.3, stars: 0.3 },
  'Smog': { hor: [0.20, 0.10, 0.09], mid: [0.05, 0.035, 0.05], top: [0.012, 0.01, 0.018], fog: [0.10, 0.06, 0.07], expo: 0.9, hemi: 0.4, moon: 0.2, stars: 0.1 },
  'Acid storm': { hor: [0.08, 0.20, 0.10], mid: [0.015, 0.05, 0.04], top: [0.004, 0.012, 0.01], fog: [0.04, 0.09, 0.06], expo: 0.9, hemi: 0.5, moon: 0.4, stars: 0.4 },
  'Deep space': { hor: [0.05, 0.03, 0.10], mid: [0.01, 0.01, 0.04], top: [0.001, 0.001, 0.008], fog: [0.025, 0.02, 0.05], expo: 0.8, hemi: 0.35, moon: 0.5, stars: 1.6 },
};

export const QUALITY = {
  Low: { pixelRatio: 0.8, viewDist: 6, rain: 0.3, flyers: 6, drones: 2, traffic: 8, bloom: 0.5 },
  Medium: { pixelRatio: 1.1, viewDist: 8, rain: 0.5, flyers: 12, drones: 5, traffic: 12, bloom: 0.6 },
  High: { pixelRatio: 1.5, viewDist: 9, rain: 0.6, flyers: 18, drones: 8, traffic: 16, bloom: 0.6 },
  Ultra: { pixelRatio: 2, viewDist: 12, rain: 0.9, flyers: 36, drones: 16, traffic: 22, bloom: 0.7 },
};

export const DEFAULTS = {
  theme: 'Neon Tokyo', accentA: '#ff2d95', accentB: '#22e6ff', accentC: '#ffb02e', lampColor: '#ffb868',
  atmosphere: 'Midnight', skyBody: 'Moon', neon: 1,
  rain: 0.6, wet: 0.65, fogDensity: 1, lightning: false,
  seed: 7, density: 1, buildingH: 1, megatowers: true, windows: 0.3, signs: 0.5, ads: 0.5, holograms: 0.5, beams: 0.4, trims: 0.6,
  glowLanes: true, streaks: true, overpass: true, arches: 0.7, gantry: true, maglev: true, curve: 1, viewDist: 9,
  flyers: 18, drones: 8,
  carStyle: 'Coupe', paint: '#c4162c', finish: 'Gloss', trimOn: true, trim: '#22e6ff', underglow: '#22e6ff', underglowI: 1, wheels: '#aab0c0', spoiler: 'Low', headlight: '#fff2dc', taillight: '#ff2a3a', tint: 0.85, plate: 'NEON-01',
  traffic: 16, oncoming: 0.5, trafficSpeed: 1, collisions: true,
  camera: 'Chase', fov: 62, camDist: 1, camHeight: 1, motionFov: 1, shake: 1,
  bloom: 0.6, exposure: 1, aberration: 1, grain: 0.045, vignette: 0.55, scanlines: 0, pixelRatio: 1.5,
  maxSpeed: 275, accel: 1, grip: 1, steerSens: 1, nitroRegen: 1, autopilot: false, units: 'km/h',
  master: 0.8, music: 'Synthwave', musicVol: 0.5, sfxVol: 0.7,
  hud: true, minimap: true, hudScale: 1,
};

const opts = o => o;
export const SCHEMA = [
  { id: 'style', label: 'Style', items: [
    { k: 'theme', label: 'Theme preset', t: 'select', opts: Object.keys(THEMES), fx: 'theme', special: 'theme' },
    { k: 'accentA', label: 'Accent A (pink)', t: 'color', fx: 'theme' }, { k: 'accentB', label: 'Accent B (cyan)', t: 'color', fx: 'theme' },
    { k: 'accentC', label: 'Accent C (gold)', t: 'color', fx: 'theme' }, { k: 'lampColor', label: 'Street lamp colour', t: 'color', fx: 'theme' },
    { k: 'atmosphere', label: 'Atmosphere', t: 'select', opts: Object.keys(ATMOS), fx: 'live' },
    { k: 'skyBody', label: 'Sky body', t: 'select', opts: ['Moon', 'Ringed planet', 'Twin moons', 'None'], fx: 'live' },
    { k: 'neon', label: 'Neon intensity', t: 'range', min: 0, max: 2.5, step: 0.05, fx: 'live' },
    { k: 'exposure', label: 'Exposure', t: 'range', min: 0.5, max: 1.8, step: 0.05, fx: 'live' },
  ] },
  { id: 'weather', label: 'Weather', items: [
    { k: 'rain', label: 'Rain', t: 'range', min: 0, max: 1, step: 0.05, fx: 'live' }, { k: 'wet', label: 'Wet road reflections', t: 'range', min: 0, max: 1, step: 0.05, fx: 'live' },
    { k: 'fogDensity', label: 'Fog density', t: 'range', min: 0, max: 3, step: 0.05, fx: 'live' }, { k: 'lightning', label: 'Lightning storms', t: 'toggle', fx: 'live' },
  ] },
  { id: 'city', label: 'City', items: [
    { k: 'seed', label: 'City seed', t: 'number', fx: 'city' }, { k: 'density', label: 'Building density', t: 'range', min: 0.3, max: 2, step: 0.05, fx: 'city' },
    { k: 'buildingH', label: 'Building height', t: 'range', min: 0.4, max: 2.5, step: 0.05, fx: 'city' }, { k: 'megatowers', label: 'Megatowers', t: 'toggle', fx: 'city' },
    { k: 'windows', label: 'Lit windows', t: 'range', min: 0, max: 1, step: 0.02, fx: 'theme' }, { k: 'trims', label: 'Neon trim & LED strips', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' },
    { k: 'signs', label: 'Neon signs', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' }, { k: 'ads', label: 'Animated ad screens', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' },
    { k: 'holograms', label: 'Holograms', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' }, { k: 'beams', label: 'Searchlights', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' },
    { k: 'arches', label: 'Neon arches', t: 'range', min: 0, max: 1, step: 0.05, fx: 'city' }, { k: 'gantry', label: 'Highway signs', t: 'toggle', fx: 'city' },
    { k: 'overpass', label: 'Overpasses', t: 'toggle', fx: 'city' }, { k: 'maglev', label: 'Elevated maglev + train', t: 'toggle', fx: 'city' },
    { k: 'glowLanes', label: 'Glowing lane lines', t: 'toggle', fx: 'live' }, { k: 'streaks', label: 'Neon reflections on road', t: 'toggle', fx: 'city' },
    { k: 'curve', label: 'Road curviness', t: 'range', min: 0, max: 2, step: 0.05, fx: 'path' }, { k: 'viewDist', label: 'View distance (chunks)', t: 'range', min: 4, max: 14, step: 1, fx: 'live' },
    { k: 'flyers', label: 'Flying cars', t: 'range', min: 0, max: 60, step: 1, fx: 'fly' }, { k: 'drones', label: 'Patrol drones', t: 'range', min: 0, max: 40, step: 1, fx: 'fly' },
  ] },
  { id: 'car', label: 'Vehicle', items: [
    { k: 'carStyle', label: 'Body', t: 'select', opts: ['Coupe', 'Wedge', 'Hover'], fx: 'car' }, { k: 'paint', label: 'Paint colour', t: 'color', fx: 'car' },
    { k: 'finish', label: 'Finish', t: 'select', opts: ['Gloss', 'Matte', 'Chrome', 'Pearl', 'Carbon', 'Neon flat'], fx: 'car' },
    { k: 'trimOn', label: 'Neon body trim', t: 'toggle', fx: 'car' }, { k: 'trim', label: 'Trim colour', t: 'color', fx: 'car' },
    { k: 'underglow', label: 'Underglow colour', t: 'color', fx: 'car' }, { k: 'underglowI', label: 'Underglow strength', t: 'range', min: 0, max: 3, step: 0.05, fx: 'car' },
    { k: 'wheels', label: 'Wheel colour', t: 'color', fx: 'car' }, { k: 'spoiler', label: 'Spoiler', t: 'select', opts: ['None', 'Low', 'High', 'GT wing'], fx: 'car' },
    { k: 'headlight', label: 'Headlight colour', t: 'color', fx: 'car' }, { k: 'taillight', label: 'Taillight colour', t: 'color', fx: 'car' },
    { k: 'tint', label: 'Window tint', t: 'range', min: 0, max: 1, step: 0.05, fx: 'car' }, { k: 'plate', label: 'Licence plate', t: 'text', fx: 'car' },
  ] },
  { id: 'traffic', label: 'Traffic', items: [
    { k: 'traffic', label: 'Traffic cars', t: 'range', min: 0, max: 40, step: 1, fx: 'traffic' }, { k: 'oncoming', label: 'Oncoming share', t: 'range', min: 0, max: 1, step: 0.05, fx: 'traffic' },
    { k: 'trafficSpeed', label: 'Traffic speed', t: 'range', min: 0.5, max: 1.6, step: 0.05, fx: 'traffic' }, { k: 'collisions', label: 'Collisions', t: 'toggle', fx: 'live' },
  ] },
  { id: 'camera', label: 'Camera', items: [
    { k: 'camera', label: 'View', t: 'select', opts: ['Chase', 'Close', 'Hood', 'Cinematic'], fx: 'live', hint: 'C cycles' }, { k: 'fov', label: 'Field of view', t: 'range', min: 45, max: 100, step: 1, fx: 'live' },
    { k: 'camDist', label: 'Distance', t: 'range', min: 0.6, max: 2.2, step: 0.05, fx: 'live' }, { k: 'camHeight', label: 'Height', t: 'range', min: 0.5, max: 2.2, step: 0.05, fx: 'live' },
    { k: 'motionFov', label: 'Speed FOV stretch', t: 'range', min: 0, max: 2, step: 0.05, fx: 'live' }, { k: 'shake', label: 'Camera shake', t: 'range', min: 0, max: 2, step: 0.05, fx: 'live' },
  ] },
  { id: 'gfx', label: 'Graphics', items: [
    { k: 'quality', label: 'Quality preset', t: 'buttons', opts: Object.keys(QUALITY), special: 'quality' },
    { k: 'pixelRatio', label: 'Render scale', t: 'range', min: 0.5, max: 2, step: 0.05, fx: 'live' }, { k: 'bloom', label: 'Bloom', t: 'range', min: 0, max: 2, step: 0.05, fx: 'live' },
    { k: 'aberration', label: 'Chromatic aberration', t: 'range', min: 0, max: 3, step: 0.05, fx: 'live' }, { k: 'grain', label: 'Film grain', t: 'range', min: 0, max: 0.15, step: 0.005, fx: 'live' },
    { k: 'vignette', label: 'Vignette', t: 'range', min: 0, max: 1.2, step: 0.05, fx: 'live' }, { k: 'scanlines', label: 'CRT scanlines', t: 'range', min: 0, max: 1, step: 0.05, fx: 'live' },
  ] },
  { id: 'play', label: 'Gameplay', items: [
    { k: 'maxSpeed', label: 'Top speed (km/h)', t: 'range', min: 120, max: 450, step: 5, fx: 'live' }, { k: 'accel', label: 'Acceleration', t: 'range', min: 0.4, max: 2.5, step: 0.05, fx: 'live' },
    { k: 'grip', label: 'Grip', t: 'range', min: 0.5, max: 1.8, step: 0.05, fx: 'live' }, { k: 'steerSens', label: 'Steering sensitivity', t: 'range', min: 0.5, max: 1.8, step: 0.05, fx: 'live' },
    { k: 'nitroRegen', label: 'Nitro regeneration', t: 'range', min: 0, max: 3, step: 0.1, fx: 'live' }, { k: 'autopilot', label: 'Autopilot (scenic drive)', t: 'toggle', fx: 'live', hint: 'T toggles' },
    { k: 'units', label: 'Units', t: 'select', opts: ['km/h', 'mph'], fx: 'live' },
  ] },
  { id: 'audio', label: 'Audio & HUD', items: [
    { k: 'master', label: 'Master volume', t: 'range', min: 0, max: 1, step: 0.05, fx: 'audio' }, { k: 'music', label: 'Music', t: 'select', opts: ['Synthwave', 'Darksynth', 'Ambient', 'Off'], fx: 'audio' },
    { k: 'musicVol', label: 'Music volume', t: 'range', min: 0, max: 1, step: 0.05, fx: 'audio' }, { k: 'sfxVol', label: 'Engine / FX volume', t: 'range', min: 0, max: 1, step: 0.05, fx: 'audio' },
    { k: 'hud', label: 'Show HUD', t: 'toggle', fx: 'live', hint: 'H toggles' }, { k: 'minimap', label: 'Minimap', t: 'toggle', fx: 'live' },
    { k: 'hudScale', label: 'HUD size', t: 'range', min: 0.7, max: 1.5, step: 0.05, fx: 'live' },
  ] },
];

const KEY = 'neondrive3d.cfg.v2';
export const CFG = { ...DEFAULTS };
export function loadCfg() { try { Object.assign(CFG, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ } for (const k in DEFAULTS) if (CFG[k] === undefined || typeof CFG[k] !== typeof DEFAULTS[k]) CFG[k] = DEFAULTS[k]; }
export function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) { /* ignore */ } }
export function savedPresets() { try { return JSON.parse(localStorage.getItem(KEY + '.presets') || '{}'); } catch (e) { return {}; } }
export function storePresets(p) { try { localStorage.setItem(KEY + '.presets', JSON.stringify(p)); } catch (e) { /* ignore */ } }
