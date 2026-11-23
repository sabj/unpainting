import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACING_CELLS, finalWidthOf, mmSpacingDefault, dabSpacingFactor } from './look-scale.mjs';

test('a painting is its own final; a look names a final of no fewer cells', () => {
  assert.equal(finalWidthOf(1086), 1086); assert.equal(finalWidthOf(543, 1086), 1086); assert.equal(finalWidthOf(543, 543), 543);
  assert.throws(() => finalWidthOf(543, 400), RangeError); assert.throws(() => finalWidthOf(543, 1086.5), RangeError);
});

test('dabs keep their millimetres on the sheet, and a look\'s swatches are spaced as the final\'s', () => {
  // a painting that is not a look: one factor everywhere, as before
  assert.equal(dabSpacingFactor({ width: 1086, finalWidth: 1086, onSheet: true }), 1086 / SPACING_CELLS);
  assert.equal(dabSpacingFactor({ width: 1086, finalWidth: 1086, onSheet: false }), 1086 / SPACING_CELLS);
  // a half-size look: half the cells a dab on the sheet (the same millimetres), the final's cells a dab on scrap
  assert.equal(dabSpacingFactor({ width: 543, finalWidth: 1086, onSheet: true }), 543 / SPACING_CELLS);
  assert.equal(dabSpacingFactor({ width: 543, finalWidth: 1086, onSheet: false }), 1086 / SPACING_CELLS);
  // a 384-cell look at a 768-cell painting spaces by size because its final does
  assert.equal(mmSpacingDefault(768), true); assert.equal(mmSpacingDefault(384), false); assert.equal(mmSpacingDefault(540), false);
});

test('a rule in cells is a rule about the final sheet: a quarter of the cells on a half-size look, never none', async () => {
  const { cellsOfFinal } = await import('./look-scale.mjs');
  assert.equal(cellsOfFinal(40, 1086, 1086), 40); assert.equal(cellsOfFinal(40, 543, 1086), 10); assert.equal(cellsOfFinal(2, 100, 1000), 1);
});
