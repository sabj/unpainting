#!/usr/bin/env node
// Builds the README's cheat demo: one target and three ways to reach it, side by side, on one clock. Run from anywhere:
//   node tools/readme/cheat-demo.mjs [--out docs/img] [--run <painter run dir>] [--target <target image>]
//
//   cheat-white-ships.webp  Four panels. First, the White Ships target. Second, cheat #1, run for real by
//                           hill-climb.mjs: dabs proposed at random and kept only if they bring the sheet closer to
//                           the target. Third, cheat #2, run for real by paint-by-numbers.mjs: the painter's own strokes
//                           replayed in order, each taking its paint from the photo's pixels under it. Last, a painter
//                           run of White Ships, frame by frame. A red X marks each cheat over the last 10% of strokes.
//                           Cheat #2 carries an inset heat map of where it read the target. The painter has none: its
//                           guard records 0 pixel reads, and its shape looks are logged without positions.
//
// --run is a paint-plate output directory with frames.json, its saved frames and painting.png; frames already resized
// to WebP under the same names are used in their place. --target is the image that run painted from (default: the
// run directory's target.webp, target.png or source.jpg). The default run, demos/lab/examples/white-ships-run/, is the
// release 0.1.0 (painter V096) White Ships render with a drawing plan written by hand, its saved frames and source.jpg resized to
// the panel size. Render with:
//   node tools/paint-plate.mjs --image examples/targets/white-ships.jpg --width 720 --mode full --threads 4
//     --valueplan examples/plans/white-ships.json --drawingfile white-ships-all --drawinglast white-ships-closing
//     --drawinglastmin 0.4 --graphiteprofile graphite-2B --openingpressure 0.7 --openingminmm 4 --marks 1
//     --phaselabels 1 --frames 200 --video 0
// The pen flags (--drawingfile through --openingminmm) were chosen for this run and are not part of the default recipe.
//
// --run also needs strokes.json.gz, the run's strokes from extract-strokes.mjs, for cheat #2.
//
// The painting frames are only laid out. The hill-climber's budget follows the painter's progress (its share of
// strokes when frames.json counts them, else each frame's position in the run), and cheat #2 lays the same number of
// strokes as the painter at every frame, so all three sit at the same point of their runs. Frame timing matches the
// build film: between two saved frames, GHOSTS moments show the brush ghost (brush-ghost.mjs) travelling the strokes
// of that gap, drawn identically on cheat #2 and the painter from the same stroke record; their paint shows at the next
// saved frame. Cheat #1 marks the dabs it kept since the last saved frame with small rings.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { hillClimber } from './hill-climb.mjs';
import { paintByNumbers, readStrokes, blurLevels, ghostStroke } from './paint-by-numbers.mjs';
import { ghostSvg } from './brush-ghost.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const arg = (name, fallback) => { const k = process.argv.indexOf(name); return k > 0 ? path.resolve(process.cwd(), process.argv[k + 1]) : fallback; };
const OUT = arg('--out', path.join(ROOT, 'docs/img'));
const RUN = arg('--run', path.join(ROOT, 'demos/lab/examples/white-ships-run'));
const TARGET = arg('--target', ['target.webp', 'target.png', 'source.jpg'].map(f => path.join(RUN, f)).find(f => fs.existsSync(f)));
const NAME = 'cheat-white-ships.webp';

// Pixel sizes are 2x: the README shows the sheet at half width.
const PANEL = 432, GAP = 32, BAND = 104, FONT = 26, PANELS = 4;
// The target-read inset, bottom right of the cheat #2 panel: heat map, then a label strip under it.
const INSET = 168, STRIP = 30, INSET_PAD = 10, INSET_FONT = 19;
const BUDGET = 3_285; // marks the hill-climber may keep: the painter's own stroke count for this run
const X_FROM = 0.9;     // the X shows from 90% of the painter's strokes (and so of each cheat's), through the final hold
const MAX_BYTES = 3_000_000, QUALITY = 53;
const CAPTION_FILL = '#768390', X_FILL = '#e5534b', DAB_FILL = '#863d2c';
// The build film's timing: first and last holds, a saved frame, its ghost moments, and the rewind. The film has three
// ghost moments of 70 ms per gap and rewinds through every second saved frame at 45 ms; to stay under the size cap
// with four panels this sheet has two of 105 ms and rewinds through every sixth at 135 ms (the same lengths).
const HOLD_START = 900, HOLD_END = 2600, SAVED = 110, GHOST = 105, GHOSTS = 2;
const REWIND = 135, REWIND_EVERY = 6;

const need = file => { if (!fs.existsSync(file)) throw new Error(`missing: ${path.relative(ROOT, file)}`); return file; };
const raw = (file, width, height, channels) => {
  const img = sharp(need(file)).resize(width, height, { fit: 'fill' }).removeAlpha();
  return (channels === 4 ? img.ensureAlpha() : img).raw().toBuffer();
};
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const count = n => n.toLocaleString('en-US');
// A large count in a few characters: 0, 950, 12K, 3.4M.
const short = n => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : count(n));

// The stage a saved frame shows, worded as in the build film.
function stageOf(f) {
  if (f.stage === 'paper') return 'Blank paper';
  if (f.stage === 'frisket') return 'Reserving the lights';
  if (f.stage === 'pen' || f.stage === 'pencil' || (f.stage === 'prep' && f.orderPhase === 'pen')) return 'Drawing';
  if (f.stage === 'lift') return 'Lifting the frisket';
  if (f.stage === 'ink') return 'Closing ink';
  if (f.stage === 'finished') return 'Finished';
  if (Number.isFinite(f.value) && Number.isFinite(f.of_values)) return f.value > f.of_values ? 'Look and correct' : `Value ${f.value} of ${f.of_values}`;
  return f.stage[0].toUpperCase() + f.stage.slice(1);
}

const marksOf = f => (f.strokes ?? 0) + (f.penLines ?? 0);
// Runs whose frames.json counts strokes use the share of strokes laid as the clock; others use each frame's position.
const counted = saved => saved.every(f => Number.isFinite(f.strokes));

function delays(order) {
  return order.map((m, k) => {
    if (m.rewind) return REWIND;
    if (k === 0) return HOLD_START;
    if (m.end) return HOLD_END;
    return m.ghost ? GHOST : SAVED;
  });
}

function bar(x, y, share) {
  return `<rect x="${x}" y="${y}" width="${PANEL}" height="8" rx="4" fill="${CAPTION_FILL}" opacity="0.25"/>` +
    `<rect x="${x}" y="${y}" width="${Math.round(PANEL * share)}" height="8" rx="4" fill="${CAPTION_FILL}"/>`;
}

const left = column => column * (PANEL + GAP);

// The inset box in a panel: heat map INSET wide, label strip under it, bottom right.
function insetBox(column, height) {
  const h = Math.round(INSET * height / PANEL);
  return { x: left(column) + PANEL - INSET_PAD - INSET, y: height - INSET_PAD - STRIP - h, w: INSET, h };
}

function overlay(width, height, { stage, share, progress, climb, steer, reads, ghost, dabs }) {
  const top = height + 54, low = height + 90;
  const t = (x, y, value, anchor = 'start', size = FONT) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}">${esc(value)}</text>`;
  const pad = 60, cross = column => `<g stroke="${X_FILL}" stroke-width="28" stroke-linecap="round" opacity="0.9">
      <line x1="${left(column) + pad}" y1="${pad}" x2="${left(column) + PANEL - pad}" y2="${height - pad}"/>
      <line x1="${left(column) + PANEL - pad}" y1="${pad}" x2="${left(column) + pad}" y2="${height - pad}"/></g>`;
  const marks = share >= X_FROM ? cross(1) + cross(2) : '';
  // The brush ghost, drawn at half scale and doubled so its lines match the build film at the README's display size.
  // Each is clipped to its panel so nothing lands in the clear gutters.
  const clips = [1, 2, 3].map(c => `<clipPath id="p${c}"><rect x="${left(c)}" y="0" width="${PANEL}" height="${height}"/></clipPath>`).join('');
  const brush = ghost ? [2, 3].map(c => `<g clip-path="url(#p${c})"><g transform="translate(${left(c)} 0) scale(2)">${ghost}</g></g>`).join('') : '';
  const kept = '<g clip-path="url(#p1)">' + dabs.map(m => `<circle cx="${left(1) + m.x}" cy="${m.y}" r="5" fill="none" stroke="white" stroke-width="4"/>` +
    `<circle cx="${left(1) + m.x}" cy="${m.y}" r="5" fill="none" stroke="${DAB_FILL}" stroke-width="2"/>`).join('') + '</g>';
  // Each inset's frame and label strip; the heat map itself is laid in as pixels before this overlay.
  const inset = (column, n) => {
    const b = insetBox(column, height);
    return `<rect x="${b.x}" y="${b.y + b.h}" width="${b.w}" height="${STRIP}" fill="#ffffff"/>
      <rect x="${b.x - 1}" y="${b.y - 1}" width="${b.w + 2}" height="${b.h + STRIP + 2}" fill="none" stroke="${CAPTION_FILL}" stroke-width="2"/>
      ${t(b.x + b.w / 2, b.y + b.h + STRIP - 9, `${short(n)} pixel reads`, 'middle', INSET_FONT)}`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + BAND}">
    <style>text{font-family:-apple-system,Helvetica,Arial,sans-serif;fill:${CAPTION_FILL}}</style>
    <defs>${clips}</defs>${kept}${brush}${inset(2, reads)}${marks}
    ${t(0, top, 'Target')}${t(0, low, 'Sargent, White Ships')}
    ${bar(left(1), height + 8, share)}${t(left(1), top, '#1 Cheat: Hill Climbing')}
    ${t(left(1), low, `${count(climb.kept)} strokes kept, ${count(climb.tried)} tried`)}
    ${bar(left(2), height + 8, share)}${t(left(2), top, '#2 Cheat: Paint by Numbers')}
    ${t(left(2), low, `${count(steer.laid)} strokes, paint from the photo`)}
    ${bar(left(3), height + 8, share)}${t(left(3), top, `Fair Mode: ${stage.toLowerCase()}`)}
    ${t(left(3), low, progress)}</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
}

// Heat colours for target reads: white where nothing was read, through amber to deep red at the most-read pixel.
const RAMP = [[255, 255, 255], [253, 219, 140], [240, 140, 50], [200, 50, 40], [110, 20, 30]];
function heatColour(v) {
  const x = Math.min(1, Math.max(0, v)) * (RAMP.length - 1), j = Math.min(RAMP.length - 2, Math.floor(x)), f = x - j;
  return RAMP[j].map((c, n) => Math.round(c + (RAMP[j + 1][n] - c) * f));
}

// Lays a heat map of `heat` (reads per panel pixel, PANEL x height) into the inset of `column`, scaled by log reads
// against `peak` so the map fills in as the run goes. Without `heat` the inset stays blank.
function placeHeat(frame, width, column, height, heat, peak) {
  const b = insetBox(column, height), k = PANEL / b.w;
  for (let y = 0; y < b.h + STRIP; y++) for (let x = 0; x < b.w; x++) {
    let v = 0;
    if (heat && y < b.h) {
      let sum = 0, n = 0;
      for (let sy = Math.floor(y * k); sy < Math.min(height, Math.floor((y + 1) * k)); sy++)
        for (let sx = Math.floor(x * k); sx < Math.min(PANEL, Math.floor((x + 1) * k)); sx++) { sum += heat[sy * PANEL + sx]; n++; }
      v = n ? Math.log1p(sum / n) / Math.log1p(peak) : 0;
    }
    const p = ((b.y + y) * width + b.x + x) * 4, [r, g, bl] = heatColour(v);
    frame[p] = r; frame[p + 1] = g; frame[p + 2] = bl; frame[p + 3] = 255;
  }
}

function place(frame, width, panel, column, height) {
  for (let y = 0; y < height; y++) panel.copy(frame, (y * width + left(column)) * 4, y * PANEL * 4, (y + 1) * PANEL * 4);
}

// Lays the overlay's non-clear pixels over the frame (source-over), so the X marks and insets sit on their panels.
function over(frame, layer) {
  for (let p = 0; p < frame.length; p += 4) {
    const a = layer[p + 3] / 255;
    if (a === 0) continue;
    const under = frame[p + 3] / 255, alpha = a + under * (1 - a);
    for (let c = 0; c < 3; c++) frame[p + c] = Math.round((layer[p + c] * a + frame[p + c] * under * (1 - a)) / alpha);
    frame[p + 3] = Math.round(alpha * 255);
  }
}

async function buildCheatDemo() {
  const doc = JSON.parse(fs.readFileSync(need(path.join(RUN, 'frames.json')), 'utf8'));
  const saved = doc.frames, last = saved.length - 1, byStrokes = counted(saved), total = byStrokes ? saved[last].strokes : 0;
  const shareOf = j => (byStrokes ? (total > 0 ? saved[j].strokes / total : 0) : saved[j].position ?? j / last);
  const progressOf = j => (byStrokes
    ? `${Math.round(100 * shareOf(j))}% of strokes, ${count(saved[j].strokes)} strokes`
    : `${Math.round(100 * shareOf(j))}% of the run, frame ${j} of ${last}`);
  const height = Math.round(PANEL * doc.height / doc.width), width = PANELS * PANEL + (PANELS - 1) * GAP;
  // A saved frame, preferring a resized WebP copy beside it; the last one is the finished painting.
  const fileOf = j => {
    const name = j === last ? 'painting.png' : saved[j].src, webp = path.join(RUN, name.replace(/\.(jpg|png)$/, '.webp'));
    return fs.existsSync(webp) ? webp : path.join(RUN, name);
  };
  const back = saved.slice(1, -1).map((_, j) => j + 1).reverse().filter((_, j) => j % REWIND_EVERY === 0);

  const [target, paper] = await Promise.all([raw(TARGET, PANEL, height, 3), raw(fileOf(0), PANEL, height, 3)]);
  const targetRgba = await raw(TARGET, PANEL, height, 4);
  const runTo = hillClimber({ paper, target, width: PANEL, height, budget: BUDGET });
  const climbed = saved.map((_, j) => runTo(shareOf(j)));
  console.log(`hill-climber: ${count(climbed[last].kept)} kept, ${count(climbed[last].tried)} tried, ${Math.round(100 * climbed[last].closed)}% of its error removed`);
  // Cheat #2 lays exactly the painter's stroke count at each saved frame (by position when frames.json has no counts).
  const tape = readStrokes(need(path.join(RUN, 'strokes.json.gz')));
  const levels = await blurLevels(target, PANEL, height);
  const steerTo = paintByNumbers({ strokes: tape.strokes, sheetWidth: tape.w, paper, levels, width: PANEL, height });
  const steered = saved.map((f, j) => steerTo(byStrokes ? marksOf(f) : Math.round(tape.strokes.length * shareOf(j))));
  const peak = steered[last].heat.reduce((a, b) => Math.max(a, b), 1);
  if (byStrokes && steered[last].laid !== marksOf(saved[last])) throw new Error(`strokes.json.gz has ${steered[last].laid} strokes, frames.json ${marksOf(saved[last])}`);
  console.log(`paint by numbers: ${count(steered[last].laid)} strokes, ${count(steered[last].reads)} pixel reads (cells)`);
  console.log(`error removed, cheat #2 by share of strokes: ${saved.map((_, j) => j).filter(j => j % 6 === 0 || j === last).map(j => `${Math.round(100 * shareOf(j))}%:${Math.round(100 * steered[j].closed)}%`).join(' ')}`);

  // The moments of the film: each saved frame, then GHOSTS moments with the brush partway through the next gap's
  // strokes (shown over that saved frame, whose paint is what is on the sheet), then the rewind.
  const ghosts = tape.strokes.map(ghostStroke), k = PANEL / 2 / tape.w, order = [];
  saved.forEach((f, j) => {
    order.push({ frame: j, end: j === last });
    if (j === last || !byStrokes) return;
    const gap = ghosts.slice(marksOf(f), marksOf(saved[j + 1]));
    for (let g = 0; g < GHOSTS && gap.length; g++) {
      const t = (g + 0.5) / GHOSTS * gap.length, at = Math.min(gap.length - 1, Math.floor(t));
      order.push({ frame: j, ghost: ghostSvg({ done: gap.slice(0, at), current: gap[at], f: t - at, k }) });
    }
  });
  order.push(...back.map(frame => ({ frame, rewind: true })));

  const frames = [];
  for (const { frame: j, ghost } of order) {
    const share = shareOf(j);
    const frame = Buffer.alloc(width * (height + BAND) * 4);
    place(frame, width, targetRgba, 0, height);
    place(frame, width, climbed[j].rgba, 1, height);
    place(frame, width, steered[j].rgba, 2, height);
    place(frame, width, await raw(fileOf(j), PANEL, height, 4), 3, height);
    placeHeat(frame, width, 2, height, steered[j].heat, peak);
    over(frame, await overlay(width, height, { stage: stageOf(saved[j]), share, progress: progressOf(j), climb: climbed[j], steer: steered[j], reads: steered[j].reads, ghost, dabs: climbed[j].fresh }));
    frames.push(frame);
  }
  const file = path.join(OUT, NAME), H = height + BAND;
  await sharp(Buffer.concat(frames), { raw: { width, height: H * frames.length, channels: 4, pageHeight: H } })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 5, minSize: true, loop: 0, delay: delays(order) }).toFile(file);
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_BYTES) throw new Error(`${NAME} is ${bytes} bytes, over ${MAX_BYTES}`);
  console.log(`${NAME}: ${width}x${H}, ${frames.length} frames, ${(bytes / 1024).toFixed(0)} KB`);
}

fs.mkdirSync(OUT, { recursive: true });
await buildCheatDemo();
