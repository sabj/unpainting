import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussianField, grainSurface, GRAIN_MM } from './grain-field.mjs';
import { makePaper } from './paper.mjs';

const neighbour = (a, w, h) => {
  let m = 0; for (const v of a) m += v; m /= a.length;
  let c = 0, v = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = a[y * w + x] - m; v += d * d; if (x < w - 1) c += d * (a[y * w + x + 1] - m); }
  return (c / (h * (w - 1))) / (v / (w * h));
};

test('gaussianField keeps a constant and the mean', () => {
  const a = new Float32Array(100).fill(0.3), b = gaussianField(a, 10, 10, 1.5);
  for (const v of b) assert.ok(Math.abs(v - 0.3) < 1e-6);
  const r = Float32Array.from({ length: 400 }, (_, i) => (i * 7919) % 13 / 13);
  const s = gaussianField(r, 20, 20, 1); let ma = 0, mb = 0; for (let i = 0; i < 400; i++) { ma += r[i]; mb += s[i]; }
  assert.ok(Math.abs(ma - mb) / ma < 0.02);
});

test('grainSurface refuses a sheet without millimetres', () => {
  assert.throws(() => grainSurface(new Float32Array(4), 2, 2, 0, { seed: 1, relief: 'cold' }), /mmPerCell/);
  assert.throws(() => grainSurface(new Float32Array(4), 2, 2, 0.26, null), /seed/);
});

test('a physical sheet granulates on a field a few tenths of a millimetre across, the same at two cell sizes', () => {
  const at = mm => { const w = Math.round(30 / mm); return { w, p: makePaper(w, w, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } }) }; };
  const A = at(0.26), B = at(0.13);
  // the hollow is no longer independent from one cell to the next
  assert.ok(neighbour(A.p.hollow, A.w, A.w) > 0.6, `0.26 mm: ${neighbour(A.p.hollow, A.w, A.w)}`);
  // two cells at 0.13 mm are one at 0.26 mm: the same length on the paper, about the same correlation
  const two = (() => { const w = B.w, a = B.p.grainH; let m = 0; for (const v of a) m += v; m /= a.length; let c = 0, v = 0; for (let y = 0; y < w; y++) for (let x = 0; x < w - 2; x++) { const d = a[y * w + x] - m; v += d * d; c += d * (a[y * w + x + 2] - m); } return c / v; })();
  assert.ok(Math.abs(two - neighbour(A.p.grainH, A.w, A.w)) < 0.12, `${two} against ${neighbour(A.p.grainH, A.w, A.w)}`);
  // hollows measured in the field's own RMS: about half the cells sit below the tooth level, as before
  const share = A.p.hollow.filter(v => v > 0).length / A.p.n;
  assert.ok(share > 0.35 && share < 0.65, `${share}`);
  assert.equal(GRAIN_MM, 0.2);
});

test('a sheet without units granulates on its own height', () => {
  const p = makePaper(40, 40, { seed: 3 });
  assert.equal(p.grainH, p.height);
});
