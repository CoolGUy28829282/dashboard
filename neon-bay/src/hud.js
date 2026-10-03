// DOM HUD + canvas minimap + full-screen map.
import { clamp } from './util.js';
import { WEAPONS } from './combat.js';
import { STATIONS } from './audio.js';

export function createHud(G) {
  const $ = id => document.getElementById(id), H = {};
  const el = { cash: $('h-cash'), hp: $('h-hp'), armor: $('h-armor'), stars: $('h-stars'), clock: $('h-clock'), weapon: $('h-weapon'), ammo: $('h-ammo'), prompt: $('h-prompt'), feed: $('h-feed'), big: $('h-big'), zone: $('h-zone'), street: $('h-street'), speed: $('h-speed'), speedunit: $('h-unit'), radio: $('h-radio'), dmg: $('h-dmg'), cross: $('h-cross'), mission: $('h-mission'), map: $('h-map'), root: $('hud'), vehbox: $('h-vehbox'), wbox: $('h-wbox'), hitm: $('h-hit'), bigmap: $('bigmap'), bigcv: $('bigmap-cv'), vname: $('h-vname'), hbar: $('h-hbar'), abar: $('h-abar') };
  const mc = el.map.getContext('2d'); let lastZone = '', zoneT = 0, lastStreet = '';
  H.notify = (t) => { const d = document.createElement('div'); d.textContent = t; el.feed.appendChild(d); setTimeout(() => d.classList.add('out'), 3200); setTimeout(() => d.remove(), 3800); while (el.feed.children.length > 5) el.feed.firstChild.remove(); };
  H.big = (t, color = '#fff', sub = '') => { el.big.innerHTML = `<b style="color:${color}">${t}</b>${sub ? '<small>' + sub + '</small>' : ''}`; el.big.classList.remove('show'); void el.big.offsetWidth; el.big.classList.add('show'); setTimeout(() => el.big.classList.remove('show'), 3600); };
  H.flashDamage = () => { G.player.hitFlash = 1; };
  H.setVisible = v => { el.root.style.display = v ? 'block' : 'none'; };
  const money = n => '$' + Math.floor(n).toLocaleString('en-US');
  H.update = (dt) => {
    const P = G.player, cfg = G.cfg, pol = G.police; el.root.classList.toggle('nohud', !cfg.hud); el.map.parentElement.style.display = cfg.minimap && cfg.hud ? 'block' : 'none';
    el.cash.textContent = money(P.cash); el.hbar.style.width = clamp(P.hp, 0, 100) + '%'; el.abar.style.width = clamp(P.armor, 0, 100) + '%'; el.abar.parentElement.style.opacity = P.armor > 0 ? 1 : 0.35;
    const h = Math.floor(G.env.hour), m = Math.floor((G.env.hour - h) * 60); el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${G.env.weather}`;
    const stars = G.cfg.neverWanted ? 0 : (pol ? pol.stars : 0); el.stars.innerHTML = '★★★★★'.split('').map((s, i) => `<i class="${i < stars ? 'on' : ''}">★</i>`).join(''); el.stars.classList.toggle('search', pol && pol.stars > 0 && pol.searching);
    // weapon / vehicle boxes
    const v = P.vehicle; el.vehbox.style.display = v ? 'block' : 'none'; el.wbox.style.display = !v && P.state === 'foot' ? 'block' : 'none';
    if (v) { const kmh = v.speed * 3.6, disp = cfg.units === 'mph' ? kmh * 0.6214 : kmh; el.speed.textContent = Math.round(disp); el.speedunit.textContent = cfg.units; const st = STATIONS[G.audio.station]; el.radio.textContent = st.style === 'off' ? 'RADIO OFF   [Q/E]' : `${st.name} — ${st.track[Math.floor(G.clock / 60) % st.track.length]}   [Q/E]`; el.vname.textContent = v.name + (v.health < 350 ? ' (damaged)' : ''); }
    else { const w = P.weapon(); el.weapon.textContent = w.name; el.ammo.textContent = w.melee ? '' : (P.reloadT > 0 ? 'RELOADING' : `${P.mags[w.id] || 0} / ${(P.ammo[w.id] || 0) - (P.mags[w.id] || 0)}`); }
    // prompt
    let prompt = ''; if (P.state === 'foot' && P.nearVehicle && !P.aiming) { const nv = P.nearVehicle; prompt = nv.driver && nv.driver !== P ? `<kbd>F</kbd> Carjack ${nv.name}` : `<kbd>F</kbd> Enter ${nv.name}`; } else if (P.state === 'vehicle') prompt = ''; if (!prompt && G.promptExtra) prompt = G.promptExtra(); if (!G.input.locked && !G.paused && G.state === 'play') prompt = '<kbd>Click</kbd> to capture the mouse &nbsp;·&nbsp; or hold <kbd>RMB</kbd> and drag to look'; el.prompt.innerHTML = prompt; el.prompt.style.opacity = prompt ? 1 : 0;
    el.cross.style.opacity = P.state === 'foot' && (P.aiming || (P.weapon().id !== 'fists')) ? (P.aiming ? 1 : 0.55) : 0; el.hitm.style.opacity = P.hitMarker > 0 ? Math.min(1, P.hitMarker) : 0; el.hitm.classList.toggle('kill', P.hitMarker > 1);
    el.dmg.style.opacity = clamp(P.hitFlash * 0.9 + (P.hp < 30 && P.state === 'foot' ? 0.25 + 0.15 * Math.sin(G.clock * 6) : 0), 0, 1);
    // zone
    const name = G.world.districtName(P.x, P.z), street = G.world.nameAt(P.x, P.z); if (name !== lastZone) { lastZone = name; zoneT = 4; el.zone.textContent = name.toUpperCase(); } if (zoneT > 0) { zoneT -= dt; } el.zone.style.opacity = zoneT > 0 ? Math.min(1, zoneT) : 0; if (street !== lastStreet) { lastStreet = street; el.street.textContent = street; }
    el.mission.innerHTML = G.missions ? G.missions.hudText() : '';
    H.drawMinimap(); if (!el.bigmap.hidden) H.drawBigMap();
  };
  H.drawMinimap = () => {
    const P = G.player, W = 200, c = mc, map = G.world.map, zoom = 0.72, yaw = G.player.state === 'vehicle' || G.player.state === 'foot' ? P.camYaw : P.camYaw;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, W); c.save(); c.translate(W / 2, W / 2); c.rotate(-Math.PI / 2 - yaw); c.scale(zoom, zoom); c.translate(-(P.x - map.x0) * map.s, -(P.z - map.z0) * map.s); c.drawImage(map.canvas, 0, 0);
    const tx = x => (x - map.x0) * map.s, tz = z => (z - map.z0) * map.s, dot = (x, z, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(tx(x), tz(z), r / zoom, 0, 6.2832); c.fill(); };
    if (G.police && G.police.stars > 0) { const flash = Math.floor(G.clock * 4) % 2; for (const cv of G.police.cars) if (cv.v && !cv.v.dead) dot(cv.v.x, cv.v.z, 4.5, flash ? '#ff3040' : '#4070ff'); for (const cop of G.police.foot()) dot(cop.x, cop.z, 3, flash ? '#ff3040' : '#4070ff'); if (G.police.heli) dot(G.police.heli.x, G.police.heli.z, 5, flash ? '#ff3040' : '#4070ff'); }
    for (const p of G.player.pickups) if (p.active && p.type !== 'health') dot(p.x, p.z, 3, p.type === 'armor' ? '#5aa0ff' : '#ffb02e');
    c.restore();
    // objective / waypoint markers (clamped to the radar edge)
    const marks = []; if (G.missions) for (const m of G.missions.markers()) marks.push(m); if (G.waypoint) marks.push({ x: G.waypoint.x, z: G.waypoint.z, color: '#ff2d95', r: 5 });
    for (const m of marks) { const dx = m.x - P.x, dz = m.z - P.z, ca = Math.cos(-Math.PI / 2 - yaw), sa = Math.sin(-Math.PI / 2 - yaw); let sx = (dx * ca - dz * sa) * zoom, sy = (dx * sa + dz * ca) * zoom; const d = Math.hypot(sx, sy), lim = 86; let edge = false; if (d > lim) { sx *= lim / d; sy *= lim / d; edge = true; } c.fillStyle = m.color; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); if (edge) { c.arc(W / 2 + sx, W / 2 + sy, 5, 0, 6.2832); } else { c.rect(W / 2 + sx - 5, W / 2 + sy - 5, 10, 10); } c.fill(); c.stroke(); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2, W / 2 - 8); c.lineTo(W / 2 - 6, W / 2 + 6); c.lineTo(W / 2, W / 2 + 3); c.lineTo(W / 2 + 6, W / 2 + 6); c.closePath(); c.fill(); c.stroke();
    const th = -Math.PI / 2 - yaw; c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', W / 2 + Math.sin(th) * 91, W / 2 - Math.cos(th) * 91); c.textBaseline = 'alphabetic';
  };
  H.drawBigMap = () => {
    const cv = el.bigcv, c = cv.getContext('2d'), map = G.world.map, W = cv.width = Math.min(innerWidth - 80, 1100), Hh = cv.height = Math.min(innerHeight - 120, 760), s = Math.min(W / map.w, Hh / map.h), ox = (W - map.w * s) / 2, oz = (Hh - map.h * s) / 2;
    c.clearRect(0, 0, W, Hh); c.drawImage(map.canvas, ox, oz, map.w * s, map.h * s); const tx = x => ox + (x - map.x0) * map.s * s, tz = z => oz + (z - map.z0) * map.s * s; H.bigScale = { s, ox, oz };
    c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; for (const [n, p] of Object.entries({ 'OCEAN DRIVE': [G.world.spawns.beach.x - 70, G.world.spawns.beach.z - 150], 'NEON MILE': [G.world.spawns.neon.x, G.world.spawns.neon.z - 400], 'CHROME HEIGHTS': [G.world.spawns.downtown.x, G.world.spawns.downtown.z - 120], 'WYNWOOD ARTS': [G.world.spawns.arts.x + 40, G.world.spawns.arts.z - 150], 'HARBOR YARDS': [G.world.spawns.port.x + 60, G.world.spawns.port.z] })) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillText(n, tx(p[0]) + 1, tz(p[1]) + 1); c.fillStyle = '#fff'; c.fillText(n, tx(p[0]), tz(p[1])); }
    const P = G.player; if (G.waypoint) { c.fillStyle = '#ff2d95'; c.beginPath(); c.arc(tx(G.waypoint.x), tz(G.waypoint.z), 7, 0, 6.2832); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    if (G.missions) for (const m of G.missions.markers(true)) { c.fillStyle = m.color; c.beginPath(); c.arc(tx(m.x), tz(m.z), 6, 0, 6.2832); c.fill(); c.strokeStyle = '#000'; c.stroke(); }
    c.save(); c.translate(tx(P.x), tz(P.z)); c.rotate(P.a + Math.PI / 2); c.fillStyle = '#22e6ff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -9); c.lineTo(-7, 8); c.lineTo(0, 4); c.lineTo(7, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
  };
  H.bigMapClick = (e) => { const r = el.bigcv.getBoundingClientRect(), x = e.clientX - r.left, z = e.clientY - r.top, { s, ox, oz } = H.bigScale, map = G.world.map; G.waypoint = { x: (x - ox) / s / map.s + map.x0, z: (z - oz) / s / map.s + map.z0 }; G.hud.notify('Waypoint set'); };
  el.bigcv.addEventListener('click', H.bigMapClick); el.bigcv.addEventListener('contextmenu', e => { e.preventDefault(); G.waypoint = null; });
  H.el = el; return H;
}
