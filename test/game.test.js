import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../lib/game.js';

function setup(names = ['Ann', 'Ben', 'Cal']) {
  const s = g.emptyState();
  const ids = names.map((n) => g.addPlayer(s, n));
  return { s, ids };
}
const noShuffle = () => 0.999999; // keeps the order as given

test('badge passes on each corner and the holder at full time takes the pot', () => {
  const { s, ids } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 10, [ids[1]]: 5, [ids[2]]: 1 } }, noShuffle);
  assert.deepEqual(s.match.order, ids);
  assert.equal(s.players[ids[0]].tokens, 90);
  g.applyFeed(s, { corners: 4, status: '2H' });
  assert.equal(g.holderId(s.match), ids[1]); // 4 % 3 = 1
  const r = g.applyFeed(s, { corners: 5, status: 'FT' });
  assert.equal(r.winner, ids[2]);
  assert.equal(s.players[ids[2]].tokens, 99 + 16);
  assert.equal(s.match, null);
});

test('no corners means the starter wins', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 3, [ids[1]]: 3 } }, noShuffle);
  assert.equal(g.applyFeed(s, { corners: 0, status: 'FT' }).winner, ids[0]);
});

test('a corner the feed takes back moves the badge back', () => {
  const { s, ids } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: 1 } }, noShuffle);
  g.applyFeed(s, { corners: 2, status: '1H' });
  g.applyFeed(s, { corners: 1, status: '1H' });
  assert.equal(g.holderId(s.match), ids[1]);
});

test('manual corners adjust the feed count', () => {
  const { s, ids } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: 1 } }, noShuffle);
  g.manualCorner(s, 1);
  g.applyFeed(s, { corners: 1, status: '1H' });
  assert.equal(g.cornerCount(s.match), 2);
  g.manualCorner(s, -1); g.manualCorner(s, -1); g.manualCorner(s, -1);
  assert.equal(g.cornerCount(s.match), 0);
});

test('abandoned match refunds every stake', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 30, [ids[1]]: 7 } }, noShuffle);
  g.applyFeed(s, { corners: 3, status: 'ABD' });
  assert.equal(s.players[ids[0]].tokens, 100);
  assert.equal(s.players[ids[1]].tokens, 100);
  assert.equal(s.history[0].abandoned, true);
});

test('stakes must be whole, at least 1 and covered; blank sits out', () => {
  const { s, ids } = setup();
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 101, [ids[1]]: 1 } }), /only has 100/);
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1.5, [ids[1]]: 1 } }), /whole number/);
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 5 } }), /two players/);
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 5, [ids[1]]: 5, [ids[2]]: '' } });
  assert.equal(s.match.order.length, 2);
  assert.equal(s.players[ids[2]].tokens, 100);
});

test('shuffle covers every starter', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const { s, ids } = setup();
    g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: 1 } });
    seen.add(s.players[s.match.order[0]].name);
  }
  assert.equal(seen.size, 3);
});

test('players set their own pending stakes, which the match then uses', () => {
  const { s, ids } = setup();
  g.setStake(s, ids[0], 7);
  g.setStake(s, ids[1], 3);
  g.setStake(s, ids[2], 4);
  g.setStake(s, ids[2], ''); // changes mind and sits out
  assert.throws(() => g.setStake(s, ids[1], 500), /only has 100/);
  g.startMatch(s, { fixtureId: 'manual' });
  assert.deepEqual(s.match.stakes, { [ids[0]]: 7, [ids[1]]: 3 });
  assert.deepEqual(s.pendingStakes, {});
  assert.throws(() => g.setStake(s, ids[0], 1), /live match/);
});

test('a new season can set a different starting amount', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.newSeason(s, 250);
  assert.equal(s.players[ids[0]].tokens, 250);
  assert.equal(g.addPlayer(s, 'Cal') && s.startTokens, 250);
  assert.throws(() => g.newSeason(s, 0), /whole number/);
});
