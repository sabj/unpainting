// One sheet step on the CPU (sheet.mjs) and on the GPU (stepfull) from the same wet state, field by field: the largest
// difference in each field relative to its own size. For finding where the two steps part when a run's pictures do.
//   node tools/gpu/step-check.mjs [steps=1] [option=value ...]   e.g. node tools/gpu/step-check.mjs 1 slide=0 gran=0.6
import * as webgpu from 'webgpu';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, DEFAULTS } from '../../src/media/sheet.mjs';
import { openGpu, GpuSheet } from '../../src/media/gpu/stepfull.mjs';

Object.assign(globalThis, webgpu.globals);
const STEPS = +(process.argv[2] || 1);
const extra = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const O = { ...DEFAULTS, gran: 0.6, ...extra };
const W = 96, H = 80;
const pigments = [
  { K: [0.46, 0.29, 0.05], S: [0.05, 0.03, 0.02], rho: 0.08, omega: 1.4, gamma: 0.8 },
  { K: [0.03, 0.23, 0.50], S: [0.04, 0.03, 0.03], rho: 0.06, omega: 1.4, gamma: 0.5 },
  { K: [0.34, 0.32, 0.29], S: [0.05, 0.05, 0.05], rho: 0.06, omega: 1.4, gamma: 0.6 },
];
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const make = () => {
  const sh = createSheet(makePaper(W, H, { seed: 7 }), pigments);
  seed = 12345;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, inside = Math.hypot(x - W / 2, y - H / 2) < 30;
    if (!inside) continue;
    sh.M[i] = 1; sh.ever[i] = 1; sh.W[i] = 0.03 + 0.25 * rnd(); sh.s[i] = sh.paper.capacity[i] * (0.3 + 0.6 * rnd());
    for (let k = 0; k < 3; k++) { sh.G[k][i] = 0.05 * rnd(); sh.D[k][i] = 0.2 * rnd(); sh.P[k][i] = 0.01 * rnd(); }
  }
  sh.wetDirty = 1; return sh;
};
const cpu = make();
for (let s = 0; s < STEPS; s++) step(cpu, O);
const gsh = make();
const { device } = await openGpu(webgpu.create([]));
const g = await GpuSheet.create(device, gsh, O); g.setAct(7);
g.step(STEPS); await g.idle(); await g.download(gsh);
const cmp = (name, a, b) => {
  let worst = 0, at = -1, scale = 0;
  for (let i = 0; i < a.length; i++) { scale = Math.max(scale, Math.abs(a[i])); const d = Math.abs(a[i] - b[i]); if (d > worst) { worst = d; at = i; } }
  console.log(`${name.padEnd(5)} largest |cpu - gpu| ${worst.toExponential(2)} at ${at} (field up to ${scale.toFixed(3)}; cpu ${a[at]} gpu ${b[at]})`);
};
console.log(`${STEPS} step(s), ${JSON.stringify(extra)}`);
cmp('W', cpu.W, gsh.W); cmp('s', cpu.s, gsh.s);
for (let k = 0; k < 3; k++) { cmp(`G${k}`, cpu.G[k], gsh.G[k]); cmp(`D${k}`, cpu.D[k], gsh.D[k]); cmp(`P${k}`, cpu.P[k], gsh.P[k]); }
process.exit(0);
