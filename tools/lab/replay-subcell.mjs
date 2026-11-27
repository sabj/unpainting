#!/usr/bin/env node
// Time only reconstruction and optics from the archived demo's deposited masses; no painting or target reads.
// node tools/lab/replay-subcell.mjs <demo.json> <renderer repo> <output prefix> [repetitions] [reference repo]
// With a reference, alternate both renderers in one process after warming each. This is a CPU renderer probe,
// not GPU painting-time evidence.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { renderCells } from '../../src/media/km.mjs';
const [input, root, output, repetitions = '5', reference] = process.argv.slice(2), reps = Number(repetitions);
if (!input || !root || !output || !Number.isInteger(reps) || reps < 1) throw new Error('usage: replay-subcell.mjs <demo.json> <renderer repo> <output prefix> [repetitions] [reference repo]');
const meta = JSON.parse(fs.readFileSync(input)), { w, h, mm, N, native } = meta;
const bytes = fs.readFileSync(path.resolve(path.dirname(input), native.file));
if (createHash('sha256').update(bytes).digest('hex') !== native.sha256) throw new Error('deposited pigment hash mismatch');
const count = w * h, K = native.pigments.length;
if (bytes.length !== count * K * native.layers * 4) throw new Error('deposited pigment byte count mismatch');
const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
const layers = Array.from({ length: native.layers }, (_, l) => Array.from({ length: K }, (_, k) => values.subarray((l * K + k) * count, (l * K + k + 1) * count)));
const paper = makePaper(w, h, { seed: native.reliefOf.seed, relief: native.reliefOf.relief, mmPerCell: mm });
const variants = [];
for (const [name, dir] of [['current', root], ...(reference ? [['reference', reference]] : [])]) {
  const file = path.join(path.resolve(dir), 'src/media/subcell-grain.mjs');
  const { subcellSpread } = await import(pathToFileURL(file).href);
  const sourceHashes = {};
  for (const name of ['subcell-grain', 'subcell-edge', 'grain-field', 'gaussian-field']) {
    const source = path.join(path.dirname(file), name + '.mjs');
    if (fs.existsSync(source)) sourceHashes[name] = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  }
  variants.push({ name, subcellSpread, sourceHashes, samples: [], hash: null, rgb: null });
}
const pixels = count * N * N, width = w * N, height = h * N;
const background = Uint8Array.from({ length: pixels * 3 }, (_, i) => [246, 245, 239][i % 3]);
const Kp = native.pigments.map(p => p.K), Sp = native.pigments.map(p => p.S);
for (let rep = -1; rep < reps; rep++) {
 for (const variant of rep % 2 ? variants : variants.toReversed()) {
  // Match finish.mjs: make and composite one layer at a time, retaining reflectance in doubles.
  const cpuStart = process.cpuUsage(), start = performance.now();
  const spread = variant.subcellSpread(native.pigments, paper, N), prepared = performance.now();
  const under = new Float64Array(pixels * 3), out = new Uint8ClampedArray(pixels * 3);
  for (let i = 0; i < under.length; i++) under[i] = background[i] / 255;
  let spreadMs = 0, opticsMs = 0;
  for (let l = 0; l < layers.length; l++) {
    const t = performance.now(), fine = spread(layers[l]), u = performance.now();
    renderCells([fine], Kp, Sp, background, 0, pixels, 1, null, l === layers.length - 1 ? out : null, under, under);
    spreadMs += u - t; opticsMs += performance.now() - u;
  }
  const end = performance.now(), cpu = process.cpuUsage(cpuStart), current = createHash('sha256').update(out).digest('hex');
  if (variant.hash && current !== variant.hash) throw new Error('repeated render differs');
  variant.hash = current;
  // Keep only the requested renderer's final pixels. A reference needs only its hash.
  if (variant.name === 'current') variant.rgb = out;
  if (rep >= 0) variant.samples.push({ repetition: rep, prepareMs: prepared - start, spreadMs, opticsMs, totalMs: end - start, cpuMs: (cpu.user + cpu.system) / 1000 });
 }
}
const median = a => a.toSorted((a, b) => a - b)[a.length >> 1];
for (const variant of variants) variant.medians = Object.fromEntries(['prepareMs', 'spreadMs', 'opticsMs', 'totalMs', 'cpuMs'].map(k => [k, median(variant.samples.map(s => s[k]))]));
const current = variants[0];
const report = { kind: 'CPU reconstruction and optics; identical deposited masses; not a painting comparison', backend: 'cpu', fallback: false, mmPerCell: mm, pixels: [width, height], N, layers: layers.length, pigments: K, sourceSha256: native.sha256, imageSha256: current.hash, sourceHashes: current.sourceHashes, warmups: 1, repetitions: reps, samples: current.samples, medians: current.medians };
if (reference) {
  const previous = variants[1];
  report.comparison = {
    method: 'alternating order in one process; each renderer warmed once; PNG encoding and hashing outside timing',
    identicalPixels: current.hash === previous.hash,
    reference: { imageSha256: previous.hash, sourceHashes: previous.sourceHashes, samples: previous.samples, medians: previous.medians },
    ratios: Object.fromEntries(Object.keys(current.medians).map(k => [k, current.medians[k] / previous.medians[k]])),
    pairedMedianRatios: Object.fromEntries(Object.keys(current.medians).map(k => [k, median(current.samples.map((s, i) => s[k] / previous.samples[i][k]))])),
  };
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output + '.json', JSON.stringify(report, null, 2) + '\n');
await sharp(Buffer.from(current.rgb), { raw: { width, height, channels: 3 } }).png().toFile(output + '.png');
console.log(JSON.stringify(report, null, 2));
