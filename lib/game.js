// Pure game rules. No I/O here, so it can be tested directly.

export const START_TOKENS = 100;
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const CALLED_OFF = new Set(['ABD', 'CANC', 'PST', 'AWD', 'WO']);

export function emptyState() {
  return { startTokens: START_TOKENS, players: {}, pendingStakes: {}, pendingGuesses: {}, match: null, history: [] };
}

export class GameError extends Error {}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function addPlayer(state, name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) throw new GameError('Enter a name');
  if (Object.values(state.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError(`${name} is already playing`);
  }
  const id = newId();
  state.players[id] = { name, tokens: state.startTokens };
  return id;
}

export function removePlayer(state, id) {
  if (state.match?.order.includes(id)) throw new GameError('They are in the live match');
  delete state.players[id];
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
  const left = p.tokens - committed(state, id, 'flag');
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
  const left = p.tokens - committed(state, id, 'guess');
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
  const clean = {};
  for (const [id, raw] of Object.entries(stakes || state.pendingStakes || {})) {
    if (raw === '' || raw == null || Number(raw) === 0) continue;
    const p = state.players[id];
    if (!p) throw new GameError('Unknown player');
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new GameError(`${p.name}'s stake must be a whole number of tokens`);
    if (n > p.tokens) throw new GameError(`${p.name} only has ${p.tokens} tokens`);
    clean[id] = n;
  }
  const ids = Object.keys(clean);
  if (ids.length < 2) throw new GameError('At least two players need a stake');
  // A side pot needs two guesses to be worth playing; a lone guess is simply dropped.
  const guesses = {};
  for (const [id, g] of Object.entries(state.pendingGuesses || {})) {
    const p = state.players[id];
    if (!p) continue;
    if ((clean[id] || 0) + g.stake > p.tokens) throw new GameError(`${p.name} can't cover both stakes`);
    guesses[id] = { ...g };
  }
  const sideOn = Object.keys(guesses).length >= 2;
  for (const id of ids) state.players[id].tokens -= clean[id];
  if (sideOn) for (const [id, g] of Object.entries(guesses)) state.players[id].tokens -= g.stake;
  state.pendingStakes = {};
  state.pendingGuesses = {};
  state.match = {
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
  state.players[winner].tokens += total;
  const result = { label: m.label, winner, pot: total, corners: cornerCount(m), order: m.order, stakes: m.stakes, at: now };
  const side = sidePot(m);
  if (side) {
    // Ties split evenly; any odd tokens go one each to the tied guessers in the order they guessed.
    const winners = closestIds(m);
    const share = Math.floor(side / winners.length);
    winners.forEach((id, i) => {
      if (state.players[id]) state.players[id].tokens += share + (i < side % winners.length ? 1 : 0);
    });
    Object.assign(result, { guesses: m.guesses, sidePot: side, guessWinners: winners });
  }
  state.history.unshift(result);
  state.history = state.history.slice(0, 50);
  state.match = null;
  return result;
}

export function abandon(state, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  for (const [id, n] of Object.entries(m.stakes)) {
    if (state.players[id]) state.players[id].tokens += n;
  }
  for (const [id, g] of Object.entries(m.guesses || {})) {
    if (state.players[id]) state.players[id].tokens += g.stake;
  }
  const result = { label: m.label, abandoned: true, pot: pot(m), sidePot: sidePot(m), at: now };
  state.history.unshift(result);
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
  if (startTokens != null && startTokens !== '') state.startTokens = checkStartTokens(startTokens);
  const playerId = addPlayer(state, playerName);
  return { state, name, playerId };
}

export function newSeason(state, startTokens) {
  if (state.match) throw new GameError('Finish the live match first');
  if (startTokens != null) state.startTokens = checkStartTokens(startTokens);
  state.pendingStakes = {};
  state.pendingGuesses = {};
  for (const p of Object.values(state.players)) p.tokens = state.startTokens;
  state.history = [];
}
