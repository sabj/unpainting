#!/usr/bin/env node
// npm install
// node tools/readme/build-readme-media.mjs --trumbull <run dir> [--luce <run dir>] [--inbetween N] [--out docs/img]
// Each folder contains photo.png, source.jpg, painting.png and frames.json listing saved fNNNN.jpg frames.
// Only resizing and layout are applied. No painting frame is blended, recoloured or generated.
// --inbetween N: the Trumbull hero plays every saved frame plus in-betweens in true stroke order (stroke-order.mjs),
// about N frames in all, at twice the width; the run folder then also needs its marks.json. Without --luce the Luce
// figures and their manifest entry are left as they are.
// The space around and between the panels is transparent, and captions are a mid grey, so the figures sit on
// GitHub's light and dark themes alike.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { inBetweenFilm } from './stroke-order.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--trumbull', '--luce', '--out', '--inbetween'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('usage: node tools/readme/build-readme-media.mjs --trumbull DIR [--luce DIR] [--inbetween N] [--out DIR]');
  }
  flags[args[i].slice(2)] = args[i] === '--inbetween' ? Number(args[i + 1]) : path.resolve(args[i + 1]);
}
if (!flags.trumbull) throw new Error('--trumbull is required');
if (flags.inbetween !== undefined && !(flags.inbetween >= 2)) throw new Error('--inbetween needs a frame count of 2 or more');
const OUT = flags.out ?? path.join(ROOT, 'docs/img');
const COUNT = 30, FRAME_MS = 160, START_MS = 500, HOLD_MS = 2200;
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }, CAPTION_FILL = '#768390';
const round = n => +n.toFixed(6);
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rgb = file => sharp(file).flatten({ background: '#fff' }).toColourspace('srgb').raw().toBuffer();
function mad(a, b) {
  if (a.length !== b.length) throw new Error('paper, frames and final must have matching dimensions');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function measure(dir) {
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8')).frames;
  if (!timeline?.length || timeline[0].stage !== 'paper') throw new Error('frames.json must begin with blank paper');
  const final = await sharp(path.join(dir, 'painting.png')).metadata();
  for (const { src } of timeline) {
    if (!/^f\d+\.(jpg|png|webp)$/.test(src)) throw new Error(`invalid frame name: ${src}`);
    const meta = await sharp(path.join(dir, src)).metadata();
    if (meta.width !== final.width || meta.height !== final.height) throw new Error(`frame size differs: ${src}`);
  }
  const paper = await rgb(path.join(dir, timeline[0].src));
  const denominator = mad(await rgb(path.join(dir, 'painting.png')), paper);
  if (!denominator) throw new Error('final painting has no change from paper');
  const frames = [];
  for (const { src, stage } of timeline) {
    const change = mad(await rgb(path.join(dir, src)), paper);
    frames.push({ src, stage, change: round(change), progress: Math.min(1, change / denominator) });
  }
  frames.push({ src: 'painting.png', stage: 'final', change: round(denominator), progress: 1 });
  // Pick the nearest saved state to each visual-progress goal. Preserve chronology if a wash later lifts.
  function select(goals) {
    let cursor = 0;
    return goals.map(goal => {
      let best = goal === 1 ? frames.length - 1 : cursor;
      if (goal !== 1) {
        for (let i = cursor; i < frames.length; i++) {
          if (Math.abs(frames[i].progress - goal) < Math.abs(frames[best].progress - goal)) best = i;
        }
      }
      cursor = best;
      return { ...frames[best], goal };
    });
  }
  const files = ['photo.png', 'source.jpg', 'painting.png', 'frames.json', ...timeline.map(f => f.src)];
  return {
    dir, width: final.width, height: final.height, paper: timeline[0].src, finalChange: round(denominator),
    sources: Object.fromEntries(files.map(file => [file, sha256(path.join(dir, file))])), frames,
    animation: select(Array.from({ length: COUNT }, (_, i) => i / (COUNT - 1))),
    checkpoints: select([0.2, 0.4, 0.6, 0.8, 1]),
  };
}

const caption = (text, width, fontSize) => Buffer.from(
  `<svg width="${width}" height="30"><text x="${width / 2}" y="21" text-anchor="middle" ` +
  `font-family="sans-serif" font-size="${fontSize}" fill="${CAPTION_FILL}">${text}</text></svg>`);
const tile = (file, width, height) => sharp(file).flatten({ background: '#fff' })
  .resize(width, height, { fit: 'contain', background: '#fff' }).png().toBuffer();
const canvas = (width, height, layers) => sharp({ create: { width, height, channels: 4, background: CLEAR } })
  .composite(layers).png().toBuffer();

// Keep all 30 timeline samples, including repeated saved states where the source film has a gap.
// The first WebP frame carries the whole row; later frames replace only the painting panel.
// RIFF layout: https://developers.google.com/speed/webp/docs/riff_container
const uint24 = n => { const b = Buffer.alloc(3); b.writeUIntLE(n, 0, 3); return b; };
function chunk(name, data) {
  const header = Buffer.alloc(8);
  header.write(name); header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);
}
function animationFrame(webp, x, y, width, height, delay) {
  // sharp writes an opaque lossy still as one VP8 chunk following the 12-byte RIFF header, and a still with alpha as a
  // VP8X chunk (18 bytes) followed by ALPH and VP8. A frame carries the image chunks without the VP8X header.
  const kind = webp.toString('ascii', 12, 16);
  if (kind !== 'VP8 ' && kind !== 'VP8X') throw new Error('expected a lossy WebP');
  const image = webp.subarray(kind === 'VP8X' ? 30 : 12);
  if (!['ALPH', 'VP8 '].includes(image.toString('ascii', 0, 4))) throw new Error('unexpected WebP chunk layout');
  const header = Buffer.concat([uint24(x / 2), uint24(y / 2), uint24(width - 1), uint24(height - 1), uint24(delay), Buffer.from([2])]);
  return chunk('ANMF', Buffer.concat([header, image]));
}
async function animation(subject, file, width, maxBytes) {
  const gap = width === 1020 ? 24 : 18, panelW = (width - gap * 2) / 3;
  const panelH = Math.round(panelW * subject.height / subject.width), height = panelH + 30;
  const font = width === 1020 ? 17 : 14, right = 2 * (panelW + gap), layers = [];
  for (const [i, [src, label]] of [['photo.png', 'Photo'], ['source.jpg', 'Stylized target']].entries()) {
    layers.push({ input: await tile(path.join(subject.dir, src), panelW, panelH), left: i * (panelW + gap), top: 0 });
    layers.push({ input: caption(label, panelW, font), left: i * (panelW + gap), top: panelH });
  }
  layers.push({ input: caption('Painting', panelW, font), left: right, top: panelH });
  for (let i = 0; i < 2; i++) {
    const arrow = Buffer.from(`<svg width="${gap}" height="20"><path d="M3 10 H${gap - 3} M${gap - 8} 5 L${gap - 3} 10 L${gap - 8} 15" fill="none" stroke="${CAPTION_FILL}" stroke-width="1.5"/></svg>`);
    layers.push({ input: arrow, left: panelW + i * (panelW + gap), top: Math.round(panelH / 2) - 10 });
  }
  // VP8X flags: animation (0x02) and alpha (0x10). ANIM: transparent background, infinite loop.
  const chunks = [chunk('VP8X', Buffer.concat([Buffer.from([0x12, 0, 0, 0]), uint24(width - 1), uint24(height - 1)])),
    chunk('ANIM', Buffer.from([0, 0, 0, 0, 0, 0]))];
  for (const [i, frame] of subject.animation.entries()) {
    const painting = await tile(path.join(subject.dir, frame.src), panelW, panelH);
    const input = i === 0 ? await canvas(width, height, [...layers, { input: painting, left: right, top: 0 }]) : painting;
    // The first frame is the whole row with its transparent gutters; later frames are the opaque painting panel.
    const still = i === 0 ? sharp(input) : sharp(input).removeAlpha();
    const webp = await still.webp({ quality: 82, alphaQuality: 100, effort: 6 }).toBuffer();
    chunks.push(animationFrame(webp, i === 0 ? 0 : right, 0, i === 0 ? width : panelW, i === 0 ? height : panelH,
      i === 0 ? START_MS : i === COUNT - 1 ? HOLD_MS : FRAME_MS));
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  const data = Buffer.concat([header, body]);
  if (data.length > maxBytes) throw new Error(`${file} exceeds its byte budget`);
  fs.writeFileSync(path.join(OUT, file), data);
  return { file, width, height, bytes: data.length, frames: COUNT, loop: 0, durationMs: START_MS + (COUNT - 2) * FRAME_MS + HOLD_MS };
}
// The hero row at `width`, painting panel playing every saved frame and its stroke-order in-betweens. Frames after the
// first carry only the rectangle that changed since the frame before (no blending, no disposal), so the in-betweens,
// which change a few strokes' worth of pixels each, stay small.
async function strokeOrderHero(subject, file, width, total, maxBytes) {
  const s = width / 1020, gap = Math.round(24 * s), capH = Math.round(30 * s), font = Math.round(17 * s);
  const panelW = Math.floor((width - gap * 2) / 3), panelH = Math.round(panelW * subject.height / subject.width), height = panelH + capH;
  const right = 2 * (panelW + gap), layers = [];
  const cap = (text, w) => Buffer.from(`<svg width="${w}" height="${capH}"><text x="${w / 2}" y="${Math.round(21 * s)}" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="${CAPTION_FILL}">${text}</text></svg>`);
  for (const [i, [src, label]] of [['photo.png', 'Photo'], ['source.jpg', 'Stylized target']].entries()) {
    layers.push({ input: await tile(path.join(subject.dir, src), panelW, panelH), left: i * (panelW + gap), top: 0 });
    layers.push({ input: cap(label, panelW), left: i * (panelW + gap), top: panelH });
  }
  layers.push({ input: cap('Painting', panelW), left: right, top: panelH });
  for (let i = 0; i < 2; i++) {
    const arrow = Buffer.from(`<svg width="${gap}" height="${Math.round(20 * s)}"><path d="M${3 * s} ${10 * s} H${gap - 3 * s} M${gap - 8 * s} ${5 * s} L${gap - 3 * s} ${10 * s} L${gap - 8 * s} ${15 * s}" fill="none" stroke="${CAPTION_FILL}" stroke-width="${1.5 * s}"/></svg>`);
    layers.push({ input: arrow, left: panelW + i * (panelW + gap), top: Math.round(panelH / 2 - 10 * s) });
  }
  const timeline = JSON.parse(fs.readFileSync(path.join(subject.dir, 'frames.json'), 'utf8')).frames;
  const files = timeline.map((f, k) => path.join(subject.dir, k === timeline.length - 1 ? 'painting.png' : f.src));
  const film = await inBetweenFilm({ files, tapeFile: path.join(subject.dir, 'marks.json'), sheetW: subject.width, w: panelW, h: panelH, total });
  const chunks = [chunk('VP8X', Buffer.concat([Buffer.from([0x12, 0, 0, 0]), uint24(width - 1), uint24(height - 1)])),
    chunk('ANIM', Buffer.from([0, 0, 0, 0, 0, 0]))];
  const frameMs = Math.max(40, Math.round((COUNT - 2) * FRAME_MS / Math.max(1, film.length - 2)));
  let prev = null;
  for (const [i, { rgb: buf }] of film.entries()) {
    const delay = i === 0 ? START_MS : i === film.length - 1 ? HOLD_MS : frameMs;
    if (i === 0) {
      const painting = await sharp(buf, { raw: { width: panelW, height: panelH, channels: 3 } }).png().toBuffer();
      const webp = await sharp(await canvas(width, height, [...layers, { input: painting, left: right, top: 0 }])).webp({ quality: 82, alphaQuality: 100, effort: 6 }).toBuffer();
      chunks.push(animationFrame(webp, 0, 0, width, height, delay));
    } else {
      // The changed rectangle, widened to even offsets as the ANMF header stores x / 2 and y / 2.
      let x0 = panelW, y0 = panelH, x1 = -1, y1 = -1;
      for (let p = 0; p < panelW * panelH; p++) if (buf[3 * p] !== prev[3 * p] || buf[3 * p + 1] !== prev[3 * p + 1] || buf[3 * p + 2] !== prev[3 * p + 2]) { const x = p % panelW, y = (p / panelW) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
      x0 -= x0 % 2; y0 -= y0 % 2;
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      const webp = await sharp(buf, { raw: { width: panelW, height: panelH, channels: 3 } }).extract({ left: x0, top: y0, width: cw, height: ch }).webp({ quality: 68, effort: 6 }).toBuffer();
      chunks.push(animationFrame(webp, right + x0, y0, cw, ch, delay));
    }
    prev = buf;
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8); header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  const data = Buffer.concat([header, body]);
  if (data.length > maxBytes) throw new Error(`${file} is ${data.length} bytes, over its budget of ${maxBytes}`);
  fs.writeFileSync(path.join(OUT, file), data);
  return { file, width, height, bytes: data.length, frames: film.length, loop: 0, durationMs: START_MS + (film.length - 2) * frameMs + HOLD_MS, inBetween: 'true stroke order from marks.json' };
}
async function progressRow(subject, file) {
  const width = 720, gap = 10, panelW = (width - gap * 4) / 5;
  const panelH = Math.round(panelW * subject.height / subject.width), layers = [];
  for (const [i, frame] of subject.checkpoints.entries()) {
    const left = i * (panelW + gap);
    layers.push({ input: await tile(path.join(subject.dir, frame.src), panelW, panelH), left, top: 0 });
    layers.push({ input: caption(`${Math.round(frame.goal * 100)}%`, panelW, 14), left, top: panelH });
  }
  const data = await sharp(await canvas(width, panelH + 30, layers)).webp({ quality: 88, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(OUT, file), data);
  return { file, width, height: panelH + 30, bytes: data.length, frames: 1 };
}

fs.mkdirSync(OUT, { recursive: true });
const previous = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'readme-media.json'), 'utf8')); } catch { return null; } })();
const manifest = { metric: 'MAD(frame, blank paper) / MAD(painting.png, blank paper), native sRGB; clipped to [0, 1]',
  selection: 'Nearest chronological saved frames to 30 evenly spaced progress goals and 20/40/60/80/100%; endpoints are paper and painting.png.',
  sharp: sharp.versions, subjects: {}, outputs: [] };
for (const name of ['trumbull', 'luce']) {
  if (!flags[name]) {
    // Not rebuilt: keep this subject's earlier record and outputs.
    if (previous?.subjects?.[name]) manifest.subjects[name] = previous.subjects[name];
    manifest.outputs.push(...(previous?.outputs ?? []).filter(o => o.file.includes(`-${name}.`)));
    continue;
  }
  const subject = await measure(flags[name]);
  if (name === 'trumbull') manifest.outputs.push(flags.inbetween ? await strokeOrderHero(subject, 'hero-trumbull.webp', 2040, flags.inbetween, 4_000_000) : await animation(subject, 'hero-trumbull.webp', 1020, 3_000_000));
  manifest.outputs.push(await animation(subject, `example-${name}.webp`, 720, 1_500_000));
  manifest.outputs.push(await progressRow(subject, `progress-${name}.webp`));
  const { dir, ...record } = subject;
  // Do not commit private source paths or the original photographs.
  manifest.subjects[name] = JSON.parse(JSON.stringify(record, (key, value) => key === 'progress' || key === 'goal' ? round(value) : value));
}
fs.writeFileSync(path.join(OUT, 'readme-media.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const output of manifest.outputs) console.log(`${output.file}: ${output.width}x${output.height}, ${output.frames} frames, ${output.bytes} bytes`);
