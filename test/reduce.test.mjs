import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReduce,
  initialState,
  stepIndex,
  MENU,
  INGREDIENTS,
  STEP,
  DONE,
  SWIPE_LEFT,
  SWIPE_RIGHT,
  FOCUS_UP,
  FOCUS_DOWN,
  ACTIVATE,
  TICK,
} from '../src/reduce.js';

// The catalogue the reducer is bound to. Only the fields the menu reads are
// exercised here; a full recipe is validated by validate-recipe, not by this.
// Step counts differ on purpose: the flow's two boundaries sit one position
// apart on a single-step recipe and far apart on a longer one, and both have to
// hold.
const CATALOGUE = [
  {
    id: 'alpha',
    title: 'Alpha',
    servings: 2,
    totalMinutes: 20,
    ingredients: [{ quantity: '1', item: 'thing' }],
    steps: [{ text: 'Alpha one' }, { text: 'Alpha two' }, { text: 'Alpha three' }],
  },
  {
    id: 'beta',
    title: 'Beta',
    servings: 4,
    totalMinutes: 35,
    ingredients: [{ quantity: '2', item: 'things' }],
    steps: [{ text: 'Beta one' }],
  },
  {
    id: 'gamma',
    title: 'Gamma',
    servings: 1,
    totalMinutes: 10,
    ingredients: [{ quantity: '3', item: 'things' }],
    steps: [{ text: 'Gamma one' }, { text: 'Gamma two' }],
  },
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

// --- The flow -------------------------------------------------------------
// menu <-> ingredients <-> step 1 <-> ... <-> step N <-> done, with left and
// right carrying the same meaning on every one of those screens.

const ALPHA = CATALOGUE[0];
const BETA = CATALOGUE[1];

// A cook who has just selected `id` and is looking at its ingredients.
function onIngredients(id) {
  const focus = CATALOGUE.findIndex((recipe) => recipe.id === id);
  return reduce({ ...initialState(), focus }, ACTIVATE, NOW);
}

// The gestures a cook makes from that point, as a state.
const cooking = (id, ...events) => after(events, { from: onIngredients(id) });

const right = (count) => Array.from({ length: count }, () => SWIPE_RIGHT);

test('right from the ingredients reaches the first step', () => {
  const state = cooking('alpha', SWIPE_RIGHT);
  assert.equal(state.screen, STEP);
  assert.equal(state.position, 1);
  assert.equal(stepIndex(state), 0);
});

test('right walks the steps in order', () => {
  ALPHA.steps.forEach((_, index) => {
    const state = cooking('alpha', ...right(index + 1));
    assert.equal(state.screen, STEP);
    assert.equal(stepIndex(state), index);
  });
});

test('right from the last step reaches the completion screen', () => {
  const state = cooking('alpha', ...right(ALPHA.steps.length + 1));
  assert.equal(state.screen, DONE);
  assert.equal(state.recipeId, 'alpha');
});

test('the flow ends at the completion screen', () => {
  const done = cooking('alpha', ...right(ALPHA.steps.length + 1));
  assert.equal(reduce(done, SWIPE_RIGHT, NOW), done);
});

test('left from the first step returns to the ingredients', () => {
  const state = cooking('alpha', SWIPE_RIGHT, SWIPE_LEFT);
  assert.equal(state.screen, INGREDIENTS);
  assert.equal(state.position, 0);
  assert.equal(state.recipeId, 'alpha');
});

test('left from a middle step goes back exactly one step', () => {
  const state = cooking('alpha', SWIPE_RIGHT, SWIPE_RIGHT, SWIPE_RIGHT, SWIPE_LEFT);
  assert.equal(stepIndex(state), 1);
});

test('left from the completion screen returns to the last step', () => {
  const state = cooking('alpha', ...right(ALPHA.steps.length + 1), SWIPE_LEFT);
  assert.equal(state.screen, STEP);
  assert.equal(stepIndex(state), ALPHA.steps.length - 1);
});

// The shortest recipe the schema allows puts both boundaries one position
// apart, which is where an off-by-one in either direction would show.
test('a one-step recipe still has an ingredients screen and a completion screen', () => {
  assert.equal(BETA.steps.length, 1);
  assert.equal(cooking('beta').screen, INGREDIENTS);
  assert.equal(stepIndex(cooking('beta', SWIPE_RIGHT)), 0);
  assert.equal(cooking('beta', SWIPE_RIGHT, SWIPE_RIGHT).screen, DONE);
  assert.equal(cooking('beta', SWIPE_RIGHT, SWIPE_RIGHT, SWIPE_LEFT).screen, STEP);
});

test('walking the whole flow out and back returns to where it started', () => {
  const opened = onIngredients('alpha');
  const there = right(ALPHA.steps.length + 1);
  const back = there.map(() => SWIPE_LEFT);
  assert.deepEqual(after([...there, ...back], { from: opened }), opened);
});

// The screen is what the render dispatches on and the position is what moves,
// so a drift between them would show as the wrong screen at the right place.
test('the screen always agrees with the position', () => {
  const expected = [INGREDIENTS, ...ALPHA.steps.map(() => STEP), DONE];
  expected.forEach((screen, position) => {
    const state = cooking('alpha', ...right(position));
    assert.equal(state.screen, screen, `position ${position}`);
    assert.equal(state.position, position);
  });
});

test('left from the ingredients is the only way out of a cook', () => {
  // Every other position answers left by stepping back inside the recipe.
  for (let position = 1; position <= ALPHA.steps.length + 1; position += 1) {
    const state = cooking('alpha', ...right(position), SWIPE_LEFT);
    assert.notEqual(state.screen, MENU, `position ${position}`);
    assert.equal(state.recipeId, 'alpha');
  }
});

// Secondary actions on a step arrive with timers. Until then the cook screen
// has nothing to focus, and vertical input must not disturb the position.
test('vertical input does nothing on the ingredients or on a step', () => {
  for (const from of [cooking('alpha'), cooking('alpha', SWIPE_RIGHT)]) {
    for (const event of [FOCUS_UP, FOCUS_DOWN]) {
      assert.equal(reduce(from, event, NOW), from);
    }
  }
});

test('enter does nothing on the ingredients or on a step', () => {
  for (const from of [cooking('alpha'), cooking('alpha', SWIPE_RIGHT)]) {
    assert.equal(reduce(from, ACTIVATE, NOW), from);
  }
});

test('enter on the completion screen returns to the menu, that recipe focused', () => {
  const state = cooking('gamma', ...right(CATALOGUE[2].steps.length + 1), ACTIVATE);
  assert.equal(state.screen, MENU);
  assert.equal(state.recipeId, null);
  assert.equal(state.position, 0);
  assert.equal(state.focus, 2);
});

test('the supplied time does not change the outcome of a flow transition', () => {
  const events = right(ALPHA.steps.length + 1);
  const from = onIngredients('alpha');
  assert.deepEqual(after(events, { from, now: 0 }), after(events, { from, now: NOW }));
});

test('the step index names the instruction on screen, and nothing elsewhere', () => {
  assert.equal(stepIndex(initialState()), -1);
  assert.equal(stepIndex(cooking('alpha')), -1);
  assert.equal(stepIndex(cooking('alpha', ...right(ALPHA.steps.length + 1))), -1);
  assert.equal(stepIndex(cooking('alpha', SWIPE_RIGHT, SWIPE_RIGHT)), 1);
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
