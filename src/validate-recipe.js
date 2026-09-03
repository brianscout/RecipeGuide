// Recipe validation. Pure: no DOM, no fetch, no storage. See
// docs/RECIPE-SCHEMA.md for the schema and for how the ceiling was measured.

/**
 * The most characters a step's text can hold. The display does not scroll, so
 * a longer step has no runtime remedy — it would be clipped mid-cook. Measured
 * rather than guessed: scripts/measure-step-ceiling.html renders the cook
 * screen at device size and binary-searches the fit.
 */
export const MAX_STEP_CHARS = 150;

/**
 * The most ingredients a recipe can list. The screen shows the whole list at
 * once and does not scroll, so a longer list would push its last rows off the
 * bottom — content hidden rather than clipped, which is worse: the cook has no
 * sign that anything is missing. Measured by
 * scripts/measure-ingredients-ceiling.html, which found eighteen rows fit and
 * is pinned one below.
 */
export const MAX_INGREDIENTS = 17;

/**
 * The most characters a quantity and item can run to together, counting the
 * space between them. A row that wraps onto a second line costs the list a row
 * it has not got. Measured by the same harness, which found forty-five fit on
 * one line at the required type size.
 */
export const MAX_INGREDIENT_CHARS = 44;

/**
 * The most timed steps a recipe can carry, which is the most timers that can
 * ever run at once: a step whose timer is running does not offer another, so
 * the two numbers are the same number. Every running timer is drawn, so this
 * is what keeps that promise keepable.
 *
 * Not pinned one below the measured fit, unlike the ceilings above. The unit
 * here is a whole timer rather than a character or a row: four fit in 495px of
 * the 520px line and five need 622px, so the cliff is a hundred pixels wide
 * and no font metric crosses it. See MAX_TIMERS_SHOWN in src/render.js, which
 * still counts what it cannot draw in case a session predates this.
 */
export const MAX_CONCURRENT_TIMERS = 4;

const RECIPE_FIELDS = ['id', 'title', 'servings', 'totalMinutes', 'ingredients', 'steps'];
const INGREDIENT_FIELDS = ['quantity', 'item'];
const STEP_FIELDS = ['text', 'minutes', 'timerLabel'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isCount = (value) => Number.isInteger(value) && value > 0;

// The name is only for the person reading the failure, so it degrades: id,
// then title, then an admission that the recipe cannot identify itself.
function nameOf(recipe) {
  if (!isObject(recipe)) return 'unnamed recipe';
  if (isText(recipe.id)) return recipe.id;
  if (isText(recipe.title)) return recipe.title;
  return 'unnamed recipe';
}

function checkText(errors, name, field, value) {
  if (value === undefined) errors.push(`${name}: ${field} is missing`);
  else if (!isText(value)) errors.push(`${name}: ${field} must be a non-empty string`);
}

function checkCount(errors, name, field, value) {
  if (value === undefined) errors.push(`${name}: ${field} is missing`);
  else if (!isCount(value)) errors.push(`${name}: ${field} must be a whole number of at least 1`);
}

function checkUnknown(errors, name, prefix, value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${name}: ${prefix}${key} is not a field of the schema`);
  }
}

function checkIngredient(errors, name, index, ingredient) {
  const at = `ingredients[${index}]`;
  if (!isObject(ingredient)) {
    errors.push(`${name}: ${at} must be an object of { quantity, item }`);
    return;
  }
  checkText(errors, name, `${at}.quantity`, ingredient.quantity);
  checkText(errors, name, `${at}.item`, ingredient.item);

  // The row is drawn as one line, so the two halves share the ceiling.
  if (isText(ingredient.quantity) && isText(ingredient.item)) {
    const width = ingredient.quantity.length + 1 + ingredient.item.length;
    if (width > MAX_INGREDIENT_CHARS) {
      errors.push(
        `${name}: ${at} is ${width} characters of quantity and item, over the ` +
          `${MAX_INGREDIENT_CHARS} character ceiling — it would wrap onto a second line`,
      );
    }
  }

  checkUnknown(errors, name, `${at}.`, ingredient, INGREDIENT_FIELDS);
}

function checkStep(errors, name, index, step) {
  const at = `steps[${index}]`;
  if (!isObject(step)) {
    errors.push(`${name}: ${at} must be an object of { text, minutes?, timerLabel? }`);
    return;
  }

  if (isText(step.text) && step.text.length > MAX_STEP_CHARS) {
    errors.push(
      `${name}: ${at}.text is ${step.text.length} characters, over the ${MAX_STEP_CHARS} ` +
        `character ceiling — split the step rather than shortening the display`,
    );
  } else {
    checkText(errors, name, `${at}.text`, step.text);
  }

  // A duration and its label are one feature: a duration is what offers a
  // timer, and the label is what the timer is called. Half of it is an
  // authoring slip, not a timer without a name.
  const hasMinutes = step.minutes !== undefined;
  const hasLabel = step.timerLabel !== undefined;
  if (hasMinutes && !isCount(step.minutes)) {
    errors.push(`${name}: ${at}.minutes must be a whole number of at least 1`);
  }
  if (hasLabel && !isText(step.timerLabel)) {
    errors.push(`${name}: ${at}.timerLabel must be a non-empty string`);
  }
  if (hasMinutes && !hasLabel) {
    errors.push(`${name}: ${at} has minutes but no timerLabel, so its timer would be unnamed`);
  }
  if (hasLabel && !hasMinutes) {
    errors.push(`${name}: ${at} has a timerLabel but no minutes, so no timer can be offered`);
  }

  checkUnknown(errors, name, `${at}.`, step, STEP_FIELDS);
}

function checkList(errors, name, field, value, checkItem) {
  if (value === undefined) {
    errors.push(`${name}: ${field} is missing`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${name}: ${field} must be an array`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${name}: ${field} is empty`);
    return;
  }
  value.forEach((item, index) => checkItem(errors, name, index, item));
}

/**
 * Every problem with a recipe, as messages naming the recipe and the field.
 * An empty array means the recipe conforms.
 *
 * @param {unknown} recipe
 * @returns {string[]}
 */
export function validateRecipe(recipe) {
  const name = nameOf(recipe);
  if (!isObject(recipe)) return [`${name}: not an object`];

  const errors = [];
  checkText(errors, name, 'id', recipe.id);
  checkText(errors, name, 'title', recipe.title);
  checkCount(errors, name, 'servings', recipe.servings);
  checkCount(errors, name, 'totalMinutes', recipe.totalMinutes);
  checkList(errors, name, 'ingredients', recipe.ingredients, checkIngredient);
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > MAX_INGREDIENTS) {
    errors.push(
      `${name}: ingredients has ${recipe.ingredients.length} entries, over the ` +
        `${MAX_INGREDIENTS} the screen holds — the last of them would never be shown`,
    );
  }
  checkList(errors, name, 'steps', recipe.steps, checkStep);
  if (Array.isArray(recipe.steps)) {
    const timed = recipe.steps.filter(
      (step) => step !== null && typeof step === 'object' && step.minutes !== undefined,
    ).length;
    if (timed > MAX_CONCURRENT_TIMERS) {
      errors.push(
        `${name}: steps carry ${timed} timers, over the ${MAX_CONCURRENT_TIMERS} the ` +
          `indicator can show at once — a cook running them all would lose sight of one`,
      );
    }
  }
  checkUnknown(errors, name, '', recipe, RECIPE_FIELDS);
  return errors;
}

/**
 * The recipe, or a throw listing everything wrong with it. This is the loud
 * failure: a malformed recipe stops development at the desk instead of
 * clipping an instruction on the glasses hours later.
 *
 * @template T
 * @param {T} recipe
 * @returns {T}
 */
export function assertValidRecipe(recipe) {
  const errors = validateRecipe(recipe);
  if (errors.length > 0) {
    throw new Error(`Invalid recipe:\n  ${errors.join('\n  ')}`);
  }
  return recipe;
}
