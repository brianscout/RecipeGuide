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

// --- Timers ---------------------------------------------------------------
// Timers are global rather than scoped to the step that started them. Start a
// simmer at step three, walk forward to step six to prep a garnish, and the
// simmer is still counting. A timer that died on a swipe would put the cook
// back to tracking time in their head, which is the thing that sends them to
// a phone.
//
// Each timer stores the absolute instant it ends and never a decrementing
// counter, so remaining time is derived by subtracting the supplied clock.
// That is what makes a timer correct across a reload or any suspension the
// platform imposes without the application having to detect that either
// happened — and the platform's suspension behaviour is an open question.

const MINUTE_MS = 60 * 1000;

// A timer outlives the recipe it was started in, so what started it has to
// name the recipe as well as the step: two recipes both carrying a timer at
// step three must not be mistaken for one another.
const sourceStepOf = (recipe, index) => `${recipe.id}:${index}`;

/**
 * Every timer with its remaining time derived from `now`, soonest to end
 * first, so the one nearest to needing attention leads the indicator.
 *
 * A finished timer stays in the list and simply reads as finished. What
 * happens on the instant it expires — the takeover, its decay, and being
 * acknowledged — arrives with the alert ticket, and is the one part of a
 * timer that the clock cannot derive.
 *
 * @param {object} state
 * @param {number} now
 * @returns {Array<{ id: string, label: string, endsAt: number, remainingMs: number, finished: boolean }>}
 */
export function timersAt(state, now) {
  return state.timers
    .map((timer) => ({
      ...timer,
      // Overdue is overdue: a countdown never goes negative.
      remainingMs: Math.max(0, timer.endsAt - now),
      finished: timer.endsAt <= now,
    }))
    .sort((a, b) => a.endsAt - b.endsAt);
}

/**
 * The timer the current step offers, or null where there is none to offer.
 * A step carrying a duration offers one, unless the timer it already started
 * is still running — a second identical pasta timer from a stray pinch is a
 * nuisance, and a spent one is worth being able to start again.
 *
 * @param {object} state
 * @param {Array<object>} recipes
 * @param {number} now
 * @returns {{ sourceStep: string, label: string, minutes: number } | null}
 */
export function timerOffer(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  const index = stepIndex(state);
  const step = index === -1 ? undefined : recipe?.steps[index];
  if (!step?.minutes) return null;

  const sourceStep = sourceStepOf(recipe, index);
  const running = state.timers.some((timer) => timer.sourceStep === sourceStep && timer.endsAt > now);
  return running ? null : { sourceStep, label: step.timerLabel, minutes: step.minutes };
}

function startTimer(state, recipes, now) {
  const offer = timerOffer(state, recipes, now);
  // No duration on this step, or its timer is already running. Returning the
  // same state is what lets the edges skip a redraw.
  if (!offer) return state;

  const endsAt = now + offer.minutes * MINUTE_MS;
  const timer = {
    id: `${offer.sourceStep}@${endsAt}`,
    label: offer.label,
    endsAt,
    sourceStep: offer.sourceStep,
  };
  return { ...state, timers: [...state.timers, timer] };
}

// Focus cycles among the focusable elements of the current screen. The menu's
// are its recipes; the completion screen's is its one way back to them. The
// ingredients screen has none, and a step has at most one — the timer it
// offers — so there is never anything for vertical input to move to.
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

function activate(state, recipes, now) {
  if (state.screen === DONE) return toMenu(state, recipes);
  // The one action a step ever offers is the timer it carries, so a pinch
  // there means starting it and means nothing else.
  if (state.screen === STEP) return startTimer(state, recipes, now);
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

// --- Hydration ------------------------------------------------------------
// A reload mid-cook is not an edge case here: the platform's suspension
// behaviour is an open question, and the glasses may kill the page at any
// moment. So a session is written to storage on every transition and picked up
// again on load, with no resume prompt — making the cook perform a gesture to
// get back to a place the application already knows is the friction this
// product exists to remove.
//
// The persisted value is a state carrying one extra field: the instant it was
// written. That is what lets the edge that reads storage stay a parser and
// nothing more — it hands what it read straight to HYDRATE, and the decision
// to resume or to discard is taken here with the rest of them. Hydration
// consumes that field, so nothing downstream ever sees it.

// Long enough to survive a slow braise, short enough that yesterday's dinner
// never ambushes the cook at breakfast.
const SESSION_MAX_AGE_MS = 6 * 60 * MINUTE_MS;

// A session is worth resuming when it was written by this application, within
// the window, and not at an instant the clock has yet to reach. A missing or
// unparseable `savedAt` makes the age NaN, which is neither, so a value from
// some other writer is discarded by the same arithmetic as a stale one.
function resumable(persisted, now) {
  if (persisted === null || typeof persisted !== 'object' || Array.isArray(persisted)) return false;
  const age = now - persisted.savedAt;
  return age >= 0 && age <= SESSION_MAX_AGE_MS;
}

// Timers are rebuilt rather than trusted: a timer without the instant it ends
// cannot have its remaining time derived, and one kept anyway would read as
// finished forever with no way to be cleared.
function hydratedTimers(timers) {
  if (!Array.isArray(timers)) return [];
  return timers.filter(
    (timer) => timer !== null && typeof timer === 'object' && Number.isFinite(timer.endsAt),
  );
}

// An alert names the timer it is signalling for, so one whose timer did not
// survive is not an alert.
function hydratedAlert(alert, timers) {
  if (alert === null || typeof alert !== 'object') return null;
  return timers.some((timer) => timer.id === alert.timerId) ? alert : null;
}

const clamp = (value, max) => Math.min(Math.max(Number.isInteger(value) ? value : 0, 0), max);

function hydrate(persisted, recipes, now) {
  if (!resumable(persisted, now)) return initialState();

  const timers = hydratedTimers(persisted.timers);
  const resumed = { ...initialState(), timers, alert: hydratedAlert(persisted.alert, timers) };

  // A session abandoned to the menu is still worth resuming: its timers are
  // running, and the recipe last cooked stays focused.
  const recipe = currentRecipe(persisted, recipes);
  if (!recipe) {
    // Either nothing was chosen, or the recipe has left the catalogue since.
    // A position into a recipe that no longer exists means nothing, and the
    // rest of the session is a fragment of it, so that one starts over.
    if (persisted.recipeId != null) return initialState();
    const focus = recipes.length === 0 ? 0 : clamp(persisted.focus, recipes.length - 1);
    return { ...resumed, focus };
  }

  // Recipes are edited between sessions, so a persisted position can name a
  // step that is no longer there. Landing on the completion screen is the
  // truthful answer and needs no new affordance: left walks back into the
  // recipe as it now stands.
  const position = clamp(persisted.position, donePosition(recipe));
  return at({ ...resumed, recipeId: recipe.id }, recipe, position);
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
        return activate(state, recipes, now);
      case SWIPE_LEFT:
        return move(state, recipes, -1);
      case SWIPE_RIGHT:
        return move(state, recipes, +1);
      case HYDRATE:
        return hydrate(state, recipes, now);
      default:
        // A tick moves nothing here. A running timer's remaining time is
        // derived from the clock rather than stored, so what a tick is for is
        // the redraw the edge performs around it. It gains work of its own
        // with the alert ticket.
        return state;
    }
  };
}
