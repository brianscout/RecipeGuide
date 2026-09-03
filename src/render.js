// Rendering. An edge: it reads state and writes DOM, decides nothing, and is
// verified by hand at 600 x 600 rather than by unit test.
//
// The whole screen is rebuilt on every change. At this size, with at most a
// handful of rows, a diff would buy nothing and cost a second model of the
// display that could disagree with the first.

import {
  MENU,
  INGREDIENTS,
  STEP,
  DONE,
  currentRecipe,
  stepIndex,
  timersAt,
  timerOffer,
  alertingTimer,
  firedTimers,
  STEP_STOP,
} from './reduce.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function screen(...children) {
  const node = element('main', 'screen');
  node.append(...children);
  return node;
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// What screen this is, small and dim, alongside what is being cooked. One row:
// the list or the instruction underneath is the content, and every pixel the
// header takes is a pixel the content does not get. The leading half is a node
// rather than a string because the timer indicator takes it while anything is
// running — see `timers` below.
function header(leading, title) {
  const node = element('header', 'header');
  node.append(leading, element('p', 'header__title', title));
  return node;
}

// The one focusable control on a screen that has one. Drawn with the same bar,
// brightness, and weight as a focused menu row, because the gesture that
// operates it is the same gesture.
function action(label) {
  return element('p', 'action action--focused', label);
}

function unknown(what) {
  return screen(element('p', 'notice', what));
}

// --- The timer indicator --------------------------------------------------
// It takes the top row of whatever screen is drawn, and is absent entirely
// when nothing is running: the common case, a step with no timer, gives the
// whole pane to the instruction.
//
// Taking that row rather than adding one is the point. Every screen already
// has a top row — the menu's label, the ingredients header, the reserved timer
// row on a step, the completion screen's label — and on each of them it is the
// dimmest thing there. Adding a row instead would come out of the pane
// underneath, and both of those panes are measured ceilings: a running timer
// would silently cost the longest ingredient list its last row and the longest
// instruction its last line. See MAX_INGREDIENTS and MAX_STEP_CHARS in
// src/validate-recipe.js.

// Every running timer is on screen, because a timer a cook cannot see is a
// timer they are keeping in their head, which is the thing this application
// exists to stop.
//
// What makes that fit on a 520px line is two decisions, both measured against
// the widest the row can ever be: every label the corpus can produce at its
// longest, every countdown reading ten minutes or more, where the digits are
// widest.
//
// The offer that starts a timer is not in this row at all. It costs 268px —
// three running timers' worth of room, given to something that is not yet a
// timer — so it sits in the footer instead.
//
// And the labels shorten when the row gets crowded. Three full-label timers
// come to 501px; a fourth takes them to 678px, and cut to three characters the
// four come to 498px. Five never fits, at any gap or label length: 622px, over
// by a hundred rather than by a font metric. That is the cliff
// MAX_CONCURRENT_TIMERS in src/validate-recipe.js enforces at the desk, and
// what is below is the failsafe for a session written before it existed — the
// row counts what it cannot draw rather than dropping it silently.
const MAX_TIMERS_SHOWN = 4;

// Where full labels stop fitting. Below this the row says "MARINATE"; at it
// and above, "MAR" — a name a cook can still tell from the other three, which
// is all the row has to do while nothing has finished.
const SHORT_LABEL_FROM = 4;
const SHORT_LABEL_CHARS = 3;

const pad = (value) => String(value).padStart(2, '0');

// Minutes and seconds all the way up, rather than growing an hours field: an
// hour is already past what a step on this display asks a cook to wait for,
// and "75:00" needs no interpretation from someone holding a pan. Rounded up
// so that a timer just started reads its full length rather than a second
// short of it.
function countdown(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

function chip(className, label, value) {
  const node = element('div', className);
  node.append(element('span', 'timers__label', label), element('span', 'timers__value', value));
  return node;
}

// What a step offers before it is started: its length, and the one gesture
// that starts it. Drawn in the footer at the footer's scale, wearing the bar of
// a focused menu row because the gesture that operates it is the same gesture.
//
// It is only ever drawn focused. A step's focus starts here, and the one place
// focus can move to — stopping — takes the whole footer when it gets there, so
// there is never a moment where this is on screen without the pinch belonging
// to it.
const offerChip = (offer) =>
  chip('offer', `Start ${offer.label}`, `${offer.minutes} min`);

// A finished timer reads as finished, and keeps reading that way until a pinch
// clears it: the brightest thing in the row, and the only moving thing on the
// screen. This is what the takeover decays into, and it does not time out.
//
// It also keeps its full name however crowded the row is. It is the one a cook
// has to act on, and "MAS" is a poor thing to read when something is burning.
const timerChip = (timer, short) =>
  chip(
    timer.finished ? 'timers__timer timers__timer--finished' : 'timers__timer',
    short && !timer.finished ? timer.label.slice(0, SHORT_LABEL_CHARS) : timer.label,
    timer.finished ? 'done' : countdown(timer.remainingMs),
  );

function timers(state, now) {
  const running = timersAt(state, now);
  if (running.length === 0) return null;

  // Soonest first, so what a row past the ceiling drops is the timer furthest
  // from needing attention. What does not fit is counted rather than left out:
  // content hidden with no sign of it is the one failure this display cannot
  // afford.
  //
  // The count costs a timer's place rather than being squeezed in beside four
  // of them. Four and a count come to 542px of the 520px line, which clips the
  // count itself — the one thing in the row that must never be clipped, since
  // it is what says the row is incomplete. Three and a count come to 411px.
  const overflowing = running.length > MAX_TIMERS_SHOWN;
  const shown = running.slice(0, overflowing ? MAX_TIMERS_SHOWN - 1 : MAX_TIMERS_SHOWN);

  const node = element('div', 'timers');
  const short = overflowing || shown.length >= SHORT_LABEL_FROM;
  node.append(...shown.map((timer) => timerChip(timer, short)));
  if (overflowing) {
    node.append(element('span', 'timers__more', `+${running.length - shown.length}`));
  }
  return node;
}

function menuRow(recipe, focused) {
  const row = element('div', focused ? 'recipe recipe--focused' : 'recipe');
  row.append(
    element('span', 'recipe__title', recipe.title),
    element('span', 'recipe__meta', `${plural(recipe.servings, 'serving')} · ${recipe.totalMinutes} min`),
  );
  return row;
}

function menu(state, recipes, now) {
  if (recipes.length === 0) {
    return screen(element('p', 'notice', 'No recipes are installed.'));
  }
  const list = element('div', 'menu');
  list.append(...recipes.map((recipe, index) => menuRow(recipe, index === state.focus)));
  return screen(timers(state, now) ?? element('p', 'eyebrow', 'Recipes'), list);
}

function ingredientRow({ quantity, item }) {
  const row = element('li', 'ingredient');
  row.append(
    element('span', 'ingredient__quantity', quantity),
    element('span', 'ingredient__item', item),
  );
  return row;
}

// Mise en place, at position zero, while the cook's hands are still clean. The
// whole list is on screen at once: nothing scrolls, and a validated recipe is
// short enough to fit. See MAX_INGREDIENTS in src/validate-recipe.js.
function ingredients(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return unknown('Unknown recipe.');

  const list = element('ul', 'ingredients');
  list.append(...recipe.ingredients.map(ingredientRow));
  const label = timers(state, now) ?? element('p', 'eyebrow', 'Ingredients');
  return screen(header(label, recipe.title), list);
}

// Progress, and the timer the step offers where it has one. Both are dim and
// subordinate to the instruction above them, and both share one row: a second
// row would come out of the instruction's pane, which is a measured ceiling.
function footer(state, recipes, now, index, recipe) {
  const node = element('p', 'progress');
  node.append(element('span', 'progress__step', `Step ${index + 1} of ${recipe.steps.length}`));

  const offer = timerOffer(state, recipes, now);
  // A step waiting on another timer says what it is waiting for, dim and
  // without a bar. A control that looks operable and then ignores a pinch is
  // the worst thing to put on a display a cook glances at; two words that name
  // the thing they are waiting for is information they can act on.
  if (offer?.waitingFor) {
    node.append(element('span', 'waiting', `After ${offer.waitingFor}`));
  } else if (offer) {
    node.append(offerChip(offer));
  }
  return node;
}

// The cook screen: one instruction, owning the pane. The timer row is reserved
// whether or not anything is in it, because its height is part of what the
// step ceiling was measured against and because starting a timer must never
// reflow the text under a cook's eyes.
function step(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  const index = stepIndex(state);
  const instruction = recipe?.steps[index];
  if (!instruction) return unknown('Unknown step.');

  const row = element('div', 'timer');
  const live = timers(state, now);
  if (live) row.append(live);

  // Everything other than the instruction and the running timers lives in one
  // 28px footer, and nothing here ever adds a second row. The instruction pane
  // is what MAX_STEP_CHARS was measured against, so a row that grew the screen
  // would quietly cost the longest instruction its last line.
  //
  // Focused on stopping, the footer is that and nothing else. Otherwise it is
  // how far through the recipe the cook is, plus the timer this step offers if
  // it carries one — which is why the indicator above can be given over
  // entirely to timers that are actually running.
  return screen(
    row,
    element('p', 'instruction', instruction.text),
    state.focus === STEP_STOP
      ? element('p', 'progress progress--stop', 'Stop cooking')
      : footer(state, recipes, now, index, recipe),
  );
}

// The end of the flow. Right stops here; left is still the way back into the
// recipe, so a cook who overshot the last step has not lost it.
function done(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return unknown('Unknown recipe.');

  return screen(
    timers(state, now) ?? element('p', 'eyebrow', 'Finished'),
    element('h1', 'title', recipe.title),
    element('p', 'hint', `${plural(recipe.steps.length, 'step')}, done.`),
    action('Back to the recipes'),
  );
}

const SCREENS = {
  [MENU]: menu,
  [INGREDIENTS]: ingredients,
  [STEP]: step,
  [DONE]: done,
};

// --- The alert takeover ---------------------------------------------------
// A finished timer replaces the whole display rather than taking a corner of
// it, because a cook who is looking at a pan is not reading the corners. It
// names the timer that fired: two countdowns running means "a timer finished"
// is not enough to act on.
//
// Nothing here dismisses it. The takeover stands down on the clock, ten
// seconds in, and the pinch it offers acknowledges the timer for good — which
// is the difference between getting out of a cook's way and being forgotten.
// Where a second timer has fired too, it is named as well, so the pinch that
// clears this one is not a surprise.
function takeover(state) {
  const timer = alertingTimer(state);
  if (!timer) return null;

  const also = firedTimers(state).filter((fired) => fired.id !== timer.id);
  const node = element('main', 'screen screen--alert');
  node.append(
    element('p', 'eyebrow', 'Timer finished'),
    element('h1', 'alert', timer.label),
    element('p', 'alert__hint', 'Pinch to clear'),
  );
  if (also.length > 0) {
    const labels = also.map((fired) => fired.label).join(', ');
    node.append(element('p', 'alert__also', `${labels} finished too`));
  }
  return node;
}

/**
 * Draws the state into the root, replacing whatever was there. The clock is an
 * argument here for the same reason it is one in the reducer: a timer's
 * remaining time is derived from it rather than stored, so a redraw is what
 * makes a countdown count down.
 *
 * @param {HTMLElement} root
 * @param {object} state
 * @param {object[]} recipes
 * @param {number} now
 */
export function render(root, state, recipes, now) {
  const draw = SCREENS[state.screen];
  // The takeover is drawn over whatever the state's screen would have been,
  // and the state underneath it is untouched: when it stands down, the cook is
  // back on the instruction they were reading, at the position they were at.
  root.replaceChildren(
    takeover(state) ??
      (draw ? draw(state, recipes, now) : unknown(`No screen for "${state.screen}"`)),
  );
}

/**
 * Draws a failure. The glasses have no console, so a broken load has to
 * announce itself on the display or it does not announce itself at all.
 *
 * @param {HTMLElement} root
 * @param {Error} error
 */
export function renderError(root, error) {
  root.replaceChildren(
    screen(element('p', 'eyebrow', 'Failed to start'), element('p', 'notice', error.message)),
  );
}
