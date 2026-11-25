import test from 'node:test';
import assert from 'node:assert/strict';
import { standardSheet, sheetTable, SHEET_AREA_MM2, CELL_MM, SHEET_RULE } from './sheet-rule.mjs';

const PICTURES = [[768, 548], [3451, 2363], [1086, 1448], [2902, 4036], [977, 958], [3000, 1000], [400, 2000]];

test('every picture gets the same area of paper, a quarter sheet, whatever its proportions', () => {
  assert.equal(SHEET_AREA_MM2, 279 * 381);
  for (const px of PICTURES) {
    const s = standardSheet(px), area = s.widthMm * s.heightMm, cells = s.cells * s.rows;
    assert.ok(Math.abs(area / SHEET_AREA_MM2 - 1) < 0.003, `${px}: ${area} mm2`);
    assert.ok(Math.abs(cells / 1.5725e6 - 1) < 0.003, `${px}: ${cells} cells`);
    assert.ok(Math.abs(s.widthMm / s.heightMm / (px[0] / px[1]) - 1) < 0.002, `${px}: the picture's own proportions`);
    assert.equal(s.cellMm, CELL_MM); assert.ok(Math.abs(s.widthMm / s.cells - CELL_MM) < 1e-9);
  }
  assert.deepEqual(standardSheet([279, 381]), { widthMm: 278.98, heightMm: 380.97, cells: 1073, rows: 1465, cellMm: 0.26 }, 'a picture of the quarter sheet\'s own shape: the quarter sheet');
});

test('the file\'s pixel size and its orientation change nothing', () => {
  assert.deepEqual(standardSheet([768, 548]), standardSheet([7680, 5480]), 'a small file and a large one of the same picture');
  const a = standardSheet([1536, 1024]), b = standardSheet([1024, 1536]);
  assert.deepEqual([a.cells, a.rows, a.widthMm, a.heightMm], [b.rows, b.cells, b.heightMm, b.widthMm], 'turned on its side: the same sheet turned');
  assert.throws(() => standardSheet([0, 10]), /size in pixels/); assert.throws(() => standardSheet([]), /size in pixels/);
});

test('the table shows each record as registered and under the rule', () => {
  const [old, now] = sheetTable([
    { id: 'ships', source: { px: [768, 548] }, sheet: { widthMm: 199.68, cellsAcross: { full: 768 } } },
    { id: 'rose', inputId: 'rose-q', source: { px: [1536, 1024] }, sheet: { rule: SHEET_RULE, widthMm: 399.36, cellsAcross: { full: 1536 } } }]);
  assert.deepEqual([old.before.cells, old.before.rows, old.after.cells, old.after.rows, old.underRule, old.times], [768, 548, 1485, 1060, false, 3.74]);
  assert.deepEqual([now.inputId, now.before.cells, now.after.cells, now.underRule, now.times], ['rose-q', 1536, 1536, true, 1]);
});
