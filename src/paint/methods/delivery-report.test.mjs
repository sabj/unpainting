import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryByBand, deliveryNote } from './delivery-report.mjs';

test('delivery by band splits a shortfall in the heavily booked cells from the light ones', () => {
  const w = 10, n = 100, P = 1, expected = new Float32Array(n), held = [new Float32Array(n)];
  for (let i = 0; i < n; i++) { expected[i] = i < 90 ? 0.1 : 1; held[0][i] = i < 90 ? 0.1 : 0.6; }
  const { bands } = deliveryByBand({ expected, held, n, P, w });
  assert.equal(bands.length, 4);
  assert.equal(bands[0].ratio, 1);
  assert.equal(bands.at(-1).ratio, 0.6);
  assert.equal(bands.reduce((a, b) => a + b.cells, 0), n);
  assert.match(deliveryNote({ bands }), /95-100% 0.6/);
});

test('the fine grid is averaged back to cells', () => {
  const w = 2, n = 4, SC = 2, W2 = 4, expected = Float32Array.from([1, 1, 1, 1]), held = [new Float32Array(16).fill(0.5)];
  const { bands } = deliveryByBand({ expected, held, n, P: 1, SC, w, W2, shares: [1] });
  assert.equal(bands[0].ratio, 0.5);
});
