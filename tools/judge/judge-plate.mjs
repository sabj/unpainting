#!/usr/bin/env node
// Score a decomposition and, if there is one, a painting of it, across all four families at once.
//   node tools/judge/judge-plate.mjs --image <plate image> [--painted <painting.jpg>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { paletteOf } from '../../src/crop/palette.mjs';
import { channelDensity, unmix } from '../../src/crop/pigments.mjs';
import { blockInPigments } from '../../src/crop/blockin.mjs';
import { planGestures, longShare } from '../../src/crop/gestures.mjs';
import { composability, tooling, endResult, execution, planQuality, report, print } from '../../src/eval/composite.mjs';
import { gaussian } from '../../src/keyframes/density.mjs';

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }, num = (n, d) => Number(opt(n, d));
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const read = async f => {
  const { data, info } = await sharp(path.resolve(root, f)).flatten({ background: '#fff' }).resize({ width: num('width', 620) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h;
  const lum = i => 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  const light = [...Array(n).keys()].sort((a, b) => lum(b) - lum(a)).slice(0, Math.max(1, n / 10 | 0));
  const paper = [0, 1, 2].map(c => light.reduce((s, i) => s + data[i * 3 + c], 0) / light.length);
  const pl = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, lum(i) / pl))));
  return { px: data, w, h, n, paper, D };
};

const src = await read(opt('image'));
const PIGS = paletteOf(src.px, src.n, src.paper, { paints: num('pigs', 4) }).pigments;
const A = unmix(channelDensity(src.px, src.n, src.paper), src.n, PIGS.map(p => p.K.map(v => v / 0.55)));
const { layers, owed } = blockInPigments(A, PIGS.length, src.w, src.h, { glaze: num('glaze', 0.22), maxValues: num('maxvalues', 14) });

// what the washes account for, back in density: amounts times each pigment's absorption, summed
const washD = new Float32Array(src.n);
for (const L of layers) for (const sh of L.shapes) {
  const strength = sh.mix.reduce((a, v, j) => a + v * (PIGS[j].K[0] + PIGS[j].K[1] + PIGS[j].K[2]) / 3, 0);
  for (let i = 0; i < src.n; i++) if (sh.mask[i]) washD[i] += strength;
}
const ink = new Float32Array(src.n);
for (let i = 0; i < src.n; i++) ink[i] = Math.max(0, src.D[i] - washD[i] - num('forgive', 0.10));
const nz = Array.from(ink).filter(v => v > 0).sort((a, b) => a - b);
const floor = nz.length ? nz[Math.floor(nz.length * num('floorq', 0.5))] : 0.05;
const { gestures } = planGestures(ink, src.w, src.h, { floor, keep: num('keep', 400), claimRadius: 3, reachShare: 0.12, scales: [4, 1.5, 0], tries: 3000 });

// what the drawing accounts for: its marks at the ink strength under them
const inkD = new Float32Array(src.n);
for (const g of gestures) for (const p of g.points) {
  const x = Math.round(p.x), y = Math.round(p.y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= src.w || yy >= src.h) continue;
    inkD[yy * src.w + xx] = Math.max(inkD[yy * src.w + xx], ink[yy * src.w + xx]);
  }
}
const lens = gestures.map(g => g.length).sort((a, b) => a - b);

const parts = {
  composability: composability(src.D, washD, inkD),
  tooling: tooling({
    marks: gestures.length, glazes: layers.length,
    glazeProgress: owed && owed.length > 2 ? (owed[0] - owed[owed.length - 1]) / Math.max(1e-6, owed[0]) : undefined,
    backwardShare: owed && owed.length > 2 ? owed.filter((v, i) => i > 0 && v > owed[i - 1]).length / (owed.length - 1) : undefined,
    medianLength: lens[Math.floor(lens.length / 2)] ?? 0,
    longShare: longShare(gestures, src.w),
  }, { width: src.w, height: src.h }, {}),
};
// the plan's own density, so all three links of the chain can be marked: source to plan, plan to sheet, source to sheet
const planD = new Float32Array(src.n);
for (let i = 0; i < src.n; i++) planD[i] = washD[i] + inkD[i];
parts.plan = planQuality(src.D, planD, src.w, src.h, gaussian);
if (opt('painted')) {
  const painted = (await read(opt('painted'))).D;
  parts.execution = execution(planD, painted, src.w, src.h, gaussian);
  parts.endResult = endResult(src.D, painted);
}
print(report(parts));
