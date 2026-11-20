import test from 'node:test';
import assert from 'node:assert/strict';
import { touchesFrom } from './touch-layer.mjs';

test('touches go only where the richer study is darker or of another hue than what is laid, each one mark, lightest group first', () => {
  const pw = 80, ph = 60, pn = pw * ph, grid = new Uint8ClampedArray(pn * 3).fill(0);
  for (let q = 0; q < pn; q++) grid.set([220, 205, 170], q * 3);
  // a darker streak, a cool stone and a lighter patch (which watercolour cannot paint over what is laid)
  for (let y = 10; y < 14; y++) for (let x = 10; x < 50; x++) grid.set([150, 140, 130], (y * pw + x) * 3);
  for (let y = 30; y < 36; y++) for (let x = 30; x < 36; x++) grid.set([170, 190, 205], (y * pw + x) * 3);
  for (let y = 45; y < 55; y++) for (let x = 50; x < 60; x++) grid.set([250, 248, 240], (y * pw + x) * 3);
  const ref = { L: new Float32Array(pn).fill(84), A: new Float32Array(pn).fill(1), B: new Float32Array(pn).fill(15) };
  const out = touchesFrom({ grid, ref, paper: null, pw, ph, mmX: 0.5, paperRGB: [252, 251, 248], minMm2: 2 });
  const touches = out.flatMap(g => g.touches);
  assert.equal(touches.length, 2);
  assert.ok(touches.some(t => t.name === 'taper'));
  assert.ok(touches.every(t => !t.cells.includes(50 * pw + 55)));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].lab[0] >= out[i].lab[0]);
});
