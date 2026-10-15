// Setup check: is the database connected, is the API-Football key set and valid, and what
// does its plan allow? Never returns the key itself. /status doesn't count toward the daily limit.
import { send } from './_common.js';

export default async function handler(req, res) {
  const out = {
    database: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    apiKeySet: Boolean(process.env.API_FOOTBALL_KEY),
  };
  if (out.apiKeySet) {
    try {
      const r = await fetch('https://v3.football.api-sports.io/status', {
        headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY },
      });
      const body = await r.json();
      const errs = body.errors && Object.values(body.errors);
      if (errs?.length) out.apiError = errs.join(', ');
      else out.api = { plan: body.response?.subscription?.plan, requests: body.response?.requests };
    } catch (e) {
      out.apiError = e.message;
    }
  }
  send(res, 200, out);
}
