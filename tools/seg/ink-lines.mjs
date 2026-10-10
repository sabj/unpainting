#!/usr/bin/env node
// Candidate lines from a pen-and-wash target's own estimated ink (src/crop/ink-lines.mjs), as a line file:
// <out>-lines.json (polylines in source pixels, read by --drawingfile) and <out>.png (the estimated ink, dark on white).
//
//   node tools/seg/ink-lines.mjs examples/targets/rembrandt-woman-reading.jpg --out work/lines/rembrandt-woman-reading-ink \
//     --regions work/regions/rembrandt-woman-reading
//
// --regions <stem> reads <stem>.png (region ids) and <stem>.json ({ legend: { id: name }, subject: [names] }) from
// tools/seg/subject-regions.py; each line is tagged with the region most of it lies in.
// --width (default 720) is the working width the separator reads the target at; --minlength (cells at that width, 8).
// --ridgehigh 0.10 and --ridgelow 0.045 are the separator's candidate-ridge thresholds; a pale brown ink drawing wants
// them lower. --stepoverridge 1.4 and --maxwidth 5 are the separator's edge and nib-width tests. --margin 0.02 drops
// the sheet's own edge. --darkwash d tags lines in a wash of blurred density over d (see src/crop/ink-lines.mjs).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { inkLines } from '../../src/crop/ink-lines.mjs';
import { paperOf } from '../../src/crop/palettepick.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.lastIndexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const image = args[0];
const out = opt('out', null);
if (!image || image.startsWith('--') || !out) {
  console.error('usage: ink-lines.mjs <image> --out <stem> [--regions <stem>] [--width 720] [--minlength 8] [--bridge 1]');
  process.exit(2);
}
const width = Number(opt('width', 720));
if (!(width >= 64)) throw new Error(`--width: a number of pixels, 64 or more, not ${opt('width')}`);

const meta = await sharp(image).metadata();
const w = width, h = Math.round(meta.height * width / meta.width);
const rgb = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
const { paperRGB } = paperOf(rgb, w, h, { mode: 'source' });

let labels = null, legend = {}, subject = [];
const regions = opt('regions', '');
if (regions) {
  const doc = JSON.parse(fs.readFileSync(`${regions}.json`, 'utf8'));
  legend = doc.legend ?? {};
  subject = doc.subject ?? [];
  labels = await sharp(`${regions}.png`).greyscale().resize(w, h, { fit: 'fill', kernel: 'nearest' }).raw().toBuffer();
}

const r = inkLines(rgb, w, h, paperRGB, { labels, legend, subject, minLength: Number(opt('minlength', 8)), bridge: Number(opt('bridge', 0)), join: Number(opt('join', 6)),
  margin: Number(opt('margin', 0.02)), darkWash: Number(opt('darkwash', Infinity)), separator: { ridgeHigh: Number(opt('ridgehigh', 0.10)), ridgeLow: Number(opt('ridgelow', 0.045)),
    stepOverRidge: Number(opt('stepoverridge', 1.4)), maxWidth: Number(opt('maxwidth', 5)) } });
const sx = meta.width / w, sy = meta.height / h;
const lines = r.lines.map(g => ({ ...g, points: g.points.map(([x, y]) => [+(x * sx).toFixed(1), +(y * sy).toFixed(1)]), length: +(g.length * sx).toFixed(1),
  strength: +g.strength.toFixed(4), weight: +g.weight.toFixed(3), ...(g.wash == null ? {} : { wash: +g.wash.toFixed(3) }) }));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(`${out}-lines.json`, JSON.stringify({ source: 'estimated ink (src/crop/ink-lines.mjs)', image: { w: meta.width, h: meta.height },
  paperRGB: paperRGB.map(v => Math.round(v)), regions: regions || null, lines }) + '\n');
await sharp(Buffer.from(Uint8Array.from(r.mask, v => (v ? 40 : 255))), { raw: { width: w, height: h, channels: 1 } }).png().toFile(`${out}.png`);
const byRegion = {};
for (const g of lines) byRegion[g.region ?? 'all'] = (byRegion[g.region ?? 'all'] ?? 0) + 1;
console.log(`${out}-lines.json: ${lines.length} lines from ${r.stats.ink} ink cells of ${w}x${h} (${JSON.stringify(byRegion)})`);
