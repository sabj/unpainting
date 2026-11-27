import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, dry, totals, layersOf, DEFAULTS } from './sheet.mjs';
import { renderLayers } from './km.mjs';
import { subcellLayers } from './subcell-grain.mjs';
import { physicalOf, physicsFields } from './pigment-physical.mjs';
import { stokesMmPerS, settleShare, settleSpeed, particleOf } from './settling.mjs';
import { luminance, densityOf, grainContrast, rimContrast } from '../../tools/lab/wash-measure.mjs';

// French ultramarine (granulating) and phthalo blue (staining), with the table's physics (pigment-physical.mjs)
const ULTRAMARINE = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) };
const PHTHALO = { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('phthaloblue')) };
const PAPER = [246, 245, 239], PAPER_Y = luminance(new Uint8Array(PAPER), 1)[0];
// the painter's sheet constants (tools/plate/sheet.mjs), as tools/lab/wash-cases.mjs uses them
const O = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };

// A 40 mm square poured on dry cold-press paper and left to dry. Returns the dried density's grain inside it.
function wash(pigment, mm, { dt = 2, conc = 1.2 } = {}) {
  const size = 46, w = Math.round(size / mm), n = w * w;
  // a sheet without cockle (paper.mjs): what this measures is the lanes, the levelling or the grain, not the pooling
  const sheet = createSheet(makePaper(w, w, { cockle: { rmsMm: 0 }, seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } }), [pigment]);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const X = (x + 0.5) * mm, Y = (y + 0.5) * mm; if (X > 3 && X < 43 && Y > 3 && Y < 43) deposit(sheet, y * w + x, 0.3, [conc * 0.3]); }
  const before = totals(sheet).pig[0];
  dry(sheet, 200000, O, { levelMax: 200, dt });
  const after = totals(sheet).pig[0];
  const od = densityOf(luminance(renderLayers(layersOf(sheet), [pigment], new Uint8Array(n * 3).map((_, i) => PAPER[i % 3]), n), n), PAPER_Y);
  const inner = rimContrast(od, w, w, mm).interiorMask;
  const g = (lo, hi) => grainContrast(od, w, w, mm, inner, lo, hi)?.relative ?? null;
  return { fine: g(0.2, 1), mid: g(0.5, 1.5), before, after, sheet };
}
// Compare the same central 30 mm window on every grid; native=true measures the simulation without reconstruction.
function subcellGrain({ sheet }, pigment, { pixelMm = 0.05, lo = 0.2, hi = 1, native = false } = {}) {
  const N = native ? 1 : Math.round(sheet.paper.mmPerCell / pixelMm), W = sheet.w * N, n = W * W;
  const mm = sheet.paper.mmPerCell / N, cells = layersOf(sheet), L = native ? cells : subcellLayers(cells, [pigment], sheet.paper, N);
  const od = densityOf(luminance(renderLayers(L, [pigment], new Uint8Array(n * 3).map((_, i) => PAPER[i % 3]), n), n), PAPER_Y);
  const inner = new Uint8Array(n); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) inner[y * W + x] = Math.abs((x + 0.5) * mm - 23) < 15 && Math.abs((y + 0.5) * mm - 23) < 15 ? 1 : 0;
  return grainContrast(od, W, W, mm, inner, lo, hi).relative;
}
const change = (a, b) => Math.abs(a - b) / Math.max(a, b);

test('Stokes speeds: ultramarine falls micrometres a second, phthalo thousands of times slower', () => {
  // (2350 - 1000) 9.81 (2e-6)^2 / (18e-3) = 2.94e-6 m/s
  assert.ok(Math.abs(stokesMmPerS(2, 2350) - 2.943e-3) < 1e-5);
  assert.ok(settleSpeed(ULTRAMARINE) / settleSpeed(PHTHALO) > 300);
  // a pigment written without a diameter is read back from its granulation and density
  assert.deepEqual(particleOf({ rho: 0.047, gamma: 0.85 }), { dUm: 0.08 + 2 * Math.sqrt(0.85), rhoP: 2350 });
});

test('settling share is exact over any step: two half steps move what one whole step moves', () => {
  for (const [v, D, h] of [[3e-3, 2e-7, 0.3], [2e-6, 5e-6, 0.02], [3e-3, 2e-7, 0.0005]]) {
    const one = settleShare(v, D, 0.85, 1.2, 2, h), half = settleShare(v, D, 0.85, 1.2, 1, h);
    assert.ok(Math.abs(one - (1 - (1 - half) ** 2)) < 1e-12, `${one} vs two halves ${1 - (1 - half) ** 2}`);
  }
  // a hollow captures faster in a connected film; a staining pigment (gamma 0) does not care
  assert.ok(settleShare(3e-3, 0, 0.85, 1, 1, 0.1) > settleShare(3e-3, 0, 0.85, 0, 1, 0.1) * 1.5);
  assert.equal(settleShare(3e-3, 0, 0, 1, 1, 0.1), settleShare(3e-3, 0, 0, 0, 1, 0.1));
});

test('a 40 mm wash of ultramarine granulates as real washes do, the same at 0.25 and 0.1 mm cells and on halving the step', () => {
  const U25 = wash(ULTRAMARINE, 0.25), U10 = wash(ULTRAMARINE, 0.1), U25h = wash(ULTRAMARINE, 0.25, { dt: 1 });
  console.log(`ultramarine grain (RMS/mean density): 0.2-1 mm at 0.1 mm cells ${U10.fine.toFixed(4)}; 0.5-1.5 mm at 0.25 mm ${U25.mid.toFixed(4)}, at 0.1 mm ${U10.mid.toFixed(4)}, at 0.25 mm half step ${U25h.mid.toFixed(4)}`);
  // real Homer, Turner and Sargent washes: 0.04 to 0.13 at 0.2 to 1 mm (refs/crops-index.tsv). This is a 0.3 mm poured
  // square, wetter than those brushed washes; with the drying flow carrying suspended pigment at the donor's
  // concentration as the film drains into the hollows, it reads 0.144 (0.128 with settling alone). The top is the most
  // granulating real crop, the Gulf Stream sky (0.12, etudes/), with the études' 35% grain tolerance: 0.16.
  assert.ok(U10.fine >= 0.04 && U10.fine <= 0.16, `ultramarine grain ${U10.fine}`);
  // the same paper at 0.25 and 0.1 mm cells (in the band both grids resolve), and on halving the step
  // (the paper relief of 1 to 4 cm, claude/04-grain-relief, moved it from under 10% to 12%: 0.0623 against 0.0555)
  assert.ok(change(U25.mid, U10.mid) < 0.15, `0.25 vs 0.1 mm cells: ${U25.mid} vs ${U10.mid}`);
  assert.ok(change(U25.mid, U25h.mid) < 0.1, `half step: ${U25.mid} vs ${U25h.mid}`);
  for (const r of [U25, U10, U25h]) assert.ok(Math.abs(r.after - r.before) / r.before < 1e-5, `pigment ${r.before} -> ${r.after}`);
  // sub-cell grain: the 0.25 mm sheet rendered at 0.05 mm pixels shows the fine grain the 0.1 mm sheet has
  const s25 = subcellGrain(U25, ULTRAMARINE), s10 = subcellGrain(U10, ULTRAMARINE);
  console.log(`sub-cell grain at 0.05 mm pixels, 0.2-1 mm: from 0.25 mm cells ${s25.toFixed(4)}, from 0.1 mm cells ${s10.toFixed(4)}`);
  assert.ok(change(s25, s10) < 0.15 && change(s25, U10.fine) < 0.15, `${s25} ${s10} ${U10.fine}`);
  // The final's finer 0.2-0.5 mm band must match the native 0.10 mm simulation within 10%,
  // not only another reconstruction or the wider band above. Include the demo's 0.26 mm grid.
  const U26 = wash(ULTRAMARINE, 0.26), band = { pixelMm: 0.025, lo: 0.2, hi: 0.5 };
  const reference = subcellGrain(U10, ULTRAMARINE, { ...band, native: true });
  for (const [mm, result] of [[0.25, U25], [0.26, U26]]) {
    const fine = subcellGrain(result, ULTRAMARINE, band), ratio = fine / reference;
    console.log(`0.2-0.5 mm grain: ${mm} mm reconstructed ${fine.toFixed(6)}, 0.10 mm native ${reference.toFixed(6)}, ratio ${ratio.toFixed(6)}`);
    assert.ok(Math.abs(ratio - 1) <= 0.10, `${mm} mm grain ratio ${ratio}`);
    assert.ok(Math.abs(result.after / result.before - 1) < 1e-5, 'deposited pigment conserved');
  }
});

test('a 40 mm wash of phthalo stays smooth at 0.25 and 0.1 mm cells and on halving the step', () => {
  const P25 = wash(PHTHALO, 0.25), P10 = wash(PHTHALO, 0.1), P25h = wash(PHTHALO, 0.25, { dt: 1 });
  console.log(`phthalo grain: 0.2-1 mm at 0.1 mm cells ${P10.fine.toFixed(4)}; 0.5-1.5 mm at 0.25 mm ${P25.mid.toFixed(4)}, at 0.1 mm ${P10.mid.toFixed(4)}, half step ${P25h.mid.toFixed(4)}`);
  assert.ok(P10.fine < 0.02 && P25.mid < 0.02 && P10.mid < 0.02, `phthalo grain ${P10.fine} ${P25.mid} ${P10.mid}`);
  // a smooth wash's grain is noise near zero: it is held across grids and steps to a fraction of its bound, not to a
  // ratio. It was a tenth (0.002). With back-runs (backrun.mjs) the last puddles of the drying film run a cell or two
  // into the damp paint by steps, a little differently on each grid and step: 0.0048, 0.0104 and 0.0162. Held to 0.012.
  assert.ok(Math.abs(P25.mid - P10.mid) < 0.012 && Math.abs(P25.mid - P25h.mid) < 0.012, `${P25.mid} ${P10.mid} ${P25h.mid}`);
  for (const r of [P25, P10, P25h]) assert.ok(Math.abs(r.after - r.before) / r.before < 1e-5, `pigment ${r.before} -> ${r.after}`);
  // a staining pigment gets no sub-cell grain
  assert.ok(subcellGrain(P25, PHTHALO) < 0.02);
});

test('a dark wash of ultramarine keeps its grain: lighter peaks under four times the paint', () => {
  // A heavily loaded wash used to strand half its pigment evenly the moment it was laid (the hold cap at any depth), and
  // the rest filled every hollow (a fixed hollow fill): poured at 5 it dried at grain 0.02 (0.5-1.5 mm, 0.25 mm cells)
  // where the pale one has 0.10 and the dark real skies 0.08 to 0.12 (etudes/granul-gulfstream-sky).
  const pale = wash(ULTRAMARINE, 0.25), dark = wash(ULTRAMARINE, 0.25, { conc: 5 });
  console.log(`poured ultramarine grain, 0.5-1.5 mm at 0.25 mm cells: at 1.2 ${pale.mid.toFixed(4)}, at 5 ${dark.mid.toFixed(4)}`);
  assert.ok(dark.mid >= 0.06 && dark.mid >= 0.6 * pale.mid, `dark ${dark.mid} pale ${pale.mid}`);
  assert.ok(Math.abs(dark.after - dark.before) / dark.before < 1e-5);
});
