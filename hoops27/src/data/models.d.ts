// Data model reference (the runtime is plain ES modules; these interfaces document every shape).
export type Pos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type Archetype = 'sharpshooter' | 'slasher' | 'playmaker' | 'lockdown' | 'rimProtector' | 'glassCleaner' | 'postScorer' | 'twoWayWing' | 'stretchBig' | 'floorGeneral';
export type Difficulty = 'rookie' | 'pro' | 'allstar' | 'superstar' | 'hof';
export type ShotType = 'layup' | 'dunk' | 'floater' | 'midrange' | 'three' | 'fadeaway' | 'ft';
export type Grade = 'perfect' | 'excellent' | 'good' | 'early' | 'late' | 'wayoff';
export interface Attributes { inside: number; mid: number; three: number; ft: number; shotSpeed: number; ball: number; pass: number; perimD: number; interiorD: number; steal: number; block: number; reb: number; speed: number; accel: number; strength: number; vertical: number; stamina: number; iq: number }
export interface ShootingForm { id: number; name: string; releaseHeight: number; speed: number; windowBonusMs: number }
export interface Player { id: string; name: string; number: number; pos: Pos; heightM: number; weightKg: number; wingspanM: number; archetype: Archetype; attrs: Attributes; ovr: number; badges: { key: string; tier: number }[]; form: ShootingForm; teamId: string }
export interface Team { id: string; city: string; name: string; abbr: string; colors: { primary: string; secondary: string }; style: string; arenaId: string; roster: Player[]; ratings: { ovr: number; off: number; def: number; ath: number }; logoSvg: string; tendencies: Strategy }
export interface Strategy { pace: number; threeFreq: number; pressure: number; help: number }
export interface Arena { id: string; name: string; accent: string; accent2: string; floorTint: string; crowdDensity: number }
export interface Play { id: string; name: string; kind: string; steps: { dur: number; slots: ({ d: number; l: number; act: string } | null)[] }[] }
export interface PossessionState { team: 0 | 1; dir: 1 | -1; shotClock: number; backcourtClock: number; crossed: boolean; inboundClock: number; elapsed: number; playId: string | null; playStep: number }
export interface ShotEvent { t: number; shooter: string; team: 0 | 1; type: ShotType; distance: number; contest: number; offsetMs: number; grade: Grade; windowMs: number; makePct: number; made: boolean; x: number; z: number; assist?: string; blocked?: boolean; fouled?: boolean }
export interface GameState { phase: string; quarter: number; clock: number; score: [number, number]; fouls: [number, number]; timeouts: [number, number]; possession: PossessionState; shots: ShotEvent[]; flow: [number, number, number][] }
export interface MatchResult { won: boolean; score: [number, number]; opp: { tag: string; mmr: number; level: number; badge: string }; mvp: string; mmrDelta: number; mmrBefore: number; mmrAfter: number; at: number; forfeit?: boolean; rageQuit?: boolean }
export interface RankedProfile { mmr: number; tier: string; division: string | null; wins: number; losses: number; games: number; winStreak: number; bestStreak: number; history: MatchResult[]; mmrSeries: number[]; seasonId: number; seasonStart: number; seasonHigh: number; archetypeUse: Record<string, number>; points: number }
export interface Settings { audio: Record<string, number>; controls: { keys: Record<string, string>; deadzone: number; aimAssist: number; shotStickSens: number; vibration: boolean }; gameplay: Record<string, unknown>; video: Record<string, unknown>; access: Record<string, unknown> }
