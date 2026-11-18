// Shape floors come from the brushes on the sheet, not from the canvas: what a wash may hold, and what light it may go round,
// is one touch of the smallest brush that lays that step. Synthetic value fields; 0.25 mm a cell, so the rigger (1.2 mm) is
// 4.8 cells wide (18 cells a touch) and the round4 (3 mm) 12 cells wide (113 cells a touch).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLightToDark } from './light-to-dark.mjs';
import { brushFootprintCells } from './light-reserves.mjs';

const W = 200, H = 200, N = W * H, CELL_MM = 0.25;
// A pale ground (value .22), a dark block that sets the value scale, and a mid-tone form (value .55) of 60x60 cells that
// the small shapes sit in. Calls pass the small shape's own density to put.
function field(draw) {
  const density = new Float32Array(N).fill(0.2);
  for (let y = 10; y < 50; y++) for (let x = 10; x < 50; x++) density[y * W + x] = 0.9;
  for (let y = 100; y < 160; y++) for (let x = 100; x < 160; x++) density[y * W + x] = 0.5;
  draw(density);
  return density;
}
const rect = (density, x0, y0, s, v) => { for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) density[y * W + x] = v; };
function plan(density, extra = {}) {
  const log = console.log; console.log = () => {};
  try { return planLightToDark({ w: W, h: H, k: 1, density, demand: density.slice(), shaped: true, nestedBands: true, layers: 4, sheetWidthMm: W * CELL_MM, ...extra }); }
  finally { console.log = log; }
}
// Passes of the middle layers after the first: where the form is built up. The darks are not cut from the small brushes.
const builtUp = p => p.layers.flatMap(l => l.shapes).filter(sh => /^mid\/b2L[1-9]\//.test(sh._valuePlan.id));
const painted = (shapes, cell) => shapes.some(sh => sh.mask[cell]);

test('the floors are one touch of the sheet brushes', () => {
  assert.equal(brushFootprintCells(1.2, CELL_MM), 18);
  assert.equal(brushFootprintCells(3, CELL_MM), 113);
});

test('a light the detail brush can go round stays a hole in a darker layer', () => {
  // a 12x12 lighter spot (3 mm, 144 cells: a round4 wide) in the middle of the mid-tone form; the old squint (19x19) lost it
  const d = field(q => rect(q, 124, 124, 12, 0.2));
  const spot = 130 * W + 130, p = plan(d);
  assert.equal(painted(builtUp(p), spot), false, 'no darker layer paints the spot');
  assert.equal(painted(p.layers.flatMap(l => l.shapes), spot), true, 'the pale layers still carry it');
  // the same spot is painted through when the detail brush is a round12 (7 mm: a touch of 616 cells)
  assert.equal(painted(builtUp(plan(d, { detailBrushMm: 7 })), spot), true);
});

test('a pinhole smaller than the detail brush is painted through', () => {
  const d = field(q => rect(q, 129, 129, 3, 0.2));
  assert.equal(painted(builtUp(plan(d)), 130 * W + 130), true);
});

test('a mid-tone shape the detail brush can lay becomes a passage of its own', () => {
  // a 6x6 darker patch (36 cells: over a rigger touch, under the old 144-cell floor) in the pale ground
  const d = field(q => rect(q, 70, 150, 6, 0.6));
  const cell = 152 * W + 72, own = builtUp(plan(d)).filter(sh => sh.mask[cell]);
  assert.ok(own.length > 0, 'a later layer paints the patch');
  assert.ok(own.every(sh => sh.area < 300), 'as a small passage, not as part of a broad one');
});

test('a speck under the detail brush touch is not painted', () => {
  // a 3x3 patch (9 cells) is left to the layer below; the squint must not grow it into a passage
  const d = field(q => rect(q, 70, 150, 3, 0.6));
  assert.equal(painted(builtUp(plan(d)), 151 * W + 71), false);
});

test('a broad wash stays one connected passage', () => {
  const d = field(() => {});
  const p = plan(d), first = p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.id.startsWith('mid/b2L0/'));
  assert.equal(first.length, 1, 'the first middle layer is one passage');
  assert.ok(first[0].area > 20000);
});

test('the same physical sheet gives the same floor at another native density', () => {
  // a 1.5 mm light (6 cells at 0.25 mm, 12 at 0.125 mm) in a mid-tone form is kept at both densities
  const run = scale => {
    const w = W * scale, h = H * scale, n = w * h, d = new Float32Array(n).fill(0.2);
    const box = (x0, y0, x1, y1, v) => { for (let y = y0 * scale; y < y1 * scale; y++) for (let x = x0 * scale; x < x1 * scale; x++) d[y * w + x] = v; };
    box(10, 10, 50, 50, 0.9); box(100, 100, 160, 160, 0.5); box(129, 129, 135, 135, 0.2);
    const log = console.log; console.log = () => {};
    try { const p = planLightToDark({ w, h, k: 1, density: d, demand: d.slice(), shaped: true, nestedBands: true, layers: 4, sheetWidthMm: W * CELL_MM });
      return p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.phase !== 'light' && !sh._valuePlan.id.startsWith('mid/b2L0/')).some(sh => sh.mask[132 * scale * w + 132 * scale]); }
    finally { console.log = log; }
  };
  assert.equal(run(1), run(2), 'the spot is a hole at both densities or at neither');
});

test('a dark glaze goes round a thin light the detail brush can leave, and paints through a pinhole', () => {
  // the 60x60 form is dark here; a 4x20 light line (1 mm by 5 mm: a mullion, 80 cells) and a 4x4 and a 2x2 gap in it
  const d = field(q => { rect(q, 100, 100, 60, 1); for (let y = 110; y < 130; y++) for (let x = 120; x < 124; x++) q[y * W + x] = 0.2; rect(q, 140, 140, 4, 0.2); rect(q, 150, 150, 2, 0.2); });
  const dark = p => p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.phase === 'shadow');
  const p = plan(d), line = 120 * W + 121, gap4 = 142 * W + 142, gap2 = 150 * W + 150;
  assert.equal(painted(dark(p), line), false, 'the glaze leaves the mullion bare');
  assert.equal(painted(dark(p), gap2), true, 'a 2x2 pinhole is painted through');
  assert.equal(painted(dark(p), gap4), true, 'a 4x4 gap (16 cells, under a rigger touch) is painted through');
  assert.ok(dark(p).length > 0);
});
