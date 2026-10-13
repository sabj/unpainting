#!/usr/bin/env node
// Write a structural opening drawing from a dense traced line file (src/crop/structure-filter.mjs). Detail regions come
// from the target picture and the trace by one rule (dense trace and high local contrast), never from hand boxes.
// usage: node tools/seg/structure-filter.mjs --from <dense-lines.json> --image <target.png> --out <lines.json>
//   [--w 540 --minlength 12 --straight 0.85 --radius 6 --quantile 0.8]
import fs from 'node:fs';
import sharp from 'sharp';
import { structuralLines, detailRegion } from '../../src/crop/structure-filter.mjs';
import { labPlanes } from '../../src/eval/colour.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const num = (k, d) => { const v = Number(opt(k, d)); if (!Number.isFinite(v)) throw new Error(`--${k}: a number`); return v; };
const from = opt('from'), image = opt('image'), out = opt('out');
if (!from || !image || !out) throw new Error('usage: --from <dense-lines.json> --image <target.png> --out <lines.json>');
const d = JSON.parse(fs.readFileSync(from, 'utf8'));
if (!Array.isArray(d.lines) || !(d.image?.w > 0 && d.image?.h > 0)) throw new Error(`${from}: line file with image size and lines`);
const w = num('w', 540), s = w / d.image.w, h = Math.round(d.image.h * s);
const rgb = new Uint8Array(await sharp(image).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer());
const lum = labPlanes(rgb, w * h, [252, 251, 248]).L;
const scaled = d.lines.map(l => l.points.map(([x, y]) => [x * s, y * s]));
const detail = detailRegion(scaled, lum, w, h, { radius: num('radius', 6), quantile: num('quantile', 0.8) });
const keep = structuralLines(scaled, { w, h, minLength: num('minlength', 12), minStraight: num('straight', 0.85), detail });
const lines = keep.map(i => d.lines[i]);
if (opt('mask')) await sharp(Buffer.from(Uint8Array.from(detail, v => v ? 0 : 255)), { raw: { width: w, height: h, channels: 1 } }).png().toFile(opt('mask'));
fs.writeFileSync(out, JSON.stringify({ ...d, source: `structural lines from ${d.source ?? from}`, stats: { ...d.stats, selectedPaths: lines.length }, lines }));
console.log(`structure filter: ${lines.length} of ${d.lines.length} lines kept; detail region ${(100 * detail.reduce((a, v) => a + v, 0) / (w * h)).toFixed(1)}% of the sheet`);
