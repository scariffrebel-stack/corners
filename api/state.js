import { loadAndPoll, view, send } from './_common.js';

export default async function handler(req, res) {
  try {
    const me = new URL(req.url, 'http://x').searchParams.get('me');
    send(res, 200, view(await loadAndPoll(), me));
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
