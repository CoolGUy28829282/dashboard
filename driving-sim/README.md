# Neon Drive 3D

Night-city driving simulator (Three.js, fully procedural, no assets). Open `index.html` in a browser — no server needed.

Keys: W/↑ throttle · S/↓ brake · A D/←→ steer · Space drift · Shift boost · C camera · R rain · M mute · Enter start.

`index.html` is fully self-contained (game inlined). Source: `src/main.js` + `src/template.html`; rebuild with esbuild -> `game.js`, then `./build.sh` (needs `three` + `esbuild` installed).
`classic-2d.html` is the earlier 2D version.
