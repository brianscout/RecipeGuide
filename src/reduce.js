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

// A timer's `state` is the one fact about it the clock cannot derive: whether
// the alert has already announced it. Everything else — how long is left,
// whether it is over — is arithmetic on `endsAt`.
//
//   running  counting, or over and not yet announced
//   fired    announced and not yet acknowledged
//
// There is no third value. Acknowledging drops the timer from the list, since
// a timer a cook has dealt with is not a timer.
const RUNNING = 'running';
const FIRED = 'fired';

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
  if (running) return null;

  // A step may name the timer it has to follow — the rice has to finish
  // cooking before it can steam in its own heat, and there is no lifting the
  // salmon out of a marinade that is still marinating.
  //
  // The bar is only that the named timer is not still counting. It is not that
  // it ran: a cook who never started the rice timer is not thereby locked out
  // of the rest of the recipe, and one who started it and let it fire is done
  // waiting whether or not they pinched to clear it. So this catches the
  // mistake — starting a timer for something that cannot have begun yet —
  // without ever leaving a cook with a step they cannot act on at all.
  const waitingFor = counting(state, recipe, step.after, now) ? step.after : null;
  return { sourceStep, label: step.timerLabel, minutes: step.minutes, waitingFor };
}

// Whether the timer a step names as its prerequisite is one of the ones still
// counting. An unknown label counts as nothing to wait for; the validator is
// what makes a label unresolvable a desk failure rather than a silent one.
function counting(state, recipe, label, now) {
  if (label === undefined) return false;
  const index = recipe.steps.findIndex((step) => step.timerLabel === label);
  if (index === -1) return false;
  const sourceStep = sourceStepOf(recipe, index);
  return state.timers.some((timer) => timer.sourceStep === sourceStep && timer.endsAt > now);
}

function startTimer(state, recipes, now) {
  const offer = timerOffer(state, recipes, now);
  // No duration on this step, its timer is already running, or it is waiting on
  // one that is. Returning the same state is what lets the edges skip a redraw.
  if (!offer || offer.waitingFor) return state;

  const endsAt = now + offer.minutes * MINUTE_MS;
  const timer = {
    id: `${offer.sourceStep}@${endsAt}`,
    label: offer.label,
    endsAt,
    sourceStep: offer.sourceStep,
    state: RUNNING,
  };
  return { ...state, timers: [...state.timers, timer] };
}

// --- The alert sequence ---------------------------------------------------
// What happens when a timer reaches zero, in three phases: the takeover, its
// decay, and the signalling that persists after it. See docs/SPEC.md, "Alert
// behaviour".
//
// The decay is the load-bearing part. A takeover that waited to be dismissed
// would stomp on the instruction a cook is halfway through following; an
// indicator alone would silently miss a cook at the stove, which is the
// failure that ruins dinner. Standing down on its own does both jobs: it grabs
// a cook who is not looking at the display, then gets out of the way of one
// who cannot answer yet.
//
// The ticket is the whole of the takeover's state — which timer it names, and
// when it went up. How long it has left is derived from the supplied clock,
// like a countdown, so a takeover interrupted by a reload finishes decaying on
// the clock rather than starting its ten seconds again.

// Long enough to be caught out of the corner of an eye and read; short enough
// that a cook mid-task is not waiting on it. Roughly ten seconds, per spec.
const ALERT_TAKEOVER_MS = 10 * 1000;

/**
 * The timer the takeover is naming, or null when no takeover is up. Rendering
 * asks rather than searching the timer list against the ticket itself.
 *
 * @param {object} state
 * @returns {object | null}
 */
export function alertingTimer(state) {
  if (state.alert === null) return null;
  return state.timers.find((timer) => timer.id === state.alert.timerId) ?? null;
}

/**
 * Every timer that has fired and not been acknowledged, soonest to end first.
 * These are the rows that keep signalling after the takeover stands down, and
 * they signal until a pinch clears them however long that takes.
 *
 * @param {object} state
 * @returns {Array<object>}
 */
export function firedTimers(state) {
  return state.timers.filter((timer) => timer.state === FIRED).sort((a, b) => a.endsAt - b.endsAt);
}

// A timer reaching zero raises the takeover; every timer that reached it marks
// itself announced, so nothing is announced twice and nothing is lost. Where
// two land together the ticket names the last to end, and the one before it is
// already signalling in the row — soonest first, so it leads that row.
function announce(state, now) {
  const expired = state.timers.filter((timer) => timer.state === RUNNING && timer.endsAt <= now);
  if (expired.length === 0) return state;

  const newest = expired.reduce((latest, timer) => (timer.endsAt >= latest.endsAt ? timer : latest));
  return {
    ...state,
    timers: state.timers.map((timer) =>
      expired.includes(timer) ? { ...timer, state: FIRED } : timer,
    ),
    alert: { timerId: newest.id, since: now },
  };
}

// The takeover stands down on its own, with no input and nothing to dismiss.
// The row it returns to is still signalling; that is what does not time out.
function decay(state, now) {
  if (state.alert === null) return state;
  return now - state.alert.since >= ALERT_TAKEOVER_MS ? { ...state, alert: null } : state;
}

// Every event is interpreted against an alert already brought up to date with
// the clock that event arrived on, so a gesture raises and stands down the
// takeover exactly as the tick behind it would have. That is what keeps the
// sequence off the tick interval: the platform's suspension behaviour is an
// open question, and a takeover that only happens where a tick happened would
// be a takeover the platform can suppress.
const advanceAlert = (state, now) => decay(announce(state, now), now);

// A pinch acknowledges before it does anything else the screen would have done
// with it. What it clears is what is asking to be cleared: the timer the
// takeover names while one is up, and otherwise the longest-finished row.
//
// Pre-empting is the point. The alternative — acknowledging only during the
// takeover — leaves a cook whose hands were full with a row they cannot clear
// without finding the step that started it. Returning null when there is
// nothing signalling is what hands the pinch back to the screen.
function acknowledge(state) {
  const target = alertingTimer(state) ?? firedTimers(state)[0];
  if (!target) return null;
  return {
    ...state,
    timers: state.timers.filter((timer) => timer !== target),
    alert: state.alert?.timerId === target.id ? null : state.alert,
  };
}

// Focus cycles among the focusable elements of the current screen. The menu's
// are its recipes; the completion screen's is its one way back to them; the
// ingredients screen has none.
//
// A step has two, and the first of them is the step's own slot: the timer it
// offers, or nothing at all where it carries no duration. That slot is first
// so a pinch with no vertical input keeps meaning exactly what it meant before
// stopping existed — start the timer, or do nothing. Stopping sits second
// because it must never be what an accidental pinch lands on.
const STEP_PRIMARY = 0;
export const STEP_STOP = 1;

function focusableCount(state, recipes) {
  if (state.screen === MENU) return recipes.length;
  if (state.screen === STEP) return 2;
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

// Stopping is not the same thing as leaving. Left from the ingredients backs
// out of a cook and keeps its timers counting, because a cook who wants to
// look something up on the menu has not stopped cooking and a timer that died
// because they navigated is the whole failure this product exists to avoid.
//
// This is the other one: the cook is done with this recipe before the recipe
// is done, and the timers it started are timing nothing. So they go, and the
// takeover or signalling row that any of them raised goes with them — an alert
// naming a timer that no longer exists is worse than no alert.
//
// The abandoned recipe stays focused on the menu, as it does when backing out,
// so stopping something by mistake costs one pinch to resume rather than a
// hunt back down the list.
function stopCooking(state, recipes) {
  const focus = Math.max(
    0,
    recipes.findIndex((recipe) => recipe.id === state.recipeId),
  );
  return { ...initialState(), focus };
}

function activate(state, recipes, now) {
  // A finished timer takes the pinch before the screen does.
  const acknowledged = acknowledge(state);
  if (acknowledged) return acknowledged;

  if (state.screen === DONE) return toMenu(state, recipes);
  // A pinch on a step acts on what is focused. Unfocused — which is where
  // every step starts, since changing position resets focus — that is the
  // timer the step offers and nothing else, exactly as it was before stopping
  // existed. Stopping takes a deliberate swipe to reach first.
  if (state.screen === STEP) {
    return state.focus === STEP_STOP
      ? stopCooking(state, recipes)
      : startTimer(state, recipes, now);
  }
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
//
// Anything but a timer written as already announced comes back running. A
// timer that expired while the page was not running is then announced on the
// clock it is resumed with, which is what tells a cook returning to the app
// that the rice is done.
function hydratedTimers(timers) {
  if (!Array.isArray(timers)) return [];
  return timers
    .filter((timer) => timer !== null && typeof timer === 'object' && Number.isFinite(timer.endsAt))
    .map((timer) => ({ ...timer, state: timer.state === FIRED ? FIRED : RUNNING }));
}

// An alert names the timer it is signalling for and the instant it went up, so
// one whose timer did not survive is not an alert, and neither is one whose
// takeover cannot be timed. A ticket that arrives intact keeps its instant
// rather than being restamped: the takeover has been up since it was written,
// and a reload does not buy it another ten seconds.
function hydratedAlert(alert, timers) {
  if (alert === null || typeof alert !== 'object') return null;
  if (!Number.isFinite(alert.since)) return null;
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

// What the event itself means, before the alert sequence is advanced over the
// result. Kept apart from `reduce` so that advancing the alert is one thing
// that happens on every event rather than a line repeated in seven branches.
function transition(state, event, recipes, now) {
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
    default:
      // A tick moves nothing on its own. A running timer's remaining time is
      // derived from the clock rather than stored, so what a tick is for is
      // the alert sequence advancing over it and the redraw the edge performs
      // around it.
      return state;
  }
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

    // Hydration is handed a value from storage rather than a state, so the
    // alert is advanced over what came back rather than over what went in.
    if (event === HYDRATE) return advanceAlert(hydrate(state, recipes, now), now);

    return transition(advanceAlert(state, now), event, recipes, now);
  };
}
