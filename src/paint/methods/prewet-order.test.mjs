import test from 'node:test';
import assert from 'node:assert/strict';
import { wetsLaneByLane } from './prewet-order.mjs';
import { scrapDelivery, swatchMask } from './scrap-swatch.mjs';

test('a wet-on-wet passage wetted along its own lanes is wetted lane by lane', () => {
  assert.equal(wetsLaneByLane({ intoWet: true, wetsOwnLanes: true, preparesOwnBed: false }), true);
});

test('a passage wetted over another shape, or preparing its own bed, or not laid into wet, is wetted whole first', () => {
  assert.equal(wetsLaneByLane({ intoWet: true, wetsOwnLanes: false, preparesOwnBed: false }), false);
  assert.equal(wetsLaneByLane({ intoWet: true, wetsOwnLanes: true, preparesOwnBed: true }), false);
  assert.equal(wetsLaneByLane({ intoWet: false, wetsOwnLanes: true, preparesOwnBed: false }), false);
});

test('a missing answer is refused, not guessed', () => {
  assert.throws(() => wetsLaneByLane({ intoWet: true, wetsOwnLanes: undefined, preparesOwnBed: false }), /wetsOwnLanes/);
});

test('the scrap swatch wets each lane just before the loaded brush follows it (the order the sheet copies)', () => {
  const calls = [], tag = new WeakMap();
  const paths = [[{ x: 20, y: 30, r: 5 }, { x: 70, y: 30, r: 5 }], [{ x: 20, y: 50, r: 5 }, { x: 70, y: 50, r: 5 }]];
  const brush = kind => { const b = {}; tag.set(b, kind); return b; };
  scrapDelivery({ name: 'wet on wet', water: 0.88, passes: 1, intoWet: true }, {
    mask: swatchMask(), paths, pigment: { name: 'test' }, physics: {}, paperOptions: { seed: 5 }, charge: 1, upright: false,
    water: T => T.water, paintBrush: () => brush('paint'), waterBrush: () => brush('water'),
    dip: () => {}, stroke: (b, _s, pts) => calls.push(`${tag.get(b)} ${pts[0].y}`), step: () => {}, dry: () => {},
  });
  assert.deepEqual(calls, ['water 30', 'paint 30', 'water 50', 'paint 50']);
});
