// Thumbnails, stage strips, placeholders and the progression contact sheet. All small WebP or JPEG files.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const STAGES = [10, 25, 50, 75, 100];
/** The stages a gallery strip shows. The finished painting (100%) has its own column. */
export const STRIP_STAGES = [10, 25, 50, 75];
export const FINAL_W = 300, STAGE_H = 122, GAP = 6, QUALITY = 80;
/** How far each stage frame is blended toward the paper colour, so the finished painting reads first. */
export const STAGE_FADE = 0.3;
const PAPER = { r: 255, g: 255, b: 255 };
const TAG = { fill: '#f3eee2', stroke: '#c9c2b2', text: '#2b2824', font: 10, h: 14, pad: 2.5, inset: 3 };

/** The final painting as a WebP at most 300 px wide. */
export const thumb = (src, dst) => sharp(src).resize({ width: FINAL_W, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6 }).toFile(dst);

/** Panels side by side with white gaps. `panels` are PNG buffers of equal height. Returns a sharp instance. */
async function joinPanels(panels) {
  const metas = await Promise.all(panels.map(p => sharp(p).metadata()));
  const height = metas[0].height;
  const width = metas.reduce((a, m) => a + m.width + GAP, -GAP);
  let left = 0;
  const composite = panels.map((input, i) => { const c = { input, left, top: 0 }; left += metas[i].width + GAP; return c; });
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(composite);
}

/** Panels side by side, each scaled to `height`, with white gaps. Returns a sharp instance. */
async function strip(files, height) {
  return joinPanels(await Promise.all(files.map(f => sharp(f).resize({ height }).png().toBuffer())));
}

/** A small rounded tag reading "<pct>%" for the top-right corner of a frame `width` px wide. */
function earmarkSvg(pct, width) {
  const label = `${pct}%`;
  const w = Math.round(label.length * TAG.font * 0.62 + TAG.pad * 2);
  const x = width - w - TAG.inset;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${TAG.h + TAG.inset * 2}">`
    + `<rect x="${x + 0.5}" y="${TAG.inset + 0.5}" width="${w - 1}" height="${TAG.h - 1}" rx="3" fill="${TAG.fill}" stroke="${TAG.stroke}"/>`
    + `<text x="${x + w / 2}" y="${TAG.inset + TAG.h - 4}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" `
    + `font-size="${TAG.font}" font-weight="700" fill="${TAG.text}">${label}</text></svg>`);
}

/** One stage frame: faded toward the paper colour, with its percentage earmarked at the top right. */
export async function stagePanel(input, pct) {
  const k = 1 - STAGE_FADE;
  const faded = await sharp(input).removeAlpha().linear([k, k, k], [PAPER.r, PAPER.g, PAPER.b].map(v => v * STAGE_FADE)).png().toBuffer();
  const { width } = await sharp(faded).metadata();
  return sharp(faded).composite([{ input: earmarkSvg(pct, width), left: 0, top: 0 }]).png().toBuffer();
}

/** Stage panels (PNG buffers at STAGE_H, in STRIP_STAGES order) as one WebP strip. */
export async function writeStageStrip(panels, dst) {
  const marked = await Promise.all(panels.map((p, i) => stagePanel(p, STRIP_STAGES[i])));
  await (await joinPanels(marked)).webp({ quality: QUALITY, effort: 6 }).toFile(dst);
  return path.basename(dst);
}

/** The kit's stage frames (frames/stage-10.png .. stage-75.png) as one WebP strip, or null when any is missing. */
export async function stageStrip(framesDir, dst) {
  const files = STRIP_STAGES.map(p => path.join(framesDir, `stage-${p}.png`));
  if (!files.every(f => fs.existsSync(f))) return null;
  return writeStageStrip(await Promise.all(files.map(f => sharp(f).resize({ height: STAGE_H }).png().toBuffer())), dst);
}

/** A paper-coloured tile with a grey [x] and a short reason, for a cell with no painting. */
export async function placeholder(reason, dst, width = 150, height = STAGE_H) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="#f7f3ea" stroke="#d8d1c2"/>`
    + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#9a958c">[x]</text>`
    + `<text x="${width / 2}" y="${height / 2 + 24}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#6f6a62">${reason}</text></svg>`;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: QUALITY, effort: 6 }).toFile(dst);
  return dst;
}

/** The progression check's sheet: the target, then the five stage frames, at the target's height, as JPEG. */
export async function progressionSheet(target, framesDir, dst) {
  const files = [target, ...STAGES.map(p => path.join(framesDir, `stage-${p}.png`))];
  if (!files.every(f => fs.existsSync(f))) return null;
  const { height } = await sharp(target).metadata();
  await (await strip(files, height)).jpeg({ quality: 85 }).toFile(dst);
  return dst;
}
