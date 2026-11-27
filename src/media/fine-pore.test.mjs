import test from 'node:test';
import assert from 'node:assert/strict';
import { poreLedger } from './fine-pore.mjs';
import { attachFine, fineTotals, fineBytes } from './fine-pigment.mjs';
import { makePaper } from './paper.mjs';
import { createSheet, step, DEFAULTS } from './sheet.mjs';
import { poreTime } from './flow-time.mjs';

const pigment = { K: [0.4, 0.3, 0.1], S: [0.02, 0.02, 0.02], rho: 0.04, omega: 0.5, gamma: 0.8 };
const options = { ...DEFAULTS, flowIters: 0, level: 0, edgeEvap: 0, evap: 0, absorb: 0,
  paperDry: 0, settle: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0, capRate: 0 };
const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, cockle: { rmsMm: 0 } });
const close = (a, b) => assert.ok(Math.abs(a - b) < 2e-6, `${a} against ${b}`);
function make(N) {
  const sheet = createSheet(paper(6, 5, 0.52), [pigment]);
  return attachFine(sheet, paper(6 * N, 5 * N, 0.52 / N), N, options);
}
function mean(F, plane, c) { let sum = 0; for (let a = 0; a < F.N ** 2; a++) sum += plane[F.blockCells[c * F.N ** 2 + a]]; return sum / F.N ** 2; }

test('pore ledger crops snapshots, retains signed faces and filtration, and releases the previous step', () => {
  const sheet = { w: 6, n: 30 }, L = poreLedger(sheet), s = Float32Array.from({ length: 30 }, (_, i) => i / 100);
  L.begin([2, 1, 4, 2], s); L.face(9, 8, 0.01, 0.7); L.face(9, 15, 0.02, 0.3);
  const after = s.slice(); after[9] -= 0.03; after[8] += 0.01; after[15] += 0.02; L.end(after);
  assert.equal(L.events.length, 1); const e = L.events[0];
  assert.deepEqual([...e.before], [...s.subarray(8, 11), ...s.subarray(14, 17)]);
  close(e.fx[0], -0.01); close(e.cx[0], 0.7); close(e.fy[1], 0.02); close(e.cy[1], 0.3);
  close(e.after[1], after[9]); assert.equal(L.touched[8], 1); assert.equal(L.touched[15], 1);
  s.fill(0); assert.ok(e.before.some(v => v > 0), 'records own their pre-pass water');
  L.begin([0, 0, 0, 0], s); L.end(s); assert.equal(L.events.length, 1, 'an empty pass retains no arrays');
  L.reset(); assert.equal(L.events.length, 0); assert.ok(L.touched.every(v => v === 0));
  assert.throws(() => L.end(s), /no pore pass/);
});

for (const N of [2, 4, 8]) test(`ratio ${N}: pore reversals cannot cancel filtration or use a later pass's capture`, () => {
  const F = make(N), s = F.sheet;
  s.paper.capacity.fill(2); F.paper.capacity.fill(2); s.s[0] = 1; s.s[1] = 1;
  for (let a = 0; a < N * N; a++) F.P[0][F.blockCells[a]] = 1;
  const before = fineTotals(F), baseBytes = fineBytes(F);
  F.L.begin(0.1);
  F.L.pores.begin([0, 0, 1, 0], s.s);
  F.L.pores.face(0, 1, 0.25, 1); const midway = s.s.slice(); midway[0] -= 0.25; midway[1] += 0.25; F.L.pores.end(midway);
  F.L.pores.begin([0, 0, 1, 0], midway);
  F.L.pores.face(1, 0, 0.25, 0); F.L.pores.end(s.s);
  assert.ok(fineBytes(F) > baseBytes, 'live cropped records are included in memory accounting');
  F.step();
  close(fineTotals(F), before); close(mean(F, F.P[0], 0), 0.75); close(mean(F, F.P[0], 1), 0);
  close(mean(F, F.D[0], 0), 0.25); close(mean(F, F.D[0], 1), 0);
  F.L.begin(0.1); assert.equal(F.L.pores.events.length, 0);
  assert.equal(fineBytes(F), baseBytes, 'the old pass buffers do not survive the next begin');
});

test('real capillary subcycles record water before drying without changing the coarse solver', () => {
  const F = make(4), s = F.sheet, ref = createSheet(s.paper, [pigment]), o = { ...options, capRate: 4, paperDry: 0.001, dt: 0.5 };
  s.s[14] = ref.s[14] = s.paper.capacity[14] * 0.9;
  for (let a = 0; a < F.N ** 2; a++) F.P[0][F.blockCells[14 * F.N ** 2 + a]] = 0.07;
  const before = fineTotals(F);
  step(s, o); step(ref, o);
  const events = F.L.pores.events;
  assert.ok(events.length > 1 && events.length <= poreTime(s, o).iters);
  assert.ok(events.at(-1).after.some((v, i) => v > s.s[(events.at(-1).y + Math.floor(i / events.at(-1).w)) * s.w + events.at(-1).x + i % events.at(-1).w]), 'the last pass is saved before pore drying');
  F.step(); close(fineTotals(F), before);
  assert.deepEqual(s.W, ref.W); assert.deepEqual(s.s, ref.s); assert.deepEqual(s.M, ref.M);
});
