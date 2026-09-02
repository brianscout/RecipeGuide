// Recipe loading. An edge: it fetches, so it is not unit tested. Everything it
// decides is delegated to the pure validator next door.
//
// Static hosting cannot list a directory, so the running order of the menu is
// recipes/index.json — an array of recipe ids, each naming a sibling file. A
// test asserts that the manifest and the folder agree, so a recipe that is
// added and not listed fails at the desk rather than quietly never appearing.

import { assertValidRecipe } from './validate-recipe.js';

const RECIPES = 'recipes/';

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Every recipe on offer, in menu order, each one validated. Throws on the
 * first malformed recipe: a step that would be clipped on the glasses is an
 * authoring error, and the loud failure is the point of the validator.
 *
 * @param {string} [base] directory holding index.json and the recipe files
 * @returns {Promise<object[]>}
 */
export async function loadRecipes(base = RECIPES) {
  const ids = await fetchJson(`${base}index.json`);
  if (!Array.isArray(ids)) throw new Error(`${base}index.json: expected an array of recipe ids`);

  return Promise.all(
    ids.map(async (id) => {
      const recipe = assertValidRecipe(await fetchJson(`${base}${id}.json`));
      if (recipe.id !== id) {
        throw new Error(`${base}${id}.json: declares the id "${recipe.id}"`);
      }
      return recipe;
    }),
  );
}
