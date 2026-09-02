// The entry point, and the only module that reaches the browser other than the
// three it delegates to. It wires five edges around the pure core: loading
// recipes, translating keydown into events, drawing the resulting state,
// resuming and writing the session either side of it, and buzzing the band at
// the instant a timer fires.
//
// The glasses OS translates the Neural Band and the temple touch strip into
// arrow keys and Enter. Those five keys are the entire input vocabulary, and
// this listener is the whole of the application's input handling.

import { loadRecipes } from './load-recipes.js';
import { pulse } from './haptics.js';
import { readSession, writeSession } from './persist.js';
import { render, renderError } from './render.js';
import {
  createReduce,
  initialState,
  SWIPE_LEFT,
  SWIPE_RIGHT,
  FOCUS_UP,
  FOCUS_DOWN,
  ACTIVATE,
  TICK,
  HYDRATE,
} from './reduce.js';

const KEYS = {
  ArrowLeft: SWIPE_LEFT,
  ArrowRight: SWIPE_RIGHT,
  ArrowUp: FOCUS_UP,
  ArrowDown: FOCUS_DOWN,
  Enter: ACTIVATE,
};

const root = document.getElementById('app');

let recipes;
try {
  recipes = await loadRecipes();
} catch (error) {
  renderError(root, error);
  throw error;
}

// A second is the coarsest interval a countdown reading in seconds can be
// redrawn on and still be right.
const TICK_MS = 1000;

const reduce = createReduce(recipes);

let state = initialState();
let ticking = null;

const draw = () => render(root, state, recipes, Date.now());

// Which takeover is up, if one is. A ticket the application has not seen
// before is a timer that has just fired, and is the one moment the alert has a
// second channel to reach for.
const alertKey = ({ alert }) => (alert === null ? null : `${alert.timerId}@${alert.since}`);

// Takes the state the reducer returned. Persisting and buzzing both belong
// here rather than at the two call sites, because both are consequences of the
// state changing and neither cares which event changed it.
function adopt(next, now) {
  if (next === state) return false;
  const announced = alertKey(next) !== null && alertKey(next) !== alertKey(state);
  state = next;
  // A state change is what a meaningful transition is, so this is every one of
  // them: the position, the recipe, and the timer list are on disk by the time
  // the screen showing them has been drawn. A takeover is written too, so a
  // reload during one resumes into what is left of it.
  writeSession(state, now);
  // At the instant a timer fires, and nowhere else. Whether the band moves is
  // the device pass's answer; see src/haptics.js.
  if (announced) pulse();
  return true;
}

// A countdown's remaining time is derived at the draw rather than held in
// state, so the tick redraws unconditionally where a gesture redraws only on a
// change. What the tick does change is the alert: it is what raises a takeover
// on a screen nobody has touched, and what stands it down ten seconds later.
function tick() {
  const now = Date.now();
  adopt(reduce(state, TICK, now), now);
  draw();
  syncTicking();
}

// The interval runs only while something on screen is moving on its own: a
// countdown to count down, or a takeover to stand down. A device worn on the
// face should not be redrawing a still screen once a second, and a timer left
// signalling for an hour is a still screen — its row pulses in CSS.
function syncTicking() {
  const wanted = state.alert !== null || state.timers.some((timer) => timer.endsAt > Date.now());
  if (wanted === (ticking !== null)) return;
  if (wanted) ticking = setInterval(tick, TICK_MS);
  else {
    clearInterval(ticking);
    ticking = null;
  }
}

// The session the last launch left behind, resumed without asking. There is no
// prompt because there is nothing to ask: HYDRATE has already decided whether
// what storage held is recent enough to mean anything, and returns an opening
// menu where it is not. It goes through the same path a gesture does, so a
// timer that fired while the page was not running announces itself on both
// channels rather than only appearing.
const opened = Date.now();
adopt(reduce(readSession(), HYDRATE, opened), opened);

draw();
// A resumed session can arrive with a timer already counting, so the interval
// is settled from the state rather than from the first gesture.
syncTicking();

document.addEventListener('keydown', (event) => {
  const application = KEYS[event.key];
  if (!application) return;
  event.preventDefault();

  const now = Date.now();
  if (!adopt(reduce(state, application, now), now)) return;
  draw();
  syncTicking();
});
