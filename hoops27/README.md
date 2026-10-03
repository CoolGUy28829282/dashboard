# HOOPS 27: NEON ERA

A playable, fully 3D 5v5 basketball simulation with a near-future "Neon Era" identity. Three.js (WebGL2) rendering, Rapier (WASM) ball physics,
a 120 Hz physics / 60 Hz logic fixed timestep with interpolated uncapped rendering, procedural athletes, WebAudio synthesis, IndexedDB persistence,
Play Now (CPU / local versus / spectate) and a simulated Ranked ladder.

> Lives in `hoops27/` inside the repository. It is independent of the pre-market dashboard in the parent folder.

## Setup

```bash
cd hoops27
npm install
npm run dev      # http://localhost:5173
npm test         # 35 unit + simulation tests (vitest)
npm run build    # production bundle in dist/
```

Chrome / Edge / Firefox with WebGL2. First launch runs a one-time graphics benchmark and picks Low / Medium / High / Ultra (Settings → Video to override).
Fonts (Orbitron, Inter) load from Google Fonts and fall back to system fonts offline.

## Controls

| Action | Keyboard (P1) | Gamepad (Xbox / PlayStation) |
|---|---|---|
| Move | WASD | Left stick |
| Sprint (drains stamina) / hands up on D | Shift | RT / R2 |
| Shoot (offence) / block (defence) | **K** — hold, release on the green window | **X / □** |
| Shot-stick mode (Settings → Gameplay) | Hold **Arrow Up** or mouse button | Flick right stick up |
| Dunk attempt | Shoot while sprinting near the rim | Shoot + RT |
| Pass (auto type; Sprint+Pass = no-look) | J | A / ✕ |
| Lob / alley-oop / block | U | Y / △ (tap) |
| Call a screen | hold T | hold Y / △ (0.35 s) |
| Pump fake | Z | RB / R1 |
| Hesitation / take charge | C | release LT / hold LT |
| Step-back | L | B / ○ |
| Crossover | Arrow ←→ flick | Right-stick left-right flick |
| Behind-the-back | Arrow diagonals | Right-stick diagonal |
| Spin move | Arrow circle | Right-stick circle |
| Post-up (back-down) | hold V | hold LT |
| Switch defender / call for ball | Q / F | LB / L1 |
| Steal (swipe) | E | X / □ on defence |
| Play calls 1–5 | 1–5 | D-pad (plays 1–4) |
| Camera cycle | Tab | View / Share |
| Pause | Esc | Menu / Options |
| Debug overlay | F3 | – |
| Replay: skip / slow-mo speed / orbit | Space / O / drag | A |

**Player 2 (local versus, split keyboard):** IJKL move, Right Shift sprint, `.` shoot, `,` pass, `M` lob, `N` pump, `B` step-back, `/` steal, `O` switch.
All keyboard and gamepad bindings can be remapped in Settings → Controls. Gamepad rumble fires on shots, rim hits, contact, fouls and perfect releases.

## The shooting system (the part to read first)

Everything is in `src/gameplay/shooting.js` (pure functions) and `src/gameplay/actions.js` (flow), numbers in `src/tuning.js`.

1. Press Shoot while holding the ball → shot **committed**, the jump starts, a world-space arc fills under the shooter's feet (Standard), a dot flashes at the head (Minimal), or nothing (Off).
2. The meter reaches 100% after `baseTime[type] × releaseSpeedModifier` (layup .45 s … free throw .95 s fixed). The green window is centred on 100%.
3. Release offset in ms (negative = early, positive = late) is graded: Perfect ≤ W/2, Excellent ≤ W/2+25, Good ≤ W/2+55, Early/Late ≤ W/2+100, otherwise Way off. `W = BaseWindow + 0.9·rating − 0.5·contest·80 − 0.3·fatigue·100 + badge`, clamped 18–180 ms.
4. Make% = `Base(rating) × distance × contest × fatigue × situation × streak × difficulty × grade`, clamped 1–99%; Perfect + uncontested is a forced make (not on Hall of Fame).
5. Makes follow a scripted arc (swish / bank / rim-in); misses are launched to a physical rim/backboard hit point and handed to Rapier for the bounce and the rebound fight.

Press **F3** during play to see live make%, contest, grade, window width and every modifier, plus ball physics and per-player FSM / AI utility scores.

## Tuning constants

All adjustable numbers live in **`src/tuning.js`** (court/rim/ball dimensions, shot timing and probability curves, grade bands, streak caps, difficulty scaling, movement, rules, ranked MMR, AI difficulty table, shot-variant table).

| Group | Highlights |
|---|---|
| `COURT` | 28.65 × 15.24 m, rim 3.048 m, inner Ø 0.457 m, three 7.24 m (corner 6.71 m), FT line 4.57 m from the backboard, ball Ø 0.239 m / 0.62 kg |
| `SHOT` | base times, `BaseWindow` per type, `base = 0.12 + 0.78·((R−25)/74)^1.35`, grade modifiers, contest/fatigue penalties, off-dribble −6%, off-balance −12%, catch-and-shoot +4%, streak +4%/−3% per tier (caps +12/−9), difficulty (+10 … −8%) |
| `MOVE` | top speed 4.2–6.0 m/s, acceleration 8–18 m/s², 180° turn 140 ms, fatigue up to −14% speed, dribble-move cooldown 420–180 ms |
| `RULES` | 24 s / 14 s / 8 s / 5 s / 3 s, 7 timeouts, 5-foul bonus, 6-foul disqualification, clutch ≤ 5 min and ≤ 5 pts |
| `RANKED` | start 1000, K 40 / 24, division every 100 from 800, streak +2 from 3rd win (cap +10), ±150 MMR matchmaking, 30 s pause budget, rage-quit ×1.5 |
| `AI.levels` | reaction time (Rookie 420 ms … Hall of Fame 120 ms), accuracy, steal frequency, contest aggression, decision quality, timing σ |

## Architecture

```
src/
  tuning.js         single source of truth for numbers
  engine/           renderer + post FX, arena, athletes (rig/IK/LOD), camera rig, view (sim→scene), input, replay, session, event bus, rng
  physics/          Rapier world: ball, floor, backboards, rims (28 sphere colliders), ballistic helpers
  gameplay/         Game (GameState manager + rules engine), actions, movement, court geometry, pure maths: shooting, contest, foul, elo, badges
  ai/               controller (FSM labels + utility scoring every ~100 ms), steering (seek/arrive/separation/avoid/interpose), spacing (grid evaluator)
  data/             seeded generator (16 teams × 10 players, arenas, 12 shooting forms), plays, defaults, IndexedDB wrapper, TS model reference
  modes/            ranked (profile, MMR, matchmaking, season, leaderboard)
  ui/               DOM menus (3D carousel), HUD, pause, settings, box score / shot chart / game flow
  audio/            WebAudio engine (spatialised), commentary
  shaders/          GLSL for post FX, light beams, particles, shot meter
public/assets/      empty by design (everything is procedural); glTF drop-in notes
tests/              shooting, physics, headless full games, balance, ranked
```

Key decisions: **simulation is renderer-free** (`Game` runs headless in tests and drives CPU-vs-CPU games to completion); the view only reads state and
interpolates between 60 Hz ticks; all cross-module communication goes through `EventBus` (score, foul, block, popup, shotGrade, …), which also drives
audio, commentary, replays, camera cuts and rumble.

## File tree

```
.gitignore
dev.html
index.html
package-lock.json
package.json
public/assets/README.md
src/ai/controller.js
src/ai/spacing.js
src/ai/steering.js
src/audio/audio.js
src/audio/commentary.js
src/data/db.js
src/data/defaults.js
src/data/generator.js
src/data/models.d.ts
src/data/plays.js
src/dev.js
src/engine/arena.js
src/engine/athlete.js
src/engine/backdrop.js
src/engine/bus.js
src/engine/camera.js
src/engine/fx.js
src/engine/input.js
src/engine/renderer.js
src/engine/replay.js
src/engine/rng.js
src/engine/session.js
src/engine/view.js
src/gameplay/actions.js
src/gameplay/badges.js
src/gameplay/contest.js
src/gameplay/court.js
src/gameplay/elo.js
src/gameplay/foul.js
src/gameplay/game.js
src/gameplay/movement.js
src/gameplay/shooting.js
src/main.js
src/modes/ranked.js
src/physics/world.js
src/shaders/beam.js
src/shaders/meter.js
src/shaders/particles.js
src/shaders/postfx.js
src/tuning.js
src/ui/boxscore.js
src/ui/dom.js
src/ui/hud.js
src/ui/pause.js
src/ui/screens.js
src/ui/settings.js
src/ui/style.css
tests/balance.test.js
tests/physics.test.js
tests/ranked.test.js
tests/shooting.test.js
tests/sim.test.js
vite.config.js
```

(`dev.html` is a developer harness: CPU-vs-CPU spectate with `?q=low|medium|high|ultra&cam=...&speed=N`.)

## Defaults I chose where the spec was silent

- **JavaScript (ES modules), not TypeScript**; `src/data/models.d.ts` documents every data shape.
- **18 attributes** (the brief says 17 but lists 18 — all 18 are implemented).
- Teams attack +x in halves 1 and 3, −x in 2 and 4; the broadcast camera sits on the +z sideline so +x is screen-right.
- Hot/cold tiers: 2 consecutive makes = tier 1 … 4+ = "On fire" (tier 3); 3 straight misses = cold tier 1.
- The AI's timing σ is scaled per shot type (layups far steadier than threes) so CPU percentages land near real basketball (≈ 40–48% FG).
- Possession arrow alternates at quarter starts; out-of-bounds uses last touch; timeouts after the 7th are refused; CPU coaches call timeouts on 9–0 runs and in close endgames.
- Ranked below placement shows "Placement n/5" instead of a tier; promotion/demotion overlay triggers on tier-or-division change and on completing placements.
- Dead-ball resets (after a make, out-of-bounds, foul) place players in an inbound formation instead of walking them there.
- Rage quit = closing/reloading the tab during a ranked match; a flag stored in `localStorage` applies a ×1.5 loss on next launch. Forfeit and pause-budget expiry are normal losses.

## Known limitations and next steps

- **Verification:** logic is covered by 35 automated tests, including full headless games across seeds/difficulties. Rendering was verified only in headless Chromium on software GL (a few FPS), so the **60 FPS @ 1080p budget, gamepad rumble and real-time feel have not been measured on real hardware**. Expect to tune `tuning.js` and the AI after playtesting.
- **Players are not Rapier bodies.** Rapier handles the ball, floor, backboards and rims; player–player collision is a custom strength-weighted capsule separation. Next: kinematic character controllers for players.
- **Animation** is a pose-blend state machine with analytic two-bone IK (hands onto the ball) and ground-clamp foot placement, not authored clips. All shot variants share the shoot/layup/dunk poses (with fadeaway lean); they differ in meter timing, release height, contest vulnerability and label. The glTF hook (`AthleteFactory.useGLTF`) loads a model but does not yet bind clips.
- **Anti-aliasing is FXAA** (no TAA). SSAO and motion blur are Ultra-only by default.
- **Travel / double-dribble** (Simulation mode) is limited to the pump-fake gather case, plus over-and-back. Dribbling is automatic.
- **Intro:** fly-through camera and holographic starting-five reveal; there is no player-tunnel sequence.
- **Injuries** are displayed as off and not simulated. Ranked matchmaking and the leaderboard are simulated locally (no server).
- Play call 5 (Horns) is keyboard / on-screen only on gamepad (the D-pad has four directions); crowd and commentary are synthesised, not sampled.
- Pick-and-roll screens are a soft slow-down on the on-ball defender, not full physical screening.
