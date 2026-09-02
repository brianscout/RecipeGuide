// Rendering. An edge: it reads state and writes DOM, decides nothing, and is
// verified by hand at 600 x 600 rather than by unit test.
//
// The whole screen is rebuilt on every change. At this size, with at most a
// handful of rows, a diff would buy nothing and cost a second model of the
// display that could disagree with the first.

import { MENU, INGREDIENTS, STEP, DONE, currentRecipe, stepIndex } from './reduce.js';

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
// header takes is a pixel the content does not get.
function header(label, title) {
  const node = element('header', 'header');
  node.append(element('p', 'eyebrow', label), element('p', 'header__title', title));
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

function menuRow(recipe, focused) {
  const row = element('div', focused ? 'recipe recipe--focused' : 'recipe');
  row.append(
    element('span', 'recipe__title', recipe.title),
    element('span', 'recipe__meta', `${plural(recipe.servings, 'serving')} · ${recipe.totalMinutes} min`),
  );
  return row;
}

function menu(state, recipes) {
  if (recipes.length === 0) {
    return screen(element('p', 'notice', 'No recipes are installed.'));
  }
  const list = element('div', 'menu');
  list.append(...recipes.map((recipe, index) => menuRow(recipe, index === state.focus)));
  return screen(element('p', 'eyebrow', 'Recipes'), list);
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
function ingredients(state, recipes) {
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return unknown('Unknown recipe.');

  const list = element('ul', 'ingredients');
  list.append(...recipe.ingredients.map(ingredientRow));
  return screen(header('Ingredients', recipe.title), list);
}

// The cook screen: one instruction, owning the pane. Nothing is drawn in the
// timer row until timers land, but the row is reserved from the start, because
// its height is part of what the step ceiling was measured against and because
// starting a timer must never reflow the text under a cook's eyes. Progress is
// present but dim, and subordinate.
function step(state, recipes) {
  const recipe = currentRecipe(state, recipes);
  const index = stepIndex(state);
  const instruction = recipe?.steps[index];
  if (!instruction) return unknown('Unknown step.');

  return screen(
    element('p', 'timer'),
    element('p', 'instruction', instruction.text),
    element('p', 'progress', `Step ${index + 1} of ${recipe.steps.length}`),
  );
}

// The end of the flow. Right stops here; left is still the way back into the
// recipe, so a cook who overshot the last step has not lost it.
function done(state, recipes) {
  const recipe = currentRecipe(state, recipes);
  if (!recipe) return unknown('Unknown recipe.');

  return screen(
    element('p', 'eyebrow', 'Finished'),
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
 * Draws the state into the root, replacing whatever was there.
 *
 * @param {HTMLElement} root
 * @param {object} state
 * @param {object[]} recipes
 */
export function render(root, state, recipes) {
  const draw = SCREENS[state.screen];
  root.replaceChildren(
    draw ? draw(state, recipes) : unknown(`No screen for "${state.screen}"`),
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
