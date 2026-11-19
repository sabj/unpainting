// The last stage's thin darks: the lines planned by tools/plate/thin-darks-plan.mjs, laid over the dry washes so that each
// reads as dark against its sides as the subject's own line does. Nothing is read from the target here: each line comes
// with its planned step, and the sheet is read as the subject was (src/paint/methods/line-weight.mjs lineDarkness).
//
// For each line, best first:
//   1. The sheet is read along it. If it already shows the step, within the tolerance, the washes and the drawing have
//      stated the line and nothing is laid.
//   2. What is missing is laid as paint with the rigger's point where the point can lay it: the film of the line's own
//      paints that makes the missing step over this ground (point-swatch.mjs filmFor), at a load the swatch found to hold a
//      line, and a line no wider than SCALE_LIMIT times the subject's. A sheet takes at most `paintedMax` painted lines.
//      A painted line is laid in two passes, as a dark is built up and not struck at once: the first for FIRST_PASS of
//      the missing step; the sheet is read; the second for what is still missing, at the yield the first one showed.
//      Paint cannot be taken back, and on the sheet a load has given from two thirds to nearly twice the swatch's step.
//      A missing step too faint for two such passes is the pencil's.
//   3. Every other line goes to a pencil, as a painter restates a line over a dry wash: a 2B, pressed by a table read over
//      paint of the ground's colour (pencil-scrap.mjs pencilScrapOver), not over bare paper. The sheet is read, and a
//      line still short of its step by more than the tolerance is gone over once more for the rest. A line that is still
//      short after a second pass at the pencil's firmest is recorded as short of the subject's: the pencil has no more.
//   4. The sheet is read again along every laid line, and planned is set against painted. A painted line that is still
//      short of its step by more than the tolerance is restated in pencil for the rest. One that came out darker cannot
//      be taken back and is recorded as over.
// The tolerance is STEP_TOLERANCE: 3 L*, or a quarter of the step where that is more.
import fs from 'node:fs';
import path from 'node:path';
import { mixFor } from '../../src/media/gouache.mjs';
import { layersChanged } from '../../src/media/sheet.mjs';
import { DEFAULT_SHEET_MM } from '../../src/media/sheet-size.mjs';
import { SCALE_LIMIT } from '../../src/paint/methods/brush-swatch.mjs';
import { measurePoint, filmFor, loadFor, stepOf, pointRadius, POINT } from '../../src/paint/methods/point-swatch.mjs';
import { pencilScrapOver } from '../../src/paint/methods/pencil-scrap.mjs';
import { lineDarkness, pressureFor } from '../../src/paint/methods/line-weight.mjs';
import { drawMaterial, materialProfile } from '../../src/paint/methods/material-profiles.mjs';
import { lPlane } from '../../src/paint/methods/ink-match.mjs';

export const STEP_TOLERANCE = Object.freeze({ lstar: 3, share: 0.25 });
/** How far a laid line's step may be from the subject's, in L*. */
export const tolerance = step => Math.max(STEP_TOLERANCE.lstar, STEP_TOLERANCE.share * step);
/** The pencil that restates a line over paint: softer than the drawing's HB, whose firmest line reads 7 L* over a middle wash. */
export const RESTATING_PENCIL = 'graphite-2B';
/** The share of a missing step the first pass of paint is laid for; the second is laid by what the first one did. */
export const FIRST_PASS = 0.55;
const YIELD = Object.freeze([1, 2]);   // the yield a second pass is corrected by: a first pass that came out strong lightens the second (to half); a weak reading never makes it heavier than the swatch says

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const mean3 = v => (v[0] + v[1] + v[2]) / 3;
const odOf = (c, paper) => [0, 1, 2].map(k => -Math.log(Math.max(0.02, Math.min(1, c[k] / Math.max(1, paper[k])))));

/**
 * The proportions of the palette's paints that mix a line's own colour: one share per paint, summing to 1. The line is
 * painted in its colour and the ground shows through it, as a glaze. (Mixing for the difference between line and ground
 * asks for whatever the washes happened to leave out there, a yellow or a blue alone, which darkens nothing.)
 */
export function lineShares(lineRGB, paperRGB, palette) {
  let mix = mixFor(odOf(lineRGB, paperRGB), palette).mix;
  // a line no darker than paper in any channel: the darkest paint in the box
  if (!mix.length) mix = [{ pigment: palette.map((p, j) => [mean3(p.K), j]).sort((a, b) => b[0] - a[0])[0][1], amount: 1 }];
  const total = mix.reduce((a, m) => a + m.amount, 0), shares = new Array(palette.length).fill(0);
  for (const m of mix) shares[m.pigment] = m.amount / total;
  return shares;
}

/**
 * The instrument for one line. Pure.
 * @param line    { step, halfMm, rgb }: the planned step in L*, the subject's width at half depth, the line's colour
 * @param sheet   { drop, groundRGB }: the step the sheet already shows along the line, and the colour under it
 * @param swatch  point-swatch.mjs measurePoint
 * @param canPaint  false once the sheet has its painted lines
 * @returns {{ route: 'stated'|'paint'|'pencil', need, why, conc?, shares?, widthMm?, predicted? }} `need` the missing step
 */
export function routeLine(line, sheet, { swatch, palette, paperRGB, canPaint = true }) {
  const need = line.step - sheet.drop, tol = tolerance(line.step);
  if (!(need > tol)) return { route: 'stated', need, why: 'the sheet already shows the step' };
  const pencil = why => ({ route: 'pencil', need, why });
  if (!canPaint) return pencil('the sheet has its painted lines');
  if (!swatch?.lightest) return pencil('the point holds no line on this paper');
  if (swatch.widthMm > SCALE_LIMIT * line.halfMm) return pencil('the point\'s line is too wide for it');
  const shares = lineShares(line.rgb, paperRGB, palette), film = filmFor(need, sheet.groundRGB, palette, shares);
  if (film == null) return pencil('the line\'s paints cannot make the step over this ground');
  const load = loadFor(film, swatch);
  if (!load) return pencil(film < swatch.lightest.thickness ? 'lighter than the lightest line the point holds' : 'darker than the heaviest load tried');
  if (load.widthMm > SCALE_LIMIT * line.halfMm) return pencil('the point\'s line is too wide for it');
  // two passes: the film for FIRST_PASS of the missing step, then the rest; each must be a line the point holds
  if (filmFor((1 - FIRST_PASS) * need, sheet.groundRGB, palette, shares) < swatch.lightest.thickness) return pencil('too faint to build up in two passes of paint');
  const first = filmFor(FIRST_PASS * need, sheet.groundRGB, palette, shares);
  return { route: 'paint', need, why: 'the point can lay it', conc: loadFor(first, swatch).conc, shares, widthMm: load.widthMm, predicted: stepOf(first, sheet.groundRGB, palette, shares) };
}

/**
 * The second pass of a painted line: the load for what the sheet still lacks after the first, corrected by the first's
 * yield (the step it added over the step the swatch said it would, where that is more than one). Null when nothing more is laid: the step is there,
 * or what is missing is lighter than the lightest line the point holds. Pure.
 * @param first  { predicted, added }: the first pass's predicted step and the step the sheet shows it added
 * @returns {{ conc, predicted, yield }|null}
 */
export function secondPass(remaining, first, groundRGB, shares, { swatch, palette }) {
  if (!(remaining > 0)) return null;
  const yieldOf = first.predicted > 0 ? Math.min(YIELD[1], Math.max(YIELD[0], first.added / first.predicted)) : 1;
  const film = filmFor(remaining / yieldOf, groundRGB, palette, shares), load = film == null ? null : loadFor(film, swatch);
  return load ? { conc: load.conc, predicted: remaining, yield: yieldOf } : null;
}

/**
 * The pencil's pressure for a missing step over a ground, by the table read over that ground. Pure.
 * @returns {{ pressure, reach, short }} `reach` the firmest line's step over this ground; `short` when the missing step is
 *   beyond it by more than the tolerance of the whole step, so one pass at the firmest leaves the line lighter
 */
export function pencilFor(need, step, table) {
  const reach = table.at(-1).drop;
  return { pressure: pressureFor(need, table, { floor: table[0].pressure }), reach, short: need - reach > tolerance(step) };
}

/** How a laid line came out: its step on the sheet against the subject's. */
export function verdict(step, painted) {
  const tol = tolerance(step);
  return painted > step + tol ? 'over' : painted < step - tol ? 'under' : 'within';
}

export async function layThinDarks(ctx) {
  const { THIN_DARKS_PLAN: plan, PIGS, SHEET_PIGS, GRAPHITE, GRAPHITE_AT, SC, W2, H2, N2, out, num, render, shoot, FILM_BY_PAINT, SEED, paperRGB, createBrush, dip, stroke, dry, O, PAPER_OPTS } = ctx;
  const sheet = ctx.sheet, mmPerCell = num('sheetmm', DEFAULT_SHEET_MM) / W2, K = SHEET_PIGS.length;
  // the swatch is laid by this run's own brush, stroke and drying, on its paper
  const swatch = measurePoint({ mmPerCell, paperOpts: PAPER_OPTS, tools: { createBrush, dip, stroke, dry, physics: O }, paints: K }), radius = pointRadius(mmPerCell);
  const pencil = GRAPHITE ? materialProfile(RESTATING_PENCIL) : null, scrap = pencil ? pencilScrapOver({ medium: RESTATING_PENCIL, mmPerCell, paperOpts: PAPER_OPTS }) : null;
  const read = () => { const rgb = render(); return { rgb, L: lPlane(rgb, N2) }; };
  const lines = plan.strokes.map(s => ({ ...s, points: s.curve.map(([x, y]) => [x * SC, y * SC]) }));
  const along = (s, at) => lineDarkness(s.points, at.L, W2, H2, mmPerCell);
  // the colour under a line: the median of the sheet's cells along it
  const groundOf = (s, at) => [0, 1, 2].map(c => median(s.points.map(([x, y]) => at.rgb[(Math.min(H2 - 1, Math.max(0, Math.floor(y))) * W2 + Math.min(W2 - 1, Math.max(0, Math.floor(x)))) * 3 + c])));
  const before = read(), rows = [];
  let painted = 0;
  for (const s of lines) {
    const now = along(s, before), groundRGB = groundOf(s, before);
    const r = routeLine(s, { drop: now.drop, groundRGB }, { swatch, palette: PIGS, paperRGB, canPaint: painted < (plan.record.paintedMax ?? 0) });
    if (r.route === 'paint') painted++;
    rows.push({ line: s, route: r.route, why: r.why, step: s.step, present: now.drop, need: r.need, groundRGB, conc: r.conc ?? null, shares: r.shares ?? null, predicted: r.predicted ?? null, widthMm: r.widthMm ?? null });
  }
  // the painted lines: a first pass each, dried and read, then a second for what is still missing
  ctx.VALUE_ACTIVE = null;   // the washes are over: the brush is no passage's
  const paintRows = rows.filter(r => r.route === 'paint'), lay = (row, total, k) => {
    const conc = new Array(K).fill(0); row.shares.forEach((v, j) => { conc[j] = v * total; });
    // the same seed for both passes of a line, so the second follows the first's hand
    const brush = createBrush({ radius, ...POINT.brush, seed: 900 + SEED + k });
    dip(brush, { water: POINT.water, conc });
    stroke(brush, sheet, row.line.points.map(([x, y]) => ({ x, y, r: radius, p: POINT.pressure })), { upright: false });
  };
  let after = before;
  if (paintRows.length) {
    paintRows.forEach((row, k) => lay(row, row.conc, k));
    dry(sheet, 20000, O, { levelMax: 200 }); after = read();
    let again = 0;
    paintRows.forEach((row, k) => {
      const shown = along(row.line, after).drop, first = { conc: row.conc, predicted: row.predicted, added: shown - row.present, painted: shown };
      const second = secondPass(row.step - shown, first, groundOf(row.line, after), row.shares, { swatch, palette: PIGS });
      row.passes = [first, ...(second ? [second] : [])];
      if (second) { lay(row, second.conc, k); again++; }
    });
    if (again) { dry(sheet, 20000, O, { levelMax: 200 }); after = read(); }
  }
  for (const row of paintRows) {
    row.painted = along(row.line, after).drop; row.verdict = verdict(row.step, row.painted);
    if (row.passes[1]) row.passes[1].painted = row.painted;
  }
  // the pencil: the lines the point could not lay, and what a painted line still lacks
  const forPencil = rows.filter(r => r.route === 'pencil' || (r.route === 'paint' && r.verdict === 'under'));
  let drawn = 0, last = after;
  if (scrap) {
    const tables = new Map(), tableOver = rgb => { const key = rgb.map(v => 8 * Math.round(v / 8)).join(','); if (!tables.has(key)) tables.set(key, scrap(key.split(',').map(Number))); return tables.get(key); };
    const amount = pencil.concentration * mean3(pencil.pigment.K) / mean3(SHEET_PIGS[GRAPHITE_AT].K);
    // one pass of the pencil over `list`: each line pressed for what the sheet, read at `at`, still lacks of its step
    const pass = (list, at, seed) => {
      if (!list.length) return;
      const gestures = list.map(row => {
        const shown = row.drawn ?? row.painted ?? row.present, p = pencilFor(row.step - shown, row.step, tableOver(groundOf(row.line, at)));
        (row.pencilPasses ??= []).push({ pressure: +p.pressure.toFixed(3), need: +(row.step - shown).toFixed(2), reach: +p.reach.toFixed(2) });
        // the pencil's own coordinates name a cell by its corner
        return { points: row.line.points.map(([x, y]) => ({ x: x - 0.5, y: y - 0.5, s: p.pressure })) };
      });
      const r = drawMaterial(sheet, gestures, null, W2, H2, { medium: RESTATING_PENCIL, stage: 'closing', mmPerCell, edgeCut: false, state: { used: 0 }, caps: { lines: gestures.length, pressure: 1, minLengthMm: 0, edgeMin: 0 }, audit: [], O, pigmentAt: GRAPHITE_AT, graphiteOptions: { amount, seed },
        // a recorded run (--marks 1) keeps one frame for every graphite stroke on the tape, these included
        ...(ctx.NATIVE_CAPTURE ? { afterStroke: e => ctx.NATIVE_CAPTURE(e.skipped ? 'graphite-skipped' : 'graphite') } : {}) });
      drawn += r.drawn; layersChanged(sheet); last = read();
      for (const row of list) { row.drawn = along(row.line, last).drop; row.pencilPasses.at(-1).drawn = +row.drawn.toFixed(2); }
    };
    pass(forPencil, after, 1700 + SEED);
    // a line still short of its step is gone over once more, as a draughtsman darkens a line; twice is all
    pass(forPencil.filter(row => verdict(row.step, row.drawn) === 'under'), last, 1900 + SEED);
  }
  for (const row of forPencil) {
    if (!row.pencilPasses) { row.refused = 'no pencil on this sheet'; continue; }
    row.final = verdict(row.step, row.drawn);
    // short: the pencil went over the line twice, the second time at its firmest, and the line is still lighter than the subject's
    row.pencil = { passes: row.pencilPasses, short: row.final === 'under' && row.pencilPasses.length > 1 && row.pencilPasses.at(-1).pressure >= 1 };
  }
  const r2 = v => (v == null ? null : +(+v).toFixed(2)), count = (list, f) => list.filter(f).length;
  const pencilRows = rows.filter(r => r.route === 'pencil'), shown = r => r.drawn ?? r.painted ?? r.present;
  const against = list => (list.length ? { lines: list.length, plannedStep: r2(median(list.map(r => r.step))), paintedStep: r2(median(list.map(shown))), before: r2(median(list.map(r => r.present))), meanMiss: r2(list.reduce((a, r) => a + Math.abs(shown(r) - r.step), 0) / list.length) } : null);
  const why = {}; for (const r of pencilRows) why[r.why] = (why[r.why] ?? 0) + 1;
  const laid = {
    found: rows.length, stated: count(rows, r => r.route === 'stated'),
    paint: { lines: paintRows.length, twoPasses: count(paintRows, r => r.passes.length > 1), within: count(paintRows, r => r.verdict === 'within'), under: count(paintRows, r => r.verdict === 'under'), over: count(paintRows, r => r.verdict === 'over'), restatedInPencil: count(paintRows, r => r.pencil), withinAfterPencil: count(paintRows, r => r.pencil && r.final === 'within'), lengthMm: r2(paintRows.reduce((a, r) => a + r.line.lengthMm, 0)), plannedAgainstPainted: against(paintRows.map(r => ({ ...r, drawn: undefined }))) },
    pencil: { lines: count(pencilRows, r => r.pencil), twoPasses: count(pencilRows, r => r.pencil?.passes.length > 1), within: count(pencilRows, r => r.final === 'within'), under: count(pencilRows, r => r.final === 'under'), over: count(pencilRows, r => r.final === 'over'), short: count(pencilRows, r => r.pencil?.short), lengthMm: r2(pencilRows.filter(r => r.pencil).reduce((a, r) => a + r.line.lengthMm, 0)), why, plannedAgainstPainted: against(pencilRows.filter(r => r.pencil)) },
    refused: { lines: count(rows, r => r.refused), why: count(rows, r => r.refused) ? { 'no pencil on this sheet': count(rows, r => r.refused) } : {} },
    plannedAgainstPainted: against(rows.filter(r => r.route !== 'stated' && !r.refused)),
    tolerance: STEP_TOLERANCE, scaleLimit: SCALE_LIMIT, mmPerCell: +mmPerCell.toFixed(4),
    point: { lineMm: swatch.widthMm, radiusCells: +radius.toFixed(3), rows: swatch.rows, settings: swatch.settings },
    pencilMedium: pencil ? RESTATING_PENCIL : null,
  };
  const linesOut = rows.map(r => ({ route: r.route, why: r.why, lengthMm: r.line.lengthMm, halfMm: r.line.halfMm, step: r2(r.step), present: r2(r.present), need: r2(r.need), ground: r.groundRGB.map(Math.round), passes: r.passes ? r.passes.map(q => ({ conc: r2(q.conc), predicted: r2(q.predicted), painted: r2(q.painted), yield: r2(q.yield) })) : null, painted: r2(r.painted), verdict: r.verdict ?? null, pencil: r.pencil ?? null, drawn: r2(r.drawn), final: r.final ?? r.verdict ?? null, refused: r.refused ?? null, from: r.line.curve[0].map(Math.round), to: r.line.curve.at(-1).map(Math.round) }));
  ctx.THIN_DARKS_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'thin-darks.json'), JSON.stringify({ ...ctx.THIN_DARKS_RECORD, lines: linesOut }, null, 1));
  const pa = laid.plannedAgainstPainted;
  console.log(`thin darks: ${laid.found} lines planned; ${laid.stated} the sheet already states; ${laid.paint.lines} painted with the point, ${laid.paint.twoPasses} in two passes (${laid.paint.within} within tolerance of their step, ${laid.paint.under} under and restated in pencil, ${laid.paint.over} over); ${laid.pencil.lines} drawn in pencil over the washes, ${laid.pencil.twoPasses} gone over twice (${laid.pencil.within} within, ${laid.pencil.under} under, ${laid.pencil.short} of them beyond two passes of the ${RESTATING_PENCIL} pencil at its firmest); ${laid.refused.lines} refused${pa ? `; planned ${pa.plannedStep} L*, before ${pa.before}, on the sheet ${pa.paintedStep} at the median` : ''}`);
  ctx.STAGE = { stage: 'thin-darks' }; ctx.NATIVE_CAPTURE?.('thin-darks');
  if ((paintRows.length || drawn) && !FILM_BY_PAINT) await shoot();
  return laid;
}
