import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, deposit, step, setClip } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, thirsty } from '../../media/brush.mjs';
import { softenEdge } from '../../../tools/painter/soften-lift-run.mjs';
import { softenWhere, growReserve, softenBrushCells } from './value-soften.mjs';

const W = 48, H = 40;
const cell = (x, y) => y * W + x;
const col = (x, y0, y1) => Array.from({ length: y1 - y0 }, (_, k) => cell(x, y0 + k));

test('softenWhere keeps a soft cell far from hard cells and drops one within reach', () => {
  const soft = col(10, 5, 35), hard = col(10 + 0, 36, 38);               // hard cells below the soft run
  const where = softenWhere({ softCells: soft, hardCells: hard, w: W, h: H, reach: 4 });
  assert.equal(where[cell(10, 5)], 1);
  assert.equal(where[cell(10, 20)], 1);
  assert.equal(where[cell(10, 33)], 0, 'within 4 cells of the hard run at y 36');
  assert.equal(where[cell(10, 31)], 1, 'five cells away is clear');
  assert.equal(where[cell(11, 20)], 1, 'a cell beside a soft boundary cell is marked, for the smoothed outline');
  assert.equal(where[cell(14, 20)], 0, 'a cell away from the boundary is not');
});

test('softenWhere drops soft cells near a reserved light and returns null when nothing is left', () => {
  const soft = col(10, 5, 15), protect = new Uint8Array(W * H);
  protect[cell(10, 17)] = 1;
  const near = growReserve(protect, W, H, 3);
  const where = softenWhere({ softCells: soft, hardCells: [], nearReserve: near, w: W, h: H, reach: 3 });
  assert.equal(where[cell(10, 5)], 1);
  assert.equal(where[cell(10, 13)], 1, 'four cells from the light is clear');
  assert.equal(where[cell(10, 14)], 0, 'three cells from the light is not');
  assert.equal(softenWhere({ softCells: col(10, 15, 19), hardCells: [], nearReserve: near, w: W, h: H, reach: 3 }), null);
  assert.equal(softenWhere({ softCells: [], hardCells: [], w: W, h: H, reach: 3 }), null);
  assert.equal(growReserve(null, W, H, 3), null);
});

test('the damp brush is the largest round that fits the shape, the passage brush and the cap', () => {
  const kit = [2.6, 5.8, 9.7, 13.6];                                   // rigger, round4, round8, round12 at 0.26 mm a cell
  assert.equal(softenBrushCells(kit, { ownCells: 40, supportCells: 100 }), 13.6, 'a wide shape takes the largest round');
  assert.equal(softenBrushCells(kit, { ownCells: 40, supportCells: 12 }), 5.8, 'a shape 12 cells wide fits a 11.6 cell brush');
  assert.equal(softenBrushCells(kit, { ownCells: 7, supportCells: 100 }), 5.8, 'never wider than the passage brush');
  assert.equal(softenBrushCells(kit, { ownCells: 40, supportCells: 100, cap: 10 }), 9.7, 'the cap holds');
  assert.equal(softenBrushCells(kit, { ownCells: 40, supportCells: 4 }), 0, 'under the finest brush: dry edge');
  assert.equal(softenBrushCells([], { ownCells: 40, supportCells: 100 }), 0);
});

// A wash laid wet on dry inside a clip dries with a one-cell step. The damp brush run along its soft side makes the
// step wider; its hard side is left alone.
test('softening the soft side of a clipped wash widens its edge and leaves the hard side a step', () => {
  const Wd = 90, Hd = 60, x0 = 25, x1 = 65, y0 = 12, y1 = 48;
  const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
  const mask = Uint8Array.from({ length: Wd * Hd }, (_, i) => { const x = i % Wd, y = (i / Wd) | 0; return x >= x0 && x < x1 && y >= y0 && y < y1 ? 1 : 0; });
  const soft = [], hard = [];
  for (let y = y0; y < y1; y++) { soft.push(y * Wd + x0); hard.push(y * Wd + x1 - 1); }
  const lay = soften => {
    const sheet = createSheet(makePaper(Wd, Hd, { seed: 4 }), pigments);
    setClip(sheet, mask);
    for (let i = 0; i < Wd * Hd; i++) if (mask[i]) deposit(sheet, i, 0.8, [0.05]);
    setClip(sheet, null);
    for (let k = 0; k < 4; k++) step(sheet);
    if (soften) {
      const where = softenWhere({ softCells: soft, hardCells: hard, w: Wd, h: Hd, reach: 3 });
      softenEdge({ mask, where, W: Wd, H: Hd, r: 3, upright: true, stroke: (b, path, o) => stroke(b, sheet, path, o), damp: () => { const b = createBrush({ flat: false, radius: 3, capacity: 60, splay: 0 }); dip(b, { water: 1, conc: [0] }); return thirsty(b, { water: 0.48 }); } });
    }
    for (let k = 0; k < 30; k++) step(sheet);
    return sheet;
  };
  const pig = (s, x, y) => { const i = y * Wd + x; return s.G[0][i] + s.P[0][i] + s.D[0][i]; };
  const plain = lay(false), softened = lay(true), yMid = 30;
  const outSoft = [1, 2, 3, 4].reduce((a, d) => a + pig(softened, x0 - d, yMid), 0), outPlain = [1, 2, 3, 4].reduce((a, d) => a + pig(plain, x0 - d, yMid), 0);
  assert.ok(outSoft > outPlain * 1.5 + 1e-6, `soft side carries paint out: ${outSoft} vs ${outPlain}`);
  const outHardSoft = [0, 1, 2, 3].reduce((a, d) => a + pig(softened, x1 + d, yMid), 0), outHardPlain = [0, 1, 2, 3].reduce((a, d) => a + pig(plain, x1 + d, yMid), 0);
  assert.ok(outHardSoft <= outHardPlain * 1.2 + 1e-6, `hard side stays a step: ${outHardSoft} vs ${outHardPlain}`);
});
