import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tipMarks, darkClip, tipTouchMm2 } from './final-dark-marks.mjs';
import { roleBrushMm, footprintMm2 } from './brush-footprint.mjs';

test('the accent floor is one touch of the detail brush tip, larger than the old 0.5 mm2', () => {
  const tip = roleBrushMm(new URL('../../../', import.meta.url).pathname, 'detail');
  assert.equal(tip, 1.2);
  assert.ok(Math.abs(tipTouchMm2(tip) - Math.PI * 0.36) < 1e-12);
  assert.ok(tipTouchMm2(tip) > 0.5);
});

test('every final-dark mark is exactly one tip wide', () => {
  const m = tipMarks([[{ x: 1, y: 1, r: 0.5 }, { x: 2, y: 1, r: 9 }]], 2.5);
  assert.deepEqual(m[0].map(p => p.r), [2.5, 2.5]);
  assert.throws(() => tipMarks([], 0));
});

test('the dark marks are kept off reserved lights only, never clipped to the accent cells', () => {
  assert.deepEqual([...darkClip(Uint8Array.from([0, 1, 0]))], [1, 0, 1]);
  assert.equal(darkClip(null), null);
  const paint = fs.readFileSync(new URL('../../../tools/plate/paint.mjs', import.meta.url), 'utf8');
  const line = paint.split('\n').find(l => l.startsWith('  if (layer._darkPass) {'));
  assert.ok(line, 'the final-dark clip line');
  assert.doesNotMatch(line, /MASK/, 'the final-dark clip is not built from the accent cells');
  assert.match(paint, /tipMarks\(washPaths\(up\(MASK\), W2, H2, \{ pad: 0\.2 \* SC, minRadius: TIP_R/);
  const drawing = fs.readFileSync(new URL('../../../tools/plate/drawing.mjs', import.meta.url), 'utf8');
  assert.match(drawing, /minMm2: num\('fdminmm2', tipTouchMm2\(/);
});

test('a footprint is a disc of the belly width, and a missing brush fails loudly', () => {
  assert.ok(Math.abs(footprintMm2(3) - Math.PI * 2.25) < 1e-12);
  assert.throws(() => footprintMm2(0));
  assert.throws(() => roleBrushMm(new URL('../../../', import.meta.url).pathname, 'nosuchrole'), /no nosuchrole brush/);
});
