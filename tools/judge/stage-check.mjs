#!/usr/bin/env node
// The process measures (src/eval/stages.mjs) on one run directory: how much of the final tone is down at a quarter, a
// half and three quarters of the run, how early the big shapes are stated, speckle before depth, backward steps, pops
// and dead frames. concert-judge.mjs computes the same for a farm round's layout; this reads any directory holding
// frames.json, source.jpg and painting.jpg, so a paint-real run and a paint-plate run are read the same way.
//
//   node tools/judge/stage-check.mjs <run dir> [run dir ...]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { gaussian } from '../../src/keyframes/density.mjs';
import { labPlanes } from '../../src/eval/colour.mjs';
import { stageMeasures } from '../../src/eval/stages.mjs';

const argv = process.argv.slice(2), maxFrames = 24;
const load = async (f, w, h) => { let img = sharp(f).flatten({ background: '#fff' }); if (w) img = img.resize(w, h, { fit: 'fill' }); const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const lum = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2];
const dens = (img, pl) => Float32Array.from({ length: img.w * img.h }, (_, i) => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(img.data, i) / pl)))));
const blurRGB = (img, s) => { const n = img.w * img.h, o = new Uint8ClampedArray(n * 3); for (let c = 0; c < 3; c++) { const B = gaussian(Float32Array.from({ length: n }, (_, i) => img.data[i * 3 + c]), img.w, img.h, s); for (let i = 0; i < n; i++) o[i * 3 + c] = B[i]; } return o; };

for (const d of argv.filter(a => !a.startsWith('--'))) {
  const paint = await load(path.join(d, 'painting.jpg')), w = paint.w, h = paint.h, n = w * h;
  const src = await load(path.join(d, 'source.jpg'), w, h);
  const mx = Math.round(0.05 * w), my = Math.round(0.05 * h);
  const light = [...Array(n).keys()].filter(i => { const x = i % w, y = (i / w) | 0; return x >= mx && y >= my && x < w - mx && y < h - my; }).sort((a, b) => lum(src.data, b) - lum(src.data, a)).slice(0, n / 10 | 0);
  const lightest = [0, 1, 2].map(k => light.reduce((s, i) => s + src.data[i * 3 + k], 0) / light.length);
  const paper = lightest[2] > lightest[0] + 6 ? [247, 244, 236] : lightest, pl = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
  const SD = dens(src, pl), LS = labPlanes(blurRGB(src, 2), n, paper);
  const fj = JSON.parse(fs.readFileSync(path.join(d, 'frames.json'), 'utf8')).frames;
  const pick = fj.length <= maxFrames ? fj : Array.from({ length: maxFrames }, (_, k) => fj[Math.round(k * (fj.length - 1) / (maxFrames - 1))]);
  const frames = [];
  for (const f of pick) {
    const fp = path.join(d, f.src); if (!fs.existsSync(fp)) continue;
    const img = await load(fp, w, h);
    frames.push({ position: f.position, stage: f.stage, D: dens(img, pl), L: null });
  }
  const nearest = frames.reduce((b, f) => (Math.abs(f.position - 0.5) < Math.abs(b.position - 0.5) ? f : b), frames[0]);
  for (const f of [nearest, frames[frames.length - 1]]) { const img = await load(path.join(d, pick[frames.indexOf(f)].src), w, h); f.L = labPlanes(blurRGB(img, 2), n, paper); }
  const m = stageMeasures(frames, { D: SD, L: LS }, w, h, gaussian);
  const f = v => (v == null ? '-' : v.toFixed(2));
  console.log(`${d} (${fj.length} frames, ${w}x${h})`);
  console.log(`  reached at 1/4, 1/2, 3/4 of the run: ${m.reached.map(f).join(' ')}   early shapes ${f(m.earlyShapes)} (end ${f(m.endShapes)})`);
  console.log(`  speckle before depth ${f(m.speckle)} per thousand   backward steps ${f(m.backwardShare)}   pops ${m.pops}   dead frames ${m.dead} of ${m.steps}   mid chroma ${f(m.midChroma)} hue turn ${f(m.midHue)}`);
}
