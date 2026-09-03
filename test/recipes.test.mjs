// The shipped recipe backlog, as a set. Individual recipes are validated
// against the schema in validate-recipe.test.mjs; what is asserted here is
// that the corpus as a whole still stresses the constraints it exists to
// stress, because these recipes double as the fixtures for the screens.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { MAX_INGREDIENTS, MAX_CONCURRENT_TIMERS } from '../src/validate-recipe.js';

// An editorial cap, not a display one. The screen holds seventeen ingredients
// and four timers; these recipes are deliberately far inside both, because the
// backlog is meant to be things you can cook on a weeknight without reading
// ahead. Held here rather than in the validator, which states what the display
// can draw and should not be made to state what the kitchen should ask for.
const CORPUS_MAX_INGREDIENTS = 8;
const CORPUS_MAX_TIMERS = 2;

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
test('recipes vary in length, from a short cook to a longer one', () => {
  const lengths = recipes.map((r) => r.steps.length);
  assert.ok(Math.min(...lengths) <= 5, `shortest recipe has ${Math.min(...lengths)} steps`);
  assert.ok(Math.max(...lengths) >= 7, `longest recipe has ${Math.max(...lengths)} steps`);
});

// The whole point of this backlog is that it is easy. A recipe that grew past
// these is not wrong, but it is not what this set is for, and it would want a
// deliberate decision rather than an accident of authoring.
test('every recipe stays inside the editorial caps', () => {
  for (const r of recipes) {
    assert.ok(
      r.ingredients.length <= CORPUS_MAX_INGREDIENTS,
      `${r.id} lists ${r.ingredients.length} ingredients, over the ${CORPUS_MAX_INGREDIENTS} this backlog allows`,
    );
    assert.ok(
      timedSteps(r).length <= CORPUS_MAX_TIMERS,
      `${r.id} carries ${timedSteps(r).length} timers, over the ${CORPUS_MAX_TIMERS} this backlog allows`,
    );
  }
});

// Eggs, chicken, steak. Named so that replacing the backlog with something
// else is a decision someone takes rather than a test quietly going green.
test('the backlog covers eggs, chicken, and steak', () => {
  const ids = recipes.map((r) => r.id).join(' ');
  for (const protein of ['egg', 'chicken', 'steak']) {
    assert.match(ids, new RegExp(protein), `nothing in the backlog is ${protein}`);
  }
});

// Concurrent timers are the hardest thing the reducer does. A recipe with one
// timer cannot exercise them; two recipes with several each can.
test('at least two recipes carry multiple timed steps', () => {
  const multiple = recipes.filter((r) => timedSteps(r).length >= 2);
  assert.ok(multiple.length >= 2, `only ${multiple.length} recipe(s) have two or more timers`);
});

// This corpus deliberately does not reach the display's ceilings, so it is no
// longer the fixture that proves the ingredients screen fits its worst case.
// That job belongs to scripts/measure-ingredients-ceiling.html, which draws the
// widest legal row eighteen times against the real stylesheet — a stricter test
// than any recipe, since it uses the worst list that could exist rather than
// the worst one that happens to be shipped. What is asserted here is only that
// the corpus stays inside what the screen can draw.
test('the corpus stays inside what the display can hold', () => {
  for (const r of recipes) {
    assert.ok(r.ingredients.length <= MAX_INGREDIENTS, `${r.id} has ${r.ingredients.length} ingredients`);
    assert.ok(timedSteps(r).length <= MAX_CONCURRENT_TIMERS, `${r.id} has ${timedSteps(r).length} timers`);
  }
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
