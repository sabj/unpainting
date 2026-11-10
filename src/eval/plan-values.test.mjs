import test from 'node:test';
import assert from 'node:assert/strict';
import { planLedger, valueStats, lightness } from './plan-values.mjs';

test('plan ledger: every passage books its mix flat over its mask, and overlapping passages add', () => {
  const plan = { layers: [
    { shapes: [{ mask: Uint8Array.of(1, 1, 0, 0), mix: [0.2, 0] }] },
    { shapes: [{ mask: Uint8Array.of(0, 1, 1, 0), mix: [0.1, 0.3] }] },
  ] };
  const E = planLedger(plan, 4, 2);
  assert.deepEqual(Array.from(E, v => +v.toFixed(3)), [0.2, 0, 0.3, 0.3, 0.1, 0.3, 0, 0]);
});

test('plan ledger: a passage without a mask or a mix is an error, not skipped', () => {
  assert.throws(() => planLedger({ layers: [{ shapes: [{ mask: null, mix: [1] }] }] }, 1, 1), /no mask or mix/);
});

test('lightness: white is 100, black 0, sRGB mid grey about 53.6', () => {
  assert.ok(Math.abs(lightness(255, 255, 255) - 100) < 1e-6);
  assert.equal(lightness(0, 0, 0), 0);
  assert.ok(Math.abs(lightness(128, 128, 128) - 53.585) < 0.01);
});

test('value stats: dark share counts pixels under L* 35 and paper share those near the lightest tenth', () => {
  // 10 pixels: 2 near black, 3 mid, 5 paper white
  const px = [[20, 20, 20], [40, 40, 40], [128, 128, 128], [130, 130, 130], [140, 140, 140], ...Array(5).fill([250, 250, 250])];
  const s = valueStats(Uint8Array.from(px.flat()), 10);
  assert.equal(s.darkShare, 0.2);
  assert.equal(s.paperShare, 0.5);
  assert.ok(s.meanL > 60 && s.meanL < 75);
  assert.throws(() => valueStats(new Uint8Array(3), 2), /short/);
});
