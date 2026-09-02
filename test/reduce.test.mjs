import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReduce,
  initialState,
  MENU,
  INGREDIENTS,
  SWIPE_LEFT,
  SWIPE_RIGHT,
  FOCUS_UP,
  FOCUS_DOWN,
  ACTIVATE,
  TICK,
} from '../src/reduce.js';

// The catalogue the reducer is bound to. Only the fields the menu reads are
// exercised here; a full recipe is validated by validate-recipe, not by this.
const CATALOGUE = [
  { id: 'alpha', title: 'Alpha', servings: 2, totalMinutes: 20, ingredients: [], steps: [] },
  { id: 'beta', title: 'Beta', servings: 4, totalMinutes: 35, ingredients: [], steps: [] },
  { id: 'gamma', title: 'Gamma', servings: 1, totalMinutes: 10, ingredients: [], steps: [] },
];

// An arbitrary instant. Nothing in this ticket reads it, which is the point:
// the clock is an argument so that later durations are testable synchronously.
const NOW = Date.UTC(2026, 8, 1, 18, 30);

const reduce = createReduce(CATALOGUE);

// Applies events in order, so a test reads as the gestures a cook performs.
function after(events, { from = initialState(), now = NOW, reducer = reduce } = {}) {
  return events.reduce((state, event) => reducer(state, event, now), from);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

test('the menu opens with the first recipe focused', () => {
  const state = initialState();
  assert.equal(state.screen, MENU);
  assert.equal(state.recipeId, null);
  assert.equal(state.focus, 0);
  assert.deepEqual(state.timers, []);
  assert.equal(state.alert, null);
});

test('down moves the focus to the next recipe', () => {
  assert.equal(after([FOCUS_DOWN]).focus, 1);
  assert.equal(after([FOCUS_DOWN, FOCUS_DOWN]).focus, 2);
});

test('up moves the focus to the previous recipe', () => {
  assert.equal(after([FOCUS_DOWN, FOCUS_DOWN, FOCUS_UP]).focus, 1);
});

test('the focus wraps from the last recipe to the first', () => {
  assert.equal(after([FOCUS_DOWN, FOCUS_DOWN, FOCUS_DOWN]).focus, 0);
});

test('the focus wraps from the first recipe to the last', () => {
  assert.equal(after([FOCUS_UP]).focus, CATALOGUE.length - 1);
});

test('the focus never leaves the catalogue however far it is driven', () => {
  for (const event of [FOCUS_UP, FOCUS_DOWN]) {
    const state = after(Array.from({ length: 11 }, () => event));
    assert.ok(state.focus >= 0 && state.focus < CATALOGUE.length);
  }
});

test('activating selects the focused recipe and lands on its ingredients', () => {
  const state = after([FOCUS_DOWN, ACTIVATE]);
  assert.equal(state.screen, INGREDIENTS);
  assert.equal(state.recipeId, 'beta');
  assert.equal(state.position, 0);
  assert.equal(state.focus, 0);
});

test('activating a wrapped focus selects the recipe that is actually shown', () => {
  assert.equal(after([FOCUS_UP, ACTIVATE]).recipeId, 'gamma');
});

test('horizontal input does nothing in the menu, which has no flow position', () => {
  const opened = initialState();
  for (const event of [SWIPE_LEFT, SWIPE_RIGHT]) {
    assert.deepEqual(after([event], { from: opened }), opened);
  }
});

test('left from the ingredients returns to the menu', () => {
  const state = after([FOCUS_DOWN, ACTIVATE, SWIPE_LEFT]);
  assert.equal(state.screen, MENU);
  assert.equal(state.recipeId, null);
});

test('returning to the menu leaves the abandoned recipe focused', () => {
  assert.equal(after([FOCUS_DOWN, FOCUS_DOWN, ACTIVATE, SWIPE_LEFT]).focus, 2);
});

test('a menu with one recipe holds its focus in both directions', () => {
  const only = createReduce([CATALOGUE[0]]);
  for (const event of [FOCUS_UP, FOCUS_DOWN]) {
    assert.equal(after([event], { reducer: only }).focus, 0);
  }
  assert.equal(after([FOCUS_DOWN, ACTIVATE], { reducer: only }).recipeId, 'alpha');
});

test('an empty catalogue has nothing to focus and nothing to select', () => {
  const empty = createReduce([]);
  const opened = initialState();
  for (const event of [FOCUS_UP, FOCUS_DOWN, ACTIVATE]) {
    assert.deepEqual(after([event], { reducer: empty }), opened);
  }
});

test('the supplied time does not change the outcome of a menu transition', () => {
  const events = [FOCUS_DOWN, ACTIVATE];
  const early = after(events, { now: 0 });
  const late = after(events, { now: NOW + 6 * 60 * 60 * 1000 });
  assert.deepEqual(early, late);
});

test('the reducer does not mutate the state it is given', () => {
  const opened = deepFreeze(initialState());
  const moved = reduce(opened, FOCUS_DOWN, NOW);
  assert.equal(opened.focus, 0);
  assert.notEqual(moved, opened);
});

test('the same state and event always produce the same result', () => {
  const opened = initialState();
  assert.deepEqual(reduce(opened, FOCUS_DOWN, NOW), reduce(opened, FOCUS_DOWN, NOW));
});

test('a tick is accepted and changes nothing while no timers are running', () => {
  const opened = initialState();
  assert.deepEqual(after([TICK], { from: opened }), opened);
});

test('an event outside the vocabulary fails loudly', () => {
  assert.throws(() => reduce(initialState(), 'SWIPE_UP', NOW), /SWIPE_UP/);
});
