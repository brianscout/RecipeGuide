// The application's pure core. Every navigation, focus, timer, and resume
// decision is taken here, and nothing else in the repository takes one.
//
// Two properties are load-bearing rather than stylistic, and both come from
// docs/SPEC.md, "State and events":
//
//   - State is a single serializable value. That is what lets a session be
//     written to storage and rehydrated without a translation layer.
//   - The current time arrives as an argument and is never read from inside.
//     That is what makes a twenty minute countdown, a ten second alert decay,
//     and a six hour session expiry testable as synchronous assertions.
//
// Keyboard listening, rendering, persistence, and the tick interval are I/O
// performed at the edges around this function. See src/main.js.

export const MENU = 'menu';
export const INGREDIENTS = 'ingredients';
export const STEP = 'step';
export const DONE = 'done';

// The five platform inputs, plus the two events the edges raise on their own.
// The glasses translate the Neural Band and the temple touch strip into arrow
// keys and Enter; there is nothing else to listen for.
export const SWIPE_LEFT = 'SWIPE_LEFT';
export const SWIPE_RIGHT = 'SWIPE_RIGHT';
export const FOCUS_UP = 'FOCUS_UP';
export const FOCUS_DOWN = 'FOCUS_DOWN';
export const ACTIVATE = 'ACTIVATE';
export const TICK = 'TICK';
export const HYDRATE = 'HYDRATE';

const EVENTS = [SWIPE_LEFT, SWIPE_RIGHT, FOCUS_UP, FOCUS_DOWN, ACTIVATE, TICK, HYDRATE];

/**
 * The state of a session that has just opened: the menu, nothing chosen.
 *
 * @returns {object}
 */
export function initialState() {
  return {
    screen: MENU,
    recipeId: null,
    position: 0,
    focus: 0,
    timers: [],
    alert: null,
  };
}

// A recipe is a linear sequence of positions on one horizontal axis:
//
//   0            the ingredients
//   1 .. N       step 1 .. step N
//   N + 1        done
//
// Ingredients sit at position zero rather than the flow entering at step one:
// it gives a mise en place screen at the moment the cook's hands are still
// clean, and it puts a buffer between a stray left swipe and abandoning a cook.
//
// `screen` is derived from the position rather than tracked beside it, so the
// two cannot drift into disagreeing about where the cook is.
const INGREDIENTS_POSITION = 0;

const donePosition = (recipe) => recipe.steps.length + 1;

function screenAt(position, recipe) {
  if (position === INGREDIENTS_POSITION) return INGREDIENTS;
  return position <= recipe.steps.length ? STEP : DONE;
}

// Arriving at a position is one thing wherever it is arrived from: the
// position, the screen it implies, and nothing focused yet. Going through here
// is what keeps the screen derived rather than set by hand in two places.
function at(state, recipe, position) {
  return { ...state, screen: screenAt(position, recipe), position, focus: 0 };
}

/**
 * The recipe the cook is inside, or null in the menu. Rendering asks rather
 * than searching the catalogue on its own.
 *
 * @param {object} state
 * @param {Array<{ id: string }>} recipes
 * @returns {object | null}
 */
export function currentRecipe(state, recipes) {
  return recipes.find((recipe) => recipe.id === state.recipeId) ?? null;
}

/**
 * The index into `recipe.steps` of the instruction on screen, or -1 when the
 * current position is not a step. The flow's arithmetic lives here and is not
 * repeated at the edges.
 *
 * @param {object} state
 * @returns {number}
 */
export function stepIndex(state) {
  return state.screen === STEP ? state.position - 1 : -1;
}

// Focus cycles among the focusable elements of the current screen. The menu's
// are its recipes; the completion screen's is its one way back to them. The
// ingredients and the step screens have none — the step screen grows its
// secondary actions when timers land.
function focusableCount(state, recipes) {
  if (state.screen === MENU) return recipes.length;
  return state.screen === DONE ? 1 : 0;
}

function moveFocus(state, recipes, step) {
  const count = focusableCount(state, recipes);
  // Nothing to cycle through, and cycling among one is standing still. Both
  // return the same state so that the edges can skip a redraw.
  if (count < 2) return state;
  return { ...state, focus: (state.focus + step + count) % count };
}

// Leaving the recipe focused is what makes backing out of a mistaken pick — or
// starting the next cook after finishing one — a single gesture rather than a
// hunt back down the list.
function toMenu(state, recipes) {
  const focus = Math.max(
    0,
    recipes.findIndex((recipe) => recipe.id === state.recipeId),
  );
  return { ...initialState(), timers: state.timers, alert: state.alert, focus };
}

function activate(state, recipes) {
  if (state.screen === DONE) return toMenu(state, recipes);
  if (state.screen !== MENU) return state;
  const recipe = recipes[state.focus];
  if (!recipe) return state;
  // Selecting enters the flow at the ingredients rather than at step one.
  return at({ ...state, recipeId: recipe.id }, recipe, INGREDIENTS_POSITION);
}

// Horizontal input moves position in the flow, and means that on every screen
// in it. The cook must be able to advance a step without first working out
// which screen they are on.
function move(state, recipes, delta) {
  // The menu has no flow position, so horizontal input means nothing there.
  if (state.screen === MENU) return state;
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return state;

  const position = state.position + delta;
  // Left off the front of the flow is the one exit from a cook.
  if (position < INGREDIENTS_POSITION) return toMenu(state, recipes);
  // Right off the end is not: the completion screen is where the recipe stops.
  if (position > donePosition(recipe)) return state;

  return at(state, recipe, position);
}

/**
 * Binds a reducer to the recipes on offer. The catalogue is fetched at the
 * edge and never changes during a session, so it is closed over rather than
 * carried in state: state stays exactly the serializable value the spec
 * describes, and the reducer keeps the `(state, event, now)` signature.
 *
 * @param {Array<{ id: string }>} recipes
 * @returns {(state: object, event: string, now: number) => object}
 */
export function createReduce(recipes) {
  return function reduce(state, event, now) {
    // An event outside the vocabulary is a typo at the edge, and the device
    // has no console to discover it in. Fail at the desk instead.
    if (!EVENTS.includes(event)) throw new Error(`Unknown event: ${event}`);

    switch (event) {
      case FOCUS_UP:
        return moveFocus(state, recipes, -1);
      case FOCUS_DOWN:
        return moveFocus(state, recipes, +1);
      case ACTIVATE:
        return activate(state, recipes);
      case SWIPE_LEFT:
        return move(state, recipes, -1);
      case SWIPE_RIGHT:
        return move(state, recipes, +1);
      default:
        // TICK and HYDRATE arrive with the tickets that give them meaning:
        // timers and resume.
        return state;
    }
  };
}
