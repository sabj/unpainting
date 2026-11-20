#!/usr/bin/env node
// The granulation sheet: real watercolour crops on top, then the dried cases of tools/lab/wash-cases.mjs (a granulating
// and a staining puddle, a graded wash, a dry-brush drag) and the six version-comparison strokes, each as a 20 mm
// window at the same scale (40 px a mm by default), before and after, with the grain measured on each tile.
//   node tools/lab/grain-sheet.mjs --before <cases dir> --after <cases dir> --enginebefore <dir> --engineafter <dir>
//        --refs <refs dir> --out grain.jpg [--px 40] [--json numbers.json] [--subroot <repo with subcell-grain.mjs>]
// --before/--after take one or more case dirs, comma separated (cases.json with .rgb and .mass.f32 per run).
// The engine dirs hold <case>-cpu.rgb and info-cpu.json from the version comparison's engine-cases.mjs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { luminance, densityOf, rimContrast, grainContrast, washMask, insideDistance } from './wash-measure.mjs';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const PX = Number(arg('px', 40)), WIN = 20, TILE = WIN * PX, GAP = 24, HEAD = 58, OUT = path.resolve(arg('out', 'grain-sheet.jpg'));
const REFS = arg('refs', null), PAPER_Y = luminance(new Uint8Array([246, 245, 239]), 1)[0], ENGINE_PAPER_Y = luminance(new Uint8Array([246, 246, 246]), 1)[0];
const REF_NAMES = arg('refnames', 'granul-moran,granul-gulfstream-sky,granul-hurricane-sea,flat-sky,whitewater-drag').split(',');
const fmt = (v, d = 3) => (v == null ? '-' : v.toFixed(d));
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = [], comps = [], numbers = { refs: [], tiles: [] };
const text = (t, x, y, size = 22, fill = '#222') => svg.push(`<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${fill}">${esc(t)}</text>`);
let y = 20, W = 0;

/** The grain of a density field inside `mask`: SD over mean at 0.2-1 mm (when the grid resolves it) and 0.5-1.5 mm. */
const grainOf = (od, w, h, mm, mask) => ({ fine: grainContrast(od, w, h, mm, mask, 0.2, 1)?.relative ?? null, mid: grainContrast(od, w, h, mm, mask, 0.5, 1.5)?.relative ?? null });
// a WIN mm window of a raw RGB field (w x h cells of mm) about (cx, cy) mm, scaled to PX a mm
async function windowOf(rgb, w, h, mm, cx, cy) {
  const s = Math.round(WIN / mm), x0 = Math.max(0, Math.min(w - s, Math.round(cx / mm - s / 2))), y0 = Math.max(0, Math.min(h - s, Math.round(cy / mm - s / 2)));
  return sharp(Buffer.from(rgb), { raw: { width: w, height: h, channels: 3 } }).extract({ left: x0, top: y0, width: s, height: s }).resize(TILE, TILE, { kernel: 'lanczos3' }).png().toBuffer();
}
function row(title) { text(title, GAP, y + 30, 30); y += 44; }
function tile(img, ci, lines) { const x = GAP + ci * (TILE + GAP); comps.push({ input: img, left: x, top: y + HEAD }); lines.forEach((l, k) => text(l, x, y + 22 + 24 * k, 20)); W = Math.max(W, x + TILE + GAP); }

text(arg('title', `granulation sheet: ${PX} px a mm, every tile a ${WIN} mm window; grain = SD of optical density in the band over its mean (0.2-1 mm / 0.5-1.5 mm)`), GAP, y + 30, 32); y += 60;

// 1. real crops, same scale
if (REFS) {
  const rows = fs.readFileSync(path.join(REFS, 'crops-index.tsv'), 'utf8').trim().split('\n').slice(1).map(l => l.split('\t'));
  row('real washes and a real dry-brush drag (Homer, Sargent, Moran; museum scans), same scale');
  let ci = 0;
  for (const name of REF_NAMES) {
    const r = rows.find(q => path.basename(q[0]).startsWith(name + '__')); if (!r || r[4] === 'unknown') continue;
    const mm = Number(r[4]), file = path.join(REFS, r[0]);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const src = await sharp(path.join(REFS, r[1])).removeAlpha().resize(800).raw().toBuffer({ resolveWithObject: true });
    const sy = Float64Array.from(luminance(src.data, src.info.width * src.info.height)).sort(), paperY = sy[Math.floor(0.995 * (sy.length - 1))];
    const od = densityOf(luminance(data, info.width * info.height), paperY), g = grainOf(od, info.width, info.height, mm, new Uint8Array(info.width * info.height).fill(1));
    const s = Math.min(info.width, info.height, Math.floor(WIN / mm)), side = Math.min(TILE, Math.round(s * mm * PX));
    const img = await sharp(file).removeAlpha().extract({ left: 0, top: 0, width: s, height: s }).resize(side, side, { kernel: 'lanczos3' }).extend({ right: TILE - side, bottom: TILE - side, background: '#ffffff' }).png().toBuffer();
    tile(img, ci++, [`${name} (${mm} mm a px)`, `grain ${fmt(g.fine)} / ${fmt(g.mid)}`]);
    numbers.refs.push({ name, mm, ...g });
  }
  y += TILE + HEAD + GAP;
}

// 2. the wash cases, before and after, at each cell size
// a version may be several case dirs, comma separated; each run remembers its own dir
const load = dirs => { const runs = []; for (const dir of dirs.split(',')) { const info = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8')); for (const r of info.runs) runs.push({ ...r, dir, pigments: info.pigments }); } return { info: { runs } }; };
const versions = [['before', arg('before')], ['after', arg('after')]].filter(v => v[1]).map(([l, d]) => ({ label: l, ...load(d) }));
const CASES = { puddleU: 'a 30 mm puddle of ultramarine (granulating)', puddleP: 'a 30 mm puddle of phthalo (staining)', graded: 'a graded ultramarine wash, strong at the top', drag: 'a nearly dry flat dragged over dry paper (dry brush)' };
const cells = [...new Set(versions.flatMap(v => v.info.runs.map(r => r.mm)))].filter(mm => mm >= 0.1).sort((a, b) => b - a);
for (const [name, title] of Object.entries(CASES)) {
  if (!versions.some(v => v.info.runs.some(r => r.name === name))) continue;
  row(`${title}: ${versions.map(v => cells.map(mm => `${v.label} ${mm} mm`).join(', ')).join(' | ')}`);
  let ci = 0;
  for (const v of versions) for (const mm of cells) {
    const c = v.info.runs.find(r => r.name === name && r.mm === mm && r.mode === 'full'); if (!c) { ci++; continue; }
    const rgb = fs.readFileSync(path.join(c.dir, c.file)), od = densityOf(luminance(rgb, c.w * c.h), PAPER_Y);
    let lines;
    if (name === 'drag') {
      // grain over the band the strokes crossed; coverage: cells darker than 0.02 density
      const mask = new Uint8Array(c.w * c.h); let cov = 0, n = 0;
      for (let yy = 0; yy < c.h; yy++) for (let xx = 0; xx < c.w; xx++) { const Y = (yy + 0.5) * mm, X = (xx + 0.5) * mm; if (X > 8 && X < 42 && ((Y > 11 && Y < 19) || (Y > 28 && Y < 36))) { const i = yy * c.w + xx; mask[i] = 1; n++; if (od[i] > 0.02) cov++; } }
      const g = grainOf(od, c.w, c.h, mm, mask);
      lines = [`${v.label}, ${mm} mm cells`, `grain ${fmt(g.fine)} / ${fmt(g.mid)}, covers ${(100 * cov / n).toFixed(0)}% of the band`];
      numbers.tiles.push({ name, version: v.label, mm, ...g, cover: cov / n });
      tile(await windowOf(rgb, c.w, c.h, mm, 25, 24), ci++, lines);
    } else {
      const rim = rimContrast(od, c.w, c.h, mm), g = grainOf(od, c.w, c.h, mm, rim.interiorMask);
      lines = [`${v.label}, ${mm} mm cells: grain ${fmt(g.fine)} / ${fmt(g.mid)}`, `mean density ${fmt(rim.interior, 2)}, rim ${fmt(rim.contrast, 2)}`];
      numbers.tiles.push({ name, version: v.label, mm, ...g, od: rim.interior, rim: rim.contrast });
      tile(await windowOf(rgb, c.w, c.h, mm, 25, name === 'graded' ? 25 : 25), ci++, lines);
    }
  }
  y += TILE + HEAD + GAP;
}

// 2b. sub-cell grain: the after sheet at its coarsest cells rendered at PX a mm with and without the paper evaluated at
// the pixel (src/media/subcell-grain.mjs), beside the finer simulations, each rendered with its own sub-cell grain
const SUBROOT = arg('subroot', null);
if (SUBROOT && versions.length) {
  const { makePaper } = await import(path.join(path.resolve(SUBROOT), 'src/media/paper.mjs')), { subcellLayers } = await import(path.join(path.resolve(SUBROOT), 'src/media/subcell-grain.mjs')), { renderLayers } = await import(path.join(path.resolve(SUBROOT), 'src/media/km.mjs'));
  const after = versions.at(-1), mms = [...new Set(after.info.runs.map(r => r.mm))].sort((a, b) => b - a);
  for (const name of ['puddleU', 'puddleP']) {
    const runs = mms.map(mm => after.info.runs.find(r => r.name === name && r.mm === mm && r.mode === 'full')).filter(Boolean); if (!runs.length) continue;
    row(`${CASES[name]}, after, rendered at ${PX} px a mm: ${runs[0].mm} mm cells as cells, then each simulation with sub-cell grain (the same paper evaluated at the pixel)`);
    let ci = 0;
    const pxmm = 1 / PX, show = async (c, sub) => {
      const N = sub ? Math.max(1, Math.round(c.mm / pxmm)) : 1, mass = new Float32Array(fs.readFileSync(path.join(c.dir, c.file.replace(/\.rgb$/, '.mass.f32'))).buffer.slice(0)), K = c.pigments.length, n = c.w * c.h;
      const layer = c.pigments.map((_, k) => mass.slice(k * n, (k + 1) * n));
      const paper = makePaper(c.w, c.h, { seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: c.mm, coldPress: { mmPerCell: c.mm } });
      const L = sub ? subcellLayers([layer], c.pigments, paper, N) : [layer], FW = c.w * N, FN = FW * c.h * N;
      const rgb = renderLayers(L, c.pigments, new Uint8Array(FN * 3).map((_, i) => [246, 245, 239][i % 3]), FN), mmpx = c.mm / N;
      const od = densityOf(luminance(rgb, FN), PAPER_Y), inner = new Uint8Array(FN);
      for (let y = 0; y < c.h * N; y++) for (let x = 0; x < FW; x++) inner[y * FW + x] = Math.hypot((x + 0.5) * mmpx - 25, (y + 0.5) * mmpx - 25) < 11 ? 1 : 0;
      const g = grainOf(od, FW, c.h * N, mmpx, inner);
      tile(await windowOf(rgb, FW, c.h * N, mmpx, 25, 25), ci++, [`${c.mm} mm cells, ${sub ? `sub-cell grain at ${mmpx.toFixed(3)} mm` : 'as cells'}`, `grain ${fmt(g.fine)} / ${fmt(g.mid)}`]);
      numbers.tiles.push({ name, version: `after ${sub ? 'sub-cell' : 'cells'}`, mm: c.mm, ...g });
    };
    await show(runs[0], false);
    for (const c of runs) await show(c, true);
    if (name === 'puddleU' && numbers.refs.length) {
      // the real crop again, at the end of the row
      const r = numbers.refs.find(q => q.name === 'granul-gulfstream-sky') ?? numbers.refs[0];
      const s = Math.floor(WIN / r.mm), side = Math.min(TILE, Math.round(s * r.mm * PX));
      const img = await sharp(path.join(REFS, fs.readFileSync(path.join(REFS, 'crops-index.tsv'), 'utf8').split('\n').find(l => path.basename(l.split('\t')[0]).startsWith(r.name + '__')).split('\t')[0])).removeAlpha().extract({ left: 0, top: 0, width: s, height: s }).resize(side, side, { kernel: 'lanczos3' }).extend({ right: TILE - side, bottom: TILE - side, background: '#ffffff' }).png().toBuffer();
      tile(img, ci++, [`real: ${r.name}`, `grain ${fmt(r.fine)} / ${fmt(r.mid)}`]);
    }
    y += TILE + HEAD + GAP;
  }
}

// 3. the six strokes of the version comparison, before and after (0.2 mm cells): a 20 mm window at each one's middle
const ENG = [['before', arg('enginebefore')], ['after', arg('engineafter')]].filter(v => v[1]);
const STROKES = { wash: [30, 20], cross: [30, 20], barDry: [30, 19], barWet: [30, 19], bloom: [30, 18], pen: [30, 20] };
for (const [lab, dir] of ENG) {
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'info-cpu.json'), 'utf8')), mm = 0.2;
  row(`the six comparison strokes (wash, cross, bar on dry, bar on wet, bloom, pen), ${lab}, 0.2 mm cells`);
  let ci = 0;
  for (const [name, [cx, cy]] of Object.entries(STROKES)) {
    const f = path.join(dir, `${name}-cpu.rgb`); if (!fs.existsSync(f)) { ci++; continue; }
    const rgb = fs.readFileSync(f), od = densityOf(luminance(rgb, info.W * info.H), ENGINE_PAPER_Y);
    // inside the painted shape, more than a millimetre in
    const d = insideDistance(washMask(od), info.W, info.H), mask = Uint8Array.from(d, v => (v * mm > 1 ? 1 : 0)), g = grainOf(od, info.W, info.H, mm, mask);
    tile(await windowOf(rgb, info.W, info.H, mm, cx, cy), ci++, [`${name}`, `grain - / ${fmt(g.mid)}`]);
    numbers.tiles.push({ name, version: lab, mm, ...g });
  }
  y += TILE + HEAD + GAP;
}

const H = y + 20;
await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } }, limitInputPixels: false })
  .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg.join('')}</svg>`), left: 0, top: 0, limitInputPixels: false }])
  .jpeg({ quality: 88 }).toFile(OUT);
if (arg('json', null)) fs.writeFileSync(arg('json'), JSON.stringify(numbers, null, 1));
console.log(`${OUT}: ${W}x${H}`);
for (const r of numbers.refs) console.log(`real ${r.name}: grain ${fmt(r.fine)} / ${fmt(r.mid)}`);
for (const t of numbers.tiles) console.log(`${t.version} ${t.name} ${t.mm} mm: grain ${fmt(t.fine)} / ${fmt(t.mid)}${t.cover != null ? `, cover ${t.cover.toFixed(2)}` : ''}`);
