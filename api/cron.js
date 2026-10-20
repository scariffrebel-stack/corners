// Runs once a morning (see vercel.json): reminds players of today's matches for the teams they
// follow, and of tournament match days. Vercel signs the call with CRON_SECRET when it's set.
import { allGroupIds, load, save, cached } from '../lib/store.js';
import { fixturesOn } from '../lib/feed.js';
import { morningAlerts } from '../lib/morning.js';
import { sendTo, pushKey } from '../lib/push.js';
import { send } from './_common.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return send(res, 401, { error: 'Not allowed' });
  if (!pushKey) return send(res, 200, { skipped: 'Alerts are not set up' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  let fixtures = [];
  try {
    fixtures = await cached(`fixtures:${today}`, 6 * 60 * 60, () => fixturesOn(today));
  } catch (e) {
    console.error('Could not load fixtures for the morning reminder:', e.message);
  }
  let sent = 0;
  for (const id of await allGroupIds()) {
    try {
      const state = await load(id);
      const items = morningAlerts(state, fixtures, today);
      sent += items.length;
      if (await sendTo(state, items)) await save(state);
    } catch (e) {
      console.error(`Morning reminder failed for group ${id}:`, e.message);
    }
  }
  send(res, 200, { date: today, fixtures: fixtures.length, sent });
}
