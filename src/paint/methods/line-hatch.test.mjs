import test from 'node:test';
import assert from 'node:assert/strict';
import { hatchShadows } from './line-hatch.mjs';

const W = 200, H = 120, PX = 0.15;
function block() {
  const L = new Float32Array(W * H).fill(90), mask = new Uint8Array(W * H);
  for (let y = 20; y < 100; y++) for (let x = 20; x < 180; x++) { mask[y * W + x] = 1; L[y * W + x] = x < 100 ? 62 : 40; } // a light shadow, then a deep one
  return { L, mask };
}

test('hatching stays inside the shadow mass and is denser where the shadow is deeper', () => {
  const { L, mask } = block(), lines = hatchShadows(mask, L, W, H, PX);
  assert.ok(lines.length > 10);
  for (const g of lines) for (const p of g.points) assert.ok(mask[Math.round(p.y) * W + Math.round(p.x)] === 1);
  const count = (x0, x1) => lines.filter(g => g.points[0].x >= x0 && g.points[0].x < x1 || g.points.at(-1).x >= x0 && g.points.at(-1).x < x1).length;
  assert.ok(count(100, 180) > 1.5 * count(20, 100), `${count(20, 100)} light, ${count(100, 180)} deep`);
  assert.ok(lines.every(g => g.role === 'hatch'));
});

test('nothing is hatched without a shadow, and the form direction follows the tone', () => {
  const { L } = block();
  assert.equal(hatchShadows(new Uint8Array(W * H), L, W, H, PX).length, 0);
  const { mask } = block(), fixed = hatchShadows(mask, L, W, H, PX, { angleDeg: 0, fromForm: false, baseMm: 0.5, ranks: [0.1, 0.2, 0.3], crossDark: 9, crossMm: 1, minRunMm: 1, widthMm: 0.1, weight: 0.5 });
  assert.ok(fixed.every(g => Math.abs(g.points.at(-1).y - g.points[0].y) < 1.5), 'a fixed angle of 0 runs level');
});
