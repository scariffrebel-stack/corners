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
  if (id === hostId(state)) throw new GameError('You set up the group, so you stay in it');
  if (state.match?.order.includes(id)) throw new GameError('They are in the live match');
  // Their name stays known so past results still say who won.
  if (state.players[id]) (state.former ??= {})[id] = state.players[id].name;
  delete state.players[id];
  for (const [endpoint, sub] of Object.entries(state.subs || {})) if (sub.pid === id) delete state.subs[endpoint];
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

// A phone that has picked a player's name. From then on only that player sets their own stakes.
export function claim(state, id) {
  if (state.players[id]) state.players[id].phone = true;
}

// Stakes are your own business. A friend at the table without the app can have theirs typed in
// for them, but only until they pick their name on a phone of their own.
function mayStakeFor(state, id, by) {
  const p = state.players[id];
  if (!p) throw new GameError('Unknown player');
  if (id !== by && p.phone) throw new GameError(`Only ${p.name} can change ${p.name}'s stake`);
  return p;
}

// Each player sets their own stake for the next match from their own phone (see mayStakeFor).
// 0 or blank means sitting it out.
export function setStake(state, id, raw, by = id) {
  const p = mayStakeFor(state, id, by);
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
export function setGuess(state, id, rawGuess, rawStake, by = id) {
  const p = mayStakeFor(state, id, by);
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
// golden: true turns on the golden corner, a secret corner from 1 to GOLDEN_MAX picked at random.
// Whoever the flag goes to on it takes a quarter of the pot at full time; the holder gets the rest.
export const GOLDEN_MAX = 12;
export function startMatch(state, { fixtureId, label, kickoff, stakes, golden }, rng = Math.random, now = Date.now()) {
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
    ...(golden && { golden: { corner: 1 + Math.floor(rng() * GOLDEN_MAX) } }),
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

// Who the flag went to on the golden corner, once it has been taken; null before then.
// Like the holder it follows from the total, so a corner taken back un-golds it too.
export function goldenId(match) {
  const g = match.golden;
  return g && cornerCount(match) >= g.corner ? match.order[g.corner % match.order.length] : null;
}

export function goldenShare(match) {
  return match.golden ? Math.floor(pot(match) / 4) : 0;
}

export function cornerCount(match) {
  return Math.max(0, match.feedCorners + match.manualAdjust + (match.ahead || 0));
}

// The flag moves one place per corner, so the holder follows from the total.
// A corner the feed takes back therefore moves the flag back too.
export function holderId(match) {
  return match.order[cornerCount(match) % match.order.length];
}

// The match log: one line per corner with who the flag went to, so any argument is settled by the
// timeline. A corner taken back gets its own line rather than vanishing.
function logChange(m, before, { now, minute, team, byHand, by }) {
  m.log ??= [];
  const after = cornerCount(m);
  const extra = { at: now, ...(minute && { minute }), ...(byHand && { byHand: true }), ...(by && { by }) };
  for (let n = before + 1; n <= after; n++) {
    m.log.push({ n, holder: m.order[n % m.order.length], ...(after - before === 1 && team && { team }), ...extra });
  }
  if (after < before) m.log.push({ n: after, holder: holderId(m), back: before - after, ...extra });
}

// Two people in the room shouting the same corner shouldn't move the flag twice.
export const CALL_GAP_MS = 8000;

// Someone watching taps "Corner!" the moment the ball goes out, so the flag moves with the TV
// rather than with the feed, which runs a minute or more behind. A called corner sits "ahead" of
// the feed until the feed reports it, so it's never counted twice.
export function callCorner(state, id, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  if (m.lastCall && now - m.lastCall.at < CALL_GAP_MS) return;
  const before = cornerCount(m);
  m.ahead = (m.ahead || 0) + 1;
  m.lastCall = { at: now, by: state.players[id] ? id : null };
  logChange(m, before, { now, byHand: true, by: m.lastCall.by });
}

// Backup controls, for a feed that's wrong rather than slow: these corrections stay at full time.
// Taking one off undoes a called corner first, since a mis-tap is the likelier mistake.
export function manualCorner(state, delta, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  if (delta !== 1 && delta !== -1) throw new GameError('Bad adjustment');
  if (delta === -1 && cornerCount(m) === 0) return;
  const before = cornerCount(m);
  if (delta === 1) m.manualAdjust += 1;
  else if (m.ahead > 0) m.ahead -= 1;
  else m.manualAdjust -= 1;
  logChange(m, before, { now, byHand: true });
}

// teams: [{ name, corners }] from the feed, used to say whose corner it was.
export function applyFeed(state, { corners, status, minute, teams }, now = Date.now()) {
  const m = state.match;
  if (!m) return null;
  const before = cornerCount(m);
  if (Number.isInteger(corners) && corners >= 0) {
    // Corners the feed has caught up with were already called in the room: they stop being "ahead".
    const rise = corners - m.feedCorners;
    if (rise > 0 && m.ahead) m.ahead = Math.max(0, m.ahead - rise);
    m.feedCorners = corners;
  }
  if (status) m.feedStatus = status;
  // At the final whistle the feed's count is the truth: a corner called that it never saw is dropped.
  if (FINISHED.has(status)) m.ahead = 0;
  let team;
  if (teams?.length) {
    const rose = teams.filter((t) => t.corners > (m.feedTeams?.[t.name] || 0));
    if (rose.length === 1) team = rose[0].name;
    m.feedTeams = Object.fromEntries(teams.map((t) => [t.name, t.corners]));
  }
  logChange(m, before, { now, minute, team });
  if (FINISHED.has(status)) return settle(state, now);
  if (CALLED_OFF.has(status)) return abandon(state, now);
  return null;
}

// Every group needs a name, so it can be told apart in the list of groups on a phone.
export function renameGroup(state, name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new GameError('Give the group a name');
  state.group.name = name;
}

// A friendly label for what tokens stand for in this group, such as "10 tokens = 1 pint".
// It's only shown beside balances, for friends to sort out between themselves: tokens are
// never bought, sold or paid out. A blank unit clears it.
export function setLabel(state, unit, per) {
  unit = String(unit || '').trim().slice(0, 24);
  if (!unit) {
    delete state.label;
    return;
  }
  const n = Number(per);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new GameError('Say how many tokens make one, from 1 to 10,000');
  state.label = { unit, per: n };
}

// A phone asking for this group's alerts. One player can have several phones; each is keyed by its
// push endpoint, so subscribing again just refreshes it.
export function subscribe(state, id, sub, now = Date.now()) {
  if (!state.players[id]) throw new GameError('Pick your name first');
  const endpoint = String(sub?.endpoint || '');
  const { p256dh, auth } = sub?.keys || {};
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) throw new GameError('This phone can\'t take alerts');
  state.subs ??= {};
  state.subs[endpoint] = { pid: id, sub: { endpoint, keys: { p256dh: String(p256dh), auth: String(auth) } }, at: now };
}

export function unsubscribe(state, endpoint) {
  if (state.subs) delete state.subs[endpoint];
}

// The teams a player wants a morning nudge for, by the feed's team names.
export function followTeams(state, id, teams) {
  const p = state.players[id];
  if (!p) throw new GameError('Pick your name first');
  const clean = [...new Set((Array.isArray(teams) ? teams : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))];
  if (clean.length > 20) throw new GameError('Follow up to 20 teams');
  p.teams = clean;
}

export const REACTIONS = ['😱', '🍺', '🔥', '😂', '👏', '😤'];

// Quick reactions on the live screen, so it feels shared when people watch in different places.
// The person who set the group up. Groups from before hosts existed take their first player,
// who in practice is the one who started it.
export function hostId(state) {
  return state.players[state.host] ? state.host : Object.keys(state.players)[0] || null;
}

// Ending a competition or removing someone can't be undone, so only the host can.
export function checkHost(state, by) {
  const host = hostId(state);
  if (host && by !== host) throw new GameError(`Only ${state.players[host].name}, who set up the group, can do that`);
}

// A short line from someone watching, shown with the reactions.
export const SAY_MAX = 80;
export function say(state, id, raw, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  if (!state.players[id]) throw new GameError('Pick your name first');
  const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, SAY_MAX);
  if (!text) throw new GameError('Say something first');
  m.reactions ??= [];
  const last = m.reactions.findLast((r) => r.id === id);
  if (last && now - last.at < 1500) return;
  m.reactions.push({ id, text, at: now });
  m.reactions = m.reactions.slice(-40);
}

export function react(state, id, emoji, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  if (!state.players[id]) throw new GameError('Pick your name first');
  if (!REACTIONS.includes(emoji)) throw new GameError('Unknown reaction');
  m.reactions ??= [];
  const last = m.reactions.findLast((r) => r.id === id);
  if (last && now - last.at < 1500) return; // one tap at a time, so nobody floods the screen
  m.reactions.push({ id, emoji, at: now });
  m.reactions = m.reactions.slice(-40);
}

export function settle(state, now = Date.now()) {
  const m = state.match;
  if (!m) throw new GameError('No match is on');
  const winner = holderId(m);
  const total = pot(m);
  const golden = goldenId(m);
  const bonus = golden ? goldenShare(m) : 0;
  credit(state, m.compId, winner, total - bonus);
  if (golden) credit(state, m.compId, golden, bonus);
  const result = { label: m.label, winner, pot: total, corners: cornerCount(m), order: m.order, stakes: m.stakes, log: m.log || [], at: now };
  if (m.golden) result.golden = { corner: m.golden.corner, winner: golden, bonus };
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
  // Names as they were on the day, so the result reads right even after someone leaves the group.
  result.names = Object.fromEntries([...m.order, ...(result.guessWinners || [])].map((id) => [id, state.players[id]?.name]).filter(([, n]) => n));
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
  claim(state, playerId);
  state.host = playerId;
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
