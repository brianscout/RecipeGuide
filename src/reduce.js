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

// Focus cycles among the focusable elements of the current screen. The menu's
// are its recipes. The ingredients screen has none yet; it grows them when the
// full flow lands.
function focusableCount(state, recipes) {
  return state.screen === MENU ? recipes.length : 0;
}

function moveFocus(state, recipes, step) {
  const count = focusableCount(state, recipes);
  if (count === 0) return state;
  return { ...state, focus: (state.focus + step + count) % count };
}

function activate(state, recipes) {
  if (state.screen !== MENU) return state;
  const recipe = recipes[state.focus];
  if (!recipe) return state;
  // Selecting enters the flow at the ingredients rather than at step one, so
  // that mise en place happens while the cook's hands are still clean.
  return { ...state, screen: INGREDIENTS, recipeId: recipe.id, position: 0, focus: 0 };
}

function swipeLeft(state, recipes) {
  // The menu has no flow position, so horizontal input means nothing there.
  if (state.screen !== INGREDIENTS) return state;
  // Leaving the abandoned recipe focused is what makes backing out of a
  // mistaken pick one gesture rather than two.
  const focus = Math.max(
    0,
    recipes.findIndex((recipe) => recipe.id === state.recipeId),
  );
  return { ...initialState(), timers: state.timers, alert: state.alert, focus };
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
        return swipeLeft(state, recipes);
      default:
        // SWIPE_RIGHT beyond the menu, TICK, and HYDRATE arrive with the
        // tickets that give them meaning: the full flow, timers, and resume.
        return state;
    }
  };
}
