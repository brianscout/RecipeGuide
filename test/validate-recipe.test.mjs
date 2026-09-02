import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  MAX_STEP_CHARS,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_CHARS,
  validateRecipe,
  assertValidRecipe,
} from '../src/validate-recipe.js';

const RECIPES_DIR = fileURLToPath(new URL('../recipes/', import.meta.url));

function recipe(overrides = {}) {
  return {
    id: 'test-recipe',
    title: 'Test Recipe',
    servings: 2,
    totalMinutes: 20,
    ingredients: [{ quantity: '2 tbsp', item: 'olive oil' }],
    steps: [{ text: 'Heat the oil in a wide pan over medium heat.' }],
    ...overrides,
  };
}

function errorsFor(value) {
  return validateRecipe(value);
}

function onlyError(value) {
  const errors = errorsFor(value);
  assert.equal(errors.length, 1, `expected one error, got: ${errors.join(' | ')}`);
  return errors[0];
}

test('a well-formed recipe produces no errors', () => {
  assert.deepEqual(validateRecipe(recipe()), []);
});

// index.json is the menu's running order, not a recipe. Every other file in
// the folder is one.
async function recipeFiles() {
  const files = await readdir(RECIPES_DIR);
  return files.filter((name) => name.endsWith('.json') && name !== 'index.json');
}

const readJson = async (file) => JSON.parse(await readFile(RECIPES_DIR + file, 'utf8'));

test('every recipe shipped in the repository is valid', async () => {
  const files = await recipeFiles();
  assert.ok(files.length > 0, 'no recipes found to validate');
  for (const file of files) {
    assert.deepEqual(validateRecipe(await readJson(file)), [], `${file} is invalid`);
  }
});

// Static hosting cannot list a directory, so the menu reads this manifest
// instead. A recipe added to the folder and forgotten here would simply never
// appear on the glasses, with nothing to notice at the desk.
test('the manifest lists exactly the recipes in the folder', async () => {
  const listed = await readJson('index.json');
  const present = (await recipeFiles()).map((file) => file.replace(/\.json$/, ''));
  assert.deepEqual([...listed].sort(), present.sort());
});

test('each manifest entry matches the id inside its recipe', async () => {
  for (const id of await readJson('index.json')) {
    assert.equal((await readJson(`${id}.json`)).id, id);
  }
});

test('a step exactly at the ceiling fits', () => {
  const text = 'x'.repeat(MAX_STEP_CHARS);
  assert.deepEqual(validateRecipe(recipe({ steps: [{ text }] })), []);
});

test('over-length step text is rejected, naming the recipe and the step', () => {
  const text = 'x'.repeat(MAX_STEP_CHARS + 1);
  const message = onlyError(recipe({ steps: [{ text: 'Fine.' }, { text }] }));
  assert.match(message, /test-recipe/);
  assert.match(message, /steps\[1\]\.text/);
  assert.match(message, new RegExp(String(MAX_STEP_CHARS + 1)));
  assert.match(message, new RegExp(String(MAX_STEP_CHARS)));
});

// The ingredients screen does not scroll either, and both of its ceilings are
// measured by scripts/measure-ingredients-ceiling.html: one on how many rows
// the pane holds, one on how wide a row can be before it wraps onto a second.

// A quantity and an item, together `chars` long counting the space between.
function ingredientOf(chars) {
  return { quantity: '1 tsp', item: 'x'.repeat(chars - '1 tsp'.length - 1) };
}

test('an ingredient line exactly at the ceiling fits', () => {
  const ingredients = [ingredientOf(MAX_INGREDIENT_CHARS)];
  assert.deepEqual(validateRecipe(recipe({ ingredients })), []);
});

test('an over-wide ingredient is rejected, naming the recipe and the ingredient', () => {
  const ingredients = [ingredientOf(MAX_INGREDIENT_CHARS), ingredientOf(MAX_INGREDIENT_CHARS + 1)];
  const message = onlyError(recipe({ ingredients }));
  assert.match(message, /test-recipe/);
  assert.match(message, /ingredients\[1\]/);
  assert.match(message, new RegExp(String(MAX_INGREDIENT_CHARS + 1)));
  assert.match(message, new RegExp(String(MAX_INGREDIENT_CHARS)));
});

test('an ingredient list exactly at the ceiling fits', () => {
  const ingredients = Array.from({ length: MAX_INGREDIENTS }, () => ingredientOf(20));
  assert.deepEqual(validateRecipe(recipe({ ingredients })), []);
});

test('too many ingredients are rejected, naming the recipe and the count', () => {
  const ingredients = Array.from({ length: MAX_INGREDIENTS + 1 }, () => ingredientOf(20));
  const message = onlyError(recipe({ ingredients }));
  assert.match(message, /test-recipe/);
  assert.match(message, /ingredients/);
  assert.match(message, new RegExp(String(MAX_INGREDIENTS + 1)));
  assert.match(message, new RegExp(String(MAX_INGREDIENTS)));
});

test('a missing required field is rejected, naming the recipe and the field', () => {
  for (const field of ['id', 'title', 'servings', 'totalMinutes', 'ingredients', 'steps']) {
    const broken = recipe();
    delete broken[field];
    const message = onlyError(broken);
    assert.match(message, new RegExp(field));
    assert.match(message, /missing/i);
    if (field !== 'id') assert.match(message, /test-recipe/);
  }
});

test('a recipe missing its id is still named by its title', () => {
  const broken = recipe();
  delete broken.id;
  assert.match(onlyError(broken), /Test Recipe/);
});

test('a recipe with no usable name is still reported', () => {
  const errors = errorsFor({});
  assert.ok(errors.length > 0);
  for (const message of errors) assert.match(message, /unnamed recipe/i);
});

test('a step with a duration but no timer label is rejected', () => {
  const message = onlyError(recipe({ steps: [{ text: 'Simmer gently.', minutes: 20 }] }));
  assert.match(message, /test-recipe/);
  assert.match(message, /steps\[0\]/);
  assert.match(message, /timerLabel/);
});

test('a step with a timer label but no duration is rejected', () => {
  const message = onlyError(recipe({ steps: [{ text: 'Simmer gently.', timerLabel: 'Simmer' }] }));
  assert.match(message, /steps\[0\]/);
  assert.match(message, /minutes/);
});

test('a step with both a duration and a label is accepted', () => {
  const steps = [{ text: 'Simmer gently.', minutes: 20, timerLabel: 'Simmer' }];
  assert.deepEqual(validateRecipe(recipe({ steps })), []);
});

test('durations must be positive whole minutes', () => {
  for (const minutes of [0, -5, 2.5, '20']) {
    const steps = [{ text: 'Simmer.', minutes, timerLabel: 'Simmer' }];
    assert.match(onlyError(recipe({ steps })), /steps\[0\]\.minutes/);
  }
});

test('servings and totalMinutes must be positive whole numbers', () => {
  for (const field of ['servings', 'totalMinutes']) {
    for (const value of [0, -1, 1.5, '4', null]) {
      assert.match(onlyError(recipe({ [field]: value })), new RegExp(field));
    }
  }
});

test('empty text, empty ingredient lists, and empty step lists are rejected', () => {
  assert.match(onlyError(recipe({ ingredients: [] })), /ingredients/);
  assert.match(onlyError(recipe({ steps: [] })), /steps/);
  assert.match(onlyError(recipe({ steps: [{ text: '   ' }] })), /steps\[0\]\.text/);
  assert.match(onlyError(recipe({ title: '' })), /title/);
});

test('ingredients must carry both a quantity and an item', () => {
  assert.match(onlyError(recipe({ ingredients: [{ item: 'olive oil' }] })), /ingredients\[0\]\.quantity/);
  assert.match(onlyError(recipe({ ingredients: [{ quantity: '2 tbsp' }] })), /ingredients\[0\]\.item/);
});

test('an unknown field is rejected, so a typo is not silently ignored', () => {
  assert.match(onlyError(recipe({ srevings: 4 })), /srevings/);
  const steps = [{ text: 'Simmer.', mintues: 20 }];
  assert.match(onlyError(recipe({ steps })), /steps\[0\]\.mintues/);
});

test('something that is not an object at all is rejected', () => {
  for (const value of [null, 'recipe', 42, []]) {
    assert.ok(errorsFor(value).length > 0, `${JSON.stringify(value)} should be rejected`);
  }
});

test('assertValidRecipe returns the recipe when it is valid', () => {
  const valid = recipe();
  assert.equal(assertValidRecipe(valid), valid);
});

test('assertValidRecipe throws with every problem listed', () => {
  const broken = recipe({ servings: 0, steps: [{ text: 'Simmer.', minutes: 20 }] });
  assert.throws(
    () => assertValidRecipe(broken),
    (error) => {
      assert.match(error.message, /servings/);
      assert.match(error.message, /timerLabel/);
      assert.match(error.message, /test-recipe/);
      return true;
    },
  );
});
