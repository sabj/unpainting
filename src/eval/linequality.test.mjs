// A drawn line scores above a ball of loops on the same edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineQuality } from './linequality.mjs';

const W = 120, H = 120, N = W * H;
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
// a form: a dark block whose left edge runs down the sheet at x = 40
const source = Float32Array.from({ length: N }, (_, i) => ((i % W) >= 40 ? 1 : 0.05));

const drawn = () => { const m = new Float32Array(N); for (let y = 10; y < H - 10; y++) for (let d = -1; d <= 1; d++) m[y * W + 40 + d] = 1; return m; };
const loops = () => {
  const m = new Float32Array(N);
  for (let c = 12; c < H - 12; c += 8) for (let t = 0; t < 40; t++) {
    const a = (t / 40) * 2 * Math.PI, x = Math.round(40 + 4 * Math.cos(a)), y = Math.round(c + 4 * Math.sin(a));
    if (x > 0 && y > 0 && x < W && y < H) m[y * W + x] = 1;
  }
  return m;
};

test('a line down the form scores well above loops on the same edge', () => {
  const a = lineQuality(drawn(), source, W, H, blur);
  const b = lineQuality(loops(), source, W, H, blur);
  assert.ok(a.score > 0.4, `drawn ${JSON.stringify(a)}`);
  assert.ok(b.score < a.score / 2, `loops ${JSON.stringify(b)} against drawn ${a.score}`);
  assert.ok(a.steady > b.steady, `steady drawn ${a.steady} loops ${b.steady}`);
});

test('ink strewn over open paper is placed badly', () => {
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const strewn = new Float32Array(N);
  for (let k = 0; k < 600; k++) { const x = Math.round(5 + rnd() * 30), y = Math.round(5 + rnd() * 110); strewn[y * W + x] = 1; }
  const r = lineQuality(strewn, source, W, H, blur);
  assert.ok(r.placed < 0.35, `placed ${r.placed}`);
});

test('no ink is a zero, not a crash', () => {
  const r = lineQuality(new Float32Array(N), source, W, H, blur);
  assert.equal(r.score, 0);
  assert.equal(r.cells, 0);
});
