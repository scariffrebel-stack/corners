// Each group's game state lives in one JSON value in Upstash Redis (free tier, via its REST API).
// A join code maps to its group's id. With no Redis configured (local dev), it falls back to memory.
import { emptyState } from './game.js';

// The group that existed before groups did keeps its old key, so its players and tokens carry over.
export const MAIN_GROUP = 'main';
const LEGACY_KEY = 'corners:state';
const stateKey = (id) => (id === MAIN_GROUP ? LEGACY_KEY : `corners:group:${id}`);
const codeKey = (code) => `corners:code:${code}`;

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = new Map();

async function redis(command) {
  if (!url) {
    const [op, key, value, flag] = command;
    if (op === 'GET') return memory.get(key) ?? null;
    if (flag === 'NX' && memory.has(key)) return null;
    memory.set(key, value);
    return 'OK';
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`Redis error ${r.status}`);
  return (await r.json()).result;
}

export class NoGroupError extends Error {}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
// No I, L, O, 0 or 1, so a code read out across the pub can't be misheard.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomString(chars, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function normaliseCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function load(groupId = MAIN_GROUP) {
  const id = String(groupId || MAIN_GROUP);
  if (!/^[a-z0-9]{1,20}$/.test(id)) throw new NoGroupError('That group link is broken');
  const raw = await redis(['GET', stateKey(id)]);
  if (raw) {
    const state = JSON.parse(raw);
    if (!state.group) await giveGroup(state, id, 'Corners');
    return state;
  }
  if (id !== MAIN_GROUP) throw new NoGroupError('That group no longer exists');
  const state = emptyState();
  await giveGroup(state, id, 'Corners');
  return state;
}

export async function save(state) {
  await redis(['SET', stateKey(state.group.id), JSON.stringify(state)]);
}

// Gives a state its group details and a join code nobody else has, then saves it.
async function giveGroup(state, id, name) {
  for (let tries = 0; tries < 10; tries++) {
    const code = randomString(CODE_CHARS, 6);
    if ((await redis(['SET', codeKey(code), id, 'NX'])) === 'OK') {
      state.group = { id, name, code, createdAt: Date.now() };
      await save(state);
      return;
    }
  }
  throw new Error('Could not make a join code, try again');
}

export async function createGroup(state, name) {
  for (let tries = 0; tries < 10; tries++) {
    const id = randomString(ID_CHARS, 10);
    if ((await redis(['GET', stateKey(id)])) == null) {
      await giveGroup(state, id, name);
      return state;
    }
  }
  throw new Error('Could not make the group, try again');
}

export async function findGroup(code) {
  const id = await redis(['GET', codeKey(normaliseCode(code))]);
  if (!id) throw new NoGroupError('No group has that code');
  return load(id);
}
