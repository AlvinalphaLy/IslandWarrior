import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceVoyage, newVoyage, voyageObjective } from '../src/story/state.js';

test('journey starts at boarding and follows landing, challenge, moly and return', () => {
  let state = newVoyage();
  assert.equal(advanceVoyage(state, { type: 'recover_moly' }).progress.hasMoly, false);
  assert.equal(advanceVoyage(state, { type: 'enter_grotto' }).progress.stage, 'harbor');
  let result = advanceVoyage(state, { type: 'board' });
  assert.deepEqual(result.beats, ['voyage_departure']);
  state = result.progress;
  assert.equal(advanceVoyage(state, { type: 'board' }).beats.length, 0);
  state = advanceVoyage(state, { type: 'landfall', island: 'aeaea' }).progress;
  state = advanceVoyage(state, { type: 'choose_reason', reason: 'treasure' }).progress;
  assert.equal(
    advanceVoyage(state, { type: 'choose_reason', reason: 'food' }).progress.reason,
    'treasure',
  );
  result = advanceVoyage(state, { type: 'enter_grotto' });
  assert.deepEqual(result.beats, ['voyage_challenge']);
  state = result.progress;
  state = advanceVoyage(state, { type: 'victory', enemy: 'siren_a' }).progress;
  assert.equal(advanceVoyage(state, { type: 'victory', enemy: 'siren_a' }).beats.length, 0);
  assert.equal(advanceVoyage(state, { type: 'board' }).progress.stage, 'grotto');
  state = advanceVoyage(state, { type: 'recover_moly' }).progress;
  assert.equal(state.stage, 'returning');
  assert.equal(advanceVoyage(state, { type: 'recover_moly' }).beats.length, 0);
  result = advanceVoyage(state, { type: 'board' });
  assert.equal(result.progress.stage, 'complete');
  assert.deepEqual(result.beats, ['voyage_departure_aeaea']);
  assert.ok(voyageObjective(result.progress).includes('Ithaca is not reached'));
});

test('entering sanctuary by ship defaults to food and emits the missing landing once', () => {
  const sailing = advanceVoyage(newVoyage(), { type: 'board' }).progress;
  const result = advanceVoyage(sailing, { type: 'enter_grotto' });
  assert.deepEqual(result.beats, ['voyage_landfall', 'voyage_food', 'voyage_challenge']);
  assert.equal(advanceVoyage(result.progress, { type: 'enter_grotto' }).beats.length, 0);
  assert.equal(sailing.stage, 'sailing');
});

test('implemented challenges can be completed in any order without duplicate rewards or beats', () => {
  let state = advanceVoyage(newVoyage(), { type: 'board' }).progress;
  for (const island of ['telepylus', 'cyclops', 'circe'] as const) {
    state = advanceVoyage(state, { type: 'enter_challenge', island }).progress;
    const failed = advanceVoyage(state, { type: 'challenge_failed', island });
    assert.equal(failed.progress.completedChallenges.includes(island), false);
    state = advanceVoyage(failed.progress, { type: 'enter_challenge', island }).progress;
    const won = advanceVoyage(state, { type: 'challenge_won', island });
    assert.ok(won.beats.includes(`${island}_success`));
    assert.equal(advanceVoyage(won.progress, { type: 'challenge_won', island }).beats.length, 0);
    state = advanceVoyage(won.progress, { type: 'board' }).progress;
    assert.equal(state.stage, 'complete');
  }
  assert.equal(state.completedChallenges.length, 3);
});
