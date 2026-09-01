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
150 character ceiling on step text, and how that number was measured are in
[docs/RECIPE-SCHEMA.md](docs/RECIPE-SCHEMA.md). Every recipe in the folder is
validated by the test run, so a malformed one cannot reach a deploy.

The ceiling is re-measured, not re-guessed, whenever the cook screen changes:
serve the repository and open
`http://localhost:8000/scripts/measure-step-ceiling.html`.

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

Whether a Web App on these glasses can make a sound or a vibration is not
answered by the platform documentation — audio output and haptics appear on
neither the supported nor the unsupported list. `scripts/probe-capabilities.html`
settles it by attempting all three channels and rendering each outcome on the
display, because there is no console to read on the glasses.

Desktop first, to confirm the page itself works:

```bash
node scripts/serve.mjs
```

Then open `http://localhost:8000/scripts/probe-capabilities.html`. A desktop
pass proves nothing about the device, so register it as its own Web App tile —
same steps as above, named `Probe`, with the URL
<https://brianscout.github.io/RecipeGuide/scripts/probe-capabilities.html>.

Pinch once per channel. Each probe runs alone so a tone or a buzz can be
attributed to a single cause, and audio needs a user gesture, so running on a
pinch is what makes the result about the platform rather than about the
autoplay policy.

Read each row as two separate facts:

| Status | What the platform did |
| --- | --- |
| `accepted` | Took the request. Whether anything was audible is a separate question. |
| `blocked` | Refused for a policy reason. Likely reachable under other conditions. |
| `rejected` | Refused for a capability reason. Treat as unavailable. |
| `absent` | The API is not on the platform at all. |
| `error` | Threw before the attempt could be made. |

`accepted` is not the finding on its own. Write down what you actually heard
and felt next to it, then fold both into
[issue #3](https://github.com/brianscout/RecipeGuide/issues/3) and into
`docs/SPEC.md`, *Further Notes — Open questions carried into implementation*,
item 2.
