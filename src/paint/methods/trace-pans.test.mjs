// --pigshare: trace pans leave a cell's demand without paling it (trace-pans.mjs), and the light-to-dark planner then
// lays fewer wet passes over the same cells (light-to-dark.mjs). Measured on a six-pan box sheet built the way a
// per-cell unmix leaves it: two or three pans carry each colour and every other pan sits in every cell as a trace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneTracePans, REFIT_TOLERANCE } from './trace-pans.mjs';
import { planLightToDark } from './light-to-dark.mjs';
import { filmOverGround, filmLight, colourLight } from './mass-tone.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';

const KEYS = ['hansa', 'rose', 'ultramarine', 'sienna', 'sapgreen', 'cerulean'];
const PIGS = KEYS.map(key => boxPigment(BOX.find(p => p.key === key)));
const k = PIGS.length, PAPER = [252, 251, 248];

/** sRGB of a film of amounts `a` over the paper, from the planner's own Kubelka-Munk optics. */
function filmRGB(a) {
  return [0, 1, 2].map(c => {
    let kx = 0, sx = 0;
    for (let j = 0; j < k; j++) { kx += a[j] * PIGS[j].K[c]; sx += a[j] * PIGS[j].S[c]; }
    return 255 * filmOverGround(kx, sx, PAPER[c] / 255);
  });
}

// The sheet: a paper band on top; an orange (hansa + rose) left half, a grey-brown (ultramarine + sienna + a little
// rose) right half and a green (sapgreen + hansa) strip at the bottom, all darker downwards. Every other pan sits in each
// cell as a 2% to 6% trace that varies cell to cell.
const w = 120, h = 90, n = w * h, TOP = 10;
const demand = new Float32Array(n * k), rgb = new Uint8ClampedArray(n * 3), density = new Float32Array(n);
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x, t = (y - TOP) / (h - TOP);
  if (y < TOP) { rgb.set(PAPER, i * 3); continue; }
  const main = y > 72 ? { 4: 0.5 + 0.6 * t, 0: 0.25 } : x < w / 2 ? { 0: 0.5 + 0.6 * t, 1: 0.3 + 0.4 * t } : { 2: 0.35 + 0.5 * t, 3: 0.35 + 0.5 * t, 1: 0.12 };
  let mass = 0; for (const j in main) mass += main[j];
  for (let j = 0; j < k; j++) demand[i * k + j] = main[j] ?? mass * (0.02 + 0.04 * rand());
  const a = demand.subarray(i * k, i * k + k);
  rgb.set(filmRGB(a).map(Math.round), i * 3);
  for (let j = 0; j < k; j++) density[i] += a[j];
}
const painted = i => Math.floor(i / w) >= TOP;
const absorption = (a, o) => [0, 1, 2].map(c => { let t = 0; for (let j = 0; j < k; j++) t += a[o + j] * PIGS[j].K[c]; return t; });
const MEASURE = process.env.TRACE_MEASURE === '1';

test('trace pans, cell by cell: every cell keeps its per-channel absorption to the tolerance, with fewer pans', () => {
  const r = pruneTracePans(demand, k, 0.1, { pigments: PIGS });
  let worst = 0, before = 0, after = 0, cells = 0;
  for (let i = 0; i < n; i++) {
    if (!painted(i)) continue;
    const o = i * k, b = absorption(demand, o), a = absorption(r.demand, o);
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.hypot(...b));
    for (let j = 0; j < k; j++) { if (demand[o + j] > 0) before++; if (r.demand[o + j] > 0) after++; }
    assert.ok(r.demand.subarray(o, o + k).some(v => v > 0), `cell ${i} kept paint`);
    cells++;
  }
  if (MEASURE) console.log({ worst, pansBefore: before / cells, pansAfter: after / cells, restored: r.restored, traces: r.traces });
  assert.ok(worst <= REFIT_TOLERANCE + 1e-6, `worst per-channel miss ${worst}`);
  // Three channels never need more than three pans.
  assert.ok(after / cells <= 3, `pans per cell ${(after / cells).toFixed(2)} from ${(before / cells).toFixed(2)}`);
  assert.ok(r.restored > 0, 'a trace that is real colour (the blue greying the orange) comes back');
});

test('trace pans: share is absorption, not mass', () => {
  const hansa = PIGS[0].K.reduce((x, y) => x + y), ultra = PIGS[2].K.reduce((x, y) => x + y);
  // A weak yellow with a little strong blue, so the blue carries far more of the light than of the mass.
  const a = new Float32Array(k); a[0] = 0.92; a[2] = 0.08;
  const blueShare = ultra * 0.08 / (ultra * 0.08 + hansa * 0.92);
  assert.ok(blueShare >= 0.1, `blue absorption share ${blueShare.toFixed(3)}`);
  assert.deepEqual(pruneTracePans(a, k, 0.1, { pigments: PIGS }).demand, a, 'an 8% mass of blue is not a trace');
  // Without optics mass is the share: the 8% is a trace and the yellow takes the whole mass.
  const plain = pruneTracePans(a, k, 0.1);
  assert.equal(plain.demand[2], 0);
  assert.ok(Math.abs(plain.demand[0] - 1) < 1e-6);
});

test('trace pans: share 0, one-pan cells, protected cells and bad input', () => {
  const same = pruneTracePans(demand, k, 0, { pigments: PIGS });
  assert.deepEqual(same.demand, demand);
  assert.equal(same.cells, 0);
  const protect = new Uint8Array(n).fill(1);
  assert.deepEqual(pruneTracePans(demand, k, 0.1, { pigments: PIGS, protect }).demand, demand);
  const one = new Float32Array(k); one[3] = 0.4;
  assert.deepEqual(pruneTracePans(one, k, 0.5, { pigments: PIGS }).demand, one);
  for (const bad of [-0.1, 1, NaN, Infinity]) assert.throws(() => pruneTracePans(demand, k, bad), /--pigshare/);
  assert.throws(() => pruneTracePans(demand.subarray(1), k, 0.1), /n cells of k pans/);
  assert.throws(() => pruneTracePans(demand, k, 0.1, { radius: 2 }), /grid/);
});

test('trace pans, three primaries: a neutral keeps all three and a greying trace stays when the colour needs it', () => {
  const P3 = [0, 1, 2].map(j => PIGS[j]), rgb3 = a => [0, 1, 2].map(c => { let kx = 0, sx = 0; for (let j = 0; j < 3; j++) { kx += a[j] * P3[j].K[c]; sx += a[j] * P3[j].S[c]; } return 255 * filmOverGround(kx, sx, PAPER[c] / 255); });
  const grey = Float32Array.of(0.5, 0.35, 0.3), r = pruneTracePans(grey, 3, 0.1, { pigments: P3 });
  assert.deepEqual(r.demand, grey, 'every primary of a neutral carries over a tenth of its light');
  const orange = Float32Array.of(0.6, 0.35, 0.03), o = pruneTracePans(orange, 3, 0.1, { pigments: P3 });
  const e = deltaE2000(labOf(rgb3(orange), 0, PAPER), labOf(rgb3(o.demand), 0, PAPER));
  if (MEASURE) console.log({ orange: Array.from(o.demand), restored: o.restored, dE: e });
  assert.ok(e < 1, `orange moved dE00 ${e.toFixed(2)}`);
});

test('trace pans, squinted: neighbours share pans and no cell visibly changes colour', () => {
  const r = pruneTracePans(demand, k, 0.1, { pigments: PIGS, w, h, radius: 2 });
  let sum = 0, worst = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (!painted(i)) continue;
    const e = deltaE2000(labOf(filmRGB(demand.subarray(i * k, i * k + k)), 0, PAPER), labOf(filmRGB(r.demand.subarray(i * k, i * k + k)), 0, PAPER));
    sum += e; worst = Math.max(worst, e); count++;
  }
  if (MEASURE) console.log({ meanDE: sum / count, worstDE: worst });
  // Measured (share 0.1, radius 2): mean dE00 0.36, worst 3.84 where two colour areas meet. One scale on the kept pans
  // instead of the refit measured mean 4.94.
  assert.ok(sum / count < 0.6, `mean dE00 ${(sum / count).toFixed(2)}`);
  assert.ok(worst < 5, `worst dE00 ${worst.toFixed(2)}`);
});

const BASE = { demand, k, density, w, h, rgb, pigments: PIGS, paperRGB: PAPER, shaped: true, sheetWidthMm: 120, layerHue: true, layers: 4 };

/** Passes per painted cell, laid pigment per cell (by pan), over a plan's layers. */
function laid(p) {
  const passes = new Uint16Array(n), per = new Float32Array(n * k);
  for (const L of p.layers) for (const sh of L.shapes) for (let i = 0; i < n; i++) if (sh.mask[i]) { passes[i]++; per[i * k + L.pigment] += sh.amount; }
  let sum = 0, cnt = 0, max = 0;
  for (let i = 0; i < n; i++) if (painted(i) && passes[i]) { sum += passes[i]; cnt++; max = Math.max(max, passes[i]); }
  return { mean: sum / cnt, max, per };
}

/** Light each painted cell returns under what the plan lays. */
function lightOf(per) {
  const out = new Float64Array(n), paper = PAPER.map(v => v / 255);
  for (let i = 0; i < n; i++) {
    const kx = [0, 0, 0], sx = [0, 0, 0];
    for (let j = 0; j < k; j++) for (let c = 0; c < 3; c++) { kx[c] += per[i * k + j] * PIGS[j].K[c]; sx[c] += per[i * k + j] * PIGS[j].S[c]; }
    out[i] = filmLight(kx, sx, paper);
  }
  return out;
}

const target = Float64Array.from({ length: n }, (_, i) => colourLight(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
/** Mean absolute and signed (positive: paler) light error of a plan against its target, over the painted cells. */
function lightError(per) {
  const L = lightOf(per);
  let abs = 0, signed = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (painted(i)) { abs += Math.abs(L[i] - target[i]); signed += L[i] - target[i]; cnt++; }
  return { abs: abs / cnt, signed: signed / cnt };
}

for (const calibratedPlan of [false, true]) {
  test(`planner, calibratedPlan ${calibratedPlan}: trace pans lay fewer passes, keep the plan's value and lose no shapes`, () => {
    const all = planLightToDark({ ...BASE, calibratedPlan }), pruned = planLightToDark({ ...BASE, calibratedPlan, pigShare: 0.1 });
    const a = laid(all), b = laid(pruned), ea = lightError(a.per), eb = lightError(b.per);
    let total = 0; for (let i = 0; i < n * k; i++) total += demand[i];
    if (MEASURE) console.log({ calibratedPlan, passes: [a.mean, b.mean], max: [a.max, b.max], err: [ea, eb], omitted: [all.omittedDemand / total, pruned.omittedDemand / total] });
    assert.equal(all.traceReport, null);
    assert.ok(pruned.traceReport.traces > 0 && pruned.traceReport.restored > 0);
    // Measured: mean passes per painted cell 32.2 -> 14.6 (calibrated 21.6 -> 9.9).
    assert.ok(b.mean < 0.6 * a.mean, `mean passes per cell ${b.mean.toFixed(1)} vs ${a.mean.toFixed(1)}`);
    // Measured: light error 0.081 -> 0.053 (calibrated 0.079 -> 0.049); signed +0.001 (calibrated -0.000). Both sides:
    // no worse a value match, and no paling.
    assert.ok(eb.abs <= ea.abs + 0.005, `light error ${eb.abs.toFixed(4)} vs ${ea.abs.toFixed(4)}`);
    assert.ok(eb.signed < 0.01, `pruned plan paler by ${eb.signed.toFixed(4)}`);
    // Measured: omitted demand 0.03% -> 0.26% (calibrated 0% -> 0.16%) of the sheet's demand, from pan masks broken
    // where two areas choose different pans.
    assert.ok(pruned.omittedDemand / total < 0.005, `omitted ${(100 * pruned.omittedDemand / total).toFixed(2)}%`);
  });
}
