import { load, save, NoGroupError } from '../lib/store.js';
import { GameError } from '../lib/game.js';
import { applyFeed, holderId, pot, cornerCount, sidePot, closestIds, closeFinished, standings } from '../lib/game.js';
import { cornersFor } from '../lib/feed.js';

// 80s keeps one ~2 hour match under API-Football's free 100 requests a day.
const POLL_MS = (Number(process.env.POLL_SECONDS) || 80) * 1000;

// Called whenever anyone has the page open: checks the feed at most once per POLL_MS.
export async function loadAndPoll(groupId, now = Date.now()) {
  const state = await load(groupId);
  const open = Object.values(state.competitions).filter((c) => c.status === 'open').length;
  closeFinished(state, now);
  if (Object.values(state.competitions).filter((c) => c.status === 'open').length !== open) await save(state);
  const m = state.match;
  let feedError = null;
  if (m && m.fixtureId !== 'manual' && now >= m.kickoff && now - m.lastPolled >= POLL_MS) {
    m.lastPolled = now;
    await save(state); // claim this poll so other viewers don't also call the feed
    try {
      applyFeed(state, await cornersFor(m.fixtureId, m.startedAt), now);
      if (state.match) state.match.feedError = null;
    } catch (e) {
      feedError = e.message;
      if (state.match) state.match.feedError = feedError;
    }
    await save(state);
  }
  return state;
}

// Corner guesses stay secret until the match starts: each phone sees only its own number.
function hiddenGuesses(state, me) {
  const out = {};
  for (const [id, g] of Object.entries(state.pendingGuesses || {})) {
    out[id] = id === me ? g : { stake: g.stake };
  }
  return out;
}

export function view(state, me) {
  const m = state.match;
  return {
    group: { id: state.group.id, name: state.group.name, code: state.group.code },
    players: state.players,
    pendingStakes: state.pendingStakes || {},
    pendingGuesses: hiddenGuesses(state, me),
    startTokens: state.startTokens,
    nextComp: state.nextComp,
    competitions: Object.values(state.competitions)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ balances, ...c }) => ({ ...c, table: standings(state, c.id) })),
    pinRequired: Boolean(process.env.GAME_PIN),
    pollSeconds: POLL_MS / 1000,
    match: m && {
      ...m,
      pot: pot(m),
      corners: cornerCount(m),
      holder: holderId(m),
      guesses: m.guesses || {},
      sidePot: sidePot(m),
      closest: closestIds(m),
    },
  };
}

export function sendError(res, e) {
  const status = e instanceof NoGroupError ? 404 : e instanceof GameError ? 400 : 500;
  send(res, status, { error: e.message });
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
