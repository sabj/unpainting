// Two runs' finished pigment thickness (--thkdump 1), cell by cell: mean and largest difference, and the share of cells
// that differ by more than 1e-4 (and by more than 1e-3), over all pigments and over the cells either run painted.
//   node tools/gpu/thk-diff.mjs <run dir a> <run dir b> [pigments] [--mixedbackends]   (a CPU/GPU parity check needs the flag)
import fs from 'node:fs';
import { assertSameBackend } from '../../src/media/gpu/backend-record.mjs';

const [a, b, K0] = process.argv.slice(2).filter(x => x !== '--mixedbackends');
assertSameBackend([a, b], { allowMixed: process.argv.includes('--mixedbackends') });
const A = new Float32Array(fs.readFileSync(`${a}/thickness.f32`).buffer.slice(0)), B = new Float32Array(fs.readFileSync(`${b}/thickness.f32`).buffer.slice(0));
if (A.length !== B.length) throw new Error(`sizes differ: ${A.length} and ${B.length}`);
let sum = 0, max = 0, over = 0, over3 = 0, painted = 0, sumP = 0, peak = 0;
for (let i = 0; i < A.length; i++) {
  const d = Math.abs(A[i] - B[i]); sum += d; if (d > max) max = d; if (d > 1e-4) over++; if (d > 1e-3) over3++;
  if (A[i] > 1e-6 || B[i] > 1e-6) { painted++; sumP += d; } if (B[i] > peak) peak = B[i];
}
console.log(`cells x pigments ${A.length}, painted ${painted}: mean |diff| ${(sum / A.length).toExponential(2)} (over painted ${(sumP / Math.max(1, painted)).toExponential(2)}), largest ${max.toExponential(2)}, peak thickness ${peak.toFixed(2)}; over 1e-4: ${(100 * over / A.length).toFixed(3)}% of all (${(100 * over / Math.max(1, painted)).toFixed(2)}% of painted), over 1e-3: ${(100 * over3 / A.length).toFixed(3)}%`);
