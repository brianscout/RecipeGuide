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

const reduce = createReduce(recipes);
let state = initialState();
render(root, state, recipes);

document.addEventListener('keydown', (event) => {
  const application = KEYS[event.key];
  if (!application) return;
  event.preventDefault();

  const next = reduce(state, application, Date.now());
  if (next === state) return;
  state = next;
  render(root, state, recipes);
});
