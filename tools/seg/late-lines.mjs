#!/usr/bin/env node
// Write a late (closing-pen) line file: the long straight lines of a dense traced file that a cleaner opening file
// does not already draw. Both files are line JSON (src/crop/lines.mjs); each is scaled from its own image size to
// the sheet before comparison. The output keeps the selected source line objects unchanged, in the source's frame.
// usage: node tools/seg/late-lines.mjs --from <dense-lines.json> --opening <opening-lines.json> --out <late-lines.json>
//   [--w 540 --h 360 --minlength 10 --straight 0.85 --clearance 2 --covered 0.5 --tilt 45 --max 400]
import fs from 'node:fs';
import { selectLateLines } from '../../src/crop/late-lines.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const num = (k, d) => { const v = Number(opt(k, d)); if (!Number.isFinite(v)) throw new Error(`--${k}: a number`); return v; };
const from = opt('from'), openingFile = opt('opening'), out = opt('out');
if (!from || !openingFile || !out) throw new Error('usage: --from <dense-lines.json> --opening <opening-lines.json> --out <late-lines.json>');
const w = num('w', 540), h = num('h', 360);
const read = f => { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (!Array.isArray(d.lines) || !(d.image?.w > 0 && d.image?.h > 0)) throw new Error(`${f}: line file with image size and lines`); return d; };
const dense = read(from), opening = read(openingFile);
const scaled = d => d.lines.map(l => l.points.map(([x, y]) => [x * w / d.image.w, y * h / d.image.h]));
const keep = selectLateLines(scaled(dense), scaled(opening), { w, h, minLength: num('minlength', 10), minStraight: num('straight', 0.85), clearance: num('clearance', 2), maxCovered: num('covered', 0.5), maxTilt: num('tilt', 45), maxLines: opt('max') == null ? Infinity : num('max') });
const lines = keep.map(i => dense.lines[i]);
fs.writeFileSync(out, JSON.stringify({ ...dense, source: `late lines from ${dense.source ?? from}`, stats: { ...dense.stats, selectedPaths: lines.length, lateFrom: dense.lines.length }, lines }));
console.log(`late lines: ${lines.length} of ${dense.lines.length} kept from ${from}`);
