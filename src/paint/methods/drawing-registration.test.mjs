import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { aspectGap, registerDrawingFile, lineTargetOf } from './drawing-registration.mjs';
import { selectedDrawing } from './drawing-file.mjs';
import { bindLineTarget, lineTargetMismatch } from '../../crop/lines.mjs';

test('aspect gap: rounding between grids is nothing, another page shape is a share', () => {
  assert.ok(aspectGap({ w: 540, h: 442 }, 304, 249) < 0.002);
  assert.ok(Math.abs(aspectGap({ w: 1080, h: 1620 }, 817, 1024) - 0.197) < 0.002);
});

test('an empty no-medium drawing of another shape or image is bound to the target without a fit and stays declared', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-registration-'));
  try {
    const W = 200, H = 150, image = path.join(dir, 'target.png');
    await sharp(Buffer.alloc(W * H * 3, 240), { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
    for (const [name, doc] of [
      ['aspect', { image: { w: 300, h: 300 }, lines: [], medium: 'none' }],
      ['other', { image: { w: 400, h: 300 }, targetSHA256: 'f'.repeat(64), lines: [], medium: 'none' }],
    ]) {
      fs.writeFileSync(path.join(dir, `${name}-lines.json`), JSON.stringify(doc));
      const argv = [], stem = path.join(dir, `${name}-registered`);
      const rec = await registerDrawingFile({ base: path.join(dir, name), image, out: dir, stem, width: W, argv });
      assert.equal(rec.noLines, 'the drawing declares medium none');
      assert.deepEqual(argv, ['--drawingfile', stem]);
      const reg = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
      assert.deepEqual(reg.lines, []);
      assert.equal(reg.medium, 'none');
      assert.deepEqual(reg.image, { w: W, h: H });
      const t = await lineTargetOf(image);
      assert.equal(reg.targetSHA256, t.sha256);
      bindLineTarget(t);
      try {
        assert.equal(lineTargetMismatch(reg), null);
        const flags = { opt: (n, d) => (n === 'drawingfile' ? stem : d), num: (n, d) => Number(d) };
        assert.deepEqual(selectedDrawing({ first: true, w: W, h: H, ...flags, log: () => {}, walked: 0 }), []);
      } finally { bindLineTarget(null); }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a drawing from a page of another shape is registered to the target and the pens are pointed at it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-registration-'));
  // a 200 x 150 target with a dark rectangle outline; the drawing of it on a 300 x 300 page
  const W = 200, H = 150, px = Buffer.alloc(W * H * 3, 255);
  const dot = (x, y) => { for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = 20; };
  for (let x = 40; x <= 160; x++) { dot(x, 30); dot(x, 31); dot(x, 120); dot(x, 121); }
  for (let y = 30; y <= 121; y++) { dot(40, y); dot(41, y); dot(160, y); dot(161, y); }
  const image = path.join(dir, 'target.png');
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
  const to = ([x, y]) => [(x - 6) / 0.62, (y + 4) / 0.47];
  fs.writeFileSync(path.join(dir, 'drawing-lines.json'), JSON.stringify({ image: { w: 300, h: 300 }, lines: [{ points: [[40, 30], [160, 30], [160, 120], [40, 120], [40, 30]].map(to) }] }));
  const argv = [];
  const rec = await registerDrawingFile({ base: path.join(dir, 'drawing'), image, out: dir, width: W, argv });
  assert.ok(rec, 'registered');
  assert.deepEqual(argv, ['--drawingfile', path.join(dir, 'lines-registered')]);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'lines-registered-lines.json'), 'utf8'));
  assert.deepEqual(doc.image, { w: W, h: H });
  assert.ok(rec.scoreCells.registered.both < rec.scoreCells.naive.both);
  const [x, y] = doc.lines[0].points[1];
  assert.ok(Math.hypot(x - 160, y - 30) < 3, `corner at ${x}, ${y}`);
  // a file already on the target's shape is left alone
  const again = [];
  assert.equal(await registerDrawingFile({ base: path.join(dir, 'lines-registered'), image, out: dir, width: W, argv: again }), null);
  assert.deepEqual(again, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
