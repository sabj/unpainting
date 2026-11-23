import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineWater } from './clean-water.mjs';

// a w x h mask: a disc of radius R at the centre, with an optional hole
const disc = (w, h, R, hole = 0) => Uint8Array.from({ length: w * h }, (_, i) => { const d = Math.hypot(i % w + 0.5 - w / 2, ((i / w) | 0) + 0.5 - h / 2); return d <= R && d > hole ? 1 : 0; });

test('the outline water runs a brush radius inside the outline, so its edge lies on it', () => {
  const w = 120, h = 120, mm = 0.25, paths = outlineWater(disc(w, h, 40), w, h, { mmPerCell: mm, laneRadius: 30 });
  assert.equal(paths.length, 1);
  const r = paths[0][0].r;
  assert.equal(r, 4 / 2 / mm);   // the edge brush, 4 mm wide, narrower than the lanes'
  for (const p of paths[0]) { assert.equal(p.round, true); const d = Math.hypot(p.x - w / 2, p.y - h / 2); assert.ok(Math.abs(d + r - 40) <= 1.5, `point ${d.toFixed(1)} from the centre`); }
  const a = paths[0][0], b = paths[0][paths[0].length - 1];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, 'a closed outline is a closed stroke');
});

test('a hole gets its own ring, and the brush is never wider than the lanes', () => {
  const w = 160, h = 160, paths = outlineWater(disc(w, h, 60, 20), w, h, { mmPerCell: 0.25, laneRadius: 5 });
  assert.equal(paths.length, 2);
  for (const pts of paths) for (const p of pts) assert.equal(p.r, 5);
});

test('a part too narrow for the edge brush gets no water ring (its lanes wet it)', () => {
  const w = 60, h = 60; assert.deepEqual(outlineWater(disc(w, h, 2), w, h, { mmPerCell: 0.25, laneRadius: 8 }), []);
});

test('missing sizes fail loudly', () => {
  assert.throws(() => outlineWater(new Uint8Array(4), 2, 2, { mmPerCell: 0, laneRadius: 3 }));
  assert.throws(() => outlineWater(new Uint8Array(3), 2, 2, { mmPerCell: 0.25, laneRadius: 3 }));
});
