// Event-driven commentary: templates -> text ticker, optional TTS. Never invents numbers: every figure comes from game state.
const pick = (a) => a[(Math.random() * a.length) | 0];
const last = (n) => n.split(' ').pop();
export class Commentary {
  constructor(bus, game, push) {
    this.g = game; this.push = push; this.cool = 0; this.offs = [];
    const say = (t, prio = 1) => { if (this.cool > 0 && prio < 2) return; this.cool = 2.2; push(t); };
    const on = (e, f) => this.offs.push(bus.on(e, f));
    on('gameStart', () => say('Welcome to the Neon Era — tip-off in a moment.', 2));
    on('tipResult', ({ team }) => say(`${game.teams[team].data.city} win the tip.`, 2));
    on('score', ({ player, pts, ev }) => {
      const tm = game.teams[player.team].data;
      if (ev.type === 'dunk') say(pick([`${last(player.name)} throws it down!`, `Thunderous dunk from ${last(player.name)}!`, `${last(player.name)} with the hammer!`]), 2);
      else if (pts === 3) say(pick([`${last(player.name)} from deep… good!`, `Three for ${last(player.name)}, ${tm.abbr} get a lift.`, `Splash from downtown by ${last(player.name)}.`]), 2);
      else if (ev.type === 'ft') say(`${last(player.name)} hits the free throw.`);
      else say(pick([`${last(player.name)} scores.`, `Bucket for ${last(player.name)}.`, `${last(player.name)} finishes it.`]));
      if (ev.assist) this.push(`Assist: ${last(ev.assist.name)}.`);
    });
    on('heatingUp', ({ player, tier }) => say(tier >= 3 ? `${last(player.name)} is ON FIRE!` : `${last(player.name)} is heating up.`, 2));
    on('block', ({ by }) => say(pick([`Rejected by ${last(by.name)}!`, `${last(by.name)} swats it away!`]), 2));
    on('steal', ({ by }) => say(`${last(by.name)} takes it away.`));
    on('foul', ({ by, kind }) => say(kind === 'flagrant' ? `Flagrant foul on ${last(by.name)}.` : `Whistle — foul on ${last(by.name)}${by.fouls >= 5 ? `, his ${by.fouls}th` : ''}.`, 2));
    on('timeout', ({ team }) => say(`${game.teams[team].data.city} call a timeout.`, 2));
    on('quarterEnd', ({ quarter }) => say(`End of the ${['first', 'second', 'third', 'fourth'][quarter - 1] ?? 'extra'} period: ${game.score[0]}–${game.score[1]}.`, 2));
    on('violation', ({ kind }) => say(`Violation: ${kind}.`, 2));
    on('rebound', ({ player, offensive }) => offensive && say(`${last(player.name)} grabs the offensive board.`));
    on('buzzer', ({ player }) => say(`BUZZER BEATER by ${last(player.name)}!`, 2));
    on('ankleBreaker', ({ player }) => say(`${last(player.name)} breaks the defender's ankles!`, 2));
    this.clutch = false;
  }
  update(dt) {
    this.cool -= dt; const c = this.g.isClutch?.();
    if (c && !this.clutch) { this.clutch = true; this.push(`Clutch time: ${this.g.score[0]}–${this.g.score[1]} with ${Math.ceil(this.g.clock / 60)} minutes to go.`); } else if (!c) this.clutch = false;
  }
  dispose() { this.offs.forEach((f) => f()); }
}
