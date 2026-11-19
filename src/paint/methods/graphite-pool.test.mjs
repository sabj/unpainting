// The graphite drawing carries the structure of the subject: the line model's pool, pruned by meaning, drawn whole and light.
import test from 'node:test';
import assert from 'node:assert/strict';
import { graphitePoolWanted, mergeAuthored, edgeStep, graphiteDrawingArgs } from './graphite-pool.mjs';
import { STAGE_DEFAULTS } from './drawing-stages.mjs';

test('a graphite drawing from the pool is wanted unless a line source, stages, no drawing or the models are asked off', () => {
  assert.equal(graphitePoolWanted(['--image', 'x.png']).wanted, true);
  assert.equal(graphitePoolWanted(['--outlinemedium', 'graphite', '--drawing', 'first', '--drawingstages', 'off']).wanted, true);
  assert.equal(graphitePoolWanted(['--outlinemedium', 'graphite-HB']).wanted, true);
  for (const argv of [['--outlinemedium', 'ink'], ['--outlinemedium', 'auto'], ['--outlinemedium', 'none'], ['--drawing', 'none'], ['--draw', '0'],
    ['--linesource', 'photo-sketch'], ['--linesource', 'source-ink'], ['--stages', 'prep'], ['--linemodel', '0'], ['--linemodel', 'off'], ['--segments', 'off'],
    ['--areaplan', 'plan.json'], ['--resumestate', 'x']]) {
    const r = graphitePoolWanted(argv);
    assert.equal(r.wanted, false, JSON.stringify(argv));
    assert.ok(r.why, 'says why');
  }
});

const L = (...pts) => ({ points: pts });
test('authored lines are kept as they are; a pool line the plan already drew is dropped, a new one is added', () => {
  const authored = { image: { w: 100, h: 100 }, lines: [L([10, 10], [60, 10])] };
  // the pool is on a grid 10 times as fine: its first line sits on the authored one (y 10 -> 100), its second is elsewhere
  const pool = { image: { w: 1000, h: 1000 }, lines: [L([100, 101], [600, 101]), L([100, 800], [600, 800])] };
  const r = mergeAuthored(pool, authored, { sheetMm: 100 });
  assert.equal(r.image.w, 1000);
  assert.equal(r.lines.length, 2);
  assert.equal(r.stats.poolKept, 1);
  assert.equal(r.stats.poolDropped, 1);
  assert.equal(r.stats.authored, 1);
  const ys = r.lines.map(g => Math.round(g.points[0][1])).sort((a, b) => a - b);
  assert.deepEqual(ys, [100, 800], 'the authored line is on the pool grid; the new pool line is added');
});

test('with no authored file the pool is the drawing', () => {
  const pool = { image: { w: 1000, h: 1000 }, lines: [L([100, 100], [600, 100])] };
  const r = mergeAuthored(pool, null, { sheetMm: 100 });
  assert.equal(r.lines.length, 1);
  assert.equal(r.stats.authored, 0);
});

test('the graphite drawing is the longest pool lines up to the prep amount of the length, whole; authored lines are never cut', () => {
  assert.equal(STAGE_DEFAULTS.prep.amount, 0.5);
  const mk = n => L([0, 0], [n, 0]);
  const pool = { image: { w: 1000, h: 1000 }, lines: [mk(10), mk(100), mk(5), mk(50), mk(30)].map((g, i) => ({ ...g, points: g.points.map(([x, y]) => [x, y + 100 * i]) })) };
  const authored = { image: { w: 1000, h: 1000 }, lines: [L([0, 900], [20, 900])] };
  const r = mergeAuthored(pool, authored, { sheetMm: 1000, amount: 0.5 });
  const lens = r.lines.map(g => Math.round(g.points.at(-1)[0] - g.points[0][0])).sort((a, b) => b - a);
  assert.deepEqual(lens, [100, 20], 'the 100 line is half of the 195 of pool length; the authored line stays');
  assert.equal(r.stats.poolKept, 1);
  assert.equal(mergeAuthored(pool, null, { sheetMm: 1000, amount: 1 }).lines.length, 5);
  assert.equal(mergeAuthored(pool, null, { sheetMm: 1000, amount: 0.9 }).lines.length, 3, '100 + 50 + 30 reach 90% of 195');
});

test('edge step: the tone difference across a line, so a window edge outranks a mortar joint', () => {
  const w = 100, h = 100, L = new Float32Array(w * h).fill(90);
  for (let y = 0; y < h; y++) for (let x = 50; x < w; x++) L[y * w + x] = 40;      // a strong edge at x 50
  for (let y = 0; y < h; y++) for (let x = 20; x < 30; x++) L[y * w + x] = 86;      // a faint step at x 20
  const vertical = x => ({ points: Array.from({ length: 30 }, (_, k) => [x, 10 + k * 2]) });
  assert.ok(edgeStep(vertical(50), L, w, h, 0.5) > 40);
  assert.ok(edgeStep(vertical(20), L, w, h, 0.5) < 6);
  assert.equal(edgeStep(vertical(75), L, w, h, 0.5), 0, 'a line inside a flat mass has no step');
});

test('with an edge score the budget keeps the strongest edges, not the longest lines', () => {
  const mk = (n, y) => L([0, y], [n, y]);
  const pool = { image: { w: 1000, h: 1000 }, lines: [mk(100, 0), mk(60, 100), mk(40, 200)] };
  const score = g => (g.points[0][1] === 100 ? 10 : 1) * (g.points.at(-1)[0] - g.points[0][0]);   // the middle line is on a strong edge
  const r = mergeAuthored(pool, null, { sheetMm: 1000, amount: 0.3, score });
  assert.deepEqual(r.lines.map(g => g.points[0][1]), [100]);
});

test('the drawing flags: the pool file, no stage planner, light pressure, and no planned-passage filter unless the run says otherwise', () => {
  assert.deepEqual(graphiteDrawingArgs(['--image', 'x.png'], 'out/graphite-lines'), ['--drawingfile', 'out/graphite-lines', '--drawingstages', 'off', '--openingpressure', '0.35', '--lineedges', '0']);
  assert.deepEqual(graphiteDrawingArgs(['--openingpressure', '0.6', '--lineedges', '1'], 'g'), ['--drawingfile', 'g', '--drawingstages', 'off']);
});
