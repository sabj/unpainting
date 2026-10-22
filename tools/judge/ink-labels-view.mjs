#!/usr/bin/env node
// Crop view of the ink-or-wash decisions: each named crop (bench/ink-heavy/legibility.json) with its regions tinted by
// label (architecture, figure, face, hands, drapery, tree_trunk, foliage, sky, water, ground, shadow_mass), the candidate
// lines the trace offered in thin magenta and the lines drawn in black. Reads <runs>/<subject>/ink-labels.json (written by
// the painter next to the painting) and its segments.json.
//   node tools/judge/ink-labels-view.mjs --label <name> [--runs <label>]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadSegments, registerSegments } from '../../src/crop/segments.mjs';
import { cropBox, showSize } from './legibility-core.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const label = opt('label');
if (!label) { console.error('usage: ink-labels-view.mjs --label <name> [--runs <label>]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/legibility.json'), 'utf8')).subjects;
const boxes = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/features.json'), 'utf8'));
const base = path.join(root, 'work/ink-legibility', label), RUNS = path.join(root, 'work/ink-legibility', opt('runs', label), 'runs');
fs.mkdirSync(path.join(base, 'labels'), { recursive: true });
const TINT = { architecture: [60, 120, 220], figure: [230, 150, 30], face: [235, 60, 160], hands: [200, 40, 40], drapery: [160, 90, 200], tree_trunk: [120, 80, 30], foliage: [40, 170, 60], sky: [140, 200, 240], water: [30, 190, 190], ground: [170, 150, 90], shadow_mass: [70, 70, 70] };

for (const [name, s] of Object.entries(spec)) {
  const run = path.join(RUNS, name), lf = path.join(run, 'ink-labels.json');
  if (!fs.existsSync(lf)) { console.log(`${name}: no ink-labels.json`); continue; }
  const rec = JSON.parse(fs.readFileSync(lf, 'utf8')), kept = JSON.parse(fs.readFileSync(path.join(run, 'ink-opening-lines.json'), 'utf8'));
  const cand = JSON.parse(fs.readFileSync(path.join(run, 'lines-source-ink-lines.json'), 'utf8')), { w, h } = kept.image;
  const segStem = JSON.parse(fs.readFileSync(path.join(run, 'segments.json'), 'utf8')).stem, img = path.join(root, s.image), b0 = path.basename(img, path.extname(img));
  registerSegments(b0, segStem);
  const seg = await loadSegments(b0, w, h), labelOf = new Map(rec.regions.map(r => [r.id, r.label]));
  const src = await sharp(img).flatten({ background: '#fff' }).removeAlpha().resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const tinted = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const c = TINT[labelOf.get(seg.labels[i])] ?? [128, 128, 128];
    for (let k = 0; k < 3; k++) tinted[3 * i + k] = Math.round(0.45 * c[k] + 0.55 * (0.4 * src[3 * i + k] + 150));
  }
  const key = path.basename(s.image).replace(/\.[a-z]+$/i, '');
  const scaleCand = cand.image.w / w;
  for (const crop of Object.keys(s.crops)) {
    const b = cropBox(boxes[key][crop], w, h), sz = showSize(b.width, b.height), f = sz.width / b.width, pxMm = 152.4 / w;
    const poly = (pts, sc, stroke, sw) => `<polyline fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" points="${pts.map(([x, y]) => `${((x / sc - b.left) * f).toFixed(1)},${((y / sc - b.top) * f).toFixed(1)}`).join(' ')}"/>`;
    const near = (g, sc) => g.points.some(([x, y]) => x / sc >= b.left - 4 && x / sc < b.left + b.width + 4 && y / sc >= b.top - 4 && y / sc < b.top + b.height + 4);
    const svg = [...cand.lines.filter(g => near(g, scaleCand)).map(g => poly(g.points, scaleCand, '#ff00cc', 1)), ...kept.lines.filter(g => near(g, 1)).map(g => poly(g.points, 1, '#000', Math.max(1.5, 0.2 / pxMm * f)))].join('');
    const under = await sharp(tinted, { raw: { width: w, height: h, channels: 3 } }).extract(b).resize(sz.width, sz.height, { kernel: 'nearest' }).png().toBuffer();
    const present = [...new Set(rec.regions.map(r => r.label))].filter(l => TINT[l]);
    const legend = present.map((l, i) => `<rect x="6" y="${6 + i * 18}" width="14" height="14" fill="rgb(${TINT[l]})"/><text x="26" y="${18 + i * 18}" font-family="Helvetica" font-size="13" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">${l}</text>`).join('');
    await sharp(under).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sz.width}" height="${sz.height}">${svg}${legend}</svg>`) }]).png().toFile(path.join(base, 'labels', `${name}__${crop}.png`));
  }
  console.log(`${name}: ${rec.regions.length} regions (${[...new Set(rec.regions.map(r => r.label))].join(', ')}); kept ${(100 * rec.stats.keptPx / rec.stats.lengthPx).toFixed(0)}% of the length; mass share ${(100 * rec.stats.massBefore).toFixed(0)}% before, ${(100 * rec.stats.massAfter).toFixed(0)}% after`);
}
