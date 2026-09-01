import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROBES,
  TONE,
  base64,
  wavBytes,
  wavDataUri,
  runProbe,
  summarize,
  describeResult,
} from '../src/probe-capabilities.js';

const ascii = (bytes, at, length) =>
  String.fromCharCode(...bytes.slice(at, at + length));

const u32 = (bytes, at) =>
  bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24);

const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);

// An environment where every probe succeeds. Individual tests degrade one
// entry at a time, so each test names exactly the condition it is about.
function env(overrides = {}) {
  return {
    createAudio: () => ({ play: async () => {} }),
    AudioContext: fakeAudioContext(),
    vibrate: () => true,
    wait: async () => {},
    ...overrides,
  };
}

function fakeAudioContext({ state = 'running', resumesTo = 'running' } = {}) {
  return class {
    constructor() {
      this.state = state;
      this.destination = {};
      this.currentTime = 0;
    }
    async resume() {
      this.state = resumesTo;
    }
    async close() {}
    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() {},
      };
    }
  };
}

function rejectingAudio(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return () => ({ play: async () => { throw error; } });
}

test('base64 encodes with the right padding for every input length', () => {
  assert.equal(base64(new Uint8Array([])), '');
  assert.equal(base64(new Uint8Array([77])), 'TQ==');
  assert.equal(base64(new Uint8Array([77, 97])), 'TWE=');
  assert.equal(base64(new Uint8Array([77, 97, 110])), 'TWFu');
  assert.equal(base64(new Uint8Array([0, 0, 0, 255, 255, 255])), 'AAAA////');
});

test('wavBytes writes a header a decoder can read', () => {
  const bytes = wavBytes({ hz: 880, ms: 500, sampleRate: 8000 });
  const samples = 4000;
  const data = samples * 2;

  assert.equal(ascii(bytes, 0, 4), 'RIFF');
  assert.equal(u32(bytes, 4), 36 + data);
  assert.equal(ascii(bytes, 8, 4), 'WAVE');
  assert.equal(ascii(bytes, 12, 4), 'fmt ');
  assert.equal(u32(bytes, 16), 16);
  assert.equal(u16(bytes, 20), 1, 'PCM');
  assert.equal(u16(bytes, 22), 1, 'mono');
  assert.equal(u32(bytes, 24), 8000);
  assert.equal(u32(bytes, 28), 16000, 'byte rate');
  assert.equal(u16(bytes, 32), 2, 'block align');
  assert.equal(u16(bytes, 34), 16, 'bits per sample');
  assert.equal(ascii(bytes, 36, 4), 'data');
  assert.equal(u32(bytes, 40), data);
  assert.equal(bytes.length, 44 + data);
});

test('wavBytes fades both ends so the tone does not click', () => {
  const bytes = wavBytes(TONE);
  assert.equal(u16(bytes, 44), 0);
  assert.equal(u16(bytes, bytes.length - 2), 0);
});

test('wavBytes puts real signal in the middle', () => {
  const bytes = wavBytes(TONE);
  let peak = 0;
  for (let at = 44; at < bytes.length; at += 2) {
    const raw = u16(bytes, at);
    peak = Math.max(peak, Math.abs(raw > 32767 ? raw - 65536 : raw));
  }
  assert.ok(peak > 8000, `expected an audible peak, got ${peak}`);
});

test('wavDataUri is a playable audio source', () => {
  const uri = wavDataUri(TONE);
  assert.ok(uri.startsWith('data:audio/wav;base64,'));
  assert.ok(uri.length > 1000);
});

test('every probe id has a label', () => {
  for (const probe of PROBES) {
    assert.equal(typeof probe.id, 'string');
    assert.ok(probe.label.length > 0);
  }
});

test('an audio element that plays is accepted', async () => {
  const result = await runProbe('audio-element', env());
  assert.equal(result.status, 'accepted');
  assert.equal(result.id, 'audio-element');
});

test('an audio element blocked by autoplay policy is reported as blocked', async () => {
  const result = await runProbe('audio-element', env({
    createAudio: rejectingAudio('NotAllowedError', 'gesture required'),
  }));
  assert.equal(result.status, 'blocked');
  assert.match(result.detail, /NotAllowedError/);
});

test('an audio element that cannot decode is reported as rejected', async () => {
  const result = await runProbe('audio-element', env({
    createAudio: rejectingAudio('NotSupportedError'),
  }));
  assert.equal(result.status, 'rejected');
  assert.match(result.detail, /NotSupportedError/);
});

test('a missing audio constructor is reported as absent', async () => {
  const result = await runProbe('audio-element', env({ createAudio: undefined }));
  assert.equal(result.status, 'absent');
});

test('a running audio context is accepted', async () => {
  const result = await runProbe('web-audio', env());
  assert.equal(result.status, 'accepted');
});

test('an audio context that resumes out of suspension is accepted', async () => {
  const result = await runProbe('web-audio', env({
    AudioContext: fakeAudioContext({ state: 'suspended', resumesTo: 'running' }),
  }));
  assert.equal(result.status, 'accepted');
});

test('an audio context stuck in suspension is reported as blocked', async () => {
  const result = await runProbe('web-audio', env({
    AudioContext: fakeAudioContext({ state: 'suspended', resumesTo: 'suspended' }),
  }));
  assert.equal(result.status, 'blocked');
  assert.match(result.detail, /suspended/);
});

test('a missing AudioContext is reported as absent', async () => {
  const result = await runProbe('web-audio', env({ AudioContext: undefined }));
  assert.equal(result.status, 'absent');
});

test('a throwing AudioContext constructor is reported, not propagated', async () => {
  const result = await runProbe('web-audio', env({
    AudioContext: class { constructor() { throw new Error('no audio hardware'); } },
  }));
  assert.equal(result.status, 'error');
  assert.match(result.detail, /no audio hardware/);
});

test('vibrate returning true is accepted', async () => {
  const result = await runProbe('vibrate', env());
  assert.equal(result.status, 'accepted');
});

test('vibrate returning false is rejected', async () => {
  const result = await runProbe('vibrate', env({ vibrate: () => false }));
  assert.equal(result.status, 'rejected');
});

test('a missing vibrate is reported as absent', async () => {
  const result = await runProbe('vibrate', env({ vibrate: undefined }));
  assert.equal(result.status, 'absent');
});

test('an unknown probe id fails loudly', async () => {
  await assert.rejects(() => runProbe('telepathy', env()), /telepathy/);
});

test('summarize renders one transcribable line per result', () => {
  const results = [
    { id: 'audio-element', label: 'HTML audio element', status: 'accepted', detail: 'play() resolved' },
    { id: 'vibrate', label: 'navigator.vibrate()', status: 'absent', detail: 'not on navigator' },
  ];
  assert.deepEqual(summarize(results), [
    'HTML audio element: accepted — play() resolved',
    'navigator.vibrate(): absent — not on navigator',
  ]);
});

test('a context whose close() is not a promise still reports the probe result', async () => {
  const Context = fakeAudioContext();
  const result = await runProbe('web-audio', env({
    AudioContext: class extends Context {
      close() {}
    },
  }));
  assert.equal(result.status, 'accepted');
});

test('a context that throws on close still reports the probe result', async () => {
  const Context = fakeAudioContext();
  const result = await runProbe('web-audio', env({
    AudioContext: class extends Context {
      close() { throw new Error('already closed'); }
    },
  }));
  assert.equal(result.status, 'accepted');
});

test('describeResult is the single format summarize is built from', () => {
  const result = { id: 'vibrate', label: 'navigator.vibrate()', status: 'absent', detail: 'not on navigator' };
  assert.equal(describeResult(result), 'absent — not on navigator');
  assert.equal(summarize([result])[0], `${result.label}: ${describeResult(result)}`);
});
