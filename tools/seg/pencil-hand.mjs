#!/usr/bin/env node
// Pipeline: drawing, stage 3c. Lays an ordered pencil line file (order-strokes.mjs) as a hand does at one finish
// (src/paint/methods/pencil-hand.mjs): construction marks first, contours found in overlapping pulls, ends run on,
// restatements late. Prints the strokes added and how far the laid lines sit from the given ones.
// usage: node tools/seg/pencil-hand.mjs IN-lines.json OUT-stem --sheetmm 280 --finish loose|medium|tight [--seed 1]
import fs from 'node:fs';
import { layByHand, placementMm } from '../../src/paint/methods/pencil-hand.mjs';

const [inFile, outStem, ...rest] = process.argv.slice(2);
const arg = (k, d) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : d);
const sheetMm = Number(arg('--sheetmm')), finish = arg('--finish', 'medium'), seed = Number(arg('--seed', 1));
if (!inFile || !outStem || !(sheetMm > 0)) { console.error('usage: pencil-hand.mjs IN-lines.json OUT-stem --sheetmm MM --finish loose|medium|tight'); process.exit(2); }
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), pxMm = sheetMm / doc.image.w;
const r = layByHand(doc.lines, { finish, pxMm, seed }), place = placementMm(r.lines, doc.lines, pxMm);
const stats = { ...r.stats, placementMeanMm: +place.meanMm.toFixed(3), placementP90Mm: +place.p90Mm.toFixed(3) };
fs.writeFileSync(`${outStem}-lines.json`, JSON.stringify({ ...doc, source: `${doc.source}; laid by hand at finish ${finish} (pencil-hand.mjs)`, stats: { ...doc.stats, hand: stats }, lines: r.lines }) + '\n');
console.log(JSON.stringify(stats));
