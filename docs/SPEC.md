# RecipeGuide — Specification

A hands-free, step-by-step cooking guide that runs on Meta Ray-Ban Display glasses.

Status: ready for implementation. All product and architectural decisions below were settled in a grilling session and are considered closed unless the open questions in *Further Notes* force a revisit.

---

## Problem Statement

Cooking from a recipe on a phone is a broken loop. You read a step, put the phone down, do the work, and by the time you pick it up again your hands are wet or greasy, the screen has slept, and you have to unlock it and hunt for your place. Timers live in a different app, so tracking "the rice has nine minutes left" happens in your head. The phone ends up smeared, propped somewhere awkward, or in another room when a timer goes off.

The user wants to cook a dish end to end without touching a phone. They own Meta Ray-Ban Display glasses and a Neural Band, which put a screen in their field of view and accept gestures that work with dirty hands, but no application exists that turns that into a cooking guide.

## Solution

RecipeGuide is a Web App that runs directly on the glasses. It ships with a small, hand-curated backlog of recipes.

The user swipes through a menu of recipes and pinches to select one. They land on the ingredient list for mise en place. Swiping right walks forward through the recipe one instruction at a time, each rendered large in the field of view. Where a step involves waiting, the app offers a timer; starting it registers a countdown that keeps running no matter where the user navigates afterward. When a timer finishes, the app takes over the display to announce it, then decays into a persistent indicator until acknowledged.

If the app is closed, suspended, or reloaded mid-cook, it returns the user to exactly where they were with timers still accurate.

The phone is used once, to register the app's URL. After that it stays in a pocket.

---

## User Stories

1. As a cook, I want to see a list of my recipes on the glasses display, so that I can choose what to make without picking up my phone.
2. As a cook, I want to move through the recipe menu with wrist swipes, so that I can browse with dirty hands.
3. As a cook, I want the currently highlighted recipe in the menu to be visibly distinct, so that I know what I am about to select.
4. As a cook, I want to select a recipe with an index pinch, so that selection uses the same gesture as every other confirmation in the app.
5. As a cook, I want to land on the ingredient list immediately after selecting a recipe, so that I can gather and prep everything before I start.
6. As a cook, I want the ingredient list to fit on one screen without scrolling, so that I can read it in a single glance.
7. As a cook, I want each ingredient to show its quantity, so that I can measure without a second source.
8. As a cook, I want to swipe right from the ingredients to begin the first step, so that starting to cook is one motion.
9. As a cook, I want to see exactly one instruction at a time, so that I am never hunting for my place in a wall of text.
10. As a cook, I want instruction text rendered large and high-contrast, so that I can read it from a normal working distance while moving.
11. As a cook, I want to swipe right to advance to the next step, so that progressing costs one gesture and no attention.
12. As a cook, I want to swipe left to return to the previous step, so that I can re-read something I half-remembered.
13. As a cook, I want swipe direction to mean the same thing on every screen, so that I can advance without first working out where I am.
14. As a cook, I want to see how far through the recipe I am, so that I can judge whether to start a side dish.
15. As a cook, I want to reach a clear completion screen after the final step, so that I know the dish is done and the session has ended.
16. As a cook, I want to swipe left from the ingredient screen to return to the menu, so that I can back out of a recipe I picked by mistake.
17. As a cook, I want the ingredient screen to sit between the menu and step one, so that an accidental left swipe during a cook does not immediately abandon it.
18. As a cook, I want steps that involve waiting to offer a timer, so that I never reach for a separate timer app.
19. As a cook, I want a timer to show its duration before I start it, so that I know what I am committing to.
20. As a cook, I want to start a timer with a pinch, so that starting it does not interrupt what my hands are doing for long.
21. As a cook, I want a running timer to keep counting after I navigate away from the step that started it, so that I can prep the next component while something simmers.
22. As a cook, I want to run several timers at once, so that I can track a pot, an oven, and a rest all at the same time.
23. As a cook, I want every running timer visible on whatever screen I am on, so that I can check remaining time without navigating.
24. As a cook, I want each running timer labelled with what it is for, so that two simultaneous countdowns are not ambiguous.
25. As a cook, I want the timer indicator to disappear entirely when nothing is running, so that the full display is given over to the instruction in the common case.
26. As a cook, I want a finished timer to take over the whole display, so that it reaches me even when I am not attending to the screen.
27. As a cook, I want that takeover to stand down on its own after a few seconds, so that it does not block the instruction I am mid-way through following.
28. As a cook, I want a finished timer to remain visibly flagged after the takeover ends, so that I do not lose the fact that it fired while my hands were full.
29. As a cook, I want to dismiss a finished timer with a pinch, so that acknowledging it is deliberate rather than accidental.
30. As a cook, I want an unacknowledged finished timer to keep signalling indefinitely, so that a distraction does not cost me the dish.
31. As a cook, I want timers to remain accurate if the app reloads, so that a technical hiccup does not silently reset a twenty-minute braise.
32. As a cook, I want to be returned to my exact step when I reopen the app mid-cook, so that resuming is invisible rather than a chore.
33. As a cook, I want resumption to happen without confirming a prompt, so that I do not have to perform a gesture just to get back to where the app already knows I was.
34. As a cook, I want a stale session from hours ago to be forgotten, so that yesterday's dinner does not ambush me at breakfast.
35. As a cook, I want to abandon a cook and pick something else, so that a change of plan is not a dead end.
36. As a cook, I want the interface drawn as bright content on a dark ground, so that it is legible through an additive waveguide against a bright kitchen.
37. As a cook, I want the display never to scroll, so that content is never hidden somewhere I cannot reach it.
38. As a recipe author, I want recipes stored as plain structured data in the repository, so that adding a dish is editing a file rather than operating a system.
39. As a recipe author, I want a defined schema for a recipe, so that I can paste prose into an assistant and get conforming data back.
40. As a recipe author, I want a step whose text is too long for the display to be rejected loudly during development, so that I discover the problem at my desk and not mid-cook.
41. As a recipe author, I want a malformed recipe to fail with a message naming the recipe and the field, so that fixing it does not require reading the loader.
42. As a developer, I want the app to run correctly in a desktop browser driven by arrow keys and Enter, so that I can iterate without wearing the glasses.
43. As a developer, I want no build step, so that what I wrote is exactly what runs on a device I cannot easily debug.
44. As a developer, I want all navigation, timer, alert, and resume logic behind one pure function, so that the behaviour that matters is testable without a browser.
45. As a developer, I want the current time supplied to that function rather than read inside it, so that a twenty-minute countdown can be tested in a millisecond.
46. As a developer, I want deployment to be a git push, so that shipping is not a second system to maintain.
47. As a developer, I want the app's URL to be permanent, so that I register it on the glasses once and never again.
48. As a cook, I want the app to appear as a tile in the glasses app grid, so that launching it is the same as launching anything else on the device.

---

## Implementation Decisions

### Platform: Web App, not a native DAT integration

The app is a Meta Ray-Ban Display Web App — HTML, CSS, and JavaScript served over HTTPS and executed on the glasses. There is no companion phone application.

The alternative considered and rejected was the native Wearables Device Access Toolkit path: an Android application using the core and display modules, with the glasses acting as a remote render target. It was rejected on two grounds established by inspecting the shipped SDK artifacts rather than the documentation:

- The DAT display capability delivers exactly two event types to the application, a click event and an error event. Swipe never reaches application code. The horizontal navigation this product is built around is unavailable on that path.
- The DAT mock device exposes only camera and captouch services and has no entry for the display-capable hardware, so every display iteration would require wearing the glasses. The Web App path is developed in a desktop browser.

The native path's advantages — audio output via the phone, notifications, offline operation, unbounded storage — were judged not to outweigh losing the core interaction and the desktop development loop.

### Input model

The Neural Band and the temple touch strip are translated by the glasses OS into standard keyboard events: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, and Enter. These five inputs are the entire interaction vocabulary. The application listens for keydown and nothing else.

The middle-finger pinch is reserved by the system for its own menu (restart, resume, permissions) and must not be relied upon.

Back navigation is not provided by the platform. The application owns its own reverse navigation.

### Navigation grammar

Direction has one fixed meaning throughout the application:

- **Left and right move position in the flow.** In cook mode this means the previous or next screen in the recipe. In the menu, where there is no flow, horizontal input does nothing.
- **Up and down cycle focus** among the focusable elements of the current screen, with a visible focus indicator. In the menu, this is how the recipe list is traversed.
- **Enter activates** the focused element.

This is deliberately mode-independent. The user must be able to advance a step without first determining which screen they are on.

### Flow model

A recipe is a linear sequence of positions on the horizontal axis:

```
menu  <->  ingredients  <->  step 1  <->  ...  <->  step N  <->  done
```

Selecting a recipe from the menu enters at the ingredients position. Left from ingredients returns to the menu. Placing ingredients at position zero rather than entering directly at step one is intentional: it provides a mise en place screen at the moment the cook's hands are still clean, and it inserts a buffer so that a stray left swipe during a cook does not immediately abandon it.

### State and events

All application state is a single serializable value, and all transitions are a single pure function. This shape is a decision, not an implementation detail:

```
state = {
  screen:   'menu' | 'ingredients' | 'step' | 'done',
  recipeId: string | null,
  position: number,          // index within the flow
  focus:    number,          // index of focused element on current screen
  timers:   [ { id, label, endsAt, sourceStep, state } ],
  alert:    { timerId, since } | null
}

event = SWIPE_LEFT | SWIPE_RIGHT | FOCUS_UP | FOCUS_DOWN
      | ACTIVATE | TICK | HYDRATE
```

The reducer signature is `reduce(state, event, now) -> state`. The current time is supplied by the caller and never read from inside. This is what makes long-duration timer behaviour, alert decay, and session expiry testable as ordinary synchronous assertions.

Keyboard listening, rendering, persistence, and the tick interval are I/O performed at the edges around this function.

### Timers

Timers are global, not scoped to the step that created them. Starting a timer appends an entry to a list held in application state; it continues running regardless of subsequent navigation. Multiple timers may run concurrently.

Each timer stores an **absolute epoch timestamp** for when it ends, never a decrementing remaining-seconds counter. Remaining time is always derived by subtracting the supplied current time. This makes the timer correct across reloads and any suspension the platform may impose without the application needing to detect that suspension occurred.

A timer indicator is rendered on every screen while any timer is running, and is omitted entirely when none are. The common case — a step with no active timer — gives the full display to the instruction.

### Alert behaviour

When a timer reaches zero it enters an alert sequence:

1. **Takeover.** The alert replaces the entire display, bright and unambiguous, naming the timer that fired.
2. **Decay.** After roughly ten seconds the takeover stands down on its own and the display returns to the underlying screen, with the finished timer's row now visibly signalling.
3. **Persist.** The signalling row remains until the user acknowledges it with a pinch. It does not time out.

The decay is what allows the alert to be both unmissable and non-blocking: it grabs attention from a cook who is not looking at the display, then gets out of the way of a cook who is mid-task and cannot respond immediately.

Because audio and haptics are not known to be available, brightness and motion are the only alert channels currently assumed. See *Further Notes*.

### Recipe data

Recipes are static structured data committed to the repository and deployed with the application. There is no backend, database, or content API. The schema:

```
recipe = {
  id, title, servings, totalMinutes,
  ingredients: [ { quantity, item } ],
  steps: [ { text, minutes?, timerLabel? } ]
}
```

A step carrying a duration offers a timer, labelled with its timer label. Required and optional fields, the validation rules, and the measured ceiling on step text are documented in [RECIPE-SCHEMA.md](RECIPE-SCHEMA.md).

Local storage is used only for session state, never as the source of truth for recipe content. Storing recipes there was rejected: the platform has no text input, so recipes can never be authored or edited on the device, which leaves a synchronization problem and a storage ceiling in exchange for nothing.

Recipes contain no images. Photographs read poorly on an additive display, and bundling them costs load time on every launch, since the platform has no offline support and the page is fetched fresh each time.

Five recipes ship in the initial version.

### Display constraints

These are platform requirements, not stylistic preferences:

- Fixed **600 x 600 pixel** viewport with hidden overflow. No scrolling anywhere.
- Pure black renders as **fully transparent** on the additive waveguide. The design is bright content on a dark ground; black is the absence of light, not a colour.
- Minimum 16px body text, 20-24px for primary content.
- App icon must be a PNG of at least 52 x 52 pixels. SVG favicons are not supported.
- The mrbd-web-app-capable meta tag is required for discovery.

### Screen composition

The cook screen is instruction-dominant. The instruction occupies the pane. The timer indicator is pinned above it and rendered only when timers are live. Progress through the recipe is shown small and dim. Secondary actions are reached by vertical focus rather than being permanently drawn.

The consequence is a hard ceiling on instruction length — roughly 120 to 160 characters at the required type sizes. Since nothing can scroll, this is enforced rather than accommodated: recipe loading validates step length and **fails loudly during development** when a step is too long. A step that does not fit is an authoring error to be fixed by splitting it, not a rendering problem to be solved by truncation. This constraint is desirable on its own terms, since it forces recipes to be written as short imperative beats, which is the register that reads well in peripheral vision.

### Persistence and resumption

Session state — the recipe, the position, and the timer list — is written to local storage on every meaningful transition. On load, the application rehydrates and returns the user directly to their step. There is no resume prompt: requiring a gesture to return to a place the application already knows is precisely the friction this product exists to remove.

Persisted state older than **six hours** is discarded. This is long enough to survive a slow braise and short enough that a previous day's session never reappears unexpectedly.

The escape hatch from an unwanted resume is the existing navigation: left from ingredients returns to the menu.

### Stack and delivery

Vanilla JavaScript as ES modules. No bundler, no transpiler, no framework, no dependencies. One HTML entry point plus a small number of modules plus a folder of recipe JSON, served as authored.

The reasoning is diagnostic rather than ideological: on a device where attaching a debugger is awkward, the guarantee that the deployed artifact is byte-for-byte what was written is worth more than the ergonomics a framework would provide, particularly for an application whose entire state is a screen, a position, and a list of timers.

One consequence: ES modules are blocked over the file protocol, so local development requires a static server rather than opening the file directly.

Hosting is GitHub Pages from the project repository, giving a permanent URL and making deployment a git push with no second dashboard or service to maintain. **This requires the repository to be public**, which has not yet been done and requires explicit authorization before implementation.

### Registration

The app is registered once, from the phone: Meta AI app, then App Settings, App Connections, Web Apps, Add a Web App, then name and HTTPS URL. It then appears as a tile at the bottom of the glasses app grid and is launched from there. Because the URL is permanent, this is a one-time action.

---

## Testing Decisions

### What a good test looks like here

A good test exercises observable behaviour through the reducer and asserts on resulting state. It does not reach into internal helpers, does not assert on DOM structure, and does not test the shape of intermediate values. If a test would still pass after the feature broke, or would fail after a harmless refactor, it is the wrong test.

There is no prior art — this is a greenfield repository with no existing tests, no established seams, and no ADRs.

### The seam

There is exactly one: the pure reducer, together with recipe validation, forming the application's pure core. Everything else — keyboard listening, rendering, local storage, the tick interval — is I/O at the edges and is not unit tested.

The capability probe is built to the same shape and for the same reason. `src/probe-capabilities.js` takes the browser APIs it exercises as an injected environment and returns a result record, so the part that decides a product question — what `accepted`, `blocked`, `absent`, and `rejected` each mean — is tested rather than observed once on a device and remembered. The page around it is an edge like any other.

Supplying the current time as an argument is load-bearing for testability. A twenty-minute countdown, a ten-second alert decay, and a six-hour session expiry are all tested by calling the reducer with two different timestamps. No fake timers, no clock mocking, no waiting.

### Runner

Node's built-in test runner. It executes ES modules directly with no dependencies and no installed packages, preserving the no-build-step decision.

### What is covered

- Navigation: horizontal movement through the flow, boundaries at each end, the menu-to-ingredients transition, and left-from-ingredients returning to the menu.
- Direction consistency: the same event produces the same category of transition on every screen.
- Focus: vertical cycling within a screen, wrapping, and activation of the focused element.
- Timer lifecycle: starting, multiple concurrent timers, remaining time derived correctly from the supplied clock, and survival across navigation.
- Timer accuracy across reload: a hydrated timer whose end time is in the past is treated as fired, and one in the future reports correct remaining time.
- Alert sequence: takeover on expiry, automatic decay after the interval, persistence of the signalling state until acknowledged, and acknowledgement clearing it.
- Concurrent expiry: two timers finishing close together.
- Session expiry: hydration inside and outside the six-hour window.
- Recipe validation: rejection of over-length step text, missing required fields, and malformed timer configuration, with the recipe and field named in the failure.
- Capability probe classification: each channel present and working, missing entirely, refused by policy, and refused for capability, plus the generated tone's WAV header and envelope.

### What is verified by hand

Rendering, legibility, and platform behaviour are confirmed manually in a desktop browser at 600 x 600 driven by arrow keys and Enter, then on the glasses. The manual pass covers: contrast and readability on the waveguide, that no screen scrolls or clips, that swipes map to the expected directions, and that a long timer behaves correctly across a real cooking session.

---

## Out of Scope

- **Parallel task orchestration.** The app does not schedule concurrent workstreams, compute a critical path, or tell the cook what to do now across multiple dishes. Recipes are linear. This was considered and deliberately deferred; the recipe schema carries per-step durations, so it remains reachable later.
- **Images and photography.** No recipe photos, no step illustrations.
- **Voice.** No voice commands and no spoken instructions. The platform exposes no microphone to Web Apps.
- **Camera.** Unavailable to Web Apps.
- **Search and text entry.** The platform has no text input. The menu is navigated, not searched.
- **Recipe authoring on device.** Recipes are added by editing the repository. Authoring is expected to happen by pasting prose into an assistant that emits conforming data.
- **Serving-size scaling and unit conversion.** Quantities are fixed as authored.
- **Offline operation.** Not supported by the platform.
- **Shopping lists, pantry tracking, meal planning, nutrition.**
- **Multi-user features, accounts, sync, or sharing.**
- **A companion Android or iOS application.** Explicitly rejected; see *Platform*.
- **Notifications.** Not available to Web Apps. The app cannot reach the user when it is not running.

---

## Further Notes

### Open questions carried into implementation

Two platform behaviours could not be established from the documentation and are being resolved by building rather than by a preliminary spike:

1. **Suspension and display sleep.** Nothing in the platform documentation describes application lifecycle, backgrounding, or display timeout. It is unknown whether a Web App continues executing while the display sleeps, whether interval callbacks are throttled, and how long the display stays lit unattended. The presence of "resume" in the system pinch menu suggests suspension is a real state.

   The design is already hardened against the bad outcome: absolute-timestamp timers rehydrate correctly regardless of what happened while the app was not running. What cannot be mitigated in the current design is an alert that needs to fire while the app is suspended. If suspension proves aggressive, the alert behaviour needs rethinking and the native path's advantages become materially more attractive.

2. **Audio and haptics.** The documentation lists supported capabilities (display, input, IMU, location, local storage, app icons) and unsupported ones (camera, microphone, text input, offline, notifications, back navigation). **Audio output and haptics appear on neither list.** The hardware has speakers and the Neural Band has haptics, but nothing confirms either is reachable from a Web App.

   This is worth probing early during implementation, because a working beep upgrades the alert from "a bright pulse in your peripheral vision" to something genuinely reliable at a stove. The alert design should be structured so that adding an audio or vibration trigger is a single addition at the point of expiry, not a redesign.

   **The probe.** `scripts/probe-capabilities.html` attempts all three channels — an HTML audio element, a Web Audio oscillator, and `navigator.vibrate()` — and renders each outcome on the display, since there is no console to read on the glasses. It is registered as its own Web App tile and stepped through with pinches, one channel at a time, so a tone or a buzz can be attributed to a single cause. The classification lives in `src/probe-capabilities.js` and is unit tested. See README.md, *The capability probe*.

   A probe reporting `accepted` means the platform took the request, **not** that a sound left the speakers or the band buzzed. Only a person wearing the glasses can settle that, so the device pass records what was heard and felt alongside what the API returned.

   **Result: not yet established.** The probe runs correctly in a desktop browser, but a desktop pass proves nothing about the device, and the run on the glasses has not been done. Until it is, the alert continues to assume brightness and motion are the only channels available.

### Development environment

- Desktop iteration in Chrome with the viewport at 600 x 600, driven by arrow keys and Enter. Per platform documentation, behaviour there is expected to match the glasses.
- A Meta Ray-Ban Display Web App Simulator Chrome extension exists, providing additive blending, environment backgrounds, D-pad input, and display tuning — a closer approximation than a plain browser window.
- A Wearables MCP documentation endpoint and a Web Apps GitHub plugin exist and may be worth wiring in.

### Reference

The Wearables Device Access Toolkit skill pack cached locally documents version 0.8.0 and is stale; 0.9.0 is the current release. This matters only if the native path is ever revisited, but the discrepancy is worth knowing about.

### Guiding principle

Every decision in this document was taken against a stated preference for the simplest and most seamless option available. Where a future change offers capability at the cost of moving parts, that trade should be made reluctantly.
