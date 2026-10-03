// Settings panels (audio, controls with full rebinding, gameplay, video, accessibility, data). Shared by the main menu and the pause menu.
import { h, clear, seg, toggle, slider } from './dom.js';
import { DEFAULT_KEYS, ACTION_LABEL, PAD_DEFAULT, PAD_ACTIONS, padLabels } from '../engine/input.js';
import { PRESETS } from '../engine/renderer.js';
import { CAMERA_PRESETS, CAMERA_LABEL } from '../engine/camera.js';
import { dbClear } from '../data/db.js';

const field = (label, ctl, hint) => h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'row' }, ctl, hint ? h('span', { class: 'dim', style: { fontSize: '11px' } }, hint) : null));
const keyName = (c) => c.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '↑↓←→'.includes('') ? 'Arrow ' : '').replace('Left', ' Left').replace('Right', ' Right');

export function settingsPanel(app, { onChange, tabs = ['Audio', 'Controls', 'Gameplay', 'Video', 'Accessibility', 'Data'], initial = 0 } = {}) {
  const S = app.settings; const save = () => { app.saveSettings(); onChange?.(); };
  const root = h('div', { class: 'col', style: { minWidth: 'min(760px, 90vw)' } }); const body = h('div', { class: 'scroll', style: { maxHeight: '58vh', paddingRight: '8px' } }); const bar = h('div', { class: 'tabs' });
  const pages = {
    Audio: () => ['master', 'music', 'sfx', 'crowd', 'commentary'].map((k) => field(k[0].toUpperCase() + k.slice(1), slider(S.audio[k], (v) => { S.audio[k] = v; app.audio.applyVolumes(); app.audio.ensure(); save(); }), '')).concat(field('Commentary voice (text-to-speech)', toggle(S.audio.tts, (v) => { S.audio.tts = v; save(); }))),
    Controls: () => {
      const wrap = h('div', {});
      wrap.append(field('Stick dead-zone', slider(S.controls.deadzone, (v) => { S.controls.deadzone = v; save(); }, 0, 0.5, 0.01)), field('Aim assist', slider(S.controls.aimAssist, (v) => { S.controls.aimAssist = v; save(); })), field('Shot-stick sensitivity', slider(S.controls.shotStickSens, (v) => { S.controls.shotStickSens = v; save(); })), field('Vibration / rumble', toggle(S.controls.vibration, (v) => { S.controls.vibration = v; save(); if (v) app.input.rumble(0.5, 0.5, 200); })));
      const pad = padLabels(app.input.lastPadId);
      wrap.append(h('div', { class: 'display', style: { fontSize: '12px', margin: '14px 0 6px' } }, 'Keyboard bindings — click an action, then press a key'));
      const g = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '6px' } });
      for (const a of Object.keys(DEFAULT_KEYS)) {
        const cur = S.controls.keys[a] ?? DEFAULT_KEYS[a];
        const btn = h('button', { class: 'btn sm', style: { minWidth: '110px' } }, keyName(cur));
        btn.onclick = () => { btn.textContent = 'press a key…'; app.input.rebinding = (code) => { app.input.rebinding = null; if (code !== 'Escape') { S.controls.keys[a] = code; save(); } btn.textContent = keyName(S.controls.keys[a] ?? DEFAULT_KEYS[a]); }; };
        g.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted', style: { fontSize: '12px' } }, ACTION_LABEL[a] ?? a), btn));
      }
      wrap.append(g, h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => { S.controls.keys = {}; save(); app.refreshSettings(); } }, 'Reset keyboard bindings')));
      wrap.append(h('div', { class: 'display', style: { fontSize: '12px', margin: '14px 0 6px' } }, `Gamepad bindings (${app.input.lastPadId ? 'controller detected' : 'connect a controller to rebind'}) — click an action, then press a button`));
      const pg = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '6px' } });
      const nameOf = (a) => { const map = { ...PAD_DEFAULT, ...(S.controls.pad ?? {}) }; return pad[map[a]] ?? `Btn ${map[a]}`; };
      for (const a of PAD_ACTIONS) {
        const btn = h('button', { class: 'btn sm', style: { minWidth: '90px' } }, nameOf(a));
        btn.onclick = () => { btn.textContent = 'press a button…'; app.input.rebindPad = (n) => { S.controls.pad = { ...(S.controls.pad ?? {}), [a]: n }; save(); btn.textContent = nameOf(a); }; };
        pg.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted', style: { fontSize: '12px' } }, ACTION_LABEL[a] ?? a), btn));
      }
      wrap.append(pg, h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => { S.controls.pad = {}; save(); app.refreshSettings(); } }, 'Reset gamepad bindings')),
        h('div', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.7, marginTop: '8px' } }, 'Fixed: left stick = move · right stick = dribble moves (and shot stick if enabled) · LT release = hesitation · hold the lob button 0.35 s = call a screen · D-pad = play calls 1–4.'));
      return wrap;
    },
    Gameplay: () => [
      field('Shot input', seg([['button', 'Button (hold + release)'], ['stick', 'Shot stick']], S.gameplay.shotInput, (v) => { S.gameplay.shotInput = v; save(); })),
      field('Shot meter', seg([['overhead', 'Crescent (2K style)'], ['standard', 'Arc (feet)'], ['minimal', 'Minimal'], ['off', 'Off']], S.gameplay.shotMeter, (v) => { S.gameplay.shotMeter = v; save(); }), 'Ranked forces the crescent'),
      field('Default camera', h('select', { onchange: (e) => { S.gameplay.camera = e.target.value; save(); } }, CAMERA_PRESETS.map((c) => h('option', { value: c, selected: S.gameplay.camera === c }, CAMERA_LABEL[c])))),
      field('Sprint toggle', toggle(S.gameplay.sprintToggle, (v) => { S.gameplay.sprintToggle = v; save(); })),
      field('Play-call UI', toggle(S.gameplay.playCallUI, (v) => { S.gameplay.playCallUI = v; save(); })),
      field('Auto replays', toggle(S.gameplay.replays, (v) => { S.gameplay.replays = v; save(); })),
      field('Foul sensitivity', slider(S.gameplay.foulSensitivity, (v) => { S.gameplay.foulSensitivity = v; save(); }, 0.4, 1.6, 0.05), '0.4 lenient · 1.6 strict'),
      field('Travel / double-dribble', seg([['arcade', 'Arcade (off)'], ['sim', 'Simulation']], S.gameplay.travel, (v) => { S.gameplay.travel = v; save(); })),
      field('Defensive 3-seconds', toggle(S.gameplay.threeSecond, (v) => { S.gameplay.threeSecond = v; save(); })),
    ],
    Video: () => [
      field('Quality preset', seg([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], S.video.preset === 'auto' ? app.autoPreset : S.video.preset, (v) => { S.video.preset = v; Object.assign(S.video, { shadows: PRESETS[v].shadows, bloom: PRESETS[v].bloom, ssao: PRESETS[v].ssao, ca: PRESETS[v].ca, motionBlur: PRESETS[v].motionBlur, fxaa: PRESETS[v].fxaa, resolutionScale: PRESETS[v].scale }); app.applyVideo(); save(); app.refreshSettings(); }), S.video.benchmarked ? `auto-detected: ${app.autoPreset}` : ''),
      field('Resolution scale', slider(S.video.resolutionScale, (v) => { S.video.resolutionScale = v; app.applyVideo(); save(); }, 0.4, 1.5, 0.05)),
      field('Shadows', toggle(S.video.shadows, (v) => { S.video.shadows = v; app.applyVideo(); save(); })), field('Bloom', toggle(S.video.bloom, (v) => { S.video.bloom = v; app.applyVideo(); save(); })),
      field('SSAO', toggle(S.video.ssao, (v) => { S.video.ssao = v; app.applyVideo(); save(); })), field('Chromatic aberration (big plays)', toggle(S.video.ca, (v) => { S.video.ca = v; app.applyVideo(); save(); })),
      field('Anti-aliasing (FXAA)', toggle(S.video.fxaa, (v) => { S.video.fxaa = v; app.applyVideo(); save(); })), field('Motion blur', toggle(S.video.motionBlur, (v) => { S.video.motionBlur = v; app.applyVideo(); save(); })),
      field('FPS cap', seg([[0, 'Uncapped'], [30, '30'], [60, '60'], [120, '120']], S.video.fpsCap, (v) => { S.video.fpsCap = v; save(); })), field('FPS counter', toggle(S.video.showFps, (v) => { S.video.showFps = v; save(); })),
      h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: async () => { await app.benchmark(true); app.refreshSettings(); } }, 'Re-run benchmark')),
    ],
    Accessibility: () => [
      field('Shot-meter palette', seg([['default', 'Default'], ['deuteranopia', 'Deuteranopia'], ['protanopia', 'Protanopia'], ['tritanopia', 'Tritanopia']], S.access.palette, (v) => { S.access.palette = v; save(); }), 'colour-blind-safe'),
      field('UI scale', slider(S.access.uiScale, (v) => { S.access.uiScale = v; app.applyAccess(); save(); }, 0.8, 1.4, 0.05)), field('Reduced motion', toggle(S.access.reducedMotion, (v) => { S.access.reducedMotion = v; app.applyAccess(); save(); })), field('Screen shake', toggle(S.access.screenShake, (v) => { S.access.screenShake = v; save(); })),
    ],
    Data: () => [h('div', { class: 'muted', style: { fontSize: '13px', lineHeight: 1.6, marginBottom: '12px' } }, 'Your profile, ranked history and settings are stored locally in this browser (IndexedDB).'), h('button', { class: 'btn danger', onclick: () => confirmDialog(app, 'Reset profile?', 'This permanently deletes your profile, ranked MMR, history and all settings.', async () => { await dbClear(); localStorage.removeItem('hoops27.pendingRanked'); location.reload(); }) }, 'Reset profile')],
  };
  let cur = initial; const show = (i) => { cur = i; clear(body); const r = pages[tabs[i]](); [r].flat().forEach((n) => body.append(n)); [...bar.children].forEach((b, k) => b.classList.toggle('on', k === i)); app.nav?.focusFirst?.(); };
  tabs.forEach((t, i) => bar.append(h('div', { class: 'tab', onclick: () => show(i) }, t))); root.append(bar, body); show(cur); root.refresh = () => show(cur); app.settingsRefresh = root.refresh; return root;
}
export function confirmDialog(app, title, text, onYes, yes = 'Confirm') {
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'panel red', style: { minWidth: '340px', maxWidth: '460px' } }, h('h3', { style: { marginBottom: '8px' } }, title), h('p', { class: 'muted', style: { lineHeight: 1.5 } }, text),
    h('div', { class: 'row', style: { marginTop: '14px', justifyContent: 'flex-end' } }, h('button', { class: 'btn', dataset: { back: '', default: '' }, onclick: () => { ov.remove(); app.nav.setRoot(app.prevNavRoot); } }, 'Cancel'), h('button', { class: 'btn danger', onclick: () => { ov.remove(); app.nav.setRoot(app.prevNavRoot); onYes(); } }, yes))));
  app.prevNavRoot = app.nav.root; app.uiRoot.append(ov); app.nav.setRoot(ov);
}
