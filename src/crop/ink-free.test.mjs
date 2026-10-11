// Known-answer tests for removing planned ink from the wash's target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { removePlannedInk, contactMm, lineCover } from './ink-free.mjs';

const W = 60, H = 40;
const sheet = v => Uint8Array.from({ length: W * H * 3 }, () => v);
const doc = pts => ({ image: { w: W, h: H }, lines: [{ points: pts, widths: pts.map(() => 2.2) }] });

test('contact width follows the pen calibration and the material clamp', () => {
  assert.ok(Math.abs(contactMm(2.2) - 0.34) < 1e-9);
  assert.equal(contactMm(0.2), 0.1);
  assert.equal(contactMm(9), 0.4);
});

test('a planned line over ink on a wash is filled with the wash; elsewhere nothing changes', () => {
  const rgb = sheet(150);
  for (let x = 5; x < 55; x++) for (let c = 0; c < 3; c++) rgb[(20 * W + x) * 3 + c] = 10;
  const r = removePlannedInk(rgb, W, H, doc([[5, 20.5], [55, 20.5]]), { sheetMm: 15 });
  assert.equal(r.rgb[(20 * W + 30) * 3], 150);
  assert.equal(r.rgb[(5 * W + 30) * 3], 150);
  assert.equal(rgb[(20 * W + 30) * 3], 10, 'input is not mutated');
});

test('a planned line over paper never darkens the target', () => {
  const rgb = sheet(240);
  for (let y = 0; y < 15; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) rgb[(y * W + x) * 3 + c] = 60;
  const r = removePlannedInk(rgb, W, H, doc([[5, 16], [55, 16]]), { sheetMm: 15 });
  for (let x = 0; x < W; x++) assert.ok(r.rgb[(17 * W + x) * 3] >= 240);
  assert.ok(lineCover(doc([[5, 16], [55, 16]]), W, H, { sheetMm: 15 })[16 * W + 30]);
});
