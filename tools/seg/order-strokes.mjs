#!/usr/bin/env node
// Pipeline: inking, stage 3b. Orders a traced drawing's strokes the way a person draws them (src/paint/methods/stroke-order.mjs)
// and writes the line file again with each line pulled its hand's way and numbered: `seq` (drawing order) and `level`.
// The drawing hand keeps a file whose every line has a seq in that order (drawing-hand.mjs).
// usage: node tools/seg/order-strokes.mjs IN-lines.json OUT-stem --sheetmm 280
import fs from 'node:fs';
import { orderStrokes, handTravel, pathLength } from '../../src/paint/methods/stroke-order.mjs';

const [inFile, outStem, ...rest] = process.argv.slice(2);
const sheetMm = Number(rest[rest.indexOf('--sheetmm') + 1]);
if (!inFile || !outStem || !(sheetMm > 0)) { console.error('usage: order-strokes.mjs IN-lines.json OUT-stem --sheetmm MM'); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), mm = sheetMm / doc.image.w;
const strokes = doc.lines.map(l => l.points.map(([x, y]) => [x * mm, y * mm]));
const ordered = orderStrokes(strokes, sheetMm);
const lines = ordered.map((r, seq) => ({ ...doc.lines[r.index], points: r.points.map(([x, y]) => [+(x / mm).toFixed(3), +(y / mm).toFixed(3)]), seq, level: r.level }));
const travel = handTravel(ordered).sort((a, b) => a - b), n = ordered.length, fifth = Math.max(1, Math.floor(n / 5));
const meanLen = a => a.reduce((s, r) => s + pathLength(r.points), 0) / a.length;
const stats = { strokes: n, levels: [1, 2, 3].map(l => ordered.filter(r => r.level === l).length),
  medianTravelMm: +travel[travel.length >> 1].toFixed(2), jumpsOver50mm: +(travel.filter(t => t > 50).length / travel.length).toFixed(4),
  firstOverLastFifthLength: +(meanLen(ordered.slice(0, fifth)) / meanLen(ordered.slice(-fifth))).toFixed(2) };
fs.writeFileSync(`${outStem}-lines.json`, JSON.stringify({ ...doc, source: `${doc.source}; ordered as a person draws (order-strokes.mjs)`, stats: { ...doc.stats, order: stats }, lines }) + '\n');
console.log(JSON.stringify(stats));
