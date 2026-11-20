import test from 'node:test';
import assert from 'node:assert/strict';
import { rimContrast, grainContrast, bandSpectrum, insideDistance } from './wash-measure.mjs';

const disc = (w, rim, inner, noise = 0) => { const od = new Float64Array(w * w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2), e = w * 0.4 - d; od[y * w + x] = e < 0 ? 0 : (e < 4 ? rim : inner) + noise * Math.sin(x * 2.1) * Math.sin(y * 1.7); } return od; };

test('a disc with a dark outer band measures a rim above 1, a flat one 1', () => {
  assert.ok(Math.abs(rimContrast(disc(100, 0.5, 0.5), 100, 100, 0.25).contrast - 1) < 1e-9);
  assert.ok(rimContrast(disc(100, 0.7, 0.5), 100, 100, 0.25).contrast > 1.3);
});
test('distance inside a mask counts cells to the outside', () => {
  const m = new Uint8Array(25).fill(1), d = insideDistance(m, 5, 5);
  assert.equal(d[12], 3); assert.equal(d[0], 1);
});
test('grain contrast sees fine texture and not a flat field', () => {
  const all = new Uint8Array(100 * 100).fill(1);
  assert.equal(grainContrast(disc(100, 0.5, 0.5).fill(0.5), 100, 100, 0.1, all).sd, 0);
  assert.ok(grainContrast(disc(100, 0.5, 0.5, 0.05).map(v => v || 0.5), 100, 100, 0.1, all).relative > 0.02);
});
test('the band spectrum puts a sine in its own octave', () => {
  const n = 64, mm = 0.1, f = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) f[y * n + x] = Math.sin((2 * Math.PI * x * mm) / 1);  // 1 mm wavelength
  const s = bandSpectrum(f, n, mm, 0, 0, n);
  assert.ok(s[1] > 5 * s[0.5] && s[1] > 5 * s[2]);
  assert.equal(s[0.1], null);
});
