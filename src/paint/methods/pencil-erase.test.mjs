import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseWeights, erasePencil } from './pencil-erase.mjs';

test('the eraser lifts pencil in the lights and leaves it under the darks', () => {
  // luminances 250, 150, 50 and 50 again; the light quantile 250, the cut 50
  const rgb = Uint8Array.from([250, 250, 250, 150, 150, 150, 50, 50, 50, 50, 50, 50]);
  const wts = eraseWeights(rgb, 4, 1, { full: 0.75, none: 0.25, blur: 0 });
  assert.deepEqual(Array.from(wts).map(v => +v.toFixed(3)), [1, 0.5, 0, 0]);
  const graphite = Float32Array.from([1, 1, 1, 1]), layer = Float32Array.from([2, 0, 2, 2]);
  const r = erasePencil([graphite, layer], wts, { strength: 0.8, w: 4, W2: 4 });
  assert.deepEqual(Array.from(graphite).map(v => +v.toFixed(3)), [0.2, 0.6, 1, 1]);
  assert.deepEqual(Array.from(layer).map(v => +v.toFixed(3)), [0.4, 0, 2, 2]);
  assert.equal(r.cells, 2);
  assert.throws(() => erasePencil([graphite], wts, { strength: 2, w: 4, W2: 4 }), /preperase/);
});

test('a dark contour bordering a light region on a sheet with unpainted paper margin still lifts', () => {
  const w = 40, h = 20, rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // right half unpainted paper (252), left quarter dark mass (60), middle strip lit passage (225) with dark contour at x=10 (30)
    const v = x >= 20 ? 252 : x === 10 ? 30 : x < 10 ? 60 : 225;
    const i = 3 * (y * w + x);
    rgb[i] = rgb[i + 1] = rgb[i + 2] = v;
  }
  const wts = eraseWeights(rgb, w, h, { full: 0.8, none: 0.4, blur: 2, reach: 2 });
  // contour at x=10 bounds the lit passage (225) and is lifted; interior of dark mass at x=3 stays at 0
  assert.ok(wts[10 * w + 10] > 0.5, `contour on lit edge lifted: ${wts[10 * w + 10]}`);
  assert.equal(wts[10 * w + 3], 0);
});
