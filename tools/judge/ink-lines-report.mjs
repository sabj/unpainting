#!/usr/bin/env node
// Pen lines in a painting against the pen lines in its source (src/eval/ink-lines-measure.mjs): placement recall and
// precision, darkness against what is beside the line, width, evenness, ink colour and how broken the lines are.
// Post-render only; never painting feedback.
//   node tools/judge/ink-lines-report.mjs --image <target> --run <painting dir> [--out report.json] [--crops <stem>]
// --run reads painting.jpg and, when present, ink.jpg (the pen layer). --painted and --pen name the files directly.
// --crops <stem> writes <stem>-crop1.jpg and <stem>-crop2.jpg: target, painting and pen layer side by side, over the
// two windows with the most source line, at twice the size, and <stem>-crops.json with the windows.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { compareLines } from '../../src/eval/ink-lines-measure.mjs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const image = opt('image'), run = opt('run', '');
const paintedPath = opt('painted', run ? ['painting.jpg', 'painting.png'].map(f => path.join(run, f)).find(f => fs.existsSync(f)) ?? '' : '');
// a staged run writes what each pen stage laid on its own; their product is the whole pen layer, opening and closing
const stageLayers = run ? ['layer-prepink.jpg', 'layer-finishink.jpg'].map(f => path.join(run, f)).filter(f => fs.existsSync(f)) : [];
const penPath = opt('pen', stageLayers.length ? 'stages' : run && fs.existsSync(path.join(run, 'ink.jpg')) ? path.join(run, 'ink.jpg') : '');
if (!image || !paintedPath) { console.error('usage: ink-lines-report.mjs --image <target> --run <dir> | --painted <jpg> [--pen <jpg>]'); process.exit(2); }

const painted = await sharp(paintedPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const w = painted.info.width, h = painted.info.height;
const load = f => sharp(f).flatten({ background: '#fff' }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
const multiply = bufs => Buffer.from(bufs[0].map((v, i) => bufs.reduce((a, b) => a * b[i] / 255, 255)));
const src = await load(image), pen = penPath === 'stages' ? multiply(await Promise.all(stageLayers.map(load))) : penPath ? await load(penPath) : null;
const penFile = penPath === 'stages' ? await sharp(pen, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer() : penPath;
const r = compareLines(src, painted.data, w, h, { pen, tol: Number(opt('tol', 2)) });
const { sourceMask, ...report } = r;

const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : '?');
const row = (name, m) => `${name.padEnd(8)} share ${(100 * m.share).toFixed(2)}%  dark p50 ${f2(m.darkness.p50)} (p10 ${f2(m.darkness.p10)}, p90 ${f2(m.darkness.p90)})  even ${f2(m.evenness)}  width p50 ${f2(m.width.p50)} p90 ${f2(m.width.p90)}  hue ${f2(m.hue)}  pieces ${f2(m.pieces.per1000)}/k median ${m.pieces.median}`;
console.log(`lines at ${w}x${h}: placement recall ${f2(r.placement.recall)} precision ${f2(r.placement.precision)} (${r.placement.from}); visible recall ${f2(r.visible.recall)} precision ${f2(r.visible.precision)}`);
console.log(row('source', r.source));
console.log(row('painted', r.painted));
if (r.pen) console.log(row('pen', r.pen));
console.log(`darkness at the source's line cells: source ${f2(r.darknessAtSourceLines.source)} painting ${f2(r.darknessAtSourceLines.painted)}${r.pen ? ` pen ${f2(r.darknessAtSourceLines.pen)}` : ''}`);
if (opt('out', '')) fs.writeFileSync(opt('out'), JSON.stringify({ target: path.basename(image), ...report }, null, 2));

const stem = opt('crops', '');
if (stem) {
  const side = Math.max(48, Math.round(Math.min(w, h) / 3)), step = Math.max(8, side >> 2), boxes = [];
  for (let y = 0; y + side <= h; y += step) for (let x = 0; x + side <= w; x += step) {
    let c = 0; for (let yy = y; yy < y + side; yy++) for (let xx = x; xx < x + side; xx++) c += sourceMask[yy * w + xx];
    boxes.push({ x, y, c });
  }
  boxes.sort((a, b) => b.c - a.c);
  const picked = [];
  for (const b of boxes) { if (picked.every(p => Math.abs(p.x - b.x) >= side || Math.abs(p.y - b.y) >= side)) picked.push(b); if (picked.length === 2) break; }
  fs.writeFileSync(`${stem}-crops.json`, JSON.stringify({ size: [w, h], side, boxes: picked.map(({ x, y }) => ({ x, y })) }) + '\n');
  const files = [image, paintedPath, penFile].filter(Boolean);
  for (const [k, b] of picked.entries()) {
    const tiles = await Promise.all(files.map(async f => {
      const full = await sharp(f).flatten({ background: '#fff' }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).toBuffer();
      const cut = await sharp(full).extract({ left: b.x, top: b.y, width: side, height: side }).toBuffer();
      return sharp(cut).resize(side * 2, side * 2, { kernel: 'lanczos3' }).toBuffer();
    }));
    await sharp({ create: { width: side * 2 * tiles.length + 8 * (tiles.length - 1), height: side * 2, channels: 3, background: '#fff' } })
      .composite(tiles.map((t, j) => ({ input: t, left: j * (side * 2 + 8), top: 0 }))).jpeg({ quality: 88 }).toFile(`${stem}-crop${k + 1}.jpg`);
  }
}
