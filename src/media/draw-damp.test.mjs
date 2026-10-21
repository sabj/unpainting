import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, layersOf } from './sheet.mjs';
import { drawGestures } from './draw.mjs';
import { renderLayers } from './km.mjs';

const pig = { name: 'ink', K: [0.4, 0.48, 0.62], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0 };

// how many cells of a horizontal pen line come out visibly dark, drawn with or without a damp gesture
function inkedCells(gesture) {
  const w = 60, h = 21, sheet = createSheet(makePaper(w, h, { seed: 3 }), [pig]);
  const points = Array.from({ length: 9 }, (_, k) => ({ x: 8 + 5.5 * k, y: 10, nw: 1, s: 0.6 }));
  drawGestures(sheet, [{ points, ...gesture }], new Float32Array(w * h).fill(0.6), w, h, { ink: [3], peak: 1, pen: { nib: 1, flex: 0, drop: 0.1 } });
  const rgb = renderLayers(layersOf(sheet), [pig], new Uint8ClampedArray(w * h * 3).fill(255), w * h, 1);
  let n = 0; for (let i = 0; i < w * h; i++) if (rgb[3 * i + 1] < 235) n++;
  return n;
}

test('a gesture marked damp feathers wider than the same gesture on dry paper', () => {
  const dry = inkedCells({}), damp = inkedCells({ damp: 0.6 });
  assert.ok(damp > dry, `damp ${damp} dry ${dry}`);
});
