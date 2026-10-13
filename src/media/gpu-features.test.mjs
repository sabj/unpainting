// The sheet options that used to run on the CPU only (holeSpan from --holerim, holeFill from --holefill, and marangoni and
// slope from --physics), each on the GPU sheet against the CPU sheet. Each case paints a wet wash with dry pits in it,
// lets it flow, then dries it, through the public calls the painter uses. The tolerance is the one gpu-backend.test.mjs
// uses: the CPU sheet's own float noise, measured by nudging three constants by a float32 rounding. Each case also checks
// that the option changes the CPU result by more than that, so a GPU that ignored it would fail.
// Skipped where there is no GPU or no `webgpu` package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, dry, thickness, coherent, DEFAULTS } from './sheet.mjs';
import { attachGpu, gpuStats } from './gpu/link.mjs';

const pigments = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.8, 0.5, 0.2], S: [0.03, 0.03, 0.02], rho: 0.3, omega: 0.9, gamma: 0.6 },
];
const N = 96;

// A wet disc with a glossy band and a damp band, and a second pigment dropped into one side. With `pits`, a grid of dry
// pits (one cell, and two-by-two) the brush skipped, for holeSpan and holeFill. marangoni and slope get the disc without
// pits: there a wet cell can end up beside a pit on one side and a dried cell on another, and the CPU's edge distance
// (two raster sweeps, sheet.mjs stepBox) can then read one more than the true distance the GPU's passes find, whatever
// the options. That difference is the edge distance's, not these options', so it is kept out of their comparison.
function washOf(pits) {
  const sheet = createSheet(makePaper(N, N, { seed: 5 }), pigments);
  let seed = 991; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; if (Math.hypot(x - N / 2, y - N / 2) >= 34) continue;
    const pit = (x % 6 === 2 && y % 6 === 2) || (x % 11 < 2 && y % 11 < 2);
    if (pits && pit) continue;
    sheet.M[i] = 1; sheet.ever[i] = 1;
    sheet.W[i] = (y < N / 2 ? 0.14 : 0.04) + 0.06 * rnd();
    sheet.s[i] = sheet.paper.capacity[i] * (0.4 + 0.4 * rnd());
    sheet.G[0][i] = 0.03 + 0.02 * rnd();
    if (x > N / 2 + 6) sheet.G[1][i] = 0.06 * rnd();
  }
  sheet.wetDirty = 1;
  return sheet;
}
function paint(sheet, O) {
  for (let q = 0; q < 40; q++) step(sheet, O);
  coherent(sheet);
  const mid = { W: Float32Array.from(sheet.W), G: sheet.G.map(a => Float32Array.from(a)) };
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  return { mid, thick: thickness(sheet) };
}
const stats = (a, b) => { let max = 0, sum = 0, n = 0; for (let k = 0; k < a.length; k++) for (let i = 0; i < a[k].length; i++) { const d = Math.abs(a[k][i] - b[k][i]); if (d > max) max = d; sum += d; n++; } return { max, mean: sum / n }; };
const peak = t => Math.max(...t.map(a => a.reduce((m, v) => Math.max(m, v), 0)));
const midOf = r => [r.mid.W, ...r.mid.G];

// The option values: holeSpan and holeFill in cells (paint-plate's --holerim and --holefill divided by the cell size),
// marangoni and slope as --physics takes them. slope 0.3 runs without the faster drying at the edge: on this disc it
// dries a cell beside a pit-shaped hollow in the wash, where the edge-distance difference above shows.
const CASES = [
  ['holeSpan (--holerim)', { holeSpan: 4 }, true],
  ['holeFill (--holefill)', { holeFill: 3 }, true],
  ['holeSpan and holeFill together', { holeSpan: 4, holeFill: 3 }, true],
  ['marangoni', { marangoni: 0.1 }, false],
  ['slope', { slope: 0.1 }, false],
  ['a steeper slope, no edge drying', { slope: 0.3, edgeEvap: 0 }, false],
];

for (const [name, extra, pits] of CASES) {
  const wash = () => washOf(pits);
  test(`${name} on the GPU sheet paints within the CPU sheet's own float noise`, { timeout: 180000 }, t => {
    const base = { ...DEFAULTS, gran: 0.25 }, O = { ...base, ...extra };
    const ref = paint(wash(), O), scale = peak(ref.thick);
    const O2 = { ...O }; for (const k of ['flow', 'diffuse', 'evap']) O2[k] = Math.fround(O[k] * (1 + 1e-6));
    const floor = stats(paint(wash(), O2).thick, ref.thick), midFloor = stats(midOf(paint(wash(), O2)), midOf(ref));
    // the option must matter here, or the comparison below proves nothing
    const without = stats(paint(wash(), base).thick, ref.thick);
    assert.ok(without.max > Math.max(50 * floor.max, 2e-3 * scale), `${name} barely changes the CPU result: ${without.max} against floor ${floor.max} (peak ${scale})`);

    const g = wash(), info = attachGpu(g, O, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
    try {
      const out = paint(g, O), d = stats(out.thick, ref.thick), dm = stats(midOf(out), midOf(ref));
      assert.ok(gpuStats(g).steps >= 40 && gpuStats(g).drys === 1, 'the run went through the GPU');
      console.log(`# ${name}: thickness max ${d.max.toExponential(2)} mean ${d.mean.toExponential(2)} (floor ${floor.max.toExponential(2)} / ${floor.mean.toExponential(2)}, peak ${scale.toFixed(3)}, option effect ${without.max.toExponential(2)}); after 40 steps max ${dm.max.toExponential(2)} (floor ${midFloor.max.toExponential(2)})`);
      assert.ok(d.mean <= Math.max(20 * floor.mean, 1e-6 * scale), `mean difference ${d.mean} against floor ${floor.mean}`);
      assert.ok(d.max <= Math.max(50 * floor.max, 2e-3 * scale), `max difference ${d.max} against floor ${floor.max} (peak ${scale})`);
      assert.ok(d.max < 0.1 * without.max, `the GPU difference ${d.max} is not small next to the option's own effect ${without.max}`);
    } finally { g._gpu.close(); }
  });
}

// Strong marangoni is unstable on the CPU too: a float32 nudge of three constants moves the result by a quarter of its
// peak, so there is no float-noise floor to hold the GPU to. The GPU must part from the CPU no more than the CPU parts
// from itself.
test('strong marangoni on the GPU sheet parts from the CPU no more than the CPU parts from itself', { timeout: 180000 }, t => {
  const O = { ...DEFAULTS, gran: 0.25, marangoni: 0.5 }, wash = () => washOf(false);
  const ref = paint(wash(), O);
  const O2 = { ...O }; for (const k of ['flow', 'diffuse', 'evap']) O2[k] = Math.fround(O[k] * (1 + 1e-6));
  const floor = stats(paint(wash(), O2).thick, ref.thick);
  const g = wash(), info = attachGpu(g, O, { mode: 'auto', log: () => {} });
  if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
  try {
    const d = stats(paint(g, O).thick, ref.thick);
    console.log(`# marangoni 0.5: thickness max ${d.max.toExponential(2)} mean ${d.mean.toExponential(2)} (CPU against itself ${floor.max.toExponential(2)} / ${floor.mean.toExponential(2)})`);
    assert.ok(d.mean <= 3 * floor.mean && d.max <= 3 * floor.max, `GPU ${JSON.stringify(d)} against CPU ${JSON.stringify(floor)}`);
  } finally { g._gpu.close(); }
});
