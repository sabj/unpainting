// Pictures painted with paints from the box, so the chooser can be checked against the paints that made them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX, boxPigment } from './box.mjs';
import { chooseBox, boxPalette } from './boxpick.mjs';
import { renderLayers } from '../media/km.mjs';

const W = 72, H = 60, N = W * H, PAPER = [247, 244, 236];
const paint = key => BOX.find(p => p.key === key);

/** A sheet with the two paints laid in overlapping graded washes: the first strongest at the top left, the second at
 *  the bottom right, a band of bare paper, and the middle where they glaze each other. */
function sheetOf(keyA, keyB) {
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    a[i] = x < W * 0.65 ? 1.6 * (1 - x / (W * 0.65)) * (0.4 + 0.6 * (1 - y / H)) : 0;
    b[i] = x > W * 0.35 ? 1.4 * ((x - W * 0.35) / (W * 0.65)) * (0.4 + 0.6 * (y / H)) : 0;
    if (y > H * 0.45 && y < H * 0.55) a[i] = b[i] = 0;
  }
  const flat = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) flat[i * 3 + c] = PAPER[c];
  return renderLayers([[a, b]], [boxPigment(paint(keyA)), boxPigment(paint(keyB))], flat, N, 1);
}

for (const [keyA, keyB] of [['cerulean', 'sienna'], ['rose', 'sapgreen'], ['ultramarine', 'ochre']]) {
  test(`a sheet painted in ${keyA} and ${keyB} gets exactly those two back`, () => {
    const { paints, e, trail } = chooseBox(sheetOf(keyA, keyB), W, H, PAPER);
    assert.deepEqual(paints.map(p => p.key).sort(), [keyA, keyB].sort(), `chose ${paints.map(p => p.key)} at ${e.toFixed(2)}, trail ${trail.map(v => v.toFixed(2))}`);
    // not 0: the chooser's render lays an unmixed amount about a tenth darker than laid, 1.5 to 3 dE00 at the strongest
    assert.ok(e < 2.5, `the two reproduce the sheet: ${e.toFixed(2)} dE00`);
  });
}

test('how many paints is set by what another paint earns, between the least and the most allowed', () => {
  const sheet = sheetOf('cerulean', 'sienna');
  // with no bar to clear the chooser runs on to the most it is allowed, and with one no paint can clear it keeps the least
  assert.equal(chooseBox(sheet, W, H, PAPER, { gain: -Infinity, max: 4 }).paints.length, 4);
  assert.equal(chooseBox(sheet, W, H, PAPER, { gain: 100 }).paints.length, 2);
});

test('the chosen paints come back as a palette the painter can use', () => {
  const pal = boxPalette(sheetOf('rose', 'sapgreen'), W, H, PAPER);
  assert.equal(pal.pigments.length, 2);
  assert.equal(pal.monochrome, false);
  assert.ok(Number.isFinite(pal.paintChroma));
  for (const p of pal.pigments) assert.ok(p.K.length === 3 && p.S.length === 3 && p.name, JSON.stringify(p));
});
