# Neon Drive 3D

Night-city driving simulator (Three.js, fully procedural, no assets). Open `index.html` in a browser — no server needed.

Keys: W/↑ throttle · S/↓ brake · A D/←→ steer · Space drift · Shift boost · C camera · R rain · M mute · Enter start.

`src/main.js` is the source; `game.js` is the bundle (`npx esbuild src/main.js --bundle --minify --format=iife --outfile=game.js`, with `three` installed).
`classic-2d.html` is the earlier 2D version.
