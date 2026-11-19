// A coat's texture, laid with the engine's dry brush (src/crop/coat-texture.mjs planned the strokes). The brush has bristles
// and little water; dragged along the hair it leaves paint only on the hills of the paper's tooth, so one stroke is many
// fine streaks. A light stroke carries white gouache tinted to the strand's colour, loaded as thick paste (LOAD times the
// hiding film), and goes only where the washes covered its light.
//
// A dark stroke is laid as the thin darks are (tools/plate/thin-darks-lay.mjs), at the step the subject's strands show:
//   1. The sheet is read along the stroke (src/paint/methods/line-weight.mjs lineDarkness). The stroke is meant to add
//      the step the strands stand off their own ground in the subject, less the step the sheet already shows along it,
//      and never to take the sheet darker than the strand itself. Where that is within the tolerance, nothing is laid.
//   2. The load is read from a swatch of this same dry brush, laid by the run's own brush on its paper and read as the
//      sheet is (src/paint/methods/point-swatch.mjs): the film of the strand's own paints that makes the step over this
//      ground, by the render that draws every glaze, and the load that leaves that film.
//   3. A dark is built up, not struck at once: a first pass for FIRST_PASS of the step; the sheet is dried and read; a
//      second pass for what is still missing, at the yield the first one showed. Paint cannot be taken back.
//      What a pass added is read on the change in the sheet's lightness, as a line along the stroke: a coat's strokes
//      lie among each other and along the edges of washes, and the change is the stroke's own.
//   4. The sheet is read again, and planned is set against painted, stroke by stroke (coat-texture.json).
// Nothing is read from the target here: colours, strands and steps were planned before the first wash.
import fs from 'node:fs';
import path from 'node:path';
import { potShare, GOUACHE_FILM } from '../../src/media/gouache.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';
import { BRUSH_SETTINGS, LOAD_FILMS } from '../../src/paint/methods/brush-swatch.mjs';
import { measurePoint, filmFor, loadFor, stepOf } from '../../src/paint/methods/point-swatch.mjs';
import { lstar } from '../../src/crop/thin-lights.mjs';
import { lineDarkness } from '../../src/paint/methods/line-weight.mjs';
import { lPlane } from '../../src/paint/methods/ink-match.mjs';
import { lineShares, secondPass, tolerance, verdict, FIRST_PASS } from './thin-darks-lay.mjs';

export const LOAD = LOAD_FILMS;       // gouache paste on the brush, in hiding films, as the swatch loads it: a dry brush leaves about a tenth of it on the tooth's hills
export const SWATCH_PRESSURE = 0.85;  // the pressure the dark swatch is laid at: the middle of the pressures a coat stroke starts at (0.7 to 1, src/crop/coat-texture.mjs)
const { water: WATER, ...BRUSH } = BRUSH_SETTINGS, MARGIN_OD = 0.15, RESERVED_OD = 0.2, RADIUS_STEP = 0.25;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const odOf = (c, paper) => [0, 1, 2].map(k => -Math.log(Math.max(0.02, Math.min(1, c[k] / Math.max(1, paper[k])))));
const lOf = rgb => lPlane(Uint8ClampedArray.from(rgb), 1)[0];

/** The brush's load for a light stroke: white paste and the pot of tinted paste, in the share its colour asks for, as concentrations on a sheet of `k` pigments. */
export function lightLoad(stroke, paperRGB, pot, gouacheAt, potAt, k) {
  const conc = new Array(k).fill(0), share = stroke.rgb ? potShare(stroke.rgb, paperRGB, pot) : 0;
  conc[gouacheAt] = (1 - share) * GOUACHE_FILM * LOAD; conc[potAt] = share * GOUACHE_FILM * LOAD;
  return { conc, share };
}

/** The swatch of the coat's dry brush with dark paint, at a brush radius in cells: point-swatch.mjs measurePoint, with this brush as the point. A dry brush is meant to break on the tooth, so every load that leaves paint counts. */
export function measureDryDark({ mmPerCell, radiusCells, paperOpts = null, tools, paints = 1, upright = false }) {
  return measurePoint({ mmPerCell, point: { radiusMm: radiusCells * mmPerCell, water: WATER, pressure: SWATCH_PRESSURE, brush: BRUSH }, paperOpts, ...(tools ? { tools } : {}), paints, hold: 0, upright });
}

/**
 * The step a dark stroke is laid for, and its first pass. Pure.
 * @param strand  { step, L, rgb }: how many L* the subject's strands stand off their own ground, and the strand's own lightness and colour
 * @param sheet   { drop, on, groundRGB }: the step the sheet already shows along the stroke, its lightness there, and the colour under it
 * @param swatch  measureDryDark at the stroke's brush
 * @returns {{ lay: boolean, need, why, conc?, shares?, predicted? }} `need` the step still to add, in L*; `conc` the
 *   first pass's load in all, shared among the paints by `shares`; `predicted` the step the swatch says it adds
 */
export function strandLoad(strand, sheet, { swatch, palette, paperRGB }) {
  const missing = strand.step - sheet.drop, room = sheet.on - strand.L, need = Math.min(missing, room), tol = tolerance(strand.step);
  if (!(need > tol)) return { lay: false, need, why: room <= missing ? 'the sheet is as dark as the strand there' : 'the sheet already shows the step' };
  const shares = lineShares(strand.rgb, paperRGB, palette), first = filmFor(FIRST_PASS * need, sheet.groundRGB, palette, shares);
  if (first == null) return { lay: false, need, why: 'the strand\'s paints cannot make the step over this ground' };
  const load = loadFor(first, swatch);
  if (!load) return { lay: false, need, why: first < (swatch.lightest?.thickness ?? Infinity) ? 'lighter than the lightest load the brush was tried at' : 'darker than the heaviest load the brush was tried at' };
  return { lay: true, need, why: 'the brush can lay it', conc: load.conc, shares, predicted: stepOf(first, sheet.groundRGB, palette, shares) };
}

export async function layCoats(ctx) {
  const { COAT_PLAN: plan, PIGS, GOUACHE_AT, POT_AT, SHEET_PIGS, SC, W2, H2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED, paperRGB, createBrush, dip, stroke, dry, O, UPRIGHT, PAPER_OPTS } = ctx;
  const sheet = ctx.sheet, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / W2, K = SHEET_PIGS.length;
  const read = () => { const rgb = render(); return { rgb, L: lPlane(rgb, N2) }; };
  const start = read(), before = start.rgb, painted = sheetDensity(before), coatMask = ctx.SURFACE_PLAN?.coatMask;
  // a dark strand is never darker than the coat's own darkest wash: the 98th percentile of its density per channel in the coat
  const capOd = [0, 1, 2].map(ch => { const v = []; for (let y = 0; y < H2; y += 2) for (let x = 0; x < W2; x += 2) if (!coatMask || coatMask[Math.min(h - 1, Math.floor(y / SC)) * w + Math.min(w - 1, Math.floor(x / SC))]) v.push(-Math.log(Math.max(0.02, before[(y * W2 + x) * 3 + ch] / Math.max(1, paperRGB[ch])))); v.sort((a, b) => a - b); return v.length ? v[Math.floor(0.98 * (v.length - 1))] : Infinity; });
  const lstarOf = b => i => lstar(-Math.log(Math.max(0.02, Math.min(1, (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2])))));
  const cell = p => Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)));
  const at = p => Math.min(H2 - 1, Math.max(0, Math.round(p.y * SC))) * W2 + Math.min(W2 - 1, Math.max(0, Math.round(p.x * SC)));
  // the sheet along a stroke, read as a line, and the colour under it
  const lineOf = s => s.points.map(p => [(p.x + 0.5) * SC, (p.y + 0.5) * SC]), along = (row, now) => lineDarkness(row.line, now.L, W2, H2, mmPerCell);
  const groundOf = (s, now) => [0, 1, 2].map(c => median(s.points.map(p => now.rgb[at(p) * 3 + c])));
  // the step the paint added along a stroke between two readings: the line the stroke makes in the change of lightness
  const changeFrom = now => Float32Array.from(now.L, (v, i) => v - start.L[i]), addedOn = (row, change) => Math.max(0, -lineDarkness(row.line, change, W2, H2, mmPerCell).on);
  // the swatch of the dry brush with dark paint, one for each brush size the plan uses, laid by this run's own brush on its paper
  const swatches = new Map(), swatchFor = radius => {
    const key = Math.max(1, Math.round(radius / RADIUS_STEP) * RADIUS_STEP);
    if (!swatches.has(key)) swatches.set(key, measureDryDark({ mmPerCell, radiusCells: key, paperOpts: PAPER_OPTS, tools: { createBrush, dip, stroke, dry, physics: O }, paints: K, upright: UPRIGHT }));
    return swatches.get(key);
  };
  const lay = (s, conc, seed) => {
    const brush = createBrush({ radius: s.points[0].r * SC, ...BRUSH, seed });
    dip(brush, { water: WATER, conc });
    stroke(brush, sheet, s.points.map(p => ({ x: (p.x + 0.5) * SC, y: (p.y + 0.5) * SC, r: p.r * SC, p: p.p })), { upright: UPRIGHT });
  };
  const shared = (shares, total) => { const conc = new Array(K).fill(0); shares.forEach((v, j) => { conc[j] = v * total; }); return conc; };
  const laid = { light: 0, dark: 0, skippedWashKeptLight: 0, skippedNoNeed: 0, skippedReserved: 0, lengthMm: 0, byKind: {} }, mine = [], rows = [], left = {};
  ctx.VALUE_ACTIVE = null;   // the washes are over: the brush is no passage's
  for (const [k, s] of plan.strokes.entries()) {
    // a stroke's brush is seeded by its place in the plan, so leaving one stroke off does not change the others
    const under = median(s.points.map(p => painted[cell(p)])), seed = 700 + SEED + k;
    if (s.polarity === 'dark') {
      if (under < RESERVED_OD) { laid.skippedReserved++; continue; } // paper or a reserved light: the washes carry it
      if (!s.rgb) { laid.skippedNoNeed++; continue; }
      const rgb = odOf(s.rgb, paperRGB).map((v, ch) => paperRGB[ch] * Math.exp(-Math.min(v, capOd[ch]))), row = { stroke: s, line: lineOf(s), rgb, strandL: lOf(rgb), seed };
      const now = along(row, start), groundRGB = groundOf(s, start), r = strandLoad({ step: s.step, L: row.strandL, rgb }, { drop: now.drop, on: now.on, groundRGB }, { swatch: swatchFor(s.points[0].r * SC), palette: PIGS, paperRGB });
      Object.assign(row, { present: now.drop, groundL: now.on, groundRGB, need: r.need, why: r.why, laid: r.lay, shares: r.shares ?? null });
      rows.push(row);
      if (!r.lay) { laid.skippedNoNeed++; left[r.why] = (left[r.why] ?? 0) + 1; continue; }
      row.passes = [{ conc: r.conc, predicted: r.predicted }];
      lay(s, shared(r.shares, r.conc), seed);
    } else {
      if (under - s.od < MARGIN_OD) { laid.skippedWashKeptLight++; continue; }
      lay(s, lightLoad(s, paperRGB, SHEET_PIGS[POT_AT], GOUACHE_AT, POT_AT, K).conc, seed);
    }
    mine.push(s); laid[s.polarity]++; laid.lengthMm += s.lengthMm; laid.byKind[s.kind] = (laid.byKind[s.kind] ?? 0) + 1;
  }
  let now = start;
  const darks = rows.filter(r => r.laid);
  if (mine.length) { dry(sheet, 20000, O, { levelMax: 200 }); now = read(); }
  // the second pass of each dark stroke: what the sheet still lacks of its step, by what the first pass did
  let again = 0, change = darks.length ? changeFrom(now) : null;
  for (const row of darks) {
    const first = row.passes[0];
    first.added = addedOn(row, change);
    // the same seed for both passes of a stroke, so the second follows the first's hand
    const second = secondPass(row.need - first.added, first, groundOf(row.stroke, now), row.shares, { swatch: swatchFor(row.stroke.points[0].r * SC), palette: PIGS });
    if (second) { row.passes.push(second); lay(row.stroke, shared(row.shares, second.conc), row.seed); again++; }
  }
  if (again) { dry(sheet, 20000, O, { levelMax: 200 }); now = read(); change = changeFrom(now); }
  for (const row of darks) { row.added = addedOn(row, change); row.verdict = verdict(row.need, row.added); if (row.passes[1]) row.passes[1].added = row.added - row.passes[0].added; }
  // what the strokes did, measured on the sheet's own render before and after
  const after = now.rgb, Ls = (b, i) => { const Y = (0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2]); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
  const up = [], down = []; let changed = 0;
  for (let i = 0; i < N2; i++) { const d = Ls(after, i) - Ls(before, i); if (Math.abs(d) > 2) { changed++; (d > 0 ? up : down).push(d); } }
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.floor(f * (s.length - 1))].toFixed(1) : null; };
  // planned against painted lightness at the paint's own pixels, on the strokes laid: the step a stroke was laid for, and the
  // step the paint made where it took (the 90th percentile of the per-pixel gain along a light stroke, the 10th of the loss
  // along a dark one). A dry brush's hills are darker than the line it reads as, which `darkAsLines` gives.
  const Lb = lstarOf(before), La = lstarOf(after), needOf = new Map(darks.map(r => [r.stroke, r.need])), gap = pol => {
    const list = mine.filter(s => s.polarity === pol).map(s => {
      const idx = s.points.map(at), ground = median(idx.map(Lb)), change = idx.map(i => La(i) - Lb(i)).sort((a, b) => a - b);
      const strand = lstar(-Math.log(Math.max(0.02, Math.min(1, (0.2126 * s.rgb[0] + 0.7152 * s.rgb[1] + 0.0722 * s.rgb[2]) / Math.max(1, 0.2126 * paperRGB[0] + 0.7152 * paperRGB[1] + 0.0722 * paperRGB[2])))));
      return { planned: strand, ground, plannedStep: pol === 'light' ? strand - ground : -needOf.get(s), step: pol === 'light' ? change[Math.floor(0.9 * (change.length - 1))] : change[Math.floor(0.1 * (change.length - 1))] };
    });
    return list.length ? { strokes: list.length, plannedLstar: +median(list.map(r => r.planned)).toFixed(1), groundLstar: +median(list.map(r => r.ground)).toFixed(1), plannedStep: +median(list.map(r => r.plannedStep)).toFixed(1), paintedStep: +median(list.map(r => r.step)).toFixed(1) } : null;
  };
  const r2 = v => (v == null ? null : +(+v).toFixed(2)), count = f => darks.filter(f).length;
  const asLines = darks.length ? { strokes: darks.length, twoPasses: count(r => r.passes.length > 1), within: count(r => r.verdict === 'within'), under: count(r => r.verdict === 'under'), over: count(r => r.verdict === 'over'),
    subjectStep: r2(median(darks.map(r => r.stroke.step))), before: r2(median(darks.map(r => r.present))), plannedStep: r2(median(darks.map(r => r.need))), paintedStep: r2(median(darks.map(r => r.added))), meanMiss: r2(darks.reduce((a, r) => a + Math.abs(r.added - r.need), 0) / darks.length) } : null;
  laid.plannedAgainstPainted = { light: gap('light'), dark: gap('dark'), darkAsLines: asLines };
  laid.darkLeft = left; laid.tolerance = 'thin-darks-lay.mjs STEP_TOLERANCE'; laid.firstPass = FIRST_PASS;
  laid.lengthMm = +laid.lengthMm.toFixed(1); laid.changedShareOfSheet = +(changed / N2).toFixed(5);
  laid.lighterPixels = up.length; laid.lighterMedianLstar = q(up, 0.5); laid.lighterP90Lstar = q(up, 0.9); laid.darkerPixels = down.length; laid.darkerMedianLstar = q(down, 0.5); laid.darkerP10Lstar = q(down, 0.1);
  laid.brush = { ...BRUSH, water: WATER, loadFilms: LOAD, mmPerCell: +mmPerCell.toFixed(4), capOd: capOd.map(v => +v.toFixed(2)), darkSwatches: [...swatches].map(([radiusCells, s]) => ({ radiusCells, pressure: SWATCH_PRESSURE, lineMm: s.widthMm, rows: s.rows })) };
  ctx.COAT_RECORD = { ...plan.record, laid };
  const strokesOut = rows.map(r => ({ region: r.stroke.region, kind: r.stroke.kind, laid: r.laid, why: r.why, lengthMm: r.stroke.lengthMm, widthMm: r.stroke.widthMm, step: r2(r.stroke.step), strandL: r2(r.strandL), groundL: r2(r.groundL), present: r2(r.present), need: r2(r.need), ground: r.groundRGB.map(Math.round),
    passes: r.passes ? r.passes.map(p => ({ conc: r2(p.conc), predicted: r2(p.predicted), added: r2(p.added), yield: r2(p.yield) })) : null, added: r2(r.added), verdict: r.verdict ?? null, from: [r.stroke.points[0].x, r.stroke.points[0].y].map(Math.round), to: [r.stroke.points.at(-1).x, r.stroke.points.at(-1).y].map(Math.round) }));
  fs.writeFileSync(path.join(out, 'coat-texture.json'), JSON.stringify({ ...ctx.COAT_RECORD, darkStrokes: strokesOut }, null, 1));
  console.log(`coat texture: ${laid.light} light and ${laid.dark} dark dry-brush strokes, ${laid.lengthMm} mm, ${(100 * laid.changedShareOfSheet).toFixed(2)}% of the sheet changed by more than 2 L* (lighter median ${laid.lighterMedianLstar}, darker median ${laid.darkerMedianLstar}); skipped ${laid.skippedWashKeptLight} where the wash kept the light, ${laid.skippedNoNeed} darks the sheet already states or the brush cannot lay and ${laid.skippedReserved} on reserved light${asLines ? `; darks read as lines: planned ${asLines.plannedStep} L*, painted ${asLines.paintedStep} at the median (${asLines.within} within tolerance, ${asLines.under} under, ${asLines.over} over; ${asLines.twoPasses} in two passes)` : ''}`);
  ctx.STAGE = { stage: 'coat-texture' }; ctx.NATIVE_CAPTURE?.('coat-texture');
  if (laid.light + laid.dark && !FILM_BY_PAINT) await shoot();
  return laid;
}
