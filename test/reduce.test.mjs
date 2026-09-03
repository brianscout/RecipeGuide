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
  HYDRATE,
  timersAt,
  timerOffer,
  alertingTimer,
  firedTimers,
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
test('vertical input does nothing on the ingredients, which has nothing to focus', () => {
  const from = cooking('alpha');
  for (const event of [FOCUS_UP, FOCUS_DOWN]) {
    assert.equal(reduce(from, event, NOW), from);
  }
});

test('vertical input on a step moves between its own action and stopping', () => {
  const from = cooking('alpha', SWIPE_RIGHT);
  assert.equal(from.focus, 0);
  // Two elements, so either direction is the same toggle.
  for (const event of [FOCUS_UP, FOCUS_DOWN]) {
    assert.equal(reduce(from, event, NOW).focus, 1);
    assert.equal(reduce(reduce(from, event, NOW), event, NOW).focus, 0);
  }
});

test('a step opens on its own action, never on stopping', () => {
  // Every way onto a step, since focus surviving a position change would put
  // an accidental pinch on the one action that ends the cook.
  for (const state of [
    cooking('alpha', SWIPE_RIGHT),
    cooking('alpha', ...right(3)),
    cooking('alpha', ...right(2), FOCUS_DOWN, SWIPE_RIGHT),
    cooking('alpha', ...right(2), FOCUS_DOWN, SWIPE_LEFT),
    cooking('alpha', ...right(4), SWIPE_LEFT),
  ]) {
    assert.equal(state.screen, STEP);
    assert.equal(state.focus, 0);
  }
});

test('stopping from a step returns to the menu with that recipe focused', () => {
  const state = cooking('gamma', SWIPE_RIGHT, FOCUS_DOWN, ACTIVATE);
  assert.equal(state.screen, MENU);
  assert.equal(state.recipeId, null);
  assert.equal(state.position, 0);
  assert.equal(state.focus, 2);
});

test('stopping clears the timers the recipe started', () => {
  const cook = cooking('gamma', SWIPE_RIGHT, ACTIVATE);
  assert.equal(cook.timers.length, 1);
  const stopped = after([FOCUS_DOWN, ACTIVATE], { from: cook });
  assert.deepEqual(stopped.timers, []);
  assert.equal(stopped.alert, null);
});

test('stopping clears a timer that has already fired, and its alert with it', () => {
  const twentyOneMinutes = NOW + 21 * 60 * 1000;
  const fired = after([SWIPE_RIGHT, ACTIVATE], { from: onIngredients('gamma') });
  const alerting = reduce(fired, TICK, twentyOneMinutes);
  assert.ok(alertingTimer(alerting));

  // The pinch that acknowledges comes first, as it does everywhere; the one
  // after it is the one that stops.
  const stopped = after([ACTIVATE, FOCUS_DOWN, ACTIVATE], {
    from: alerting,
    now: twentyOneMinutes,
  });
  assert.equal(stopped.screen, MENU);
  assert.deepEqual(stopped.timers, []);
  assert.equal(stopped.alert, null);
});

test('leaving a cook keeps its timers, where stopping one ends them', () => {
  // The whole distinction between the two exits, in one assertion.
  const cook = cooking('gamma', SWIPE_RIGHT, ACTIVATE);
  const left = after([SWIPE_LEFT, SWIPE_LEFT], { from: cook });
  const stopped = after([FOCUS_DOWN, ACTIVATE], { from: cook });

  assert.equal(left.screen, MENU);
  assert.equal(stopped.screen, MENU);
  assert.equal(timersAt(left, NOW).length, 1);
  assert.deepEqual(stopped.timers, []);
});

test('a pinch on a step with stopping unfocused still starts the timer', () => {
  const state = cooking('gamma', SWIPE_RIGHT, FOCUS_DOWN, FOCUS_UP, ACTIVATE);
  assert.equal(state.screen, STEP);
  assert.equal(state.timers.length, 1);
});

test('stopping does not mutate the state it ends', () => {
  const cook = deepFreeze(cooking('gamma', SWIPE_RIGHT, ACTIVATE, FOCUS_DOWN));
  const stopped = reduce(cook, ACTIVATE, NOW);
  assert.equal(cook.timers.length, 1);
  assert.deepEqual(stopped.timers, []);
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
  // the application is not running. `state` is the exception that proves it:
  // it records whether the alert has announced this timer, which is the one
  // fact about a timer that the clock cannot derive.
  assert.deepEqual(Object.keys(timer).sort(), ['endsAt', 'id', 'label', 'sourceStep', 'state']);
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
// have to reach for a phone. The pinch that clears it comes first — see the
// alert sequence below — so starting it again is the pinch after that one.
test('a step offers its timer again once that timer has finished', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  assert.equal(timerOffer(started, CATALOGUE, later(20)).label, 'Simmer');
  const restarted = after([ACTIVATE, ACTIVATE], { from: started, now: later(20) });
  assert.equal(restarted.timers.length, 1);
  assert.equal(timersAt(restarted, later(20))[0].remainingMs, 20 * MINUTE);
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

// --- The alert sequence ---------------------------------------------------
// Three phases, and the middle one is the reason for the other two: takeover,
// decay, persist. A pure takeover would stomp on the step a cook is halfway
// through reading; a pure indicator would silently miss a cook at the stove.
//
// Every assertion below drives a ten second decay by passing a second
// timestamp. Nothing waits, and no clock is faked.

const SECOND = 1000;
const secondsAfter = (instant, count) => instant + count * SECOND;

// A twenty minute simmer, started at NOW, so it ends at later(20).
const simmering = () => reduce(onTimerStep(), ACTIVATE, NOW);

// That simmer, on the first event to arrive after the instant it ended.
const takenOver = () => reduce(simmering(), TICK, later(20));

test('a timer reaching zero takes over the display, naming the timer that fired', () => {
  const state = takenOver();
  assert.equal(state.alert.timerId, simmering().timers[0].id);
  assert.equal(state.alert.since, later(20));
  assert.equal(alertingTimer(state).label, 'Simmer');
});

test('a timer still running raises no alert', () => {
  assert.equal(reduce(simmering(), TICK, later(19)).alert, null);
});

test('the takeover is raised by whatever event the clock arrives on', () => {
  for (const event of [TICK, SWIPE_RIGHT, SWIPE_LEFT, FOCUS_DOWN]) {
    const state = reduce(simmering(), event, later(20));
    assert.equal(alertingTimer(state)?.label, 'Simmer', event);
  }
});

test('the takeover stands its ground for ten seconds without any input', () => {
  const fired = takenOver();
  for (const count of [0, 1, 9, 9.9]) {
    const state = reduce(fired, TICK, secondsAfter(later(20), count));
    assert.notEqual(state.alert, null, `${count} seconds in`);
  }
});

test('the takeover stands down on its own after ten seconds', () => {
  const state = reduce(takenOver(), TICK, secondsAfter(later(20), 10));
  assert.equal(state.alert, null);
});

test('a finished timer is still signalling on the screen the takeover returns to', () => {
  const decayed = reduce(takenOver(), TICK, secondsAfter(later(20), 10));
  const [timer] = timersAt(decayed, secondsAfter(later(20), 10));
  assert.equal(timer.label, 'Simmer');
  assert.equal(timer.finished, true);
  assert.deepEqual(
    firedTimers(decayed).map((fired) => fired.label),
    ['Simmer'],
  );
});

test('the takeover returns to the screen the cook was on, not to another one', () => {
  const before = simmering();
  const decayed = after([TICK, TICK], { from: before, now: later(30) });
  assert.equal(decayed.screen, before.screen);
  assert.equal(decayed.position, before.position);
  assert.equal(decayed.recipeId, before.recipeId);
});

// The failure this guards against is the one that ruins dinner: a cook whose
// hands were full while the takeover came and went.
test('the signalling state never times out however long it is left', () => {
  let state = takenOver();
  for (const minutes of [1, 5, 30, 600]) {
    state = reduce(state, TICK, later(20 + minutes));
    assert.equal(state.alert, null, `${minutes} minutes on`);
    assert.deepEqual(
      firedTimers(state).map((timer) => timer.label),
      ['Simmer'],
      `${minutes} minutes on`,
    );
  }
});

test('a decayed takeover is never raised a second time by the same timer', () => {
  const decayed = reduce(takenOver(), TICK, secondsAfter(later(20), 10));
  assert.equal(reduce(decayed, TICK, later(25)).alert, null);
});

test('enter acknowledges the timer the takeover names and clears both', () => {
  const state = reduce(takenOver(), ACTIVATE, secondsAfter(later(20), 2));
  assert.deepEqual(state.timers, []);
  assert.equal(state.alert, null);
});

test('enter acknowledges a timer still signalling after the takeover decayed', () => {
  const decayed = reduce(takenOver(), TICK, secondsAfter(later(20), 10));
  const state = reduce(decayed, ACTIVATE, later(25));
  assert.deepEqual(state.timers, []);
  assert.deepEqual(firedTimers(state), []);
});

// Acknowledging comes before whatever else the screen would have done with
// that pinch. Something on screen is asking to be cleared, so the first pinch
// clears it and the second does what the cook came to do.
test('acknowledging pre-empts the action the screen would otherwise take', () => {
  const cleared = reduce(takenOver(), ACTIVATE, later(20));
  assert.deepEqual(cleared.timers, []);
  const restarted = reduce(cleared, ACTIVATE, later(20));
  assert.equal(restarted.timers.length, 1);
  assert.equal(restarted.timers[0].endsAt, later(40));
});

test('a pinch in the menu acknowledges a finished timer rather than selecting', () => {
  const abandoned = after([SWIPE_LEFT, SWIPE_LEFT], { from: takenOver(), now: later(20) });
  assert.equal(abandoned.screen, MENU);

  const acknowledged = reduce(abandoned, ACTIVATE, later(20));
  assert.equal(acknowledged.screen, MENU);
  assert.equal(acknowledged.recipeId, null);
  assert.deepEqual(acknowledged.timers, []);
  // And the pinch after it selects, as it would have with nothing signalling.
  assert.equal(reduce(acknowledged, ACTIVATE, later(20)).screen, INGREDIENTS);
});

test('a pinch does not clear a timer that is still counting', () => {
  // Rest ends at later(10), Simmer at later(20). Neither has fired here, and
  // the step the cook is on has no timer left to offer.
  const state = reduce(twoRunning(), ACTIVATE, later(8));
  assert.deepEqual(
    state.timers.map((timer) => timer.label),
    ['Simmer', 'Rest'],
  );
});

// The platform may suspend the page, so a gesture can be the first event to
// arrive after a timer ended. The pinch acknowledges the timer it finds
// finished rather than starting the step's timer over the top of it.
test('a pinch arriving after a timer ended acknowledges it', () => {
  const state = reduce(twoRunning(), ACTIVATE, later(12));
  assert.deepEqual(
    state.timers.map((timer) => timer.label),
    ['Simmer'],
  );
});

// --- Concurrent expiry ----------------------------------------------------
// Two timers finishing close together is the case an alert design loses one
// in. Neither is lost here: the takeover names the one that just fired, every
// fired timer signals in the row, and each is acknowledged on its own pinch.

test('two timers expiring in the same tick are both surfaced', () => {
  const state = reduce(twoRunning(), TICK, later(20));
  assert.deepEqual(
    firedTimers(state).map((timer) => timer.label),
    ['Rest', 'Simmer'],
  );
  assert.equal(alertingTimer(state).label, 'Simmer');
});

test('a second timer expiring after the first takes the display back over', () => {
  const rested = reduce(twoRunning(), TICK, later(10));
  assert.equal(alertingTimer(rested).label, 'Rest');

  const simmered = reduce(rested, TICK, later(20));
  assert.equal(alertingTimer(simmered).label, 'Simmer');
  assert.equal(simmered.alert.since, later(20));
  assert.deepEqual(
    firedTimers(simmered).map((timer) => timer.label),
    ['Rest', 'Simmer'],
  );
});

test('a takeover already up is not restarted by a timer that has not fired', () => {
  const rested = reduce(twoRunning(), TICK, later(10));
  const held = reduce(rested, TICK, secondsAfter(later(10), 5));
  assert.deepEqual(held.alert, rested.alert);
});

test('each of two finished timers is acknowledged by its own pinch', () => {
  const both = reduce(twoRunning(), TICK, later(20));
  const first = reduce(both, ACTIVATE, later(20));
  assert.deepEqual(
    first.timers.map((timer) => timer.label),
    ['Rest'],
  );
  assert.equal(first.alert, null);

  const second = reduce(first, ACTIVATE, later(20));
  assert.deepEqual(second.timers, []);
});

test('acknowledging the takeover leaves the other finished timer signalling', () => {
  const both = reduce(twoRunning(), TICK, later(20));
  const state = reduce(both, ACTIVATE, later(20));
  assert.deepEqual(
    firedTimers(state).map((timer) => timer.label),
    ['Rest'],
  );
});

test('the alert sequence does not mutate the state it advances', () => {
  const running = deepFreeze(simmering());
  const fired = reduce(running, TICK, later(20));
  assert.equal(running.alert, null);
  assert.equal(fired.timers[0].id, running.timers[0].id);
  assert.notEqual(fired.timers[0], running.timers[0]);
});


// --- Hydration ------------------------------------------------------------
// A reload mid-cook is the case this section is about, and on this platform it
// is not an edge case: the glasses may suspend or kill the page at any moment.
// The persisted value is a state carrying the instant it was written, so
// hydration is arithmetic on two timestamps rather than a guess, and the
// decision it takes — resume or discard — is taken here rather than at the
// edge that reads storage.

const HOUR = 60 * MINUTE;

// A session written `hoursAgo` before the clock hydration is given.
const saved = (state, hoursAgo) => ({ ...state, savedAt: NOW - hoursAgo * HOUR });

const hydrate = (persisted, now = NOW) => reduce(persisted, HYDRATE, now);

test('nothing persisted opens the menu', () => {
  assert.deepEqual(hydrate(null), initialState());
});

test('a persisted session returns the cook to their exact step', () => {
  const cooking = after(right(2), { from: onIngredients('alpha') });
  const resumed = hydrate(saved(cooking, 1));
  assert.equal(resumed.screen, STEP);
  assert.equal(resumed.recipeId, 'alpha');
  assert.equal(resumed.position, 2);
  assert.equal(stepIndex(resumed), 1);
});

test('hydration leaves no trace of the write behind in state', () => {
  const resumed = hydrate(saved(onIngredients('alpha'), 1));
  assert.equal('savedAt' in resumed, false);
});

test('a session written just inside six hours is resumed', () => {
  const resumed = hydrate(saved(onIngredients('alpha'), 6));
  assert.equal(resumed.screen, INGREDIENTS);
  assert.equal(resumed.recipeId, 'alpha');
});

test('a session written just outside six hours is discarded', () => {
  const persisted = { ...onIngredients('alpha'), savedAt: NOW - 6 * HOUR - 1 };
  assert.deepEqual(hydrate(persisted), initialState());
});

test('a session written at an instant in the future is discarded', () => {
  assert.deepEqual(hydrate(saved(onIngredients('alpha'), -1)), initialState());
});

test('a session with no record of when it was written is discarded', () => {
  assert.deepEqual(hydrate(onIngredients('alpha')), initialState());
});

test('a hydrated timer reports its remaining time against the real clock', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  // Written the instant it started, hydrated eight minutes later.
  const resumed = hydrate({ ...started, savedAt: NOW }, later(8));
  const [timer] = timersAt(resumed, later(8));
  assert.equal(timer.remainingMs, 12 * MINUTE);
  assert.equal(timer.finished, false);
});

test('a timer whose instant passed while the app was closed reads as fired', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const resumed = hydrate({ ...started, savedAt: NOW }, later(25));
  const [timer] = timersAt(resumed, later(25));
  assert.equal(timer.finished, true);
  assert.equal(timer.remainingMs, 0);
});

test('a hydrated timer is not resurrected with stale time on the clock', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const resumed = hydrate({ ...started, savedAt: NOW }, later(25));
  assert.deepEqual(
    resumed.timers.map((timer) => timer.endsAt),
    started.timers.map((timer) => timer.endsAt),
  );
});

// The escape hatch from an unwanted resume is the navigation that already
// exists, which is only true if a hydrated state moves like any other.
test('left from the ingredients still exits to the menu after a resume', () => {
  const resumed = hydrate(saved(onIngredients('beta'), 1));
  const state = reduce(resumed, SWIPE_LEFT, NOW);
  assert.equal(state.screen, MENU);
  assert.equal(state.recipeId, null);
});

test('a resumed cook walks the flow from where it was left', () => {
  const resumed = hydrate(saved(after(right(2), { from: onIngredients('alpha') }), 1));
  const state = reduce(resumed, SWIPE_RIGHT, NOW);
  assert.equal(state.position, 3);
  assert.equal(stepIndex(state), 2);
});

test('a session naming a recipe the catalogue no longer carries is discarded', () => {
  const persisted = saved({ ...onIngredients('alpha'), recipeId: 'deleted' }, 1);
  assert.deepEqual(hydrate(persisted), initialState());
});

test('a persisted menu keeps the timers running in it', () => {
  const left = [SWIPE_LEFT, SWIPE_LEFT, SWIPE_LEFT];
  const abandoned = after(left, { from: twoRunning(), now: later(5) });
  const resumed = hydrate(saved(abandoned, 1));
  assert.equal(resumed.screen, MENU);
  assert.deepEqual(
    resumed.timers.map((timer) => timer.label),
    ['Simmer', 'Rest'],
  );
});

// A recipe edited between sessions is the ordinary way a persisted position
// stops meaning what it meant, and the flow has to hold anyway.
test('a position past the end of a shortened recipe lands on the completion screen', () => {
  const persisted = saved({ ...onIngredients('beta'), position: 40 }, 1);
  const resumed = hydrate(persisted);
  assert.equal(resumed.screen, DONE);
  assert.equal(resumed.position, BETA.steps.length + 1);
});

test('the screen always agrees with the position a session is resumed at', () => {
  const persisted = saved({ ...onIngredients('alpha'), screen: DONE, position: 1 }, 1);
  assert.equal(hydrate(persisted).screen, STEP);
});

test('a malformed persisted value opens the menu rather than failing', () => {
  for (const persisted of ['', 7, [], { savedAt: NOW }, { ...initialState(), savedAt: 'soon' }]) {
    assert.deepEqual(hydrate(persisted), initialState());
  }
});

test('a timer missing the instant it ends is dropped rather than kept forever', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const persisted = saved({ ...started, timers: [...started.timers, { id: 'junk', label: 'Junk' }] }, 1);
  assert.deepEqual(
    hydrate(persisted).timers.map((timer) => timer.id),
    started.timers.map((timer) => timer.id),
  );
});

test('hydration does not mutate the value it was handed', () => {
  const persisted = deepFreeze(saved(onIngredients('alpha'), 1));
  hydrate(persisted);
  assert.equal(persisted.savedAt, NOW - HOUR);
});

// A timer that fired while the page was not running is the case the whole
// alert sequence exists for, and the platform may kill the page at any moment.
test('a timer that fired while the app was closed takes over on resume', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const resumed = hydrate({ ...started, savedAt: NOW }, later(25));
  assert.equal(alertingTimer(resumed).label, 'Simmer');
  assert.equal(resumed.alert.since, later(25));
});

test('a timer still signalling when the app was closed is still signalling on resume', () => {
  const decayed = after([TICK, TICK], { from: reduce(onTimerStep(), ACTIVATE, NOW), now: later(31) });
  const resumed = hydrate({ ...decayed, savedAt: later(31) }, later(35));
  assert.deepEqual(
    firedTimers(resumed).map((timer) => timer.label),
    ['Simmer'],
  );
  // Already announced, so resuming does not announce it a second time.
  assert.equal(resumed.alert, null);
});

test('a takeover interrupted by a reload finishes decaying on the clock', () => {
  const fired = reduce(reduce(onTimerStep(), ACTIVATE, NOW), TICK, later(20));
  const during = hydrate({ ...fired, savedAt: later(20) }, later(20) + 4000);
  assert.equal(alertingTimer(during).label, 'Simmer');
  const after10 = hydrate({ ...fired, savedAt: later(20) }, later(20) + 10000);
  assert.equal(after10.alert, null);
  assert.deepEqual(
    firedTimers(after10).map((timer) => timer.label),
    ['Simmer'],
  );
});

test('an alert naming a timer that did not survive hydration is discarded', () => {
  const fired = reduce(reduce(onTimerStep(), ACTIVATE, NOW), TICK, later(20));
  const persisted = saved({ ...fired, timers: [] }, 1);
  assert.equal(hydrate(persisted).alert, null);
});

test('a persisted timer with no record of being announced is announced', () => {
  const started = reduce(onTimerStep(), ACTIVATE, NOW);
  const legacy = { ...started, timers: started.timers.map(({ state, ...rest }) => rest) };
  const resumed = hydrate({ ...legacy, savedAt: NOW }, later(25));
  assert.equal(alertingTimer(resumed).label, 'Simmer');
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
