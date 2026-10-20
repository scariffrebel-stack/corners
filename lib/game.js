// Pure game rules. No I/O here, so it can be tested directly.

export const START_TOKENS = 100;
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const CALLED_OFF = new Set(['ABD', 'CANC', 'PST', 'AWD', 'WO']);

export const KINDS = { season: 'Season', tournament: 'Tournament', match: 'One-off match' };

// A group plays in competitions: seasons, tournaments and one-off matches. Each competition has its
// own token balances, so a weekend tournament never touches the season. `nextComp` is the one the
// next match will be played for.
export function emptyState(now = Date.now()) {
  const state = { startTokens: START_TOKENS, players: {}, competitions: {}, nextComp: null, pendingStakes: {}, pendingGuesses: {}, match: null };
  createCompetition(state, { kind: 'season' }, now);
  return state;
}

// Groups from before competitions kept tokens on each player and one list of results.
// Those become the group's first season, with every balance and result kept.
export function migrate(state, now = Date.now()) {
  if (state.competitions) return state;
  const id = newId();
  const balances = {};
  for (const [pid, p] of Object.entries(state.players || {})) {
    balances[pid] = p.tokens ?? state.startTokens;
    delete p.tokens;
  }
  state.competitions = {
    [id]: { id, kind: 'season', name: 'Season', startTokens: state.startTokens ?? START_TOKENS, status: 'open', createdAt: now, balances, history: state.history || [] },
  };
  state.nextComp = id;
  state.startTokens ??= START_TOKENS;
  if (state.match) state.match.compId = id;
  delete state.history;
  return state;
}

export class GameError extends Error {}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function comp(state, cid = state.nextComp) {
  const c = state.competitions[cid];
  if (!c) throw new GameError('Pick a competition first');
  return c;
}

// New players join every competition on its starting tokens.
export function balance(state, pid, cid = state.nextComp) {
  const c = state.competitions[cid];
  if (!c || !state.players[pid]) return 0;
  return c.balances[pid] ?? c.startTokens;
}

function credit(state, cid, pid, n) {
  if (!state.players[pid]) return;
  state.competitions[cid].balances[pid] = balance(state, pid, cid) + n;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createCompetition(state, { kind, name, startTokens, from, to }, now = Date.now()) {
  if (!KINDS[kind]) throw new GameError('Pick a season, tournament or one-off match');
  name = String(name || '').trim().slice(0, 40) || KINDS[kind];
  const c = { id: newId(), kind, name, startTokens: state.startTokens, status: 'open', createdAt: now, balances: {}, history: [] };
  if (startTokens != null && startTokens !== '') c.startTokens = checkStartTokens(startTokens);
  if (kind === 'tournament') {
    if (!DATE.test(from || '') || !DATE.test(to || '')) throw new GameError('Pick the first and last day of the tournament');
    if (to < from) throw new GameError('The tournament ends before it starts');
    Object.assign(c, { from, to });
  }
  state.competitions[c.id] = c;
  state.nextComp = c.id;
  state.pendingStakes = {};
  state.pendingGuesses = {};
  return c.id;
}

export function setNextComp(state, cid) {
  if (comp(state, cid).status !== 'open') throw new GameError('That competition has finished');
  if (state.nextComp === cid) return;
  state.nextComp = cid;
  state.pendingStakes = {};
  state.pendingGuesses = {};
}

// Players by balance in a competition, highest first.
export function standings(state, cid) {
  const c = state.competitions[cid];
  const ids = Object.keys(state.players).filter((pid) => c.status === 'open' || pid in c.balances);
  return ids
    .map((pid) => ({ id: pid, tokens: balance(state, pid, cid) }))
    .sort((a, b) => b.tokens - a.tokens);
}

export function endCompetition(state, cid, now = Date.now()) {
  const c = comp(state, cid);
  if (c.status !== 'open') throw new GameError('That competition has already finished');
  if (state.match?.compId === cid) throw new GameError('Finish the live match first');
  // Freeze everyone's final balance, so players who join later don't appear in its table.
  for (const pid of Object.keys(state.players)) c.balances[pid] = balance(state, pid, cid);
  const table = standings(state, cid);
  const played = c.history.some((h) => !h.abandoned);
  c.winners = played && table.length ? table.filter((r) => r.tokens === table[0].tokens).map((r) => r.id) : [];
  c.status = 'finished';
  c.endedAt = now;
  if (state.nextComp === cid) {
    const open = Object.values(state.competitions).filter((x) => x.status === 'open').sort((a, b) => b.createdAt - a.createdAt);
    state.nextComp = open[0]?.id || null;
    state.pendingStakes = {};
    state.pendingGuesses = {};
  }
}

// Tournaments finish by themselves once their last day is over and nothing in them is live.
export function closeFinished(state, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  for (const c of Object.values(state.competitions)) {
    if (c.kind === 'tournament' && c.status === 'open' && c.to < today && state.match?.compId !== c.id) endCompetition(state, c.id, now);
  }
}

export function addPlayer(state, name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) throw new GameError('Enter a name');
  if (Object.values(state.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError(`${name} is already playing`);
  }
  const id = newId();
  state.players[id] = { name };
  return id;
}

export function removePlayer(state, id) {
  if (state.match?.order.includes(id)) throw new GameError('They are in the live match');
  delete state.players[id];
  for (const c of Object.values(state.competitions)) if (c.status === 'open') delete c.balances[id];
  if (state.pendingStakes) delete state.pendingStakes[id];
  if (state.pendingGuesses) delete state.pendingGuesses[id];
}

// Tokens a player has already put down for the next match, other than `except`.
function committed(state, id, except) {
  const flag = except === 'flag' ? 0 : state.pendingStakes?.[id] || 0;
  const side = except === 'guess' ? 0 : state.pendingGuesses?.[id]?.stake || 0;
  return flag + side;
}

// Each player sets their own stake for the next match, usually from their own phone.
// 0 or blank means sitting it out.
export function setStake(state, id, raw) {
  const p = state.players[id];
  if (!p) throw new GameError('Unknown player');
  if (state.match) throw new GameError('Wait for the live match to finish');
  state.pendingStakes ??= {};
  if (raw === '' || raw == null || Number(raw) === 0) {
    delete state.pendingStakes[id];
    return;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new GameError('Stakes are whole tokens');
  if (!state.nextComp) throw new GameError('Pick a competition first');
  const left = balance(state, id) - committed(state, id, 'flag');
  if (n > left) throw new GameError(`${p.name} only has ${left} tokens left`);
  state.pendingStakes[id] = n;
}

// The side pot: each player can guess the match's total corners and stake tokens on it.
// Closest guess takes the side pot, ties split it. Blank guess or stake withdraws.
export function setGuess(state, id, rawGuess, rawStake) {
  const p = state.players[id];
  if (!p) throw new GameError('Unknown player');
  if (state.match) throw new GameError('Guesses are locked once the match starts');
  state.pendingGuesses ??= {};
  const blank = (v) => v === '' || v == null;
  if (blank(rawGuess) || blank(rawStake) || Number(rawStake) === 0) {
    delete state.pendingGuesses[id];
    return;
  }
  const guess = Number(rawGuess);
  if (!Number.isInteger(guess) || guess < 0 || guess > 99) throw new GameError('Guess a whole number of corners from 0 to 99');
  const stake = Number(rawStake);
  if (!Number.isInteger(stake) || stake < 1) throw new GameError('Stakes are whole tokens');
  if (!state.nextComp) throw new GameError('Pick a competition first');
  const left = balance(state, id) - committed(state, id, 'guess');
  if (stake > left) throw new GameError(`${p.name} only has ${left} tokens left`);
  state.pendingGuesses[id] = { guess, stake };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// stakes: { playerId: tokens }. Players with no stake sit the match out.
// The shuffled order's first player starts with the flag.
export function startMatch(state, { fixtureId, label, kickoff, stakes }, rng = Math.random, now = Date.now()) {
  if (state.match) throw new GameError('A match is already on');
  if (!fixtureId) throw new GameError('Pick a match');
  const c = comp(state);
  if (c.status !== 'open') throw new GameError('That competition has finished');
  if (c.kind === 'tournament' && fixtureId !== 'manual' && kickoff) {
    const day = new Date(Date.parse(kickoff) || now).toISOString().slice(0, 10);
    if (day < c.from || day > c.to) throw new GameError(`${c.name} runs from ${c.from} to ${c.to}`);
  }
  const clean = {};
  for (const [id, raw] of Object.entries(stakes || state.pendingStakes || {})) {
    if (raw === '' || raw == null || Number(raw) === 0) continue;
    const p = state.players[id];
    if (!p) throw new GameError('Unknown player');
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new GameError(`${p.name}'s stake must be a whole number of tokens`);
    if (n > balance(state, id)) throw new GameError(`${p.name} only has ${balance(state, id)} tokens`);
    clean[id] = n;
  }
  const ids = Object.keys(clean);
  if (ids.length < 2) throw new GameError('At least two players need a stake');
  // A side pot needs two guesses to be worth playing; a lone guess is simply dropped.
  const guesses = {};
  for (const [id, g] of Object.entries(state.pendingGuesses || {})) {
    const p = state.players[id];
    if (!p) continue;
    if ((clean[id] || 0) + g.stake > balance(state, id)) throw new GameError(`${p.name} can't cover both stakes`);
    guesses[id] = { ...g };
  }
  const sideOn = Object.keys(guesses).length >= 2;
  for (const id of ids) credit(state, c.id, id, -clean[id]);
  if (sideOn) for (const [id, g] of Object.entries(guesses)) credit(state, c.id, id, -g.stake);
  state.pendingStakes = {};
  state.pendingGuesses = {};
  state.match = {
    compId: c.id,
    fixtureId: String(fixtureId),
    label: String(label || `Match ${fixtureId}`),
    kickoff: kickoff ? Date.parse(kickoff) || now : now,
    order: shuffle(ids, rng),
    stakes: clean,
    guesses: sideOn ? guesses : {},
    feedCorners: 0,
    manualAdjust: 0,
    feedStatus: 'NS',
    startedAt: now,
    lastPolled: 0,
  };
  return state.match;
}

export function pot(match) {
  return Object.values(match.stakes).reduce((a, b) => a + b, 0);
}

export function sidePot(match) {
  return Object.values(match.guesses || {}).reduce((a, g) => a + g.stake, 0);
}

// Closest guesses to the current total. Everyone in the list shares the side pot.
export function closestIds(match) {
  const entries = Object.entries(match.guesses || {});
  if (!entries.length) return [];
  const total = cornerCount(match);
  const best = Math.min(...entries.map(([, g]) => Math.abs(g.guess - total)));
  return entries.filter(([, g]) => Math.abs(g.guess - total) === best).map(([id]) => id);
}

export function cornerCount(match) {
  return Math.max(0, match.feedCorners + match.manualAdjust);
}

// The flag moves one place per corner, so the holder follows from the total.
// A corner the feed takes back therefore moves the flag back too.
export function holderId(match) {
  return match.order[cornerCount(match) % match.order.length];
}

export function manualCorner(state, delta) {
  if (!state.match) throw new GameError('No match is on');
  if (delta !== 1 && delta !== -1) throw new GameError('Bad adjustment');
  if (delta === -1 && cornerCount(state.match) === 0) return;
  state.match.manualAdjust += delta;
}

export function applyFeed(state, { corners, status }, now = Date.now()) {
  const m = state.match;
  if (!m) return null;
  if (Number.isInteger(corners) && corners >= 0) m.feedCorners = corners;
  if (status) m.feedStatus = status;
  if (FINISHED.has(status)) return settle(state, now);
  if (CALLED_OFF.has(status)) return abandon(state, now);
  return null;
}

export function settle(state, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  const winner = holderId(m);
  const total = pot(m);
  credit(state, m.compId, winner, total);
  const result = { label: m.label, winner, pot: total, corners: cornerCount(m), order: m.order, stakes: m.stakes, at: now };
  const side = sidePot(m);
  if (side) {
    // Ties split evenly; any odd tokens go one each to the tied guessers in the order they guessed.
    const winners = closestIds(m);
    const share = Math.floor(side / winners.length);
    winners.forEach((id, i) => {
      credit(state, m.compId, id, share + (i < side % winners.length ? 1 : 0));
    });
    Object.assign(result, { guesses: m.guesses, sidePot: side, guessWinners: winners });
  }
  const c = state.competitions[m.compId];
  c.history.unshift(result);
  state.match = null;
  if (c.kind === 'match') endCompetition(state, c.id, now); // a one-off is over at full time
  return result;
}

export function abandon(state, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  for (const [id, n] of Object.entries(m.stakes)) {
    credit(state, m.compId, id, n);
  }
  for (const [id, g] of Object.entries(m.guesses || {})) {
    credit(state, m.compId, id, g.stake);
  }
  const result = { label: m.label, abandoned: true, pot: pot(m), sidePot: sidePot(m), at: now };
  state.competitions[m.compId].history.unshift(result);
  state.match = null;
  return result;
}

function checkStartTokens(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 1000000) throw new GameError('Starting tokens must be a whole number from 1 to 1,000,000');
  return n;
}

// A new group's state, with whoever set it up as its first player. The store gives it an id and join code.
export function newGroup(name, startTokens, playerName) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new GameError('Give the group a name');
  const state = emptyState();
  if (startTokens != null && startTokens !== '') {
    state.startTokens = checkStartTokens(startTokens);
    state.competitions[state.nextComp].startTokens = state.startTokens;
  }
  const playerId = addPlayer(state, playerName);
  return { state, name, playerId };
}

// Ends any season still open and starts the next one, with everyone back on the starting tokens.
export function newSeason(state, startTokens, now = Date.now()) {
  if (state.match && state.competitions[state.match.compId]?.kind === 'season') throw new GameError('Finish the live match first');
  if (startTokens != null) state.startTokens = checkStartTokens(startTokens);
  const seasons = Object.values(state.competitions).filter((c) => c.kind === 'season');
  for (const c of seasons) if (c.status === 'open') endCompetition(state, c.id, now);
  return createCompetition(state, { kind: 'season', name: `Season ${seasons.length + 1}` }, now);
}
