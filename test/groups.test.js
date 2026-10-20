import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../lib/game.js';
import { load, save, createGroup, findGroup, NoGroupError, MAIN_GROUP } from '../lib/store.js';

test('a new group starts with its creator as the only player', () => {
  const { state, name, playerId } = g.newGroup(' Five-a-side ', 50, 'Ann');
  assert.equal(name, 'Five-a-side');
  assert.equal(state.startTokens, 50);
  assert.deepEqual(state.players, { [playerId]: { name: 'Ann', tokens: 50 } });
  assert.throws(() => g.newGroup('', 50, 'Ann'), g.GameError);
  assert.throws(() => g.newGroup('Pub', 0, 'Ann'), g.GameError);
  assert.throws(() => g.newGroup('Pub', 50, ''), g.GameError);
  assert.equal(g.newGroup('Pub', '', 'Ann').state.startTokens, g.START_TOKENS);
});

test('groups keep separate players and tokens, and a code finds the right one', async () => {
  const a = g.newGroup('Work', 100, 'Ann');
  const b = g.newGroup('Family', 20, 'Ann');
  await createGroup(a.state, a.name);
  await createGroup(b.state, b.name);
  assert.notEqual(a.state.group.id, b.state.group.id);
  assert.match(a.state.group.code, /^[A-HJKMNP-Z2-9]{6}$/);

  const work = await load(a.state.group.id);
  work.players[a.playerId].tokens = 7;
  await save(work);
  assert.equal((await load(a.state.group.id)).players[a.playerId].tokens, 7);
  assert.equal((await load(b.state.group.id)).players[b.playerId].tokens, 20);

  const found = await findGroup(` ${b.state.group.code.toLowerCase()} `);
  assert.equal(found.group.id, b.state.group.id);
  assert.equal(found.group.name, 'Family');
  await assert.rejects(findGroup('ZZZZZZ'), NoGroupError);
  await assert.rejects(load('nosuchgroup'), NoGroupError);
  await assert.rejects(load('../etc'), NoGroupError);
});

test('the original group is always there and gets a join code of its own', async () => {
  const main = await load(MAIN_GROUP);
  assert.equal(main.group.id, MAIN_GROUP);
  assert.equal((await findGroup(main.group.code)).group.id, MAIN_GROUP);
  assert.equal((await load()).group.code, main.group.code); // the code sticks
});
