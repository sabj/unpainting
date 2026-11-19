import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineLoops, softLines, planWashStrokes } from './wash-strokes.mjs';

const KIT = [38, 25.4, 7, 5, 3];
const rect = (w, h, x0, y0, x1, y1) => { const ids = new Int32Array(w * h); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) ids[y * w + x] = 1; return ids; };
const BOX = (w, h) => ({ x0: 0, y0: 0, x1: w - 1, y1: h - 1 });

test('an outline is in millimetres and does not change with the cell size', () => {
  for (const cellMm of [1, .5, .25]) {
    const k = 1 / cellMm, w = 60 * k, h = 40 * k, loops = outlineLoops(rect(w, h, 10 * k, 5 * k, 40 * k, 25 * k), 1, BOX(w, h), w, h, { cellMm, tolMm: .75 });
    assert.equal(loops.length, 1);
    assert.deepEqual(loops[0].points, [[10, 5], [40, 5], [40, 25], [10, 25]]);
  }
});

test('a stair-stepped edge is simplified to the tolerance, and a hole is its own loop', () => {
  const w = 60, h = 60, ids = new Int32Array(w * h);
  for (let y = 5; y < 45; y++) for (let x = 5; x < 5 + y; x++) ids[y * w + x] = 1;       // a right triangle with a stepped diagonal
  for (let y = 30; y < 36; y++) for (let x = 10; x < 16; x++) ids[y * w + x] = 0;         // and a hole
  const loops = outlineLoops(ids, 1, BOX(w, h), w, h, { cellMm: 1, tolMm: .75 });
  assert.equal(loops.length, 2);
  assert.ok(loops[0].points.length <= 6, `${loops[0].points.length} points for a triangle`);
  assert.equal(loops[1].points.length >= 4, true);
});

test('soft and hard are decided once a boundary and come out as lines along the soft part', () => {
  const w = 60, h = 40, loops = outlineLoops(rect(w, h, 10, 5, 40, 25), 1, BOX(w, h), w, h, { cellMm: 1, tolMm: .75, soft: (i, j) => j % w >= 40 });
  assert.deepEqual(loops[0].soft, [false, true, false, false]);
  assert.deepEqual(softLines(loops), [[[40, 5], [40, 25]]]);
  const all = outlineLoops(rect(w, h, 10, 5, 40, 25), 1, BOX(w, h), w, h, { cellMm: 1, tolMm: .75, soft: () => true });
  assert.equal(softLines(all)[0].length, 5, 'an all-soft outline is one closed line');
});

test('strokes stay inside the outline by their own width, widest brush that fits, and cover it', () => {
  const loops = [{ points: [[10, 10], [70, 10], [70, 50], [10, 50]], soft: [] }], { strokes, areaMm2, uncovered } = planWashStrokes(loops, { kitMm: KIT, pointMm: 1.2 });
  assert.ok(Math.abs(areaMm2 - 2400) < 50);
  assert.ok(uncovered < .02, `${uncovered} uncovered`);
  assert.equal(strokes[0].kind, 'edge'); assert.equal(strokes[0].radiusMm, 1.5);
  assert.ok(strokes.some(s => s.kind === 'lane' && s.radiusMm === 12.7), 'the one-inch flat fits inside the edge stroke of a 40 mm band');
  assert.ok(!strokes.some(s => s.radiusMm === 19), 'the mop does not');
  // a lane is a flat brush drawn straight: its width stays inside the outline, and it runs to the outline at both ends
  for (const s of strokes) for (const [x, y] of s.points) { const along = s.kind === 'lane' ? 0 : s.radiusMm; assert.ok(x - along >= 10 - .5 && x + along <= 70 + .5 && y - s.radiusMm >= 10 - .5 && y + s.radiusMm <= 50 + .5, `${s.kind} r ${s.radiusMm} at ${x}, ${y}`); }
  assert.ok(strokes.length <= 12, `${strokes.length} strokes for a 60 x 40 mm wash`);
  // no wide lane goes over the edge stroke's band or another lane's: the wash is not charged twice along its edge
  for (const s of strokes.filter(q => q.kind === 'lane' && q.radiusMm > 1.5)) for (const [, y] of s.points) assert.ok(y - s.radiusMm >= 13 - .5 && y + s.radiusMm <= 47 + .5);
});

test('the strokes are the same on any grid, and lanes run along the longer side', () => {
  const tall = planWashStrokes([{ points: [[10, 10], [22, 10], [22, 70], [10, 70]], soft: [] }], { kitMm: KIT }).strokes.filter(s => s.kind === 'lane');
  assert.ok(tall.length >= 1);
  for (const s of tall) assert.ok(Math.abs(s.points[0][0] - s.points.at(-1)[0]) < 1e-6 && Math.abs(s.points[0][1] - s.points.at(-1)[1]) > 20);
});

test('a part narrower than the smallest wash brush is laid with the detail brush, or counted when there is none', () => {
  const loops = [{ points: [[10, 10], [40, 10], [40, 30], [26, 30], [26, 32], [60, 32], [60, 34], [10, 34]], soft: [] }];   // a block with a 2 mm tail
  const without = planWashStrokes(loops, { kitMm: KIT }), withPoint = planWashStrokes(loops, { kitMm: KIT, pointMm: 1.2 });
  assert.ok(without.uncovered > .05 && withPoint.uncovered < without.uncovered / 2, `${without.uncovered} then ${withPoint.uncovered}`);
  assert.ok(withPoint.strokes.some(s => s.kind === 'point' && s.radiusMm === .6));
  assert.ok(!without.strokes.some(s => s.kind === 'point'));
});
