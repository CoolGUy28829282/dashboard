// Settings (saved in localStorage) and the schema that drives the settings screen.
export const DEFAULTS = {
  // graphics
  quality: 'High', viewDist: 700, resScale: 1.25, shadows: true, bloom: 0.55, grain: 0.03, vignette: 0.5, aberration: 0.6, fov: 70,
  // world
  traffic: 1, peds: 1, parked: 1, startHour: 17.5, timeSpeed: 1, weather: 'Clear', rain: 0.6,
  // gameplay
  difficulty: 'Normal', policeAggro: 1, mouseSens: 1, invertY: false, units: 'km/h', cinematicDrive: false,
  // hud / audio
  minimap: true, hud: true, master: 0.8, radioVol: 0.6, sfxVol: 0.8, station: 0,
  // cheats / sandbox
  godMode: false, infAmmo: false, neverWanted: false,
};

export const SCHEMA = [
  { id: 'gfx', label: 'Graphics', items: [
    { k: 'quality', label: 'Quality preset', t: 'buttons', opts: ['Low', 'Medium', 'High', 'Ultra'], special: 'quality' },
    { k: 'viewDist', label: 'View distance (m)', t: 'range', min: 250, max: 1400, step: 50 }, { k: 'resScale', label: 'Render scale', t: 'range', min: 0.5, max: 2, step: 0.05 },
    { k: 'shadows', label: 'Sun shadows', t: 'toggle' }, { k: 'bloom', label: 'Bloom / neon glow', t: 'range', min: 0, max: 1.5, step: 0.05 },
    { k: 'aberration', label: 'Chromatic aberration', t: 'range', min: 0, max: 2, step: 0.05 }, { k: 'grain', label: 'Film grain', t: 'range', min: 0, max: 0.12, step: 0.005 },
    { k: 'vignette', label: 'Vignette', t: 'range', min: 0, max: 1, step: 0.05 }, { k: 'fov', label: 'Field of view', t: 'range', min: 55, max: 100, step: 1 },
  ] },
  { id: 'world', label: 'World', items: [
    { k: 'traffic', label: 'Traffic density', t: 'range', min: 0, max: 2, step: 0.1 }, { k: 'peds', label: 'Pedestrian density', t: 'range', min: 0, max: 2, step: 0.1 },
    { k: 'parked', label: 'Parked cars', t: 'range', min: 0, max: 2, step: 0.1 }, { k: 'timeSpeed', label: 'Time speed (x real)', t: 'range', min: 0, max: 20, step: 0.5, hint: '1 = 1 game min per real sec' },
    { k: 'weather', label: 'Weather', t: 'select', opts: ['Clear', 'Overcast', 'Rain', 'Storm'] },
  ] },
  { id: 'play', label: 'Gameplay', items: [
    { k: 'difficulty', label: 'Difficulty', t: 'select', opts: ['Easy', 'Normal', 'Hard'] }, { k: 'policeAggro', label: 'Police aggression', t: 'range', min: 0.3, max: 2, step: 0.1 },
    { k: 'mouseSens', label: 'Mouse sensitivity', t: 'range', min: 0.2, max: 3, step: 0.05 }, { k: 'invertY', label: 'Invert Y', t: 'toggle' },
    { k: 'units', label: 'Speed units', t: 'select', opts: ['km/h', 'mph'] }, { k: 'minimap', label: 'Minimap', t: 'toggle' }, { k: 'hud', label: 'HUD', t: 'toggle' },
  ] },
  { id: 'audio', label: 'Audio', items: [
    { k: 'master', label: 'Master volume', t: 'range', min: 0, max: 1, step: 0.05 }, { k: 'radioVol', label: 'Radio volume', t: 'range', min: 0, max: 1, step: 0.05 }, { k: 'sfxVol', label: 'Effects volume', t: 'range', min: 0, max: 1, step: 0.05 },
  ] },
  { id: 'cheats', label: 'Cheats', items: [
    { k: 'godMode', label: 'God mode', t: 'toggle' }, { k: 'infAmmo', label: 'Infinite ammo', t: 'toggle' }, { k: 'neverWanted', label: 'Never wanted', t: 'toggle' },
  ] },
];

export const QUALITY = {
  Low: { viewDist: 350, resScale: 0.8, shadows: false, bloom: 0.4, traffic: 0.5, peds: 0.5, parked: 0.5 },
  Medium: { viewDist: 550, resScale: 1.0, shadows: false, bloom: 0.5, traffic: 0.8, peds: 0.8, parked: 0.8 },
  High: { viewDist: 700, resScale: 1.25, shadows: true, bloom: 0.55, traffic: 1, peds: 1, parked: 1 },
  Ultra: { viewDist: 1000, resScale: 1.6, shadows: true, bloom: 0.7, traffic: 1.4, peds: 1.4, parked: 1.3 },
};

const KEY = 'neonbay.cfg.v1', SAVE = 'neonbay.save.v1';
export const CFG = { ...DEFAULTS };
export function loadCfg() { try { Object.assign(CFG, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ } for (const k in DEFAULTS) if (typeof CFG[k] !== typeof DEFAULTS[k]) CFG[k] = DEFAULTS[k]; }
export function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(CFG)); } catch (e) { /* ignore */ } }
export function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch (e) { return null; } }
export function writeSave(s) { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) { /* ignore */ } }
