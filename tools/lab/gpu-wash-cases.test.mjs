// The wash cases (wash-cases.mjs: a poured disc, a square laid in five sweeps, a bloom, the five sweeps on a tilted board,
// a two-pigment puddle) dried on the CPU sheet and on the GPU sheet with the pinned-edge feed and the film's levelling on:
// the same rim, the same colour, the same pigment, and on the squares the same bands and seams. 0.5 mm cells keep it quick;
// the 0.25 and 0.1 mm runs are in the GPU port's report. Skipped where there is no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { luminance, densityOf, washMask, rimContrast } from './wash-measure.mjs';
import { sweptSquare } from './wash-acceptance.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CASES = ['puddleU', 'sweeps', 'bloom', 'sweepsTilt', 'mixed'], MM = 0.5;
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const PAPER_Y = 0.2126 * lin(246) + 0.7152 * lin(245) + 0.0722 * lin(239);
const lstar = Y => (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y);

async function hasGpu() {
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); const a = await w.create([]).requestAdapter(); return !!a; } catch { return false; }
}

test('the wash cases dry to the same rim and colour on the GPU sheet as on the CPU sheet, edge flow on', { timeout: 600000 }, async t => {
  if (!(await hasGpu())) return t.skip('no GPU adapter');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-wash-'));
  try {
    const run = backend => {
      const dir = path.join(out, backend);
      execFileSync(process.execPath, [path.join(ROOT, 'tools/lab/wash-cases.mjs'), ROOT, dir, '--backend', backend, '--cells', String(MM), '--modes', 'full', '--cases', CASES.join(',')], { stdio: 'pipe' });
      return { dir, info: JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8')) };
    };
    const cpu = run('cpu'), gpu = run('gpu');
    assert.ok(cpu.info.O.edgeEvap > 0, 'the cases run with the edge flow on');
    for (const name of CASES) {
      const a = cpu.info.runs.find(r => r.name === name), b = gpu.info.runs.find(r => r.name === name), n = a.w * a.h;
      const ya = luminance(fs.readFileSync(path.join(cpu.dir, a.file)), n), yb = luminance(fs.readFileSync(path.join(gpu.dir, b.file)), n);
      const oa = densityOf(ya, PAPER_Y), ob = densityOf(yb, PAPER_Y), mask = washMask(oa);
      const ra = rimContrast(oa, a.w, a.h, MM, { mask }).contrast, rb = rimContrast(ob, b.w, b.h, MM, { mask }).contrast;
      let mean = 0, worst = 0; for (let i = 0; i < n; i++) { const d = Math.abs(lstar(ya[i]) - lstar(yb[i])); mean += d / n; worst = Math.max(worst, d); }
      const mass = r => r.totals.pig.reduce((s, v) => s + v, 0), dm = Math.abs(mass(b) / mass(a) - 1);
      if (name.startsWith('sweeps')) {
        const sq = od => sweptSquare(od, a.w, a.h, MM, { centres: [9, 17, 25, 33, 41], half: 6 }), sa = sq(oa), sb = sq(ob);
        t.diagnostic(`${name}: bands CPU ${sa.bands.toFixed(4)} GPU ${sb.bands.toFixed(4)}, seam CPU ${sa.seam.toFixed(4)} GPU ${sb.seam.toFixed(4)}`);
        assert.ok(Math.abs(sb.bands - sa.bands) < 0.01 * Math.max(0.03, sa.bands) && Math.abs(sb.seam - sa.seam) < 1e-3, `${name}: bands ${sb.bands} seam ${sb.seam} against the CPU's ${sa.bands} ${sa.seam}`);
      }
      t.diagnostic(`${name}: rim/interior CPU ${ra.toFixed(4)} GPU ${rb.toFixed(4)}, L* mean ${mean.toFixed(4)} worst ${worst.toFixed(2)}, pigment ${dm.toExponential(1)}`);
      // (the tilted square's film runs to its lower edge: its whole outline reads lighter than its middle)
      if (name !== 'sweepsTilt') assert.ok(ra > 1.05, `${name}: the CPU dries a rim (${ra})`);
      assert.ok(Math.abs(rb / ra - 1) < 0.01, `${name}: rim over interior ${rb} against the CPU's ${ra}`);
      assert.ok(mean < 0.05 && worst < 3, `${name}: L* differs by ${mean} on average, ${worst} at worst`);
      assert.ok(dm < 1e-5, `${name}: pigment differs by ${dm}`);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
