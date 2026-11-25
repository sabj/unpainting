import test from 'node:test';
import assert from 'node:assert/strict';
import { cockleField } from './cockle.mjs';
import { makePaper, SURFACE_MM } from './paper.mjs';

const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

test('cockle: mean zero, the asked RMS in mm, and none without it', () => {
  const c = cockleField(200, 150, 0.2, { seed: 3, rmsMm: 0.03 });
  assert.ok(Math.abs(mean(c)) < 1e-6);
  assert.ok(Math.abs(rms(c) - 0.03) < 1e-4, String(rms(c)));
  assert.ok(cockleField(50, 50, 0.2, { rmsMm: 0 }).every(v => v === 0));
  assert.ok(cockleField(50, 50, 0, { rmsMm: 0.03 }).every(v => v === 0));
});

test('cockle: smooth at the scale of a cell, and the same buckles at any cell size', () => {
  const c = cockleField(200, 200, 0.1, { seed: 5, rmsMm: 0.03 });
  let step = 0; for (let y = 0; y < 200; y++) for (let x = 1; x < 200; x++) step = Math.max(step, Math.abs(c[y * 200 + x] - c[y * 200 + x - 1]));
  assert.ok(step < 0.005, `largest step between neighbouring 0.1 mm cells ${step} mm`);
  // a 20 mm square at 0.1 mm and at 0.2 mm cells: the same point of the sheet, the same height (to the noise's own grid)
  const fine = cockleField(200, 200, 0.1, { seed: 5, rmsMm: 0.03 }), coarse = cockleField(100, 100, 0.2, { seed: 5, rmsMm: 0.03 });
  let worst = 0; for (let y = 10; y < 90; y += 7) for (let x = 10; x < 90; x += 7) worst = Math.max(worst, Math.abs(coarse[y * 100 + x] - 0.5 * (fine[(2 * y) * 200 + 2 * x] + fine[(2 * y + 1) * 200 + 2 * x + 1])));
  assert.ok(worst < 0.01, `${worst}`);
});

test('a physical paper carries the cockle in its water surface only; a unitless paper stays flat', () => {
  const p = makePaper(120, 90, { seed: 4, mmPerCell: 0.25, coldPress: { mmPerCell: 0.25, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
  assert.ok(p.surface, 'surface');
  const d = Array.from(p.surface, (v, i) => (v - p.valley[i]) * SURFACE_MM);
  assert.ok(Math.abs(rms(d) - 0.03) < 3e-3, String(rms(d)));
  const flat = makePaper(120, 90, { seed: 4, mmPerCell: 0.25, coldPress: { mmPerCell: 0.25, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 }, cockle: { rmsMm: 0 } });
  assert.equal(flat.surface, undefined);
  assert.deepEqual(Array.from(flat.valley), Array.from(p.valley));
  assert.equal(makePaper(60, 60, { seed: 4 }).surface, undefined);
});
