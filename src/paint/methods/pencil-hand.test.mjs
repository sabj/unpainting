import test from 'node:test';
import assert from 'node:assert/strict';
import { layByHand, placementMm, FINISH } from './pencil-hand.mjs';

const circle = (cx, cy, r, n = 120) => Array.from({ length: n + 1 }, (_, k) => [cx + r * Math.cos(2 * Math.PI * k / n), cy + r * Math.sin(2 * Math.PI * k / n)]);
const lines = [
  { points: circle(200, 200, 150), weight: 0.9, seq: 0, object: 0, part: 'outline' },
  { points: [[120, 200], [280, 200]], weight: 0.4, seq: 1, object: 0, part: 'inner' },
  { points: circle(200, 170, 30, 40), weight: 0.6, seq: 2, object: 1, part: 'outline' },
];

test('tight lays the lines as given, in order', () => {
  const r = layByHand(lines, { finish: 'tight', pxMm: 0.25 });
  assert.equal(r.lines.length, 3);
  assert.deepEqual(r.lines.map(g => g.seq), [0, 1, 2]);
  assert.ok(placementMm(r.lines, lines, 0.25).meanMm < 0.01);
});

test('loose: construction first and light, contours in overlapping pulls, near the given lines, the same each time', () => {
  const r = layByHand(lines, { finish: 'loose', pxMm: 0.25, seed: 3 });
  assert.equal(r.lines[0].hand, 'construction');
  assert.ok(r.lines[0].weight < 0.3);
  assert.ok(r.stats.pulls >= FINISH.loose.pulls, 'the long outline is found in pulls');
  assert.ok(r.lines.length > lines.length);
  assert.deepEqual(r.lines.map(g => g.seq), r.lines.map((_, k) => k));
  assert.ok(placementMm(r.lines, lines, 0.25).meanMm < 1, 'within a millimetre on average');
  assert.deepEqual(layByHand(lines, { finish: 'loose', pxMm: 0.25, seed: 3 }).lines, r.lines);
  assert.throws(() => layByHand(lines, { finish: 'sloppy', pxMm: 0.25 }));
});
