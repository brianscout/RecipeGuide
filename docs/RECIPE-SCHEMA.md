# Recipe schema

Recipes are static JSON, one file per recipe in `recipes/`, committed to the
repository and deployed with the application. There is no backend and no
content API. The validator lives in [`src/validate-recipe.js`](../src/validate-recipe.js)
and is pure — no DOM, no fetch, no storage — so it runs under Node and in the
browser unchanged.

```json
{
  "id": "shakshuka",
  "title": "Shakshuka",
  "servings": 4,
  "totalMinutes": 35,
  "ingredients": [{ "quantity": "2 tbsp", "item": "olive oil" }],
  "steps": [
    { "text": "Heat the olive oil in a wide, deep frying pan until it shimmers." },
    { "text": "Simmer uncovered until the sauce thickens.", "minutes": 10, "timerLabel": "Simmer" }
  ]
}
```

## Fields

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `id` | yes | string | Non-empty. Stable, and matches the file name. |
| `title` | yes | string | Non-empty. Shown on the menu and the ingredients screen. |
| `servings` | yes | number | Whole number, at least 1. Fixed as authored; the app does not scale. |
| `totalMinutes` | yes | number | Whole number, at least 1. The whole recipe, shown on the menu. |
| `ingredients` | yes | array | At least one entry, at most **17**. See below. |
| `ingredients[].quantity` | yes | string | Non-empty, e.g. `"800 g"`, `"3 cloves"`, `"to serve"`. |
| `ingredients[].item` | yes | string | Non-empty, e.g. `"chopped tomatoes (2 tins)"`. |
| `ingredients[]` | — | — | Quantity and item together at most **44 characters**, counting the space between. See below. |
| `steps` | yes | array | At least one entry, in cooking order. |
| `steps[].text` | yes | string | Non-empty, at most **150 characters**. See below. |
| `steps[].minutes` | no | number | Whole number, at least 1. A step carrying one offers a timer. |
| `steps[].timerLabel` | no | string | Non-empty. What that timer is called on screen. |

`minutes` and `timerLabel` are one feature and travel together: a step with
only one of the two is rejected. A duration with no label would draw an unnamed
timer; a label with no duration can offer no timer at all.

Any field not in the table is rejected, so `srevings` fails loudly instead of
being silently ignored.

## The 150 character ceiling

The display does not scroll, so a step that does not fit has no runtime remedy
— it would be clipped mid-cook, at the moment it is needed. Over-length text is
therefore an authoring error, and the fix is to split the step into two.

The number is measured, not guessed. `scripts/measure-step-ceiling.html` builds
the cook screen at device size (600 x 600, 40px padding, a reserved 56px timer
row above and a 28px progress row below, leaving a **520 x 388** instruction
pane) and binary-searches the longest string that still fits, using real recipe
prose plus a deliberately wide capitalised stress string. It links the real
`styles.css` rather than copying it, so it is measuring the cook screen and not
a second description of one that can drift from it. Run it with:

```bash
node scripts/serve.mjs
```

then open `http://localhost:8000/scripts/measure-step-ceiling.html`.

At the candidate instruction sizes, in a Chrome window at the device viewport:

| Instruction size | Characters that fit |
| --- | --- |
| 32px | 259 |
| 36px | 202 |
| 40px | 153 |
| 44px | 130 |
| 48px | 119 |

40px is the chosen instruction size: the largest type that keeps the ceiling
inside the 120-160 character band the spec calls for, which matters because the
cook screen is read at arm's length and in peripheral vision. The measured 153
is pinned at **150**, the small margin covering font metric differences between
the desktop browser and the glasses.

Anything that changes the cook screen — type size, padding, the reserved timer
row — changes this number. Re-run the harness and update `MAX_STEP_CHARS`
together with the CSS; the harness is the source of the number, not a one-off.

Still outstanding: the measurement was taken in Chrome at the device viewport
with the device type sizes, not on the glasses themselves. Confirm it there
when hardware is to hand — if the waveguide's rendering is wider, the pinned
150 drops rather than the design changing.

## The ingredient list ceilings

The ingredients screen shows the whole list at once and does not scroll either,
so it has two ceilings rather than one. A list fits only if there are few enough
rows *and* every row is a single line, and a ceiling on either alone is not a
ceiling: seventeen short ingredients fit, and so do ten, but ten that each wrap
onto a second line do not.

Both numbers are measured by `scripts/measure-ingredients-ceiling.html`, which
links the real `styles.css` rather than copying it, so it is measuring the
screen and not a model of it. Run it the same way:

```bash
node scripts/serve.mjs
```

then open `http://localhost:8000/scripts/measure-ingredients-ceiling.html`.

At the device viewport the list gets a **520 x 468** pane below a single-row
header, and each row is 26px. The header's height is pinned in `styles.css`
rather than set by what is in it, so the pane is 468 whether the header is
showing the eyebrow or the timer indicator — which is what lets one
measurement stand for both. It did not always: the timer indicator is 8px
taller than the eyebrow it replaces, and before the header was pinned a
running timer took those 8px out of the list and with them the row of margin
behind `MAX_INGREDIENTS`. A change to the header row is a change to this
number, so re-run the harness after one.

| Measured | Pinned | Constant |
| --- | --- | --- |
| 18 rows fit the pane | 17 | `MAX_INGREDIENTS` |
| 45 characters stay on one line | 44 | `MAX_INGREDIENT_CHARS` |

Each is pinned one below what was measured, the margin covering font metric
differences between the desktop browser and the glasses — the same reasoning
that pins the step ceiling at 150.

Over-length here hides rather than clips: a row past the pane is simply not
drawn, and the cook gets no sign that anything is missing. That is worse than a
clipped instruction, which at least announces itself, so the validator is the
only warning there is.

The quantity column is fixed at 128px, which is what makes the list read down
as a checklist. It is also what sets the character ceiling — every pixel the
column reserves is a pixel the item cannot have — which is why the quantity is
drawn a step smaller than the item it measures. Changing either that width or
the type sizes changes both numbers: re-run the harness and re-pin them
together with the CSS.

## Failing loudly

`validateRecipe(recipe)` returns an array of messages, empty when the recipe
conforms. Each message names the recipe and the exact field:

```
shakshuka: steps[4].text is 168 characters, over the 150 character ceiling — split the step rather than shortening the display
shakshuka: steps[7] has minutes but no timerLabel, so its timer would be unnamed
shakshuka: ingredients[2] is 51 characters of quantity and item, over the 44 character ceiling — it would wrap onto a second line
shakshuka: servings is missing
```

`assertValidRecipe(recipe)` returns the recipe or throws with every problem
listed. Recipe loading uses the throwing form, so a malformed recipe stops
development at the desk instead of clipping an instruction on the glasses hours
later. Every recipe in `recipes/` is validated by `node --test`, so a bad
recipe cannot reach a deploy.
