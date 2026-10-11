// GPU (strokes on the GPU, or with GPU_STROKES=0 on the CPU) against the CPU sheet, on the gpu-backend test's painting
// at a chosen size: mean and largest difference of the pigment fields, and the share of cells differing by more than 1e-4.
//   node tools/gpu/stroke-diff.mjs [size=96] [seed=3] [cpustrokes] [option=value ...]   e.g. ... 96 3 holeSpan=4 holeFill=3
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { attachGpu, gpuStats } from '../../src/media/gpu/link.mjs';

const N = +(process.argv[2] || 96), SEED = +(process.argv[3] || 3);
// sheet options after the size and seed, as step-check.mjs takes them
const extra = Object.fromEntries(process.argv.slice(4).filter(a => a.includes('=')).map(a => a.split('=')).map(([k, v]) => [k, +v]));
if (process.argv.slice(4).includes('cpustrokes')) process.env.GPU_STROKES = '0'; // the sheet on the GPU, the brush on the CPU
const pigments = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.8, 0.5, 0.2], S: [0.03, 0.03, 0.02], rho: 0.3, omega: 0.9, gamma: 0.6 },
  // pigments the painting never lays: the GPU's step leaves them out while nothing holds them
  { K: [0.2, 0.9, 0.4], S: [0.03, 0.03, 0.02], rho: 0.2, omega: 1.1, gamma: 0.4 },
  { K: [0.6, 0.2, 0.7], S: [0.03, 0.03, 0.02], rho: 0.4, omega: 0.8, gamma: 0.3 },
];
const s = v => Math.round(v * N / 96);
function paint(sheet, O) {
  const brush = createBrush({ flat: true, radius: s(6), wetMix: 0.5, capacity: 80, seed: SEED });
  dip(brush, { water: 1, conc: [0.8, 0.1, 0, 0] });
  stroke(brush, sheet, [{ x: s(20), y: s(24), p: 1, r: s(6) }, { x: s(74), y: s(30), p: 1, r: s(6) }], { upright: 'sweep', gpuBetween: true, between: k => { if (k % 6 === 0) step(sheet, O); } });
  for (let q = 0; q < 40; q++) step(sheet, O);
  dip(brush, { water: 0.8, conc: [0.1, 0.7, 0, 0] });
  stroke(brush, sheet, [{ x: s(30), y: s(12), p: 1, r: s(5) }, { x: s(34), y: s(52), p: 1, r: s(5) }], { upright: true });
  for (let q = 0; q < 30; q++) step(sheet, O);
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  const dryb = createBrush({ radius: s(3), bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, seed: 9 });
  dip(dryb, { water: 0.22, conc: [0.6, 0.3, 0, 0] });
  stroke(dryb, sheet, [{ x: s(16), y: s(60), p: 0.8 }, { x: s(70), y: s(66), p: 0.6 }, { x: s(80), y: s(80), p: 0.5 }], { upright: 'sweep' });
  dip(brush, { water: 1, conc: [0.4, 0.4, 0, 0] });
  stroke(brush, sheet, [{ x: s(16), y: s(40), p: 1, r: s(7) }, { x: s(78), y: s(44), p: 1, r: s(7) }], { upright: 'sweep', gpuBetween: true, between: k => { if (k % 8 === 0) step(sheet, O); } });
  for (let q = 0; q < 30; q++) step(sheet, O);
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  return thickness(sheet);
}
const fresh = () => createSheet(makePaper(N, N, { seed: 5 }), pigments);
const O = { ...DEFAULTS, gran: 0.25, ...extra };
const ref = paint(fresh(), O);
const g = fresh(), info = attachGpu(g, O, { mode: 'on', log: () => {} });
const out = paint(g, O);
let max = 0, sum = 0, over = 0, cnt = 0, peak = 0;
for (let k = 0; k < ref.length; k++) for (let i = 0; i < ref[k].length; i++) { const d = Math.abs(out[k][i] - ref[k][i]); if (d > max) max = d; sum += d; if (d > 1e-4) over++; cnt++; peak = Math.max(peak, ref[k][i]); }
console.log(`${N}x${N} seed ${SEED} ${JSON.stringify(extra)}: mean |diff| ${sum / cnt} (peak field ${peak.toFixed(3)}), largest ${max}, cells over 1e-4: ${(100 * over / cnt).toFixed(3)}%`, JSON.stringify(gpuStats(g)));
g._gpu.close(); process.exit(0);
