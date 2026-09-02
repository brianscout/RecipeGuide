// The entry point, and the only module that touches the browser directly.
// It wires three edges around the pure core: loading recipes, translating
// keydown into events, and drawing the resulting state.
//
// The glasses OS translates the Neural Band and the temple touch strip into
// arrow keys and Enter. Those five keys are the entire input vocabulary, and
// this listener is the whole of the application's input handling.

import { loadRecipes } from './load-recipes.js';
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

// Nothing in state changes as a second passes — a timer holds the instant it
// ends, and its remaining time is derived at the draw — so the tick redraws
// unconditionally where a gesture redraws only on a change.
function tick() {
  state = reduce(state, TICK, Date.now());
  draw();
  syncTicking();
}

// The interval runs only while there is a countdown to count down. A device
// worn on the face should not be redrawing a still screen once a second.
function syncTicking() {
  const wanted = state.timers.length > 0;
  if (wanted === (ticking !== null)) return;
  if (wanted) ticking = setInterval(tick, TICK_MS);
  else {
    clearInterval(ticking);
    ticking = null;
  }
}

draw();

document.addEventListener('keydown', (event) => {
  const application = KEYS[event.key];
  if (!application) return;
  event.preventDefault();

  const next = reduce(state, application, Date.now());
  if (next === state) return;
  state = next;
  draw();
  syncTicking();
});
