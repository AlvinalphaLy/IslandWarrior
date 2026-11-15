import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, newStory, matchesChapter, completeChapter } from '../src/story/state.js';

test('story starts explicitly and advances through matching interactions only', () => {
  let state = newStory();
  assert.equal(matchesChapter(state, CHAPTERS[0], CHAPTERS[0].event), false);
  state = { ...state, started: true };
  for (const chapter of CHAPTERS) {
    assert.equal(
      matchesChapter(state, CHAPTERS[state.chapter], {
        type: 'talk',
        key: 'unrelated',
        map: 'village',
      }),
      false,
    );
    assert.equal(matchesChapter(state, CHAPTERS[state.chapter], chapter.event), true);
    state = completeChapter(state, CHAPTERS);
    assert.equal(matchesChapter(state, CHAPTERS[state.chapter], chapter.event), false);
  }
  assert.equal(state.chapter, 7);
  assert.equal(new Set(state.completed).size, 7);
  assert.deepEqual(completeChapter(state, CHAPTERS), state);
});
