# Assets

HOOPS 27 ships with **no binary assets**: athletes, court, crowd, ball, logos, audio and UI are all generated procedurally.

To swap in authored art, drop an `athlete.glb` here and call `AthleteFactory.useGLTF('/assets/athlete.glb')` (see `src/engine/athlete.js`).
The factory only needs a skinned character with clips named `idle`, `run`, `dribble`, `shoot`, `defend`; bind them by state name.
