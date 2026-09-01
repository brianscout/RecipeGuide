// Capability probe for audio output and haptics. Pure: no DOM, no globals.
// Everything the probe touches arrives as an injected environment, so the
// outcome classification — the part that decides a product question — is
// tested rather than observed once on a device and remembered.
//
// The question this answers is in docs/SPEC.md, "Open questions carried into
// implementation", item 2: the platform documentation lists audio and haptics
// as neither supported nor unsupported. See scripts/probe-capabilities.html
// for the page that runs this on the glasses.
//
// A word on what a pass means. `play()` resolving proves the platform accepted
// the request, not that a sound left the speakers. Only a person wearing the
// glasses can settle audibility, which is why the page asks for that
// separately rather than inferring it from these statuses.

/**
 * The probes, in the order the page steps through them. One at a time, so an
 * observer can attribute what they hear or feel to a single cause.
 */
export const PROBES = [
  { id: 'audio-element', label: 'HTML audio element' },
  { id: 'web-audio', label: 'Web Audio oscillator' },
  { id: 'vibrate', label: 'navigator.vibrate()' },
];

/**
 * 880 Hz is high enough to carry over a kitchen and unmistakably synthetic, so
 * it cannot be confused with an ambient sound. 8 kHz sampling is well clear of
 * Nyquist for that tone and keeps the generated data URI small, which matters
 * because the platform has no offline support and fetches the page every time.
 */
export const TONE = { hz: 880, ms: 400, sampleRate: 8000 };

/** Long-short-long. A single buzz is easy to mistake for an incoming message. */
export const VIBRATION_PATTERN = [200, 100, 200];

/**
 * Statuses, and what each one means for the alert design:
 *
 * - `absent`   the API is not on this platform at all. Channel unavailable.
 * - `blocked`  the API exists but refused for a policy reason. Likely reachable
 *              under the right conditions, so worth another attempt.
 * - `rejected` the API exists and refused for a capability reason. Treat as
 *              unavailable unless the detail says otherwise.
 * - `accepted` the platform took the request. Audibility still unconfirmed.
 * - `error`    the call threw before it could be attempted.
 */
export const STATUSES = ['absent', 'blocked', 'rejected', 'accepted', 'error'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 without btoa or Buffer. Hand-rolled so this module runs unchanged in
 * the test runner and on the device, the same reason scripts/make-icon.mjs
 * writes its own PNG.
 */
export function base64(bytes) {
  let out = '';
  for (let at = 0; at < bytes.length; at += 3) {
    const remaining = bytes.length - at;
    const chunk = (bytes[at] << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0);
    out += B64[(chunk >> 18) & 63] + B64[(chunk >> 12) & 63];
    out += remaining > 1 ? B64[(chunk >> 6) & 63] : '=';
    out += remaining > 2 ? B64[chunk & 63] : '=';
  }
  return out;
}

/**
 * A mono 16-bit PCM WAV of a single tone. Generated rather than committed as a
 * binary so the deployed bytes stay readable, and so the audio element probe
 * needs no second network request that could fail for unrelated reasons.
 */
export function wavBytes({ hz, ms, sampleRate }) {
  const samples = Math.round((sampleRate * ms) / 1000);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  let at = 0;

  const ascii = (text) => {
    for (const character of text) bytes[at++] = character.charCodeAt(0);
  };
  const u32 = (value) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const u16 = (value) => {
    view.setUint16(at, value, true);
    at += 2;
  };

  ascii('RIFF');
  u32(36 + samples * 2);
  ascii('WAVE');
  ascii('fmt ');
  u32(16); // fmt chunk length
  u16(1); // PCM
  u16(1); // mono
  u32(sampleRate);
  u32(sampleRate * 2); // byte rate
  u16(2); // block align
  u16(16); // bits per sample
  ascii('data');
  u32(samples * 2);

  // A tone that starts and stops at full amplitude clicks at both ends, and a
  // click is exactly the kind of artefact an observer would misreport as the
  // tone itself failing. Ramp in and out over an eighth of the duration.
  const fade = Math.max(1, Math.floor(samples / 8));
  for (let sample = 0; sample < samples; sample += 1) {
    const envelope = Math.min(1, sample / fade, (samples - 1 - sample) / fade);
    const value = Math.sin((2 * Math.PI * hz * sample) / sampleRate) * envelope * 0.6;
    view.setInt16(at, Math.round(value * 32767), true);
    at += 2;
  }
  return bytes;
}

/** The tone as a source an audio element can be handed directly. */
export function wavDataUri(tone) {
  return `data:audio/wav;base64,${base64(wavBytes(tone))}`;
}

const labelFor = (id) => PROBES.find((probe) => probe.id === id)?.label;

const describe = (error) =>
  error?.name && error.name !== 'Error'
    ? `${error.name}: ${error.message}`
    : String(error?.message ?? error);

async function probeAudioElement(env) {
  if (!env.createAudio) return ['absent', 'no Audio constructor on this platform'];

  let element;
  try {
    element = env.createAudio(wavDataUri(TONE));
  } catch (error) {
    return ['error', describe(error)];
  }

  try {
    await element.play();
  } catch (error) {
    // NotAllowedError is the autoplay policy, which a pinch should satisfy;
    // anything else points at the platform not carrying the capability.
    const status = error?.name === 'NotAllowedError' ? 'blocked' : 'rejected';
    return [status, describe(error)];
  }

  await env.wait(TONE.ms);
  return ['accepted', 'play() resolved — listen for the tone'];
}

async function probeWebAudio(env) {
  if (!env.AudioContext) return ['absent', 'no AudioContext on this platform'];

  let context;
  try {
    context = new env.AudioContext();
  } catch (error) {
    return ['error', describe(error)];
  }

  try {
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') {
      return ['blocked', `context state is ${context.state} after resume()`];
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = TONE.hz;
    gain.gain.value = 0.6;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + TONE.ms / 1000);

    await env.wait(TONE.ms);
    return ['accepted', 'oscillator ran with the context running — listen for the tone'];
  } catch (error) {
    return ['error', describe(error)];
  } finally {
    // Closing is housekeeping. A failure here must not replace the finding
    // that the probe just established, so it is swallowed deliberately.
    try {
      await context.close?.();
    } catch {}
  }
}

async function probeVibrate(env) {
  if (!env.vibrate) return ['absent', 'not on navigator'];
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
  'audio-element': probeAudioElement,
  'web-audio': probeWebAudio,
  'vibrate': probeVibrate,
};

/**
 * Run one probe and report what the platform did. Never throws for a probe
 * that fails — a failure is the finding, and on the glasses there is no
 * console in which an unhandled rejection could be seen.
 *
 * @param {string} id one of PROBES
 * @param {{ createAudio?, AudioContext?, vibrate?, wait }} env
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
