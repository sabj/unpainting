#!/usr/bin/env node
// Renders the Rembrandt ink study (Woman Reading). It is not the figure in docs/ink.md, which comes from the Part 1
// Guardi and Tiepolo data; pass --out so the default path does not overwrite it. The study shows what the target's own pen lines offer, what the plan chooses, and what the painter does
// with it. Row 1: the target, the candidate lines (the target's estimated ink), the lines the plan chose, the painting
// in sepia ink. Row 2: the same subject painted with four drawing sections: no drawing, light graphite, sepia ink,
// black ink.
//
//   PYTHONPATH=work/models/sam/py .venv/bin/python tools/seg/subject-regions.py \
//     examples/targets/rembrandt-woman-reading.jpg --out work/regions/rembrandt-woman-reading \
//     --spec examples/plans/rembrandt-woman-reading-regions.json
//   node tools/seg/ink-lines.mjs examples/targets/rembrandt-woman-reading.jpg --out work/lines/rembrandt-woman-reading-ink \
//     --regions work/regions/rembrandt-woman-reading --margin 0.03 --ridgehigh 0.03 --ridgelow 0.015 --bridge 1 --join 12 --darkwash 0.3
//   nice -n 10 node tools/readme/ink-figure.mjs [--reuse 1]
//
// The plan ranks the candidates subject first (lines "regions": head, hands and book, then the clothing, then the
// setting, nothing in the dark wash) and keeps --max (90). Each painting runs at --width (720), twice the 360 px
// display size, so no panel is ever upscaled. --reuse 1 keeps paintings already in --work. The sepia run keeps its
// marks and frames. --weight 1 (ink weight); --drawinglogic 1 (the painter's joining, hand order and taper over the
// chosen lines, 0 to draw them as the file has them). The drawing sits on a pale wash, so --paperrgb defaults to the
// target's own toned sheet (--paperrgb auto or r,g,b otherwise); --unfade 1 instead paints from the target with its
// paper lifted to white and its darks deepened, on white paper.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { drawingFlags, planLines } from '../../src/paint/drawing-plan.mjs';
import { paperOf } from '../../src/crop/palettepick.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.lastIndexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const IMAGE = opt('image', 'examples/targets/rembrandt-woman-reading.jpg');
const LINES = opt('lines', 'work/lines/rembrandt-woman-reading-ink');
const WORK = opt('work', 'work/ink-figure');
const OUT = opt('out', 'docs/img/ink.webp');
const WIDTH = Number(opt('width', 720));
const REUSE = opt('reuse', '0') === '1';
const GAP = 24, CAPTION_H = 56, FONT = 26, MAX_BYTES = 900 * 1024;
const CREAM = { r: 247, g: 241, b: 228 };
const CAPTION_RGB = '#768390';

// A pen-and-wash master drawing: light washes under brown ink. --amount and --weight try other plans.
const PLAN = { subject: 'rembrandt-woman-reading', name: 'Rembrandt, Woman Reading',
  styleSelection: { style: 'ink-and-wash', reason: 'pen and brown ink with light brown wash' } };
const INK_WEIGHT = Number(opt('weight', 1));
// One drawing section per painting. The plan chooses; the line file only offers candidates.
// Only the chosen lines are drawn: no closing pen adds lines of its own.
const SHARED = { lines: 'regions', maxLines: Number(opt('max', 90)), closingLines: 0 };
const VARIANTS = [
  { id: 'none', label: 'Plan: no drawing', drawing: { medium: 'none' } },
  { id: 'graphite', label: 'Plan: light graphite', drawing: { ...SHARED, medium: 'graphite', weight: 0.2 } },
  { id: 'sepia', label: 'Plan: sepia ink', drawing: { ...SHARED, medium: 'ink', inkColor: 'sepia', weight: INK_WEIGHT }, keep: true },
  { id: 'black', label: 'Plan: black ink', drawing: { ...SHARED, medium: 'ink', inkColor: 'black', weight: INK_WEIGHT } },
];
const LOGIC = opt('drawinglogic', '1');
const UNFADE = opt('unfade', '0') === '1';

// The target with its toned sheet lifted to white and its darks deepened: each channel over the paper's, to a power.
async function unfade(file, out, gamma = Number(opt('unfadegamma', 1.3))) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const paper = paperOf(data, info.width, info.height, { mode: 'source' }).paperRGB;
  const px = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) px[i] = Math.round(255 * Math.min(1, data[i] / paper[i % 3]) ** gamma);
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 95 }).toFile(out);
  return out;
}
fs.mkdirSync(WORK, { recursive: true });
const TARGET = UNFADE ? await unfade(IMAGE, path.join(WORK, 'target-unfaded.jpg')) : IMAGE;
// The sheet: white for an unfaded target, else the target's own toned paper, so the painter does not wash the whole
// sheet to reach it.
const PAPER = UNFADE ? '252,251,248' : opt('paperrgb', await (async () => {
  const { data, info } = await sharp(IMAGE).removeAlpha().resize(400).raw().toBuffer({ resolveWithObject: true });
  return paperOf(data, info.width, info.height, { mode: 'source' }).paperRGB.map(v => Math.round(v)).join(',');
})());

function paint(variant) {
  const dir = path.join(WORK, variant.id), png = path.join(dir, 'painting.png');
  if (REUSE && fs.existsSync(png)) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  const plan = path.join(WORK, `${variant.id}-plan.json`);
  fs.writeFileSync(plan, JSON.stringify({ ...PLAN, drawing: variant.drawing }, null, 2) + '\n');
  const argv = ['tools/paint-plate.mjs', '--image', TARGET, '--width', String(WIDTH), '--mode', 'fast', '--valueplan', plan,
    '--drawingfile', LINES, '--drawinglogic', LOGIC, '--paperrgb', PAPER, '--seed', '0', '--runcache', '0', '--video', '0', '--out', dir,
    ...(variant.keep ? ['--marks', '1', '--frames', '40'] : [])];
  console.log(`painting ${variant.id}: node ${argv.join(' ')}`);
  const run = spawnSync(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.log'), `${run.stdout}${run.stderr}`);
  if (run.status !== 0 || !fs.existsSync(png)) throw new Error(`painting ${variant.id} failed (exit ${run.status}); see ${dir}/run.log`);
  return dir;
}

// The plan's chosen lines, drawn as the line file states them, on cream at the target's size.
function chosenLinesSvg(doc, drawing) {
  const flags = drawingFlags(drawing);
  const flag = name => { const i = flags.lastIndexOf(name); return i >= 0 ? flags[i + 1] : null; };
  const skip = new Set((flag('--drawingskip') ?? '').split(',').filter(Boolean));
  const num = (name, fallback) => Number(flag(`--${name}`) ?? fallback);
  const candidates = doc.lines.filter(g => !skip.has(g.role));
  const chosen = planLines(candidates, num);
  const { w, h } = doc.image;
  const paths = chosen.map(g => {
    const d = g.points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    return `<path d="${d}" stroke-width="${(0.8 + 1.6 * (g.weight ?? 0.5)).toFixed(2)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="rgb(${CREAM.r},${CREAM.g},${CREAM.b})"/>` +
    `<g fill="none" stroke="#3b2a1a" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  return { svg: Buffer.from(svg), chosen: chosen.length, candidates: doc.lines.length };
}

// Dark lines on white, laid on cream: the cream shows where the file is white.
async function onCream(file) {
  const meta = await sharp(file).metadata();
  const cream = sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: CREAM } });
  return cream.composite([{ input: await sharp(file).removeAlpha().toBuffer(), blend: 'multiply' }]).png().toBuffer();
}

// A panel at exactly WIDTH x height. Refuses to upscale and to stretch more than 1%.
async function panel(input, height, name) {
  const meta = await sharp(input).metadata();
  if (meta.width < WIDTH) throw new Error(`${name}: source is ${meta.width} px wide, under ${WIDTH}; it would be upscaled`);
  if (Math.abs(meta.height / meta.width - height / WIDTH) > 0.01) throw new Error(`${name}: aspect ${meta.width}x${meta.height} does not match ${WIDTH}x${height}`);
  console.log(`panel ${name}: source ${meta.width}x${meta.height}, shown at ${WIDTH}x${height}`);
  return sharp(input).removeAlpha().resize(WIDTH, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const caption = text => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${CAPTION_H}">` +
  `<text x="${WIDTH / 2}" y="${CAPTION_H / 2 + FONT / 3}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${FONT}" fill="${CAPTION_RGB}">${esc(text)}</text></svg>`);

const dirs = Object.fromEntries(VARIANTS.map(v => [v.id, paint(v)]));
const sepia = VARIANTS.find(v => v.keep);
const painted = await sharp(path.join(dirs.sepia, 'painting.png')).metadata();
const H = Math.round(painted.height * WIDTH / painted.width);
const doc = JSON.parse(fs.readFileSync(`${LINES}-lines.json`, 'utf8'));
const choice = chosenLinesSvg(doc, sepia.drawing);
console.log(`candidate lines ${choice.candidates}, chosen ${choice.chosen}`);
const rows = [
  [
    [await panel(TARGET, H, 'target'), UNFADE ? 'Target, unfaded' : 'Target'],
    [await panel(await onCream(`${LINES}.png`), H, 'candidate lines'), `Candidate lines (${choice.candidates})`],
    [await panel(await sharp(choice.svg).png().toBuffer(), H, 'chosen lines'), `Lines the plan chose (${choice.chosen})`],
    [await panel(path.join(dirs.sepia, 'painting.png'), H, 'painting'), 'Painting, sepia ink'],
  ],
  await Promise.all(VARIANTS.map(async v => [await panel(path.join(dirs[v.id], 'painting.png'), H, v.id), v.label])),
];
const width = rows[0].length * WIDTH + (rows[0].length + 1) * GAP;
const rowH = H + CAPTION_H;
const height = GAP + rows.length * rowH + (rows.length - 1) * GAP / 2;
const layers = rows.flatMap((row, r) => row.flatMap(([buf, label], c) => {
  const left = GAP + c * (WIDTH + GAP), top = GAP + r * (rowH + GAP / 2);
  return [{ input: buf, left, top }, { input: caption(label), left, top: top + H }];
}));
const canvas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toBuffer();
let quality = 92, data;
do { data = await sharp(canvas).webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer(); quality -= 2; } while (data.length > MAX_BYTES && quality >= 85);
if (data.length > MAX_BYTES) throw new Error(`${OUT}: ${(data.length / 1024).toFixed(0)} KB at quality 85, over ${MAX_BYTES / 1024} KB`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, data);
console.log(`${OUT} ${width}x${height} ${(data.length / 1024).toFixed(0)} KB webp quality ${quality + 2}`);
console.log(`sepia run kept with marks and frames: ${path.resolve(dirs.sepia)}`);
