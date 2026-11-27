import test from 'node:test';
import assert from 'node:assert/strict';
import { carryFine, diffuseFine } from './fine-transport.mjs';

const field = (w = 4, h = 4, N = 2) => {
  const n = w * h, f64 = () => new Float64Array(n);
  return { sheet: { w: w / N }, N, FW: w, FX: f64(), FY: f64(), donors: new Uint32Array(n), dg: f64(), out: f64(), r: f64(),
    activeCells: Uint32Array.from({ length: n }, (_, i) => i) };
};
const sum = a => a.reduce((s, v) => s + v, 0);
const close = (a, b) => assert.ok(Math.abs(a - b) < 2e-7 * Math.max(1, Math.abs(b)), `${a} against ${b}`);

test('fine face transfers share the donor budget, read the old suspension, and conserve each pigment', () => {
  const F = field(), water = new Float32Array(16).fill(1);
  // One donor feeds two faces at once. Both see its old concentration, rather than the first face's remainder.
  F.FX[0] = 0.2; F.FY[0] = 0.3;
  const A = new Float32Array(16), B = new Float32Array(16); A[0] = 1; B[0] = 2;
  carryFine(F, [A, B], water, water);
  close(A[0], 0.5); close(A[1], 0.2); close(A[4], 0.3);
  close(B[0], 1); close(B[1], 0.4); close(B[4], 0.6);
  close(sum(A), 1); close(sum(B), 2);
  // Extreme flux uses the same bounded substeps and budget; it cannot create mass or a negative donor.
  F.FX[0] = 100; F.FY[0] = 150;
  carryFine(F, [A, B], water, water);
  for (const a of [A, B]) assert.ok(a.every(v => Number.isFinite(v) && v >= 0));
  close(sum(A), 1); close(sum(B), 2);
});

test('pore capture uses the recorded coarse face for both directions and pigments', () => {
  const F = field(), water = new Float32Array(16).fill(1);
  const caught = { x: Float32Array.of(0.4, 0, 0.6, 0), y: Float32Array.of(0.6, 0.4, 0, 0) };
  const empty = new Float32Array(16), A = new Float32Array(16).fill(1), B = new Float32Array(16).fill(2);
  const deposits = [new Float32Array(16), new Float32Array(16), new Float32Array(16)];
  F.FX[0] = 0.1; // inside a coarse block: no capture
  F.FX[1] = 0.1; // block 0 -> block 1
  F.FX[9] = -0.1; // block 3 -> block 2
  F.FY[4] = 0.1; // block 0 -> block 2
  F.FY[6] = -0.1; // block 3 -> block 1
  carryFine(F, [empty, A, B], water, water, caught, deposits);
  close(deposits[1][0], 0);
  close(deposits[1][1], 0.1 * caught.x[0]);
  close(deposits[1][4], 0.1 * caught.y[0]); close(deposits[1][10], 0.1 * (caught.x[2] + caught.y[1]));
  assert.ok(deposits[0].every(v => v === 0), 'absent pigment does not shift the deposit association');
  for (let i = 0; i < 16; i++) close(deposits[2][i], 2 * deposits[1][i]);
  close(sum(A) + sum(deposits[1]), 16); close(sum(B) + sum(deposits[2]), 32);
});

test('distinct pore faces into the same block retain their capture shares', () => {
  const F = field(), water = new Float32Array(16).fill(1), A = new Float32Array(16).fill(1), D = new Float32Array(16);
  const caught = { x: Float32Array.of(0.2, 0, 0, 0), y: Float32Array.of(0.8, 0, 0, 0) };
  F.FX[1] = -0.1; F.FY[4] = -0.1;
  carryFine(F, [A], water, water, caught, [D]);
  close(D[2], 0.02); close(D[8], 0.08); close(sum(A) + sum(D), 16);
});

test('thin donors stay put and a later call rebuilds the water budget without stale scratch', () => {
  const F = field(), dry = new Float32Array(16), wet = new Float32Array(16).fill(1), A = new Float32Array(16);
  A[0] = 1; F.FX[0] = 0.2;
  carryFine(F, [A], dry, dry); close(A[0], 1); close(A[1], 0);
  carryFine(F, [A], wet, wet); close(A[0], 0.8); close(A[1], 0.2);
  F.FX[0] = -0.2;
  carryFine(F, [A], wet, wet); close(A[0], 0.84); close(A[1], 0.16); close(sum(A), 1);
});

test('block traversal spends a cell only after every face has read its old pigment', () => {
  const F = field(), water = new Float32Array(16).fill(1), A = new Float32Array(16);
  F.activeCells = Uint32Array.of(0, 1, 4, 5, 2, 3, 6, 7, 8, 9, 12, 13, 10, 11, 14, 15);
  // Across the block boundary, cell 2 donates to the earlier cell 1 and later cell 3.
  // Cell 6 also supplies it from below. All three faces read the original concentrations.
  A[2] = 1; A[6] = 2;
  F.FX[1] = -0.1; F.FX[2] = 0.2; F.FY[2] = -0.3;
  carryFine(F, [A], water, water);
  close(A[1], 0.1); close(A[2], 1.3); close(A[3], 0.2); close(A[6], 1.4);
  close(sum(A), 3);
  assert.ok(F.dg.every(v => v === 0), 'the spent accumulator is ready for the next pigment or substep');
});

test('a changing donor crosses the thin-water cutoff inside the original bounded substeps', () => {
  const F = field(), before = new Float32Array(16).fill(2 ** -29), after = new Float32Array(16), A = new Float32Array(16);
  A[0] = 1; F.FX[0] = 1.5 * before[0];
  // Three substeps: donor shares are 1/2, 3/4, then zero once depth is below 1e-9.
  carryFine(F, [A], before, after);
  close(A[0], 0.125); close(A[1], 0.875); close(sum(A), 1);
  // A budget-bound donor remains bounded even when the requested exposure needs >64 substeps.
  before.fill(1); after.fill(2); F.FX[0] = 150; A.fill(0); A[0] = 1;
  carryFine(F, [A], before, after);
  assert.ok(A.every(v => Number.isFinite(v) && v >= 0)); close(sum(A), 1);
});

test('fine diffusion is a synchronous conservative stencil through successive steps', () => {
  const F = field(), water = new Float32Array(16).fill(1), A = new Float32Array(16);
  // A single wet row, with coefficient 0.2 per face. The second cell must not forward
  // pigment received this substep, and a new call must consume no stale changes.
  F.sheet.M = Uint8Array.of(1, 1, 0, 0); F.sheet.paper = { mmPerCell: 0.5 };
  F.fn = 16; F.L = { dt: 2 }; F.o = { flow: 0, flowIters: 1, diffuse: 0.2, filmDiffuse: 0 };
  F.activeWetCells = Uint32Array.of(0, 1, 2, 3); F.G = [A];
  water.fill(0, 4); A[0] = 1;
  diffuseFine(F, water);
  close(A[0], 0.8); close(A[1], 0.2); close(A[2], 0); close(sum(A), 1);
  diffuseFine(F, water);
  close(A[0], 0.68); close(A[1], 0.28); close(A[2], 0.04); close(A[3], 0); close(sum(A), 1);
  assert.ok(F.dg.every(v => v === 0));
});
