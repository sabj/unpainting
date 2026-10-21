#!/usr/bin/env node
// Copy Paint Lab's example pictures into the GitHub Pages folder: a target (at most 720 px on its long side) and a
// thumbnail for each entry of tools/lab/examples.json, and demos/lab/examples/examples.json with each credit line taken
// from examples/SOURCES.md. With the painter's runs present (tools/lab/paint-examples.sh writes them to
// work/paint-lab/<id>/), each example also gets its film: the painter's frames as WebP, the finished painting, and the
// stroke count from the painter's mark tape. Run from the repository root:
//   sh tools/lab/paint-examples.sh && node tools/lab/build-examples.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'demos/lab/examples');
const TARGET_PX = 720, THUMB_PX = 240, FILM_PX = 720, FILM_FRAMES = 80, RUNS = path.join(ROOT, 'work/paint-lab');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/lab/examples.json'), 'utf8'));
const sources = fs.readFileSync(path.join(ROOT, 'examples/SOURCES.md'), 'utf8');
// the "Credit lines:" bullets, one per target
const credits = sources.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2).trim());

const creditFor = match => {
  const line = credits.find(c => c.includes(match));
  if (!line) throw new Error(`examples/SOURCES.md has no credit line containing "${match}"`);
  return line;
};

fs.mkdirSync(OUT, { recursive: true });

// The painter's film for one example, or null when its run is missing: FILM_FRAMES of its frames, evenly spaced, always
// with the first and the last. `white` is the painter's bare paper colour (the median of its first frame, blank paper;
// the painter tones the paper per subject). The lab hands the painting over as it looks, over its own paper.
async function buildFilm(id) {
  const run = path.join(RUNS, id), framesFile = path.join(run, 'frames.json');
  if (!fs.existsSync(framesFile)) { console.warn(`no painter run for ${id} in ${path.relative(ROOT, run)}: the example will paint a quick sketch`); return null; }
  const dir = path.join(OUT, id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const all = JSON.parse(fs.readFileSync(framesFile, 'utf8')).frames, names = [];
  const pick = Math.min(FILM_FRAMES, all.length), frames = Array.from({ length: pick }, (_, j) => all[Math.round(j * (all.length - 1) / Math.max(1, pick - 1))]);
  for (const [k, f] of frames.entries()) {
    const name = `f${String(k).padStart(3, '0')}.webp`;
    await sharp(path.join(run, f.src)).resize({ width: FILM_PX, withoutEnlargement: true }).webp({ quality: 70 }).toFile(path.join(dir, name));
    names.push(`examples/${id}/${name}`);
  }
  const final = sharp(path.join(run, 'painting.png')).removeAlpha();
  await final.clone().resize({ width: FILM_PX, withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(dir, 'final.webp'));
  const { data, info } = await final.clone().raw().toBuffer({ resolveWithObject: true });
  const blank = await sharp(path.join(run, all[0].src)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const white = [0, 1, 2].map(c => { const v = []; for (let i = c; i < blank.data.length; i += blank.info.channels) v.push(blank.data[i]); v.sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; });
  let strokes = null;
  const tape = path.join(run, 'marks.json');
  // The tape is counted, not shipped: at 540 px it holds 55,000 to 95,000 strokes in 20 to 35 MB, too large for the page
  // and too many for the browser physics (a different build) to replay in a visit. The frames are the painter's own.
  if (fs.existsSync(tape)) { const t = JSON.parse(fs.readFileSync(tape, 'utf8')); strokes = (t.marks ?? []).filter(m => m.k === 's' || m.k === 'P').length; }
  return { frames: names, final: `examples/${id}/final.webp`, aspect: +(info.width / info.height).toFixed(4), white, fps: 10, strokes };
}
const built = [];
for (const ex of manifest.examples) {
  const src = path.join(ROOT, 'examples', ex.file);
  if (!fs.existsSync(src)) throw new Error(`missing example picture ${src}`);
  const image = sharp(src).rotate();
  const { width, height } = await image.metadata();
  await image.clone().resize({ width: TARGET_PX, height: TARGET_PX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(OUT, `${ex.id}.webp`));
  await image.clone().resize({ width: THUMB_PX, height: Math.round(THUMB_PX * 0.75), fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toFile(path.join(OUT, `${ex.id}-thumb.webp`));
  const film = await buildFilm(ex.id);
  built.push({ id: ex.id, ...(film ? { film } : {}), title: ex.title, kind: ex.kind, target: `examples/${ex.id}.webp`, thumb: `examples/${ex.id}-thumb.webp`, aspect: +(width / height).toFixed(4), credit: creditFor(ex.credit), preset: ex.preset });
  console.log('wrote', ex.id);
}
fs.writeFileSync(path.join(OUT, 'examples.json'), JSON.stringify({ examples: built }, null, 1) + '\n');
console.log('wrote', path.relative(ROOT, path.join(OUT, 'examples.json')));
