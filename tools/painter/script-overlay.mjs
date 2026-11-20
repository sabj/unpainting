// A painting script drawn over its subject: each passage's region outlined and its strokes drawn as the brush would lay
// them (width from the pressure), coloured by stage, with the passage ids; for looking at a script before it is painted.
//
//   node tools/painter/script-overlay.mjs SCRIPT.json SUBJECT.png OUT.png [--px PER_MM]
import fs from 'node:fs';
import sharp from 'sharp';
import { passageStrokes } from '../../src/paint/methods/script-washes.mjs';

const STAGE = ['', '#e8a317', '#2e9d4f', '#3a62d6', '#b0429a', '#d62e2e'];

/** The SVG of a script's passages at `px` pixels a millimetre. */
export function overlaySvg(script, W, H, px) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`];
  for (const p of script.passages) {
    const col = STAGE[Math.max(1, Math.min(5, Math.round(p.stage ?? 2)))];
    for (const P of (p.regions?.length ? p.regions : p.region ? [p.region] : [])) out.push(`<polygon points="${P.map(([x, y]) => `${(x * px).toFixed(1)},${(y * px).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`);
    for (const st of passageStrokes(p, script.brushes)) {
      for (let k = 1; k < st.points.length; k++) {
        const a = st.points[k - 1], b = st.points[k], wd = 2 * st.radiusMm * (0.25 + 0.75 * (a[2] + b[2]) / 2) * px;
        out.push(`<line x1="${(a[0] * px).toFixed(1)}" y1="${(a[1] * px).toFixed(1)}" x2="${(b[0] * px).toFixed(1)}" y2="${(b[1] * px).toFixed(1)}" stroke="${col}" stroke-width="${wd.toFixed(1)}" stroke-linecap="round" opacity="0.35"/>`);
      }
    }
    const P = (p.regions?.[0] ?? p.region ?? p.paths?.[0] ?? [[0, 0]])[0];
    out.push(`<text x="${(P[0] * px + 2).toFixed(1)}" y="${(P[1] * px + 11).toFixed(1)}" font-family="Helvetica" font-size="11" fill="${col}">${p.id}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [scriptFile, subject, outFile] = process.argv.slice(2);
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  const meta = await sharp(subject).metadata(), px = meta.width / script.sheet.widthMm;
  const base = await sharp(subject).removeAlpha().modulate({ saturation: 0.35, brightness: 1.08 }).toBuffer();
  await sharp(base).composite([{ input: Buffer.from(overlaySvg(script, meta.width, meta.height, px)) }]).png().toFile(outFile);
  console.log(outFile);
}
