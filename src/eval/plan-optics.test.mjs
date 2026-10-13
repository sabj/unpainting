import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderLayers } from '../media/km.mjs';
import { execution } from './composite.mjs';
import { planDensityOver, densityOf, cellRGB } from './plan-optics.mjs';

const W = 160, H = 160, n = W * H, paper = [250, 246, 238];
const ink = { K: [6, 6, 6], S: [0.01, 0.01, 0.01] }, blue = { K: [1.2, 0.6, 0.15], S: [0.04, 0.04, 0.04] };
const flat = () => { const p = new Uint8ClampedArray(n * 3); for (let i = 0; i < n; i++) p.set(paper, i * 3); return p; };
const blur = (F, w, h, s) => { const r = Math.max(1, Math.round(s)), o = new Float32Array(F.length); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0, k = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { a += F[yy * w + xx]; k++; } } o[y * w + x] = a / k; } return o; };

// Mittens at pass 1: a pen drawing on the sheet, then one pale wash with a form in it, laid exactly as planned.
const drawing = Float32Array.from({ length: n }, (_, i) => ((i % W) % 20 < 2 || ((i / W) | 0) % 40 < 2 ? 0.4 : 0));
const wash = Float32Array.from({ length: n }, (_, i) => { const x = i % W, y = (i / W) | 0; return x < 90 ? 0.01 + 0.03 * y / H : 0.004; });
const zero = new Float32Array(n);

test('a wash laid as planned over a drawing reads as the plan: about 100% of its forms', () => {
  const before = renderLayers([[drawing, zero]], [ink, blue], flat(), n, 1);
  const painted = densityOf(renderLayers([[drawing, zero], [zero, wash]], [ink, blue], flat(), n, 1), paper, n);
  const ledger = new Float32Array(n * 2); for (let i = 0; i < n; i++) ledger[i * 2 + 1] = wash[i];
  const r = execution(planDensityOver(ledger, [ink, blue], paper, n, before), painted, W, H, blur);
  assert.ok(r.formKept > 0.9 && r.formKept < 1.1, `forms kept ${r.formKept}`);
  assert.ok(r.formStructure > 0.95, `form agreement ${r.formStructure}`);
  assert.ok(Math.abs(r.bias) < 0.01, `bias ${r.bias}`);
  // the plan side the painter used before: the ledger weighted by mean K, on nothing, against rendered density
  const old = Float32Array.from({ length: n }, (_, i) => wash[i] * (blue.K[0] + blue.K[1] + blue.K[2]) / 3);
  assert.ok(execution(old, painted, W, H, blur).formKept > 1.5, 'the old construction read the drawing as the sheet departing from the plan');
});

test('with nothing planned the plan is the sheet as it stood, and on bare paper it is the rendered plan', () => {
  const before = renderLayers([[drawing]], [ink], flat(), n, 1);
  const none = planDensityOver(new Float32Array(n), [ink], paper, n, before), base = densityOf(before, paper, n);
  for (let i = 0; i < n; i += 97) assert.ok(Math.abs(none[i] - base[i]) < 1e-6, `cell ${i}`);
  const onPaper = planDensityOver(wash, [blue], paper, n), rendered = densityOf(renderLayers([[wash]], [blue], flat(), n, 1), paper, n);
  for (let i = 0; i < n; i += 97) assert.ok(Math.abs(onPaper[i] - rendered[i]) < 1e-6, `cell ${i}`);
});

test('cellRGB averages the sheet render over each picture cell', () => {
  const SC = 2, W2 = 4, big = new Uint8ClampedArray(W2 * 2 * 3);
  big.set([10, 20, 30, 30, 40, 50, 100, 100, 100, 0, 0, 0, 10, 20, 30, 30, 40, 50, 100, 100, 100, 0, 0, 0]);
  assert.deepEqual([...cellRGB(big, { w: 2, h: 1, SC, W2 })], [20, 30, 40, 50, 50, 50]);
});

test('the painter reports the plan carried in the sheet\'s units, not hundreds of per cent at pass 1', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-optics-'));
  try {
    const r = spawnSync(process.execPath, ['tools/paint-plate.mjs', '--image', 'examples/targets/trumbull.jpg', '--width', '64', '--mode', 'fast', '--video', '0',
      '--gpu', 'off', '--out', path.join(dir, 'p')], { cwd: root, encoding: 'utf8', timeout: 240000 });
    assert.equal(r.status, 0, r.stderr);
    const carried = r.stdout.match(/carried the plan: forms (\d+)% at agreement ([\d.]+)/);
    assert.ok(carried, 'the run reports how much of the plan it carried');
    const forms = Number(carried[1]) / 100;
    assert.ok(forms > 0.5 && forms < 1.25, `forms carried ${forms}`);
    assert.doesNotMatch(r.stdout, /plan's forms at pass 1:/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
