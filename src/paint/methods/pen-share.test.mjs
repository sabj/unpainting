import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { penShare, sourcePenShare, AUTO_INK_WIDTH } from './pen-share.mjs';

test('a white sheet with a few dark pen strokes reads as some pen line, blank paper as none', () => {
  const w = 120, h = 90, px = new Uint8Array(w * h * 3).fill(250);
  assert.equal(penShare(px, w, h), 0);
  for (let x = 10; x < 110; x++) for (const y of [20, 45, 70]) for (let dy = 0; dy < 2; dy++) { const i = ((y + dy) * w + x) * 3; px[i] = px[i + 1] = px[i + 2] = 40; }
  assert.ok(penShare(px, w, h) > 0);
});

// One pen sketch (brown ink on cream, hatching and contours) drawn as an SVG at any pixel width: the same picture, only its size changes.
const sketchPng = async width => {
  const s = width / 600, lines = [];
  for (let k = 0; k < 14; k++) lines.push(`<path d="M ${40 + k * 30} 60 C ${80 + k * 30} 200 ${10 + k * 30} 320 ${60 + k * 30} 520" stroke="#3a2412" stroke-width="2.2" fill="none"/>`);
  for (let k = 0; k < 8; k++) lines.push(`<path d="M 30 ${90 + k * 55} Q 300 ${60 + k * 55} 570 ${100 + k * 55}" stroke="#3a2412" stroke-width="1.8" fill="none"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(600 * s)}" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f1e6cf"/>${lines.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};
const rawShareAt = async width => {
  const { data, info } = await sharp(await sketchPng(width)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return penShare(data, info.width, info.height);
};

test('the pen-line share of one picture does not depend on the size it is read at', async () => {
  const small = await sketchPng(500), large = await sketchPng(1800);
  const a = await sourcePenShare({ image: small, sharp }), b = await sourcePenShare({ image: large, sharp });
  assert.ok(a > 0 && b > 0, `shares ${a} ${b}`);
  assert.ok(Math.abs(a - b) / Math.max(a, b) < 0.25, `read at ${AUTO_INK_WIDTH}: ${a} against ${b}`);
});

test('read at its own size the same picture gives a different share (why the share is read at one width)', async () => {
  const a = await rawShareAt(500), b = await rawShareAt(1800);
  assert.ok(Math.abs(a - b) / Math.max(a, b) > 0.25, `raw shares ${a} ${b}`);
});

test('sourcePenShare reads a file path the same as its bytes and rejects an unreadable path', async () => {
  const bytes = await sketchPng(600);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penshare-'));
  try {
    const file = path.join(dir, 'sketch.png');
    fs.writeFileSync(file, bytes);
    assert.equal(await sourcePenShare({ image: file, sharp }), await sourcePenShare({ image: bytes, sharp }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  await assert.rejects(() => sourcePenShare({ image: '/nonexistent/none.png', sharp }));
});

// A pale reed-pen drawing: sepia on cream, lines 3 and 4 cells wide at the reading width (0.7 and 0.9 mm on a 280 mm
// sheet, inside the widest nib), read at the medium measure's width.
const paleSketchPng = async () => {
  const lines = [];
  for (let k = 0; k < 10; k++) lines.push(`<path d="M ${60 + k * 45} 80 C ${110 + k * 45} 220 ${30 + k * 45} 340 ${90 + k * 45} 520" stroke="#c4a483" stroke-width="2" fill="none"/>`);
  for (let k = 0; k < 5; k++) lines.push(`<path d="M 40 ${120 + k * 80} Q 300 ${90 + k * 80} 560 ${130 + k * 80}" stroke="#c4a483" stroke-width="1.5" fill="none"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f5e8d4"/>${lines.join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
};

test('a pale, broad-nibbed pen drawing reads as a pen source (over the 0.5% auto rule)', async () => {
  const s = await sourcePenShare({ image: await paleSketchPng(), sharp });
  assert.ok(s >= 0.005, `pen share ${(100 * s).toFixed(3)}%`);
});

test('a speckled wash with no drawn line reads under the 0.5% auto rule', async () => {
  const dots = []; let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 1500; k++) dots.push(`<circle cx="${(rnd() * 600).toFixed(1)}" cy="${(rnd() * 600).toFixed(1)}" r="${(0.6 + rnd()).toFixed(2)}" fill="#6b5a48"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f5e8d4"/><rect x="60" y="60" width="480" height="480" fill="#d9c7ad"/>${dots.join('')}</svg>`;
  const s = await sourcePenShare({ image: await sharp(Buffer.from(svg)).png().toBuffer(), sharp });
  assert.ok(s < 0.005, `pen share ${(100 * s).toFixed(3)}%`);
});
