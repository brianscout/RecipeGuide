# RecipeGuide

A hands-free recipe walkthrough for the Meta Ray-Ban Display glasses, delivered
as a Web App. Vanilla JavaScript as ES modules, no bundler and no dependencies,
served from GitHub Pages.

The full design is in [docs/SPEC.md](docs/SPEC.md).

## Development

ES modules are blocked over the `file:` protocol, so the page must be served.

```bash
node scripts/serve.mjs
```

That serves the repository root on <http://localhost:8000>. Pass a port as the
first argument to use a different one.

The device viewport is a fixed 600 x 600 with no scrolling anywhere, so iterate
in a Chrome window sized to match:

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --app=http://localhost:8000 --window-size=600,600
```

On macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app=http://localhost:8000 --window-size=600,600
```

`--app` drops the tab strip and address bar so the 600 x 600 window is all page.
Drive it with the arrow keys and Enter — the glasses OS translates the Neural
Band and the temple touch strip into exactly those five keyboard events, and
nothing else in the application listens for input.

| Key | Gesture on the glasses |
| --- | --- |
| Left / Right | Swipe: move position in the flow |
| Up / Down | Swipe: cycle focus on the current screen |
| Enter | Pinch: activate the focused element |

The Meta Ray-Ban Display Web App Simulator Chrome extension is a closer
approximation still — it adds additive blending and environment backgrounds, so
it shows what pure black actually looks like on the waveguide.

## Recipes

One JSON file per recipe in `recipes/`, deployed as authored. The schema, the
150 character ceiling on step text, the two ceilings on the ingredient list, and
how each of those numbers was measured are in
[docs/RECIPE-SCHEMA.md](docs/RECIPE-SCHEMA.md). Every recipe in the folder is
validated by the test run, so a malformed one cannot reach a deploy.

`recipes/index.json` is the menu's running order: an array of recipe ids, each
naming a sibling file, ordered by total time so the menu opens on the
quickest thing to cook. Static hosting cannot list a directory, so adding a
recipe means adding the file and adding its id here. The test run asserts the
manifest and the folder agree, so a recipe listed in neither order nor place
fails at the desk rather than silently never appearing on the glasses.

The five shipped recipes are also the fixture set for the screens, so they are
chosen to span the constraints rather than to be five of the same shape: a
four-ingredient cook that is over in eight beats, a seventeen-ingredient one
that runs to thirteen, and four with concurrent timers. `test/recipes.test.mjs`
holds that spread in place.

The ceilings are re-measured, not re-guessed, whenever the screens they come
from change: serve the repository and open
`http://localhost:8000/scripts/measure-step-ceiling.html` for the cook screen
and `http://localhost:8000/scripts/measure-ingredients-ceiling.html` for the
ingredient list.

## Resuming a session

The session — the recipe, the position, and the timer list — is written to local
storage under `recipeguide:session` on every state change, and picked up again
on load. There is no resume prompt: making a cook perform a gesture to get back
to a place the application already knows is the friction this exists to remove.
The way out of an unwanted resume is the navigation that is already there, left
from the ingredients to the menu.

Timers hold the instant they end rather than a counter, so resuming is
arithmetic: one whose instant passed while the app was not running comes back
fired rather than with stale time on the clock. A session written more than six
hours ago is discarded and the menu opens instead — long enough to survive a
slow braise, short enough that yesterday's dinner never appears at breakfast.

This is also the mitigation for the platform's undocumented suspension
behaviour: if the glasses kill the page mid-cook, this is what makes that
survivable. To exercise it by hand, start a timer, reload the window, and check
the countdown against a clock; `localStorage.clear()` in the console is the
reset.

## Tests

```bash
node --test
```

Node's built-in runner, no installed packages. `package.json` exists only to
declare `"type": "module"` so Node reads `src/` as ES modules; there are no
dependencies and no build step. Only the pure core is covered: the reducer and
recipe validation. Rendering, input, storage, and the tick interval are I/O at
the edges and are verified by hand.

## The icon

The platform requires a PNG of at least 52 x 52 and does not accept an SVG
favicon. `assets/icon-192.png` is generated, not hand-drawn:

```bash
node scripts/make-icon.mjs
```

## Deployment

GitHub Pages serves the repository root of `master`. A push to `master` is a
deploy; there is no build step, so the deployed files are byte-for-byte what is
in the repository.

The live URL is <https://brianscout.github.io/RecipeGuide/>.

## Registering the app on the glasses

One time, from the phone. The URL is permanent, so this never needs repeating.

1. Open the **Meta AI** app.
2. **App Settings** → **App Connections** → **Web Apps** → **Add a Web App**.
3. Name it `RecipeGuide` and give it the HTTPS URL above.

It then appears as a tile at the bottom of the app grid on the glasses.

## The capability probe

Whether a Web App on these glasses can drive the Neural Band's haptics is not
answered by the platform documentation — haptics appears on neither the
supported nor the unsupported list. This decides the timer alert: a buzz on the
wrist reaches a cook who is not looking at the display, and without it
brightness and motion in peripheral vision are the only channels available.

`scripts/probe-capabilities.html` settles it by calling `navigator.vibrate()`
and rendering the outcome on the display, because there is no console to read
on the glasses.

Audio was considered and dropped. The alert needs one channel that reaches you
when you are not looking, and a buzz is the better one to have: silent in
company, and it survives a noisy kitchen without being mistaken for something
on the stove.

Desktop first, to confirm the page itself works:

```bash
node scripts/serve.mjs
```

Then open `http://localhost:8000/scripts/probe-capabilities.html`. A desktop
pass proves nothing about the device, so register it as its own Web App tile —
same steps as above, named `Probe`, with the URL
<https://brianscout.github.io/RecipeGuide/scripts/probe-capabilities.html>.

Pinch to run it. `navigator.vibrate()` is gated on user activation, so running
it on a pinch is what makes the result about the platform rather than about
that gate — probing on load would report a false negative.

Read the row as two separate facts:

| Status | What the platform did |
| --- | --- |
| `accepted` | Took the request. Whether the band moved is a separate question. |
| `rejected` | Refused. Treat the channel as unavailable. |
| `absent` | The API is not on the platform at all. |
| `blocked` | Not asked, because the pinch did not register as a gesture. Says nothing about haptics — see below. |
| `error` | Threw before the attempt could be made. |

`blocked` is the one status that is not a finding. Chrome refuses
`navigator.vibrate()` without user activation and returns `false` — the same
`false` a platform with no haptics returns. Rather than report that as
`rejected` and quietly retire a channel the product may actually have, the
probe checks for activation first and declines to ask. If you see `blocked` on
the glasses, the finding is that a pinch does not grant user activation, which
is worth knowing on its own.

`accepted` is not the finding on its own. Write down whether you actually felt
it next to the status, then fold both into
[issue #3](https://github.com/brianscout/RecipeGuide/issues/3) and into
`docs/SPEC.md`, *Further Notes — Open questions carried into implementation*,
item 2.
