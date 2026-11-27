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

test('back-run: the puddle gives what the damp paint takes, and the paint pushed on is all kept', t => {
  const s = puddle(), o = { ...DEFAULTS, dt: 0.1 };
  const water = sum(s.W), paint = sum(s.G[0]) + sum(s.D[0]);
  let given = 0;
  for (let t = 0; t < 50; t++) given += backRun(s, o, [0, 0, s.w - 1, s.h - 1], 0.25);
  assert.ok(given > 0.1, `given ${given}`);
  // (the sheet's arrays are float32: each cell's sum rounds to 6e-8 of itself)
  assert.ok(Math.abs(sum(s.W) - water) < 1e-6 * water, `water ${sum(s.W)} against ${water}`);
  assert.ok(Math.abs(sum(s.G[0]) + sum(s.D[0]) - paint) < 1e-6 * paint, `paint ${sum(s.G[0]) + sum(s.D[0])} against ${paint}`);
  t.diagnostic(JSON.stringify({ given, waterRelativeError: Math.abs(sum(s.W) / water - 1), pigmentRelativeError: Math.abs((sum(s.G[0]) + sum(s.D[0])) / paint - 1) }));
});

test('back-run: off at levelFloor 0, at invade 0 and without levelling', () => {
  for (const over of [{ levelFloor: 0 }, { invade: 0 }, { level: 0 }]) {
    const s = puddle(), before = Float32Array.from(s.W);
    assert.equal(backRun(s, { ...DEFAULTS, dt: 0.1, ...over }, [0, 0, s.w - 1, s.h - 1], 0.25), 0);
    assert.deepEqual(Array.from(s.W), Array.from(before));
  }
});

test('back-run: the fibre throat pins a damp front until the puddle supplies its entry head', () => {
  const n = 5, s = createSheet(makePaper(n, n, { seed: 2, mmPerCell: 0.25 }), [PIG]), centre = 12;
  s.paper.surface.fill(0.5); s.paper.throat.fill(0.5);
  s.paper.fdx.fill(1); s.paper.fdy.fill(0); s.paper.grain.fill(1);
  for (let i = 0; i < s.n; i++) deposit(s, i, 0.01, [0.02]);
  s.W[centre] = 0.2;
  // All four receivers have the same relief and throat. Along the fibres the
  // contact line slides in their corners; across them the edge holds it back.
  const o = { ...DEFAULTS, dt: 0.1 }, water = sum(s.W), paint = sum(s.G[0]);
  backRun(s, o, [0, 0, n - 1, n - 1], 0.25);
  const entry = o.puddle * Math.exp(Math.max(0, o.pinning - o.pinFibre));
  const expected = 0.01 + (1 - 0.01 / o.puddle) * 0.1 * (0.2 - entry);
  for (const i of [centre - 1, centre + 1]) assert.ok(Math.abs(s.W[i] - expected) < 1e-8, `along ${s.W[i]}, expected ${expected}`);
  for (const i of [centre - n, centre + n]) assert.ok(Math.abs(s.W[i] - 0.01) < 1e-9, `across ${s.W[i]}`);
  assert.ok(Math.abs(sum(s.W) - water) < 1e-7);
  assert.ok(Math.abs(sum(s.G[0]) + sum(s.D[0]) - paint) < 1e-7);
  // More head releases the pinned front, without changing the paper.
  s.W[centre] = 0.4;
  backRun(s, o, [0, 0, n - 1, n - 1], 0.25);
  assert.ok(s.W[centre - n] > 0.01 && s.W[centre + n] > 0.01);
});

test('back-run: a lower throat admits water sooner; zero pinning recovers the unpinned intake', () => {
  const take = (throat, pinning, dt = 0.1) => {
    const s = createSheet(makePaper(5, 5, { mmPerCell: 0.25 }), [PIG]);
    s.paper.surface.fill(0.5); s.paper.throat.fill(throat);
    for (let i = 0; i < s.n; i++) deposit(s, i, 0.01, [0.02]);
    s.W[12] = 0.2;
    const before = sum(s.W);
    backRun(s, { ...DEFAULTS, dt, pinning, pinFibre: 0 }, [0, 0, 4, 4], 0.25);
    assert.ok(Math.abs(sum(s.W) - before) < 1e-7);
    assert.ok(s.W.every(v => v >= 0));
    return s.W[13] - 0.01;
  };
  assert.equal(take(0.5, 1.5), Math.fround(0.01) - 0.01);
  assert.ok(take(-0.5, 1.5) > take(0.25, 1.5));
  assert.ok(take(0.25, 1.5) > take(0.5, 1.5));
  assert.ok(Math.abs(take(0.5, 0) - (1 - 0.01 / DEFAULTS.puddle) * 0.1 * (0.2 - DEFAULTS.puddle)) < 1e-8);
  assert.equal(take(-0.5, 0), take(0.5, 0));
  take(-0.5, 1.5, 14); // the four face budgets still keep a large step conservative
});

test('back-run: even the easiest fibre throat cannot drain a donor below its puddle floor', () => {
  const s = createSheet(makePaper(5, 5, { mmPerCell: 0.25 }), [PIG]);
  s.paper.throat.fill(-0.5);
  for (let i = 0; i < s.n; i++) deposit(s, i, 0.01, [0]);
  s.W[12] = 0.2;
  backRun(s, { ...DEFAULTS, dt: 14 }, [0, 0, 4, 4], 0.25);
  assert.ok(s.W[12] >= DEFAULTS.puddle - 1e-8, `donor ${s.W[12]}`);
});

test('back-run: intake follows the tooth storage deficit continuously through shine-off', () => {
  const head = Math.fround(DEFAULTS.puddle);
  for (const fraction of [0.25, 0.5, 0.75, 0.99999, 1, 1.00001]) {
    const s = createSheet(makePaper(3, 1, { mmPerCell: 0.25 }), [PIG]);
    s.paper.surface.fill(0.5); s.paper.throat.fill(0);
    deposit(s, 0, 0.2, [0.1]); deposit(s, 1, fraction * head, [0.02]);
    const before = Float32Array.from(s.W), water = sum(s.W), pigment = sum(s.G[0]);
    backRun(s, { ...DEFAULTS, dt: 0.1, pinning: 0 }, [0, 0, 2, 0], 0.25);
    const capacity = Math.max(0, (head - before[1]) / head);
    const expected = capacity * 0.1 * (before[0] - head);
    assert.ok(Math.abs(s.W[1] - before[1] - expected) < 3e-9);
    assert.ok(Math.abs(sum(s.W) - water) < 2e-8);
    assert.ok(Math.abs(sum(s.G[0]) + sum(s.D[0]) - pigment) < 2e-8);
  }
});

test('back-run: a marginal downstream receiver cannot trigger a finite pigment push', t => {
  const run = depth => {
    const s = createSheet(makePaper(3, 1, { mmPerCell: 0.25 }), [PIG]);
    s.paper.surface.fill(0.5); s.paper.throat.fill(0);
    for (const [i, w] of [0.2, 0.01, depth].entries()) deposit(s, i, w, [0]);
    s.D[0][1] = 0.05;
    const water = sum(s.W), pigment = sum(s.D[0]);
    backRun(s, { ...DEFAULTS, dt: 0.1, pinning: 0 }, [0, 0, 2, 0], 0.25);
    assert.ok(Math.abs(sum(s.W) - water) < 2e-8);
    assert.ok(Math.abs(sum(s.G[0]) + sum(s.D[0]) - pigment) < 2e-8);
    return s.G[0][2];
  };
  // Actual depths from the ordinary bloom's first diverging cell in round 4.
  const below = run(0.04999463), above = run(0.05003053);
  assert.ok(below > 0.003 && above > 0.003, 'both marginal receivers still wet under pressure');
  assert.ok(Math.abs(below - above) < 2e-5, `marginal push gap ${below - above}`);
  const full = run(0.01);
  assert.ok(full > 0.015, 'a damp receiver admits substantial pigment');
  assert.equal(run(DEFAULTS.puddle), 0, 'a flooded receiver admits no capillary push');
  t.diagnostic(JSON.stringify({ below, above, full }));
});

test('clean water run into damp paint dries pale inside a darker front (a bloom)', () => {
  const N = 60, s = puddle(N);
  for (let t = 0; t < 600; t++) step(s, { ...DEFAULTS, dt: 0.1 });
  const paint = i => s.G[0][i] + s.D[0][i] + s.P[0][i];
  // The front follows the fibres, so inspect bands around the drop rather than
  // one row that can cut across a pinned branch. Beyond the front the wash stays.
  let pale = Infinity, front = 0, far = 0, count = 0;
  for (let y = 5; y < N - 5; y++) for (let x = 5; x < N - 5; x++) {
    const r = Math.hypot(x - 29.5, y - 29.5), p = paint(y * N + x);
    if (r > 5 && r < 11) pale = Math.min(pale, p);
    if (r > 5 && r < 20) front = Math.max(front, p);
    if (r > 22 && r < 24) { far += p; count++; }
  }
  const beyond = far / count;
  assert.ok(pale < 0.5 * beyond, `pale ${pale}, beyond ${beyond}`);
  assert.ok(front > 1.15 * beyond, `front ${front}, beyond ${beyond}`);
});
