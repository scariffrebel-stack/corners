// Web Push alerts. Off unless the VAPID keys are set in the environment (see the README).
import webpush from 'web-push';
import { quietHours, recipients } from './alerts.js';

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
export const pushKey = publicKey && privateKey ? publicKey : null;
if (pushKey) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:corners@example.com', publicKey, privateKey);

// Sends each { sub, alert } in `items`. Phones that have gone away are dropped from the group.
// Returns true if any were dropped, so the caller knows to save.
export async function sendTo(state, items, now = Date.now()) {
  if (!pushKey || quietHours(now)) return false;
  let dropped = false;
  await Promise.allSettled(items.map(async ({ sub, alert }) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ ...alert, url: `/?g=${state.group.id}` }), { TTL: 60 * 60, timeout: 5000 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        delete state.subs[sub.endpoint];
        dropped = true;
      }
    }
  }));
  return dropped;
}

// Sends `alert` to every phone in the group except the players in `except`.
export function sendAlert(state, alert, except = [], now = Date.now()) {
  if (!alert) return false;
  return sendTo(state, recipients(state, except).map(({ sub }) => ({ sub, alert })), now);
}
