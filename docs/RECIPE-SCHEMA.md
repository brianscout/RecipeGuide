# Recipe schema

Recipes are static JSON, one file per recipe in `recipes/`, committed to the
repository and deployed with the application. There is no backend and no
content API. The validator lives in [`src/validate-recipe.js`](../src/validate-recipe.js)
and is pure — no DOM, no fetch, no storage — so it runs under Node and in the
browser unchanged.

```json
{
  "id": "soft-boiled-eggs",
  "title": "Soft-Boiled Eggs",
  "servings": 2,
  "totalMinutes": 10,
  "ingredients": [{ "quantity": "4", "item": "eggs, fridge-cold" }],
  "steps": [
    { "text": "Bring a small pan of water to a rolling boil and salt it." },
    { "text": "Lower the eggs in on a spoon, one at a time.", "minutes": 6, "timerLabel": "Boil" }
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
| `steps[].timerLabel` | no | string | Non-empty, and distinct within the recipe. What that timer is called on screen. |
| `steps[].after` | no | string | The `timerLabel` of an earlier timed step. Holds this step's timer back while that one is counting. See below. |

`minutes` and `timerLabel` are one feature and travel together: a step with
only one of the two is rejected. A duration with no label would draw an unnamed
timer; a label with no duration can offer no timer at all. `after` needs
`minutes` for the same reason — a step with no timer has nothing to hold back.

Any field not in the table is rejected, so `srevings` fails loudly instead of
being silently ignored.

## Timers that wait on other timers

`after` names the timer a step's own timer has to follow. The rice has to
finish cooking before it can steam in its own heat, and there is no lifting the
salmon out of a marinade that is still marinating:

```json
{ "text": "Slide the pan off the heat and leave the lid on.", "minutes": 10, "timerLabel": "Steam", "after": "Rice" }
```

**Declared, not inferred.** A step does not automatically wait for the timed
step before it, because most of the time it should not. Timers are global
precisely so that a marinade and a pot of rice can run at once, and a rule
that made every timed step wait for the previous one would forbid exactly that.
Only some timers are contingent, so only those say so.

The shipped backlog happens to be all chains — every dependency in it is a step
waiting on the one immediately before it — but that is a fact about five easy
recipes, not about the rule. A recipe with two independent timers and a third
waiting on one of them is legal and is what the rule is shaped for.

**The bar is that the named timer is not still counting**, which is weaker than
requiring that it ran. A cook who never started the rice timer is not thereby
locked out of the rest of the recipe, and one who started it and let it fire is
done waiting whether or not they pinched to clear it. So `after` catches the
mistake — starting a timer for something that cannot have begun yet — without
ever leaving a step that cannot be acted on at all.

On screen, a step whose timer is held back reads `After Rice` in the footer
where the offer would be: dim, no focus bar, and a pinch does nothing.

Three things are rejected at the desk. A name that matches no timer in the
recipe, since it would silently never hold anything back. A name that belongs
to a *later* step, which cannot be counting yet and so says something false
about the cooking. And a repeated `timerLabel`, because `after` resolves by
name and two timers called `Rest` make it ambiguous.

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

## The concurrent timer ceiling

A recipe may carry at most **four timed steps**, which is the same as saying at
most four timers can ever run at once: a step whose timer is running does not
offer a second one, so the count of timed steps is the ceiling on concurrency.

That number exists because every running timer is drawn — the indicator does
not summarise, since a timer a cook cannot see is a timer they are keeping in
their head. Measured against the widest the row can ever be, which is every
label at its longest with every countdown reading ten minutes or more, where
the digits are widest:

| Row | Needs | Of 520px |
| --- | --- | --- |
| 3 timers, full labels | 501px | fits |
| 4 timers, labels cut to three characters | 498px | fits |
| 5 timers, any label length | 622px | does not |

Unlike the other ceilings here, this one is **not** pinned one below what was
measured. The unit here is a whole timer rather than a character or a row, and
the gap between four and five is a hundred pixels — no difference in font
metrics between the desktop browser and the glasses crosses that.

`MAX_CONCURRENT_TIMERS` in `src/validate-recipe.js` rejects a fifth timed step,
so a recipe that would overflow the row fails at the desk. The renderer still
counts what it cannot draw, which covers a session written before this ceiling
existed and timers carried over from a cook that was left rather than stopped.

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
pan-seared-steak: steps[4].text is 168 characters, over the 150 character ceiling — split the step rather than shortening the display
pan-seared-steak: steps[7] has minutes but no timerLabel, so its timer would be unnamed
pan-seared-steak: ingredients[2] is 51 characters of quantity and item, over the 44 character ceiling — it would wrap onto a second line
pan-seared-steak: servings is missing
```

`assertValidRecipe(recipe)` returns the recipe or throws with every problem
listed. Recipe loading uses the throwing form, so a malformed recipe stops
development at the desk instead of clipping an instruction on the glasses hours
later. Every recipe in `recipes/` is validated by `node --test`, so a bad
recipe cannot reach a deploy.
