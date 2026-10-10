import test from 'node:test';
import assert from 'node:assert';
import { choosePlateMixes, toMixAmounts } from './mixes.mjs';

/** A sheet of `cells` cells in `k` pans, built from a few true colours so the right answer is known. */
function sheet(colours, per, k) {
  const n = colours.length * per, A = new Float32Array(n * k);
  let i = 0;
  for (const [c, strength] of colours) for (let q = 0; q < per; q++, i++) {
    const s = strength * (0.4 + 0.6 * ((q + 1) / per));
    for (let j = 0; j < k; j++) A[i * k + j] = c[j] * s;
  }
  return { A, n };
}

test('it finds the colours the picture was painted with', () => {
  const truth = [[0.7, 0.3, 0], [0, 0.5, 0.5], [0.2, 0.2, 0.6]];
  const { A, n } = sheet(truth.map(c => [c, 1]), 40, 3);
  const mixes = choosePlateMixes(A, n, 3, 6);
  for (const t of truth) {
    const near = mixes.map(m => Math.hypot(...t.map((v, j) => v - m[j]))).sort((a, b) => a - b)[0];
    assert.ok(near < 0.12, `no puddle near ${t}: nearest off by ${near.toFixed(3)}`);
  }
});

test('a cell painted from the puddles keeps its mass', () => {
  const truth = [[0.7, 0.3, 0], [0, 0.5, 0.5], [0.2, 0.2, 0.6]];
  const { A, n } = sheet(truth.map(c => [c, 1]), 40, 3);
  const mixes = choosePlateMixes(A, n, 3, 6);
  const { AM, kept } = toMixAmounts(A, n, 3, mixes);
  assert.ok(kept > 0.95, `kept only ${(100 * kept).toFixed(1)}%`);
  // a pan may run over what the cell wanted, but only by the tolerance
  for (let i = 0; i < n; i++) {
    let t = 0;
    for (let j = 0; j < 3; j++) t += A[i * 3 + j];
    for (let j = 0; j < 3; j++) {
      let v = 0;
      for (let c = 0; c < mixes.length; c++) v += AM[i * mixes.length + c] * mixes[c][j];
      assert.ok(v <= A[i * 3 + j] + 0.36 * t + 1e-4, `cell ${i} pan ${j} over-delivered ${v} vs ${A[i * 3 + j]}`);
    }
  }
});

test('a puddle is two or three pigments, never a trace of everything', () => {
  const { A, n } = sheet([[[0.34, 0.33, 0.33], 1], [[0.8, 0.15, 0.05], 1]], 30, 3);
  const mixes = choosePlateMixes(A, n, 3, 4, { floor: 0.1 });
  for (const m of mixes) {
    for (const v of m) assert.ok(v === 0 || v >= 0.05, `a trace of ${v} survived the floor`);
    assert.ok(Math.abs([...m].reduce((a, b) => a + b, 0) - 1) < 1e-6, 'a puddle must sum to one');
  }
});

test('one pigment is its own puddle', () => {
  const A = new Float32Array(20), n = 20;
  for (let i = 0; i < n; i++) A[i] = 0.5;
  const mixes = choosePlateMixes(A, n, 1, 8);
  assert.equal(mixes.length, 1);
  assert.equal(mixes[0][0], 1);
});

test('a plate with more colours than puddles still loses little', () => {
  const truth = [[0.9, 0.1, 0], [0.6, 0.4, 0], [0.3, 0.4, 0.3], [0, 0.4, 0.6], [0.1, 0.1, 0.8], [0.5, 0, 0.5]];
  const { A, n } = sheet(truth.map(c => [c, 1]), 25, 3);
  const { kept } = toMixAmounts(A, n, 3, choosePlateMixes(A, n, 3, 4));
  assert.ok(kept > 0.9, `kept only ${(100 * kept).toFixed(1)}% with four puddles for six colours`);
});
