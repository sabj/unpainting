import test from 'node:test';
import assert from 'node:assert/strict';
import { boxGeometryKey, keepGeometry } from './edge-geometry-cache.mjs';
import { edgeGeometry } from './edge-geometry.mjs';

const sheetOf = (w, h) => ({ w, h, M: new Uint8Array(w * h), ever: new Uint8Array(w * h), resist: null });
const disc = (s, cx, cy, r) => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) s.M[y * s.w + x] = 1; };

test('a box keeps its key until what its geometry reads changes', () => {
  const s = sheetOf(60, 40), box = [10, 10, 30, 30];
  disc(s, 20, 20, 8);
  const k0 = boxGeometryKey(s, box, 'o', 2);
  s.M[5 * 60 + 50] = 1;                               // far outside the box and its reach: same key
  assert.equal(boxGeometryKey(s, box, 'o', 2), k0);
  s.ever[33 * 60 + 20] = 1;                           // three cells below the box: inside 1 + holeSpan
  const k1 = boxGeometryKey(s, box, 'o', 2);
  assert.notEqual(k1, k0);
  s.M[25 * 60 + 25] = 0;                              // a footprint cell inside the box
  assert.notEqual(boxGeometryKey(s, box, 'o', 2), k1);
  assert.notEqual(boxGeometryKey(s, box, 'p', 2), boxGeometryKey(s, box, 'o', 2));
  assert.notEqual(boxGeometryKey(s, [10, 10, 31, 30], 'o', 2), boxGeometryKey(s, box, 'o', 2));
  s.resist = new Uint8Array(60 * 40); s.resist[20 * 60 + 20] = 1;
  assert.notEqual(boxGeometryKey(s, box, 'o', 2), boxGeometryKey({ ...s, resist: null }, box, 'o', 2));
});

test('a kept geometry holds the values the refresh reads, at its cells in order', () => {
  const s = sheetOf(48, 48); disc(s, 24, 24, 12);
  const o = { edgeEvap: 0.01, edgeMm: 1, reachMm: 1.5, holeSpan: 0 }, box = [8, 8, 40, 40];
  const geo = edgeGeometry(s, o, box, 0.3, {});
  assert.ok(geo && geo.order.length > 0);
  const kept = keepGeometry(geo);
  assert.equal(kept.order.length, geo.order.length);
  geo.order.forEach((i, q) => { assert.equal(kept.order[q], i); assert.equal(kept.ex[q], geo.ex[i]); assert.equal(kept.fx[q], geo.fx[i]); assert.equal(kept.fy[q], geo.fy[i]); });
  // solved again from fresh scratch, the same numbers (the cache may stand in for a solve)
  const again = keepGeometry(edgeGeometry(s, o, box, 0.3, {}));
  assert.deepEqual(again, kept);
  assert.equal(keepGeometry(null), null);
});
