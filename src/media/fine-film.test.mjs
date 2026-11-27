import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, DEFAULTS } from './sheet.mjs';
import { attachFine, fineTotals, fineBytes } from './fine-pigment.mjs';
import { filmLedger } from './fine-film.mjs';

const pigment = { K: [.4, .3, .1], S: [.02, .02, .02], rho: .04, omega: .5, gamma: .8, wick: .5 };
const options = { ...DEFAULTS, slope: 0, flowIters: 0, level: 0, edgeEvap: 0, evap: 0, absorb: 0,
  paperDry: 0, settle: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0, capRate: 0 };
const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, cockle: { rmsMm: 0 } });
function make(N) {
  const s = createSheet(paper(6, 5, .52), [pigment, { ...pigment, wick: .8 }]);
  const F = attachFine(s, paper(6 * N, 5 * N, .52 / N), N, options);
  for (let c = 0; c < s.n; c++) deposit(s, c, 1);
  for (let a = 0; a < N * N; a++) {
    F.G[0][F.blockCells[14 * N * N + a]] = 1 + a / N ** 2;
    F.G[1][F.blockCells[15 * N * N + a]] = .4;
  }
  return F;
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 3e-6, `${a} against ${b}`);
function move(F, q, record) {
  const s = F.sheet;
  if (record) F.L.film.begin([2, 2, 3, 2]);
  F.L.fx[14] += q;
  if (record) F.L.film.face(14, false, q);
  s.W[14] -= q; s.W[15] += q;
  if (record) F.L.film.end();
}

test('film ledger crops with an interpolation halo, retains both directions and releases spent records', () => {
  const s = { w: 6, h: 5, n: 30, W: new Float32Array(30).fill(1), M: new Uint8Array(30).fill(1) };
  const L = filmLedger(s);
  L.begin([2, 2, 3, 2]); L.face(14, false, .25); s.W[14] -= .25; s.W[15] += .25; L.end();
  L.begin([2, 2, 3, 2]); L.face(14, false, -.25); s.W.fill(1); L.end();
  assert.equal(L.events.length, 2);
  const e = L.events[0]; assert.deepEqual([e.x, e.y, e.w, e.h], [1, 1, 4, 3]);
  assert.equal(e.before.length, 12); assert.equal(e.fx[5], .25); assert.equal(L.events[1].fx[5], -.25);
  assert.equal(e.after[5], .75); assert.equal(e.before[5], 1);
  L.begin([0, 0, 0, 0]); L.end(); assert.equal(L.events.length, 2, 'unchanged pass is released');
  assert.throws(() => L.end(), /no film pass/);
  L.reset(); assert.equal(L.events.length, 0); assert.equal(L.recorded, false); assert.ok(L.touched.every(v => v === 0));
});

for (const N of [2, 4, 8]) test(`ratio ${N}: opposite film passes match separate physical steps and cannot cancel pigment mixing`, () => {
  const actual = make(N), expected = make(N), before = [fineTotals(actual), fineTotals(actual, 1)];
  const bytes = fineBytes(actual);
  actual.L.begin(.1); move(actual, .25, true); move(actual, -.25, true);
  assert.equal(actual.L.fx[14], 0, 'the old net ledger would erase both passes');
  actual.step();
  for (const q of [.25, -.25]) { expected.L.begin(.1); move(expected, q, false); expected.step(); }
  for (let k = 0; k < 2; k++) {
    assert.deepEqual(actual.G[k], expected.G[k]); close(fineTotals(actual, k), before[k]);
  }
  assert.ok(actual.G[0][actual.blockCells[15 * N * N]] > 0, 'out-and-back water leaves pigment mixed');
  assert.ok(fineBytes(actual) > bytes);
  actual.L.begin(.1); assert.equal(actual.L.film.events.length, 0);
});

test('absorption consumes the suspension after preceding film transport, at each pigment mobility', () => {
  const actual = make(4), expected = make(4), before = [fineTotals(actual), fineTotals(actual, 1)];
  actual.L.begin(.1); move(actual, .25, true);
  actual.L.film.begin([2, 2, 3, 2], true);
  actual.L.aw[15] = .2; actual.sheet.W[15] *= .8; actual.L.film.end(); actual.step();
  expected.L.begin(.1); move(expected, .25, false); expected.step();
  for (let k = 0; k < 2; k++) for (let a = 0; a < expected.N ** 2; a++) {
    const f = expected.blockCells[15 * expected.N ** 2 + a];
    const amount = expected.G[k][f] * Math.fround(.2) * expected.sheet.pigments[k].wick;
    expected.G[k][f] -= amount; expected.P[k][f] += amount;
  }
  for (let k = 0; k < 2; k++) {
    for (const kind of ['G', 'P', 'D']) assert.deepEqual(actual[kind][k], expected[kind][k]);
    close(fineTotals(actual, k), before[k]);
  }
  assert.ok(actual.P[0].some(v => v > 0), 'transported pigment enters the receiving pores');
});

test('sub-ULP water absorption still records pigment uptake and never repeats shares from its halo', () => {
  const F = make(2), s = F.sheet;
  F.L.begin(.1); F.L.aw[14] = 1e-10; F.L.aw[13] = .5;
  F.L.film.begin([2, 2, 2, 2], true); F.L.film.end();
  assert.equal(F.L.film.events.length,1,'positive absorption survives unchanged f32 water');
  const e=F.L.film.events[0];
  assert.ok(e.aw.some(v=>v>0));assert.ok(e.aw.every(v=>v<1e-9),'halo shares are excluded');
  F.step();assert.ok(F.P[0].some(v=>v>0));
  for(let a=0;a<F.N**2;a++)assert.equal(F.P[0][F.blockCells[13*F.N**2+a]],0);
  assert.equal(s.W[14],1);
});

test('real edge-feed, lubrication and explicit passes retain their donor water without changing coarse physics', () => {
  const F = make(4), s = F.sheet, ref = createSheet(s.paper, s.pigments);
  ref.W.set(s.W); ref.M.set(s.M); ref.ever.set(s.ever);
  s.W[14] = ref.W[14] = 1.5;
  const o = { ...options, level: 1, edgeEvap: .0012, flowIters: 8, absorb: .002, dt: 2 };
  step(s, o); step(ref, o);
  assert.deepEqual(s.W, ref.W); assert.deepEqual(s.M, ref.M); assert.deepEqual(s.s, ref.s);
  assert.ok(F.L.film.events.length > 3);
  assert.ok(F.L.film.events.some(e => e.absorption));
  const before = [fineTotals(F), fineTotals(F, 1)]; F.step();
  for (let k = 0; k < 2; k++) close(fineTotals(F, k), before[k]);
});
