#!/usr/bin/env node
// Pipeline: inking, stage 3d (the pen-physics dial applied to a drawing's vector strokes).
// usage: pen-physics.mjs IN-vectors.json OUT-vectors.json --amount 0..1 [--seed N]
// 0 is exact (the file copied as it is); above 0 the path-drawn lines are laid as a nib lays them, within 0.3 mm
// (src/paint/methods/pen-physics.mjs). Give the painter the stem of OUT with its line file beside it.
import fs from 'node:fs';
import { penPhysics } from '../../src/paint/methods/pen-physics.mjs';

const [inFile, outFile, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d; };
if (!inFile || !outFile || arg('amount') == null) { console.error('usage: pen-physics.mjs IN-vectors.json OUT-vectors.json --amount 0..1 [--seed N]'); process.exit(2); }
const amount = Number(arg('amount')), seed = Number(arg('seed', 1));
const doc = JSON.parse(fs.readFileSync(inFile, 'utf8')), out = penPhysics(doc, amount, seed);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(JSON.stringify({ strokes: out.strokes.length, lines: doc.strokes.filter(s => s.drawn === 'path').length, amount, seed, out: outFile }));
