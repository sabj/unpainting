#!/usr/bin/env node
// A results sheet per source: for each named crop, the source then the drawing at each labelled step, side by side, each
// panel captioned with the label. Reads work/ink-legibility/<label>/crops/<subject>__<crop>/crop.png and the source image.
//   node tools/judge/ink-results-sheet.mjs --labels 00b-baseline-prepink-layer,06-hand,<final> [--names baseline,step 6,final] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cropBox } from './legibility-core.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const labels = opt('labels', '').split(',').filter(Boolean), names = opt('names', labels.join(',')).split(',');
if (!labels.length) { console.error('usage: ink-results-sheet.mjs --labels a,b,c [--names x,y,z] [--out dir]'); process.exit(2); }
const out = path.resolve(root, opt('out', 'work/ink-legibility/results')); fs.mkdirSync(out, { recursive: true });
const spec = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/legibility.json'), 'utf8')).subjects;
const boxes = JSON.parse(fs.readFileSync(path.join(root, 'bench/ink-heavy/features.json'), 'utf8'));
const PH = 420, GAP = 8, CAP = 26;
const caption = (text, w) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${CAP}"><rect width="${w}" height="${CAP}" fill="#fff"/><text x="6" y="19" font-family="Helvetica" font-size="15" font-weight="bold" fill="#222">${text.replace(/&/g, '&amp;')}</text></svg>`);
for (const [name, s] of Object.entries(spec)) {
  const key = path.basename(s.image).replace(/\.[a-z]+$/i, ''), meta = await sharp(path.join(root, s.image)).metadata(), rows = [];
  for (const crop of Object.keys(s.crops)) {
    const b = cropBox(boxes[key][crop], meta.width, meta.height), panels = [];
    const add = async (buf, text) => { const img = sharp(buf).resize({ height: PH, fit: 'inside' }), { data, info } = await img.png().toBuffer({ resolveWithObject: true }); panels.push({ data, w: info.width, text }); };
    await add(await sharp(path.join(root, s.image)).flatten({ background: '#fff' }).extract(b).png().toBuffer(), `${crop}: source`);
    for (const [i, l] of labels.entries()) { const f = path.join(root, 'work/ink-legibility', l, 'crops', `${name}__${crop}`, 'crop.png'); if (fs.existsSync(f)) await add(fs.readFileSync(f), names[i]); }
    const width = panels.reduce((a, p) => a + p.w + GAP, -GAP), comp = []; let x = 0;
    for (const p of panels) { comp.push({ input: p.data, left: x, top: CAP }, { input: await sharp(caption(p.text, p.w)).png().toBuffer(), left: x, top: 0 }); x += p.w + GAP; }
    rows.push({ width, buf: await sharp({ create: { width, height: PH + CAP, channels: 3, background: '#fff' } }).composite(comp).png().toBuffer() });
  }
  const W = Math.max(...rows.map(r => r.width)), H = rows.length * (PH + CAP + GAP);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } }).composite(rows.map((r, i) => ({ input: r.buf, left: 0, top: i * (PH + CAP + GAP) }))).jpeg({ quality: 88 }).toFile(path.join(out, `${name}.jpg`));
  console.log(`${name}: ${path.join(out, name + '.jpg')}`);
}
