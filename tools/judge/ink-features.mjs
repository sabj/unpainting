#!/usr/bin/env node
// Named feature crops for a pen drawing: source and pen layer side by side at twice the size, one file per feature
// in bench/ink-heavy/features.json, for a person (or a vision model) to judge whether each feature reads.
//   node tools/judge/ink-features.mjs --image <target> --run <painting dir> [--out <dir>] [--name <target name>]
// The pen layer is layer-prepink.jpg times layer-finishink.jpg on a staged run, else ink.jpg, else painting.png.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.lastIndexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const image = opt('image'), run = opt('run');
if (!image || !run) { console.error('usage: ink-features.mjs --image <target> --run <dir> [--out dir] [--name n]'); process.exit(2); }
const name = opt('name', path.basename(image).replace(/\.[a-z]+$/i, ''));
const all = JSON.parse(fs.readFileSync(new URL('../../bench/ink-heavy/features.json', import.meta.url), 'utf8'));
const feats = all[name];
if (!feats) { console.log(`${name}: no named features`); process.exit(0); }
const out = opt('out', path.join(run, 'features'));
fs.mkdirSync(out, { recursive: true });
const painted = path.join(run, 'painting.png');
const { width: w, height: h } = await sharp(painted).metadata();
const load = f => sharp(f).flatten({ background: '#fff' }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
const stages = ['layer-prepink.jpg', 'layer-finishink.jpg'].map(f => path.join(run, f)).filter(f => fs.existsSync(f));
let pen;
if (stages.length) { const b = await Promise.all(stages.map(load)); pen = Buffer.from(b[0].map((v, i) => b.reduce((a, x) => a * x[i] / 255, 255))); }
else pen = await load(fs.existsSync(path.join(run, 'ink.jpg')) ? path.join(run, 'ink.jpg') : painted);
const src = await load(image);
const raw = b => sharp(b, { raw: { width: w, height: h, channels: 3 } });
const MAX = 1400;
for (const [key, [x0, y0, x1, y1]] of Object.entries(feats)) {
  const box = { left: Math.round(x0 * w), top: Math.round(y0 * h), width: Math.round((x1 - x0) * w), height: Math.round((y1 - y0) * h) };
  const s = Math.min(2, MAX / Math.max(box.width, box.height));
  const tw = Math.round(box.width * s), th = Math.round(box.height * s);
  const tiles = await Promise.all([src, pen].map(async b => raw(b).extract(box).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer()));
  await sharp({ create: { width: tw * 2 + 12, height: th, channels: 3, background: '#fff' } })
    .composite([{ input: tiles[0], left: 0, top: 0 }, { input: tiles[1], left: tw + 12, top: 0 }]).jpeg({ quality: 88 }).toFile(path.join(out, `${key}.jpg`));
}
console.log(`${name}: ${Object.keys(feats).length} feature crops in ${out}`);
