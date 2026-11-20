#!/usr/bin/env node
// The brush test sheet (BRUSH-PHYSICS.md S1 and S2): single strokes painted, flowed and dried by the sheet physics on the
// painter's default paper, each brush model in its own column, every panel at 40 px a millimetre whatever its cells.
//   node tools/lab/brush-sheet.mjs --stage s1|s2 --out <file.jpg> [--models row,section] [--json <file>]
// Before: 'row' (the painter's brush until now) and, for s2, 'tuft' (the earlier CPU tuft). After: 'section'.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, step, dry, layersOf, DEFAULTS, deposit } from '../../src/media/sheet.mjs';
import { createBrush, dip, thirsty, stroke } from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { physicsFields } from '../../src/media/pigment-physical.mjs';
import { pigmentPerMm, runOut, meanBetween, opticalDensity, rowProfile, seamStep, widthAlongX, diagonalEdge, spectralPeak } from './brush-measure.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const STAGE = arg('stage', 's1'), OUT = path.resolve(arg('out', `brush-${STAGE}.jpg`)), JSON_OUT = arg('json', null);
const MODELS = arg('models', STAGE === 's2' ? 'row,tuft,section' : 'row,section').split(',');
// --real <file>: a grid of real watercolour crops (5 across, 2 down, each labelled underneath, about 0.14 mm a pixel)
// shown in a last column at the same 40 px a mm, for comparison
const REAL = arg('real', null), REAL_MM = Number(arg('realmm', '0.14')), REAL_PICK = arg('realpick', '3,7,10').split(',').map(Number); // crops by number, 1 to 10
const PX = 40; // pixels a millimetre

const paperOptions = mm => ({ seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const PHYSICS = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const PALETTE = ['ultramarine', 'sienna'];
const pigments = PALETTE.map(k => { const paint = BOX.find(p => p.key === k); return { ...boxPigment(paint), ...physicsFields(paint.physics), key: k }; });
const PAPER_RGB = [246, 245, 239];

// The painter's brushes (tools/plate/paint.mjs): a detail round and a wash flat, sized in mm.
const roundOf = (model, mm, rmm, seed = 31, extra = {}) => { const r = rmm / mm; return createBrush({ model, radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: 0.15, bridge: 0.55, bridgeSoft: 1.2, streak: 0.5, seed, ...extra }); };
const flatOf = (model, mm, rmm, seed = 41, extra = {}) => { const r = rmm / mm; return createBrush({ model, flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed, ...extra }); };
const washRoundOf = (model, mm, rmm, seed = 51, extra = {}) => flatOf(model, mm, rmm, seed, { flat: false, ...extra });

function newSheet(wmm, hmm, mm) {
  const w = Math.round(wmm / mm), h = Math.round(hmm / mm), paper = makePaper(w, h, paperOptions(mm));
  return { paper, sheet: createSheet(paper, pigments), w, h, mm };
}
// a stroke with the sheet flowing every 8 steps; points in mm
function lay(S, brush, pts, opts = {}) {
  let n = 0;
  stroke(brush, S.sheet, pts.map(q => ({ ...q, x: q.x / S.mm, y: q.y / S.mm, ...(q.r != null ? { r: q.r / S.mm } : {}) })), { ...opts, between: opts.noflow ? undefined : () => { if (++n % 8 === 0) step(S.sheet, PHYSICS); } });
}
const base = (paper, n) => { const b = Buffer.alloc(n * 3); for (let i = 0; i < n; i++) { const t = 0.96 + 0.04 * paper.height[i]; for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.round(PAPER_RGB[c] * t); } return b; };
function finish(S) {
  dry(S.sheet, 30000, PHYSICS, { levelMax: 140, dt: 14 });
  const n = S.w * S.h, paperRGB = base(S.paper, n), rgb = Buffer.from(renderLayers(layersOf(S.sheet), pigments, paperRGB, n));
  S.rgb = rgb; S.od = opticalDensity(rgb, paperRGB, n);
  return S;
}

// --- S1 panels -------------------------------------------------------------------------------------------------
const S1 = [
  { name: 'loaded round, 120 mm, dry paper, 0.25 mm cells', wmm: 130, hmm: 12, run(model) { return longStroke(model, 0.25); } },
  { name: 'the same at 0.1 mm cells', wmm: 130, hmm: 12, run(model) { return longStroke(model, 0.1); } },
  { name: 'fast (250 mm/s, top) and slow (20 mm/s)', wmm: 70, hmm: 22, run(model) {
    const S = newSheet(70, 22, 0.25);
    for (const [y, v] of [[6, 250], [16, 20]]) { const b = roundOf(model, 0.25, 2.5); dip(b, { water: 1, conc: [0.5, 0] }); lay(S, b, [{ x: 5, y, p: 1 }, { x: 65, y, p: 1 }], { speed: v }); }
    return finish(S);
  } },
  { name: 'two overlapping wet sweeps (seam at the middle)', wmm: 70, hmm: 30, run(model) {
    const S = newSheet(70, 30, 0.25);
    for (const y of [11, 19]) { const b = flatOf(model, 0.25, 6, 41 + y); dip(b, { water: 1, conc: [0.25, 0.08] }); lay(S, b, [{ x: 5, y, p: 0.9 }, { x: 65, y, p: 0.9 }], { upright: 'sweep' }); }
    const f = finish(S); f.seam = { row: Math.round(15 / 0.25), half: Math.round(1.5 / 0.25), x0: Math.round(15 / 0.25), x1: Math.round(55 / 0.25) };
    return f;
  } },
  { name: 'loaded stroke into a glossy wash', wmm: 70, hmm: 30, run(model) {
    const S = newSheet(70, 30, 0.25); glossyWash(S, [0.06, 0.12]);
    const b = roundOf(model, 0.25, 2.5); dip(b, { water: 1, conc: [0.6, 0] }); lay(S, b, [{ x: 10, y: 15, p: 1 }, { x: 60, y: 15, p: 1 }]);
    return finish(S);
  } },
  { name: 'damp clean stroke through a wet wash', wmm: 70, hmm: 30, run(model) {
    const S = newSheet(70, 30, 0.25); glossyWash(S, [0.6, 0.2]);
    const b = washRoundOf(model, 0.25, 3); dip(b, { water: 1, conc: [0, 0] }); thirsty(b, { water: 0.15 }); lay(S, b, [{ x: 10, y: 15, p: 1 }, { x: 60, y: 15, p: 1 }]);
    const f = finish(S), mm = 0.25, x0 = Math.round(20 / mm), x1 = Math.round(50 / mm), prof = rowProfile(f.od, f.w, f.h, x0, x1), band = (a, b) => { let t = 0; for (let y = Math.round(a / mm); y < Math.round(b / mm); y++) t += prof[y]; return t / Math.round((b - a) / mm); };
    f.lifted = { stroke: band(14, 16), wash: (band(7, 10) + band(20, 23)) / 2 };
    return f;
  } },
  { name: 'five sweeps of a flat wash down a 40 mm square', wmm: 50, hmm: 50, run(model) {
    const S = newSheet(50, 50, 0.25);
    for (let k = 0; k < 5; k++) { const y = 9 + k * 8, b = flatOf(model, 0.25, 6, 60 + k); dip(b, { water: 1, conc: [0.18, 0.06] }); const [a, z] = k % 2 ? [45, 5] : [5, 45]; lay(S, b, [{ x: a, y, p: 0.9 }, { x: z, y, p: 0.9 }], { upright: 'sweep' }); }
    return finish(S);
  } },
];
function longStroke(model, mm) {
  const S = newSheet(130, 12, mm), b = roundOf(model, mm, 2.5);
  dip(b, { water: 1, conc: [0.5, 0] }); lay(S, b, [{ x: 5, y: 6, p: 1 }, { x: 125, y: 6, p: 1 }]);
  const f = finish(S), per = pigmentPerMm(S.sheet, mm);
  f.measure = { runOutMm: runOut(per, mm, 5), pigmentPerMm5to15: meanBetween(per, mm, 5, 5, 15) };
  return f;
}
// a wash already standing on the sheet: water and paint over the middle 60 x 20 mm, pores full, glossy
function glossyWash(S, conc) {
  const { sheet, w, h, mm } = S;
  for (let y = Math.round(5 / mm); y < Math.round(25 / mm); y++) for (let x = Math.round(5 / mm); x < Math.round(65 / mm); x++) { const i = y * w + x; sheet.s[i] = sheet.paper.capacity[i]; deposit(sheet, i, 0.12, conc.map(c => c * 0.12)); }
  for (let k = 0; k < 20; k++) step(sheet, PHYSICS);
}

// --- S2 panels -------------------------------------------------------------------------------------------------
const S2 = [
  { name: 'pressure 0 to 1 to 0 along a line', wmm: 90, hmm: 14, run(model) {
    const S = newSheet(90, 14, 0.25), b = roundOf(model, 0.25, 2.5), pts = [];
    for (let k = 0; k <= 80; k++) { const u = k / 80; pts.push({ x: 5 + 80 * u, y: 7, p: Math.sin(Math.PI * u) }); }
    dip(b, { water: 1, conc: [0.5, 0] }); lay(S, b, pts);
    const f = finish(S); f.ramp = pts; return f;
  } },
  { name: 'S-curve at constant pressure', wmm: 90, hmm: 30, run(model) {
    const S = newSheet(90, 30, 0.25), b = roundOf(model, 0.25, 2.5), pts = [];
    for (let k = 0; k <= 160; k++) { const u = k / 160; pts.push({ x: 5 + 80 * u, y: 15 + 9 * Math.sin(2 * Math.PI * u), p: 0.8 }); }
    dip(b, { water: 1, conc: [0.5, 0] }); lay(S, b, pts); return finish(S);
  } },
  { name: '45 degree line: round (left), flat on edge (right)', wmm: 90, hmm: 40, run(model) {
    const S = newSheet(90, 40, 0.25);
    const r = roundOf(model, 0.25, 1.5); dip(r, { water: 1, conc: [0.5, 0] }); lay(S, r, [{ x: 5, y: 5, p: 0.8 }, { x: 37, y: 37, p: 0.8 }]);
    const fl = flatOf(model, 0.25, 6, 77, { bladeAngle: 0 }); dip(fl, { water: 1, conc: [0.5, 0] }); lay(S, fl, [{ x: 50, y: 5, p: 0.8 }, { x: 82, y: 37, p: 0.8 }]);
    return finish(S);
  } },
  { name: 'tap (left) and a leaf: press and lift (right)', wmm: 60, hmm: 24, run(model) {
    const S = newSheet(60, 24, 0.25), b = roundOf(model, 0.25, 2.5);
    dip(b, { water: 1, conc: [0.5, 0] }); lay(S, b, [{ x: 10, y: 12, p: 0 }, { x: 10.6, y: 12, p: 1 }, { x: 11.2, y: 12, p: 0 }], { speed: 8 }); // a tap: the hand barely moves
    const c = roundOf(model, 0.25, 2.5, 33), pts = [];
    for (let k = 0; k <= 40; k++) { const u = k / 40; pts.push({ x: 25 + 28 * u, y: 16 - 8 * u, p: Math.sin(Math.PI * u) ** 0.8 }); }
    dip(c, { water: 1, conc: [0.5, 0] }); lay(S, c, pts); return finish(S);
  } },
  { name: 'a wash edge cut along a curve with the belly, then filled', wmm: 70, hmm: 50, run(model) {
    const S = newSheet(70, 50, 0.25), b = washRoundOf(model, 0.25, 3), pts = [];
    for (let k = 0; k <= 60; k++) { const a = Math.PI * (0.1 + 0.8 * k / 60); pts.push({ x: 35 - 28 * Math.cos(a), y: 44 - 34 * Math.sin(a), p: 1 }); }
    dip(b, { water: 1, conc: [0.2, 0.08] }); lay(S, b, pts);
    for (let k = 0; k < 3; k++) { const f = flatOf(model, 0.25, 5, 90 + k); dip(f, { water: 1, conc: [0.2, 0.08] }); const y = 22 + k * 8; lay(S, f, [{ x: 16, y, p: 0.9 }, { x: 54, y, p: 0.9 }], { upright: 'sweep' }); }
    return finish(S);
  } },
];

// --- layout ------------------------------------------------------------------------------------------------------
const panels = STAGE === 's2' ? S2 : S1, results = {};
const label = (t, x, y, size = 30) => `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#333">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
const GAP = 40, HEAD = 50, colW = Math.max(...panels.map(p => p.wmm)) * PX;
const rowsH = panels.map(p => p.hmm * PX + HEAD);
const realTiles = REAL ? await realCrops(REAL, REAL_MM) : [], realW = realTiles.length ? Math.max(...realTiles.map(t => t.w)) + GAP : 0;
const W = MODELS.length * colW + (MODELS.length + 1) * GAP + realW, H = Math.max(rowsH.reduce((a, b) => a + b + GAP, 0), realTiles.reduce((a, t) => a + t.h + GAP, 0)) + 80;
const comps = [], svg = [label(`brush ${STAGE}: ${MODELS.join(' | ')} (40 px a mm)`, GAP, 50, 40)];
let y = 80;
for (const [pi, p] of panels.entries()) {
  for (const [mi, model] of MODELS.entries()) {
    const t0 = Date.now(), r = p.run(model), x = GAP + mi * (colW + GAP);
    const img = await sharp(r.rgb, { raw: { width: r.w, height: r.h, channels: 3 } }).resize(Math.round(p.wmm * PX), Math.round(p.hmm * PX), { kernel: 'lanczos3' }).png().toBuffer();
    comps.push({ input: img, left: x, top: y + HEAD });
    const m = measurePanel(STAGE, pi, r);
    svg.push(label(`${model}: ${p.name}${m.text ? ' — ' + m.text : ''}`, x, y + 36));
    (results[p.name] ??= {})[model] = { ...m.values, seconds: (Date.now() - t0) / 1000 };
    console.log(`${p.name} [${model}] ${m.text} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  y += rowsH[pi] + GAP;
}
{ let ry = 80; const rx = GAP + MODELS.length * (colW + GAP); svg.push(label('real watercolour, same scale', rx, 50, 30)); for (const t of realTiles) { comps.push({ input: t.img, left: rx, top: ry }); ry += t.h + GAP; } }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } }, limitInputPixels: false })
  .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`), left: 0, top: 0, limitInputPixels: false }])
  .jpeg({ quality: 85 }).toFile(OUT);
console.log(`${OUT}: ${W}x${H}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));

function measurePanel(stage, pi, r) {
  if (stage === 's1' && r.measure) return { values: r.measure, text: `run-out ${r.measure.runOutMm.toFixed(0)} mm, ${r.measure.pigmentPerMm5to15.toFixed(3)} a mm` };
  if (stage === 's1' && r.lifted) return { values: r.lifted, text: `OD ${r.lifted.stroke.toFixed(3)} under the stroke, ${r.lifted.wash.toFixed(3)} in the wash` };
  if (stage === 's1' && r.seam) { const prof = rowProfile(r.od, r.w, r.h, r.seam.x0, r.seam.x1), s = seamStep(prof, r.seam.row, r.seam.half); return { values: s, text: `seam step ${s.step.toFixed(3)} OD` }; }
  if (stage === 's2' && r.ramp) {
    const wid = widthAlongX(r.od, r.w, r.h, 0.25), mm = 0.25, at = x => wid[Math.round(x / mm)] * mm;
    const peak = Math.max(...wid) * mm, end = at(83), mid = at(45);
    return { values: { peakWidthMm: peak, midWidthMm: mid, widthAt83Mm: end }, text: `width ${mid.toFixed(1)} mm at p 1, ${end.toFixed(2)} mm 2 mm from the end` };
  }
  return { values: {}, text: '' };
}

// The crops of a 5 x 2 grid image, each scaled from mmPx millimetres a pixel to PX a millimetre (a label strip under each cut off).
async function realCrops(file, mmPx) {
  const meta = await sharp(file).metadata(), cw = Math.floor(meta.width / 5), ch = Math.floor(meta.height / 2), strip = Math.round(ch * 0.06), out = [];
  for (const k of REAL_PICK) {
    const r = Math.floor((k - 1) / 5), c = (k - 1) % 5;
    const w = Math.round((cw - 6) * mmPx * PX), h = Math.round((ch - strip - 6) * mmPx * PX);
    out.push({ w, h, img: await sharp(file).extract({ left: c * cw + 3, top: r * ch + 3, width: cw - 6, height: ch - strip - 6 }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer() });
  }
  return out;
}
