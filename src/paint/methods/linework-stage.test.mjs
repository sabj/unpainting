import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { planUniversalLinework, withinBudget } from './linework-stage.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
// a pen drawing of a house on white paper: walls, roof and a door, in thin black lines
async function house(file) {
  const w = 240, h = 180, rgb = Buffer.alloc(w * h * 3, 250);
  const ink = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) rgb.fill(20, 3 * (y * w + x), 3 * (y * w + x) + 3); };
  for (let x = 60; x <= 180; x++) { ink(x, 80); ink(x, 160); }
  for (let y = 80; y <= 160; y++) { ink(60, y); ink(180, y); ink(105, y > 115 ? y : -1); ink(135, y > 115 ? y : -1); }
  for (let x = 105; x <= 135; x++) ink(x, 115);
  for (let k = 0; k <= 60; k++) { ink(60 + k, 80 - Math.round(k * 0.6)); ink(180 - k, 80 - Math.round(k * 0.6)); }
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
}

test('the budget keeps the longest, heaviest lines in their own order', () => {
  const line = (L, weight = 1) => ({ weight, points: [{ x: 0, y: 0 }, { x: L, y: 0 }] });
  const lines = [line(10), line(50), line(20, 0.2), line(30)];
  const kept = withinBudget(lines, 85, 1);
  assert.deepEqual(kept.map(g => g.points[1].x), [50, 30]);
  assert.equal(withinBudget(lines, 0, 1).length, 1, 'the strongest line stays even over a zero budget');
});

test('without python the stage traces the target, gates it and writes an ordinary drawing file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-stage-')), image = path.join(dir, 'house.png');
  await house(image);
  const r = await planUniversalLinework({ image, out: dir, root, width: 240, sheetMm: 152.4, python: null, sketchCache: null });
  assert.equal(r.record.source, 'trace');
  assert.equal(r.record.features.perspective, null);
  assert.ok(r.record.sources.some(s => s.source === 'sketch' && !s.accepted));
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'lines-universal-lines.json'), 'utf8'));
  assert.deepEqual(doc.image, { w: 240, h: 180 });
  assert.ok(doc.lines.length > 0 && doc.lines.every(g => g.points.length >= 2));
  assert.deepEqual(r.flags.slice(0, 2), ['--drawingfile', path.join(dir, 'lines-universal')]);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'linework-stage.json'), 'utf8')).gate.why.length > 0);
});

test('an explicit medium is kept, and none draws nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-stage-')), image = path.join(dir, 'house.png');
  await house(image);
  const ink = await planUniversalLinework({ image, out: dir, root, width: 240, sheetMm: 152.4, requested: 'ink' });
  assert.equal(ink.record.gate.medium, 'ink');
  assert.ok(!ink.flags.includes('--outlinemedium'), 'the explicit medium is the caller\'s, not repeated');
  const none = await planUniversalLinework({ image, out: dir, root, width: 240, sheetMm: 152.4, requested: 'none' });
  assert.deepEqual(none.flags, ['--drawing', 'none']);
  await assert.rejects(planUniversalLinework({ image, out: dir, root, width: 240, sheetMm: 152.4, requested: 'crayon' }), /--linemedium/);
});

// a painted (not drawn) house: flat colour blocks, no pen line, so the stage tries a sketch first
async function blocks(file) {
  const w = 240, h = 180, rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.set(x > 60 && x < 180 && y > 80 && y < 160 ? [200, 120, 60] : y < 100 ? [150, 190, 230] : [120, 160, 80], 3 * (y * w + x));
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file);
}

test('a cached sketch that fails the geometry check falls back, and the check is recorded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linework-stage-')), image = path.join(dir, 'house.png'), cache = path.join(dir, 'sketches');
  await blocks(image);
  fs.mkdirSync(cache);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex');
  // an invented sketch: a ship's mast and rigging where the house has empty paper
  const w = 240, h = 180, rgb = Buffer.alloc(w * h * 3, 250);
  for (let y = 5; y < 175; y++) rgb.fill(20, 3 * (y * w + 20), 3 * (y * w + 20) + 3);
  for (let k = 0; k < 150; k++) { const x = 20 + k, y = 10 + Math.round(k * 0.4); rgb.fill(20, 3 * (y * w + x), 3 * (y * w + x) + 3); }
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(cache, `${sha}.png`));
  const r = await planUniversalLinework({ image, out: dir, root, width: 240, sheetMm: 152.4, sketchCache: cache });
  const sketch = r.record.sources.find(s => s.source === 'sketch');
  assert.equal(sketch.accepted, false);
  assert.ok(sketch.why.length > 0);
  assert.notEqual(r.record.source, 'sketch');
});
