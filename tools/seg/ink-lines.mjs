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
// --ridgehigh 0.03 and --ridgelow 0.015 keep faint contours in brown ink drawings. Increase them for a sparse
// dark-line study. --bridge 1 reconnects tooth gaps before thinning; --join 12 joins aligned fragments.
// --stepoverridge 1.4 and --maxwidth 5 are the separator's edge and nib-width tests. --margin 0.02 drops
// the sheet's own edge. --darkwash d tags lines in a wash of blurred density over d (see src/crop/ink-lines.mjs).
import fs from 'node:fs';
import sharp from 'sharp';
import { writeInkLines } from '../../src/crop/ink-lines-file.mjs';

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

let regions = null;
const regionStem = opt('regions', '');
if (regionStem) {
  const doc = JSON.parse(fs.readFileSync(`${regionStem}.json`, 'utf8'));
  const meta = await sharp(image).metadata();
  const h = Math.round(meta.height * width / meta.width);
  regions = { legend: doc.legend ?? {}, subject: doc.subject ?? [], labels: await sharp(`${regionStem}.png`).greyscale().resize(width, h, { fit: 'fill', kernel: 'nearest' }).raw().toBuffer() };
}

const r = await writeInkLines(image, out, { width, regions, regionsName: regionStem || null, minLength: Number(opt('minlength', 8)), bridge: Number(opt('bridge', 1)), join: Number(opt('join', 12)),
  margin: Number(opt('margin', 0.02)), darkWash: Number(opt('darkwash', Infinity)), ridgeHigh: Number(opt('ridgehigh', 0.03)), ridgeLow: Number(opt('ridgelow', 0.015)),
  stepOverRidge: Number(opt('stepoverridge', 1.4)), maxWidth: Number(opt('maxwidth', 5)) });
const byRegion = {};
for (const g of r.lines) byRegion[g.region ?? 'all'] = (byRegion[g.region ?? 'all'] ?? 0) + 1;
console.log(`${r.file}: ${r.lines.length} lines from ${r.inkCells} ink cells of ${r.w}x${r.h} (${JSON.stringify(byRegion)})`);
