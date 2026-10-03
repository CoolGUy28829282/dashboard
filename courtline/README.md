# Courtline — Pro Basketball (browser)

Original basketball game in Three.js. No external assets: every model, texture, logo, sound and tune is generated in code.
Everything (league, teams, players, logos, names) is fictional.

## Run

ES modules need an HTTP server (not `file://`):

```
cd courtline
python3 -m http.server 8000      # then open http://localhost:8000
```

Three.js loads from jsDelivr via the import map in `index.html` (pinned to 0.170.0).

## Architecture

```
index.html ─ import map ─ src/main.js (boot, wiring, changelog)
 core/   loop.js      fixed 120 Hz simulation + interpolated render, gap clamp, hidden-tab pause, frame cap
         quality.js   adaptive resolution (steps down when frames miss the display refresh, back up with headroom)
         perf.js      overlay: FPS, frame-time graph (cpu vs interval), draw calls, triangles, heap, spikes (F3, reset F4)
         state.js     central game state: mode, league, active slot, news
         settings.js  schema -> defaults + UI; every change is saved and emitted; bindings for keyboard + gamepad
         input.js     keyboard / mouse / gamepad, device detection, menu nav events, action state with input buffer
         audio.js     procedural SFX buffers (generated in chunks), pooled gain voices, buses, look-ahead music scheduler
         save.js      IndexedDB (localStorage fallback), slots + autosave, JSON export/import with validation
 league/ generate.js  seeded generator (generator function, runs in worker.js, chunked fallback in api.js)
         names.js, logo.js (logos + jerseys on canvas), news.js (ticker facts derived from league data)
 game/   court.js     regulation dimensions in metres + court texture;  ballphys.js  drag, Magnus, shot-speed solver
 gfx/    gfx.js       renderer owner (presets, resolution scaling, MSAA rebuild)
         humanoid.js  rig proportioned from height/wingspan/weight, analytic two-bone IK, distance-driven stride
         menuArena.js live menu scene (arena, stands, instanced crowd, hoops, shooter, orbit camera)
 ui/     router.js (screen stack + transitions) · nav.js (focus for kb/mouse/pad) · components.js · screens/*
```

Flow: `main` creates settings/state/audio/input/gfx, registers screens, starts the loop, shows the splash, and boots in the
background (save storage -> league load or worker generation -> audio synthesis -> arena build -> shader/texture warm-up).
The title screen waits on that boot, so the user only ever sees a loading bar if they are faster than the boot.

## Smoothness measures in place (Phase 1)

- Fixed 120 Hz step, render interpolated by the leftover accumulator fraction; frame gaps clamped to 50 ms; loop stops when hidden.
- No allocation in the step/render path (pre-allocated vectors, typed arrays, scalar physics). Audio is the one exception: a
  `BufferSource` per sound (unavoidable in Web Audio); gain nodes are pooled and polyphony is capped.
- League generation in a Web Worker; fallback runs the same generator in 5 ms slices per frame. Sample synthesis and arena
  construction are chunked across frames. `compileAsync` plus three warm-up renders and `initTexture` run during loading.
- Menus animate only `transform`/`opacity`; no `backdrop-filter`; layout is measured only in response to input.
- Adaptive quality, FPS cap (30/60/90/120/144 or display rate), resolution scale, shadow/crowd/reflection/MSAA options.

## What to test

1. Splash -> title -> "Press any button" -> menu. Menu music + crowd murmur start after the first key press.
2. Menu background: the shooter dribbles (ball bounce drives the hand), squares up, jumps and shoots; the net reacts.
3. Settings: change every page; changes apply immediately (Camera sliders move the live background; Graphics preset
   rewrites the options and switches to Custom when you edit one; colourblind mode, text size, volumes).
4. Controls: remap a key/button (Esc cancels, duplicates swap), reload and confirm it persisted. Controls guide reflects it.
5. League & saves: browse teams (logos, uniforms, arena, payroll), roster and player cards; Saves tab: new league by seed,
   save to a slot, load, export, delete, import. Autosave appears after generation and every 30 s when something changed.
6. F3 opens the performance overlay; look for the cpu bars staying below the 12 ms line.
7. Keyboard (arrows/WASD, Enter, Esc, Q/E), mouse, and gamepad (stick/D-pad, A, B, LB/RB) all drive every screen; the prompt
   bar switches glyphs with the last device used.
