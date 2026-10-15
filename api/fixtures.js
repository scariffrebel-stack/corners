import { fixturesOn } from '../lib/feed.js';
import { send } from './_common.js';

export default async function handler(req, res) {
  const date = new URL(req.url, 'http://x').searchParams.get('date') || new Date().toISOString().slice(0, 10);
  try {
    send(res, 200, { fixtures: await fixturesOn(date) });
  } catch (e) {
    send(res, 200, { error: e.message, fixtures: [] });
  }
}
