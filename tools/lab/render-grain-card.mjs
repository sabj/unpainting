#!/usr/bin/env node
// A physical 40 mm poured wash, not a subject comparison. Reproduce the narrow-band final-render check:
// node tools/lab/render-grain-card.mjs [output directory]
// CPU simulation is deliberate; this tool provides no GPU painting or full-size render-time evidence.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, dry, totals, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { physicalOf, physicsFields } from '../../src/media/pigment-physical.mjs';
import { subcellLayers } from '../../src/media/subcell-grain.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { luminance, densityOf, grainContrast } from './wash-measure.mjs';

const out = path.resolve(process.argv[2] ?? 'work/lead-04/work/proof/render-dry');
fs.mkdirSync(out, { recursive: true });
const pigment = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) };
const paperRGB = [246, 245, 239], paperY = luminance(new Uint8Array(paperRGB), 1)[0];
const background = n => Uint8Array.from({ length: n * 3 }, (_, i) => paperRGB[i % 3]);
const results = [], tiles = [], captions = [];
const TILE = 500, GAP = 24, TOP = 110;
for (const mm of [0.26, 0.1]) {
  const w = Math.round(46 / mm), n = w * w;
  const paper = makePaper(w, w, { cockle: { rmsMm: 0 }, seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } });
  const sheet = createSheet(paper, [pigment]);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const X = (x + 0.5) * mm, Y = (y + 0.5) * mm;
    if (X > 3 && X < 43 && Y > 3 && Y < 43) deposit(sheet, y * w + x, 0.3, [1.2 * 0.3]);
  }
  const before = totals(sheet).pig[0];
  dry(sheet, 200000, { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 }, { levelMax: 200, dt: 2 });
  const after = totals(sheet).pig[0], layers = layersOf(sheet);
  if (Math.abs(after / before - 1) > 1e-5) throw new Error(`dry pigment balance at ${mm} mm`);
  for (const native of mm === 0.1 ? [true, false] : [false]) {
    const N = native ? 1 : Math.round(mm / 0.025), W = w * N, count = W * W, pixelMm = mm / N;
    const fine = native ? layers : subcellLayers(layers, [pigment], paper, N);
    const fineMass = fine.reduce((sum, layer) => sum + layer[0].reduce((s, v) => s + v, 0), 0) / (N * N);
    if (Math.abs(fineMass / after - 1) > 1e-6 || totals(sheet).pig[0] !== after) throw new Error('reconstruction changed pigment');
    const rgb = Buffer.from(renderLayers(fine, [pigment], background(count), count));
    const od = densityOf(luminance(rgb, count), paperY);
    // Exactly the same 30 mm interior window at every simulation and output density.
    const mask = Uint8Array.from({ length: count }, (_, i) => Math.abs((i % W + 0.5) * pixelMm - 23) < 15 && Math.abs((Math.floor(i / W) + 0.5) * pixelMm - 23) < 15 ? 1 : 0);
    const grain = grainContrast(od, W, W, pixelMm, mask, 0.2, 0.5);
    const label = `${mm.toFixed(2)} mm ${native ? 'native' : 'reconstructed'}`, stem = `grain-${mm.toFixed(2)}-${native ? 'native' : 'fine'}`;
    await sharp(rgb, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(out, `${stem}.png`));
    // An 8 mm window, displayed at the same physical scale. Nearest-neighbour here exposes native cells.
    const side = Math.round(8 / pixelMm), left = Math.round(19 / pixelMm);
    const tile = await sharp(rgb, { raw: { width: W, height: W, channels: 3 } }).extract({ left, top: left, width: side, height: side }).resize(TILE, TILE, { kernel: 'nearest' }).png().toBuffer();
    const x = GAP + tiles.length * (TILE + GAP);
    tiles.push({ input: tile, left: x, top: TOP });
    captions.push(`<text x="${x}" y="76" font-size="22">${label}</text><text x="${x}" y="100" font-size="18">0.2-0.5 mm RMS/mean ${grain.relative.toFixed(6)}</text>`);
    const result = { mmPerCell: mm, native, pixels: W, outputMmPerPixel: pixelMm, grain, pigmentBeforeDry: before, pigmentAfterDry: after, renderedPigment: fineMass, dryMassRatio: after / before, renderMassRatio: fineMass / after };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
const reference = results.find(r => r.native), coarse = results.find(r => r.mmPerCell === 0.26);
const ratio = coarse.grain.relative / reference.grain.relative;
if (Math.abs(ratio - 1) > 0.1) throw new Error(`narrow-band grain ratio ${ratio} outside +/-10%`);
const report = { kind: 'poured material fixture; no subject or GPU claim', backend: 'cpu', fallback: false, paperSeed: 9, sheetMm: 46, washMm: 40, waterMm: 0.3, concentration: 1.2, window: { centreMm: [23, 23], sideMm: 30 }, bandMm: [0.2, 0.5], coarseToNativeRatio: ratio, results };
fs.writeFileSync(path.join(out, 'grain-card.json'), JSON.stringify(report, null, 2) + '\n');
const width = GAP + tiles.length * (TILE + GAP), height = TOP + TILE + 60;
const svg = `<svg width="${width}" height="${height}"><g font-family="Helvetica,Arial,sans-serif" fill="#222"><text x="24" y="35" font-size="27">Deposited ultramarine: same paper, same 8 mm crop</text>${captions.join('')}<text x="24" y="${height - 24}" font-size="19">CPU material fixture. Coarse / native grain ${(100 * ratio).toFixed(2)}%. Full painting and GPU proof remain pending.</text></g></svg>`;
await sharp({ create: { width, height, channels: 3, background: '#fff' } }).composite([...tiles, { input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 94 }).toFile(path.join(out, 'GRAIN.jpg'));
