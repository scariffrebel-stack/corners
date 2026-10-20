import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../lib/game.js';
import { playerStats, matchNet } from '../lib/stats.js';

const noShuffle = () => 0.999999;

function play(s, stakes, corners, extra = {}) {
  g.startMatch(s, { fixtureId: 'manual', stakes, ...extra }, noShuffle);
  return g.applyFeed(s, { corners, status: 'FT' });
}

test("each match's net matches what the balances actually did", () => {
  const s = g.emptyState();
  const [a, b, c] = ['Ann', 'Ben', 'Cal'].map((n) => g.addPlayer(s, n));
  g.setGuess(s, a, 9, 2);
  g.setGuess(s, b, 11, 3);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [a]: 5, [b]: 7, [c]: 9 }, golden: true }, () => 0.25); // golden corner 4
  s.match.order = [a, b, c];
  const r = g.applyFeed(s, { corners: 10, status: 'FT' });
  const net = matchNet(r);
  for (const id of [a, b, c]) assert.equal(100 + (net[id] || 0), g.balance(s, id));
});

test('running totals add up across matches and competitions', () => {
  const s = g.emptyState();
  const [a, b] = ['Ann', 'Ben'].map((n) => g.addPlayer(s, n));
  const season = s.nextComp;
  play(s, { [a]: 10, [b]: 10 }, 0); // Ann
  play(s, { [a]: 10, [b]: 10 }, 2); // Ann
  play(s, { [a]: 5, [b]: 5 }, 1); // Ben
  const cup = g.createCompetition(s, { kind: 'tournament', name: 'Cup', from: '2026-10-24', to: '2026-10-25' });
  g.setGuess(s, a, 4, 3);
  g.setGuess(s, b, 9, 3);
  play(s, { [a]: 20, [b]: 20 }, 3); // Ben wins the flag, Ann the side pot
  g.startMatch(s, { fixtureId: 'manual', stakes: { [a]: 1, [b]: 1 } });
  g.abandon(s); // doesn't count

  const one = playerStats([s.competitions[season]]);
  assert.equal(one.totals.matches, 3);
  assert.equal(one.players[a].flags, 2);
  assert.equal(one.players[a].net, 10 + 10 - 5);
  assert.equal(one.players[b].net, -15);
  assert.equal(one.players[a].bestStreak, 2);
  assert.equal(one.players[a].streak, 0);
  assert.deepEqual(one.players[a].form, ['W', 'W', 'L']);

  const all = playerStats(Object.values(s.competitions));
  assert.equal(all.totals.matches, 4);
  assert.equal(all.totals.corners, 6);
  assert.equal(all.totals.mostCorners.corners, 3);
  assert.equal(all.players[b].flags, 2);
  assert.equal(all.players[b].biggestPot, 40);
  assert.equal(all.players[a].guessWins, 1);
  assert.equal(all.players[a].avgGuessError, 1);
  assert.equal(all.players[b].avgGuessError, 6);
  assert.equal(all.players[a].net, 15 - 20 + 3);
  assert.equal(all.players[a].winRate, 0.5);
  assert.equal(g.balance(s, a, cup) - 100, -20 + 3);
});

test('a flag that reaches the winner in the 90th minute or later counts as a late steal', () => {
  const s = g.emptyState();
  const [a, b] = ['Ann', 'Ben'].map((n) => g.addPlayer(s, n));
  g.startMatch(s, { fixtureId: '1', stakes: { [a]: 1, [b]: 1 } }, noShuffle);
  g.applyFeed(s, { corners: 2, status: '2H', minute: "70'" });
  g.applyFeed(s, { corners: 3, status: '2H', minute: "90+2'" });
  g.applyFeed(s, { corners: 3, status: 'FT' });
  assert.equal(playerStats(Object.values(s.competitions)).players[b].lateSteals, 1);
});
