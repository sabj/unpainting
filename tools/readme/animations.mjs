#!/usr/bin/env node
// Builds two small README animations. Run from anywhere:
//   node tools/readme/animations.mjs [--out docs/img] [--run <painter run dir> --target <target image>]
//
//   build-white-ships.webp  The target beside the painter's run, from blank paper to the finished painting, then
//                         rewound to blank paper at double speed. Needs --run (a paint-plate output directory with
//                         frames.json, its f*.jpg frames, painting.png and marks.json or marks.json.gz) and --target.
//                         Saved frames step with no blending. A labelled stroke path shows the last stroke
//                         belonging to the frame already displayed. The caption gives
//                         the stage from frames.json and the share and count of strokes laid. Without --run it is
//                         skipped.
//   wipe-white-ships.webp The target, with the finished painting sliding in over it from the left and
//                         back out. Each pixel is either target or painting; a thin grey line marks the edge.
//
// Only resizing, cropping, layout and the ghost's outline are applied. No painting frame is blended, recoloured or
// generated.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readTape, tapeStrokes, ghostSvg } from './brush-ghost.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const i = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, i > 0 ? process.argv[i + 1] : 'docs/img');
const LAB = path.join(ROOT, 'docs/lab/examples');
const arg = name => { const k = process.argv.indexOf(name); return k > 0 ? path.resolve(process.cwd(), process.argv[k + 1]) : null; };
const MAX_BYTES = 3_000_000, QUALITY = 82;
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }, CAPTION_FILL = '#768390', EDGE = [0xd0, 0xd7, 0xde];

const need = file => { if (!fs.existsSync(file)) throw new Error(`missing: ${path.relative(ROOT, file)}`); return file; };
const rgba = async (file, width, height) => sharp(need(file)).resize(width, height).ensureAlpha().raw().toBuffer();

async function save(name, frames, width, height, delay, options = {}) {
  const file = path.join(OUT, name);
  // Frames stacked into one tall raw image; pageHeight tells libwebp where each frame starts.
  await sharp(Buffer.concat(frames), { raw: { width, height: height * frames.length, channels: 4, pageHeight: height } })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 6, loop: 0, delay, ...options }).toFile(file);
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_BYTES) throw new Error(`${name} is ${bytes} bytes, over ${MAX_BYTES}`);
  console.log(`${name}: ${width}x${height}, ${frames.length} frames, ${(bytes / 1024).toFixed(0)} KB`);
}

// The stage a saved frame shows, from its frames.json entry.
function stageOf(f) {
  if (f.stage === 'paper') return 'Blank paper';
  if (f.stage === 'frisket') return 'Reserving the lights';
  if (f.stage === 'pen' || f.stage === 'pencil') return 'Drawing';
  if (f.stage === 'ink') return 'Closing ink';
  if (f.stage === 'finished') return 'Finished';
  if (Number.isFinite(f.value) && Number.isFinite(f.of_values)) return f.value > f.of_values ? 'Look and correct' : `Value ${f.value} of ${f.of_values}`;
  return f.stage[0].toUpperCase() + f.stage.slice(1);
}

// GHOSTS moments per gap between saved frames; each shows the brush partway through the strokes of that gap.
const GHOSTS = 3;

async function buildRun(run, targetFile, name) {
  const width = 360, framesDoc = JSON.parse(fs.readFileSync(need(path.join(run, 'frames.json')), 'utf8'));
  const saved = framesDoc.frames, sheetW = framesDoc.width, k = width / sheetW;
  const height = Math.round(width * framesDoc.height / framesDoc.width);
  const tapeFile = ['marks.json', 'marks.json.gz'].map(f => path.join(run, f)).find(f => fs.existsSync(f));
  if (!tapeFile) throw new Error(`missing: ${run}/marks.json`);
  const strokes = tapeStrokes(readTape(tapeFile));
  if (saved.some(f => !Number.isFinite(f.tape) || !Number.isFinite(f.strokes))) throw new Error('frames.json needs tape and strokes on every frame');
  const total = saved.at(-1).strokes;
  // The moments of the film: a saved frame, or a saved frame with the ghost partway through the next gap's strokes.
  const moments = [{ frame: 0 }];
  for (let j = 1; j < saved.length; j++) {
    const gap = strokes.filter(s => s.at >= saved[j - 1].tape && s.at < saved[j].tape);
    // The path belongs to the paint now visible in frame j, never the next unseen frame.
    if(gap.length)moments.push({frame:j,stage:j,done:[],current:gap.at(-1),f:1,laid:saved[j].strokes});
    moments.push({ frame: j });
  }
  const back = saved.slice(1, -1).map((_, j) => j + 1).reverse().filter((_, j) => j % 2 === 0).map(frame => ({ frame, rewind: true }));
  const order = [...moments, ...back];
  // Target on the left, painting on the right, a clear gap between them. Under the painting: a bar of the share of
  // strokes laid, the stage, and the share and count of strokes.
  const gap = 24, sheet = width * 2 + gap, band = 52, H = height + band;
  const target = await rgba(targetFile, width, height);
  const paintings = new Map();
  const paintingOf = async j => { if (!paintings.has(j)) paintings.set(j, await rgba(path.join(run, j === saved.length - 1 ? 'painting.png' : saved[j].src), width, height)); return paintings.get(j); };
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const frames = [];
  for (const m of order) {
    const laid = m.laid ?? saved[m.frame].strokes, share = total > 0 ? laid / total : 0, x = width + gap;
    const stage = stageOf(saved[m.stage ?? m.frame]);
    const ghost = m.current ? ghostSvg({ done: m.done, current: m.current, f: m.f, k }) : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet}" height="${H}">
      <g transform="translate(${x} 0)">${ghost}</g>
      <style>text{font:13px -apple-system,Helvetica,Arial,sans-serif;fill:${CAPTION_FILL}}</style>
      <text x="0" y="${height + 27}">Target</text>
      <rect x="${x}" y="${height + 4}" width="${width}" height="4" rx="2" fill="${CAPTION_FILL}" opacity="0.25"/>
      <rect x="${x}" y="${height + 4}" width="${Math.round(width * share)}" height="4" rx="2" fill="${CAPTION_FILL}"/>
      <text x="${x}" y="${height + 27}">${esc(stage)} · recording${m.current ? " / stroke path" : ""}</text>
      <text x="${x}" y="${height + 45}">${Math.round(100 * share)}% of strokes, ${laid.toLocaleString('en-US')} strokes</text></svg>`;
    const frame = Buffer.alloc(sheet * H * 4), painting = await paintingOf(m.frame);
    for (let y = 0; y < height; y++) {
      target.copy(frame, y * sheet * 4, y * width * 4, (y + 1) * width * 4);
      painting.copy(frame, (y * sheet + width + gap) * 4, y * width * 4, (y + 1) * width * 4);
    }
    const over = await sharp(frame, { raw: { width: sheet, height: H, channels: 4 } }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).raw().toBuffer();
    frames.push(over);
  }
  const last = moments.length - 1;
  const delay = order.map((m, j) => (j === 0 ? 900 : j === last ? 2600 : m.rewind ? 45 : m.current ? 70 : 110));
  await save(name, frames, sheet, H, delay, { quality: 76 });
}

const caption = (width, left, right) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><g font-family="Georgia, 'Times New Roman', serif" ` +
  `font-size="15" fill="${CAPTION_FILL}"><text x="2" y="20">${left}</text><text x="${width - 2}" y="20" text-anchor="end">${right}</text></g></svg>`);

async function wipeWhiteShips() {
  const width = 540, steps = 18;
  const meta = await sharp(need(path.join(LAB, 'white-ships/final.webp'))).metadata();
  const height = Math.round(width * meta.height / meta.width), H = height + 28;
  const target = await rgba(path.join(LAB, 'white-ships.webp'), width, height);
  const painting = await rgba(path.join(LAB, 'white-ships/final.webp'), width, height);
  const label = await sharp(caption(width, 'Painting', 'Target')).ensureAlpha().raw().toBuffer();
  const frame = edge => {
    const out = Buffer.alloc(width * H * 4);
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      painting.copy(out, row, row, row + edge * 4);
      target.copy(out, row + edge * 4, row + edge * 4, row + width * 4);
      if (edge > 0 && edge < width) for (const x of [edge - 1, edge]) out.set([...EDGE, 255], row + x * 4);
    }
    label.copy(out, height * width * 4);
    return out;
  };
  const ease = t => (1 - Math.cos(Math.PI * t)) / 2;
  const sweep = Array.from({ length: steps }, (_, k) => Math.round(width * ease((k + 1) / (steps + 1))));
  const edges = [0, ...sweep, width, ...[...sweep].reverse()];
  const delay = edges.map(e => (e === 0 ? 1600 : e === width ? 2400 : 55));
  await save('wipe-white-ships.webp', edges.map(frame), width, H, delay);
}

fs.mkdirSync(OUT, { recursive: true });
if (arg('--run')) await buildRun(arg('--run'), arg('--target') ?? need(''), 'build-white-ships.webp');
else console.log('build-white-ships.webp: skipped, no --run');
await wipeWhiteShips();
