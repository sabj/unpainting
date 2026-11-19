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
  assert.ok(loops[0].points.length <= 8, `${loops[0].points.length} points for a triangle`);
  assert.equal(loops[1].points.length >= 4, true);
});

test('soft and hard are decided once a boundary and come out as lines along the soft part', () => {
  const w = 60, h = 40, loops = outlineLoops(rect(w, h, 10, 5, 40, 25), 1, BOX(w, h), w, h, { cellMm: 1, tolMm: .75, soft: (i, j) => j % w >= 40 });
  assert.deepEqual(loops[0].soft, [false, true, false, false]);
  assert.deepEqual(softLines(loops), [[[40, 5], [40, 25]]]);
  const all = outlineLoops(rect(w, h, 10, 5, 40, 25), 1, BOX(w, h), w, h, { cellMm: 1, tolMm: .75, soft: () => true });
  assert.equal(softLines(all)[0].length, 5, 'an all-soft outline is one closed line');
});

const lengthOf = s => s.points.reduce((a, p, q) => a + (q ? Math.hypot(p[0] - s.points[q - 1][0], p[1] - s.points[q - 1][1]) : 0), 0);

const box = (a, b) => [{ points: [[10, 10], [10 + a, 10], [10 + a, 10 + b], [10, 10 + b]], soft: [] }];

test('a large wash is swept in straight lanes with the widest flat or mop that fits it, and its edge is closed by the rounds', () => {
  // 100 x 70 mm: the 38 mm mop in two lanes; 60 x 40 mm: the mop in one; 50 x 30 mm: the one-inch flat in one; each from edge to edge
  for (const [a, b, brush, lanes] of [[100, 70, 38, 2], [60, 40, 38, 1], [50, 30, 25.4, 1]]) {
    const { strokes, brushMm, areaMm2, uncovered } = planWashStrokes(box(a, b), { kitMm: KIT, pointMm: 1.2 });
    assert.equal(brushMm, brush, `${a} x ${b} mm`);
    assert.ok(Math.abs(areaMm2 - a * b) < .03 * a * b);
    assert.ok(uncovered < .02, `${uncovered} of a ${a} x ${b} mm wash left bare`);
    const swept = strokes.filter(s => s.kind === 'lane'); assert.equal(swept.length, lanes);
    for (const s of swept) {
      assert.equal(s.radiusMm, brush / 2);
      assert.equal(new Set(s.points.map(p => p[1])).size, 1, 'a lane is straight');
      assert.ok(Math.abs(lengthOf(s) - a) < 2, `a lane of ${lengthOf(s)} mm across a ${a} mm wash, edge to edge`);
      // the band is as wide as the brush and square at its ends: all of it is inside the outline
      for (const [x, y] of s.points) assert.ok(Math.min(x - 10, 10 + a - x) >= -.5 && Math.min(y - 10, 10 + b - y) >= brush / 2 - .8, `${x}, ${y}`);
    }
    assert.ok(strokes.length <= 16, `${strokes.length} strokes`);
  }
});

test('a wash too small for a flat is laid from its edge inward by the widest round that fits it, in a few rounds', () => {
  // 30 x 22 mm: the 7 mm round; 8 x 8 mm: the 5 mm round; 5 x 5 mm: the 3 mm round
  for (const [a, b, brush, most] of [[30, 22, 7, 3], [8, 8, 5, 3], [5, 5, 3, 3]]) {
    const { strokes, brushMm, areaMm2, uncovered } = planWashStrokes(box(a, b), { kitMm: KIT, pointMm: 1.2 });
    assert.equal(brushMm, brush, `${a} x ${b} mm`);
    assert.ok(Math.abs(areaMm2 - a * b) < .03 * a * b);
    assert.ok(uncovered < .06, `${uncovered} of a ${a} x ${b} mm wash left bare`);
    const rounds = strokes.filter(s => s.kind === 'contour'); assert.ok(rounds.length >= 1 && rounds.length <= most, `${rounds.length} rounds`);
    assert.ok(rounds.every(s => s.radiusMm === brush / 2));
    // the first round follows the outline, the brush's radius inside it: no point of it is nearer the outline than that
    for (const [x, y] of rounds[0].points) assert.ok(Math.min(x - 10, 10 + a - x, y - 10, 10 + b - y) >= brush / 2 - .8, `${x}, ${y}`);
    assert.ok(Math.abs(lengthOf(rounds[0]) - 2 * (a + b - 2 * brush)) < .2 * 2 * (a + b), 'one stroke round the whole wash');
    // every stroke is long enough to be a stroke
    for (const s of strokes) assert.ok(lengthOf(s) >= 2 * s.radiusMm - .6, `${s.kind} of ${lengthOf(s)} mm`);
  }
});

test('a wash is laid past its outline to meet its neighbours, but not onto a reserved light', () => {
  const wash = box(40, 30), light = [{ points: [[50, 0], [70, 0], [70, 50], [50, 50]], soft: [] }];   // paper kept along the wash's right side
  // how far right a stroke's footprint goes: a lane ends square where the brush stops, a round reaches its radius further
  const reach = r => Math.max(...r.strokes.flatMap(s => s.points.map(p => p[0] + (s.kind === 'lane' ? 0 : s.radiusMm))));
  const open = planWashStrokes(wash, { kitMm: KIT, growMm: 2.25 }), kept = planWashStrokes(wash, { kitMm: KIT, growMm: 2.25, keepOut: light });
  assert.ok(reach(open) > 51.5, `the wash reaches ${reach(open)} mm`);
  assert.ok(reach(kept) < 50.8, `beside the light it stops at ${reach(kept)} mm`);
  assert.ok(Math.min(...kept.strokes.flatMap(s => s.points.map(p => p[0] - (s.kind === 'lane' ? 0 : s.radiusMm)))) < 8.5, 'and still grows on its other sides');
});

test('strokes follow a slanted edge as a line, not as steps, and a thin tail takes the detail brush or a closing stroke', () => {
  const tri = planWashStrokes([{ points: [[10, 10], [70, 10], [10, 50]], soft: [] }], { kitMm: KIT, pointMm: 1.2 });
  assert.ok(tri.uncovered < .03, `${tri.uncovered} of a triangle left bare`);
  // along the slanted side the first round stays one radius from it, within the planning grid's pitch
  const first = tri.strokes.find(s => s.kind !== 'lane'), r = first.radiusMm, off = first.points.map(([x, y]) => (40 * (70 - x) - 60 * (y - 10)) / Math.hypot(40, 60)).filter((d, q) => { const [x, y] = first.points[q]; return x - 10 > 3 * r && y - 10 > 3 * r; });
  assert.ok(off.length >= 5); for (const d of off) assert.ok(Math.abs(d - r) < 1, `${d} mm from the slanted side`);
  const loops = [{ points: [[10, 10], [40, 10], [40, 30], [26, 30], [26, 32], [60, 32], [60, 34], [10, 34]], soft: [] }];   // a block with a 2 mm tail
  const without = planWashStrokes(loops, { kitMm: KIT }), withPoint = planWashStrokes(loops, { kitMm: KIT, pointMm: 1.2 });
  assert.ok(without.uncovered < .03 && withPoint.uncovered < .03, `${without.uncovered} and ${withPoint.uncovered}`);
  assert.ok(without.strokes.some(s => s.kind === 'close'), 'with no detail brush the tail is closed by one stroke of the smallest wash brush');
  assert.ok(withPoint.strokes.some(s => s.kind === 'point' && s.radiusMm === .6));
  assert.ok(!without.strokes.some(s => s.kind === 'point'));
});

test('an outline is a smooth curve that keeps only long sharp corners', () => {
  // an octagon-like blob cut on a grid: every corner is rounded; a rectangle keeps its four
  // a disc 36 mm across cut on a 1 mm grid, simplified past the grid's own steps (1.25 cells)
  const w = 60, h = 60, ids = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 30, y - 30) < 18) ids[y * w + x] = 1;
  const disc = outlineLoops(ids, 1, BOX(w, h), w, h, { cellMm: 1, tolMm: 1.25 })[0].points, n = disc.length;
  const turns = disc.map((p, q) => { const a = disc[(q + n - 1) % n], b = disc[(q + 1) % n], u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]]; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI; });
  assert.ok(Math.max(...turns) < 50, `sharpest turn on a disc ${Math.max(...turns)} degrees over ${n} points`);
  for (const p of disc) assert.ok(Math.abs(Math.hypot(p[0] - 30.5, p[1] - 30.5) - 18) < 2);
});

test('a wash laid past its outline meets its neighbour, and no wash is left with an open middle', () => {
  const loops = [{ points: [[10, 10], [22, 10], [22, 20], [10, 20]], soft: [] }], plain = planWashStrokes(loops, { kitMm: KIT }), grown = planWashStrokes(loops, { kitMm: KIT, growMm: 2 });
  assert.ok(Math.abs(plain.areaMm2 - 120) < 6 && grown.areaMm2 > 200 && grown.areaMm2 < 16 * 14 + 6, `${plain.areaMm2} then ${grown.areaMm2} mm2`);
  assert.ok(Math.min(...grown.strokes.flatMap(s => s.points.map(p => p[0] - s.radiusMm))) < 9, 'its strokes reach past the outline');
  for (const size of [4, 5, 6, 7, 9, 11, 14]) { const s = planWashStrokes([{ points: [[10, 10], [10 + size, 10], [10 + size, 10 + size], [10, 10 + size]], soft: [] }], { kitMm: KIT, pointMm: 1.2 }); assert.ok(s.uncovered < .08, `${s.uncovered} of a ${size} mm square left bare`); }
});
