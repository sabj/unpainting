import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateInkDark, classifyPathDetail, CLASS, MASS_DEFAULTS } from './line-class.mjs';

const W = 200, H = 60, PX = 0.15;

test('estimateInkDark reads the 75th percentile of confident pen lines, so medium-dark pen strokes bordering a wash stay CLASS.pen while pure wash steps stay CLASS.mass', () => {
  // Paper L=90; confident pen strokes (contrast >= 12 against paper) spanning L=30..60 across 4 rows (800 px > 600 points).
  const L = new Float32Array(W * H).fill(90);
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 8, onL = 30 + i * 10; // L = 30, 40, 50, 60 (75th percentile is 50..60, whereas 30th was 30..40)
    for (let x = 5; x < W - 5; x++) { L[y * W + x] = onL; L[(y + 1) * W + x] = onL; }
    lines.push({ points: Array.from({ length: 65 }, (_, k) => ({ x: 5 + k * 3, y: y + 0.5 })) });
  }
  const inkDark = estimateInkDark(lines, L, W, H, PX);
  assert.ok(inkDark != null && inkDark >= 50 && inkDark <= 60, `expected 75th percentile in 50..60, got ${inkDark}`);

  // Now test a medium-dark pen stroke (L=48) bordering a grey wash (L=51 on y >= 46, paper L=90 on y < 44):
  // min(left, right) - on = 51 - 48 = 3.0 L* (< penContrast 5, >= inkDarkContrast 2), step = 90 - 51 = 39 L* (>= stepContrast 6).
  for (let y = 46; y < H; y++) for (let x = 0; x < W; x++) L[y * W + x] = 51;
  for (let x = 10; x < 100; x++) { L[44 * W + x] = 48; L[45 * W + x] = 48; }
  const borderPen = Array.from({ length: 80 }, (_, k) => ({ x: 15 + k, y: 45 }));
  const withDark = classifyPathDetail(borderPen, L, W, H, PX, { ...MASS_DEFAULTS, inkDark });
  assert.ok(withDark.cls.slice(5, -5).every(c => c === CLASS.pen), 'wash-bordered pen stroke within 75th-percentile ink darkness stays CLASS.pen');

  // A monotonic wash edge with no pen trough (paper L=90 above y=46, wash L=51 on y >= 46, no dark line between them) is still CLASS.mass.
  for (let x = 110; x < 190; x++) { L[44 * W + x] = 90; L[45 * W + x] = 90; }
  const washStep = Array.from({ length: 60 }, (_, k) => ({ x: 120 + k, y: 46 }));
  const stepRes = classifyPathDetail(washStep, L, W, H, PX, { ...MASS_DEFAULTS, inkDark });
  assert.ok(stepRes.cls.slice(5, -5).every(c => c === CLASS.mass), 'monotonic wash step with no trough stays CLASS.mass');
});
