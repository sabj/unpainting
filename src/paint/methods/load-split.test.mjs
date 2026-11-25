import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLoads, paintsHere } from './brushes.mjs';

// a lane 100 cells long whose middle 40 cells (x 30..69) lie over a reserve the brush may not paint
const lane = Array.from({ length: 101 }, (_, x) => ({ x, y: 5 }));
const overPaper = p => p.x < 30 || p.x >= 70;
const painted = load => load.slice(1).filter(overPaper).length;

test('a load is spent only on paper it paints, so no load is dipped for a stretch that paints nothing', () => {
  const loads = splitLoads(lane, 20, overPaper);
  for (const [k, load] of loads.entries()) assert.ok(painted(load) > 0, `load ${k} (x ${load[0].x}..${load.at(-1).x}) paints nothing`);
  // every load but the last paints its full length
  for (const load of loads.slice(0, -1)) assert.ok(painted(load) >= 20, `a load cut after ${painted(load)} painted cells`);
  // the loads still run the whole lane, each from where the last ended
  assert.equal(loads[0][0].x, 0); assert.equal(loads.at(-1).at(-1).x, 100);
  for (let k = 1; k < loads.length; k++) assert.equal(loads[k][0], loads[k - 1].at(-1));
});

test('a last stretch that paints nothing stays with the load before it', () => {
  const tail = p => p.x < 50;
  const loads = splitLoads(lane, 25, tail);
  assert.deepEqual(loads.map(l => [l[0].x, l.at(-1).x]), [[0, 25], [25, 100]]);
});

test('without a paper rule the split is the plain length cut', () => {
  assert.deepEqual(splitLoads(lane, 30).map(l => [l[0].x, l.at(-1).x]), [[0, 30], [30, 60], [60, 90], [90, 100]]);
});

test('the brush paints inside the clip, off any resist, and nowhere off the sheet', () => {
  const sheet = { w: 4, h: 2, clip: Uint8Array.from([1, 1, 1, 0, 1, 1, 1, 1]), resist: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0]) };
  const at = paintsHere(sheet);
  assert.deepEqual([[0, 0], [1, 0], [3, 0], [3, 1], [-1, 0], [4, 1], [0, 2]].map(([x, y]) => at({ x, y })), [true, false, false, true, false, false, false]);
  assert.equal(paintsHere({ w: 2, h: 1 })({ x: 1.4, y: 0.2 }), true);
});

