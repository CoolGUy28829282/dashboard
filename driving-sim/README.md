# Neon Drive 3D — cyberpunk megacity

Procedural 3D night-city driving sim (Three.js, no assets). Open **`index.html`** in a browser — it is fully self-contained.

**Controls:** W/↑ throttle · S/↓ brake · A D/←→ steer · Space drift · Shift boost · C camera · R rain · T autopilot · H hide HUD · P pause · F2 screenshot · M mute · Enter start · **Tab / Esc = customization panel**

**Customization (~70 settings, saved in your browser):** theme presets + custom accent colours, atmosphere, sky bodies, neon intensity, rain / wet roads / fog / lightning, city seed, density, building height, megatowers, lit windows, neon trim, signs, animated ad screens, holograms, searchlights, arches, overpasses, elevated maglev + train, flying cars, drones, road curviness; vehicle body (Coupe / Wedge / Hover), paint + finish, trim, underglow, wheels, spoiler, lights, tint, licence plate; traffic; four cameras; graphics (bloom, grain, CRT, aberration, render scale, quality presets); gameplay tuning; synth music; HUD. Presets can be saved, exported and imported.

**Source:** `src/game.js` (engine), `src/config.js` (schema + presets), `src/ui.js` (panel), `src/audio.js`, `src/template.html`.
**Rebuild:** `npm i three esbuild`, then `npx esbuild src/game.js --bundle --minify --format=iife --outfile=game.js` and inline `game.js` + `src/guard.html` into `src/template.html` (`__INLINE__`) to produce `index.html` (see `build.sh`).
`classic-2d.html` is the earlier 2D version.
