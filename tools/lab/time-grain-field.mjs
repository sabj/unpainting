#!/usr/bin/env node
// Isolate the final renderer's paper-field convolution, alternating old and new
// in one process. This measures CPU fields, not GPU painting or a full final.
// node tools/lab/time-grain-field.mjs <reference repo> <output.json> [repetitions]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gaussianField } from '../../src/media/gaussian-field.mjs';

const [root, output, repetitions = '5'] = process.argv.slice(2), reps = Number(repetitions);
if (!root || !output || !Number.isInteger(reps) || reps < 1) throw new Error('usage: time-grain-field.mjs <reference repo> <output.json> [repetitions]');
const file = path.join(path.resolve(root), 'src/media/grain-field.mjs');
const { gaussianField: reference } = await import(pathToFileURL(file).href);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const w = 2172, h = 2896, field = Float32Array.from({ length: w * h }, (_, i) => Math.sin(i * 0.37));
const median = a => a.toSorted((a, b) => a - b)[a.length >> 1];
const report = {
  kind: 'CPU paper-field microbenchmark; not a full painting measurement', backend: 'cpu', fallback: false,
  pixels: [w, h], warmups: 1, repetitions: reps, inputSha256: hash(field),
  sourceHashes: { reference: hash(fs.readFileSync(file)), current: hash(fs.readFileSync(new URL('../../src/media/gaussian-field.mjs', import.meta.url))) },
  method: 'same field and kernel; alternating order in one process; hashes outside timing; median paired ratios', cases: [],
};
for (const sigma of [0.2 / 0.13, 2, 10]) {
  const samples = [], hashes = {};
  for (let rep = -1; rep < reps; rep++) for (const name of rep % 2 ? ['reference', 'current'] : ['current', 'reference']) {
    const cpuStart = process.cpuUsage(), start = performance.now();
    const out = (name === 'reference' ? reference : gaussianField)(field, w, h, sigma);
    const ms = performance.now() - start, cpu = process.cpuUsage(cpuStart), sha256 = hash(out);
    if (hashes[name] && hashes[name] !== sha256) throw new Error('repeated field differs');
    hashes[name] = sha256;
    if (rep >= 0) samples.push({ repetition: rep, name, ms, cpuMs: (cpu.user + cpu.system) / 1000 });
  }
  if (hashes.reference !== hashes.current) throw new Error('convolution changed field bytes');
  const medians = Object.fromEntries(['reference', 'current'].map(name => {
    const rows = samples.filter(s => s.name === name);
    return [name, { ms: median(rows.map(s => s.ms)), cpuMs: median(rows.map(s => s.cpuMs)) }];
  }));
  const pairs = Array.from({ length: reps }, (_, rep) => {
    const rows = samples.filter(s => s.repetition === rep);
    return rows.find(s => s.name === 'current').ms / rows.find(s => s.name === 'reference').ms;
  });
  report.cases.push({ sigma, imageSha256: hashes.current, identicalBytes: true, samples, medians, ratio: medians.current.ms / medians.reference.ms, pairedMedianRatio: median(pairs) });
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
