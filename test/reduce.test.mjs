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
  timersAt,
  timerOffer,
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
  // The only one carrying durations, so that a step with no timer and a step
  // with one are both in the catalogue and neither has to be simulated.
  {
    id: 'gamma',
    title: 'Gamma',
    servings: 1,
    totalMinutes: 30,
    ingredients: [{ quantity: '3', item: 'things' }],
    steps: [
      { text: 'Gamma one', minutes: 20, timerLabel: 'Simmer' },
      { text: 'Gamma two', minutes: 5, timerLabel: 'Rest' },
    ],
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

test('enter does nothing on the ingredients, or on a step with no duration', () => {
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

// --- Timers ---------------------------------------------------------------
// Timers are global rather than scoped to the step that started them, and each
// is stored as the instant it ends rather than as a counter. Every assertion
// below drives a twenty minute duration by passing a second timestamp: no fake
// timers, no clock mocking, and nothing waits.

const MINUTE = 60 * 1000;
const later = (minutes) => NOW + minutes * MINUTE;

// A cook looking at Gamma's first step, which offers a twenty minute simmer.
const onTimerStep = () => cooking('gamma', SWIPE_RIGHT);

test('a step carrying a duration offers a timer, showing its length', () => {
  const offer = timerOffer(onTimerStep(), CATALOGUE, NOW);
  assert.equal(offer.label, 'Simmer');
  assert.equal(offer.minutes, 20);
});

test('offering a timer does not start one', () => {
  assert.deepEqual(onTimerStep().timers, []);
});

test('a step with no duration offers nothing', () => {
  assert.equal(timerOffer(cooking('alpha', SWIPE_RIGHT), CATALOGUE, NOW), null);
});

test('no screen outside a step offers a timer', () => {
  const done = cooking('gamma', SWIPE_RIGHT, SWIPE_RIGHT, SWIPE_RIGHT);
  for (const state of [initialState(), cooking('gamma'), done]) {
    assert.equal(timerOffer(state, CATALOGUE, NOW), null, state.screen);
  }
});

test('enter starts the timer the step offers', () => {
  const state = reduce(onTimerStep(), ACTIVATE, NOW);
  assert.equal(state.timers.length, 1);
  assert.equal(state.timers[0].label, 'Simmer');
});

test('starting a timer leaves the cook on the step they started it from', () => {
  const before = onTimerStep();
  const started = reduce(before, ACTIVATE, NOW);
  assert.equal(started.screen, before.screen);
  assert.equal(started.position, before.position);
  assert.equal(started.recipeId, before.recipeId);
});

test('a timer is stored as the instant it ends, not as a counter', () => {
  const [timer] = reduce(onTimerStep(), ACTIVATE, NOW).timers;
  assert.equal(timer.endsAt, later(20));
  // Nothing on a timer decrements, so nothing on it can fall out of date while
  // the application is not running.
  assert.deepEqual(Object.keys(timer).sort(), ['endsAt', 'id', 'label', 'sourceStep']);
});

test('the same start at two different instants ends twenty minutes after each', () => {
  const from = onTimerStep();
  assert.equal(reduce(from, ACTIVATE, NOW).timers[0].endsAt, NOW + 20 * MINUTE);
  assert.equal(reduce(from, ACTIVATE, 0).timers[0].endsAt, 0 + 20 * MINUTE);
});

test('remaining time is derived from the clock the reducer is passed', () => {
  const state = reduce(onTimerStep(), ACTIVATE, NOW);
  assert.equal(timersAt(state, NOW)[0].remainingMs, 20 * MINUTE);
  assert.equal(timersAt(state, later(12))[0].remainingMs, 8 * MINUTE);
  assert.equal(timersAt(state, later(19.5))[0].remainingMs, 30 * 1000);
  assert.equal(timersAt(state, later(12))[0].finished, false);
});

test('a timer reads as finished once its instant has passed', () => {
  const state = reduce(onTimerStep(), ACTIVATE, NOW);
  for (const minutes of [20, 25, 600]) {
    const [timer] = timersAt(state, later(minutes));
    assert.equal(timer.finished, true, `${minutes} minutes in`);
    // Never a negative countdown: overdue is overdue.
    assert.equal(timer.remainingMs, 0);
  }
});

test('a running timer keeps counting through every navigation', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const walked = after([SWIPE_RIGHT, SWIPE_RIGHT, SWIPE_LEFT, SWIPE_LEFT], { from: started });
  assert.equal(timersAt(walked, later(5))[0].remainingMs, 15 * MINUTE);
});

test('a running timer survives abandoning the cook for the menu', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const menu = after([SWIPE_LEFT, SWIPE_LEFT], { from: started });
  assert.equal(menu.screen, MENU);
  assert.equal(menu.recipeId, null);
  assert.equal(timersAt(menu, later(5))[0].label, 'Simmer');
  assert.equal(timersAt(menu, later(5))[0].remainingMs, 15 * MINUTE);
});

test('a running timer survives starting a different recipe', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  // Down from the abandoned Gamma wraps round the catalogue to Alpha.
  const elsewhere = after([SWIPE_LEFT, SWIPE_LEFT, FOCUS_DOWN, ACTIVATE], { from: started });
  assert.equal(elsewhere.recipeId, 'alpha');
  assert.equal(timersAt(elsewhere, later(5)).length, 1);
});

// Two timers, started five minutes apart, are what the indicator has to keep
// apart on screen: same shape, different labels, different instants.
function twoRunning() {
  const first = reduce(onTimerStep(), ACTIVATE, NOW);
  const secondStep = reduce(first, SWIPE_RIGHT, NOW);
  return reduce(secondStep, ACTIVATE, later(5));
}

test('several timers run at once, each labelled with what it is for', () => {
  assert.deepEqual(
    twoRunning().timers.map((timer) => timer.label),
    ['Simmer', 'Rest'],
  );
});

test('concurrent timers each report their own remaining time', () => {
  const [rest, simmer] = timersAt(twoRunning(), later(8));
  assert.equal(simmer.label, 'Simmer');
  assert.equal(simmer.remainingMs, 12 * MINUTE);
  assert.equal(rest.label, 'Rest');
  assert.equal(rest.remainingMs, 2 * MINUTE);
});

test('concurrent timers finish independently', () => {
  const state = twoRunning();
  const finished = (now) =>
    timersAt(state, now)
      .filter((timer) => timer.finished)
      .map((timer) => timer.label);
  assert.deepEqual(finished(later(8)), []);
  assert.deepEqual(finished(later(10)), ['Rest']);
  assert.deepEqual(finished(later(20)), ['Rest', 'Simmer']);
});

// Soonest first, so the timer nearest to needing attention is the one the row
// shows when there is not room for all of them.
test('timers are ordered by the instant they end', () => {
  assert.deepEqual(
    timersAt(twoRunning(), later(8)).map((timer) => timer.label),
    ['Rest', 'Simmer'],
  );
});

test('a step whose timer is already running does not offer another', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  assert.equal(timerOffer(started, CATALOGUE, later(19)), null);
  assert.equal(reduce(started, ACTIVATE, later(19)), started);
});

test('coming back to a step whose timer is running does not offer another', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const returned = after([SWIPE_RIGHT, SWIPE_LEFT], { from: started });
  assert.equal(timerOffer(returned, CATALOGUE, later(19)), null);
});

// A finished timer is spent, and a cook who wants that simmer again should not
// have to reach for a phone.
test('a step offers its timer again once that timer has finished', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  assert.equal(timerOffer(started, CATALOGUE, later(20)).label, 'Simmer');
  const restarted = reduce(started, ACTIVATE, later(20));
  assert.equal(restarted.timers.length, 2);
  assert.equal(timersAt(restarted, later(20))[1].remainingMs, 20 * MINUTE);
});

// A timer outlives the recipe it was started in, so what a timer was started
// from has to name the recipe as well as the step. Two recipes whose timers
// sit at the same step index are where that would show.
test('a timer running in one recipe does not suppress the offer in another', () => {
  const twins = [CATALOGUE[2], { ...CATALOGUE[2], id: 'delta', title: 'Delta' }];
  const reduceTwins = createReduce(twins);
  const started = after([ACTIVATE, SWIPE_RIGHT, ACTIVATE], { reducer: reduceTwins });
  assert.equal(started.recipeId, 'gamma');
  assert.equal(started.timers.length, 1);

  const inDelta = after([SWIPE_LEFT, SWIPE_LEFT, FOCUS_DOWN, ACTIVATE, SWIPE_RIGHT], {
    from: started,
    reducer: reduceTwins,
  });
  assert.equal(inDelta.recipeId, 'delta');
  assert.equal(timerOffer(inDelta, twins, NOW).label, 'Simmer');
});

test('every timer carries an id of its own', () => {
  const ids = twoRunning().timers.map((timer) => timer.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('starting a timer does not mutate the state it started from', () => {
  const before = deepFreeze(onTimerStep());
  const started = reduce(before, ACTIVATE, NOW);
  assert.deepEqual(before.timers, []);
  assert.equal(started.timers.length, 1);
});

test('deriving remaining time does not mutate the state it reads', () => {
  const state = deepFreeze(twoRunning());
  timersAt(state, later(8));
  assert.deepEqual(
    state.timers.map((timer) => timer.label),
    ['Simmer', 'Rest'],
  );
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
