import { save } from '../lib/store.js';
import * as game from '../lib/game.js';
import { loadAndPoll, view, send, sendError, readBody } from './_common.js';
import { alertAfter } from '../lib/alerts.js';
import { sendAlert } from '../lib/push.js';

const ACTIONS = {
  addPlayer: (s, b) => game.addPlayer(s, b.name),
  removePlayer: (s, b) => game.removePlayer(s, b.id),
  startMatch: (s, b) => game.startMatch(s, b),
  corner: (s, b) => game.manualCorner(s, b.delta),
  settle: (s) => game.settle(s),
  abandon: (s) => game.abandon(s),
  newSeason: (s, b) => game.newSeason(s, b.startTokens),
  createCompetition: (s, b) => game.createCompetition(s, b),
  setNextComp: (s, b) => game.setNextComp(s, b.id),
  endCompetition: (s, b) => game.endCompetition(s, b.id),
  setStake: (s, b) => game.setStake(s, b.id, b.stake),
  setGuess: (s, b) => game.setGuess(s, b.id, b.guess, b.stake),
  react: (s, b) => game.react(s, b.id, b.emoji),
  setLabel: (s, b) => game.setLabel(s, b.unit, b.per),
  subscribe: (s, b) => game.subscribe(s, b.id, b.sub),
  unsubscribe: (s, b) => game.unsubscribe(s, b.endpoint),
  followTeams: (s, b) => game.followTeams(s, b.id, b.teams),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const body = await readBody(req);
    if (process.env.GAME_PIN && body.pin !== process.env.GAME_PIN) {
      return send(res, 403, { error: 'Wrong PIN' });
    }
    const act = ACTIONS[body.type];
    if (!act) return send(res, 400, { error: 'Unknown action' });
    const state = await loadAndPoll(body.g);
    const before = Object.keys(state.pendingStakes || {}).length;
    const result = act(state, body);
    const alert = alertAfter(state, body.type, { before, actor: body.me });
    await save(state);
    if (await sendAlert(state, alert, [body.me])) await save(state);
    send(res, 200, { ...view(state, body.me), result: typeof result === 'string' ? result : undefined });
  } catch (e) {
    sendError(res, e);
  }
}
