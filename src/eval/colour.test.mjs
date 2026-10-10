import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaE2000, labOf, colourError } from './colour.mjs';
import { paperWhite, densityOf } from './bench/image.mjs';

test('delta E 2000 matches the published test pairs', () => {
  // Sharma, Wu and Dalal (2005), Table 1: pairs that catch a wrong hue wrap or a missing rotation term.
  const cases = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0000],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, want] of cases) assert.ok(Math.abs(deltaE2000(a, b) - want) < 0.0002, `${want} got ${deltaE2000(a, b)}`);
});

test('delta E 2000 is zero on itself and symmetric', () => {
  const a = [42, 11, -7], b = [55, -3, 19];
  assert.equal(deltaE2000(a, a), 0);
  assert.ok(Math.abs(deltaE2000(a, b) - deltaE2000(b, a)) < 1e-12);
});

test('paper is the white point of its own sheet', () => {
  // two sheets, one warm and one cool, each painted with the same 20% grey relative to its own paper
  const n = 64 * 64, warm = Buffer.alloc(n * 3), cool = Buffer.alloc(n * 3);
  const paint = (buf, paper, k) => { for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) buf[i * 3 + c] = Math.round(paper[c] * (i < n / 2 ? k : 1)); };
  paint(warm, [250, 244, 232], 0.6); paint(cool, [238, 242, 250], 0.6);
  const pw = paperWhite(warm, n), pc = paperWhite(cool, n);
  for (const [buf, paper] of [[warm, pw], [cool, pc]]) { const [L, a, b] = labOf(buf, n - 1, paper); assert.ok(L > 99.9 && Math.abs(a) < 0.2 && Math.abs(b) < 0.2, `paper reads ${L} ${a} ${b}`); }
  const e = colourError(warm, cool, n, pw, pc, densityOf(warm, n, pw), densityOf(cool, n, pc));
  assert.ok(e.painted < 0.5, `same paint on different paper should cost little, got ${e.painted}`);
});

test('colour error sees a wrong hue that optical density cannot', () => {
  // a wash at the same luminance in two different hues: identical in density, far apart in Lab
  const n = 64 * 64, paper = [250, 249, 245], A = Buffer.alloc(n * 3), B = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { A[i * 3] = 176; A[i * 3 + 1] = 150; A[i * 3 + 2] = 110; B[i * 3] = 120; B[i * 3 + 1] = 160; B[i * 3 + 2] = 178; }
  const DA = densityOf(A, n, paper), DB = densityOf(B, n, paper);
  let tone = 0; for (let i = 0; i < n; i++) tone += Math.abs(DA[i] - DB[i]);
  assert.ok(tone / n < 0.02, `the two washes should be the same darkness, density differs by ${tone / n}`);
  assert.ok(colourError(A, B, n, paper, paper, DA, DB).painted > 20, 'a warm and a cool wash of the same darkness must not score alike');
});
