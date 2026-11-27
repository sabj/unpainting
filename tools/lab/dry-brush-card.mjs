#!/usr/bin/env node
// A material swatch through Paint Lab's shipped media, with no target or plan: the deposited pigment of three fast,
// damp flats on dry cold press. The final renderer reads those deposits without changing the simulated sheet.
// node tools/lab/dry-brush-card.mjs [output directory] [mm per cell]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../demos/lab/media/paper.js';
import { createSheet, dry, layersOf, totals, DEFAULTS } from '../../demos/lab/media/sheet.js';
import { createBrush, dip, stroke } from '../../demos/lab/media/brush.js';
import { renderLayers } from '../../demos/lab/media/km.js';
import { subcellLayers } from '../../src/media/subcell-grain.mjs';

const out = path.resolve(process.argv[2] ?? 'work/lead-04/work/proof/render-dry');
const mm = Number(process.argv[3] ?? 0.26), N = 4;
if (!(mm > 0 && mm <= 0.5)) throw new Error('mm per cell must be in (0, 0.5]');
fs.mkdirSync(out, { recursive: true });
const pigment = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85 };
const w = Math.round(50 / mm), h = Math.round(20 / mm), FW = w * N, FH = h * N;
const paper = makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } });
const background = n => Uint8Array.from({ length: n * 3 }, (_, i) => [246, 245, 239][i % 3]);
const metrics = sheet => {
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = Math.round(8 / mm); x < Math.round(42 / mm); x++)
    if (Math.abs((y + 0.5) * mm - 10.25) < 4) cells.push(y * w + x);
  const med = Float32Array.from(cells, i => paper.height[i]).sort()[cells.length >> 1];
  const mass = new Float64Array(sheet.n);
  for (const layer of layersOf(sheet)) for (const plane of layer) for (let i = 0; i < mass.length; i++) mass[i] += plane[i];
  const p90 = Float64Array.from(cells, i => mass[i]).sort()[Math.floor(cells.length * 0.9)];
  let paint = 0, crests = 0, covered = 0;
  for (const i of cells) { paint += mass[i]; if (paper.height[i] > med) crests += mass[i]; if (mass[i] > 0.1 * p90) covered++; }
  return { coverage: covered / cells.length, pigmentOnCrests: crests / paint, p90 };
};
const report = { mmPerCell: mm, outputMmPerPixel: mm / N, backend: 'cpu', kind: 'synthetic contact swatches', strokes: [] };
const tiles = [], labels = [], GAP = 18, HEAD = 100, ROWHEAD = 60, WIDTH = FW + 2 * GAP;
let top = HEAD;
for (const water of [0.2, 0.4, 0.6]) {
  const sheet = createSheet(structuredClone(paper), [pigment]), r = 5 / mm;
  const b = createBrush({ model: 'section', flat: true, radius: r, bristles: Math.ceil(r * 2), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed: 70 });
  dip(b, { water, conc: [1.5] });
  stroke(b, sheet, [{ x: 5 / mm, y: 10 / mm, p: 0.9 }, { x: 45 / mm, y: 10.5 / mm, p: 0.9 }], { upright: 'sweep', speed: 250 });
  const wet = metrics(sheet), before = totals(sheet).pig[0];
  const stem = `water-${water.toFixed(1)}`;
  await sharp(Buffer.from(renderLayers(layersOf(sheet), [pigment], background(sheet.n), sheet.n)), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, `${stem}-wet-native.png`));
  dry(sheet, 200000, { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 }, { levelMax: 200, dt: 14, analyticTail: true });
  const after = totals(sheet).pig[0], dried = metrics(sheet), layers = layersOf(sheet);
  await sharp(Buffer.from(renderLayers(layers, [pigment], background(sheet.n), sheet.n)), { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(out, `${stem}-dry-native.png`));
  const fine = subcellLayers(layers, [pigment], paper, N);
  const finePigmentMass = fine.reduce((sum, layer) => sum + layer[0].reduce((s, v) => s + v, 0), 0) / (N * N);
  const finePigmentRatio = finePigmentMass / after;
  if (Math.abs(finePigmentRatio - 1) > 1e-6) throw new Error(`pigment lost in final reconstruction at water ${water}`);
  const rgb = renderLayers(fine, [pigment], background(FW * FH), FW * FH);
  const tile = await sharp(Buffer.from(rgb), { raw: { width: FW, height: FH, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(path.join(out, `${stem}-dry.png`), tile);
  labels.push(`<text x="${GAP}" y="${top + 26}" font-size="22">Water ${water}: wet coverage ${(100 * wet.coverage).toFixed(1)}%, pigment on crests ${(100 * wet.pigmentOnCrests).toFixed(1)}%</text>`);
  tiles.push({ input: tile, left: GAP, top: top + ROWHEAD });
  top += ROWHEAD + FH + GAP;
  report.strokes.push({ water, pressure: 0.9, speedMmPerSecond: 250, wet, dry: dried, pigmentBeforeDry: before, pigmentAfterDry: after, dryMassRatio: after / before, finePigmentMass, finePigmentRatio });
  if (Math.abs(after / before - 1) > 1e-5) throw new Error(`pigment lost while drying water ${water}`);
}
const height = top + 50;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}"><g font-family="Helvetica,Arial,sans-serif" fill="#222"><text x="${GAP}" y="35" font-size="28">Dry brush: deposited pigment on cold-press crests</text><text x="${GAP}" y="67" font-size="19">50 x 20 mm swatches; ${mm} mm cells; ${mm / N} mm final pixels; CPU</text>${labels.join('')}<text x="${GAP}" y="${height - 22}" font-size="18">Material card only. Full painting and GPU proof remain pending.</text></g></svg>`;
await sharp({ create: { width: WIDTH, height, channels: 3, background: '#ffffff' } }).composite([...tiles, { input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 93 }).toFile(path.join(out, 'SHEET.jpg'));
fs.writeFileSync(path.join(out, 'dry-brush-card.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
