import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePlane } from './two-grid-measure.mjs';

test('uniform KM density has no resolved grain, and unresolved bands stay null', () => {
  for (const mm of [0.1, 0.13]) {
    const w = Math.round(46 / mm), m = measurePlane(new Float32Array(w * w).fill(0.36), w, w, mm);
    assert.ok(m.meanOD > 0);
    if (mm === 0.1) assert.equal(m.grain02.sd, 0); else assert.equal(m.grain02, null);
    assert.equal(m.grain05.sd, 0);
  }
});

test('measurements reject missing and invalid native pigment data', () => {
  assert.throws(() => measurePlane(new Float32Array(3), 2, 2, 0.1), /geometry/);
  assert.throws(() => measurePlane(new Float32Array([NaN]), 1, 1, 0.1), /nonfinite/);
});
