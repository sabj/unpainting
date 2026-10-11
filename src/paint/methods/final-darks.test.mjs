import test from 'node:test';
import assert from 'node:assert/strict';
import { accentCells, accentFamilies } from './final-darks.mjs';

// A pale field with a mid-grey band and a few small, much darker spots: only the spots are accents.
function field(w, h) {
  const D = new Float32Array(w * h * 3).fill(0.1);
  const set = (x, y, v) => { const i = y * w + x; D[3 * i] = D[3 * i + 1] = D[3 * i + 2] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) set(x, y, 0.6);
  const spots = [[30, 10], [50, 30], [70, 50]];
  for (const [cx, cy] of spots) for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, 1.6);
  return { D, spots };
}

test('accent cells are the small local darks, not a broad mid-value band', () => {
  const w = 80, h = 64, { D, spots } = field(w, h);
  const m = accentCells(D, w, h, { mmPerCell: 0.5, darkQ: 0.9, minValue: 0.45, contrast: 0.08, surroundMm: 2.5 });
  for (const [x, y] of spots) assert.equal(m[y * w + x], 1);
  for (let y = 0; y < h; y++) assert.equal(m[y * w + 5], 0, 'the broad band is not an accent');
  assert.equal(m[5 * w + 60], 0, 'pale paper is not an accent');
});

test('cells the pen will draw are left to the pen', () => {
  const w = 80, h = 64, { D } = field(w, h), pen = new Uint8Array(w * h);
  for (let y = 7; y <= 13; y++) for (let x = 27; x <= 33; x++) pen[y * w + x] = 1;
  const m = accentCells(D, w, h, { mmPerCell: 0.5, pen });
  assert.equal(m[10 * w + 30], 0);
  assert.equal(m[30 * w + 50], 1);
});

test('families hold at least one look worth of cells; a small tile joins a neighbour or is dropped', () => {
  const w = 40, h = 40, m = new Uint8Array(w * h);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) m[y * w + x] = 1; // 81 cells, tile (0,0)
  for (let y = 0; y < 3; y++) for (let x = 10; x < 13; x++) m[y * w + x] = 1; // 9 cells next door
  m[39 * w + 39] = 1; // isolated, dropped
  const f = accentFamilies(m, w, h, { mmPerCell: 1, tileMm: 10, minCells: 64 });
  assert.equal(f.length, 1);
  assert.equal(f[0].cells.length, 90);
  assert.throws(() => accentCells(new Float32Array(3), 2, 2, { mmPerCell: 1 }));
});

test('with a minimum size, speckles are dropped and a solid dark is kept', () => {
  const w = 80, h = 64, { D } = field(w, h);
  const set = (x, y, v) => { const i = y * w + x; D[3 * i] = D[3 * i + 1] = D[3 * i + 2] = v; };
  set(20, 50, 1.6); set(24, 54, 1.6);
  const m = accentCells(D, w, h, { mmPerCell: 0.5, minMm2: 4 });
  assert.equal(m[50 * w + 20], 0);
  assert.equal(m[30 * w + 50], 1);
});
