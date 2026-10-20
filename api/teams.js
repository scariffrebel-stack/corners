// The league's teams, for picking which ones you follow. Cached for a week.
import { cached } from '../lib/store.js';
import { teamsIn } from '../lib/feed.js';
import { send } from './_common.js';

export default async function handler(req, res) {
  try {
    send(res, 200, { teams: await cached('teams', 7 * 24 * 60 * 60, () => teamsIn()) });
  } catch (e) {
    send(res, 200, { error: e.message, teams: [] });
  }
}
