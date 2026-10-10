// A flick runs along the hair, goes from dark to light, and thins as it goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orientationField, furMarks } from './fur.mjs';

const W = 120, H = 120, N = W * H;
// stripes at 30 degrees below the horizontal, darker towards the upper left: hair lying one way with its roots dark
const ANGLE = (30 * Math.PI) / 180;
const stripes = () => {
  const D = new Float32Array(N), ux = Math.cos(ANGLE), uy = Math.sin(ANGLE);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const across = -x * uy + y * ux, along = x * ux + y * uy;
    D[y * W + x] = (0.5 + 0.5 * Math.sin(across * 0.8)) * Math.max(0.1, 1 - along / 170);
  }
  return D;
};
const blur = (F, w, h, s) => {
  const r = Math.max(1, Math.round(s * 2)), o = new Float32Array(F.length), t = new Float32Array(F.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx >= 0 && xx < w) { a += F[y * w + xx]; k++; } } t[y * w + x] = a / k; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy >= 0 && yy < h) { a += t[yy * w + x]; k++; } } o[y * w + x] = a / k; }
  return o;
};
const angleOff = (dx, dy) => { let d = Math.abs(Math.atan2(dy, dx) - ANGLE) % Math.PI; return Math.min(d, Math.PI - d); };

test('the orientation field lies along the stripes', () => {
  const O = orientationField(stripes(), W, H, blur, { sigma: 2 });
  let off = 0, k = 0;
  for (let y = 20; y < H - 20; y += 5) for (let x = 20; x < W - 20; x += 5) { const i = y * W + x; off += angleOff(O.dx[i], O.dy[i]); k++; }
  assert.ok(off / k < (15 * Math.PI) / 180, `mean ${(off / k * 180 / Math.PI).toFixed(1)} degrees off`);
});

test('flicks run along the hair, from dark to light, and thin as they go', () => {
  const D = stripes(), O = orientationField(D, W, H, blur, { sigma: 2 });
  const marks = furMarks(D, O, W, H, { length: 14, spacing: 3, seed: 3, coverage: 0.4, minWant: 0.2 });
  assert.ok(marks.length > 20, `${marks.length} marks`);
  let along = 0, darkFirst = 0, thinning = 0;
  for (const m of marks) {
    const a = m[0], b = m[m.length - 1];
    if (angleOff(b.x - a.x, b.y - a.y) < (25 * Math.PI) / 180) along++;
    if (a.want >= b.want) darkFirst++;
    if (a.p > b.p) thinning++;
  }
  assert.ok(along / marks.length > 0.8, `along ${along}/${marks.length}`);
  assert.ok(darkFirst / marks.length > 0.7, `dark first ${darkFirst}/${marks.length}`);
  assert.equal(thinning, marks.length);
});

test('paper is left between flicks', () => {
  const D = stripes(), O = orientationField(D, W, H, blur, { sigma: 2 });
  const marks = furMarks(D, O, W, H, { length: 14, spacing: 3, seed: 3, coverage: 0.4, minWant: 0.2 });
  const hit = new Uint8Array(N);
  for (const m of marks) for (const q of m) hit[Math.round(q.y) * W + Math.round(q.x)] = 1;
  let covered = 0, want = 0; for (let i = 0; i < N; i++) if (D[i] > 0.2) { want++; covered += hit[i]; }
  assert.ok(covered / want < 0.5, `covered ${(covered / want).toFixed(2)}`);
});
