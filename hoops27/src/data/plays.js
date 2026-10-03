// Offensive sets (spec §6.5). Coordinates are attack-local: d = metres from the attacked baseline, l = lateral metres.
// Slots follow lineup order by position: 0 PG, 1 SG, 2 SF, 3 PF, 4 C. act: ball | screen | roll | pop | cut | spot | post | lift
export const PLAYS = [
  { id: 'pnr', name: 'Pick-and-Roll', kind: 'screen', steps: [
    { dur: 1.6, slots: [{ d: 9.0, l: 0.5, act: 'ball' }, { d: 6.5, l: 5.8, act: 'spot' }, { d: 1.6, l: -6.4, act: 'spot' }, { d: 4.5, l: -5.0, act: 'spot' }, { d: 8.0, l: 1.6, act: 'screen' }] },
    { dur: 2.2, slots: [{ d: 6.0, l: -1.0, act: 'drive' }, { d: 6.5, l: 5.8, act: 'spot' }, { d: 1.6, l: -6.4, act: 'spot' }, { d: 4.5, l: -5.0, act: 'lift' }, { d: 2.4, l: 0.6, act: 'roll' }] },
  ] },
  { id: 'pnp', name: 'Pick-and-Pop', kind: 'screen', steps: [
    { dur: 1.5, slots: [{ d: 9.2, l: -0.5, act: 'ball' }, { d: 1.6, l: 6.4, act: 'spot' }, { d: 6.8, l: -5.8, act: 'spot' }, { d: 5.0, l: 5.0, act: 'spot' }, { d: 8.2, l: -1.5, act: 'screen' }] },
    { dur: 2.2, slots: [{ d: 7.5, l: 1.5, act: 'drive' }, { d: 1.6, l: 6.4, act: 'spot' }, { d: 6.8, l: -5.8, act: 'spot' }, { d: 4.0, l: 3.0, act: 'cut' }, { d: 8.4, l: -3.8, act: 'pop' }] },
  ] },
  { id: 'iso', name: 'Isolation', kind: 'iso', steps: [
    { dur: 3.2, slots: [{ d: 7.4, l: 3.2, act: 'ball' }, { d: 1.6, l: 6.5, act: 'spot' }, { d: 1.6, l: -6.5, act: 'spot' }, { d: 6.8, l: -5.8, act: 'spot' }, { d: 4.2, l: -4.4, act: 'spot' }] },
  ] },
  { id: 'post', name: 'Post Split', kind: 'post', steps: [
    { dur: 1.8, slots: [{ d: 8.5, l: 2.5, act: 'ball' }, { d: 6.5, l: 6.0, act: 'spot' }, { d: 5.0, l: -2.5, act: 'cut' }, { d: 5.8, l: -5.0, act: 'spot' }, { d: 2.6, l: 1.9, act: 'post' }] },
    { dur: 2.4, slots: [{ d: 9.0, l: 3.0, act: 'ball' }, { d: 1.8, l: 6.2, act: 'cut' }, { d: 2.6, l: -1.2, act: 'cut' }, { d: 6.8, l: -5.5, act: 'spot' }, { d: 2.4, l: 1.9, act: 'post' }] },
  ] },
  { id: 'horns', name: 'Horns', kind: 'screen', steps: [
    { dur: 1.7, slots: [{ d: 9.2, l: 0, act: 'ball' }, { d: 1.6, l: 6.4, act: 'spot' }, { d: 1.6, l: -6.4, act: 'spot' }, { d: 5.9, l: -2.4, act: 'screen' }, { d: 5.9, l: 2.4, act: 'screen' }] },
    { dur: 2.2, slots: [{ d: 6.0, l: 2.0, act: 'drive' }, { d: 1.6, l: 6.4, act: 'spot' }, { d: 6.8, l: -5.0, act: 'spot' }, { d: 7.6, l: -2.8, act: 'pop' }, { d: 2.4, l: 1.0, act: 'roll' }] },
  ] },
  { id: 'motion', name: 'Motion', kind: 'motion', steps: [
    { dur: 1.4, slots: [{ d: 9.0, l: 0, act: 'ball' }, { d: 6.8, l: 5.8, act: 'spot' }, { d: 6.8, l: -5.8, act: 'spot' }, { d: 1.6, l: 6.4, act: 'spot' }, { d: 4.8, l: -2.6, act: 'spot' }] },
    { dur: 1.4, slots: [{ d: 8.5, l: 2.0, act: 'ball' }, { d: 3.0, l: 3.5, act: 'cut' }, { d: 7.0, l: -5.6, act: 'spot' }, { d: 1.6, l: -6.4, act: 'spot' }, { d: 6.0, l: -1.8, act: 'spot' }] },
    { dur: 1.6, slots: [{ d: 9.0, l: -1.0, act: 'ball' }, { d: 1.8, l: 6.2, act: 'spot' }, { d: 4.0, l: -3.5, act: 'cut' }, { d: 6.8, l: 5.5, act: 'spot' }, { d: 3.2, l: 1.5, act: 'spot' }] },
  ] },
  { id: 'transition', name: 'Transition', kind: 'transition', steps: [
    { dur: 2.0, slots: [{ d: 8.0, l: 0, act: 'ball' }, { d: 4.0, l: 5.6, act: 'cut' }, { d: 4.0, l: -5.6, act: 'cut' }, { d: 9.0, l: 3.5, act: 'spot' }, { d: 6.5, l: -1.0, act: 'cut' }] },
  ] },
];
export const PLAY_BY_NAME = Object.fromEntries(PLAYS.map((p) => [p.name, p]));
export const DEFENSE_SCHEMES = ['Man-to-Man', 'Switch Everything', 'Drop Coverage', '2-3 Zone', 'Full-Court Press'];
