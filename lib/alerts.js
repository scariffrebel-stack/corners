// Who to tell what, and when. Pure, so the rules can be tested without sending anything.
import { pot, holderId, cornerCount } from './game.js';

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

// What a match looked like before a change, so matchAlerts can tell what the change did.
export function snapshot(state) {
  const m = state.match;
  return m && { startedAt: m.startedAt, compId: m.compId, label: m.label, holder: holderId(m), corners: cornerCount(m) };
}

// Alerts for the moments that matter to someone not looking at the app: the flag landing on them,
// and the final whistle. Returns [{ sub, alert }], each phone getting its own wording.
// Players in `except` are the ones who caused the change, so they already know.
export function matchAlerts(state, was, except = []) {
  if (!was) return [];
  const name = (id) => state.players[id]?.name || 'Someone';
  const m = state.match;
  if (m && m.startedAt === was.startedAt) {
    const holder = holderId(m);
    const n = cornerCount(m);
    // Only a corner moves the flag on to you: one taken back hands it to someone who just had it.
    if (holder === was.holder || n <= was.corners || except.includes(holder)) return [];
    return recipients(state).filter((s) => s.pid === holder).map(({ sub }) => ({
      sub,
      alert: { title: "You've got the flag!", body: `Corner ${n} in ${m.label}. Hold it to full time to win ${pot(m)} tokens.`, tag: 'flag' },
    }));
  }
  const r = state.competitions[was.compId]?.history[0];
  if (!r || r.label !== was.label) return [];
  return recipients(state, except).map(({ sub, pid }) => ({
    sub,
    alert: r.abandoned
      ? { title: `${r.label} is off`, body: 'The match was called off, so everyone has their stake back.', tag: 'match' }
      : {
        title: pid === r.winner ? `Full time: you win ${r.pot} tokens!` : `Full time: ${name(r.winner)} wins ${r.pot} tokens`,
        body: `${r.label}, ${r.corners} corner${r.corners === 1 ? '' : 's'}.${pid === r.winner ? ' You held the flag at the whistle.' : ''}`,
        tag: 'match',
      },
  }));
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
