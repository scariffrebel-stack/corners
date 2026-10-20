// Who to tell what, and when. Pure, so the rules can be tested without sending anything.
import { pot } from './game.js';

const STAKE_ALERT_GAP = 2 * 60 * 60 * 1000; // at most one "get your stake in" per group every 2 hours

// The alert an action should send to the rest of the group, or null.
// `before` is how many stakes were down before the action.
export function alertAfter(state, type, { before = 0, actor, now = Date.now() } = {}) {
  const groupName = state.group?.name || 'Corners';
  const who = state.players[actor]?.name || 'Someone';
  const comp = state.competitions[state.nextComp];
  if (type === 'setStake') {
    const staked = Object.keys(state.pendingStakes || {}).length;
    if (before > 0 || staked === 0) return null;
    if (now - (state.lastStakeAlert || 0) < STAKE_ALERT_GAP) return null;
    state.lastStakeAlert = now;
    return {
      title: `${who} has put a stake down`,
      body: `Next ${groupName} match${comp ? `, playing for ${comp.name}` : ''}. Get your stake in.`,
      tag: 'stake',
    };
  }
  if (type === 'startMatch' && state.match) {
    const m = state.match;
    return {
      title: `${m.label} is on`,
      body: `${m.order.length} in, pot ${pot(m)} tokens. ${state.players[m.order[0]]?.name || 'Someone'} starts with the flag.`,
      tag: 'match',
    };
  }
  return null;
}

// Late at night nobody wants a buzz about corners.
export function quietHours(now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/London' }).format(now));
  return hour >= 23 || hour < 8;
}

// Phones subscribed to this group, other than the players in `except`.
export function recipients(state, except = []) {
  return Object.values(state.subs || {}).filter((s) => state.players[s.pid] && !except.includes(s.pid));
}
