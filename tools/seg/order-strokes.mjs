#!/usr/bin/env node
// Pipeline: inking, stage 3b. Orders a traced drawing's strokes the way a person draws them (src/paint/methods/stroke-order.mjs)
// and writes the line file again: lines that run on through a junction joined, each pulled its hand's way and numbered
// (`seq`, the drawing order), with its object, its part (outline, inner, texture, small) and its pass.
// The drawing hand keeps a file whose every line has a seq in that order (drawing-hand.mjs).
// usage: node tools/seg/order-strokes.mjs IN-lines.json OUT-stem --sheetmm 280 [--ink none|forms|full --masses mask.png] [--weight structure] [--order passes|growth] [--touch light|medium|firm] [--hatching none|sparse|drawn] [--threshold C]
// --ink: how much is drawn inside the painted masses of --masses (stroke-order.mjs).
// --threshold C: strokes adding less than C mm2 of ink (structure-weighted, stroke-contribution.mjs) are not laid; each object
// keeps its form. The default is the noise floor (NOISE_FLOOR: specks and slivers); 0 lays everything.
// There is no stroke count: --budget was removed.
import fs from 'node:fs';
import sharp from 'sharp';
import { orderStrokes, orderStats, pathLength, structureWeight, growthWeight } from '../../src/paint/methods/stroke-order.mjs';
import { strokesFor } from '../../src/paint/methods/stroke-contribution.mjs';

// the contribution (mm2 of ink added, structure-weighted) under which a mark is a crumb, not a pen stroke: about a 0.4 by
// 0.3 mm speck, or a sliver over ink already laid. Below it marks recur less between two drawings of one subject (Yale seeds
// 42 and 43: 25 to 31% have no counterpart against 17 to 22% above it); no level is mostly jitter (replay/r6/recur.py)
const NOISE_FLOOR = 0.2;

const [inFile, outStem, ...rest] = process.argv.slice(2);
if (rest.includes('--budget')) { console.error('--budget was removed in 0.4: no stroke count limits the ink; what is laid is set by --threshold (stroke contribution, default the noise floor)'); process.exit(2); }
const sheetMm = Number(rest[rest.indexOf('--sheetmm') + 1]);
if (!inFile || !outStem || !(sheetMm > 0)) { console.error('usage: order-strokes.mjs IN-lines.json OUT-stem --sheetmm MM'); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), mm = sheetMm / doc.image.w, heightMm = doc.image.h * mm;
const strokes = doc.lines.map(l => l.points.map(([x, y]) => [x * mm, y * mm]));
const arg = k => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : null);
const ink = arg('--ink') ?? 'full';
// --masses mask.png: the painted masses (white), at the drawing's size (tools/seg/mass-mask.py)
let masses = null;
if (arg('--masses')) {
  const { data, info } = await sharp(arg('--masses')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sx = info.width / sheetMm, sy = info.height / heightMm;
  masses = (x, y) => { const i = Math.floor(x * sx), j = Math.floor(y * sy); return i >= 0 && j >= 0 && i < info.width && j < info.height && data[j * info.width + i] > 127; };
}
// TOUCH (light | medium | firm) scales every line's width and pressure: light is thin and well short of solid black
// (light lowers the weight and width a little; it never flattens them: each line keeps its own weight relative to the rest)
const TOUCH = { light: [0.85, 0.85], medium: [0.93, 0.93], firm: [1, 1] }, touch = arg('--touch') ?? 'firm', hatching = arg('--hatching') ?? 'drawn';
if (!TOUCH[touch]) { console.error(`--touch: light, medium or firm, not ${touch}`); process.exit(2); }
// the drawing's own weight and width per line: a gap is bridged only between pieces drawn alike; dense streams are left
const threshold = Number(arg('--threshold') ?? NOISE_FLOOR);
const ordered = orderStrokes(strokes, sheetMm, heightMm, { ink, masses, mode: arg('--order') ?? 'passes', hatching, threshold, contributions: true,
  weights: doc.lines.map(l => l.weight ?? 1), widths: doc.lines.map(l => l.width), skip: doc.lines.map(l => !!(l.dense || l.fill)), fills: doc.lines.map(l => !!l.fill),
  widthsMm: doc.lines.map(l => l.width * mm), pointWidthsMm: doc.lines.map(l => (Array.isArray(l.widths) && l.widths.length === l.points.length ? l.widths.map(v => v * mm) : undefined)) });
// a joined stroke's width along it: at each point the width of the nearest point of its parts (per point where the drawing
// swells and thins, else the part's one width)
function widthsAlong(points, parts) {
  if (!parts.some(i => doc.lines[i].widths)) return null;
  const src = parts.flatMap(i => { const l = doc.lines[i]; return l.points.map(([x, y], k) => [x * mm, y * mm, l.widths?.[k] ?? l.width]); });
  return points.map(([x, y]) => { let b = Infinity, w = 0; for (const q of src) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < b) { b = d; w = q[2]; } } return w; });
}
// the drawing's ordinary width: the length-weighted median of its lines (dense streams aside)
const mid = (() => { const W = doc.lines.filter(l => !l.dense).map((l, k) => [l.width, pathLength(l.points)]).sort((a, b) => a[0] - b[0]); const T = W.reduce((a, w) => a + w[1], 0); let c = 0; for (const [w, L] of W) { c += L; if (c >= T / 2) return w; } return 1; })();
// a stroke joined through junctions takes its parts' length-weighted width
const lines = ordered.map((r, seq) => {
  const P = r.parts.map(i => doc.lines[i]), Ls = r.parts.map(i => pathLength(strokes[i])), sum = Ls.reduce((a, b) => a + b, 0) || 1;
  const width = P.reduce((a, l, k) => a + l.width * Ls[k], 0) / sum, widthMm = P.every(l => l.widthMm != null) ? P.reduce((a, l, k) => a + l.widthMm * Ls[k], 0) / sum : undefined;
  // --weight structure: weight and width from the order (structure firm, detail light, near heavier), not the drawing
  // a stream laid along dense ink (fur, hair) keeps the width its tone set (trace-drawing.py); only drawn lines build
  const sw = r.phase ? growthWeight(r, P[0].weight ?? 1, P[0].dense ? {} : { width, mid }) : arg('--weight') === 'structure' ? structureWeight(r, heightMm) : null;
  const [tw, tx] = TOUCH[touch], wt = (sw ? sw.weight : P[0].weight ?? 1) * tw;
  const ws = widthsAlong(r.points, r.parts), ks = (sw?.widthScale ?? 1) * tx;
  const { widths: _w, ...base } = P[0];
  return { ...base, weight: +wt.toFixed(3), points: r.points.map(([x, y]) => [+(x / mm).toFixed(3), +(y / mm).toFixed(3)]), ...(ws ? { widths: ws.map(v => +(v * ks).toFixed(3)) } : {}),
    width: +(width * (sw?.widthScale ?? 1) * tx).toFixed(3), ...(widthMm != null ? { widthMm: +(widthMm * (sw?.widthScale ?? 1) * tx).toFixed(3) } : {}),
    length: +(pathLength(r.points) / mm).toFixed(2), seq, object: r.object, part: r.role, pass: r.pass, ...(r.phase ? { phase: r.phase } : {}), ...(r.unit != null ? { unit: r.unit } : {}), ...(r.contribution != null ? { contribution: +r.contribution.toExponential(3) } : {}), from: r.parts };
});
const cv = ordered.contribution, curve = cv ? { strokesFor: strokesFor(Array.from(cv.curve)), candidates: cv.curve.length, points: Array.from({ length: 41 }, (_, k) => { const n = Math.round(k / 40 * (cv.curve.length - 1)); return [n + 1, +cv.curve[n].toFixed(4)]; }) } : null;
const stats = { traced: strokes.length, ink, touch, hatching, threshold, belowThreshold: ordered.belowThreshold ?? 0, curve, order: arg('--order') ?? 'passes', masses: arg('--masses'), droppedInMasses: ordered.dropped, bridges: ordered.bridges, hatchStrokes: ordered.filter(r => r.role === 'hatch').length, ...orderStats(ordered, sheetMm, heightMm), passes: [1, 2, 3].map(p => ordered.filter(r => r.pass === p).length), objects: new Set(ordered.map(r => r.object)).size };
fs.writeFileSync(`${outStem}-lines.json`, JSON.stringify({ ...doc, source: `${doc.source}; ordered object by object as a person draws (order-strokes.mjs)`, stats: { ...doc.stats, order: stats }, lines }) + '\n');
console.log(JSON.stringify(stats));
