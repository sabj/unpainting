#!/usr/bin/env node
// A Paint Lab example from one finished painter run made with the current pipeline: a drawing file and a block-in
// study (--drawingfile, --washplan), painted with --marks 1 so the full stroke tape is kept. The Lab replays the tape
// in Live mode and steps the run's saved frames in Recording mode.
//   node tools/lab/build-live-examples.mjs <id> <run dir> <target image> --title "Name · id" --kind "Pen and wash" --credit "..."
// Writes demos/lab/examples/<id>/ (live.json.gz, target, thumb, frames, final) and its entry in examples/recorded.json.
// Then run tools/lab/build-live-checkpoints.mjs for the Live seek points.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../../demos/lab');
const [id, run, target] = process.argv.slice(2);
const arg = name => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : null; };
if (!id || !run || !target || !arg('title') || !arg('credit')) throw Error('usage: build-live-examples.mjs <id> <run dir> <target image> --title T --kind K --credit C');
const file = path.join(run, 'marks.json');
const {strokeBudget: _unused, ...tape} = JSON.parse(fs.existsSync(file) ? fs.readFileSync(file) : gunzipSync(fs.readFileSync(file + '.gz')));
const count = tape.marks.filter(m => ['s', 'P', 'g'].includes(m.k)).length;
if (!fs.existsSync(path.join(run, 'painting.png')) || !count || tape.strokeCount !== count) throw Error(`${run}: not a finished run with a full stroke tape (--marks 1)`);
const dir = path.join(root, 'examples', id), rel = f => `examples/${id}/${f}`;
fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, 'live.json.gz'), gzipSync(JSON.stringify({...tape, strokeCount: count, complete: true}), {level: 9}));
await sharp(target).resize({width: 960, withoutEnlargement: true}).jpeg({quality: 88}).toFile(path.join(dir, 'target.jpg'));
await sharp(path.join(run, 'painting.png')).resize({width: 320}).webp({quality: 80}).toFile(path.join(dir, 'thumb.webp'));
await sharp(path.join(run, 'painting.png')).webp({quality: 90}).toFile(path.join(dir, 'final.webp'));
const shots = JSON.parse(fs.readFileSync(path.join(run, 'frames.json'), 'utf8')).frames;
const frames = [];
for (const [k, f] of shots.entries()) {
  const out = `f${String(k).padStart(4, '0')}.webp`;
  await sharp(path.join(run, f.src)).webp({quality: 82}).toFile(path.join(dir, out));
  frames.push(rel(out));
}
const meta = await sharp(path.join(run, 'painting.png')).metadata();
const manifestFile = path.join(root, 'examples/recorded.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const entry = {
  id, title: arg('title'), kind: arg('kind') ?? 'Watercolor', target: rel('target.jpg'), thumb: rel('thumb.webp'), credit: arg('credit'),
  live: {study: rel('live.json.gz')},
  studies: {study: {label: 'Drawing and block-in study', strokes: count, width: tape.w, height: tape.h, methods: tape.methods ?? null}},
  film: {frames, frameNumbers: frames.map((_, k) => k), final: rel('final.webp'), aspect: meta.width / meta.height, seconds: Math.max(8, frames.length * 2), strokes: count},
};
manifest.examples = [entry, ...manifest.examples.filter(e => e.id !== id)];
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(id, count, 'strokes,', frames.length, 'frames');
