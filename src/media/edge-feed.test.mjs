import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry, thickness, totals, coherent, DEFAULTS } from './sheet.mjs';
import { edgeProfile, edgeFeed } from './edge-feed.mjs';
import { renderLayers } from './km.mjs';
import { layersOf } from './sheet.mjs';
import { densityOf, luminance } from '../../tools/lab/wash-measure.mjs';
import { discProfile, discContrast } from '../../tools/lab/wash-acceptance.mjs';

const ultramarine = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const phthalo = { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 };
const paperAt = (n, mm) => makePaper(n, n, { seed: 9, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
// A registered physical relief for the flow convergence test. makePaper's
// per-grid min/max normalisation is owned by the paper branch; comparing two
// separately normalised realisations does not hold the physical problem fixed.
function registeredPaper(n, mm) {
  const paper = paperAt(n, mm), sinc = x => Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x;
  const modes = [[.08, 2 * Math.PI / 1.4, 2 * Math.PI / .9, 0], [.05, 2 * Math.PI / 2.3, -2 * Math.PI / 2.3, .8], [.025, 2 * Math.PI / .65, 0, 1.1]].map(([a, kx, ky, phase]) => [a * sinc(kx * mm / 2) * sinc(ky * mm / 2), kx, ky, phase]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x; let height = .5;
    for (const [a, kx, ky, phase] of modes) height += a * Math.cos(kx * (x + .5) * mm + ky * (y + .5) * mm + phase);
    paper.height[i] = paper.valley[i] = paper.tooth[i] = height;
    paper.capacity[i] = .3 + .1 * (height - .5); paper.fdx[i] = 1; paper.fdy[i] = 0; paper.grain[i] = .5;
  }
  return paper;
}
const O = { ...DEFAULTS, fixedBed: 1, granFill: 0, slideCap: 1 };
// A 30 mm poured disc in the middle of a 36 mm sheet.
function puddle(mm, pig, conc = 1.5, radius = 15, registered = false) {
  const centre = radius + 3, n = Math.round((2 * radius + 6) / mm), s = createSheet(registered ? registeredPaper(n, mm) : paperAt(n, mm), [pig]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - centre, (y + 0.5) * mm - centre) < radius) deposit(s, y * n + x, 0.3, [conc * 0.3]);
  return s;
}
// mean dried pigment in the outer mm of the puddle against its middle (more than 3 mm in), and the relative spread of
// the middle's cells
function rimAndGrain(s, mm) {
  const t = thickness(s)[0], n = s.w, centre = n * mm / 2, radius = centre - 3; let r = 0, rn = 0, c = 0, c2 = 0, cn = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = radius - Math.hypot((x + 0.5) * mm - centre, (y + 0.5) * mm - centre), v = t[y * n + x]; if (d > 0 && d < 1) { r += v; rn++; } else if (d > 3) { c += v; c2 += v * v; cn++; } }
  const m = c / cn; return { rim: r / rn / m, grain: Math.sqrt(Math.max(0, c2 / cn - m * m)) / m };
}

test('the edge profile averages to one over its band at any cell size', () => {
  for (const mm of [0.1, 0.25, 0.5]) { let s = 0; for (let k = 0; k * mm < 1 - 1e-9; k++) s += edgeProfile(k * mm, (k + 1) * mm, 1) * mm; assert.ok(Math.abs(s - 1) < 1e-9, `${mm}: ${s}`); }
});

test('30 mm disc on registered physical paper: rim 1.3–2, flat interior within 5%, positive outward flux, and dt/grid/mode convergence within 5%', () => {
  const contrasts = [];
  for (const [mm, opts] of [[.25, { levelMax: 200 }], [.25, { levelMax: 200, dt: 14, analyticTail: true }], [.1, { levelMax: 200 }], [.25, { levelMax: 200, dt: 1 }]]) {
    const s = puddle(mm, ultramarine, 1.5, 15, true), initial = totals(s); dry(s, 200000, O, opts);
    const base = new Uint8Array(s.n * 3); for (let i = 0; i < s.n; i++) base.set([246, 245, 239], i * 3);
    const od = densityOf(luminance(renderLayers(layersOf(s), s.pigments, base, s.n), s.n), luminance([246, 245, 239], 1)[0]);
    const { contrast } = discContrast(od, s.w, s.h, mm), { flatness } = discProfile(od, s.w, s.h, mm);
    assert.ok(contrast >= 1.3 && contrast <= 2, `${mm}, ${JSON.stringify(opts)}: rim ${contrast}`);
    assert.ok(flatness <= .05, `${mm}: interior profile deviation ${flatness}`);
    assert.ok(s.outwardPigmentFlux > 0);
    const final = totals(s);
    assert.ok(Math.abs(final.water + s.evaporated - initial.water) / initial.water < 1e-5);
    assert.ok(Math.abs(final.pig[0] - initial.pig[0]) / initial.pig[0] < 1e-5);
    contrasts.push(contrast);
  }
  // Halve time and cell size independently, against the same reference;
  // comparing their two perturbed results would change both variables.
  for (const [name, i] of [['mode', 1], ['grid', 2], ['time step', 3]]) assert.ok(Math.abs(contrasts[i] / contrasts[0] - 1) < .05, `${name}: ${JSON.stringify(contrasts)}`);
});

test('a granulating pigment grains in the paper and a staining one stays smooth', () => {
  const g = puddle(0.25, ultramarine, 1.5, 10), p = puddle(0.25, phthalo, 1.2, 10); dry(g, 200000, O, { levelMax: 200 }); dry(p, 200000, O, { levelMax: 200 });
  const a = rimAndGrain(g, 0.25).grain, b = rimAndGrain(p, 0.25).grain;
  assert.ok(a > 0.05 && a > 2 * b, `granulating ${a.toFixed(3)}, staining ${b.toFixed(3)}`);
});

test('water and pigment are conserved to 1e-5 relative through the drying, with the edge evaporation counted', () => {
  // no pores (absorb, capRate 0): damp pores drop their last trace when they dry, a sink of their own
  const s = puddle(0.25, ultramarine, 1.5, 10), a = totals(s), o = { ...O, evap: 0, paperDry: 0, absorb: 0, capRate: 0, dt: 2 };
  s.edgeEvaporated = 0;
  for (let k = 0; k < 300; k++) step(s, o);
  const b = totals(s);
  assert.ok(s.edgeEvaporated > 0.05 * a.water, 'the edge dried');
  assert.ok(Math.abs(b.water + s.edgeEvaporated - a.water) < 1e-5 * a.water, `water ${b.water} + ${s.edgeEvaporated} against ${a.water}`);
  assert.ok(Math.abs(b.pig[0] - a.pig[0]) < 1e-5 * a.pig[0], `pigment ${b.pig[0]} against ${a.pig[0]}`);
});

test('the three wash sheets with flow ON agree between GPU and CPU (requires the pressure-flow port)', async t => {
  const { attachGpu } = await import('./gpu/link.mjs');
  const o = O, mm = 0.5;
  const cases = {
    puddle: s => put(s, () => { const n = s.w; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13) < 10) deposit(s, y * n + x, 0.3, [0.45]); }),
    square: s => { const n = s.w; for (let k = 0; k < 5; k++) { put(s, () => { for (let y = Math.round((3 + 4 * k) / mm); y < Math.round((7 + 4 * k) / mm); y++) for (let x = Math.round(3 / mm); x < Math.round(23 / mm); x++) deposit(s, y * n + x, 0.12, [0.07]); }); for (let q = 0; q < 20; q++) step(s, o); } },
    bloom: s => { const n = s.w; put(s, () => { for (let y = Math.round(3 / mm); y < Math.round(23 / mm); y++) for (let x = Math.round(3 / mm); x < Math.round(23 / mm); x++) deposit(s, y * n + x, 0.2, [0.05]); }); for (let q = 0; q < 600; q++) step(s, o); put(s, () => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13) < 4) deposit(s, y * n + x, 0.25, [0.01]); }); },
  };
  // laid straight into the arrays, so a GPU sheet is brought down first and told after
  const put = (s, f) => { if (s._gpu) { coherent(s); f(); s._gpu.cpuWroteAll(); } else f(); };
  for (const [name, lay] of Object.entries(cases)) {
    const cpu = createSheet(paperAt(52, mm), [ultramarine]), gpu = createSheet(paperAt(52, mm), [ultramarine]);
    const info = attachGpu(gpu, o, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
    try {
      for (const s of [cpu, gpu]) { lay(s); dry(s, 200000, o, { levelMax: 200 }); }
      const a = thickness(cpu)[0], b = thickness(gpu)[0]; let peak = 0, worst = 0, sum = 0;
      for (let i = 0; i < a.length; i++) { peak = Math.max(peak, a[i]); worst = Math.max(worst, Math.abs(a[i] - b[i])); sum += Math.abs(a[i] - b[i]); }
      assert.ok(worst < 0.02 * peak && sum / a.length < 2e-3 * peak, `${name}: worst ${worst} mean ${sum / a.length} against peak ${peak}`);
    } finally { gpu._gpu?.close?.(); }
  }
});

test('a cell reaching past the edge band counts only its part inside it', () => {
  let s = 0; for (let k = 0; k < 4; k++) s += edgeProfile(k * 0.3, (k + 1) * 0.3, 1) * 0.3;
  assert.ok(Math.abs(s - 1) < 1e-9, `cells of 0.3 mm over a 1 mm band: ${s}`);
});

test('GPU on refuses edge flow explicitly until both WGSL drying paths implement the pressure solve', async () => {
  const { attachGpu } = await import('./gpu/link.mjs');
  const s = puddle(.5, ultramarine);
  assert.throws(() => attachGpu(s, O, { mode: 'on', log: () => {} }), /no pinned-edge feed/);
});

test('unmet evaporation remains a demand for the next subcycle, rather than disappearing at the donor cap', () => {
  const s = puddle(.5, ultramarine);
  const ev = edgeFeed(s, { ...O, edgeEvap: .02, dt: 200 }, [0, 0, s.w - 1, s.h - 1], .5);
  assert.ok(s.edgeDemandPending > 0);
  assert.ok(Math.abs(ev + s.edgeDemandPending - s.edgeDemandRequested) < 1e-5 * s.edgeDemandRequested);
  assert.ok(s.W.every(v => v >= 0));
});

test('the faster edge feed moves the same water and pigment as the first version, to the bit', async () => {
  const { edgeFeedReference } = await import('./edge-feed-reference.mjs');
  const mm = 0.5, n = 40;
  // two identical sheets; marks laid, boxes moved and masking fluid put on and off between the calls, as a painting does
  const make = () => { const s = createSheet(paperAt(n, mm), [ultramarine, phthalo]); return s; };
  const A = make(), B = make(), o = { ...O, edgeEvap: 0.004, dt: 0.1 };
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const same = (label) => {
    for (const k of ['W', 'M', 'edgePending']) for (let i = 0; i < A.n; i++) assert.ok(Object.is(A[k][i], B[k][i]), `${label}: ${k}[${i}] ${A[k][i]} vs ${B[k][i]}`);
    for (let k = 0; k < A.K; k++) for (let i = 0; i < A.n; i++) assert.ok(Object.is(A.G[k][i], B.G[k][i]), `${label}: G${k}[${i}]`);
    for (const k of ['outwardPigmentFlux', 'edgeDemandPending', 'edgeDemandRequested']) assert.ok(Object.is(A[k], B[k]), `${label}: ${k} ${A[k]} vs ${B[k]}`);
  };
  for (let call = 0; call < 60; call++) {
    // a dab of paint somewhere every few calls: the footprint grows, or stays and the cached solve is reused
    if (call % 4 === 0) { const cx = 4 + rnd() * 32, cy = 4 + rnd() * 32, r = 1 + rnd() * 4, g = [rnd() * 0.3, rnd() * 0.1]; for (const s of [A, B]) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - cx, y - cy) < r) deposit(s, y * n + x, 0.15, g); }
    if (call === 30) for (const s of [A, B]) { s.resist = new Uint8Array(s.n); for (let i = 0; i < 40; i++) s.resist[300 + i] = 1; }
    if (call === 40) for (const s of [A, B]) s.resist = null;
    const half = call % 3 === 2, boxes = half ? [[0, 0, n - 1, 19], [0, 20, n - 1, n - 1]] : [[0, 0, n - 1, n - 1]];
    for (const box of boxes) { const a = edgeFeed(A, o, box, mm), b = edgeFeedReference(B, o, box, mm); assert.ok(Object.is(a, b), `call ${call}: evaporated ${a} vs ${b}`); }
    same(`call ${call}`);
  }
});
