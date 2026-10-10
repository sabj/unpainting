// Small lights inside paint are found; paper beside paint, broad lights and lights far from paper are not.
// Found lights are cut out of the passages without changing what they lay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { smallLights, coverCells, fillReserved, paperDensity } from './lights.mjs';
import { blockInPigments } from './blockin.mjs';

const W = 60, H = 60, N = W * H;
const field = (v = 1.5) => new Float32Array(N).fill(v);
const count = m => m.reduce((a, v) => a + v, 0);
const set = (D, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) D[y * W + x] = v; };

test('a fleck and a one-pixel whisker in dark paint are found, and nothing else', () => {
  const D = field();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 15, y - 15) < 2) D[y * W + x] = 0;
  set(D, 5, 40, 55, 41, 0);                                     // the whisker, fifty pixels long
  const { mask } = smallLights(D, W, H, { radius: 3 });
  let fleck = 0, whisker = 0, other = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!mask[i]) continue;
    if (Math.hypot(x - 15, y - 15) < 2) fleck++; else if (y === 40) whisker++; else other++;
  }
  assert.ok(fleck >= 9, `the fleck is found: ${fleck} of its 13 pixels`);
  assert.ok(whisker >= 40, `the whisker is found along its length: ${whisker} of 50`);
  assert.equal(other, 0, 'and no paint is taken for a light');
});

test('paper beside paint, a light broader than the radius, and a pale grey are not small lights', () => {
  const beside = field(); set(beside, 30, 0, 60, 60, 0);
  set(beside, 27, 20, 30, 23, 0);
  assert.equal(smallLights(beside, W, H, { radius: 3 }).count, 0, 'paper along an outline, or in a notch open on one side, is not enclosed');
  const broad = field(); set(broad, 20, 20, 40, 40, 0);
  assert.equal(smallLights(broad, W, H, { radius: 3 }).count, 0, 'a light twenty pixels wide is for the big masking, not this');
  const grey = field(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 30, y - 30) < 2) grey[y * W + x] = 0.5;
  assert.equal(smallLights(grey, W, H, { radius: 3 }).count, 0, 'a fleck at 0.5 is modelling, not paper');
});

test('with a ratio, a grey whisker across a dark iris is found, which paper-white alone misses', () => {
  const D = field(1.4);
  for (let x = 5; x < 55; x++) D[30 * W + x] = 0.4;             // a whisker in shadow, grey against the iris
  assert.equal(smallLights(D, W, H, { radius: 3 }).count, 0, 'at 0.4 it is not within 0.12 of paper');
  assert.ok(smallLights(D, W, H, { radius: 3, ratio: 0.3 }).count >= 40, 'within 0.3 of the tone the closing gives it, it is');
});

test('a pale pocket of sand in a notch of a dark coat is not held in by the sand round it', () => {
  // a dark coat over sand, a four-pixel notch of sand cut into it, and a paper-pale patch inside the notch
  const D = field(0.3);
  set(D, 0, 0, 60, 28, 2);
  set(D, 28, 24, 32, 28, 0.3);
  set(D, 29, 25, 31, 27, 0.05);
  assert.equal(smallLights(D, W, H, { radius: 4 }).count, 0, 'sand at 0.3 does not enclose a light the coat around it is 2 against');
  assert.ok(smallLights(D, W, H, { radius: 4, hold: 0 }).count > 0, 'and without the hold on the closed tone it would');
});

test('coverCells keeps a fine whisker as a line of cells, and a stray pixel does not take a cell', () => {
  const fw = 30, fh = 30, w = 10, h = 10, fine = new Uint8Array(fw * fh);
  for (let x = 0; x < fw; x++) fine[16 * fw + x] = 1;              // a one-pixel line: a third of each cell in row 5
  fine[2 * fw + 2] = 1;                                           // one pixel of nine in cell (0, 0)
  const cells = coverCells(fine, fw, fh, w, h, { share: 0.3 });
  assert.equal(count(cells), 10, 'the row of cells the line crosses, and nothing else');
  for (let x = 0; x < w; x++) assert.equal(cells[5 * w + x], 1);
});

test('fillReserved fills a reserved hole inside a passage, not a reserved light beside it', () => {
  const mask = new Uint8Array(N), reserve = new Uint8Array(N);
  set(mask, 10, 10, 40, 40, 1);
  mask[25 * W + 25] = 0; reserve[25 * W + 25] = 1;
  reserve[25 * W + 42] = 1;                                       // a light two cells outside the passage's edge
  const out = fillReserved(mask, reserve, W, H, { reach: 3 });
  assert.equal(out[25 * W + 25], 1, 'the brush sweeps across the fleck');
  assert.equal(out[25 * W + 42], 0, 'and does not reach out to the light beside the passage');
  assert.equal(mask[25 * W + 25], 0, 'the passage given is not changed');
});

test('paperDensity reads a light by its furthest channel', () => {
  const paper = [240, 236, 216];
  const px = Uint8Array.from([240, 236, 216, 220, 200, 150, 30, 30, 30]);
  const D = paperDensity(px, 3, paper);
  assert.ok(D[0] < 1e-6, 'paper is 0');
  assert.ok(Math.abs(D[1] - Math.log(216 / 150)) < 1e-4, `tan sand reads its blue: ${D[1].toFixed(3)}`);
  assert.ok(D[2] > 2, 'and black is dark');
});

test('blockInPigments with a reserve lays the same passages at the same strengths, with the lights left out', () => {
  // a dark coat with a mid-tone band through it, and flecks in the coat
  const A = new Float32Array(N);
  set(A, 5, 5, 55, 55, 1.2); set(A, 5, 25, 55, 32, 0.5);
  const reserve = new Uint8Array(N);
  for (const [x, y] of [[12, 12], [40, 15], [20, 45], [45, 44]]) { A[y * W + x] = 0; reserve[y * W + x] = 1; }
  const plain = blockInPigments(A, 1, W, H, { glaze: 0.22 }), kept = blockInPigments(A, 1, W, H, { glaze: 0.22, reserve });
  assert.equal(kept.layers.length, plain.layers.length, 'as many passes');
  let covered = 0;
  plain.layers.forEach((L, k) => {
    const K = kept.layers[k];
    assert.equal(K.shapes.length, L.shapes.length, `pass ${k + 1}: as many passages`);
    L.shapes.forEach((sh, s) => {
      assert.equal(K.shapes[s].amount, sh.amount, `pass ${k + 1} passage ${s + 1}: the same strength`);
      for (let i = 0; i < N; i++) {
        if (reserve[i]) { covered += sh.mask[i]; assert.equal(K.shapes[s].mask[i], 0, 'no passage covers a reserved light'); }
        else assert.equal(K.shapes[s].mask[i], sh.mask[i], 'and every other cell is as it was');
      }
    });
  });
  assert.ok(covered > 0, `without the reserve the blur closed passages over the flecks (${covered} times)`);
});
