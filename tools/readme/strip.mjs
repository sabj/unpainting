#!/usr/bin/env node
// Builds one README example strip: three images side by side at the same height, each with a short serif caption.
// The images are used as given (resized only); a crop box can be applied to each one first.
//
//   node tools/readme/strip.mjs --out docs/img/strip.webp \
//     --panel target.webp:"Target" --panel stage-050.jpg:"Halfway" --panel painting.png:"Finished" \
//     [--crop 0=left,top,width,height] [--height 300]
//
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const all = name => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const one = (name, fallback) => all(name)[0] ?? fallback;
const out = one('out');
const H = +one('height', 300), GAP = 10, CAPTION_H = 28, MAX_BYTES = 250 * 1024;
const panels = all('panel').map(p => { const k = p.lastIndexOf(':'); return { file: p.slice(0, k), label: p.slice(k + 1) }; });
const crops = Object.fromEntries(all('crop').map(c => { const [i, box] = c.split('='); const [left, top, width, height] = box.split(',').map(Number); return [i, { left, top, width, height }]; }));
if (!out || panels.length < 2) { console.error('usage: node tools/readme/strip.mjs --out FILE --panel IMAGE:LABEL --panel IMAGE:LABEL [...] [--crop N=l,t,w,h] [--height PX]'); process.exit(2); }
for (const p of panels) if (!fs.existsSync(p.file)) { console.error(`missing: ${p.file}`); process.exit(2); }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const caption = (text, width) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CAPTION_H}">` +
  `<text x="${width / 2}" y="19" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" fill="#333">${esc(text)}</text></svg>`);

const tiles = [];
for (const [i, p] of panels.entries()) {
  let img = sharp(p.file).removeAlpha();
  if (crops[i]) img = img.extract(crops[i]);
  const buf = await img.resize({ height: H }).toBuffer({ resolveWithObject: true });
  tiles.push({ buf: buf.data, width: buf.info.width, label: p.label });
}
const width = tiles.reduce((s, t) => s + t.width, 0) + GAP * (tiles.length + 1);
const layers = [];
let x = GAP;
for (const t of tiles) {
  layers.push({ input: t.buf, left: x, top: GAP }, { input: caption(t.label, t.width), left: x, top: GAP + H });
  x += t.width + GAP;
}
const canvas = sharp({ create: { width, height: GAP + H + CAPTION_H, channels: 3, background: '#ffffff' } }).composite(layers);
let quality = 82, data;
do { data = await sharp(await canvas.clone().png().toBuffer()).webp({ quality, effort: 6 }).toBuffer(); quality -= 6; } while (data.length > MAX_BYTES && quality > 30);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, data);
console.log(out, `${width}x${GAP + H + CAPTION_H}`, `${(data.length / 1024).toFixed(0)} KB`);
