// Contact sheet of a segmentation: the source, its label map in flat colours, and its outlines over the source.
// Reads through src/crop/segments.mjs, so it also checks the loader agrees with the Python writer.
//   node tools/seg/check-sheet.mjs <image> [--out work/segments] [--width 520]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadSegments, silhouettes } from '../../src/crop/segments.mjs';

const COLOUR = {
  sky: [157, 198, 232], sea: [63, 127, 166], sand: [226, 196, 137], trees: [74, 107, 58],
  background: [207, 207, 207], figure: [208, 90, 60], dog: [51, 49, 58], ball: [111, 191, 58],
};
const fallback = id => [(id * 97) % 255, (id * 151) % 255, (id * 199) % 255];

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

function flatColours(seg) {
  const byId = new Map(seg.regions.map(r => [r.id, COLOUR[r.name] || fallback(r.id)]));
  const rgb = Buffer.alloc(seg.width * seg.height * 3, 255);
  for (let i = 0; i < seg.labels.length; i++) {
    const c = byId.get(seg.labels[i]);
    if (!c) continue;
    rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
  }
  return sharp(rgb, { raw: { width: seg.width, height: seg.height, channels: 3 } }).png().toBuffer();
}

function outlineSvg(seg) {
  const hex = n => '#' + (COLOUR[n] || [0, 0, 0]).map(v => v.toString(16).padStart(2, '0')).join('');
  const poly = (pts, close) => pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + (close ? ' Z' : '');
  const parts = [];
  for (const r of seg.contours.regions) {
    for (const p of r.polygons) {
      parts.push(`<polygon points="${poly(p)}" fill="none" stroke="${hex(r.name)}" stroke-width="1.6" stroke-opacity="0.85"/>`);
    }
  }
  // silhouette lines in black, so a horizon reads as a line and not as a fill edge
  for (const b of silhouettes(seg.contours)) {
    const tag = b.closed ? 'polygon' : 'polyline';
    parts.push(`<${tag} points="${poly(b.points)}" fill="none" stroke="#101014" stroke-width="2.6" stroke-opacity="0.9" stroke-linejoin="round"/>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${seg.width}" height="${seg.height}">${parts.join('')}</svg>`);
}

const source = process.argv[2];
if (!source) throw new Error('check-sheet: give it a source image');
const dir = arg('out', 'work/segments');
const base = path.basename(source, path.extname(source));
const pw = Number(arg('width', 520));
const meta = await sharp(source).metadata();
const ph = Math.round(pw * meta.height / meta.width);
const seg = await loadSegments(base, pw, ph, { dir });

const gap = 12;
const panels = [
  await sharp(source).resize(pw, ph, { fit: 'fill' }).toBuffer(),
  await sharp(await flatColours(seg)).resize(pw, ph, { fit: 'fill' }).toBuffer(),
  await sharp(source).resize(pw, ph, { fit: 'fill' }).composite([{ input: outlineSvg(seg), top: 0, left: 0 }]).toBuffer(),
];
const out = path.join(dir, `${base}-check.jpg`);
await sharp({ create: { width: pw * 3 + gap * 4, height: ph + gap * 2, channels: 3, background: '#ffffff' } })
  .composite(panels.map((input, i) => ({ input, top: gap, left: gap + i * (pw + gap) })))
  .jpeg({ quality: 88 }).toFile(out);
const share = seg.regions.map(r => `${r.name} ${(r.area * 100).toFixed(1)}%`).join(', ');
console.log(`${out}: ${share}`);
console.log(`  ${seg.contours.boundaries.length} boundaries, ${seg.contours.regions.reduce((a, r) => a + r.polygons.length, 0)} region contours`);
