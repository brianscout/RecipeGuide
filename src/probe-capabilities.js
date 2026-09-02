// Capability probe for haptics. Pure: no DOM, no globals. The browser API it
// exercises arrives as an injected environment, so the outcome classification
// — the part that decides a product question — is tested rather than observed
// once on a device and remembered.
//
// The question this answers is in docs/SPEC.md, "Open questions carried into
// implementation", item 2: the platform documentation lists haptics as neither
// supported nor unsupported. See scripts/probe-capabilities.html for the page
// that runs this on the glasses.
//
// Audio was deliberately dropped, not overlooked. The alert only needs one
// channel that reaches a cook who is not looking at the display, and a buzz on
// the wrist is the better one to have: it is silent in company, survives a
// noisy kitchen, and cannot be mistaken for something on the stove.
//
// A word on what a pass means. `vibrate()` returning true proves the platform
// accepted the request, not that the band moved. Only a person wearing it can
// settle that, which is why the page asks for that separately rather than
// inferring it from these statuses.

/** The probes, in the order the page steps through them. */
export const PROBES = [
  { id: 'vibrate', label: 'navigator.vibrate()' },
];

/** Long-short-long. A single buzz is easy to mistake for an incoming message. */
export const VIBRATION_PATTERN = [200, 100, 200];

/**
 * Statuses, and what each one means for the alert design:
 *
 * - `absent`   the API is not on this platform at all. Channel unavailable.
 * - `blocked`  the request was never made, because making it would have
 *              produced a meaningless answer. Says nothing about the platform.
 * - `rejected` the API exists and refused. Treat as unavailable unless the
 *              detail says otherwise.
 * - `accepted` the platform took the request. Whether the band moved is a
 *              separate fact, established by the wearer.
 * - `error`    the call threw before it could be attempted.
 */
export const STATUSES = ['absent', 'blocked', 'rejected', 'accepted', 'error'];

const labelFor = (id) => PROBES.find((probe) => probe.id === id)?.label;

const describe = (error) =>
  error?.name && error.name !== 'Error'
    ? `${error.name}: ${error.message}`
    : String(error?.message ?? error);

async function probeVibrate(env) {
  if (!env.vibrate) return ['absent', 'not on navigator'];

  // Chrome refuses vibrate() without transient user activation and returns
  // false — the same false a platform with no haptics returns. Calling anyway
  // would produce a result that cannot be told apart from the finding this
  // probe exists to establish, so don't call: report why instead. The check is
  // skipped where the engine cannot answer it, since it guards against a
  // misleading result rather than being a prerequisite for a real one.
  if (env.hasUserActivation && !env.hasUserActivation()) {
    return ['blocked', 'no user activation — the pinch was not seen as a gesture, so this says nothing about the platform'];
  }

  try {
    const accepted = env.vibrate(VIBRATION_PATTERN);
    const call = `vibrate([${VIBRATION_PATTERN}])`;
    if (accepted !== true) return ['rejected', `${call} returned ${accepted}`];
    await env.wait(VIBRATION_PATTERN.reduce((total, part) => total + part, 0));
    return ['accepted', `${call} returned true — feel for the band`];
  } catch (error) {
    return ['error', describe(error)];
  }
}

const RUNNERS = {
  'vibrate': probeVibrate,
};

/**
 * Run one probe and report what the platform did. Never throws for a probe
 * that fails — a failure is the finding, and on the glasses there is no
 * console in which an unhandled rejection could be seen.
 *
 * @param {string} id one of PROBES
 * @param {{ vibrate?, wait }} env
 * @returns {Promise<{ id, label, status, detail }>}
 */
export async function runProbe(id, env) {
  const runner = RUNNERS[id];
  if (!runner) throw new Error(`Unknown probe: ${id}`);
  const [status, detail] = await runner(env);
  return { id, label: labelFor(id), status, detail };
}

/**
 * What one probe found, without the label. The page draws this against a row
 * that already carries the label, and summarize prefixes it — one format, so a
 * row on the glasses and a line transcribed into the issue cannot disagree.
 */
export function describeResult({ status, detail }) {
  return `${status} — ${detail}`;
}

/** One line per result, in a shape that can be pasted straight into the issue. */
export function summarize(results) {
  return results.map((result) => `${result.label}: ${describeResult(result)}`);
}
