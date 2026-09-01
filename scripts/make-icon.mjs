// Generates assets/icon-192.png.
//
// The platform requires a PNG of at least 52 x 52 and does not support SVG
// favicons, so the icon is a raster. It is generated rather than committed as
// an opaque binary: the mark is three stacked bars, the top one accented,
// which stays legible at app-grid size.
//
// Usage: node scripts/make-icon.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 192;
const GROUND = [16, 16, 16];
const CONTENT = [255, 246, 232];
const ACCENT = [255, 176, 32];

const BARS = [
  { y: 52, width: 108, color: ACCENT },
  { y: 88, width: 88, color: CONTENT },
  { y: 124, width: 68, color: CONTENT },
];
const BAR_HEIGHT = 16;
const BAR_X = 42;

function makePixels() {
  const pixels = new Uint8Array(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    pixels.set(GROUND, i * 3);
  }
  for (const bar of BARS) {
    const radius = BAR_HEIGHT / 2;
    for (let y = bar.y; y < bar.y + BAR_HEIGHT; y += 1) {
      for (let x = BAR_X; x < BAR_X + bar.width; x += 1) {
        if (!insideRoundedBar(x, y, bar, radius)) continue;
        pixels.set(bar.color, (y * SIZE + x) * 3);
      }
    }
  }
  return pixels;
}

function insideRoundedBar(x, y, bar, radius) {
  const left = BAR_X + radius;
  const right = BAR_X + bar.width - radius;
  const centreY = bar.y + radius;
  const nearestX = Math.min(Math.max(x + 0.5, left), right);
  const dx = x + 0.5 - nearestX;
  const dy = y + 0.5 - centreY;
  return dx * dx + dy * dy <= radius * radius;
}

function toScanlines(pixels) {
  const stride = SIZE * 3;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return raw;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(toScanlines(pixels), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'assets', 'icon-192.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(makePixels()));
console.log(`wrote ${out}`);
