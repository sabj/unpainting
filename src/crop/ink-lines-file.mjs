// The source's own pen lines as a line file: the target read at a working width, its estimated ink
// (src/crop/ink-lines.mjs) traced to polylines and scaled back to source pixels. Shared by tools/seg/ink-lines.mjs and
// the painter's --sourcelines planning step. Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { inkLines } from './ink-lines.mjs';
import { paperOf } from './palettepick.mjs';

export const INK_LINE_DEFAULTS = Object.freeze({ width: 720, minLength: 8, bridge: 1, join: 12, margin: 0.02, darkWash: Infinity,
  ridgeHigh: 0.03, ridgeLow: 0.015, stepOverRidge: 1.4, maxWidth: 5 });

/**
 * Write <stem>-lines.json and <stem>.png for an image. `regions` is an optional { labels, legend, subject } at the
 * working size. @returns { file, lines, inkCells, w, h }
 */
export async function writeInkLines(image, stem, options = {}) {
  const o = { ...INK_LINE_DEFAULTS, ...options };
  if (!(o.width >= 64)) throw new Error(`ink lines: a working width of 64 pixels or more, not ${o.width}`);
  const meta = await sharp(image).metadata();
  const w = o.width, h = Math.round(meta.height * o.width / meta.width);
  const rgb = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
  const { paperRGB } = paperOf(rgb, w, h, { mode: 'source' });
  const reg = o.regions ?? {};
  const r = inkLines(rgb, w, h, paperRGB, { labels: reg.labels ?? null, legend: reg.legend ?? {}, subject: reg.subject ?? [], minLength: o.minLength, bridge: o.bridge,
    join: o.join, margin: o.margin, darkWash: o.darkWash, separator: { ridgeHigh: o.ridgeHigh, ridgeLow: o.ridgeLow, stepOverRidge: o.stepOverRidge, maxWidth: o.maxWidth } });
  const sx = meta.width / w, sy = meta.height / h;
  const lines = r.lines.map(g => ({ ...g, points: g.points.map(([x, y]) => [+(x * sx).toFixed(1), +(y * sy).toFixed(1)]), length: +(g.length * sx).toFixed(1),
    strength: +g.strength.toFixed(4), weight: +g.weight.toFixed(3), ...(g.wash == null ? {} : { wash: +g.wash.toFixed(3) }) }));
  fs.mkdirSync(path.dirname(stem), { recursive: true });
  const file = `${stem}-lines.json`;
  fs.writeFileSync(file, JSON.stringify({ source: 'estimated ink (src/crop/ink-lines.mjs)', image: { w: meta.width, h: meta.height },
    paperRGB: paperRGB.map(v => Math.round(v)), regions: o.regionsName ?? null, lines }) + '\n');
  await sharp(Buffer.from(Uint8Array.from(r.mask, v => (v ? 40 : 255))), { raw: { width: w, height: h, channels: 1 } }).png().toFile(`${stem}.png`);
  return { file, lines, inkCells: r.stats.ink, w, h };
}
