import test from 'node:test';
import assert from 'node:assert/strict';
import { planCrosshatch } from './crosshatch.mjs';

test('planCrosshatch generates contour-following hatches in midtones and cross-hatches in deep shadows', () => {
  const w = 120, h = 90, n = w * h;
  const srcD = new Float32Array(n);
  const sheetD = new Float32Array(n);
  // Left half: light paper (0.02); middle band: midtone shadow (0.35); right core: deep shadow (0.80) with vertical edge
  for (let y = 10; y < h - 10; y++) {
    for (let x = 35; x < 70; x++) {
      srcD[y * w + x] = 0.35;
      sheetD[y * w + x] = 0.18;
    }
    for (let x = 70; x < 108; x++) {
      srcD[y * w + x] = 0.82;
      sheetD[y * w + x] = 0.32;
    }
  }
  const r = planCrosshatch(srcD, sheetD, w, h, { K: 1, spacing: 3.0 });
  assert.ok(r.primary.length > 20, `expected >20 primary hatches, got ${r.primary.length}`);
  assert.ok(r.cross.length > 10, `expected >10 secondary cross-hatches, got ${r.cross.length}`);
  assert.ok(r.accents.length > 5, `expected >5 core accents, got ${r.accents.length}`);
  // Verify no hatches are placed in the clean light paper region (x < 30)
  for (const g of [...r.primary, ...r.cross]) {
    for (const p of g.points) {
      assert.ok(p.x >= 30, `hatch point leaked into light paper at x=${p.x}`);
    }
  }
});
