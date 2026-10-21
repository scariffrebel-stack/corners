import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../lib/game.js';

function setup(names = ['Ann', 'Ben', 'Cal']) {
  const s = g.emptyState();
  const ids = names.map((n) => g.addPlayer(s, n));
  return { s, ids };
}
const noShuffle = () => 0.999999; // keeps the order as given

test('flag passes on each corner and the holder at full time takes the pot', () => {
  const { s, ids } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 10, [ids[1]]: 5, [ids[2]]: 1 } }, noShuffle);
  assert.deepEqual(s.match.order, ids);
  assert.equal(g.balance(s, ids[0]), 90);
  g.applyFeed(s, { corners: 4, status: '2H' });
  assert.equal(g.holderId(s.match), ids[1]); // 4 % 3 = 1
  const r = g.applyFeed(s, { corners: 5, status: 'FT' });
  assert.equal(r.winner, ids[2]);
  assert.equal(g.balance(s, ids[2]), 99 + 16);
  assert.equal(s.match, null);
});

test('no corners means the starter wins', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 3, [ids[1]]: 3 } }, noShuffle);
  assert.equal(g.applyFeed(s, { corners: 0, status: 'FT' }).winner, ids[0]);
});

test('a corner the feed takes back moves the flag back', () => {
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
  assert.equal(g.balance(s, ids[0]), 100);
  assert.equal(g.balance(s, ids[1]), 100);
  assert.equal(s.competitions[s.nextComp].history[0].abandoned, true);
});

test('stakes must be whole, at least 1 and covered; blank sits out', () => {
  const { s, ids } = setup();
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 101, [ids[1]]: 1 } }), /only has 100/);
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1.5, [ids[1]]: 1 } }), /whole number/);
  assert.throws(() => g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 5 } }), /two players/);
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 5, [ids[1]]: 5, [ids[2]]: '' } });
  assert.equal(s.match.order.length, 2);
  assert.equal(g.balance(s, ids[2]), 100);
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
  assert.equal(g.balance(s, ids[0]), 250);
  const cal = g.addPlayer(s, 'Cal');
  assert.equal(g.balance(s, cal), 250);
  assert.throws(() => g.newSeason(s, 0), /whole number/);
});

test('closest corners guess takes the side pot, on top of the flag pot', () => {
  const { s, ids } = setup();
  g.setStake(s, ids[0], 10);
  g.setStake(s, ids[1], 10);
  g.setGuess(s, ids[0], 8, 5);
  g.setGuess(s, ids[1], 12, 5);
  g.setGuess(s, ids[2], 10, 4); // not in the flag game, still guesses
  g.startMatch(s, { fixtureId: 'manual' }, noShuffle);
  assert.equal(g.balance(s, ids[0]), 85);
  assert.equal(g.balance(s, ids[2]), 96);
  assert.equal(g.sidePot(s.match), 14);
  assert.deepEqual(s.pendingGuesses, {});
  const r = g.applyFeed(s, { corners: 11, status: 'FT' }); // 11 % 2 = 1, so Ben holds the flag
  assert.deepEqual(r.guessWinners, [ids[1], ids[2]]); // 12 and 10 are both one away
  assert.equal(g.balance(s, ids[0]), 85);
  assert.equal(g.balance(s, ids[1]), 85 + 20 + 7);
  assert.equal(g.balance(s, ids[2]), 96 + 7);
});

test('an odd side pot split goes to whoever guessed first', () => {
  const { s, ids } = setup();
  g.setGuess(s, ids[0], 9, 2);
  g.setGuess(s, ids[1], 11, 3);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 1, [ids[2]]: 1 } }, noShuffle);
  const r = g.applyFeed(s, { corners: 10, status: 'FT' });
  assert.deepEqual(r.guessWinners, [ids[0], ids[1]]);
  assert.equal(g.balance(s, ids[0]), 100 - 1 - 2 + 2 + 3); // won the 2-token flag pot (10 % 2 = 0) and 3 of the 5
  assert.equal(g.balance(s, ids[1]), 100 - 3 + 2);
});

test('a lone guess has nobody to beat, so it is dropped and costs nothing', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.setGuess(s, ids[0], 9, 20);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 1, [ids[1]]: 1 } });
  assert.equal(g.balance(s, ids[0]), 99);
  assert.equal(g.sidePot(s.match), 0);
  assert.equal(g.settle(s).sidePot, undefined);
});

test('guess stakes and flag stakes share one balance', () => {
  const { s, ids } = setup();
  g.setStake(s, ids[0], 70);
  assert.throws(() => g.setGuess(s, ids[0], 10, 31), /only has 30 tokens left/);
  g.setGuess(s, ids[0], 10, 30);
  assert.throws(() => g.setStake(s, ids[0], 71), /only has 70 tokens left/);
  assert.throws(() => g.setGuess(s, ids[1], 1.5, 1), /whole number of corners/);
  assert.throws(() => g.setGuess(s, ids[1], -1, 1), /whole number of corners/);
  g.setGuess(s, ids[0], 10, ''); // withdraws
  assert.deepEqual(s.pendingGuesses, {});
});

test('guesses lock at the start and abandoning refunds them', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.setGuess(s, ids[0], 9, 10);
  g.setGuess(s, ids[1], 7, 10);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 5, [ids[1]]: 5 } });
  assert.throws(() => g.setGuess(s, ids[0], 8, 10), /locked/);
  g.abandon(s);
  assert.equal(g.balance(s, ids[0]), 100);
  assert.equal(g.balance(s, ids[1]), 100);
});

test('a group from before competitions becomes its first season, balances and results kept', () => {
  const old = { startTokens: 100, players: { a: { name: 'Ann', tokens: 130 }, b: { name: 'Ben', tokens: 70 } }, pendingStakes: {}, pendingGuesses: {}, match: null, history: [{ label: 'Old match', winner: 'a', pot: 30 }] };
  const s = g.migrate(old);
  const season = s.competitions[s.nextComp];
  assert.equal(season.kind, 'season');
  assert.equal(g.balance(s, 'a'), 130);
  assert.equal(g.balance(s, 'b'), 70);
  assert.equal(season.history[0].label, 'Old match');
  assert.equal(s.players.a.tokens, undefined);
  assert.equal(s.history, undefined);
  assert.equal(g.migrate(s), s); // already migrated: left alone
});

test('a tournament keeps its own balances, apart from the season', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  const season = s.nextComp;
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 10, [ids[1]]: 10 } }, noShuffle);
  g.settle(s); // no corners: Ann wins 20
  const cup = g.createCompetition(s, { kind: 'tournament', name: 'Weekend cup', startTokens: 30, from: '2026-10-24', to: '2026-10-26' });
  assert.equal(s.nextComp, cup);
  assert.equal(g.balance(s, ids[0]), 30);
  assert.equal(g.balance(s, ids[0], season), 110);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 30, [ids[1]]: 30 } }, noShuffle);
  g.applyFeed(s, { corners: 1, status: 'FT' }); // Ben wins 60
  assert.equal(g.balance(s, ids[1], cup), 60);
  assert.equal(g.balance(s, ids[1], season), 90); // untouched by the tournament
  assert.equal(s.competitions[cup].history.length, 1);
  assert.equal(s.competitions[season].history.length, 1);
});

test('tournament matches must fall inside its dates', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.createCompetition(s, { kind: 'tournament', name: 'Cup', from: '2026-10-24', to: '2026-10-26' });
  const stakes = { [ids[0]]: 1, [ids[1]]: 1 };
  assert.throws(() => g.startMatch(s, { fixtureId: '9', kickoff: '2026-10-30T15:00:00Z', stakes }), /runs from 2026-10-24 to 2026-10-26/);
  g.startMatch(s, { fixtureId: '9', kickoff: '2026-10-25T15:00:00Z', stakes });
  assert.throws(() => g.createCompetition(s, { kind: 'tournament', name: 'Bad', from: '2026-10-26', to: '2026-10-24' }), /ends before/);
  assert.throws(() => g.createCompetition(s, { kind: 'tournament', name: 'Bad' }), /first and last day/);
});

test('a tournament ends by itself after its last day, and the winner is recorded', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  const season = s.nextComp;
  const cup = g.createCompetition(s, { kind: 'tournament', name: 'Cup', from: '2026-10-24', to: '2026-10-25' });
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 5, [ids[1]]: 5 } }, noShuffle);
  g.settle(s);
  g.closeFinished(s, Date.parse('2026-10-25T23:00:00Z'));
  assert.equal(s.competitions[cup].status, 'open'); // still its last day
  g.closeFinished(s, Date.parse('2026-10-26T09:00:00Z'));
  assert.equal(s.competitions[cup].status, 'finished');
  assert.deepEqual(s.competitions[cup].winners, [ids[0]]);
  assert.equal(s.nextComp, season); // back to the season
  assert.throws(() => g.setNextComp(s, cup), /finished/);
});

test('a one-off match finishes at full time; abandoning it leaves it open for another go', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  const one = g.createCompetition(s, { kind: 'match', startTokens: 10 });
  assert.equal(s.competitions[one].name, 'One-off match');
  const stakes = { [ids[0]]: 10, [ids[1]]: 10 };
  g.startMatch(s, { fixtureId: '1', stakes });
  g.abandon(s);
  assert.equal(s.competitions[one].status, 'open');
  g.startMatch(s, { fixtureId: '2', stakes }, noShuffle);
  g.settle(s);
  assert.equal(s.competitions[one].status, 'finished');
  assert.deepEqual(s.competitions[one].winners, [ids[0]]);
});

test('a new season finishes the old one and starts everyone again', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  const first = s.nextComp;
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 10, [ids[1]]: 10 } }, noShuffle);
  g.settle(s);
  const second = g.newSeason(s);
  assert.equal(s.competitions[first].status, 'finished');
  assert.deepEqual(s.competitions[first].winners, [ids[0]]);
  assert.equal(s.competitions[second].name, 'Season 2');
  assert.equal(g.balance(s, ids[0]), 100);
  // Someone joining later isn't added to the finished table
  const cal = g.addPlayer(s, 'Cal');
  assert.equal(s.competitions[first].balances[cal], undefined);
  assert.deepEqual(g.standings(s, first).map((r) => r.id), [ids[0], ids[1]]);
  assert.equal(g.standings(s, second).length, 3);
});

test('switching competition clears stakes put down for the old one', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  const season = s.nextComp;
  g.setStake(s, ids[0], 50);
  const cup = g.createCompetition(s, { kind: 'tournament', name: 'Cup', startTokens: 20, from: '2026-10-24', to: '2026-10-25' });
  assert.deepEqual(s.pendingStakes, {});
  assert.throws(() => g.setStake(s, ids[0], 50), /only has 20/);
  g.setNextComp(s, season);
  g.setStake(s, ids[0], 50);
  assert.equal(s.nextComp, season);
  assert.equal(s.competitions[cup].status, 'open'); // still there to switch back to
});

test('the match log records each corner, whose it was and who got the flag', () => {
  const { s, ids } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: 1 } }, noShuffle);
  g.applyFeed(s, { corners: 1, status: '1H', minute: "12'", teams: [{ name: 'Arsenal', corners: 1 }, { name: 'Chelsea', corners: 0 }] }, 1000);
  g.applyFeed(s, { corners: 3, status: '1H', minute: "30'", teams: [{ name: 'Arsenal', corners: 2 }, { name: 'Chelsea', corners: 1 }] }, 2000);
  g.applyFeed(s, { corners: 2, status: '2H', minute: "50'", teams: [{ name: 'Arsenal', corners: 1 }, { name: 'Chelsea', corners: 1 }] }, 3000);
  g.manualCorner(s, 1, 4000);
  assert.deepEqual(s.match.log, [
    { n: 1, holder: ids[1], team: 'Arsenal', at: 1000, minute: "12'" },
    { n: 2, holder: ids[2], at: 2000, minute: "30'" }, // two at once: can't tell whose
    { n: 3, holder: ids[0], at: 2000, minute: "30'" },
    { n: 2, holder: ids[2], back: 1, at: 3000, minute: "50'" },
    { n: 3, holder: ids[0], at: 4000, byHand: true },
  ]);
  const r = g.settle(s);
  assert.equal(r.log.length, 5);
});

test('reactions need a live match, a known player and one of the set emoji', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  assert.throws(() => g.react(s, ids[0], '🍺'), /No match/);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 1, [ids[1]]: 1 } });
  g.react(s, ids[0], '🍺', 1000);
  g.react(s, ids[0], '🔥', 1500); // too soon after the last one, dropped
  g.react(s, ids[0], '🔥', 3000);
  g.react(s, ids[1], '😱', 3000);
  assert.deepEqual(s.match.reactions.map((r) => r.emoji), ['🍺', '🔥', '😱']);
  assert.throws(() => g.react(s, ids[0], '💩'), /Unknown reaction/);
  assert.throws(() => g.react(s, 'nobody', '🍺'), /Pick your name/);
  for (let i = 0; i < 60; i++) g.react(s, ids[0], '👏', 10000 + i * 2000);
  assert.equal(s.match.reactions.length, 40);
});

test('the golden corner pays a quarter of the pot to whoever got the flag on it', () => {
  const { s, ids } = setup();
  const rng = () => 0.25; // golden corner 1 + floor(0.25 * 12) = 4; the shuffle is fixed by the test below
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 10, [ids[1]]: 10, [ids[2]]: 10 }, golden: true }, rng);
  s.match.order = [...ids];
  assert.equal(s.match.golden.corner, 4);
  g.applyFeed(s, { corners: 3, status: '1H' });
  assert.equal(g.goldenId(s.match), null);
  g.applyFeed(s, { corners: 5, status: '2H' });
  assert.equal(g.goldenId(s.match), ids[1]); // corner 4 gave the flag to the 4 % 3 = 1st
  const r = g.settle(s); // holder at 5 corners is ids[2]
  assert.deepEqual(r.golden, { corner: 4, winner: ids[1], bonus: 7 });
  assert.equal(g.balance(s, ids[1]), 90 + 7);
  assert.equal(g.balance(s, ids[2]), 90 + 23);
});

test('a golden corner that never comes leaves the whole pot to the holder', () => {
  const { s, ids } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: 'manual', stakes: { [ids[0]]: 10, [ids[1]]: 10 }, golden: true }, () => 0.999);
  assert.equal(s.match.golden.corner, 12);
  g.applyFeed(s, { corners: 13, status: '2H' });
  g.applyFeed(s, { corners: 11, status: '2H' }); // the feed takes two back: no longer golden
  const r = g.settle(s);
  assert.deepEqual(r.golden, { corner: 12, winner: null, bonus: 0 });
  assert.equal(g.balance(s, r.winner), 110);
});

test('a group can say what its tokens stand for, or clear it', () => {
  const s = g.emptyState();
  g.setLabel(s, ' pint ', 10);
  assert.deepEqual(s.label, { unit: 'pint', per: 10 });
  assert.throws(() => g.setLabel(s, 'pint', 0), /how many tokens/);
  assert.throws(() => g.setLabel(s, 'pint', 2.5), /how many tokens/);
  g.setLabel(s, '', '');
  assert.equal(s.label, undefined);
});

test('a group can be renamed but never left without a name', () => {
  const s = g.emptyState();
  s.group = { id: 'abc', name: 'Corners', code: 'ABCDEF' };
  g.renameGroup(s, '  Sunday League ');
  assert.equal(s.group.name, 'Sunday League');
  assert.throws(() => g.renameGroup(s, '   '), /name/);
  assert.equal(s.group.name, 'Sunday League');
});

test('a corner called in the room moves the flag at once and is not counted again when the feed catches up', () => {
  const { s, ids: [a, b, c] } = setup();
  g.startMatch(s, { fixtureId: '1', stakes: { [a]: 10, [b]: 10, [c]: 10 } }, noShuffle, 0);
  g.callCorner(s, b, 1000);
  assert.equal(g.cornerCount(s.match), 1);
  assert.equal(g.holderId(s.match), b);
  g.callCorner(s, c, 3000); // the same corner, shouted by someone else
  assert.equal(g.cornerCount(s.match), 1);
  g.applyFeed(s, { corners: 1, status: '1H' }, 60000); // the feed reports it a minute later
  assert.equal(g.cornerCount(s.match), 1);
  g.callCorner(s, a, 70000);
  g.applyFeed(s, { corners: 1, status: '1H' }, 80000); // not in the feed yet, so it still counts
  assert.equal(g.cornerCount(s.match), 2);
  assert.equal(s.match.log.at(-1).by, a);
});

test('a called corner the feed never saw is dropped at full time, but a backup correction stays', () => {
  const { s, ids: [a, b] } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: '1', stakes: { [a]: 10, [b]: 10 } }, noShuffle, 0);
  g.manualCorner(s, 1, 500); // the feed missed one, so it's fixed by hand
  g.callCorner(s, a, 1000); // a mis-tap
  assert.equal(g.cornerCount(s.match), 2);
  const r = g.applyFeed(s, { corners: 2, status: 'FT' }, 9000);
  assert.equal(r.corners, 3);
});

test('undo takes back a called corner before a correction', () => {
  const { s, ids: [a, b] } = setup(['Ann', 'Ben']);
  g.startMatch(s, { fixtureId: '1', stakes: { [a]: 10, [b]: 10 } }, noShuffle, 0);
  g.callCorner(s, a, 1000);
  g.manualCorner(s, -1, 2000);
  assert.equal(s.match.ahead, 0);
  assert.equal(s.match.manualAdjust, 0);
});

test('once a player picks their name on a phone, only they can change their stake', () => {
  const { s, ids } = setup();
  const [ann, ben] = ids;
  g.setStake(s, ben, 5, ann); // Ben isn't on the app yet, so Ann types his in at the table
  assert.equal(s.pendingStakes[ben], 5);
  g.claim(s, ben);
  assert.throws(() => g.setStake(s, ben, 50, ann), /Only Ben can change Ben's stake/);
  assert.throws(() => g.setStake(s, ben, '', ann), /Only Ben/);
  assert.throws(() => g.setGuess(s, ben, 9, 5, ann), /Only Ben/);
  assert.throws(() => g.setStake(s, ben, 5, null), /Only Ben/); // a phone that hasn't picked a name
  g.setStake(s, ben, 7, ben);
  assert.equal(s.pendingStakes[ben], 7);
  const fresh = g.newGroup('Pub', 100, 'Dee');
  assert.equal(fresh.state.players[fresh.playerId].phone, true); // the creator is on their phone
});

test('results keep the names of who won, even after they leave the group', () => {
  const { s, ids } = setup();
  const [ann, ben] = ids;
  g.startMatch(s, { fixtureId: '1', stakes: { [ann]: 4, [ben]: 4 } }, noShuffle, 0);
  g.manualCorner(s, 1);
  const r = g.settle(s);
  assert.equal(r.winner, ben);
  assert.deepEqual(r.names, { [ann]: 'Ann', [ben]: 'Ben' });
  g.removePlayer(s, ben);
  assert.equal(s.former[ben], 'Ben');
});
