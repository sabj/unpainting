#!/usr/bin/env node
// Builds the two README figures from one painting's film: a folder of saved frames f000.webp, f001.webp, ... and
// final.webp, as tools/lab/build-examples.mjs writes them to docs/lab/examples/<id>/.
//   hero.webp             animated: the target on the left; on the right the finished painting runs back to the first
//                         drawn frame, holds, and runs forward again (ping-pong, looping)
//   unpainting-steps.webp a 3x3 grid of nine saved frames, from the finished painting back to the first frame
// Every tile is a frame the painter saved while it painted. Nothing is drawn or blended here.
//
//   node tools/readme/hero.mjs            (reads film, target, first and steps from tools/readme/hero.json)
//   node tools/readme/hero.mjs --film docs/lab/examples/<id> --target docs/lab/examples/<id>.webp [--out docs/img]
//     [--first f001.webp] [--steps steps.json]
// --first is the frame the animation stops at (the drawing, or the first wash). --steps is a JSON list of nine
// [file, caption] pairs, finished first; without it the nine frames are evenly spaced and captioned by number.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// The subject comes from tools/readme/hero.json unless flags override it, so swapping the hero is a one-line change there.
const CONFIG = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'hero.json'), 'utf8'));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : (CONFIG[name] ?? fallback); };
const FILM = arg('film') && path.resolve(ROOT, arg('film'));
const TARGET = arg('target') && path.resolve(ROOT, arg('target'));
const OUT = path.resolve(ROOT, arg('out', 'docs/img'));
const FIRST = arg('first', 'f001.webp');
if (!FILM || !TARGET) { console.error('no hero subject: set film and target in tools/readme/hero.json, or pass them'); console.error('usage: node tools/readme/hero.mjs --film DIR --target IMAGE [--out DIR] [--first FILE] [--steps JSON]'); process.exit(2); }
for (const f of [FILM, TARGET, path.join(FILM, 'final.webp'), path.join(FILM, FIRST)]) if (!fs.existsSync(f)) { console.error(`missing: ${f}`); process.exit(2); }
const ANIM_FRAMES = 32, FRAME_MS = 100, HOLD_MS = 1000, ANIM_W = 900, GAP = 12;
const GRID_W = 1200, CAPTION_H = 30, PAPER = { r: 255, g: 255, b: 255 };

const frameFiles = () => fs.readdirSync(FILM).filter(f => /^f\d{3}\.webp$/.test(f)).sort();

const caption = (text, width) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CAPTION_H}">` +
  `<text x="${width / 2}" y="20" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="16" fill="#333">${text}</text></svg>`);

// Nine frames, finished first: from --steps, or evenly spaced between --first and the finished painting.
function steps(files) {
  if (arg('steps')) {
    const list = JSON.parse(fs.readFileSync(arg('steps'), 'utf8'));
    if (list.length !== 9 || list.some(([f]) => !fs.existsSync(path.join(FILM, f)))) throw new Error('--steps needs nine [file, caption] pairs that exist in --film');
    return list;
  }
  const span = files.slice(files.indexOf(FIRST));
  const picks = Array.from({ length: 8 }, (_, j) => span[Math.round(j * (span.length - 1) / 8)]);
  return ['final.webp', ...picks.reverse()].map((f, k) => [f, `${9 - k}${k === 0 ? '  Finished' : ''}`]);
}

async function grid() {
  const STEPS = steps(frameFiles());
  const cols = 3, tileW = Math.floor((GRID_W - GAP * (cols + 1)) / cols);
  const first = await sharp(path.join(FILM, STEPS[0][0])).metadata();
  const tileH = Math.round(tileW * first.height / first.width);
  const rows = Math.ceil(STEPS.length / cols), height = GAP + rows * (tileH + CAPTION_H + GAP);
  const layers = [];
  for (const [k, [file, text]] of STEPS.entries()) {
    const left = GAP + (k % cols) * (tileW + GAP), top = GAP + Math.floor(k / cols) * (tileH + CAPTION_H + GAP);
    layers.push({ input: await sharp(path.join(FILM, file)).resize(tileW, tileH).toBuffer(), left, top });
    layers.push({ input: caption(text, tileW), left, top: top + tileH });
  }
  const file = path.join(OUT, 'unpainting-steps.webp');
  await sharp({ create: { width: GRID_W, height, channels: 3, background: PAPER } })
    .composite(layers).webp({ quality: 80 }).toFile(file);
  return file;
}

// Ping-pong: finished, back to the drawing, forward again. The loop restarts on the finished frame, so the last frame
// shown before the restart is the one just before it and there is no jump at the seam.
function pingPong(files) {
  const drawing = files.indexOf(FIRST);
  const span = files.slice(drawing);
  const picks = Array.from({ length: ANIM_FRAMES }, (_, j) => span[Math.round(j * (span.length - 1) / (ANIM_FRAMES - 1))]);
  const forward = [...picks, 'final.webp'];
  const back = [...forward].reverse();
  return [...back, ...forward.slice(1, -1)];
}

async function animation() {
  const order = pingPong(frameFiles());
  const half = Math.floor((ANIM_W - GAP * 3) / 2);
  const meta = await sharp(TARGET).metadata();
  const h = Math.round(half * meta.height / meta.width), H = h + GAP * 2;
  const target = await sharp(TARGET).resize(half, h).toBuffer();
  const frames = [];
  for (const f of order) {
    const paint = await sharp(path.join(FILM, f)).resize(half, h).toBuffer();
    frames.push(await sharp({ create: { width: ANIM_W, height: H, channels: 3, background: PAPER } })
      .composite([{ input: target, left: GAP, top: GAP }, { input: paint, left: GAP * 2 + half, top: GAP }]).png().toBuffer());
  }
  const delay = order.map(f => (f === 'final.webp' || f === FIRST ? HOLD_MS : FRAME_MS));
  const file = path.join(OUT, 'hero.webp');
  await sharp(frames, { join: { animated: true } }).webp({ quality: 70, loop: 0, delay, effort: 6 }).toFile(file);
  return { file, frames: order.length };
}

const g = await grid();
const a = await animation();
for (const f of [g, a.file]) console.log(path.relative(ROOT, f), `${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
console.log(`hero frames: ${a.frames}`);
