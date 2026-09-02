// The shipped recipe backlog, as a set. Individual recipes are validated
// against the schema in validate-recipe.test.mjs; what is asserted here is
// that the corpus as a whole still stresses the constraints it exists to
// stress, because these recipes double as the fixtures for the screens.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { MAX_INGREDIENTS } from '../src/validate-recipe.js';

const RECIPES_DIR = fileURLToPath(new URL('../recipes/', import.meta.url));

// index.json is the menu's running order, not a recipe. Every other file in
// the folder is one.
const recipes = await Promise.all(
  (await readdir(RECIPES_DIR))
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .map(async (file) => ({
      file,
      ...JSON.parse(await readFile(RECIPES_DIR + file, 'utf8')),
    })),
);

const timedSteps = (r) => r.steps.filter((step) => step.minutes !== undefined);

// A beat ends at a full stop followed by a space, or at the end of the text.
const sentences = (text) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

test('five recipes ship', () => {
  assert.equal(recipes.length, 5, recipes.map((r) => r.file).join(', '));
});

// The walkthrough is the whole product, so the corpus has to cover a cook
// that is over in a handful of beats and one that runs long enough for the
// progress indicator to be doing real work.
test('recipes vary in length, from a short cook to a long one', () => {
  const lengths = recipes.map((r) => r.steps.length);
  assert.ok(Math.min(...lengths) <= 8, `shortest recipe has ${Math.min(...lengths)} steps`);
  assert.ok(Math.max(...lengths) >= 12, `longest recipe has ${Math.max(...lengths)} steps`);
});

// Concurrent timers are the hardest thing the reducer does. A recipe with one
// timer cannot exercise them; two recipes with several each can.
test('at least two recipes carry multiple timed steps', () => {
  const multiple = recipes.filter((r) => timedSteps(r).length >= 2);
  assert.ok(multiple.length >= 2, `only ${multiple.length} recipe(s) have two or more timers`);
});

// The ingredients screen does not scroll either, and that it fits is a claim
// about the longest list that can exist, not the longest that happens to be in
// the corpus. The validator holds the ceiling; this holds a fixture at it, so
// the screen is always drawn against its own worst case.
test('a recipe sits at the ingredient ceiling', () => {
  const longest = Math.max(...recipes.map((r) => r.ingredients.length));
  assert.equal(longest, MAX_INGREDIENTS, `longest ingredient list is ${longest}`);
});

// The ceiling forces short text; it does not force short *beats*. A step can
// sit under 150 characters and still be three clauses the cook has to unpack
// in peripheral vision.
test('every step reads as a short imperative beat, not a paragraph', () => {
  for (const r of recipes) {
    r.steps.forEach((step, index) => {
      const count = sentences(step.text).length;
      assert.ok(count <= 2, `${r.id}: steps[${index}] is ${count} sentences — "${step.text}"`);
    });
  }
});
