#!/usr/bin/env node
// The wash test cases (sheet physics, not the brush): a poured puddle, a square laid in five sweeps and a bloom, dried in
// the painter's exact (full) and default fast modes at two cell sizes. Imports only the media API that every version
// since v0.1.1 has, so the same cases run on an old tag's checkout for comparison.
//   node tools/lab/wash-cases.mjs <repo root> <out dir> [--cells 0.25,0.1] [--modes full,fast] [--cases puddleU,...] [--physics k=v,...] [--brush row|section]
// Writes <case>-<mode>-<mm>.rgb (raw RGB of the dried sheet), .mass.f32 (each pigment's dried mass a cell, one after
// the other), paper-<mm>.f32 (the paper's height) and cases.json.
import fs from 'node:fs';
import path from 'node:path';
import { waitForDamp } from './wash-state.mjs';

const [root, outDir, ...rest] = process.argv.slice(2);
if (!root || !outDir) throw new Error('usage: wash-cases.mjs <repo root> <out dir> [options]');
const arg = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
const M = f => import(path.join(path.resolve(root), 'src/media', f));
const { makePaper } = await M('paper.mjs'), S = await M('sheet.mjs'), B = await M('brush.mjs'), { renderLayers } = await M('km.mjs');
let attachGpu = null; if (arg('backend', 'cpu') === 'gpu') ({ attachGpu } = await M('gpu/link.mjs'));
const threads = Number(arg('threads', '1'));
if (threads > 1) await S.setThreads(threads);
fs.mkdirSync(outDir, { recursive: true });

// French ultramarine (granulating, lifts) and phthalo blue (staining, smooth), as src/crop/box.mjs gives them.
const PIGMENTS = [
  { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 },
  { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 },
];
const PAPER_RGB = [246, 245, 239];
// The painter's sheet constants (tools/plate/sheet.mjs `O`), plus any --physics overrides.
const PHYS = Object.fromEntries((arg('physics', '') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1, ...JSON.parse(arg('painter', '{}')), ...PHYS };
// The painter's ordinary dry (tools/plate/paint.mjs) in each mode (tools/painter/native-paint-mode.mjs).
const DRY = { full: { levelMax: 200 }, fast: { levelMax: 200, dt: 14, analyticTail: true } };
const paperOf = (w, h, mm) => makePaper(w, h, { seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const disc = (sheet, mm, cxMm, cyMm, rMm, water, conc) => {
  const { w, h } = sheet;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + 0.5) * mm - cxMm, (y + 0.5) * mm - cyMm) < rMm) S.deposit(sheet, y * w + x, water, conc.map(c => c * water));
};
const flowFor = (sheet, time) => { const n = Math.round(time / O.dt); for (let i = 0; i < n; i++) S.step(sheet, O); };
// a 12 mm flat as the painter's wash flat (tools/plate/paint.mjs), sized in mm
const flat = (mm, seed) => { const r = 6 / mm; return B.createBrush({ model: arg('brush', 'section'), flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed }); };
const lay = (sheet, mm, brush, pts, opts) => { let n = 0; B.stroke(brush, sheet, pts.map(q => ({ ...q, x: q.x / mm, y: q.y / mm })), { ...opts, between: () => { if (++n % 8 === 0) S.step(sheet, O); } }); };

// Every case is on a 50 x 50 mm sheet.
const SIZE = 50;
const CASES = {
  // (a) a 30 mm puddle poured on dry paper and left to dry: granulating ultramarine and staining phthalo
  puddleU: (sheet, mm) => disc(sheet, mm, 25, 25, 15, 0.3, [1.5, 0]),
  puddleP: (sheet, mm) => disc(sheet, mm, 25, 25, 15, 0.3, [0, 1.2]),
  // (b) a 40 mm square laid in five sweeps of a loaded flat, each picking up the last one's bead
  sweeps: (sheet, mm) => {
    for (let k = 0; k < 5; k++) { const y = 9 + k * 8, b = flat(mm, 60 + k); B.dip(b, { water: 1, conc: [0.6, 0] }); const [a, z] = k % 2 ? [45, 5] : [5, 45]; lay(sheet, mm, b, [{ x: a, y, p: 0.9 }, { x: z, y, p: 0.9 }], { upright: 'sweep' }); }
  },
  // a graded wash: a 40 mm square poured with ultramarine falling evenly from strong at the top to nearly clear at the bottom
  graded: (sheet, mm) => {
    const { w } = sheet;
    for (let y = Math.round(5 / mm); y < Math.round(45 / mm); y++) { const c = 1.5 * (1 - ((y + 0.5) * mm - 5) / 40) + 0.05; for (let x = Math.round(5 / mm); x < Math.round(45 / mm); x++) S.deposit(sheet, y * w + x, 0.3, [0.3 * c, 0]); }
  },
  // (c) a bloom: a 40 mm wash left until damp (its shine gone), then a 12 mm drop of nearly clean water into it
  bloom: (sheet, mm) => {
    const { w } = sheet;
    for (let y = Math.round(5 / mm); y < Math.round(45 / mm); y++) for (let x = Math.round(5 / mm); x < Math.round(45 / mm); x++) S.deposit(sheet, y * w + x, 0.2, [0.25, 0]);
    let preparation = null;
    if (arg('bloomwait', 'auto') === 'auto') {
      const indices = []; for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) if (Math.hypot((x + .5) * mm - 25, (y + .5) * mm - 25) < 6) indices.push(y * w + x);
      preparation = waitForDamp(sheet, indices, O, S.step);
    } else flowFor(sheet, Number(arg('bloomwait', 60)));
    disc(sheet, mm, 25, 25, 6, 0.25, [0.05, 0]);
    return preparation;
  },
  // a nearly dry flat dragged once, light and fast, over dry paper (dry brush: paint caught on the grain's peaks)
  drag: (sheet, mm) => {
    for (const [y, p] of [[15, 0.35], [32, 0.6]]) { const b = flat(mm, 70 + y); B.dip(b, { water: 0.18, conc: [1.5, 0] }); lay(sheet, mm, b, [{ x: 5, y, p }, { x: 45, y: y + 1, p }], { upright: 'sweep', speed: 250 }); }
  },
};
const cells = arg('cells', '0.25,0.1').split(',').map(Number), modes = arg('modes', 'full,fast').split(','), only = arg('cases', Object.keys(CASES).join(',')).split(',');
const info = { root: path.resolve(root), O, size: SIZE, pigments: PIGMENTS, runs: [] };
for (const mm of cells) {
  const w = Math.round(SIZE / mm), h = w;
  const paper = paperOf(w, h, mm);
  fs.writeFileSync(path.join(outDir, `paper-${mm}.f32`), Buffer.from(Float32Array.from(paper.height).buffer));
  for (const name of only) for (const mode of modes) {
    const t0 = performance.now(), sheet = S.createSheet(paperOf(w, h, mm), PIGMENTS);
    if (attachGpu) { const g = attachGpu(sheet, O, { mode: 'on', log: () => {} }); if (g.backend !== 'gpu') throw new Error('wash-cases: --backend gpu but no GPU'); }
    const preparation = CASES[name](sheet, mm), evaporated0 = sheet.evaporated ?? 0;
    const tot0 = S.totals ? S.totals(sheet) : null;
    const steps = S.dry(sheet, 200000, O, DRY[mode]);
    const n = w * h, base = new Uint8Array(n * 3); for (let i = 0; i < n; i++) base.set(PAPER_RGB, i * 3);
    const rgb = renderLayers(S.layersOf(sheet), PIGMENTS, base, n);
    const file = `${name}-${mode}-${mm}.rgb`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(rgb));
    // each pigment's dried mass a cell (a single wash dries into one layer), for renders finer than the sheet
    const mass = PIGMENTS.map(() => new Float32Array(n)); for (const L of S.layersOf(sheet)) L.forEach((a, k) => { for (let i = 0; i < n; i++) mass[k][i] += a[i]; });
    fs.writeFileSync(path.join(outDir, file.replace(/\.rgb$/, '.mass.f32')), Buffer.concat(mass.map(a => Buffer.from(a.buffer))));
    const run = { name, mode, mm, w, h, file, steps, seconds: +((performance.now() - t0) / 1000).toFixed(2), initialTotals: tot0, preparation: preparation ?? null, evaporated: sheet.evaporated == null ? null : sheet.evaporated - evaporated0, outwardPigmentFlux: sheet.outwardPigmentFlux ?? null, totals: tot0 && S.totals(sheet) };
    info.runs.push(run); sheet._gpu?.close?.();
    console.log(`${name} ${mode} ${mm} mm: ${steps} steps, ${run.seconds} s`);
  }
}
fs.writeFileSync(path.join(outDir, 'cases.json'), JSON.stringify(info, null, 1));
process.exit(0);
