import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeGroup, chargeOrder, sameCharge } from './charge-layers.mjs';

const L = (step, region, rank = 0, phase = 'mid', pig = 0) => ({ _valuePhase: phase, _order: { region }, _subject: { rank }, pigment: pig, shapes: [{ _valuePlan: { id: `${phase}/${step}/p${pig}/r${region}/s1` } }], name: `${step}-r${region}-p${pig}` });

test('the darker middle layers of a region follow its first layer, lighter first', () => {
  const layers = [L('b2L0', 1), L('b2L0', 2), L('b1', 1, 0, 'light'), L('b2L1', 1), L('b2L1', 2), L('b2L2', 1), L('b4', 1, 0, 'shadow')];
  assert.deepEqual(chargeOrder(layers).map(l => l.name), ['b2L0-r1-p0', 'b2L1-r1-p0', 'b2L2-r1-p0', 'b2L0-r2-p0', 'b2L1-r2-p0', 'b1-r1-p0', 'b4-r1-p0']);
});

test('light washes, shadow glazes and other subjects never join a middle-layer session', () => {
  assert.equal(chargeGroup(L('b1', 1, 0, 'light')), null);
  assert.equal(chargeGroup(L('b4', 1, 0, 'shadow')), null);
  assert.equal(sameCharge(L('b2L0', 1, 0), L('b2L1', 1, 1)), false);
  assert.equal(sameCharge(L('b2L0', 1, 0), L('b2L1', 1, 0)), true);
});
