import test from 'node:test';
import assert from 'node:assert/strict';
import { mixedCharge, washDomains, leadPigment } from './mixed-washes.mjs';

test('a mixed charge keeps the passage amount and each pigment share', () => {
  const fields = [Float32Array.from([1, 1]), Float32Array.from([3, 1])];
  const mix = mixedCharge([0, 1], fields, 3);
  assert.ok(Math.abs(mix[0] - 1) < 1e-6);
  assert.ok(Math.abs(mix[1] - 2) < 1e-6);
});

test('a charge set below the mean (a quantile) keeps the shares and sums to that amount', () => {
  const mix = mixedCharge([0, 1], [Float32Array.from([1, 1]), Float32Array.from([3, 1])], 1.5);
  assert.ok(Math.abs(mix[0] + mix[1] - 1.5) < 1e-6);
  assert.ok(Math.abs(mix[1] / mix[0] - 2) < 1e-6);
});

test('a trace pigment is left out of the mix and its mass goes to the rest', () => {
  const mix = mixedCharge([0], [Float32Array.from([0.99]), Float32Array.from([0.01])], 1, { minShare: 0.03 });
  assert.equal(mix[1], 0);
  assert.ok(Math.abs(mix[0] - 1) < 1e-6);
});

test('a passage with no demand has no charge', () => {
  assert.deepEqual([...mixedCharge([0], [Float32Array.from([0]), Float32Array.from([0])], 0)], [0, 0]);
});

test('the lead pigment is the largest share', () => {
  assert.equal(leadPigment([0.1, 0.7, 0.2]), 1);
});

test('neighbouring regions of one colour share a domain; a different colour or a far region does not', () => {
  // 6x1 strip: regions 1 and 2 touch and match; region 3 touches 2 and differs; region 4 matches 1 but is cut off by 3
  const w = 6, h = 1, labels = Int32Array.from([1, 1, 2, 3, 4, 4]), k = 2;
  const demand = Float32Array.from([1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0]);
  const d = washDomains(labels, 4, demand, k, w, h);
  assert.equal(d.labels[0], d.labels[2]);
  assert.notEqual(d.labels[2], d.labels[3]);
  assert.notEqual(d.labels[0], d.labels[4]);
  assert.equal(d.ids.length, 3);
});

test('regions that may not join stay apart even when their colours match', () => {
  const labels = Int32Array.from([1, 2]), demand = Float32Array.from([1, 0, 1, 0]);
  const d = washDomains(labels, 2, demand, 2, 2, 1, { mayJoin: () => false });
  assert.notEqual(d.labels[0], d.labels[1]);
});
