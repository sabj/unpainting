// The point width in src/paint/brushes.json is what the engine's own contact lays, and a point-scale passage is laid at the
// density that reaches it (the density test: overlook at 0.258 and 0.129 mm a cell).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { narrowestStable, layMask } from './brush-point-swatch.mjs';

const KIT = JSON.parse(fs.readFileSync(new URL('../../src/paint/brushes.json', import.meta.url), 'utf8')).brushes;
const CELL_1X = 280 / 1086, CELL_2X = 280 / 2172;

test('the rigger lays a stable line about its point width at both densities', { timeout: 280000 }, () => {
  for (const mm of [CELL_2X, CELL_1X]) {
    const r = narrowestStable({ mm, brush: 'rigger' });
    assert.ok(Math.abs(r.mm - KIT.rigger.point_width_mm) <= 0.2, `${mm.toFixed(3)} mm a cell: ${r.mm} mm against ${KIT.rigger.point_width_mm}`);
    assert.ok(r.pressure <= 0.1, 'at light pressure');
  }
});

test('a passage of the narrowest mark is laid whole at twice the density', { timeout: 120000 }, () => {
  // a 4 cell by 44 cell strip: 0.5 mm by 5.7 mm at 0.129 mm a cell
  const w = 80, h = 40, mask = new Uint8Array(w * h);
  for (let y = 18; y < 22; y++) for (let x = 18; x < 62; x++) mask[y * w + x] = 1;
  const share = layMask({ mm: CELL_2X, mask, w, h });
  assert.ok(share >= 0.9, `${(100 * share).toFixed(0)} percent of the strip carries paint`);
});
