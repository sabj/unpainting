import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_SHEET_MM, POSTCARD_HEIGHT_MM, POSTCARD_WIDTH_MM } from './sheet-size.mjs';
import { loadPhysical } from '../paint/methods/brushes.mjs';

const root = new URL('../../', import.meta.url).pathname;
const options = values => ({ opt: (n, d) => values[n] ?? d, num: (n, d) => Number(values[n] ?? d) });

test('the default sheet is a 6 x 4 inch postcard', () => {
  assert.equal(DEFAULT_SHEET_MM, POSTCARD_WIDTH_MM);
  assert.ok(Math.abs(POSTCARD_WIDTH_MM - 6 * 25.4) < 1e-9);
  assert.ok(Math.abs(POSTCARD_HEIGHT_MM - 4 * 25.4) < 1e-9);
});

test('the physical brush file uses the same postcard sheet', () => {
  const { sheet } = JSON.parse(fs.readFileSync(new URL('../../data/brushes.json', import.meta.url), 'utf8'));
  assert.deepEqual([Math.min(sheet.width_mm, sheet.height_mm), Math.max(sheet.width_mm, sheet.height_mm)], [POSTCARD_HEIGHT_MM, POSTCARD_WIDTH_MM]);
});

test('a landscape picture fitted to the physical sheet is 152.4 mm wide', () => {
  const pb = loadPhysical({ root, ...options({ physical: 1 }), W2: 540, H2: 360 });
  assert.ok(Math.abs(pb.mmPerCell * 540 - POSTCARD_WIDTH_MM) < 1e-9, `${pb.mmPerCell * 540} mm`);
});
