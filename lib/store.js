// Game state lives in one JSON value in Upstash Redis (free tier, via its REST API).
// With no Redis configured (local dev), it falls back to memory.
import { emptyState } from './game.js';

const KEY = 'corners:state';
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
let memory = null;

async function redis(command) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`Redis error ${r.status}`);
  return (await r.json()).result;
}

export async function load() {
  if (!url) return memory ? structuredClone(memory) : emptyState();
  const raw = await redis(['GET', KEY]);
  return raw ? JSON.parse(raw) : emptyState();
}

export async function save(state) {
  if (!url) {
    memory = structuredClone(state);
    return;
  }
  await redis(['SET', KEY, JSON.stringify(state)]);
}
