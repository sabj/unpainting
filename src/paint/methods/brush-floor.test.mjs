// Shape floors come from the brushes on the sheet, not the canvas: what a wash may hold, and what light it may go round,
// is one touch of the smallest mark that lays that step. The narrowest mark is the larger of the detail brush's point and
// four cells (brush-marks.mjs). Synthetic value fields; the first group is at 0.25 mm a cell, the second at the two
// densities of the density test (0.258 and 0.129 mm a cell).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLightToDark } from './light-to-dark.mjs';
import { brushFootprintCells } from './light-reserves.mjs';
import { narrowestMarkMm, keepWideShapes, minorWidth } from './brush-marks.mjs';

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
// Passes of the middle layers after the first: where the form is built up.
const builtUp = p => p.layers.flatMap(l => l.shapes).filter(sh => /^mid\/b2L[1-9]\//.test(sh._valuePlan.id));
const painted = (shapes, cell) => shapes.some(sh => sh.mask[cell]);

test('the narrowest mark is the larger of the point and four cells', () => {
  assert.ok(Math.abs(narrowestMarkMm(0.5, 0.2578) - 1.0312) < 1e-3, 'four cells govern at 0.258 mm a cell');
  assert.ok(Math.abs(narrowestMarkMm(0.5, 0.1294) - 0.5176) < 1e-3, 'four cells still just govern at 0.129');
  assert.equal(narrowestMarkMm(0.5, 0.0863), 0.5, 'the point governs on a finer sheet');
  assert.throws(() => narrowestMarkMm(0, 0.2), /positive/);
});

test('the touch of the narrowest mark is 13 cells where four cells govern and grows only when the point governs', () => {
  const touch = cell => brushFootprintCells(narrowestMarkMm(0.5, cell), cell);
  assert.equal(touch(0.2578), 13);
  assert.equal(touch(0.1294), 13);
  assert.equal(touch(0.0863), 26);
  assert.equal(brushFootprintCells(1.2, 0.2578), 17, 'the rigger belly was 17 cells at 0.258');
});

test('keepWideShapes keeps a piece of the area and the width, and drops a thin line of the same area', () => {
  const w = 40, h = 40, m = new Uint8Array(w * h);
  for (let y = 5; y < 7; y++) for (let x = 5; x < 24; x++) m[y * w + x] = 1; // 2 by 19: 38 cells, 2 wide
  for (let y = 20; y < 24; y++) for (let x = 5; x < 15; x++) m[y * w + x] = 1; // 4 by 10: 40 cells, 4 wide
  for (let y = 30; y < 34; y++) for (let x = 30; x < 34; x++) m[y * w + x] = 1; // 4 by 4
  const kept = keepWideShapes(m, w, h, 13, 4);
  assert.equal(kept[5 * w + 10], 0, 'the 2-wide line is dropped');
  assert.equal(kept[21 * w + 10], 1);
  assert.equal(kept[31 * w + 31], 1, 'a 4 by 4 piece is a touch wide');
  assert.equal(keepWideShapes(m, w, h, 41, 0)[21 * w + 10], 0, 'under the area');
  assert.ok(minorWidth([...Array(16).keys()].map(i => (i >> 2) * 40 + (i & 3)), 40) > 4);
});

test('a light the detail brush can go round stays a hole in a darker layer', () => {
  // a 12x12 lighter spot (3 mm, 144 cells: a round4 wide) in the middle of the mid-tone form; the old squint (19x19) lost it
  const d = field(q => rect(q, 124, 124, 12, 0.2));
  const spot = 130 * W + 130, p = plan(d);
  assert.equal(painted(builtUp(p), spot), false, 'no darker layer paints the spot');
  assert.equal(painted(p.layers.flatMap(l => l.shapes), spot), true, 'the pale layers still carry it');
  // the same spot is painted through when the detail brush is a round12 with a 7 mm point (and the floor brush as wide)
  assert.equal(painted(builtUp(plan(d, { floorBrushMm: 7, detailPointMm: 7 })), spot), true);
});

test('a pinhole smaller than the narrowest mark is painted through', () => {
  const d = field(q => rect(q, 129, 129, 3, 0.2));
  assert.equal(painted(builtUp(plan(d)), 130 * W + 130), true);
});

test('a mid-tone shape the narrowest mark can lay becomes a passage of its own', () => {
  // a 6x6 darker patch (36 cells: over a touch of 13) in the pale ground
  const d = field(q => rect(q, 70, 150, 6, 0.6));
  const cell = 152 * W + 72, own = builtUp(plan(d)).filter(sh => sh.mask[cell]);
  assert.ok(own.length > 0, 'a later layer paints the patch');
  assert.ok(own.every(sh => sh.area < 300), 'as a small passage, not as part of a broad one');
});

test('a speck under the touch of the narrowest mark is not painted', () => {
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

test('a dark glaze goes round a thin light the narrowest mark can leave, and paints through a pinhole', () => {
  // the 60x60 form is dark here; a 4x20 light line (1 mm by 5 mm: a mullion, 80 cells) and a 3x3 and a 2x2 gap in it
  const d = field(q => { rect(q, 100, 100, 60, 1); for (let y = 110; y < 130; y++) for (let x = 120; x < 124; x++) q[y * W + x] = 0.2; rect(q, 140, 140, 3, 0.2); rect(q, 150, 150, 2, 0.2); });
  const dark = p => p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.phase === 'shadow');
  const p = plan(d), line = 120 * W + 121, gap3 = 141 * W + 141, gap2 = 150 * W + 150;
  assert.equal(painted(dark(p), line), false, 'the glaze leaves the mullion bare');
  assert.equal(painted(dark(p), gap2), true, 'a 2x2 pinhole is painted through');
  assert.equal(painted(dark(p), gap3), true, 'a 3x3 gap (9 cells, under a touch of 13) is painted through');
  assert.ok(dark(p).length > 0);
});

test('a dark glaze goes round a thin light that is still deep enough for the shadow support', () => {
  // the same 4x20 line, but at value .44: darker than the shadow threshold, lighter than the dark bands
  const d = field(q => { rect(q, 100, 100, 60, 1); for (let y = 110; y < 130; y++) for (let x = 120; x < 124; x++) q[y * W + x] = 0.4; });
  const p = plan(d), dark = p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.phase === 'shadow');
  assert.equal(painted(dark, 120 * W + 121), false, 'the glaze leaves the line bare');
  assert.equal(painted(dark, 130 * W + 130), true, 'and still covers the dark form');
});

// The two densities of the density test on one physical sheet of 26 mm: 101 cells (0.258 mm) and 202 cells (0.129 mm).
const SHEET_MM = 26;
function sheetAt(cell, draw) {
  const w = Math.round(SHEET_MM / cell), h = w, n = w * h, mm = v => Math.round(v / cell), density = new Float32Array(n).fill(0.2);
  // a box from (x0, y0) mm, sized in whole cells so a 0.5 mm line is 4 cells at 0.129 mm a cell and 2 at 0.258
  const box = (x0, y0, x1, y1, v) => { for (let y = mm(y0); y < mm(y0) + mm(y1 - y0); y++) for (let x = mm(x0); x < mm(x0) + mm(x1 - x0); x++) density[y * w + x] = v; };
  box(1, 1, 9, 9, 1); // sets the value scale
  draw(box);
  const log = console.log; console.log = () => {};
  try { return { w, mm, p: planLightToDark({ w, h, k: 1, density, demand: density.slice(), shaped: true, nestedBands: true, layers: 4, sheetWidthMm: w * cell }) }; }
  finally { console.log = log; }
}
const darkAt = p => p.layers.flatMap(l => l.shapes).filter(sh => sh._valuePlan.phase === 'shadow');
const CELL_1X = 280 / 1086, CELL_2X = 280 / 2172;

test('a 0.5 mm light line in a dark stays bare at twice the density and is painted through at the first', () => {
  const draw = box => { box(12, 12, 24, 24, 1); box(17.75, 15, 18.25, 20, 0.2); }; // 0.5 mm by 5 mm in a 12 mm dark
  for (const [cell, bare] of [[CELL_2X, true], [CELL_1X, false]]) {
    const { w, mm, p } = sheetAt(cell, draw), at = mm(17.5) + 0; // the line's middle
    const cellIdx = mm(17.5) * w + mm(18);
    assert.equal(painted(darkAt(p), cellIdx), !bare, `at ${cell.toFixed(3)} mm a cell the line is ${bare ? 'bare' : 'painted through'}`);
    assert.ok(darkAt(p).length > 0 && at > 0);
  }
});

test('a light line as wide as the rigger belly stays bare at the first density too', () => {
  const draw = box => { box(12, 12, 24, 24, 1); box(17.4, 15, 18.6, 20, 0.2); }; // 1.2 mm by 5 mm
  const { w, mm, p } = sheetAt(CELL_1X, draw);
  assert.equal(painted(darkAt(p), mm(17.5) * w + mm(18)), false);
});

test('a mid-tone shape of the narrowest mark becomes a passage at twice the density and not at the first', () => {
  const draw = box => { box(12, 12, 24, 24, 0.35); box(14, 18, 14.5, 21, 0.6); }; // 0.5 mm by 3 mm darker line in a mid form
  const later = (p, cell) => p.layers.flatMap(l => l.shapes).filter(sh => /^mid\/b2L[1-9]\//.test(sh._valuePlan.id) && sh.mask[cell] && sh.area < 400);
  for (const [cell, laid] of [[CELL_2X, true], [CELL_1X, false]]) {
    const { w, mm, p } = sheetAt(cell, draw);
    assert.equal(later(p, mm(19.5) * w + mm(14.25)).length > 0, laid, `at ${cell.toFixed(3)} mm a cell`);
  }
});

test('a small dark the detail brush can lay gets its own deepest-dark passage, though it is under the floor brush\'s footprint', () => {
  // 0.3.2 cut both dark bands and the shadow glazes from the picture squinted over the 3 mm floor brush and held their shapes
  // to that brush's footprint, so an accent of 64 cells (2 x 2 mm) inside a mid-tone form never got its dark.
  const floorFootprint = brushFootprintCells(3, CELL_MM);
  for (const side of [8, 6]) {
    assert.ok(side * side < floorFootprint, `${side * side} cells is under the floor brush's ${floorFootprint}`);
    const p = plan(field(d => rect(d, 126, 126, side, 0.92)));
    const centre = (126 + (side >> 1)) * W + 126 + (side >> 1);
    const deepest = p.layers.flatMap(l => l.shapes).filter(sh => /^shadow\/b5\//.test(sh._valuePlan.id) && sh.mask[centre]);
    assert.equal(deepest.length, 1, `a ${side}x${side} dark has one deepest-dark passage over it`);
    assert.ok(deepest[0].area <= side * side + 8, `the passage is the accent's own size (${deepest[0].area} cells), not a floor-brush shape`);
  }
  // a speck under one touch of the narrowest mark is still not a passage
  const speck = plan(field(d => rect(d, 126, 126, 2, 0.92)));
  assert.ok(!speck.layers.flatMap(l => l.shapes).some(sh => /^shadow\/b5\//.test(sh._valuePlan.id) && sh.mask[127 * W + 127]));
});
