#!/usr/bin/env node
// Score a painted stage against its source on whether its washes read as watercolour.
// Shapes come from the source, so both pictures are measured over the same areas.
//   colour    mean delta E 2000 inside the shape.
//   tone      ratio of mean optical density, painted over source; 1.0 is right.
//   edge      share of the shape's perimeter that is soft; a real sheet loses roughly a fifth to a quarter.
//   bare      share of the wash's area where the paper is all but untouched: the pits the brush missed on rough paper.
//   specks    separate light or dark spots per thousand cells, painted against source; count, not amplitude.
//   grain     ratio of variation at one or two cells: the paper's tooth showing through.
//   mottle    ratio of variation at about six cells: pooling and settling across the wash.
//   texture   ratio of high-passed density variation well inside the eroded shape, painted over source.
//
//   node tools/judge/wash-score.mjs --paint work/dump/stage-2-first-stains-paint.png --key work/dump/stage-2-first-stains-key.png
//   node tools/judge/wash-score.mjs --dir work/dump          scores every stage pair in a --dump directory
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { gaussian } from '../../src/keyframes/density.mjs';
import { deltaE2000, labOf } from '../../src/eval/colour.mjs';
import { components, removeSmall, close, open as openMask, dilate, erode } from '../../src/raster.js';

// Grain and mottle per unit optical density from photographed sheets; the source is often too smooth.
const CORPUS = JSON.parse(fs.readFileSync(new URL('../../src/eval/wash-corpus.json', import.meta.url), 'utf8'));

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }, num = (n, d) => Number(opt(n, d));
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const read = async file => {
  const { data, info } = await sharp(path.resolve(root, file)).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { px: data, w: info.width, h: info.height, n: info.width * info.height };
};
const paperOf = ({ px, n }) => {
  const lum = i => 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
  const light = [...Array(n).keys()].sort((a, b) => lum(b) - lum(a)).slice(0, Math.max(1, n / 10 | 0));
  return [0, 1, 2].map(c => light.reduce((s, i) => s + px[i * 3 + c], 0) / light.length);
};
const densityOf = ({ px, n }, paper) => {
  const pl = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2], D = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2];
    D[i] = Math.max(0, -Math.log(Math.max(0.02, Math.min(1, l / pl))));
  }
  return D;
};

/** The source's wash shapes: broad areas of tone, big enough that a brush painted them. */
function shapesOf(D, w, h, { level = num('level', 0.08), minArea = num('minarea', 600) } = {}) {
  const B = gaussian(D, w, h, 2.5), m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = B[i] >= level ? 1 : 0;
  const cleaned = removeSmall(openMask(close(m, w, h, 3), w, h, 2), w, h, minArea);
  const { labels, areas, count } = components(cleaned, w, h);
  const out = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < minArea) continue;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (labels[i] === id) mask[i] = 1;
    out.push({ mask, area: areas[id] });
  }
  return out;
}

const meanIn = (F, mask) => { let s = 0, c = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) { s += F[i]; c++; } return c ? s / c : 0; };
/** Local extrema per thousand cells of the mask: a cell that is higher, or lower, than all eight of its neighbours. */
function speckDensity(F, mask, w, h) {
  let hits = 0, cells = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    cells++;
    let hi = 1, lo = 1;
    for (let dy = -1; dy <= 1 && (hi || lo); dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const v = F[(y + dy) * w + x + dx];
      if (v >= F[i]) hi = 0;
      if (v <= F[i]) lo = 0;
    }
    if (hi || lo) hits++;
  }
  return cells ? 1000 * hits / cells : 0;
}

/** How far two fields agree inside a mask: 1 is the same structure, 0 is unrelated. */
const corrIn = (A, B, mask) => {
  let ma = 0, mb = 0, c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { ma += A[i]; mb += B[i]; c++; }
  if (!c) return 0;
  ma /= c; mb /= c;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = A[i] - ma, y = B[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
};

const sdIn = (F, mask) => {
  const m = meanIn(F, mask); let s = 0, c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { s += (F[i] - m) ** 2; c++; }
  return c ? Math.sqrt(s / c) : 0;
};

/** How much of a shape's perimeter is soft: the density falls off over several cells rather than one or two.
 *  A wash that is hard all the way round reads as a cut-out; a real one loses part of its edge into the paper. */
function softEdgeShare(D, mask, w, h, { reach = num('reach', 5), hard = num('hard', 0.55) } = {}) {
  const inner = erode(mask, w, h, 1), border = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) border[i] = mask[i] && !inner[i] ? 1 : 0;
  let soft = 0, count = 0;
  for (let y = reach; y < h - reach; y++) for (let x = reach; x < w - reach; x++) {
    const i = y * w + x; if (!border[i]) continue;
    // the outward direction: away from the shape's own body, found by where the mask thins
    let nx = 0, ny = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!mask[(y + dy) * w + x + dx]) { nx += dx; ny += dy; }
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const at = d => {
      const xx = Math.round(x + nx * d), yy = Math.round(y + ny * d);
      return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : D[yy * w + xx];
    };
    const inside = at(-2), outside = at(reach);
    if (inside - outside < 0.01) continue;                    // no step here at all
    // where the fall is half done: close in means a hard edge, further out means the pigment ran into the paper
    const half = outside + (inside - outside) / 2;
    let d = -2; while (d < reach && at(d) > half) d += 0.5;
    count++;
    if (d > hard * reach) soft++;
    else if (Math.abs(at(1) - at(3)) > 0.25 * (inside - outside)) soft++;   // still falling well past the boundary
  }
  return count ? soft / count : 0;
}

async function score(paintFile, keyFile) {
  const paint = await read(paintFile), key = await read(keyFile);
  if (paint.w !== key.w || paint.h !== key.h) throw Error(`sizes differ: ${paint.w}x${paint.h} vs ${key.w}x${key.h}`);
  const { w, h } = key;
  const pPaper = paperOf(paint), kPaper = paperOf(key);
  const pD = densityOf(paint, pPaper), kD = densityOf(key, kPaper);
  const shapes = shapesOf(kD, w, h);
  if (!shapes.length) return { shapes: 0 };

  // Exclude the darkest tenth (line and accent, not wash), decided on blurred density so grain does not pinhole the mask.
  const kSoft = gaussian(kD, w, h, 2);
  const cut = [...kSoft].sort((a, b) => b - a)[Math.floor(w * h * 0.1)] || 1;
  const body = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) body[i] = kSoft[i] < cut ? 1 : 0;

  // small-scale variation only: what the paper and the pigment did, not the tone the painter intended
  const highPass = (D, sigma) => { const B = gaussian(D, w, h, sigma); const out = new Float32Array(w * h); for (let i = 0; i < w * h; i++) out[i] = D[i] - B[i]; return out; };
  const pHigh = highPass(pD, num('grain', 4)), kHigh = highPass(kD, num('grain', 4));
  const pFine = highPass(pD, num('fine', 1.5)), kFine = highPass(kD, num('fine', 1.5));
  const pMot = highPass(gaussian(pD, w, h, num('fine', 1.5)), num('mottle', 6)), kMot = highPass(gaussian(kD, w, h, num('fine', 1.5)), num('mottle', 6));
  // "all but untouched": within this optical density of the paper (a tenth of a 0.1 OD wash)
  const bareAt = num('bare', 0.012);
  let dE = 0, toneP = 0, toneK = 0, sdP = 0, sdK = 0, softP = 0, softK = 0, area = 0, textureArea = 0, bareP = 0, bareK = 0, fineP = 0, fineK = 0, motP = 0, motK = 0, speckP = 0, speckK = 0, grainAgree = 0;
  for (const s of shapes) {
    const m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = s.mask[i] && body[i] ? 1 : 0;
    let e = 0, c = 0;
    for (let i = 0; i < w * h; i++) if (m[i]) { e += deltaE2000(labOf(paint.px, i, pPaper), labOf(key.px, i, kPaper)); c++; }
    if (!c) continue;
    const weight = s.area;
    dE += (e / c) * weight;
    toneP += meanIn(pD, m) * weight; toneK += meanIn(kD, m) * weight;
    // eroded from the shape without its lines and accents, so ink does not count as texture
    const core = erode(m, w, h, num('core', 4));
    let hasCore = 0; for (let i = 0; i < w * h; i++) if (core[i]) { hasCore = 1; break; }
    if (hasCore) {
      sdP += sdIn(pHigh, core) * weight; sdK += sdIn(kHigh, core) * weight; textureArea += weight;
      fineP += sdIn(pFine, core) * weight; fineK += sdIn(kFine, core) * weight;
      // Amplitude alone cannot tell the paper's tooth from the picture's grain; correlation checks placement.
      grainAgree += corrIn(pFine, kFine, core) * weight;
      motP += sdIn(pMot, core) * weight; motK += sdIn(kMot, core) * weight;
      speckP += speckDensity(pD, core, w, h) * weight; speckK += speckDensity(kD, core, w, h) * weight;
      let bp = 0, bk = 0, cc = 0;
      for (let i = 0; i < w * h; i++) if (core[i]) { cc++; if (pD[i] < bareAt) bp++; if (kD[i] < bareAt) bk++; }
      bareP += (bp / cc) * weight; bareK += (bk / cc) * weight;
    }
    softP += softEdgeShare(pD, s.mask, w, h) * weight; softK += softEdgeShare(kD, s.mask, w, h) * weight;
    area += weight;
  }
  return {
    shapes: shapes.length, area,
    colour: dE / area,
    tone: toneP / area, toneKey: toneK / area, toneRatio: (toneP / area) / Math.max(1e-4, toneK / area),
    texture: sdP / Math.max(1, textureArea), textureKey: sdK / Math.max(1, textureArea),
    textureRatio: (sdP / Math.max(1, textureArea)) / Math.max(1e-5, sdK / Math.max(1, textureArea)),
    soft: softP / area, softKey: softK / area,
    bare: bareP / Math.max(1, textureArea), bareKey: bareK / Math.max(1, textureArea),
    grain: fineP / Math.max(1, textureArea), grainKey: fineK / Math.max(1, textureArea),
    grainAgreement: grainAgree / Math.max(1, textureArea),
    specks: speckP / Math.max(1, textureArea), specksKey: speckK / Math.max(1, textureArea),
    mottle: motP / Math.max(1, textureArea), mottleKey: motK / Math.max(1, textureArea),
  };
}

const show = (name, r) => {
  if (!r.shapes) { console.log(`${name}: no wash shapes in the source`); return; }
  console.log(`${name}: ${r.shapes} shapes, ${r.area} px`);
  console.log(`  colour   dE00 ${r.colour.toFixed(1)}`);
  console.log(`  tone     ${r.tone.toFixed(3)} vs ${r.toneKey.toFixed(3)} OD  (${r.toneRatio.toFixed(2)}x)`);
  console.log(`  texture  sd ${r.texture.toFixed(3)} vs ${r.textureKey.toFixed(3)}  (${r.textureRatio.toFixed(2)}x)`);
  console.log(`  grain    sd ${r.grain.toFixed(4)} vs ${r.grainKey.toFixed(4)}  (${(r.grain / Math.max(1e-6, r.grainKey)).toFixed(2)}x) at one cell`);
  console.log(`  mottle   sd ${r.mottle.toFixed(4)} vs ${r.mottleKey.toFixed(4)}  (${(r.mottle / Math.max(1e-6, r.mottleKey)).toFixed(2)}x) at six`);
  // against real paint as well as against the source: the band is per unit of tone, so it is read at the tone painted
  const band = (key, value) => {
    const lo = CORPUS[key].p25 * r.tone, hi = CORPUS[key].p75 * r.tone;
    const where = value < lo ? 'below' : value > hi ? 'above' : 'inside';
    return `${where} the ${CORPUS.sheets} real sheets (${lo.toFixed(4)} to ${hi.toFixed(4)})`;
  };
  console.log(`           grain ${band('grainPerOD', r.grain)}`);
  console.log(`           mottle ${band('mottlePerOD', r.mottle)}`);
  console.log(`           grain agreement ${r.grainAgreement.toFixed(2)} (1 is the source's own grain, 0 is the paper's)`);
  console.log(`  specks   ${r.specks.toFixed(0)} per 1000 cells vs ${r.specksKey.toFixed(0)}  (${(r.specks / Math.max(1e-6, r.specksKey)).toFixed(2)}x)`);
  console.log(`  bare     ${(100 * r.bare).toFixed(1)}% paper left vs ${(100 * r.bareKey).toFixed(1)}%`);
  console.log(`  edge     ${(100 * r.soft).toFixed(0)}% soft vs ${(100 * r.softKey).toFixed(0)}%`);
};

const dir = opt('dir');
if (dir) {
  // resolve once: joining the root onto an absolute path gives a path that does not exist
  const full = path.resolve(root, dir);
  const files = fs.readdirSync(full).filter(f => f.endsWith('-paint.png')).sort();
  let pairs = 0;
  for (const f of files) {
    const key = f.replace(/-paint\.png$/, '-key.png');
    if (!fs.existsSync(path.join(full, key))) { console.log(`${f}: no matching -key.png`); continue; }
    pairs++;
    show(f.replace(/^stage-|-paint\.png$/g, ''), await score(path.join(full, f), path.join(full, key)));
  }
  if (!pairs) { console.error(`no -paint.png / -key.png pairs in ${full}`); process.exit(2); }
} else {
  const paint = opt('paint'), key = opt('key');
  if (!paint || !key) { console.error('usage: wash-score.mjs --paint <png> --key <png>   |   --dir <dump dir>'); process.exit(1); }
  show(path.basename(paint), await score(paint, key));
}
