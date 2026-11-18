// The graphite drawing carries the structure of the subject: the line model's pool, pruned by meaning, drawn whole and light.
import test from 'node:test';
import assert from 'node:assert/strict';
import { graphitePoolWanted, mergeAuthored } from './graphite-pool.mjs';

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
