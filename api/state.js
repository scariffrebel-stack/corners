import { loadAndPoll, view, send, sendError } from './_common.js';

export default async function handler(req, res) {
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    send(res, 200, view(await loadAndPoll(q.get('g')), q.get('me')));
  } catch (e) {
    sendError(res, e);
  }
}
