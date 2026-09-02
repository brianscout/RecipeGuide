// Rendering. An edge: it reads state and writes DOM, decides nothing, and is
// verified by hand at 600 x 600 rather than by unit test.
//
// The whole screen is rebuilt on every change. At this size, with at most a
// handful of rows, a diff would buy nothing and cost a second model of the
// display that could disagree with the first.

import { MENU, INGREDIENTS } from './reduce.js';

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

// A placeholder until the full linear flow lands. Left returns to the menu, so
// a recipe picked by mistake is not a dead end.
function ingredients(state, recipes) {
  const recipe = recipes.find((candidate) => candidate.id === state.recipeId);
  return screen(
    element('p', 'eyebrow', 'Ingredients'),
    element('h1', 'title', recipe ? recipe.title : 'Unknown recipe'),
    element('p', 'hint', 'Swipe left to return to the menu.'),
  );
}

const SCREENS = {
  [MENU]: menu,
  [INGREDIENTS]: ingredients,
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
    draw ? draw(state, recipes) : screen(element('p', 'notice', `No screen for "${state.screen}"`)),
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
