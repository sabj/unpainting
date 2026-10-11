import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePaper, paperReady } from './wetdry.mjs';

test('uniform paper observation preserves all metrics, ties and material decisions', () => {
  const w = 17, h = 13, n = w * h, sheet = { w, h, W: new Float32Array(n), s: new Float32Array(n), paper: { capacity: new Float32Array(n).fill(1) } };
  for (let trial = 0; trial < 80; trial++) {
    for (let i = 0; i < n; i++) {
      sheet.W[i] = trial % 4 === 0 ? 0 : trial % 4 === 1 ? .031 : trial % 4 === 2 ? (i % 7) / 100 : i % 3 ? 0 : -0;
      sheet.s[i] = trial % 3 === 0 ? .01 : (i % 17) / 20;
    }
    const cells = Array.from({ length: trial % n }, (_, j) => j * 19 % n);
    const before = measurePaper(sheet, cells), after = measurePaper(sheet, cells, false, { uniform: true });
    assert.deepEqual(after, before);
    assert.equal(paperReady(after, 'dry layer'), paperReady(before, 'dry layer'));
    assert.equal(paperReady(after, 'wet blend'), paperReady(before, 'wet blend'));
  }
});

test('uniform observation still reads fresh GPU state before deciding and rejects non-finite values', () => {
  const calls = [], sheet = { w: 3, h: 2, W: new Float32Array(6), s: new Float32Array(6), paper: { capacity: new Float32Array(6).fill(1) },
    _gpu: { ensurePaperFresh(target, rect, force) { calls.push({ rect, force }); target.W.fill(.02); } } };
  const cells = [1, 4, 5];
  assert.deepEqual(measurePaper(sheet, cells, true, { uniform: true }), measurePaper(sheet, cells, true));
  assert.deepEqual(calls, [{ rect: [1, 0, 2, 2], force: true }, { rect: [1, 0, 2, 2], force: true }]);
  sheet._gpu = null;
  for (const value of [NaN, Infinity, -Infinity]) {
    sheet.W[4] = value;
    assert.throws(() => measurePaper(sheet, cells, false, { uniform: true }), /Non-finite paper state/);
  }
});
