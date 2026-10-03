# NEON BAY — a Miami × cyberpunk open-world crime sandbox

A GTA-style game that runs entirely in the browser (Three.js, fully procedural — no external assets).
Open **`index.html`** (self-contained, works offline, double-click it). Best in Chrome / Edge / Firefox with hardware acceleration.

## What's in it
- **Main menu** with a cinematic flyover, New Game / Continue / Settings / Controls / Sandbox cheats.
- **Open world** (~1.7 km × 1.5 km, 288 city blocks + beach, boardwalk, pier, ocean): Ocean Drive art-deco, Neon Mile, Chrome Heights (towers with animated ad screens), Wynwood Arts murals, Harbor Yards container port, Palm Gardens parks, elevated skyline beyond the fog.
- **Day/night + weather**: full sun/moon cycle, sunsets, clear / overcast / rain / storm with lightning, wet reflections, real sun shadows.
- **AI traffic** on the road grid: lane following, working traffic lights, turns, braking for cars/pedestrians, panic, parked cars you can steal. Sedans, coupes, SUVs, taxis, supercars, hover racers.
- **Pedestrians** on sidewalks, crosswalks and the beach: panic from gunfire/explosions, dodge (or not) cars, can be punched, shot or run over.
- **Police & wanted level (1–5 ★)**: crimes need witnesses; cruisers path-find through the street grid and ram you, cops dismount and shoot/arrest, SWAT trucks, a helicopter with a searchlight (that you can shoot down); lose them by breaking line of sight. Busted / Wasted respawn with a fee.
- **On foot & in cars**: third-person controller, aim/shoot (pistol, SMG, shotgun, rocket launcher), car physics with drifting, damage, fire and explosions, carjacking, car radio (4 procedural stations).
- **Jobs**: courier runs, hot-car thefts, contract hits (yellow markers). **Pickups**: health, armor, weapons. Cash, save/continue, full map with waypoints.
- **Settings**: quality presets, view distance, shadows, bloom, FOV, traffic/pedestrian/parked-car density, time speed, weather, difficulty, police aggression, mouse sensitivity, volumes. **Sandbox**: wanted level, spawn any vehicle, give weapons, teleport, set time/weather, god mode.

## Controls
Foot: **WASD** move · mouse look · **Shift** sprint · **Space** jump · **RMB** aim · **LMB** fire · **R** reload · **1–5 / Q E / wheel** weapons · **F** enter vehicle / start job.
Car: **W/S** gas/brake-reverse · **A/D** steer · **Space** handbrake · **H** horn · **C** look back · **Q/E** radio · **F** exit.
General: **M** map (click = waypoint) · **Esc** pause. If pointer lock is unavailable, hold **RMB** and drag to look.

## Source
`src/` — `world.js` (city generator), `env.js` (sky/ocean/weather), `vehicles.js`, `traffic.js`, `peds.js`, `police.js`, `missions.js`, `player.js`, `combat.js`, `hud.js`, `menu.js`, `audio.js`, `fx.js`, `main.js`.
Rebuild: `npm i three esbuild` somewhere, then `NM=/path/to/that/dir ./build.sh`.
