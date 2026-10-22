#!/usr/bin/env node
// Noise view of the pen lines, per named crop (bench/ink-heavy/legibility.json): the lines drawn in a run, over the pale
// source, red where they sit on a mass edge (a shadow or wash step), green where they sit on a two-sided pen line, grey
// where they have neither. Also the share of pen length in each class, per crop and over the sheet.
//   node tools/judge/ink-noise.mjs --label <name> [--runs <label>] [--lines ink-opening-lines.json]
// Reads <runs>/<subject>/<lines file> (the lines as held, on the line file's grid) and writes
// work/ink-legibility/<label>/noise/<subject>__<crop>.png and noise.json.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { labPlanes } from '../../src/paint/methods/line-evidence.mjs';
import { classifyPath, CLASS } from '../../src/paint/methods/line-class.mjs';
import { resample } from '../../src/paint/methods/ink-lines.mjs';
import { cropBox, showSize } from './legibility-core.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const label = opt('label');
if (!label) { console.error('usage: ink-noise.mjs --label <name> [--runs <label>] [--lines <file>]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/legibility.json'), 'utf8')).subjects;
const boxes = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/features.json'), 'utf8'));
const base = path.join(root, 'work/ink-legibility', label), RUNS = path.join(root, 'work/ink-legibility', opt('runs', label), 'runs');
fs.mkdirSync(path.join(base, 'noise'), { recursive: true });
const COLOUR = { [CLASS.mass]: '#e0201a', [CLASS.pen]: '#12a02a', [CLASS.faint]: '#8a8a8a' };
const report = {};

for (const [name, s] of Object.entries(spec)) {
  const file = path.join(RUNS, name, opt('lines', 'ink-opening-lines.json'));
  if (!fs.existsSync(file)) { console.log(`${name}: no ${path.basename(file)}`); continue; }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')), { w, h } = doc.image;
  const img = path.join(root, s.image);
  const { data } = await sharp(img).flatten({ background: '#fff' }).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
  const L = labPlanes(data, w, h).L.map(v => 100 * v), pxMm = 152.4 / w;
  const lines = doc.lines.map(g => {
    const R = resample(g.points.map(([x, y]) => ({ x, y })), 1);
    return { R, cls: R.length > 1 ? classifyPath(R, L, w, h, pxMm) : new Uint8Array(R.length) };
  });
  const share = inBox => {
    const t = [0, 0, 0];
    for (const { R, cls } of lines) for (let k = 1; k < R.length; k++) if (!inBox || inBox(R[k])) t[cls[k]] += Math.hypot(R[k].x - R[k - 1].x, R[k].y - R[k - 1].y);
    const sum = t[0] + t[1] + t[2] || 1;
    return { mass: t[CLASS.mass] / sum, pen: t[CLASS.pen] / sum, faint: t[CLASS.faint] / sum, lengthMm: sum * pxMm };
  };
  report[name] = { sheet: share(null), crops: {} };
  const key = path.basename(s.image).replace(/\.[a-z]+$/i, '');
  for (const crop of Object.keys(s.crops)) {
    const b = cropBox(boxes[key][crop], w, h), sz = showSize(b.width, b.height), f = sz.width / b.width;
    const inBox = p => p.x >= b.left && p.x < b.left + b.width && p.y >= b.top && p.y < b.top + b.height;
    report[name].crops[crop] = share(inBox);
    const paths = lines.flatMap(({ R, cls }) => {
      const out = []; let k = 0;
      while (k < R.length - 1) {
        let j = k + 1; while (j + 1 < R.length && cls[j + 1] === cls[k + 1]) j++;
        out.push(`<polyline fill="none" stroke="${COLOUR[cls[k + 1]]}" stroke-width="${Math.max(1.4, 0.25 / pxMm * f)}" stroke-linecap="round" stroke-linejoin="round" points="${R.slice(k, j + 1).map(p => `${((p.x - b.left) * f).toFixed(1)},${((p.y - b.top) * f).toFixed(1)}`).join(' ')}"/>`);
        k = j;
      }
      return out;
    });
    const under = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).extract(b).resize(sz.width, sz.height).linear(0.4, 150).png().toBuffer();
    await sharp(under).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sz.width}" height="${sz.height}">${paths.join('')}</svg>`), left: 0, top: 0 }]).png().toFile(path.join(base, 'noise', `${name}__${crop}.png`));
  }
}
fs.writeFileSync(path.join(base, 'noise.json'), JSON.stringify(report, null, 1) + '\n');
for (const [n, r] of Object.entries(report)) console.log(`${n}: sheet mass ${(100 * r.sheet.mass).toFixed(0)}% pen ${(100 * r.sheet.pen).toFixed(0)}% faint ${(100 * r.sheet.faint).toFixed(0)}%; crops mass ` + Object.entries(r.crops).map(([c, v]) => `${c} ${(100 * v.mass).toFixed(0)}%`).join(', '));
