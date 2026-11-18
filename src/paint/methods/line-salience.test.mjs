import test from 'node:test';
import assert from 'node:assert/strict';
import { salience } from './line-salience.mjs';

const PX = 0.15, line = (pts, extra = {}) => ({ points: pts.map(([x, y]) => ({ x, y })), ...extra });

test('a connected frame stays and is drawn first; an isolated short piece is left to the wash', () => {
  const frame = [line([[0, 0], [100, 0]]), line([[100, 0], [100, 100]]), line([[100, 100], [0, 100]]), line([[0, 100], [0, 0]])];
  const speck = line([[300, 300], [310, 300]]);
  const r = salience([...frame, speck], { pxMm: PX });
  assert.equal(r.lines.length, 4);
  assert.ok(r.lines.every(g => g.tier === 1));
  assert.equal(r.stats.closedSets, 1);
  assert.equal(r.stats.linesDropped, 1);
});

test('a feature in a face stays, and a piece shorter than its ground allows goes unless it belongs to a long set', () => {
  const speck = line([[300, 300], [310, 300]]), face = salience([speck], { pxMm: PX, isFeature: () => true });
  assert.equal(face.lines.length, 1);
  const short = line([[0, 0], [60, 0]], { inkMinMm: 20 }), long = [line([[0, 0], [300, 0]], { inkMinMm: 2 }), line([[300, 1], [600, 1]], { inkMinMm: 20 })];
  assert.equal(salience([short], { pxMm: PX }).lines.length, 0);
  assert.equal(salience(long, { pxMm: PX }).lines.length, 2);
});

test('a short stub on a long line is left to the wash; a closed set and a face feature keep their short pieces', () => {
  const long = line([[0, 0], [300, 0]]), stub = line([[300, 0], [310, 15]]);
  assert.equal(salience([long, stub], { pxMm: PX }).lines.length, 1, 'a piece under 3 mm is a tick, not a stroke');
  const tri = [line([[0, 0], [16, 0]]), line([[16, 0], [8, 13]]), line([[8, 13], [0, 0]])];
  assert.equal(salience(tri, { pxMm: PX }).lines.length, 3);
  assert.equal(salience([line([[0, 0], [10, 0]])], { pxMm: PX, isFeature: () => true }).lines.length, 1);
});

test('pieces of one contour 2 mm apart are one set: a broken arch is not a row of ticks', () => {
  const a = line([[0, 0], [30, 0]]), b = line([[43, 0], [73, 0]]);          // 4.5 mm pieces, 2 mm gap at 0.15 mm a pixel
  assert.equal(salience([a, b], { pxMm: PX }).lines.length, 2);
  const far = line([[0, 0], [30, 0]]), far2 = line([[80, 0], [110, 0]]);   // 7.5 mm apart: still separate, still ticks
  assert.equal(salience([far, far2], { pxMm: PX }).lines.length, 0);
});
