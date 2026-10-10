// The box half of the stage judge: runs on the render box beside the frames, with sharp, and reads one job as JSON
// on stdin. Nothing here decides what a judge sees; run.mjs writes the job.
//
//   job.controls  builds the hidden control runs as folders of frames with a frames.json
//   job.runs      selects each run's frame at every live stage by its position (measure.mjs selectByPosition)
//   job.judges    composes each judge's images from the selected frames, in that judge's letters and order
//
// Every image goes through one pipeline: the native frame, flattened on white, downscaled (never enlarged) to the
// common tile width with a Lanczos filter, composed, and written once as JPEG quality 95 with full-resolution chroma.
// Detail crops are cut from the native frame at 1:1.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { framePositions, selectByPosition } from './measure.mjs';

const JPEG = { quality: 95, chromaSubsampling: '4:4:4' };

/**
 * The positive control: the live sequence itself. Frame 0 is the site's blank sheet (stage 0), then each live stage,
 * resized to the runs' size, at its own timeline position, so every stage selects its own file.
 */
async function buildLiveRun(c) {
  fs.mkdirSync(c.out, { recursive: true });
  const frames = [];
  for (const s of [{ name: '000', file: c.blank, position: 0 }, ...c.stages]) {
    const src = `k${s.name}.png`;
    await sharp(s.file).flatten({ background: '#ffffff' }).removeAlpha().resize(c.width, c.height, { fit: 'fill', kernel: 'lanczos3' }).png().toFile(path.join(c.out, src));
    frames.push({ src, position: s.position });
  }
  fs.writeFileSync(path.join(c.out, 'frames.json'), JSON.stringify({ width: c.width, height: c.height, control: 'live stages', frames }, null, 1));
}

/** The negative control: a run's frames with the pen taken out by a median and the sheet blurred by half-size. */
async function buildDegradedRun(c) {
  fs.mkdirSync(c.out, { recursive: true });
  const src = JSON.parse(fs.readFileSync(path.join(c.from, 'frames.json'), 'utf8'));
  const frames = [];
  for (const f of src.frames) {
    const meta = await sharp(path.join(c.from, f.src)).metadata();
    const half = await sharp(path.join(c.from, f.src)).flatten({ background: '#ffffff' }).median(c.median)
      .resize({ width: Math.round(meta.width / c.factor), kernel: 'cubic' }).png().toBuffer();
    const name = f.src.replace(/\.\w+$/, '.png');
    await sharp(half).resize({ width: meta.width, height: meta.height, kernel: 'cubic' }).png().toFile(path.join(c.out, name));
    frames.push({ src: name, ...(Number.isFinite(f.position) ? { position: f.position } : {}) });
  }
  fs.writeFileSync(path.join(c.out, 'frames.json'), JSON.stringify({ width: src.width, height: src.height, control: 'degraded', frames }, null, 1));
}

/** A run's frames in order, the final one last, and each one's place in the run. */
function frameList(dir) {
  const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8')).frames;
  return { files: frames.map(f => path.join(dir, f.src)), positions: framePositions(frames) };
}

async function measure(dir, stages) {
  const { files, positions } = frameList(dir);
  const { idx, why } = selectByPosition(positions, stages);
  const meta = await sharp(files.at(-1)).metadata();
  return {
    dir, native: { width: meta.width, height: meta.height }, count: files.length,
    stages: Object.fromEntries(stages.map(s => [s.name, { frame: path.basename(files[idx[s.name]]), index: idx[s.name], position: positions[idx[s.name]], why: why[s.name] }])),
  };
}

const esc = s => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
const BAR = 30, GAP = 8;
const bar = (w, text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${BAR}"><rect width="${w}" height="${BAR}" fill="#222"/><text x="8" y="21" font-size="18" font-family="DejaVu Sans" fill="#fff">${esc(text)}</text></svg>`);

/** One tile: a file downscaled to `width` (refused if that would enlarge it), a native crop, or a grey gap. */
async function tile(t, width, height) {
  if (!t.src) return sharp({ create: { width, height, channels: 3, background: '#999' } }).png().toBuffer();
  const img = sharp(t.src).flatten({ background: '#ffffff' });
  if (t.crop) return img.extract(t.crop).png().toBuffer();
  const meta = await sharp(t.src).metadata();
  if (meta.width < width) throw new Error(`${t.src} is ${meta.width} wide: refusing to enlarge it to ${width}`);
  return img.resize({ width, height, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
}

/** A grid of labelled tiles, `cols` across, every tile width x height. */
async function grid(tiles, cols, width, height, file) {
  const parts = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = (i % cols) * (width + GAP), y = Math.floor(i / cols) * (BAR + height + GAP);
    parts.push({ input: bar(width, tiles[i].label), left: x, top: y }, { input: await tile(tiles[i], width, height), left: x, top: y + BAR });
  }
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * (width + GAP) - GAP, height: rows * (BAR + height + GAP) - GAP, channels: 3, background: '#555' } })
    .composite(parts).jpeg(JPEG).toFile(file);
}

async function composeJudge(j) {
  fs.mkdirSync(j.dir, { recursive: true });
  for (const img of j.images) await grid(img.tiles, img.cols, img.width, img.height, path.join(j.dir, img.file));
}

const job = JSON.parse(fs.readFileSync(0, 'utf8'));
const out = {};
for (const c of job.controls ?? []) {
  if (c.kind === 'live') await buildLiveRun(c); else if (c.kind === 'degraded') await buildDegradedRun(c);
  else throw new Error(`unknown control ${c.kind}`);
}
if (job.runs) out.runs = await Promise.all(job.runs.map(d => measure(d, job.stages)));
for (const j of job.judges ?? []) await composeJudge(j);
process.stdout.write(JSON.stringify(out));
