#!/usr/bin/env node
// The wash test sheet: the dried cases of tools/lab/wash-cases.mjs, for one or more versions, under real watercolour
// crops at the same scale in mm, with each panel's rim contrast and grain printed on it.
//   node tools/lab/wash-sheet.mjs --runs head=<dir>,v0.1.1=<dir> --refs <refs dir> --out sheet.jpg [--json numbers.json] [--title text]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { luminance, densityOf, rimContrast, grainContrast, bandSpectrum } from './wash-measure.mjs';
import { bloomFront, discProfile, squareRims, discContrast } from './wash-acceptance.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const RUNS = arg('runs', '').split(',').filter(Boolean).map(e => { const [label, dir] = e.split('='); return { label, dir, info: JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8')) }; });
const OUT = path.resolve(arg('out', 'wash-sheet.jpg')), REFS = arg('refs', null), PX = Number(arg('px', 20));
const PAPER_Y = luminance(new Uint8Array([246, 245, 239]), 1)[0];
// real crops of washes at a known scale (refs/crops-index.tsv): granulating skies and seas, a pooled sky, a flat sky
const REF_NAMES = (arg('refnames', 'granul-gulfstream-sky,granul-hurricane-sea,granul-moran,pooled-guide-sky')).split(',');
const fmt = (v, d = 2) => (v == null ? '-' : v.toFixed(d));

async function realCrops() {
  if (!REFS) return [];
  const rows = fs.readFileSync(path.join(REFS, 'crops-index.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
  const out = [];
  for (const name of REF_NAMES) {
    const row = rows.find(r => path.basename(r[0]).startsWith(name + '__')); if (!row || row[4] === 'unknown') continue;
    const mm = Number(row[4]), file = path.join(REFS, row[0]);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // the paper's own white: the 99.5th percentile luminance of the whole painting the crop came from
    const src = await sharp(path.join(REFS, row[1])).removeAlpha().resize(800).raw().toBuffer({ resolveWithObject: true });
    const sy = Float64Array.from(luminance(src.data, src.info.width * src.info.height)).sort(), paperY = sy[Math.floor(0.995 * (sy.length - 1))];
    const w = info.width, h = info.height, od = densityOf(luminance(data, w * h), paperY), all = new Uint8Array(w * h).fill(1);
    const n = 1 << Math.floor(Math.log2(Math.min(w, h))), x0 = (w - n) >> 1, y0 = (h - n) >> 1;
    const g2 = grainContrast(od, w, h, mm, all, 0.2, 1), g4 = grainContrast(od, w, h, mm, all, 0.5, 1.5), spec = bandSpectrum(od, w, mm, x0, y0, n);
    const mean = g4.mean, rel = Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v == null ? null : v / mean]));
    out.push({ name, mm, file, w, h, grain02: g2 && g2.relative, grain04: g4.relative, meanOD: mean, spectrum: rel });
  }
  return out;
}

function measureRun(run, c) {
  const rgb = fs.readFileSync(path.join(run.dir, c.file)), { w, h, mm } = c, od = densityOf(luminance(rgb, w * h), PAPER_Y);
  const rim = c.name.startsWith('puddle') ? discContrast(od, w, h, mm) : rimContrast(od, w, h, mm), g2 = grainContrast(od, w, h, mm, rim.interiorMask, 0.2, 1), g4 = grainContrast(od, w, h, mm, rim.interiorMask, 0.5, 1.5);
  // the spectrum of the density in the middle of the wash, relative to its mean
  const n = 1 << Math.floor(Math.log2(Math.round(12 / mm))), x0 = (w - n) >> 1, y0 = (h - n) >> 1, spec = bandSpectrum(od, w, mm, x0, y0, n);
  return { rgb, acceptance: c.name === 'bloom' ? bloomFront(od, w, h, mm) : c.name === 'sweeps' ? squareRims(od, w, h, mm) : c.name.startsWith('puddle') ? discProfile(od, w, h, mm) : null, rim: rim.contrast, rimOD: rim.rim, interiorOD: rim.interior, grain02: g2 && g2.relative, grain04: g4 && g4.relative, spectrum: Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v == null ? null : v / Math.max(1e-6, rim.interior)])) };
}
function paperSpectrum(dir, mm, size) {
  const f = path.join(dir, `paper-${mm}.f32`); if (!fs.existsSync(f)) return null;
  const b = fs.readFileSync(f), hgt = new Float32Array(b.buffer, b.byteOffset, b.length / 4), w = Math.round(size / mm), n = 1 << Math.floor(Math.log2(w));
  return bandSpectrum(hgt, w, mm, 0, 0, n);
}

const refs = await realCrops();
const CASE_NAMES = { puddleU: '(a) 30 mm puddle, ultramarine (granulating)', puddleP: '(a) 30 mm puddle, phthalo (staining)', sweeps: '(b) 40 mm square in five sweeps', bloom: '(c) a wetter drop into a damp wash (bloom)' };
const cases = [...new Set(RUNS.flatMap(r => r.info.runs.map(c => c.name)))];
const cols = [...new Set(RUNS.flatMap(r => r.info.runs.map(c => `${c.mode}@${c.mm}`)))];
const SIZE = RUNS[0].info.size, panel = SIZE * PX, GAP = 30, HEAD = 88, numbers = { refs, runs: {} };
const label = (t, x, y, size = 24, fill = '#222') => `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${fill}">${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
const comps = [], svg = [];
let y = 20;
svg.push(label(arg('title', `wash sheet: ${RUNS.map(r => r.label).join(' | ')}; ${PX} px a mm`), GAP, y + 30, 36)); y += 60;
for (const r of RUNS) for (const mm of [...new Set(r.info.runs.map(c => c.mm))]) {
  const s = paperSpectrum(r.dir, mm, SIZE);
  if (s) { svg.push(label(`${r.label} paper relief at ${mm} mm cells, RMS height (0..1 range) at 0.1/0.2/0.5/1/2 mm: ${[0.1, 0.2, 0.5, 1, 2].map(k => fmt(s[k], 4)).join(' / ')}`, GAP, y + 26)); y += 34; (numbers.paper ??= {})[`${r.label}@${mm}`] = s; }
}
// real crops, same scale
if (refs.length) {
  y += 10; svg.push(label('real washes, same scale (grain = SD of density at 0.2-1 mm / 0.5-1.5 mm over mean density; spectrum = RMS density over mean at 0.2/0.5/1/2 mm)', GAP, y + 26)); y += HEAD;
  let x = GAP, rowH = 0;
  for (const c of refs) {
    const pw = Math.round(c.w * c.mm * PX), ph = Math.round(c.h * c.mm * PX), cw = Math.min(pw, panel * 2), ch = Math.min(ph, panel);
    const img = await sharp(c.file).resize(pw, ph, { kernel: 'lanczos3' }).extract({ left: 0, top: 0, width: cw, height: ch }).png().toBuffer();
    comps.push({ input: img, left: x, top: y + 40 });
    svg.push(label(`${c.name} (${c.mm} mm/px): grain ${fmt(c.grain02, 3)} / ${fmt(c.grain04, 3)}; mean OD ${fmt(c.meanOD)}`, x, y + 14, 20));
    svg.push(label(`spectrum ${[0.2, 0.5, 1, 2].map(k => fmt(c.spectrum[k], 3)).join(' / ')}`, x, y + 36, 20));
    x += cw + GAP; rowH = Math.max(rowH, ch + 40);
  }
  y += rowH + GAP;
}
// The six strokes of tools-lab-compare/engine-cases.mjs (wash, cross, bar on dry, bar on wet, bloom, pen; 60 x 40 mm at
// 0.2 mm a cell) for each version given by --engine label=<dir>,..., one row a version, under one real crop
const ENGINE = arg('engine', '').split(',').filter(Boolean).map(e => { const [label, dir] = e.split('='); return { label, dir }; });
if (ENGINE.length) {
  const EPX = Number(arg('enginepx', 11)), cases = ['wash', 'cross', 'barDry', 'barWet', 'bloom', 'pen'];
  svg.push(label(`the six strokes of the version comparison (looks/engine-versions-cpu.jpg), ${EPX} px a mm`, GAP, y + 30, 30)); y += 44;
  if (refs.length) {
    const c = refs[0], pw = Math.round(c.w * c.mm * EPX), ph = Math.round(c.h * c.mm * EPX), cw = Math.min(pw, 6 * 60 * EPX), ch = Math.min(ph, 40 * EPX);
    comps.push({ input: await sharp(c.file).resize(pw, ph, { kernel: 'lanczos3' }).extract({ left: 0, top: 0, width: cw, height: ch }).png().toBuffer(), left: GAP, top: y + 30 });
    svg.push(label(`real: ${c.name}, same scale`, GAP, y + 22, 22)); y += ch + 30 + GAP;
  }
  for (const e of ENGINE) {
    const info = JSON.parse(fs.readFileSync(path.join(e.dir, 'info-cpu.json'), 'utf8'));
    svg.push(label(e.label, GAP, y + 22, 24));
    for (const [k, name] of cases.entries()) {
      const f = path.join(e.dir, `${name}-cpu.rgb`); if (!fs.existsSync(f)) continue;
      const img = await sharp(fs.readFileSync(f), { raw: { width: info.W, height: info.H, channels: 3 } }).resize(Math.round(info.W * 0.2 * EPX), Math.round(info.H * 0.2 * EPX), { kernel: 'lanczos3' }).png().toBuffer();
      comps.push({ input: img, left: GAP + k * (60 * EPX + 10), top: y + 30 });
      svg.push(label(name, GAP + k * (60 * EPX + 10) + 4, y + 30 + 40 * EPX - 6, 18, '#555'));
    }
    y += 40 * EPX + 30 + GAP;
  }
}
// rows: one per case and version; columns: one per mode and cell size
let W = GAP + cols.length * (panel + GAP);
for (const name of cases) for (const r of RUNS) {
  svg.push(label(`${CASE_NAMES[name] ?? name}: ${r.label}`, GAP, y + 30, 30)); y += 44;
  for (const [ci, col] of cols.entries()) {
    const c = r.info.runs.find(q => q.name === name && `${q.mode}@${q.mm}` === col); if (!c) continue;
    const m = measureRun(r, c), x = GAP + ci * (panel + GAP);
    (numbers.runs[r.label] ??= {})[`${name} ${col}`] = { ...m, rgb: undefined, steps: c.steps, seconds: c.seconds };
    svg.push(label(`${c.mode}, ${c.mm} mm cells: rim ${fmt(m.rim)} (OD ${fmt(m.rimOD)} / ${fmt(m.interiorOD)}), grain ${fmt(m.grain02, 3)} / ${fmt(m.grain04, 3)}`, x, y + 22, 20));
    svg.push(label(`spectrum ${[0.2, 0.5, 1, 2].map(k => fmt(m.spectrum[k], 3)).join(' / ')}; ${c.steps} steps, ${c.seconds} s`, x, y + 46, 20));
    const detail = name === 'bloom' ? `bloom ring/centre ${fmt(m.acceptance.contrast)}; fitted radius RMS ${fmt(m.acceptance.radiusRms, 3)} mm` : name === 'sweeps' ? `four-side rim deviation ${fmt(100 * m.acceptance.deviation, 1)}%` : name.startsWith('puddle') ? `interior radial deviation ${fmt(100 * m.acceptance.flatness, 1)}%; physical 1 mm annulus` : '';
    if (detail) svg.push(label(detail, x, y + 70, 20));
    const img = await sharp(m.rgb, { raw: { width: c.w, height: c.h, channels: 3 } }).resize(panel, panel, { kernel: 'lanczos3' }).png().toBuffer();
    comps.push({ input: img, left: x, top: y + HEAD });
  }
  y += panel + HEAD + GAP;
}
const H = y + 20; W = Math.max(W, 1600);
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } }, limitInputPixels: false })
  .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`), left: 0, top: 0, limitInputPixels: false }])
  .jpeg({ quality: 88 }).toFile(OUT);
if (arg('json', null)) fs.writeFileSync(arg('json'), JSON.stringify(numbers, null, 1));
console.log(`${OUT}: ${W}x${H}`);
for (const c of refs) console.log(`real ${c.name}: grain ${fmt(c.grain02, 3)} / ${fmt(c.grain04, 3)}, spectrum ${JSON.stringify(Object.fromEntries(Object.entries(c.spectrum).map(([k, v]) => [k, v && +v.toFixed(3)])))}`);
for (const [l, rs] of Object.entries(numbers.runs)) for (const [k, m] of Object.entries(rs)) console.log(`${l} ${k}: acceptance ${JSON.stringify(m.acceptance)}, rim ${fmt(m.rim)}, grain ${fmt(m.grain02, 3)} / ${fmt(m.grain04, 3)}, spectrum ${JSON.stringify(Object.fromEntries(Object.entries(m.spectrum).map(([q, v]) => [q, v && +v.toFixed(3)])))}`);
