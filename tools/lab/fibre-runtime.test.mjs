import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuntimePair, runtimeSummary } from './fibre-runtime.mjs';

function card(after = false) {
  return {
    commit: (after ? 'a' : 'b').repeat(40), backend: 'gpu', fallback: false,
    adapter: { adapterInfo: { vendor: 'apple', device: 'test-device' }, dawnFlags: [] },
    kind: 'bloom', seed: 1, mmPerCell: 0.25, sizeMm: 50, w: 200, h: 200, sourceWidth: 200, paintedWidth: 200, sourcescale: 1,
    pigments: [{ K: [1, 1, 1] }], O: { pinning: 1.5, dt: 0.1 }, dryOptions: { levelMax: 200 },
    paintSeconds: after ? 100.5 : 100, checks: { strict: true, total: 0 },
    drys: [{ steps: 300, seconds: 90, pigmentErrors: [1e-8] }], frames: ['painting.png'],
  };
}
const pair = ratio => ({ before: card(), after: { ...card(true), paintSeconds: 100 * ratio } });

test('runtime gate includes full painting time, discards warmup and reports every paired ratio', () => {
  const result = runtimeSummary(pair(9), [1, 1.005, 1.009, 1.02, 0.999].map(pair));
  assert.equal(result.pass, true); assert.equal(result.samples, 5);
  assert.equal(result.medianRatio, 1.005); assert.equal(result.maxRatio, 1.02);
  assert.equal(runtimeSummary(pair(1), [1.011, 1.012, 1.013, 1.014, 1.015].map(pair)).pass, false);
  assert.throws(() => runtimeSummary(null, Array.from({ length: 5 }, () => pair(1))), /warmup/);
  assert.throws(() => runtimeSummary(pair(1), [pair(1)]), /five/);
});

test('runtime gate rejects fallback, unknown hardware, altered physics and incomplete proof', () => {
  const bad = [
    { backend: 'cpu' }, { fallback: true }, { fallback: undefined }, { adapter: null }, { adapter: { adapterInfo: {} } }, { adapter: { adapterInfo: { description: 'SwiftShader' } } },
    { commit: null }, { commit: card().commit }, { paintSeconds: NaN }, { paintSeconds: 0 },
    { paintedWidth: 400 }, { sourcescale: 2 }, { mmPerCell: 0.5 }, { seed: 2 }, { sizeMm: 40 },
    { O: { pinning: 0, dt: 0.1 } }, { pigments: [] }, { dryOptions: null },
    { checks: { strict: true, total: 1 } }, { checks: { strict: false, total: 0 } },
    { drys: [] }, { frames: [] }, { kind: 'landscape' }, { playback: { stages: [10, 25, 50, 75, 100] } },
    { drys: [{ steps: 200000, seconds: 1, pigmentErrors: [0] }] },
    { drys: [{ steps: 2, seconds: 1, pigmentErrors: [NaN] }] },
    { drys: [{ steps: 2, seconds: 1, pigmentErrors: [0.1] }] },
  ];
  for (const change of bad) assert.throws(() => checkRuntimePair(card(), { ...card(true), ...change }), JSON.stringify(change));
  assert.throws(() => checkRuntimePair(card(), { ...card(true), adapter: { adapterInfo: { device: 'another GPU' } } }), /changes adapter/);
});

test('runtime samples cannot silently switch revisions or paper seed after warmup', () => {
  const pairs = Array.from({ length: 5 }, () => pair(1));
  pairs[3].after.commit = 'c'.repeat(40);
  assert.throws(() => runtimeSummary(pair(1), pairs), /mix revisions/);
  pairs[3] = pair(1); pairs[3].before.seed = 2; pairs[3].after.seed = 2;
  assert.throws(() => runtimeSummary(pair(1), pairs), /samples change seed/);
});
