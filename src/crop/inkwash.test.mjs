// Every picture is painted by hand into a buffer, so each mark's kind is known.
import test from 'node:test';
import assert from 'node:assert/strict';
import { separate, inkDirection, densities } from './inkwash.mjs';

const W = 96, H = 96, N = W * H, PAPER = [250, 248, 242];
const blank = () => { const b = Buffer.alloc(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) b[i * 3 + c] = PAPER[c]; return b; };
const put = (b, x, y, rgb) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; for (let c = 0; c < 3; c++) b[i + c] = rgb[c]; };
const vline = (b, x, y0, y1, rgb, wide = 1) => { for (let y = y0; y < y1; y++) for (let d = 0; d < wide; d++) put(b, x + d, y, rgb); };
const rect = (b, x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(b, x, y, rgb); };
const share = (mask, x0, y0, x1, y1) => { let on = 0, all = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { all++; on += mask[y * W + x]; } return on / all; };
// The masks are thinned to a centreline. A mark counts as found by how much of its length the mask covers: one hit
// per row, across the rows the mark runs through.
const rowsCovered = (mask, x0, y0, x1, y1) => { let hit = 0; for (let y = y0; y < y1; y++) { for (let x = x0; x < x1; x++) if (mask[y * W + x]) { hit++; break; } } return hit / (y1 - y0); };

const INK = [40, 34, 28];        // a dark neutral, the colour of walnut or carbon
const BLUE = [110, 140, 190];    // a paint with hue
const PALE = [225, 216, 196];    // a light wash

test('a narrow neutral line on paper is ink, not pigment', () => {
  const b = blank();
  rect(b, 10, 10, 86, 86, PALE);          // a wash over the middle, so the line has paint on both sides
  vline(b, 48, 20, 76, INK, 2);
  const s = separate(b, W, H, PAPER);
  assert.ok(rowsCovered(s.ink, 45, 30, 53, 70) > 0.9, `line read as ink along ${rowsCovered(s.ink, 45, 30, 53, 70).toFixed(2)} of its length`);
  assert.equal(share(s.edge, 46, 30, 51, 70) > 0.2, false, 'a line is not a tone edge');
});

test('a broad neutral band is pigment, however dark', () => {
  const b = blank();
  rect(b, 10, 10, 86, 86, PALE);
  vline(b, 40, 20, 76, INK, 16);          // sixteen cells across: no nib made this
  const s = separate(b, W, H, PAPER);
  assert.ok(share(s.ink, 44, 30, 52, 70) < 0.1, `broad band kept out of ink ${share(s.ink, 44, 30, 52, 70).toFixed(2)}`);
  assert.ok(share(s.pigment, 44, 30, 52, 70) > 0.9, 'broad band is pigment');
});

test('a narrow line with hue is pigment, not ink', () => {
  const b = blank();
  rect(b, 10, 10, 86, 86, PALE);
  vline(b, 48, 20, 76, BLUE, 2);
  const s = separate(b, W, H, PAPER);
  assert.ok(share(s.ink, 46, 30, 51, 70) < 0.15, `coloured line kept out of ink ${share(s.ink, 46, 30, 51, 70).toFixed(2)}`);
});

test('the boundary between two washes is an edge, not a line', () => {
  const b = blank();
  rect(b, 10, 10, 48, 86, PALE);
  rect(b, 48, 10, 86, 86, [190, 176, 150]);   // a darker wash meeting it: a step, not a ridge
  const s = separate(b, W, H, PAPER);
  assert.ok(share(s.ink, 45, 30, 52, 70) < 0.1, `wash boundary kept out of ink ${share(s.ink, 45, 30, 52, 70).toFixed(2)}`);
});

test('a long pale strand between two washes is a reserve; specks are tooth', () => {
  const b = blank();
  rect(b, 10, 10, 86, 86, [190, 176, 150]);
  vline(b, 48, 14, 82, PAPER, 2);                                   // a whisker: 68 cells of bare paper
  for (let k = 0; k < 20; k++) put(b, 20 + (k % 5) * 3, 20 + ((k / 5) | 0) * 7, PAPER);   // specks of tooth
  const s = separate(b, W, H, PAPER);
  assert.ok(rowsCovered(s.reserve, 45, 22, 54, 74) > 0.8, `strand read as reserve along ${rowsCovered(s.reserve, 45, 22, 54, 74).toFixed(2)} of its length`);
  assert.ok(share(s.reserve, 18, 18, 34, 46) < 0.05, 'specks are not planned reserves');
});

test('the ink direction is the picture own dark fluid, not grey by assumption', () => {
  const b = blank();
  rect(b, 10, 10, 86, 86, [225, 205, 170]);
  rect(b, 30, 30, 66, 66, [70, 44, 20]);         // a warm brown dark: walnut
  const { D3, DL } = densities(b, N, PAPER);
  const ink = inkDirection(D3, DL, N);
  assert.ok(ink[2] > ink[0], `walnut absorbs blue most: ${ink.map(v => v.toFixed(2)).join(',')}`);
});

test('ink share of candidates falls when the picture is washes rather than lines', () => {
  const lines = blank(); rect(lines, 8, 8, 88, 88, PALE);
  for (let x = 16; x < 84; x += 8) vline(lines, x, 16, 80, INK, 2);
  const washes = blank();
  for (let x = 8; x < 88; x += 16) rect(washes, x, 8, x + 12, 88, [206, 190, 160]);
  const a = separate(lines, W, H, PAPER).stats, c = separate(washes, W, H, PAPER).stats;
  assert.ok(a.inkShareOfCandidates > c.inkShareOfCandidates + 0.3,
    `lines ${a.inkShareOfCandidates.toFixed(2)} vs washes ${c.inkShareOfCandidates.toFixed(2)}`);
});
