#!/usr/bin/env node
// node tools/speed/compare.mjs baseline/painting.png candidate/painting.png OUT
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const [base, candidate, out] = process.argv.slice(2);
if (!base || !candidate || !out) throw Error('usage: compare.mjs BASE CANDIDATE OUT');
fs.mkdirSync(out, {recursive: true});
const read = file => sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject: true});
const [a, b] = await Promise.all([read(base), read(candidate)]);
if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.data.length !== b.data.length) throw Error('native sizes differ');
let max = 0, sum = 0, changed = 0;
const diff = Buffer.alloc(a.data.length), amplified = Buffer.alloc(a.data.length);
for (let i = 0; i < diff.length; i++) {
  const d = Math.abs(a.data[i] - b.data[i]);
  diff[i] = d; amplified[i] = Math.min(255, d * 10);
  max = Math.max(max, d); sum += d; changed += d !== 0;
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const metrics = {base: path.resolve(base), candidate: path.resolve(candidate), width: a.info.width, height: a.info.height,
  maxChannelDifference: max, meanChannelDifference: sum / diff.length, changedChannels: changed,
  baselineSHA256: hash(base), candidateSHA256: hash(candidate), units: '8-bit sRGB channels, 0 to 255'};
metrics.byteIdentical = metrics.baselineSHA256 === metrics.candidateSHA256;
fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2));
const raw = {width: a.info.width, height: a.info.height, channels: 3};
await sharp(diff, {raw}).png().toFile(path.join(out, 'difference.png'));
await sharp(amplified, {raw}).png().toFile(path.join(out, 'difference-10x.png'));
await sharp({create: {width: raw.width * 2, height: raw.height, channels: 3, background: 'white'}})
  .composite([{input: a.data, raw, left: 0, top: 0}, {input: b.data, raw, left: raw.width, top: 0}])
  .png().toFile(path.join(out, 'side-by-side.png'));
fs.copyFileSync(base, path.join(out, 'release.png'));
fs.copyFileSync(candidate, path.join(out, 'candidate.png'));
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Native painting comparison</title>
<style>body{font:16px system-ui;background:#eee;color:#222}section{display:flex;gap:24px}img{max-width:none}figure{margin:0}figcaption{padding:12px 0}</style>
<p>Native size ${raw.width} × ${raw.height}. Max channel difference ${max}; mean ${(sum / diff.length).toFixed(6)} / 255. Scroll horizontally to inspect both at 1:1.</p>
<section><figure><figcaption>Baseline</figcaption><img src="release.png"></figure><figure><figcaption>Candidate</figcaption><img src="candidate.png"></figure></section>
<section><figure><figcaption>Absolute difference</figcaption><img src="difference.png"></figure><figure><figcaption>Difference × 10</figcaption><img src="difference-10x.png"></figure></section>`);
console.log(JSON.stringify(metrics));
