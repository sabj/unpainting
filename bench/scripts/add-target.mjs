#!/usr/bin/env node
// Add a benchmark target from an image: the target PNG, its coarse map, its crops.json entry and its V4/V5 subject.
//   npm run bench:add-target -- <image> --task harbour --name Harbour \
//     --style "loose watercolor: boats at a harbour wall" --source "photo by ..." --licence "<licence of the image>" \
//     [--crop x,y,w,h] [--width 300] [--private <dir>] [--paint-width 1200] [--sheetmm 280] [--self-score]
// --name, --style, --source and --licence are required; there is no default licence.
// --crop takes pixels of the source image (default: all of it); the target is resized to --width cells (default 300,
// as the published targets). --private writes the PNG to <dir> instead of bench/v2/targets and marks the target
// not distributed; scoring then needs BENCH_PRIVATE_CROPS=<dir>. --self-score scores the target against itself
// (TOGETHER_API_KEY), the 100% mark for indexed scores; without it the target has no indexed score yet.
// Every round picks the new target up from crops.json; the V1/V2 brief gets its row from the style given here.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { BENCH, readJson, writeJson, round2 } from './lib.mjs';

const COLS = 24, COLOURS = 8;

/** The coarse map of an RGB image: at most 24 columns of square cells, an 8-colour k-means palette over the cell
 * means, the palette index per cell and the cell's mean luminance (0 dark to 1 light), as the published maps. */
export function coarseMap(task, rgb, w, h) {
  const cols = Math.min(COLS, w), cellPx = w / cols, rows = Math.max(1, Math.round(h / cellPx));
  const means = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const y0 = Math.round(r * cellPx), y1 = Math.min(h, Math.max(y0 + 1, Math.round((r + 1) * cellPx)));
    const x0 = Math.round(c * cellPx), x1 = Math.min(w, Math.max(x0 + 1, Math.round((c + 1) * cellPx)));
    const s = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = 3 * (y * w + x); s[0] += rgb[i]; s[1] += rgb[i + 1]; s[2] += rgb[i + 2]; n++; }
    means.push(s.map(v => v / n));
  }
  const lum = m => (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
  const palette = kmeans(means, Math.min(COLOURS, means.length), lum);
  const near = m => palette.reduce((b, p, k) => { const d = (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2 + (p[2] - m[2]) ** 2; return d < b.d ? { k, d } : b; }, { k: 0, d: Infinity }).k;
  return { task, w, h, cols, rows, cellPx: round2(cellPx), palette: palette.map(p => p.map(Math.round)),
    cells: means.map(near), value: means.map(m => round2(lum(m))) };
}

/** k-means seeded at luminance quantiles, so the same image always gives the same palette. */
function kmeans(pts, k, lum) {
  const order = [...pts].sort((a, b) => lum(a) - lum(b));
  let centres = Array.from({ length: k }, (_, j) => [...order[Math.floor((j + 0.5) * order.length / k)]]);
  for (let it = 0; it < 50; it++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      centres.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    const next = centres.map((c, j) => (sums[j][3] ? sums[j].slice(0, 3).map(v => v / sums[j][3]) : c));
    if (next.every((c, j) => c.every((v, i) => Math.abs(v - centres[j][i]) < 1e-6))) break;
    centres = next;
  }
  return centres.sort((a, b) => lum(a) - lum(b));
}

/** Write the target and register it. root: the bench folder (BENCH; a copy in tests). Returns the crops.json entry. */
export async function addTarget({ image, task, name, style, source, licence, crop = null, width = 300, privateDir = null,
  paintWidth = 1200, sheetmm = 280, root = BENCH }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(task || '')) throw new Error('--task must be lower-case letters, digits and hyphens');
  for (const [k, v] of Object.entries({ name, style, source, licence })) if (!v) throw new Error(`--${k} is required`);
  const cropsFile = path.join(root, 'v2', 'crops.json'), subjectsFile = path.join(root, 'v4v5', 'subjects.json');
  const spec = readJson(cropsFile), subjects = readJson(subjectsFile);
  if (spec.crops.some(c => c.task === task) || subjects.subjects[task]) throw new Error(`target ${task} already exists`);
  let img = sharp(image).rotate().removeAlpha();
  if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] });
  const buf = await img.resize({ width, kernel: 'lanczos3' }).png().toBuffer();
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const map = coarseMap(task, data, info.width, info.height);
  const file = `targets/${task}.png`, coarseFile = `targets/${task}-coarse.json`;
  const png = privateDir ? path.join(path.resolve(privateDir), `${task}.png`) : path.join(root, 'v2', file);
  fs.mkdirSync(path.dirname(png), { recursive: true });
  fs.writeFileSync(png, buf);
  writeJson(path.join(root, 'v2', coarseFile), map);
  const entry = { task, name, width: info.width, height: info.height, coarse: { cols: map.cols, rows: map.rows }, style, source,
    distributed: !privateDir, file, coarseFile, licence };
  writeJson(cropsFile, { ...spec, crops: [...spec.crops, entry] });
  writeJson(subjectsFile, { ...subjects, subjects: { ...subjects.subjects,
    [task]: { name, taskStyle: style.split(':')[0].trim(), width: paintWidth, sheetmm, trumbull: false } } });
  return { entry, png };
}

/** Score the target against itself (the scorer's own composite), stored as selfScore. */
function selfScore(task, png, style) {
  if (!process.env.TOGETHER_API_KEY) throw new Error('--self-score calls the vision judges on Together: set TOGETHER_API_KEY');
  const out = execFileSync('python3', [path.join(BENCH, 'scorer', 'score_painting.py'), '--target', png, '--image', png, '--style', style.split(':')[0]]);
  return round2(JSON.parse(out.toString()).composite);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  const VALUE = new Set(['task', 'name', 'style', 'source', 'licence', 'crop', 'width', 'private', 'paint-width', 'sheetmm']);
  const image = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUE.has(argv[i - 1].slice(2))));
  try {
    if (!image || !fs.existsSync(image)) throw new Error('usage: add-target.mjs <image> --task <key> --name <Name> --style <style> --source <credit> --licence <licence>');
    const { entry, png } = await addTarget({
      image, task: opt('task'), name: opt('name'), style: opt('style'), source: opt('source'), licence: opt('licence'),
      crop: opt('crop') ? opt('crop').split(',').map(Number) : null, width: Number(opt('width', 300)), privateDir: opt('private', null),
      paintWidth: Number(opt('paint-width', 1200)), sheetmm: Number(opt('sheetmm', 280)) });
    console.log(`bench:add-target: ${entry.task} (${entry.name}), ${entry.width} x ${entry.height}, coarse ${entry.coarse.cols} x ${entry.coarse.rows}, ${png}`);
    if (argv.includes('--self-score')) {
      const s = selfScore(entry.task, png, entry.style), f = path.join(BENCH, 'v2', 'crops.json'), spec = readJson(f);
      writeJson(f, { ...spec, crops: spec.crops.map(c => (c.task === entry.task ? { ...c, selfScore: s } : c)) });
      console.log(`bench:add-target: self score ${s}`);
    } else console.log('bench:add-target: no self score yet (run again with --self-score, or add selfScore to crops.json); indexed scores need it');
    console.log('bench:add-target: credit the image in NOTICE and add a row to bench/crops/README.md');
  } catch (e) { console.error(`bench:add-target: ${e.message}`); process.exit(2); }
}
