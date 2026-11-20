import test from 'node:test';
import assert from 'node:assert/strict';
import { lstar, lightness, lstarDiff, fingerprint, checksum, verdict, table } from './score.mjs';
import { fillPolygons, nodeMaskRasterizer } from './mask.mjs';
import { anyWet } from './render-bench.mjs';

test('L* runs from black to white and follows the sRGB curve', () => {
  assert.equal(lstar(0, 0, 0), 0);
  assert.ok(Math.abs(lstar(255, 255, 255) - 100) < 1e-9);
  assert.ok(Math.abs(lstar(119, 119, 119) - 50) < 0.3, 'sRGB 119 grey is about L* 50');
  assert.ok(lstar(0, 255, 0) > lstar(255, 0, 0) && lstar(255, 0, 0) > lstar(0, 0, 255), 'green is lightest, blue darkest');
  assert.deepEqual(Array.from(lightness(Uint8Array.of(0, 0, 0, 255, 255, 255)), Math.round), [0, 100]);
});

test('the L* difference reports mean, worst and the share over one L*', () => {
  const a = Uint8Array.of(255, 255, 255, 119, 119, 119, 0, 0, 0, 10, 10, 10), b = Uint8Array.from(a);
  assert.deepEqual(lstarDiff(a, b), { mean: 0, worst: 0, over1: 0 });
  b[3] = b[4] = b[5] = 0; // one of four pixels from L* 50 to 0
  const d = lstarDiff(a, b);
  assert.ok(Math.abs(d.worst - lstar(119, 119, 119)) < 1e-9);
  assert.ok(Math.abs(d.mean - d.worst / 4) < 1e-9);
  assert.equal(d.over1, 0.25);
  assert.throws(() => lstarDiff(a, a.subarray(3)), RangeError);
});

test('the fingerprint ignores float noise and catches a renderer change', () => {
  const w = 32, h = 24, base = new Uint8Array(w * h * 3).fill(119); // L* 50.0, far from a rounding edge
  const noisy = base.map((v, i) => v + (i % 7 === 0 ? 1 : 0));
  const darker = Uint8Array.from(base); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) for (let c = 0; c < 3; c++) darker[(y * w + x) * 3 + c] -= 40;
  const f = fingerprint(base, w, h);
  assert.equal(f.cells.length, 64);
  assert.equal(fingerprint(noisy, w, h).hash, f.hash, 'one level of noise in a few channels keeps the fingerprint');
  assert.notEqual(checksum(noisy), checksum(base), 'the checksum is exact');
  assert.notEqual(fingerprint(darker, w, h).hash, f.hash, 'a darker corner changes it');
  assert.throws(() => fingerprint(base, w + 1, h), RangeError);
});

test('the verdict says same, same (coarse), changed or new', () => {
  const now = { checksum: 'a', fingerprint: 'f' };
  assert.equal(verdict(now, null), 'new');
  assert.equal(verdict(now, { checksum: 'a', fingerprint: 'f' }), 'same');
  assert.equal(verdict(now, { checksum: 'b', fingerprint: 'f' }), 'same (coarse)');
  assert.equal(verdict(now, { checksum: 'b', fingerprint: 'g' }), 'changed');
});

test('the table aligns numbers right, text left, and shows a dash for no value', () => {
  const t = table([{ key: 'name', label: 'plate' }, { key: 's', label: 'wall s', fmt: v => v.toFixed(1) }], [{ name: 'amanita', s: 12.34 }, { name: 'morel', s: null }]).split('\n');
  assert.equal(t[0], 'plate    wall s');
  assert.equal(t[2], 'amanita    12.3');
  assert.equal(t[3], 'morel         -');
});

test('polygons fill at cell centres with nonzero winding, scaled to the sheet', () => {
  const w = 10, h = 10, out = fillPolygons(new Uint8Array(w * h), w, h, [[[2, 2], [8, 2], [8, 8], [2, 8]]], 0.5);
  // plate square 2..8 at half scale is cells 1..4 by centre
  const on = []; out.forEach((v, i) => v && on.push(i)); assert.equal(on.length, 9);
  assert.equal(out[1 * w + 1], 1); assert.equal(out[3 * w + 3], 1); assert.equal(out[4 * w + 4], 0); assert.equal(out[0], 0);
  // two overlapping squares wound the same way stay filled where they overlap (nonzero, not even-odd)
  const both = fillPolygons(new Uint8Array(w * h), w, h, [[[0, 0], [6, 0], [6, 6], [0, 6]], [[3, 3], [9, 3], [9, 9], [3, 9]]], 1);
  assert.equal(both[4 * w + 4], 1);
});

test('the mask keeps the shape inside its islands and outside its reserves', () => {
  const mark = { shape: [[0, 0], [20, 0], [20, 20], [0, 20]], islands: [[[0, 0], [10, 0], [10, 20], [0, 20]]], reserves: [[[0, 0], [4, 0], [4, 4], [0, 4]]] };
  const m = nodeMaskRasterizer()(mark, { width: 20, height: 20, scale: 1 });
  assert.equal(m[10 * 20 + 5], 1, 'inside shape and island');
  assert.equal(m[10 * 20 + 15], 0, 'outside the island');
  assert.equal(m[1 * 20 + 1], 0, 'inside a reserve');
  assert.throws(() => nodeMaskRasterizer()({ ...mark, depthFaces: [] }, { width: 20, height: 20, scale: 1 }), /lamellarCoverage/);
  const half = nodeMaskRasterizer({ coverage: () => ({ x: 0, y: 0, width: 20, height: 10, alpha: new Uint8ClampedArray(200).fill(255) }) });
  const g = half({ shape: mark.shape, depthFaces: [] }, { width: 20, height: 20, scale: 1 });
  assert.equal(g[5 * 20 + 5], 1, 'gill coverage keeps the upper half'); assert.equal(g[15 * 20 + 5], 0, 'and clears the rest');
});

test('a sheet is wet while any cell has surface water or pores over 2% full', () => {
  const paper = { capacity: Float32Array.of(1, 1) };
  assert.equal(anyWet({ n: 2, paper, M: Uint8Array.of(0, 0), s: Float32Array.of(0.01, 0.02) }), false);
  assert.equal(anyWet({ n: 2, paper, M: Uint8Array.of(0, 0), s: Float32Array.of(0, 0.03) }), true);
  assert.equal(anyWet({ n: 2, paper, M: Uint8Array.of(0, 1), s: Float32Array.of(0, 0) }), true);
});
