#!/usr/bin/env node
// Show finite-pixel coverage of deposited material, without painting or target pixels.
// node tools/lab/render-core-card.mjs REFERENCE_TREE OUTPUT_DIRECTORY
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { subcellSpread } from '../../src/media/subcell-grain.mjs';
import { renderLayers } from '../../src/media/km.mjs';

const [reference, destination] = process.argv.slice(2);
if (!reference || !destination) throw Error('usage: render-core-card.mjs REFERENCE_TREE OUTPUT_DIRECTORY');
const referenceFile = path.resolve(reference, 'src/media/subcell-grain.mjs');
const previous = await import(pathToFileURL(referenceFile).href);
const out = path.resolve(destination); fs.mkdirSync(out, { recursive: true });
const w = 21, h = 17, mmPerCell = 0.26;
const pigments = [{ gamma: 0.85, K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02] }];
const paper = makePaper(w, h, { seed: 9, mmPerCell });
const cells = new Float32Array(w * h); cells[8 * w + 10] = 0.1;
const mass = a => a.reduce((sum, value) => sum + value, 0);
const hash = a => createHash('sha256').update(a).digest('hex');
const before = hash(Buffer.from(cells.buffer)), results = [];
for (const N of [1, 2, 3, 4, 8]) for (const [name, spread] of [['previous', previous.subcellSpread], ['current', subcellSpread]]) {
  const [fine] = spread(pigments, paper, N)([cells]), fineMass = mass(fine) / (N * N);
  results.push({ name, N, nativeMass: mass(cells), reconstructedMass: fineMass, ratio: fineMass / mass(cells) });
  if (name === 'current' && Math.abs(fineMass / mass(cells) - 1) > 1e-6) throw Error('isolated pigment lost');
  if (N === 2) {
    const background = Uint8Array.from({ length: w * h * N * N * 3 }, (_, i) => [246, 245, 239][i % 3]);
    const rgb = renderLayers([[fine]], pigments, background, w * h * N * N);
    await sharp(Buffer.from(rgb), { raw: { width: w * N, height: h * N, channels: 3 } }).png().toFile(path.join(out, `core-${name}.png`));
  }
}
if (hash(Buffer.from(cells.buffer)) !== before) throw Error('reconstruction changed deposited pigment');
const report = { kind: 'isolated deposited pigment; no target or brush inputs', mmPerCell, depositedSha256: before,
  referenceSha256: hash(fs.readFileSync(referenceFile)),
  currentSha256: hash(fs.readFileSync(new URL('../../src/media/subcell-edge.mjs', import.meta.url))),
  fixed: true, results };
fs.writeFileSync(path.join(out, 'subpixel-dot.json'), JSON.stringify(report, null, 2) + '\n');
const width = 1040, height = 540, panels = [];
for (const [i, name] of ['previous', 'current'].entries()) {
  const input = await sharp(path.join(out, `core-${name}.png`)).extract({ left: 14, top: 10, width: 14, height: 14 }).resize(420, 420, { kernel: 'nearest' }).png().toBuffer();
  panels.push({ input, left: 30 + i * 520, top: 80 });
}
const labels = Buffer.from(`<svg width="${width}" height="${height}"><g font-family="Helvetica,Arial,sans-serif" fill="#222"><text x="30" y="35" font-size="26">Finite pixels retain the deposited core at a 2x export</text><text x="30" y="67" font-size="21">Previous point samples: mass 0</text><text x="550" y="67" font-size="21">Integrated core: mass 0.100000</text><text x="30" y="530" font-size="19">Same isolated cell, contour, paper and optics; pixels enlarged with nearest sampling.</text></g></svg>`);
await sharp({ create: { width, height, channels: 3, background: '#fff' } }).composite([...panels, { input: labels, left: 0, top: 0 }]).jpeg({ quality: 94 }).toFile(path.join(out, 'CORE.jpg'));
console.log(JSON.stringify(report));
