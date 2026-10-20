import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../lib/game.js';
import { alertAfter, quietHours, recipients, snapshot, matchAlerts } from '../lib/alerts.js';

const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'k', auth: 'a' } });

function group() {
  const s = g.emptyState();
  s.group = { id: 'abc', name: 'Sunday League', code: 'XYZXYZ' };
  const ids = ['Ann', 'Ben', 'Cal'].map((n) => g.addPlayer(s, n));
  return { s, ids };
}

test('the first stake down tells the group, but not again for two hours', () => {
  const { s, ids } = group();
  const t = Date.parse('2026-10-24T12:00:00Z');
  g.setStake(s, ids[0], 5);
  const a = alertAfter(s, 'setStake', { before: 0, actor: ids[0], now: t });
  assert.equal(a.title, 'Ann has put a stake down');
  assert.match(a.body, /Next Sunday League match, playing for Season/);
  g.setStake(s, ids[1], 5);
  assert.equal(alertAfter(s, 'setStake', { before: 1, actor: ids[1], now: t }), null); // not the first
  s.pendingStakes = {};
  g.setStake(s, ids[2], 5);
  assert.equal(alertAfter(s, 'setStake', { before: 0, actor: ids[2], now: t + 60 * 60 * 1000 }), null); // too soon
  assert.ok(alertAfter(s, 'setStake', { before: 0, actor: ids[2], now: t + 3 * 60 * 60 * 1000 }));
});

test('withdrawing a stake or other actions send nothing; kick-off does', () => {
  const { s, ids } = group();
  assert.equal(alertAfter(s, 'setStake', { before: 0, actor: ids[0] }), null); // nothing staked
  assert.equal(alertAfter(s, 'addPlayer', { actor: ids[0] }), null);
  g.startMatch(s, { fixtureId: '1', label: 'Arsenal v Spurs', stakes: { [ids[0]]: 5, [ids[1]]: 5 } });
  const a = alertAfter(s, 'startMatch', { actor: ids[0] });
  assert.equal(a.title, 'Arsenal v Spurs is on');
  assert.match(a.body, /^2 in, pot 10 tokens\. (Ann|Ben) starts with the flag\.$/);
});

test('phones subscribe per player; the sender and removed players are left out', () => {
  const { s, ids } = group();
  g.subscribe(s, ids[0], sub(1));
  g.subscribe(s, ids[1], sub(2));
  g.subscribe(s, ids[1], sub(3)); // Ben's second phone
  g.subscribe(s, ids[1], sub(3)); // again: still one entry
  assert.equal(Object.keys(s.subs).length, 3);
  assert.deepEqual(recipients(s, [ids[0]]).map((r) => r.sub.endpoint), [sub(2).endpoint, sub(3).endpoint]);
  g.removePlayer(s, ids[1]);
  assert.equal(recipients(s).length, 1);
  g.unsubscribe(s, sub(1).endpoint);
  assert.equal(recipients(s).length, 0);
  assert.throws(() => g.subscribe(s, ids[0], { endpoint: 'http://insecure', keys: { p256dh: 'k', auth: 'a' } }), /can't take alerts/);
  assert.throws(() => g.subscribe(s, 'nobody', sub(4)), /Pick your name/);
});

test('quiet hours run 11pm to 8am London time', () => {
  assert.equal(quietHours(Date.parse('2026-10-24T21:59:00Z')), false); // 10:59pm BST
  assert.equal(quietHours(Date.parse('2026-10-24T22:00:00Z')), true); // 11pm BST
  assert.equal(quietHours(Date.parse('2026-12-24T07:30:00Z')), true); // 7:30am GMT
  assert.equal(quietHours(Date.parse('2026-12-24T08:00:00Z')), false);
});

test('players can follow teams, tidied and capped', () => {
  const { s, ids } = group();
  g.followTeams(s, ids[0], [' Arsenal ', 'Arsenal', '', 'Chelsea']);
  assert.deepEqual(s.players[ids[0]].teams, ['Arsenal', 'Chelsea']);
  assert.throws(() => g.followTeams(s, ids[0], Array.from({ length: 21 }, (_, i) => `T${i}`)), /up to 20/);
});

test('the morning reminder names your teams playing today, and tournament match days', async () => {
  const { morningAlerts } = await import('../lib/morning.js');
  const { s, ids } = group();
  g.subscribe(s, ids[0], sub(1));
  g.subscribe(s, ids[1], sub(2));
  g.subscribe(s, ids[2], sub(3));
  g.followTeams(s, ids[0], ['Arsenal']);
  g.followTeams(s, ids[1], ['Arsenal', 'Chelsea']);
  const fixtures = [
    { label: 'Arsenal v Spurs', home: 'Arsenal', away: 'Spurs', kickoff: '2026-10-24T14:00:00Z' },
    { label: 'Fulham v Chelsea', home: 'Fulham', away: 'Chelsea', kickoff: '2026-10-24T16:30:00Z' },
  ];
  let out = morningAlerts(s, fixtures, '2026-10-24');
  assert.equal(out.length, 2); // Cal follows nobody and there's no tournament
  assert.deepEqual(out[0].alert, { title: 'Arsenal v Spurs today', body: 'Kick-off 15:00. Set it up in Sunday League.', tag: 'morning' });
  assert.equal(out[1].alert.title, '2 of your teams play today');
  assert.equal(out[1].alert.body, 'Arsenal v Spurs at 15:00, Fulham v Chelsea at 17:30. Set it up in Sunday League.');

  g.createCompetition(s, { kind: 'tournament', name: 'Derby weekend', from: '2026-10-24', to: '2026-10-25' });
  out = morningAlerts(s, [], '2026-10-24');
  assert.equal(out.length, 3);
  assert.equal(out[2].alert.title, 'Derby weekend: match day');
  assert.equal(morningAlerts(s, [], '2026-10-26').length, 0);
});

const noShuffle = () => 0.999999;
const to = (items) => items.map((i) => [i.sub.endpoint.slice(-1), i.alert.title]);

test('the flag landing on you buzzes your phone only, and not when it comes back on an undo', () => {
  const { s, ids } = group();
  ids.forEach((id, i) => g.subscribe(s, id, sub(i + 1)));
  g.startMatch(s, { fixtureId: '1', label: 'Arsenal v Spurs', stakes: { [ids[0]]: 5, [ids[1]]: 5 } }, noShuffle, 0);
  assert.deepEqual(matchAlerts(s, null), []);
  let was = snapshot(s);
  g.applyFeed(s, { corners: 1, status: '1H' }, 1000);
  const items = matchAlerts(s, was);
  assert.deepEqual(to(items), [['2', "You've got the flag!"]]);
  assert.equal(items[0].alert.body, 'Corner 1 in Arsenal v Spurs. Hold it to full time to win 10 tokens.');
  was = snapshot(s);
  g.callCorner(s, ids[0], 2000);
  assert.deepEqual(matchAlerts(s, was, [ids[0]]), []); // Ann called it herself, so she knows
  was = snapshot(s);
  g.manualCorner(s, -1, 3000);
  assert.deepEqual(matchAlerts(s, was), []); // an undo isn't news
});

test('full time tells everyone who won, in their own words; a called-off match says stakes are back', () => {
  const { s, ids } = group();
  ids.forEach((id, i) => g.subscribe(s, id, sub(i + 1)));
  g.startMatch(s, { fixtureId: '1', label: 'Arsenal v Spurs', stakes: { [ids[0]]: 5, [ids[1]]: 5 } }, noShuffle, 0);
  let was = snapshot(s);
  g.applyFeed(s, { corners: 3, status: 'FT' }, 1000);
  const items = matchAlerts(s, was, [ids[2]]);
  assert.deepEqual(to(items), [['1', 'Full time: Ben wins 10 tokens'], ['2', 'Full time: you win 10 tokens!']]);
  assert.equal(items[1].alert.body, 'Arsenal v Spurs, 3 corners. You held the flag at the whistle.');
  g.startMatch(s, { fixtureId: '2', label: 'Leeds v Hull', stakes: { [ids[0]]: 1, [ids[1]]: 1 } }, noShuffle, 2000);
  was = snapshot(s);
  g.abandon(s, 3000);
  assert.deepEqual(to(matchAlerts(s, was)), [['1', 'Leeds v Hull is off'], ['2', 'Leeds v Hull is off'], ['3', 'Leeds v Hull is off']]);
});
