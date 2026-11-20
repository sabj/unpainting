import test from 'node:test';
import assert from 'node:assert/strict';
import { waitBesideDamp, BESIDE_DAMP } from './beside-damp.mjs';

test('beside damp: waits while the neighbour is glossy, then lays; never asks its own dry cells to be a wet bed', () => {
  let water = 0.6; const steps = [];
  const r = waitBesideDamp({ observe: () => ({ waterP50: water, moistShare: 0 }), step: o => { steps.push(o); water *= 0.97; }, O: { dt: 1 } });
  assert.ok(r.paper.waterP50 <= BESIDE_DAMP.glossy && r.waits > 0 && steps.length === r.waits);
});

test('beside damp: a neighbour already past its shine, or dry paper, is laid against at once', () => {
  const r = waitBesideDamp({ observe: () => ({ waterP50: 0, moistShare: 0 }), step: () => { throw new Error('no step'); }, O: {} });
  assert.equal(r.waits, 0);
  assert.throws(() => waitBesideDamp({ observe: () => ({ moistShare: 0 }), step: () => {}, O: {} }), /waterP50/);
});
