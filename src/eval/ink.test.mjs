// Known-answer tests for inkAgreement on hand-drawn buffers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inkAgreement } from './ink.mjs';

const W = 96, H = 96, N = W * H, PAPER = [250, 248, 242];
const blank = () => { const b = Buffer.alloc(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = PAPER[c]; return b; };
const put = (b, x, y, rgb) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) b[i + c] = rgb[c]; };
const vline = (b, x, y0, y1, rgb, wide = 1) => { for (let y = y0; y < y1; y++) for (let d = 0; d < wide; d++) put(b, x + d, y, rgb); };
const rect = (b, x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(b, x, y, rgb); };
const has = (flags, word) => flags.some(f => f.includes(word));

const INK = [40, 34, 28];        // dark neutral
const PALE = [225, 216, 196];    // a light wash
const DARK_WASH = [190, 176, 150]; // a second, darker wash, for a boundary with no line drawn at it

test('a line drawn the same in source and painted is recalled and precise, with no flags', () => {
  const src = blank(); rect(src, 10, 10, 86, 86, PALE); vline(src, 48, 20, 76, INK, 2);
  const painted = blank(); rect(painted, 10, 10, 86, 86, PALE); vline(painted, 48, 20, 76, INK, 2);
  const r = inkAgreement(src, painted, W, H, PAPER);
  assert.ok(r.recall > 0.9, `recall ${r.recall.toFixed(2)} should be near 1 for an identical line`);
  assert.ok(r.precision > 0.9, `precision ${r.precision.toFixed(2)} should be near 1 for an identical line`);
  assert.equal(r.flags.length, 0, `a faithful line should raise nothing: ${JSON.stringify(r.flags)}`);
});

test('a broad soft brush stroke standing in for the line reads as no drawing', () => {
  const src = blank(); rect(src, 10, 10, 86, 86, PALE); vline(src, 48, 20, 76, INK, 2);
  // 16 cells wide: brush width, not a nib
  const painted = blank(); rect(painted, 10, 10, 86, 86, PALE); vline(painted, 40, 20, 76, INK, 16);
  const r = inkAgreement(src, painted, W, H, PAPER);
  assert.ok(r.recall < 0.3, `recall ${r.recall.toFixed(2)} should be low: the source's line was never drawn, only toned over`);
  assert.ok(has(r.flags, 'no drawing where the source has it'), `flags: ${JSON.stringify(r.flags)}`);
});

test('a wash boundary with no line in either picture is not read as ink, so no drawing flag fires', () => {
  // a step between two flat washes, the case the plain density measures cannot tell from a line
  const wash = blank();
  rect(wash, 10, 10, 48, 86, PALE);
  rect(wash, 48, 10, 86, 86, DARK_WASH);
  const r = inkAgreement(wash, wash, W, H, PAPER);
  assert.ok(r.srcInkShare < 0.02, `a wash edge should not read as ink: ${(100 * r.srcInkShare).toFixed(1)}%`);
  assert.ok(r.paintedInkShare < 0.02, `a wash edge should not read as ink: ${(100 * r.paintedInkShare).toFixed(1)}%`);
  assert.ok(!has(r.flags, 'no drawing where the source has it'), `a hard edge is not missing drawing: ${JSON.stringify(r.flags)}`);
});

test('a line the painted sheet adds and the source never had is caught as drawing it should not have', () => {
  const src = blank(); rect(src, 10, 10, 86, 86, PALE); // a flat wash: no line anywhere
  const painted = blank(); rect(painted, 10, 10, 86, 86, PALE); vline(painted, 48, 20, 76, INK, 2);
  const r = inkAgreement(src, painted, W, H, PAPER);
  assert.ok(r.precision < 0.3, `precision ${r.precision.toFixed(2)} should be low: none of the painted line has a source line under it`);
  assert.ok(has(r.flags, 'drawing the source does not have'), `flags: ${JSON.stringify(r.flags)}`);
});
