import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMarkPaths, validateSurfaceMarks, SURFACE_MARKS } from './surface-marks.mjs';

const w = 200, h = 120, mmPerCell = 0.25, full = new Uint8Array(w * h).fill(1);
const toCell = ([x, y]) => [x * w, y * h];
const base = { mask: full, w, h, mmPerCell, brushMm: 2, toCell, seedKey: 'area/pass' };
const length = pts => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);

test('every kind needs a reason and an explicit cover; coats need a flow and masonry a course angle', () => {
  for (const kind of SURFACE_MARKS) assert.throws(() => validateSurfaceMarks({ kind, cover: 0.5, placement: 'whole' }), /reason/);
  assert.throws(() => validateSurfaceMarks({ kind: 'short-coat', reason: 'smooth coat', cover: 0.5, placement: 'whole' }), /flow/);
  assert.throws(() => validateSurfaceMarks({ kind: 'masonry', reason: 'cut stone', cover: 0.5, placement: 'whole' }), /courseAngleDeg/);
  assert.throws(() => validateSurfaceMarks({ kind: 'curly-coat', reason: 'curls' }), /cover/);
  assert.throws(() => validateSurfaceMarks({ kind: 'curly-coat', reason: 'curls', cover: 0.5 }), /placement/);
  assert.throws(() => validateSurfaceMarks({ kind: 'feathers', reason: 'x', cover: 1, placement: 'whole' }), /kind/);
  assert.ok(validateSurfaceMarks({ kind: 'curly-coat', reason: 'tight curls', cover: 0.6, placement: 'whole' }));
});

test('marks are sized by the brush: a short-coat flick is four brush widths along the flow', () => {
  const paths = surfaceMarkPaths({ kind: 'short-coat', reason: 'smooth coat', cover: 1, placement: 'whole', flow: [[0, 0.5], [1, 0.5]] }, base);
  assert.ok(paths.length > 20);
  const W = base.brushMm / mmPerCell;
  for (const p of paths) {
    assert.ok(Math.abs(length(p) - 4 * W) < 0.05 * W, 'flick length');
    const dx = p.at(-1).x - p[0].x, dy = p.at(-1).y - p[0].y;
    assert.ok(Math.abs(Math.atan2(dy, dx)) <= 15 * Math.PI / 180 + 1e-9, 'along the flow, within the spread');
    assert.ok(p[0].p > p.at(-1).p, 'pressed at the root, lifted at the tip');
    assert.equal(p[0].r, W / 2);
  }
  const wider = surfaceMarkPaths({ kind: 'short-coat', reason: 'smooth coat', cover: 1, placement: 'whole', flow: [[0, 0.5], [1, 0.5]] }, { ...base, brushMm: 4 });
  assert.ok(wider.length < paths.length, 'a wider brush lays fewer, larger marks');
});

test('long hair is long and waved; curly coat is crescents; masonry is level courses of flat strokes', () => {
  const W = base.brushMm / mmPerCell;
  const hair = surfaceMarkPaths({ kind: 'long-hair', reason: 'long hair', cover: 1, placement: 'whole', flow: [[0.5, 0], [0.5, 1]] }, { ...base, mask: new Uint8Array(w * h).fill(1), h: 120 });
  assert.ok(hair.length > 0 && hair.every(p => length(p) > 12 * W * 0.98));
  const curls = surfaceMarkPaths({ kind: 'curly-coat', reason: 'curls', cover: 1, placement: 'whole' }, base);
  assert.ok(curls.length > 10);
  for (const p of curls) { const chord = Math.hypot(p.at(-1).x - p[0].x, p.at(-1).y - p[0].y); assert.ok(chord < length(p) * 0.7, 'a crescent turns'); }
  const stone = surfaceMarkPaths({ kind: 'masonry', reason: 'cut stone wall', cover: 1, placement: 'whole', courseAngleDeg: 0 }, base);
  assert.ok(stone.length > 10);
  for (const p of stone) { assert.ok(Math.abs(p.at(-1).y - p[0].y) < 1e-9, 'level'); assert.ok(p.every(q => q.p === 1)); }
  const rows = new Set(stone.map(p => Math.round(p[0].y)));
  assert.ok(rows.size >= 2 && [...rows].sort((a, b) => a - b).every((y, i, a) => !i || Math.abs(y - a[i - 1] - W) <= 1), 'one brush width per course');
});

test('cover sets how much of the area the marks visit; marks stay inside the shape; the same plan paints the same marks', () => {
  const m = { kind: 'curly-coat', reason: 'curls', cover: 1, placement: 'whole' };
  const all = surfaceMarkPaths(m, base), some = surfaceMarkPaths({ ...m, cover: 0.3, placement: 'whole' }, base);
  assert.ok(some.length < all.length * 0.5 && some.length > 0);
  const half = Uint8Array.from({ length: w * h }, (_, i) => (i % w < w / 2 ? 1 : 0));
  const inHalf = surfaceMarkPaths(m, { ...base, mask: half });
  assert.ok(inHalf.length > 0 && inHalf.every(p => p.every(q => q.x < w / 2 + 0.5)));
  assert.deepEqual(surfaceMarkPaths(m, base), all);
  assert.notDeepEqual(surfaceMarkPaths(m, { ...base, seedKey: 'other/pass' }), all);
  assert.deepEqual(surfaceMarkPaths(m, { ...base, mask: new Uint8Array(w * h) }), []);
});

test('scale maps plan cells to sheet cells', () => {
  const m = { kind: 'masonry', reason: 'brick', cover: 1, placement: 'whole', courseAngleDeg: 10 };
  const a = surfaceMarkPaths(m, base), b = surfaceMarkPaths(m, { ...base, scale: 2 });
  assert.equal(a.length, b.length);
  assert.ok(Math.abs(b[0][0].x - 2 * a[0][0].x) < 1e-9 && Math.abs(b[0][0].r - 2 * a[0][0].r) < 1e-9);
});

test('placement edge keeps marks to the edge of the mass, as painters suggest a coat at its silhouette', () => {
  const m = { kind: 'curly-coat', reason: 'curls at the silhouette', cover: 1 };
  const W = base.brushMm / mmPerCell, edge = surfaceMarkPaths({ ...m, placement: 'edge' }, base), whole = surfaceMarkPaths({ ...m, placement: 'whole' }, base);
  assert.ok(edge.length > 0 && edge.length < whole.length * 0.7);
  for (const p of edge) {
    const c = p[0], d = Math.min(c.x, c.y, w - c.x, h - c.y);
    assert.ok(d < 2 * W + 1.5 * W + 1, 'centre within two widths of the edge (plus the crescent radius)');
  }
});
