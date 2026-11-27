// CPU-only water/granulation diagnostic. No renderer backend or GPU is loaded.
// node tools/lab/grain-water.mjs [--no-slide] [--mm=0.1] [--mass=0.36]
import { pathToFileURL } from 'node:url';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, dry, totals, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { physicsFields } from '../../src/media/pigment-physical.mjs';
import { luminance, densityOf, grainContrast } from './wash-measure.mjs';

const pigments = ['ultramarine', 'sienna', 'phthaloblue'].map(key => {
  const p = BOX.find(p => p.key === key);
  return { ...boxPigment(p), ...physicsFields(p.physics) };
});
const PAPER = [246, 245, 239], paperY = luminance(PAPER, 1)[0];
export const WATER_CASES = [
  { name: 'ultramarine thin', water: 0.04, shares: [1, 0, 0] },
  { name: 'ultramarine pooled', water: 0.3, shares: [1, 0, 0] },
  { name: 'sienna pooled', water: 0.3, shares: [0, 1, 0] },
  { name: 'mixed pooled', water: 0.3, shares: [0.5, 0.5, 0] },
  { name: 'phthalo pooled', water: 0.3, shares: [0, 0, 1] },
];

/** 16 mm square wash, central 8 mm measured, on 20 mm cold-press paper. */
export function waterWash({ water, shares }, { mm = 0.1, dt = 2, mass = null, physics = {} } = {}) {
  const w = Math.round(20 / mm), n = w * w;
  const sheet = createSheet(makePaper(w, w, { seed: 9, cockle: { rmsMm: 0 }, mmPerCell: mm, coldPress: { mmPerCell: mm } }), pigments);
  const inner = new Uint8Array(n), base = new Uint8Array(n * 3);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, X = (x + 0.5) * mm, Y = (y + 0.5) * mm;
    base.set(PAPER, i * 3);
    if (X > 2 && X < 18 && Y > 2 && Y < 18) deposit(sheet, i, water, shares.map(s => s * (mass ?? 1.2 * water)));
    if (X > 6 && X < 14 && Y > 6 && Y < 14) inner[i] = 1;
  }
  const before = totals(sheet).pig;
  dry(sheet, 200000, { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1, ...physics }, { levelMax: 200, dt });
  const after = totals(sheet).pig;
  const rgb = renderLayers(layersOf(sheet), pigments, base, n);
  const od = densityOf(luminance(rgb, n), paperY);
  const grain = grainContrast(od, w, w, mm, inner, Math.max(0.2, 2 * mm), 1).relative;
  return { grain, before, after, rgb, w };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mm = Number(process.argv.find(s => s.startsWith('--mm='))?.slice(5) ?? 0.1);
  const massArg = process.argv.find(s => s.startsWith('--mass='));
  for (const c of WATER_CASES) {
    const r = waterWash(c, { mm, mass: massArg ? Number(massArg.slice(7)) : null, physics: process.argv.includes('--no-slide') ? { slide: 0 } : {} });
    console.log(JSON.stringify({ name: c.name, water: c.water, grain: r.grain, before: r.before, after: r.after }));
  }
}
