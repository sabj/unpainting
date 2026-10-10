#!/usr/bin/env node
// docs/img/paper-texture.webp: a flat wash and a graded wash painted and dried by the sheet physics on the painter's
// default paper (cold press, physical fibres), beside a crop of a real watercolour wash at the same millimetres a pixel.
//   node tools/readme/paper-figure.mjs --ref <crop.png> --refmm <mm a pixel of the crop> [--out docs/img/paper-texture.webp]
//     [--mm 0.08] [--debug <dir>]
// The committed figure used --ref from Winslow Homer, After the Hurricane, Bahamas, 1899, Art Institute of Chicago
// 1933.1235 (public domain, CC0 image): https://www.artic.edu/iiif/2/b34de958-1cbe-065f-4941-c34f64d2b366/2350,520,640,740/full/0/default.png
// with --refmm 0.04602 (54.2 cm across 11777 pixels).
// Every simulated pixel is one sheet cell: no panel is upscaled. The reference crop is only scaled down.
// --debug writes each panel's native render, the paper height and the bare paper as PNG, and stats.json with where
// the dried pigment sits against the paper height.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const fail = m => { console.error(`paper-figure: ${m}`); process.exit(1); };

const MM = Number(arg('mm', '0.08'));                 // millimetres a cell, and a pixel of the figure
const OUT = path.resolve(arg('out', path.join(ROOT, 'docs/img/paper-texture.webp')));
const REF = arg('ref', '') ? path.resolve(arg('ref')) : null, REF_MM = Number(arg('refmm', '0'));
const DEBUG = arg('debug', '') ? path.resolve(arg('debug')) : null;
if (!(MM > 0.02 && MM < 0.5)) fail('--mm must be between 0.02 and 0.5');
if (REF && !(REF_MM > 0 && REF_MM <= MM)) fail('--refmm must be > 0 and no coarser than --mm (the reference is only scaled down)');

// Layout: three panels across 1120 pixels, shown at 560 (2x).
const FIG_W = 1120, GAP = 17, PANEL_W = Math.floor((FIG_W - 2 * GAP) / 3), PANEL_H = 420, LABEL_H = 34;
const PAPER_RGB = [246, 245, 239];
const CAPTION_FILL = '#768390';

// The painter's default paper, as tools/paint-plate.mjs builds it with --paper coldpress --paperphysical 1 and no
// other paper flags: seed 9, fibres 0.5, tooth 0.5, toothscale 0.2, proudblur 1, cold-press domes 0.5 to 2 mm,
// cover 2.2, swell 0.3, no pits.
const paperOptions = mm => ({
  seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm,
  coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 },
});
// The painter's default sheet constants (paint-plate.mjs O): fixed bed, edge drying 0.0012, granulation 0.25.
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
// The painter's bare-paper shade, --papershade 0.04: the relief darkens the sheet by up to 4%.
const PAPER_SHADE = 0.04;
const STEP_EVERY = 8, DRY_OPTIONS = { levelMax: 140, dt: 14 };

const PALETTE = ['ultramarine', 'sienna'];
const pigments = PALETTE.map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));

function paperBase(paper, n) {
  const base = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const t = 1 - PAPER_SHADE + PAPER_SHADE * paper.height[i];
    for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.min(255, Math.round(PAPER_RGB[c] * t));
  }
  return base;
}

function flatBrush(widthMm, capacityMm3, seed) {
  return createBrush({
    flat: true, radius: widthMm / 2 / MM, bristles: 24, loadWater: capacityMm3 / MM ** 2, belly: 12, give: 0.9,
    feed: 0.4, free: 0.4, film: 0.25, wetMix: 0.85, splay: 0.03, stiffness: Math.max(1, Math.round(3 / MM)),
    bridge: 0.98, bridgeSoft: 3, seed,
  });
}

// One horizontal pass of a loaded flat brush, y and x in millimetres.
function pass(sheet, { y, x0, x1, widthMm, capacity, water, conc, seed, upright = false, wetting = false }) {
  const brush = flatBrush(widthMm, capacity, seed);
  dip(brush, { water: water / capacity, conc: PALETTE.map(k => conc[k] ?? 0) });
  const r = widthMm / 2 / MM;
  const pts = [{ x: x0 / MM, y: y / MM, p: 0.85, r }, { x: x1 / MM, y: y / MM, p: 0.85, r }];
  let samples = 0;
  sheet.wetting = wetting;
  stroke(brush, sheet, pts, { upright: upright ? 'sweep' : false, between: () => { if (++samples % STEP_EVERY === 0) step(sheet, PHYSICS); } });
  sheet.wetting = false;
}

function newSheet(w, h) {
  const paper = makePaper(w, h, paperOptions(MM));
  return { paper, sheet: createSheet(paper, pigments) };
}

function checkFinite(sheet, label) {
  for (const [name, values] of [['W', sheet.W], ['s', sheet.s]]) {
    if (values.some(v => !Number.isFinite(v))) fail(`${label}: non-finite ${name}`);
  }
}

// Flat wash: dry paper, six overlapping loaded passes of one mix, each into the bead of the last, then dried.
function flatWash() {
  const w = PANEL_W, h = PANEL_H, Wmm = w * MM, Hmm = h * MM;
  const { paper, sheet } = newSheet(w, h);
  const bands = 6, top = 4.5, bottom = Hmm - 4.5, band = 8;
  for (let b = 0; b < bands; b++) {
    const y = top + band / 2 + (b * (bottom - top - band)) / (bands - 1);
    pass(sheet, { y, x0: 3.5, x1: Wmm - 3.5, widthMm: band, capacity: 160, water: 150, conc: { ultramarine: 0.3, sienna: 0.14 }, seed: 101 + b });
  }
  dry(sheet, 30000, PHYSICS, DRY_OPTIONS);
  checkFinite(sheet, 'flat wash');
  return { paper, sheet, w, h };
}

// Graded wash: one clean-water preparation, then four passes of falling strength into the wet field, then dried.
function gradedWash() {
  const w = PANEL_W, h = PANEL_H, Wmm = w * MM, Hmm = h * MM;
  const { paper, sheet } = newSheet(w, h);
  pass(sheet, { y: Hmm / 2, x0: 3, x1: Wmm - 3, widthMm: Hmm - 7, capacity: 600, water: 450, conc: {}, seed: 201, upright: true, wetting: true });
  const strengths = [0.65, 0.43, 0.26, 0.12], top = 4.5, band = 8;
  strengths.forEach((u, b) => {
    const y = top + band / 2 + (b * (Hmm - 9 - band)) / (strengths.length - 1);
    pass(sheet, { y, x0: 3.5, x1: Wmm - 3.5, widthMm: band, capacity: 160, water: 112, conc: { ultramarine: u }, seed: 211 + b });
  });
  dry(sheet, 30000, PHYSICS, DRY_OPTIONS);
  checkFinite(sheet, 'graded wash');
  return { paper, sheet, w, h };
}

// Where the dried pigment sits: total thickness in the lowest and highest quarter of the paper, inside the wash.
function pigmentVsPaper({ paper, sheet, w, h }) {
  const n = w * h, total = new Float64Array(n);
  for (const layer of layersOf(sheet)) for (const a of layer) for (let i = 0; i < n; i++) total[i] += a[i];
  const inside = []; let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, total[i]);
  for (let i = 0; i < n; i++) if (total[i] > 0.2 * peak) inside.push(i);
  const by = field => {
    const s = inside.map(i => field[i]).sort((a, b) => a - b), lo = s[Math.floor(0.25 * s.length)], hi = s[Math.floor(0.75 * s.length)];
    let a = 0, an = 0, b = 0, bn = 0, mx = 0, my = 0;
    for (const i of inside) { mx += total[i]; my += field[i]; if (field[i] <= lo) { a += total[i]; an++; } else if (field[i] >= hi) { b += total[i]; bn++; } }
    mx /= inside.length; my /= inside.length; let sxy = 0, sxx = 0, syy = 0;
    for (const i of inside) { sxy += (total[i] - mx) * (field[i] - my); sxx += (total[i] - mx) ** 2; syy += (field[i] - my) ** 2; }
    return { lowQuarterOverHighQuarter: +((a / an) / (b / bn)).toFixed(3), correlation: +(sxy / Math.sqrt(sxx * syy)).toFixed(3) };
  };
  let m = 0; for (const i of inside) m += total[i]; m /= inside.length; let v = 0; for (const i of inside) v += (total[i] - m) ** 2;
  return { cells: inside.length, cv: +(Math.sqrt(v / inside.length) / m).toFixed(3), height: by(paper.height), valley: by(paper.valley) };
}

const raw = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 3 } });
function render({ paper, sheet, w, h }) {
  const n = w * h;
  return Buffer.from(renderLayers(layersOf(sheet), pigments, paperBase(paper, n), n));
}

async function referencePanel() {
  if (!REF) return null;
  const meta = await sharp(REF).metadata();
  const scale = REF_MM / MM, needW = Math.ceil(PANEL_W / scale), needH = Math.ceil(PANEL_H / scale);
  if (meta.width < needW || meta.height < needH) fail(`--ref is ${meta.width}x${meta.height}; it needs ${needW}x${needH} at ${REF_MM} mm a pixel`);
  return sharp(REF).extract({ left: 0, top: 0, width: needW, height: needH }).resize(PANEL_W, PANEL_H, { kernel: 'lanczos3' })
    .removeAlpha().toColourspace('srgb').png().toBuffer();
}

const label = (text, x) => `<text x="${x + 2}" y="${PANEL_H + 23}" font-family="Helvetica, Arial, sans-serif" font-size="19" fill="${CAPTION_FILL}">${text}</text>`;

const t0 = Date.now();
const flat = flatWash();
console.log(`flat wash: ${flat.w}x${flat.h} cells at ${MM} mm, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const graded = gradedWash();
console.log(`graded wash: ${graded.w}x${graded.h} cells at ${MM} mm, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const flatPng = await raw(render(flat), flat.w, flat.h).png().toBuffer();
const gradedPng = await raw(render(graded), graded.w, graded.h).png().toBuffer();
const refPng = await referencePanel();

const panels = refPng ? [refPng, flatPng, gradedPng] : [flatPng, gradedPng];
const xs = panels.map((_, i) => i * (PANEL_W + GAP));
const width = refPng ? FIG_W : 2 * PANEL_W + GAP;
const names = refPng ? ['Real: Homer, 1899 (detail)', 'Simulated flat wash', 'Simulated graded wash'] : ['Simulated flat wash', 'Simulated graded wash'];
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PANEL_H + LABEL_H}">${names.map((t, i) => label(t, xs[i])).join('')}</svg>`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width, height: PANEL_H + LABEL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([...panels.map((input, i) => ({ input, left: xs[i], top: 0 })), { input: svg, left: 0, top: 0 }])
  .webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(OUT);
console.log(`${path.relative(ROOT, OUT)}: ${width}x${PANEL_H + LABEL_H}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${MM} mm a pixel`);

if (DEBUG) {
  fs.mkdirSync(DEBUG, { recursive: true });
  const grey = (a, w, h) => sharp(Buffer.from(Uint8Array.from(a, v => Math.round(255 * v))), { raw: { width: w, height: h, channels: 1 } }).png();
  await fs.promises.writeFile(path.join(DEBUG, 'flat.png'), flatPng);
  await fs.promises.writeFile(path.join(DEBUG, 'graded.png'), gradedPng);
  await grey(flat.paper.height, flat.w, flat.h).toFile(path.join(DEBUG, 'flat-height.png'));
  await grey(flat.paper.valley, flat.w, flat.h).toFile(path.join(DEBUG, 'flat-valley.png'));
  await grey(graded.paper.height, graded.w, graded.h).toFile(path.join(DEBUG, 'graded-height.png'));
  await raw(paperBase(flat.paper, flat.w * flat.h), flat.w, flat.h).png().toFile(path.join(DEBUG, 'bare.png'));
  if (refPng) await fs.promises.writeFile(path.join(DEBUG, 'ref.png'), refPng);
  fs.writeFileSync(path.join(DEBUG, 'stats.json'), JSON.stringify({ mm: MM, panel: [PANEL_W, PANEL_H], paper: paperOptions(MM), physics: { fixedBed: 1, edgeEvap: 0.0012, gran: 0.25 },
    pigmentVsPaper: { flat: pigmentVsPaper(flat), graded: pigmentVsPaper(graded) }, seconds: (Date.now() - t0) / 1000 }, null, 2));
}
