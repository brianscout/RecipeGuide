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
| `ingredients` | yes | array | At least one entry. |
| `ingredients[].quantity` | yes | string | Non-empty, e.g. `"800 g"`, `"3 cloves"`, `"to serve"`. |
| `ingredients[].item` | yes | string | Non-empty, e.g. `"chopped tomatoes (2 tins)"`. |
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
prose plus a deliberately wide capitalised stress string. Run it with:

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

## Failing loudly

`validateRecipe(recipe)` returns an array of messages, empty when the recipe
conforms. Each message names the recipe and the exact field:

```
shakshuka: steps[4].text is 168 characters, over the 150 character ceiling — split the step rather than shortening the display
shakshuka: steps[7] has minutes but no timerLabel, so its timer would be unnamed
shakshuka: servings is missing
```

`assertValidRecipe(recipe)` returns the recipe or throws with every problem
listed. Recipe loading uses the throwing form, so a malformed recipe stops
development at the desk instead of clipping an instruction on the glasses hours
later. Every recipe in `recipes/` is validated by `node --test`, so a bad
recipe cannot reach a deploy.
