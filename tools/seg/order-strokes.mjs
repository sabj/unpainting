#!/usr/bin/env node
// Pipeline: inking, stage 3b. Orders a traced drawing's strokes the way a person draws them (src/paint/methods/stroke-order.mjs)
// and writes the line file again: lines that run on through a junction joined, each pulled its hand's way and numbered
// (`seq`, the drawing order), with its object, its part (outline, inner, texture, small) and its pass.
// The drawing hand keeps a file whose every line has a seq in that order (drawing-hand.mjs).
// usage: node tools/seg/order-strokes.mjs IN-lines.json OUT-stem --sheetmm 280 [--ink none|forms|full --masses mask.png] [--weight structure] [--order passes|growth] [--touch light|medium|firm] [--hatching none|sparse|drawn] [--budget N]
// --ink: how much is drawn inside the painted masses of --masses (stroke-order.mjs).
import fs from 'node:fs';
import sharp from 'sharp';
import { orderStrokes, orderStats, pathLength, structureWeight, growthWeight } from '../../src/paint/methods/stroke-order.mjs';

const [inFile, outStem, ...rest] = process.argv.slice(2);
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
const TOUCH = { light: [0.55, 0.7], medium: [0.8, 0.9], firm: [1, 1.1] }, touch = arg('--touch') ?? 'firm', hatching = arg('--hatching') ?? 'drawn';
if (!TOUCH[touch]) { console.error(`--touch: light, medium or firm, not ${touch}`); process.exit(2); }
// the drawing's own weight and width per line: a gap is bridged only between pieces drawn alike; dense streams are left
const ordered = orderStrokes(strokes, sheetMm, heightMm, { ink, masses, mode: arg('--order') ?? 'passes', hatching, budget: Number(arg('--budget') ?? 0),
  weights: doc.lines.map(l => l.weight ?? 1), widths: doc.lines.map(l => l.width), skip: doc.lines.map(l => !!l.dense) });
// the drawing's ordinary width: the length-weighted median of its lines (dense streams aside)
const mid = (() => { const W = doc.lines.filter(l => !l.dense).map((l, k) => [l.width, pathLength(l.points)]).sort((a, b) => a[0] - b[0]); const T = W.reduce((a, w) => a + w[1], 0); let c = 0; for (const [w, L] of W) { c += L; if (c >= T / 2) return w; } return 1; })();
// a stroke joined through junctions takes its parts' length-weighted width
const lines = ordered.map((r, seq) => {
  const P = r.parts.map(i => doc.lines[i]), Ls = r.parts.map(i => pathLength(strokes[i])), sum = Ls.reduce((a, b) => a + b, 0) || 1;
  const width = P.reduce((a, l, k) => a + l.width * Ls[k], 0) / sum, widthMm = P.every(l => l.widthMm != null) ? P.reduce((a, l, k) => a + l.widthMm * Ls[k], 0) / sum : undefined;
  // --weight structure: weight and width from the order (structure firm, detail light, near heavier), not the drawing
  const sw = r.phase ? growthWeight(r, P[0].weight ?? 1, { width, mid }) : arg('--weight') === 'structure' ? structureWeight(r, heightMm) : null;
  const [tw, tx] = TOUCH[touch], wt = (sw ? sw.weight : P[0].weight ?? 1) * tw;
  return { ...P[0], weight: +wt.toFixed(3), points: r.points.map(([x, y]) => [+(x / mm).toFixed(3), +(y / mm).toFixed(3)]),
    width: +(width * (sw?.widthScale ?? 1) * tx).toFixed(3), ...(widthMm != null ? { widthMm: +(widthMm * (sw?.widthScale ?? 1) * tx).toFixed(3) } : {}),
    length: +(pathLength(r.points) / mm).toFixed(2), seq, object: r.object, part: r.role, pass: r.pass, ...(r.phase ? { phase: r.phase } : {}), from: r.parts };
});
const stats = { traced: strokes.length, ink, touch, hatching, budget: Number(arg('--budget') ?? 0), order: arg('--order') ?? 'passes', masses: arg('--masses'), droppedInMasses: ordered.dropped, bridges: ordered.bridges, hatchStrokes: ordered.filter(r => r.role === 'hatch').length, ...orderStats(ordered, sheetMm, heightMm), passes: [1, 2, 3].map(p => ordered.filter(r => r.pass === p).length), objects: new Set(ordered.map(r => r.object)).size };
fs.writeFileSync(`${outStem}-lines.json`, JSON.stringify({ ...doc, source: `${doc.source}; ordered object by object as a person draws (order-strokes.mjs)`, stats: { ...doc.stats, order: stats }, lines }) + '\n');
console.log(JSON.stringify(stats));
