import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, DEFAULTS } from './sheet.mjs';
import { backRun } from './backrun.mjs';

const PIG = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const sum = a => a.reduce((s, v) => s + v, 0);
// a damp wash (film 0.01 mm, its paint settled) with a puddle of clean water 0.2 mm deep in its middle
function puddle(N = 60, mm = 0.25) {
  const s = createSheet(makePaper(N, N, { seed: 3, mmPerCell: mm }), [PIG]);
  for (let y = 5; y < N - 5; y++) for (let x = 5; x < N - 5; x++) deposit(s, y * N + x, 0.01, [0]);
  for (let i = 0; i < s.n; i++) if (s.M[i]) s.D[0][i] = 0.05;
  for (let y = 25; y < 35; y++) for (let x = 25; x < 35; x++) s.W[y * N + x] = 0.2;
  return s;
}

test('back-run: the puddle gives what the damp paint takes, and the paint pushed on is all kept', () => {
  const s = puddle(), o = { ...DEFAULTS, dt: 0.1 };
  const water = sum(s.W), paint = sum(s.G[0]) + sum(s.D[0]);
  let given = 0;
  for (let t = 0; t < 50; t++) given += backRun(s, o, [0, 0, s.w - 1, s.h - 1], 0.25);
  assert.ok(given > 0.1, `given ${given}`);
  // (the sheet's arrays are float32: each cell's sum rounds to 6e-8 of itself)
  assert.ok(Math.abs(sum(s.W) - water) < 1e-6 * water, `water ${sum(s.W)} against ${water}`);
  assert.ok(Math.abs(sum(s.G[0]) + sum(s.D[0]) - paint) < 1e-6 * paint, `paint ${sum(s.G[0]) + sum(s.D[0])} against ${paint}`);
});

test('back-run: off at levelFloor 0, at invade 0 and without levelling', () => {
  for (const over of [{ levelFloor: 0 }, { invade: 0 }, { level: 0 }]) {
    const s = puddle(), before = Float32Array.from(s.W);
    assert.equal(backRun(s, { ...DEFAULTS, dt: 0.1, ...over }, [0, 0, s.w - 1, s.h - 1], 0.25), 0);
    assert.deepEqual(Array.from(s.W), Array.from(before));
  }
});

test('clean water run into damp paint dries pale inside a darker front (a bloom)', () => {
  const N = 60, s = puddle(N);
  for (let t = 0; t < 600; t++) step(s, { ...DEFAULTS, dt: 0.1 });
  const paint = i => s.G[0][i] + s.D[0][i] + s.P[0][i];
  // along the middle row, out from the puddle's edge (x 35): a pale band where the water ran, a darker front where it
  // stopped, and the untouched wash beyond (x 52)
  const row = 30 * N, at = x => paint(row + x), beyond = at(52);
  let pale = Infinity, front = 0; for (let x = 33; x <= 40; x++) pale = Math.min(pale, at(x)); for (let x = 36; x <= 50; x++) front = Math.max(front, at(x));
  assert.ok(pale < 0.5 * beyond, `pale ${pale}, beyond ${beyond}`);
  assert.ok(front > 1.15 * beyond, `front ${front}, beyond ${beyond}`);
});
