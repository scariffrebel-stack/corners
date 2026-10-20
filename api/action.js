import { save } from '../lib/store.js';
import * as game from '../lib/game.js';
import { loadAndPoll, view, send, sendError, readBody } from './_common.js';

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
    const result = act(state, body);
    await save(state);
    send(res, 200, { ...view(state, body.me), result: typeof result === 'string' ? result : undefined });
  } catch (e) {
    sendError(res, e);
  }
}
