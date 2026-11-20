#!/usr/bin/env node
// The mark library's test renders (src/paint/marks): every kind at three sizes and two loads, laid by the section brush
// on the painter's paper, flowed and dried by the sheet on the GPU, one sheet per kind. Writes, for each kind, the dried
// sheet (<kind>.png) and <kind>.json: the cell size, each variant's box in mm and its strokes (the stroke's own data:
// path, pressure, speed), for the study's sheet builder to lay out beside the real marks and measure.
//   node tools/lab/marks-sheet.mjs --out <dir> [--mm 0.1] [--kinds taper,leaf] [--backend gpu|cpu]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { attachGpu } from '../../src/media/gpu/link.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { physicsFields } from '../../src/media/pigment-physical.mjs';
import { MARK_KINDS, makeMark, strokeData } from '../../src/paint/marks/index.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('out', 'marks-ours')), MM0 = Number(arg('mm', '0.1')), BACKEND = arg('backend', 'gpu');
const KINDS = arg('kinds', Object.keys(MARK_KINDS).join(',')).split(',');
const O = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const pigments = ['sepia', 'lampblack'].map(k => { const paint = BOX.find(p => p.key === k); return { ...boxPigment(paint), ...physicsFields(paint.physics), key: k }; });
const CONC = [6, 3], PAPER_RGB = [246, 245, 239];
const paperOptions = mm => ({ seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });

// each kind's size 1 (length and width in mm: what the real marks of FINDINGS.md measure), and the sizes and loads shown
const BASE = {
  sweep: [40, 8], taper: [24, 4], reverse: [20, 3.5], leaf: [16, 3], comma: [12, 3.2], teardrop: [14, 3], dot: [2.5, 2.5], touch: [8, 2.2],
  line: [40, 0.4], edge: [30, 0.6], wedge: [5, 8], swell: [40, 4], ribbon: [30, 8], contour: [30, 4], hook: [20, 3.5], bar: [24, 4],
  hatch: [10, 2.5], scumble: [14, 5], drag: [30, 8], 'flying-white': [40, 5], grass: [20, 2.5], 'leaf-stem': [20, 4], branch: [36, 4], 's-stroke': [16, 4.5], ring: [30, 4], 'leaf-group': [16, 3.5],
};
const SIZES = [0.5, 1, 2], LOADS = [1, 0.55];

// the painter's wash brush (tools/plate/paint.mjs) as a section brush, its radius the plan stroke's, with the 'wet on dry'
// technique's tooth reach (tools/plate/sheet.mjs STOCK_TECHNIQUES)
function brushFor(st, MM) {
  const r = st.radiusMm / MM, fixed = st.held === 'fixed';
  return createBrush({ model: 'section', flat: !!st.flat, ...(st.angle != null ? { bladeAngle: fixed ? st.angle - 90 : st.angle } : {}), radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, seed: 41 });
}
// a stroke on the hand's clock: the sheet steps once for each O.dt of the time the hand takes
function lay(sheet, st, load, MM) {
  const b = brushFor(st, MM); dip(b, { water: Math.min(1, (st.water ?? 1) * load), conc: CONC.map(c => c * (st.charge ?? 1)) });
  const P = st.points, path = P.map(q => ({ x: q[0] / MM, y: q[1] / MM, p: q[2], v: q[3], r: st.radiusMm / MM * (q[4] ?? 1) }));
  const vMean = P.reduce((a, q) => a + q[3], 0) / P.length, perStep = 0.7 * MM / vMean; let t = 0;
  stroke(b, sheet, path, { upright: st.held === 'fixed', between: () => { for (t += perStep; t >= O.dt; t -= O.dt) step(sheet, O); } });
}

fs.mkdirSync(OUT, { recursive: true });
for (const kind of KINDS) {
  const t0 = Date.now(), [L, W] = BASE[kind], variants = [];
  // each size on its own sheet, the two loads one above the other; the cell --mm, coarser for a large mark so its
  // sheet stays under 2 million cells and a wide brush is no more than 50 cells across (0.05 mm steps)
  for (const s of SIZES) {
    const span = Math.max(L, W) * s * 1.25 + 5, cw = span, ch = 2 * span;
    // a dry mark keeps the fine cell whatever its size: its look is the paper's tooth it catches
    const dryKind = makeMark(kind, { x: 0, y: 0, length: L, width: W, seed: 7 }).some(st => (st.water ?? 1) < 0.6);
    // size 1 (the one shown large beside the real mark) at half the cell, so its edge is not drawn in 0.1 mm steps
    const m0 = s === 1 ? MM0 / 2 : MM0;
    const MM = dryKind ? m0 : Math.max(m0, Math.ceil(Math.max(Math.sqrt(cw * ch / 3e6), W * s / 50) / 0.025) * 0.025);
    const w = Math.round(cw / MM), h = Math.round(ch / MM), paper = makePaper(w, h, paperOptions(MM)), sheet = createSheet(paper, pigments);
    if (BACKEND === 'gpu') { const g = attachGpu(sheet, O, { mode: 'on', log: () => {} }); if (g.backend !== 'gpu') throw new Error('marks-sheet: no GPU'); }
    const file = `${kind}-${s}.png`;
    LOADS.forEach((load, li) => {
      const box = [0, li * ch / 2, cw, ch / 2];
      const strokes = makeMark(kind, { x: cw / 2, y: box[1] + ch / 4, length: L * s, width: W * s, angle: kind === 'grass' ? -Math.PI / 2 : 0, seed: 7, load });
      for (const st of strokes) lay(sheet, st, 1, MM);
      variants.push({ size: s, load, file, mmPerPx: MM, box, strokes, data: strokes.map(st => { const d = strokeData(st); return { peaks: d.peaks, wideToNarrow: d.wideToNarrow, turningDeg: d.turningDeg, length: d.length }; }) });
    });
    dry(sheet, 30000, O, { levelMax: 140, dt: 14 });
    const n = w * h, base = Buffer.alloc(n * 3); for (let i = 0; i < n; i++) { const tt = 0.96 + 0.04 * paper.height[i]; for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.round(PAPER_RGB[c] * tt); }
    const rgb = Buffer.from(renderLayers(layersOf(sheet), pigments, base, n));
    sheet._gpu?.close?.();
    await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(OUT, file));
  }
  fs.writeFileSync(path.join(OUT, `${kind}.json`), JSON.stringify({ kind, label: MARK_KINDS[kind], backend: BACKEND, base: [L, W], variants }));
  console.log(`${kind}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
process.exit(0);
