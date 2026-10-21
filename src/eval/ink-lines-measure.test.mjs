import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLines, lineMeasures, localLight } from './ink-lines-measure.mjs';

// A paper sheet with brown pen lines: `lines` are [x0, x1, y, value] horizontal strokes `width` cells thick.
function sheet(w, h, lines, { width = 2, paper = [240, 232, 214], ink = [110, 80, 50] } = {}) {
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(paper, i * 3);
  for (const [x0, x1, y, t] of lines) for (let x = x0; x <= x1; x++) for (let d = 0; d < width; d++) {
    const i = (y + d) * w + x;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(paper[c] + (ink[c] - paper[c]) * t);
  }
  return rgb;
}

test('a painting that copies the source line for line agrees with it', () => {
  const src = sheet(64, 48, [[8, 56, 12, 1], [8, 56, 30, 1]]);
  const r = compareLines(src, src, 64, 48);
  assert.equal(r.visible.recall, 1);
  assert.equal(r.visible.precision, 1);
  assert.ok(Math.abs(r.source.darkness.p50 - r.painted.darkness.p50) < 1e-9);
  assert.ok(r.source.hue > 1, 'brown ink absorbs more blue than red');
});

test('a fainter copy reads as lighter at the source line cells', () => {
  const src = sheet(64, 48, [[8, 56, 12, 1]]), faint = sheet(64, 48, [[8, 56, 12, 0.3]]);
  const r = compareLines(src, faint, 64, 48);
  assert.ok(r.darknessAtSourceLines.painted < 0.5 * r.darknessAtSourceLines.source);
});

test('lines the source does not have count against precision on the pen layer', () => {
  const src = sheet(64, 48, [[8, 56, 12, 1]]), pen = sheet(64, 48, [[8, 56, 12, 1], [8, 56, 34, 1]]);
  const r = compareLines(src, pen, 64, 48, { pen });
  assert.equal(r.placement.from, 'pen layer');
  assert.ok(r.placement.recall > 0.9);
  assert.ok(r.placement.precision < 0.7);
});

test('darkness is read against the lightest cell nearby, and broken lines count as more pieces', () => {
  const w = 40, h = 20, rgb = sheet(w, h, [[2, 37, 8, 1]]);
  const { L, light } = localLight(rgb, w, h, 3);
  const i = 9 * w + 20;
  assert.ok(light[i] > L[i]);
  const whole = new Uint8Array(w * h), broken = new Uint8Array(w * h);
  for (let x = 2; x <= 37; x++) { whole[8 * w + x] = 1; if (x % 6 < 4) broken[8 * w + x] = 1; }
  const paper = [240, 232, 214];
  assert.ok(lineMeasures(rgb, w, h, broken, paper).pieces.per1000 > lineMeasures(rgb, w, h, whole, paper).pieces.per1000);
});
