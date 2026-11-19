// A coat's texture, laid with the engine's dry brush (tools/plate/coat-plan.mjs planned the strokes). The brush has bristles
// and little water; dragged along the hair it leaves paint only on the hills of the paper's tooth, so one stroke is many
// fine streaks. A light stroke carries white gouache tinted to the strand's colour, loaded as thick paste (LOAD times the
// hiding film); a dark stroke carries the coat's own paint in the mix that makes up the strand's colour over the ground
// under it, and goes only where the painting is lighter than the strand. A light stroke goes only where the washes covered
// its light. Nothing is read from the target here: colours and strands were planned before the first wash.
import fs from 'node:fs';
import path from 'node:path';
import { potShare, mixFor, GOUACHE_FILM } from '../../src/media/gouache.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';
import { BRUSH_SETTINGS, LOAD_FILMS } from '../../src/paint/methods/brush-swatch.mjs';
import { lstar } from '../../src/crop/thin-lights.mjs';
import { lineDarkness } from '../../src/paint/methods/line-weight.mjs';
import { lPlane } from '../../src/paint/methods/ink-match.mjs';

export const LOAD = LOAD_FILMS;  // gouache paste on the brush, in hiding films, as the swatch loads it: a dry brush leaves about a tenth of it on the tooth's hills
export const DEPOSIT = 0.16;     // thickness the dry brush leaves on the hills, as a share of its load: the 90th percentile of the pixels that take paint, 0.157, 0.155, 0.158, 0.162 at loads of 3, 6, 12, 30 (measured on the engine's brush, water 0.5). The plan's step is laid at the hills, not at the median pixel, so the painted step is capped at the subject's
const { water: WATER, ...BRUSH } = BRUSH_SETTINGS, MARGIN_OD = 0.15, MIN_NEED = 0.1;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const odOf = (c, paper) => [0, 1, 2].map(k => -Math.log(Math.max(0.02, Math.min(1, c[k] / Math.max(1, paper[k])))));

/** The brush's load for a light stroke: white paste and the pot of tinted paste, in the share its colour asks for, as concentrations on a sheet of `k` pigments. */
export function lightLoad(stroke, paperRGB, pot, gouacheAt, potAt, k) {
  const conc = new Array(k).fill(0), share = stroke.rgb ? potShare(stroke.rgb, paperRGB, pot) : 0;
  conc[gouacheAt] = (1 - share) * GOUACHE_FILM * LOAD; conc[potAt] = share * GOUACHE_FILM * LOAD;
  return { conc, share };
}

/** The brush's load for a dark stroke: the paints that add what the strand needs over the ground, as concentrations. */
export function darkLoad(strandOd, groundOd, pigments, k) {
  const need = strandOd.map((v, c) => Math.max(0, v - groundOd[c]));
  if (need[0] + need[1] + need[2] < MIN_NEED) return null;
  const solved = mixFor(need, pigments), conc = new Array(k).fill(0);
  for (const m of solved.mix) conc[m.pigment] = m.amount / DEPOSIT;
  return { conc, need, mix: solved.mix };
}

export async function layCoats(ctx) {
  const { COAT_PLAN: plan, PIGS, GOUACHE_AT, POT_AT, SHEET_PIGS, SC, W2, H2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED, paperRGB, createBrush, dip, stroke, dry, O, UPRIGHT } = ctx;
  const sheet = ctx.sheet, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / W2, K = SHEET_PIGS.length, palette = PIGS.map(p => ({ K: Array.from(p.K) }));
  const before = render(), painted = sheetDensity(before), coatMask = ctx.SURFACE_PLAN?.coatMask;
  // a dark strand is never darker than the coat's own darkest wash: the 98th percentile of its density per channel in the coat
  const capOd = [0, 1, 2].map(ch => { const v = []; for (let y = 0; y < H2; y += 2) for (let x = 0; x < W2; x += 2) if (!coatMask || coatMask[Math.min(h - 1, Math.floor(y / SC)) * w + Math.min(w - 1, Math.floor(x / SC))]) v.push(-Math.log(Math.max(0.02, before[(y * W2 + x) * 3 + ch] / Math.max(1, paperRGB[ch])))); v.sort((a, b) => a - b); return v.length ? v[Math.floor(0.98 * (v.length - 1))] : Infinity; });
  const lstarOf = b => i => lstar(-Math.log(Math.max(0.02, Math.min(1, (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2])))));
  const mine = [];
  const cell = p => Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)));
  const laid = { light: 0, dark: 0, skippedWashKeptLight: 0, skippedNoNeed: 0, skippedReserved: 0, lengthMm: 0, byKind: {} };
  let n = 0;
  for (const s of plan.strokes) {
    const along = median(s.points.map(p => painted[cell(p)]));
    let load, dark = s.polarity === 'dark';
    if (dark) {
      if (along < 0.2) { laid.skippedReserved++; continue; } // paper or a reserved light: the washes carry it
      const g = [0, 1, 2].map(c => median(s.points.map(p => before[(Math.min(H2 - 1, Math.round(p.y * SC)) * W2 + Math.min(W2 - 1, Math.round(p.x * SC))) * 3 + c])));
      load = s.rgb ? darkLoad(odOf(s.rgb, paperRGB).map((v, ch) => Math.min(v, capOd[ch])), odOf(g, paperRGB), palette, K) : null;
      if (!load) { laid.skippedNoNeed++; continue; }
      s.cappedRGB = odOf(s.rgb, paperRGB).map((v, ch) => paperRGB[ch] * Math.exp(-Math.min(v, capOd[ch])));
    } else {
      if (along - s.od < MARGIN_OD) { laid.skippedWashKeptLight++; continue; }
      load = lightLoad(s, paperRGB, SHEET_PIGS[POT_AT], GOUACHE_AT, POT_AT, K);
    }
    const brush = createBrush({ radius: s.points[0].r * SC, ...BRUSH, seed: 700 + SEED + n++ });
    dip(brush, { water: WATER, conc: load.conc });
    stroke(brush, sheet, s.points.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: p.r * SC, p: p.p })), { upright: UPRIGHT });
    mine.push(s); laid[dark ? 'dark' : 'light']++; laid.lengthMm += s.lengthMm; laid.byKind[s.kind] = (laid.byKind[s.kind] ?? 0) + 1;
  }
  if (laid.light + laid.dark) dry(sheet, 20000, O, { levelMax: 200 });
  // what the strokes did, measured on the sheet's own render before and after
  const after = render(), Ls = (b, i) => { const Y = (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  const up = [], down = []; let changed = 0;
  for (let i = 0; i < N2; i++) { const d = Ls(after, i) - Ls(before, i); if (Math.abs(d) > 2) { changed++; (d > 0 ? up : down).push(d); } }
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.floor(f * (s.length - 1))].toFixed(1) : null; };
  // planned against painted lightness, on the strokes laid: the strand's planned step over the ground, and the step the paint made
  // where it took (the 90th percentile of the per-pixel gain along a light stroke, the 10th of the loss along a dark one)
  const Lb = lstarOf(before), La = lstarOf(after), gap = pol => {
    const rows = mine.filter(s => s.polarity === pol).map(s => {
      const idx = s.points.map(p => Math.min(H2 - 1, Math.round(p.y * SC)) * W2 + Math.min(W2 - 1, Math.round(p.x * SC))), ground = median(idx.map(Lb)), change = idx.map(i => La(i) - Lb(i)).sort((a, b) => a - b);
      return { planned: lstar(-Math.log(Math.max(0.02, Math.min(1, (0.2126 * s.rgb[0] + 0.7152 * s.rgb[1] + 0.0722 * s.rgb[2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]))))), ground, step: pol === 'light' ? change[Math.floor(0.9 * (change.length - 1))] : change[Math.floor(0.1 * (change.length - 1))] };
    });
    return rows.length ? { strokes: rows.length, plannedLstar: +median(rows.map(r => r.planned)).toFixed(1), groundLstar: +median(rows.map(r => r.ground)).toFixed(1), plannedStep: +median(rows.map(r => r.planned - r.ground)).toFixed(1), paintedStep: +median(rows.map(r => r.step)).toFixed(1) } : null;
  };
  // the dark strokes read as lines, as the thin darks are (line-weight.mjs lineDarkness): the step the subject's strands show,
  // the step the load was chosen for, and the step the paint added along the stroke. What the paint added is read on the
  // change in the sheet's lightness: a coat's strokes lie among each other and along the edges of washes, and the change is
  // the stroke's own.
  const LB = lPlane(before, N2), LA = lPlane(after, N2), change = Float32Array.from(LA, (v, i) => v - LB[i]), r2 = v => +(+v).toFixed(2);
  const rows = mine.filter(s => s.polarity === 'dark').map(s => {
    const pts = s.points.map(p => [(p.x + 0.5) * SC, (p.y + 0.5) * SC]), b = lineDarkness(pts, LB, W2, H2, mmPerCell), a = lineDarkness(pts, LA, W2, H2, mmPerCell), strandL = lPlane(Uint8ClampedArray.from(s.cappedRGB), 1)[0];
    return { region: s.region, kind: s.kind, lengthMm: s.lengthMm, widthMm: s.widthMm, step: s.step ?? null, strandL: r2(strandL), groundL: r2(b.on), present: r2(b.drop), planned: r2(b.on - strandL), added: r2(Math.max(0, -lineDarkness(pts, change, W2, H2, mmPerCell).on)), shown: r2(a.drop), from: [s.points[0].x, s.points[0].y].map(Math.round), to: [s.points.at(-1).x, s.points.at(-1).y].map(Math.round) };
  });
  const med = f => (rows.length ? r2(median(rows.map(f))) : null);
  laid.plannedAgainstPainted = { light: gap('light'), dark: gap('dark'), darkAsLines: rows.length ? { strokes: rows.length, subjectStep: med(r => r.step ?? 0), plannedStep: med(r => r.planned), before: med(r => r.present), addedStep: med(r => r.added), shownStep: med(r => r.shown), meanOver: r2(rows.reduce((t, r) => t + Math.max(0, r.added - r.planned), 0) / rows.length), overSubject: rows.filter(r => r.step != null && r.shown > r.step + Math.max(3, 0.25 * r.step)).length } : null };
  laid.lengthMm = +laid.lengthMm.toFixed(1); laid.changedShareOfSheet = +(changed / N2).toFixed(5);
  laid.lighterPixels = up.length; laid.lighterMedianLstar = q(up, 0.5); laid.lighterP90Lstar = q(up, 0.9); laid.darkerPixels = down.length; laid.darkerMedianLstar = q(down, 0.5); laid.darkerP10Lstar = q(down, 0.1);
  laid.brush = { ...BRUSH, water: WATER, loadFilms: LOAD, depositShare: DEPOSIT, mmPerCell: +mmPerCell.toFixed(4), capOd: capOd.map(v => +v.toFixed(2)) };
  ctx.COAT_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'coat-texture.json'), JSON.stringify({ ...ctx.COAT_RECORD, darkStrokes: rows }, null, 1));
  console.log(`coat texture: ${laid.light} light and ${laid.dark} dark dry-brush strokes, ${laid.lengthMm} mm, ${(100 * laid.changedShareOfSheet).toFixed(2)}% of the sheet changed by more than 2 L* (lighter median ${laid.lighterMedianLstar}, darker median ${laid.darkerMedianLstar}); skipped ${laid.skippedWashKeptLight} where the wash kept the light, ${laid.skippedNoNeed} where the ground was dark enough and ${laid.skippedReserved} on reserved light`);
  ctx.STAGE = { stage: 'coat-texture' }; ctx.NATIVE_CAPTURE?.('coat-texture');
  if (laid.light + laid.dark && !FILM_BY_PAINT) await shoot();
  return laid;
}
