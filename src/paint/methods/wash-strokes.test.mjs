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

const laneRows = strokes => strokes.filter(s => s.kind === 'lane').map(s => s.points[0][1]);

test('a wash is laid with one brush chosen from its size, in a handful of lanes that overlap by a third', () => {
  // 100 x 70 mm: the one-inch flat (half the breadth is 35 mm); 60 x 40 mm: the 7 mm round; 8 x 8 mm: the 3 mm round
  for (const [a, b, brush, most] of [[100, 70, 25.4, 5], [60, 40, 7, 10], [8, 8, 3, 5]]) {
    const { strokes, brushMm, areaMm2, uncovered } = planWashStrokes([{ points: [[10, 10], [10 + a, 10], [10 + a, 10 + b], [10, 10 + b]], soft: [] }], { kitMm: KIT, pointMm: 1.2 });
    assert.equal(brushMm, brush, `${a} x ${b} mm`);
    assert.ok(Math.abs(areaMm2 - a * b) < .03 * a * b);
    assert.ok(uncovered < .01, `${uncovered} of a ${a} x ${b} mm wash left bare`);
    assert.ok(strokes.every(s => s.kind === 'lane' && s.radiusMm === brush / 2), 'a rectangle needs no edge stroke');
    const rows = laneRows(strokes); assert.ok(rows.length >= 3 && rows.length <= most, `${rows.length} lanes`);
    for (let q = 1; q < rows.length; q++) assert.ok(rows[q] - rows[q - 1] <= brush * 2 / 3 + .5, 'each lane overlaps the last by a third of the brush');
    // the brush's width stays inside the outline, and each lane runs to the outline at both ends
    for (const s of strokes) { assert.ok(s.points[0][1] - s.radiusMm >= 10 - .5 && s.points[0][1] + s.radiusMm <= 10 + b + .5); assert.ok(Math.abs(Math.abs(s.points[0][0] - s.points.at(-1)[0]) - a) < 1.5); }
  }
});

test('lanes run along the longer side', () => {
  const tall = planWashStrokes([{ points: [[10, 10], [22, 10], [22, 70], [10, 70]], soft: [] }], { kitMm: KIT }).strokes.filter(s => s.kind === 'lane');
  assert.ok(tall.length >= 3);
  for (const s of tall) assert.ok(Math.abs(s.points[0][0] - s.points.at(-1)[0]) < 1e-6 && Math.abs(s.points[0][1] - s.points.at(-1)[1]) > 20);
});

test('where the lanes fall short of a slanted edge the smallest brush goes round it, and a thin tail takes the detail brush', () => {
  const tri = planWashStrokes([{ points: [[10, 10], [70, 10], [10, 50]], soft: [] }], { kitMm: KIT, pointMm: 1.2 });
  assert.ok(tri.strokes.some(s => s.kind === 'edge' && s.radiusMm === 1.5));
  assert.ok(tri.uncovered < .03, `${tri.uncovered} of a triangle left bare`);
  const loops = [{ points: [[10, 10], [40, 10], [40, 30], [26, 30], [26, 32], [60, 32], [60, 34], [10, 34]], soft: [] }];   // a block with a 2 mm tail
  const without = planWashStrokes(loops, { kitMm: KIT }), withPoint = planWashStrokes(loops, { kitMm: KIT, pointMm: 1.2 });
  assert.ok(without.uncovered > .03 && withPoint.uncovered < without.uncovered / 2, `${without.uncovered} then ${withPoint.uncovered}`);
  assert.ok(withPoint.strokes.some(s => s.kind === 'point' && s.radiusMm === .6));
  assert.ok(!without.strokes.some(s => s.kind === 'point'));
});
