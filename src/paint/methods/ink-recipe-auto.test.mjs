import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chooseInkRecipe, penShare, sourcePenShare, AUTO_INK_WIDTH, DRAWING_FLAGS, DEFAULT_INK_RECIPE } from './ink-recipe-auto.mjs';

test('auto picks wash from the pen-line share and the --penfirst threshold', () => {
  assert.equal(chooseInkRecipe('auto', [], () => 0.01).recipe, 'wash');
  assert.equal(chooseInkRecipe('auto', [], () => 0.005).recipe, 'wash');
  assert.equal(chooseInkRecipe('auto', [], () => 0.002).recipe, 'none');
  assert.equal(chooseInkRecipe('auto', [], () => 0.01, 2).recipe, 'none');
});

test('auto leaves a run that sets its own drawing alone and does not measure the picture', () => {
  for (const f of DRAWING_FLAGS) {
    const r = chooseInkRecipe('auto', ['--seed', '0', f, 'x'], () => { throw new Error('measured'); });
    assert.equal(r.recipe, 'none');
    assert.match(r.why, new RegExp(f));
  }
});

test('a named recipe is returned unchanged', () => {
  for (const n of ['wash', 'v2', 'none']) assert.deepEqual(chooseInkRecipe(n, ['--drawing', 'both'], () => 0), { recipe: n, why: null });
});

test('a white sheet with a few dark pen strokes reads as some pen line, blank paper as none', () => {
  const w = 120, h = 90, px = new Uint8Array(w * h * 3).fill(250);
  assert.equal(penShare(px, w, h), 0);
  for (let x = 10; x < 110; x++) for (const y of [20, 45, 70]) for (let dy = 0; dy < 2; dy++) { const i = ((y + dy) * w + x) * 3; px[i] = px[i + 1] = px[i + 2] = 40; }
  assert.ok(penShare(px, w, h) > 0);
});

test('the default recipe is none, so a pen drawing source gets no ink unless asked', () => {
  assert.equal(DEFAULT_INK_RECIPE, 'none');
  assert.equal(chooseInkRecipe(DEFAULT_INK_RECIPE, [], () => { throw new Error('measured'); }).recipe, 'none');
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
