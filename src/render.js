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

// How many timers the row holds at once, and what the offer costs in chips.
// Both are the 520px line these screens are drawn on, measured rather than
// guessed: at this type size the widest timer the corpus can produce —
// "MARINATE 30:00" — is 171px, the offer that starts it is 268px, and the gap
// between two of them is 24px. Two timers and the overflow count come to
// 410px; the offer, one timer, and the count come to 510px. A third of either
// does not fit.
const MAX_TIMERS_SHOWN = 2;
const OFFER_COST = 1;

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
// that starts it. Drawn with the focus bar of a focused menu row, because the
// gesture that operates it is the same gesture.
const offerChip = (offer) =>
  chip('timers__timer timers__timer--offer', `Start ${offer.label}`, `${offer.minutes} min`);

// A finished timer reads as finished. Announcing the moment it expires — the
// takeover, its decay, and acknowledging it — arrives with the alert ticket.
const timerChip = (timer) =>
  chip(
    timer.finished ? 'timers__timer timers__timer--finished' : 'timers__timer',
    timer.label,
    timer.finished ? 'done' : countdown(timer.remainingMs),
  );

function timers(state, recipes, now) {
  const running = timersAt(state, now);
  const offer = timerOffer(state, recipes, now);
  if (running.length === 0 && !offer) return null;

  // Soonest first, so what the row drops is the timer furthest from needing
  // attention. What does not fit is counted rather than left out: content
  // hidden with no sign of it is the one failure this display cannot afford.
  const shown = running.slice(0, MAX_TIMERS_SHOWN - (offer ? OFFER_COST : 0));
  const node = element('div', 'timers');
  if (offer) node.append(offerChip(offer));
  node.append(...shown.map(timerChip));
  if (running.length > shown.length) {
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
  return screen(timers(state, recipes, now) ?? element('p', 'eyebrow', 'Recipes'), list);
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
  const label = timers(state, recipes, now) ?? element('p', 'eyebrow', 'Ingredients');
  return screen(header(label, recipe.title), list);
}

// The cook screen: one instruction, owning the pane. The timer row is reserved
// whether or not anything is in it, because its height is part of what the
// step ceiling was measured against and because starting a timer must never
// reflow the text under a cook's eyes. Progress is present but dim, and
// subordinate.
function step(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  const index = stepIndex(state);
  const instruction = recipe?.steps[index];
  if (!instruction) return unknown('Unknown step.');

  const row = element('div', 'timer');
  const live = timers(state, recipes, now);
  if (live) row.append(live);

  return screen(
    row,
    element('p', 'instruction', instruction.text),
    element('p', 'progress', `Step ${index + 1} of ${recipe.steps.length}`),
  );
}

// The end of the flow. Right stops here; left is still the way back into the
// recipe, so a cook who overshot the last step has not lost it.
function done(state, recipes, now) {
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return unknown('Unknown recipe.');

  return screen(
    timers(state, recipes, now) ?? element('p', 'eyebrow', 'Finished'),
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
  root.replaceChildren(
    draw ? draw(state, recipes, now) : unknown(`No screen for "${state.screen}"`),
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
