#!/usr/bin/env node
// Pipeline: inking, stage 3b. Orders a traced drawing's strokes the way a person draws them (src/paint/methods/stroke-order.mjs)
// and writes the line file again: lines that run on through a junction joined, each pulled its hand's way and numbered
// (`seq`, the drawing order), with its object, its part (outline, inner, texture, small) and its pass.
// The drawing hand keeps a file whose every line has a seq in that order (drawing-hand.mjs).
// usage: node tools/seg/order-strokes.mjs IN-lines.json OUT-stem --sheetmm 280
import fs from 'node:fs';
import { orderStrokes, orderStats, pathLength } from '../../src/paint/methods/stroke-order.mjs';

const [inFile, outStem, ...rest] = process.argv.slice(2);
const sheetMm = Number(rest[rest.indexOf('--sheetmm') + 1]);
if (!inFile || !outStem || !(sheetMm > 0)) { console.error('usage: order-strokes.mjs IN-lines.json OUT-stem --sheetmm MM'); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), mm = sheetMm / doc.image.w, heightMm = doc.image.h * mm;
const strokes = doc.lines.map(l => l.points.map(([x, y]) => [x * mm, y * mm]));
const ordered = orderStrokes(strokes, sheetMm, heightMm);
// a stroke joined through junctions takes its parts' length-weighted width
const lines = ordered.map((r, seq) => {
  const P = r.parts.map(i => doc.lines[i]), Ls = r.parts.map(i => pathLength(strokes[i])), sum = Ls.reduce((a, b) => a + b, 0) || 1;
  const width = P.reduce((a, l, k) => a + l.width * Ls[k], 0) / sum, widthMm = P.every(l => l.widthMm != null) ? P.reduce((a, l, k) => a + l.widthMm * Ls[k], 0) / sum : undefined;
  return { ...P[0], points: r.points.map(([x, y]) => [+(x / mm).toFixed(3), +(y / mm).toFixed(3)]), width: +width.toFixed(3), ...(widthMm != null ? { widthMm: +widthMm.toFixed(3) } : {}),
    length: +(pathLength(r.points) / mm).toFixed(2), seq, object: r.object, part: r.role, pass: r.pass, from: r.parts };
});
const stats = { traced: strokes.length, ...orderStats(ordered, sheetMm, heightMm), passes: [1, 2, 3].map(p => ordered.filter(r => r.pass === p).length), objects: new Set(ordered.map(r => r.object)).size };
fs.writeFileSync(`${outStem}-lines.json`, JSON.stringify({ ...doc, source: `${doc.source}; ordered object by object as a person draws (order-strokes.mjs)`, stats: { ...doc.stats, order: stats }, lines }) + '\n');
console.log(JSON.stringify(stats));
