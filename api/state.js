import { loadAndPoll, view, send } from './_common.js';

export default async function handler(req, res) {
  try {
    send(res, 200, view(await loadAndPoll()));
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
