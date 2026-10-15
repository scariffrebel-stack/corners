import { load, save } from '../lib/store.js';
import { applyFeed, holderId, pot, cornerCount } from '../lib/game.js';
import { cornersFor } from '../lib/feed.js';

// 80s keeps one ~2 hour match under API-Football's free 100 requests a day.
const POLL_MS = (Number(process.env.POLL_SECONDS) || 80) * 1000;

// Called whenever anyone has the page open: checks the feed at most once per POLL_MS.
export async function loadAndPoll(now = Date.now()) {
  const state = await load();
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

export function view(state) {
  const m = state.match;
  return {
    players: state.players,
    history: state.history,
    startTokens: state.startTokens,
    pinRequired: Boolean(process.env.GAME_PIN),
    pollSeconds: POLL_MS / 1000,
    match: m && {
      ...m,
      pot: pot(m),
      corners: cornerCount(m),
      holder: holderId(m),
    },
  };
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
