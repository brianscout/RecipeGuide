import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROBES,
  STATUSES,
  VIBRATION_PATTERN,
  runProbe,
  summarize,
  describeResult,
} from '../src/probe-capabilities.js';

// An environment where the probe succeeds. Individual tests degrade one entry
// at a time, so each test names exactly the condition it is about.
function env(overrides = {}) {
  return {
    vibrate: () => true,
    wait: async () => {},
    ...overrides,
  };
}

test('every probe id has a label', () => {
  for (const probe of PROBES) {
    assert.equal(typeof probe.id, 'string');
    assert.ok(probe.label.length > 0);
  }
});

test('vibrate returning true is accepted', async () => {
  const result = await runProbe('vibrate', env());
  assert.equal(result.status, 'accepted');
  assert.equal(result.id, 'vibrate');
});

test('vibrate returning false is rejected', async () => {
  const result = await runProbe('vibrate', env({ vibrate: () => false }));
  assert.equal(result.status, 'rejected');
  assert.match(result.detail, /returned false/);
});

test('a vibrate that reports anything other than true is rejected', async () => {
  // Some engines return undefined rather than a boolean. Undefined is not
  // acceptance, and reading it as one would report a working buzz that never
  // happened — the single worst outcome for a probe.
  const result = await runProbe('vibrate', env({ vibrate: () => undefined }));
  assert.equal(result.status, 'rejected');
});

test('a missing vibrate is reported as absent', async () => {
  const result = await runProbe('vibrate', env({ vibrate: undefined }));
  assert.equal(result.status, 'absent');
});

test('a throwing vibrate is reported, not propagated', async () => {
  const result = await runProbe('vibrate', env({
    vibrate: () => { throw new Error('bad pattern'); },
  }));
  assert.equal(result.status, 'error');
  assert.match(result.detail, /bad pattern/);
});

test('the probe waits out the pattern before reporting', async () => {
  const waits = [];
  await runProbe('vibrate', env({ wait: async (ms) => { waits.push(ms); } }));
  assert.deepEqual(waits, [500], 'the full length of [200, 100, 200]');
});

test('the pattern is long-short-long, not a single buzz', () => {
  assert.deepEqual(VIBRATION_PATTERN, [200, 100, 200]);
});

test('every status a probe can return is documented', async () => {
  const environments = [
    env(),
    env({ vibrate: () => false }),
    env({ vibrate: undefined }),
    env({ vibrate: () => { throw new Error('nope'); } }),
  ];
  for (const candidate of environments) {
    const result = await runProbe('vibrate', candidate);
    assert.ok(STATUSES.includes(result.status), `undocumented status: ${result.status}`);
  }
});

test('an unknown probe id fails loudly', async () => {
  await assert.rejects(() => runProbe('telepathy', env()), /telepathy/);
});

test('describeResult is the single format summarize is built from', () => {
  const result = { id: 'vibrate', label: 'navigator.vibrate()', status: 'absent', detail: 'not on navigator' };
  assert.equal(describeResult(result), 'absent — not on navigator');
  assert.equal(summarize([result])[0], `${result.label}: ${describeResult(result)}`);
});

test('summarize renders one transcribable line per result', () => {
  const results = [
    { id: 'vibrate', label: 'navigator.vibrate()', status: 'accepted', detail: 'returned true' },
  ];
  assert.deepEqual(summarize(results), ['navigator.vibrate(): accepted — returned true']);
});

// Chrome refuses navigator.vibrate() without transient user activation and
// returns false — which is indistinguishable from a platform that has no
// haptics. Reporting that as `rejected` would be a false negative, and a false
// negative here would retire a channel the product may actually have.
test('no user activation is blocked, not rejected', async () => {
  let called = false;
  const result = await runProbe('vibrate', env({
    hasUserActivation: () => false,
    vibrate: () => { called = true; return false; },
  }));
  assert.equal(result.status, 'blocked');
  assert.match(result.detail, /activation/i);
  assert.equal(called, false, 'must not call vibrate when the answer would be meaningless');
});

test('user activation present runs the probe normally', async () => {
  const result = await runProbe('vibrate', env({ hasUserActivation: () => true }));
  assert.equal(result.status, 'accepted');
});

test('an engine without userActivation still runs the probe', async () => {
  // The check is a guard against a misleading result, not a prerequisite. An
  // engine that cannot report activation should still be probed.
  const result = await runProbe('vibrate', env({ hasUserActivation: undefined }));
  assert.equal(result.status, 'accepted');
});

test('blocked is a documented status', () => {
  assert.ok(STATUSES.includes('blocked'));
});
