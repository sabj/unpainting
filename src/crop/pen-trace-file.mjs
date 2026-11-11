// The subject's pen lines as a line file, traced as a pen draws them (pen-trace.mjs): read at the tracer's pixel for a
// sheet `sheetMm` wide, written in the subject's own pixels, one width and one weight per line. `pen`: the subject's
// medium reads as pen, so pale lines count. Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { tracePen, luminance, readSize } from './pen-trace.mjs';

/** Write <stem>-lines.json for an image on a sheet `sheetMm` wide. @returns {{ file, lines, inMass }} */
export async function writePenLines(image, stem, { sheetMm, pen }) {
  const meta = await sharp(image).metadata(), R = readSize(meta.width, meta.height, sheetMm);
  const own = await sharp(image).removeAlpha().raw().toBuffer();
  const data = R.back > 1 ? await sharp(image).removeAlpha().resize(R.w, R.h, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer() : own;
  const full = R.back > 1 ? { lum: luminance(own, meta.width, meta.height), W: meta.width, H: meta.height, k: R.back } : null;
  const t = tracePen(luminance(data, R.w, R.h), R.w, R.h, { pixelMm: R.pixelMm, pen, full }), k = R.back;
  const lines = t.lines.map(l => ({ points: l.points.map(([x, y]) => [+(x * k).toFixed(1), +(y * k).toFixed(1)]), length: +(l.length * k).toFixed(1),
    weight: +l.weight.toFixed(3), width: +(l.width * k).toFixed(2), role: 'subject', kind: 'line' }));
  fs.mkdirSync(path.dirname(stem), { recursive: true });
  const file = `${stem}-lines.json`;
  fs.writeFileSync(file, JSON.stringify({ source: 'pen trace (src/crop/pen-trace.mjs)', image: { w: meta.width, h: meta.height }, readWidth: R.w, sheetMm, pen, lines }) + '\n');
  return { file, lines, inMass: t.stats.inMass };
}
