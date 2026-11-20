// The pinned-edge feed on the GPU sheet (edge-geometry.mjs, edge-feed-wgsl.mjs) against the CPU sheet's (edge-feed.mjs):
// a poured disc and a square with a dry bay, stepped on both, must hold the same water and pigment; and with no other
// evaporation the GPU's water left plus what its feed evaporated must be the water poured. Skipped without a GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, deposit, step, DEFAULTS } from '../sheet.mjs';
import { makePaper } from '../paper.mjs';
import { GpuSheet, openGpu } from './stepfull.mjs';

const PIGMENTS = [{ K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 }];
const N = 96, MM = 0.25;
function wash(shape) {
  const sheet = createSheet(makePaper(N, N, { seed: 9, mmPerCell: MM }), PIGMENTS);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const disc = Math.hypot(x - 48, y - 48) < 30, square = x > 16 && x < 80 && y > 16 && y < 80 && !(x > 48 && Math.abs(y - 48) < 8);
    if (shape === 'disc' ? disc : square) deposit(sheet, y * N + x, 0.3, [0.45]);
  }
  return sheet;
}
const water = s => { let t = 0; for (let i = 0; i < s.n; i++) t += s.W[i] + s.s[i]; return t; };
const pigment = s => { let t = 0; for (let i = 0; i < s.n; i++) t += s.G[0][i] + s.P[0][i] + s.D[0][i]; return t; };
const worst = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

let device = null;
async function gpu(t) {
  if (device) return device;
  try { const w = await import('webgpu'); Object.assign(globalThis, w.globals); ({ device } = await openGpu(w.create([]))); return device; }
  catch (e) { t.skip(`GPU unavailable: ${e.message}`); return null; }
}
test.after(() => device?.destroy());

for (const shape of ['disc', 'square']) {
  test(`the GPU edge feed holds the CPU's water and pigment on a ${shape}`, { timeout: 120000 }, async t => {
    const d = await gpu(t); if (!d) return;
    // A strong feed, so the rim is well formed in 120 steps. Slide off: its repose threshold turns a float32 rounding of
    // the deposit into a whole cell's slide or none (with it on, the rim cells' deposits part by up to 0.07 from step 30,
    // with or without the feed); the wash cases (tools/lab/gpu-wash-cases.test.mjs) compare the dried colour with it on.
    const O = { ...DEFAULTS, edgeEvap: 0.004, mmPerCell: MM, dt: 2, slide: 0 };
    const cpu = wash(shape), gs = wash(shape), g = await GpuSheet.create(d, gs, O);
    try {
      for (let i = 0; i < 120; i++) step(cpu, O);
      await g.advance(120); await g.download(gs);
    } finally { g.destroy(); }
    const total = s => Float64Array.from(s.G[0], (v, i) => v + s.P[0][i] + s.D[0][i]);
    const dW = Math.max(worst(cpu.W, gs.W), worst(cpu.s, gs.s)), dG = worst(total(cpu), total(gs)), dP = worst(cpu.edgePending, gs.edgePending);
    t.diagnostic(JSON.stringify({ dW, dG, dP, waterCpu: water(cpu), waterGpu: water(gs) }));
    // float32 against the CPU's double-precision feed: a few float32 roundings of a cell's water and pigment
    assert.ok(dW < 1e-4, `water differs by ${dW}`);
    assert.ok(dG < 1e-4, `pigment differs by ${dG}`);
    assert.ok(dP < 1e-5, `unmet edge demand differs by ${dP}`);
    assert.ok(Math.abs(water(gs) / water(cpu) - 1) < 1e-5, 'total water');
  });
}

test('the GPU edge feed balances water and pigment to 1e-5', { timeout: 120000 }, async t => {
  const d = await gpu(t); if (!d) return;
  // no evaporation but the feed's: what leaves the sheet is what the feed reports
  const O = { ...DEFAULTS, evap: 0, paperDry: 0, edgeEvap: 0.004, mmPerCell: MM, dt: 2 };
  const gs = wash('square'), w0 = water(gs), p0 = pigment(gs), g = await GpuSheet.create(d, gs, O);
  let gone;
  try { await g.advance(150); gone = await g.edgeEvaporated(); await g.download(gs); } finally { g.destroy(); }
  t.diagnostic(JSON.stringify({ w0, left: water(gs), gone, p0, p1: pigment(gs) }));
  assert.ok(gone > 0.05 * w0, `the feed evaporated ${gone} of ${w0}`);
  assert.ok(Math.abs(water(gs) + gone - w0) < 1e-5 * w0, `water balance ${(water(gs) + gone - w0) / w0}`);
  assert.ok(Math.abs(pigment(gs) - p0) < 1e-5 * p0, `pigment balance ${(pigment(gs) - p0) / p0}`);
});
