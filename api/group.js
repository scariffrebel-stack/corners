// Setting up a new group, and finding one from its join code.
import { createGroup, findGroup } from '../lib/store.js';
import { newGroup } from '../lib/game.js';
import { view, send, sendError, readBody } from './_common.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const body = await readBody(req);
    if (process.env.GAME_PIN && body.pin !== process.env.GAME_PIN) {
      return send(res, 403, { error: 'Wrong PIN' });
    }
    if (body.type === 'create') {
      const { state, name, playerId } = newGroup(body.name, body.startTokens, body.player);
      await createGroup(state, name);
      return send(res, 200, { ...view(state, playerId), result: playerId });
    }
    if (body.type === 'join') return send(res, 200, view(await findGroup(body.code)));
    send(res, 400, { error: 'Unknown action' });
  } catch (e) {
    sendError(res, e);
  }
}
