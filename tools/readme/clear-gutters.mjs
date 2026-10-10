#!/usr/bin/env node
// Makes the plain background around and between the panels of an existing figure transparent, so the figure sits on
// GitHub's light and dark themes alike. Use it for a figure whose builder is gone; prefer rebuilding when there is one.
//
//   node tools/readme/clear-gutters.mjs --in FIG.webp --out FIG.webp --panel left,top,width,height [--panel ...]
//
// Pixels inside each --panel box are kept exactly as decoded. Outside the boxes, every pixel is read as dark caption
// ink over the background colour (the top-left pixel unless --bg r,g,b is given): it becomes the mid grey caption
// colour, with alpha set by how far it is from the background. Background turns fully transparent, caption text keeps
// its anti-aliased edges. The result is written as a lossy WebP with a lossless alpha channel.
import fs from 'node:fs';
import sharp from 'sharp';

const CAPTION = [0x76, 0x83, 0x90], INK = 51, QUALITY = 90;
const args = process.argv.slice(2);
const all = name => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const one = name => all(name)[0];
const usage = 'usage: node tools/readme/clear-gutters.mjs --in FILE --out FILE --panel l,t,w,h [--panel ...] [--bg r,g,b]';
const numbers = (text, count) => {
  const list = String(text).split(',').map(Number);
  if (list.length !== count || list.some(n => !Number.isInteger(n) || n < 0)) throw new Error(`bad list "${text}". ${usage}`);
  return list;
};

const input = one('in'), output = one('out');
if (!input || !output || !all('panel').length) { console.error(usage); process.exit(2); }
if (!fs.existsSync(input)) { console.error(`missing: ${input}`); process.exit(2); }
const panels = all('panel').map(p => numbers(p, 4));

const { data, info } = await sharp(fs.readFileSync(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
if (data[3] === 0) { console.error(`${input} already has a transparent corner; run this on the opaque original`); process.exit(2); }
for (const [l, t, w, h] of panels) {
  if (l + w > width || t + h > height) { console.error(`panel ${l},${t},${w},${h} falls outside ${width}x${height}`); process.exit(2); }
}
const bg = one('bg') ? numbers(one('bg'), 3) : [data[0], data[1], data[2]];
const bgLum = (bg[0] + bg[1] + bg[2]) / 3;
const inPanel = (x, y) => panels.some(([l, t, w, h]) => x >= l && x < l + w && y >= t && y < t + h);

const out = Buffer.from(data);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (inPanel(x, y)) continue;
    const i = (y * width + x) * 4;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const ink = Math.min(1, Math.max(0, (bgLum - lum) / (bgLum - INK)));
    // Lossy noise in a flat background reads as a faint haze; clear anything under 4% ink.
    const alpha = ink < 0.04 ? 0 : Math.round(ink * 255);
    out[i] = CAPTION[0]; out[i + 1] = CAPTION[1]; out[i + 2] = CAPTION[2]; out[i + 3] = alpha;
  }
}
const webp = await sharp(out, { raw: { width, height, channels: 4 } })
  .webp({ quality: QUALITY, alphaQuality: 100, effort: 6 }).toBuffer();
fs.writeFileSync(output, webp);
console.log(output, `${width}x${height}`, `${(webp.length / 1024).toFixed(0)} KB`);
