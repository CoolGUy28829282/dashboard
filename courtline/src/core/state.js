// Central game-state manager: one place that owns the league, active save slot and news feed.
import { Emitter } from './util.js';
import { leagueFacts } from '../league/news.js';

export class GameState extends Emitter {
  constructor() {
    super();
    this.mode = 'boot'; // boot | menu | (later phases: match, gym, career, franchise...)
    this.league = null;
    this.slot = null;
    this.news = []; // saved with the league: [{t, text}]
    this.facts = []; // derived from league data, not saved
    this.dirty = false;
  }
  setMode(m) { this.mode = m; this.emit('mode', m); }
  setLeague(league, news) {
    this.league = league;
    this.news = news || [];
    this.facts = leagueFacts(league);
    this.dirty = true;
    this.emit('league', league);
    this.emit('news');
  }
  postNews(text) {
    this.news.unshift({ t: Date.now(), text });
    if (this.news.length > 30) this.news.length = 30;
    this.dirty = true;
    this.emit('news');
  }
  tickerItems() {
    const out = [];
    for (const n of this.news) out.push(n.text);
    for (const f of this.facts) out.push(f);
    return out;
  }
  snapshot() { return { version: 1, league: this.league, news: this.news }; }
  meta(name) {
    const l = this.league;
    return { name: name || l.name, savedAt: Date.now(), season: l.season.label, seed: l.seed, teams: l.teams.length, players: l.players.length };
  }
}
