// The last stage's thin darks: the lines planned by tools/plate/thin-darks-plan.mjs, laid with the rigger's point as paint. Each is
// one smooth stroke in the local dark mix: the palette paints that make up the line's own colour over the ground under it,
// at the subject's own step and never darker than the painting's own darkest wash. The load is the one the swatch found to hold
// a continuous line; a line the subject draws with less paint than that, over its ground, is not laid, and neither is one over
// paper left bare. Nothing is read from the target here.
import fs from 'node:fs';
import path from 'node:path';
import { mixFor } from '../../src/media/gouache.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';
import { POINT_INK_K } from '../../src/paint/methods/brush-swatch.mjs';
import { lstar } from '../../src/crop/thin-lights.mjs';

const MIN_GROUND_OD = 0.12;   // bare paper: a reserved light, which the washes carry
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const odOf = (c, paper) => [0, 1, 2].map(k => -Math.log(Math.max(0.02, Math.min(1, c[k] / Math.max(1, paper[k])))));

/** The brush's load for a thin dark: the paints that make the line's colour over its ground, as concentrations, or null if too faint to hold a line. */
export function lineLoad(lineOd, groundOd, capOd, pigments, k, { depositPerLoad, stableLoad }) {
  const need = lineOd.map((v, c) => Math.max(0, Math.min(v, capOd[c]) - groundOd[c]));
  const odStable = stableLoad * depositPerLoad * (POINT_INK_K[0] + POINT_INK_K[1] + POINT_INK_K[2]) / 3;   // the optical density of the lightest line that holds
  if ((need[0] + need[1] + need[2]) / 3 < odStable) return { conc: null, need, odStable };
  const solved = mixFor(need, pigments), conc = new Array(k).fill(0);
  for (const m of solved.mix) conc[m.pigment] = m.amount / depositPerLoad;
  return { conc, need, odStable, mix: solved.mix };
}

export async function layThinDarks(ctx) {
  const { THIN_DARKS_PLAN: plan, PIGS, SHEET_PIGS, SC, W2, H2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED, paperRGB, createBrush, dip, stroke, dry, O } = ctx;
  const sheet = ctx.sheet, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / W2, K = SHEET_PIGS.length, palette = PIGS.map(p => ({ K: Array.from(p.K) }));
  const swatch = plan.record.point, row = swatch.stable, settings = swatch.settings;
  const before = render(), painted = sheetDensity(before);
  const cell = p => Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)));
  // never darker than the painting's own darkest wash: the 99th percentile of its density per channel over the sheet
  const capOd = [0, 1, 2].map(ch => { const v = []; for (let i = 0; i < N2; i += 7) v.push(-Math.log(Math.max(0.02, before[i * 3 + ch] / Math.max(1, paperRGB[ch])))); v.sort((a, b) => a - b); return v[Math.floor(0.99 * (v.length - 1))]; });
  const laid = { lines: 0, lengthMm: 0, skippedReserved: 0, skippedTooFaint: 0, skippedAlreadyDrawn: plan.record.skippedAlreadyDrawn, skippedTooFine: plan.record.skippedTooFine };
  const mine = [];
  let n = 0;
  for (const s of plan.strokes) {
    const pts = s.curve.map(([x, y]) => ({ x, y })), along = median(pts.map(p => painted[cell(p)]));
    if (along < MIN_GROUND_OD) { laid.skippedReserved++; continue; }
    const ground = [0, 1, 2].map(c => median(pts.map(p => before[(Math.min(H2 - 1, Math.round(p.y * SC)) * W2 + Math.min(W2 - 1, Math.round(p.x * SC))) * 3 + c])));
    const load = lineLoad(odOf(s.rgb, paperRGB), odOf(ground, paperRGB), capOd, palette, K, { depositPerLoad: row.depositPerLoad, stableLoad: row.conc });
    if (!load.conc) { laid.skippedTooFaint++; continue; }
    const brush = createBrush({ radius: settings.radiusCells * SC, ...Object.fromEntries(Object.entries(settings).filter(([k]) => !['water', 'radiusCells'].includes(k))), seed: 900 + SEED + n++ });
    dip(brush, { water: settings.water, conc: load.conc });
    const last = pts.length - 1;
    stroke(brush, sheet, pts.map((p, i) => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: settings.radiusCells * SC, p: 1 - 0.5 * Math.pow(i / Math.max(1, last), 2) })), { upright: false });
    mine.push({ ...s, ground }); laid.lines++; laid.lengthMm += s.lengthMm;
  }
  if (laid.lines) dry(sheet, 20000, O, { levelMax: 200 });
  const after = render();
  const Lof = (b, i) => lstar(-Math.log(Math.max(0.02, Math.min(1, (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2])))));
  const rows = mine.map(s => { const idx = s.curve.map(([x, y]) => Math.min(H2 - 1, Math.round(y * SC)) * W2 + Math.min(W2 - 1, Math.round(x * SC))), change = idx.map(i => Lof(after, i) - Lof(before, i)).sort((a, b) => a - b), g = median(idx.map(i => Lof(before, i))), p = lstar(odOf(s.rgb, paperRGB).reduce((a, v) => a + v, 0) / 3); return { planned: p - g, painted: change[Math.floor(0.1 * (change.length - 1))] }; });
  laid.plannedAgainstPainted = rows.length ? { lines: rows.length, plannedStep: +median(rows.map(r => r.planned)).toFixed(1), paintedStep: +median(rows.map(r => r.painted)).toFixed(1) } : null;
  laid.lengthMm = +laid.lengthMm.toFixed(1); laid.load = { stableConc: row.conc, depositPerLoad: row.depositPerLoad, water: settings.water, capOd: capOd.map(v => +v.toFixed(2)), mmPerCell: +mmPerCell.toFixed(4) };
  ctx.THIN_DARKS_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'thin-darks.json'), JSON.stringify(ctx.THIN_DARKS_RECORD, null, 1));
  console.log(`thin darks: ${laid.lines} lines laid with the point, ${laid.lengthMm} mm; skipped ${laid.skippedAlreadyDrawn} already drawn, ${laid.skippedTooFine} too fine for the point, ${laid.skippedTooFaint} too faint to hold a line, ${laid.skippedReserved} on reserved light`);
  ctx.STAGE = { stage: 'thin-darks' }; ctx.NATIVE_CAPTURE?.('thin-darks');
  if (laid.lines && !FILM_BY_PAINT) await shoot();
  return laid;
}
