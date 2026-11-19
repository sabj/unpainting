// A short dropped line that joins two kept lines is structure the local evidence glitched on: it is restored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreBridges } from './line-bridge.mjs';

const PX = 0.15;
const L = (why, ...pts) => ({ points: pts.map(([x, y]) => ({ x, y })), dropWhy: why });
const K = (...pts) => ({ points: pts.map(([x, y]) => ({ x, y })) });
const row = y => K(...Array.from({ length: 201 }, (_, x) => [x, y]));
const arcA = row(0), arcB = row(40);          // two kept lines 6 mm apart

test('a short dropped line with both ends on kept lines is restored, whatever local cut dropped it', () => {
  const joint = L('mass', [100, 0], [101, 20], [100, 40]);
  for (const why of ['mass', 'faint', 'contrast', 'whole', 'short', 'turny']) {
    const r = restoreBridges([{ ...joint, dropWhy: why }], [arcA, arcB], { pxMm: PX });
    assert.equal(r.lines.length, 1, why);
  }
});

test('a line with one free end, a wash-only ground, or too long is not restored', () => {
  assert.equal(restoreBridges([L('mass', [100, 0], [100, 20])], [arcA, arcB], { pxMm: PX }).lines.length, 0, 'one free end');
  assert.equal(restoreBridges([L('label', [100, 0], [100, 40])], [arcA, arcB], { pxMm: PX }).lines.length, 0, 'foliage, sky or water ground');
  assert.equal(restoreBridges([L('mass', [100, 0], [100, 40 + 100])], [arcA, row(140)], { pxMm: PX, maxMm: 12 }).lines.length, 0, 'too long to be a joint');
});

test('restored lines can carry a chain: a dropped piece joins a restored piece to a kept line', () => {
  const p1 = L('mass', [50, 0], [50, 15]), p2 = L('mass', [50, 15], [50, 40]);
  const r = restoreBridges([p1, p2], [arcA, arcB], { pxMm: PX });
  assert.equal(r.lines.length, 2);
  assert.equal(r.stats.restored, 2);
});

test('the kept lines are not changed and the restored lines are marked', () => {
  const r = restoreBridges([L('mass', [100, 0], [100, 40])], [arcA, arcB], { pxMm: PX });
  assert.equal(r.lines[0].restored, true);
  assert.equal(arcA.points.length, 201);
});
