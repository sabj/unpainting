// The rigger's point as a wet line of paint, tried on a scrap before it is used. A thin dark the washes could not lay is
// drawn with the point (tools/plate/thin-darks-lay.mjs), and its load is chosen from this swatch so the painted line is as
// dark against its ground as the subject's own line.
//
// The swatch lays the point's line at a ladder of loads, each in three directions (along the sheet, across it and on the
// diagonal), with the stroke the painting uses (the brush follows its path), on a scrap of the same paper and cell size.
// Each dried line is read as the subject's lines are read (line-weight.mjs lineDarkness): how many L* darker it is than
// its sides, and how wide at half that depth. A load holds a line when, in every direction, at least HOLDS of its length
// is at least half as dark as its median. The numbers are the engine's, not a picture's:
//   - a point fed from a full belly, wet enough to bridge the paper's tooth, holds a line at every load tried, from
//     about 3 L* on white paper to near black; a starved point (capacity 6, belly 1) breaks in every direction but one;
//   - a lighter pressure, a smaller point or less water breaks the line and does not make it lighter; less paint does;
//   - the point is 0.26 mm in radius and never under a cell: at a cell of 0.26 mm its line is about 0.8 mm wide at half
//     depth, three cells, and at half that cell about 0.6 mm.
// The load for a step over a ground is then a film thickness: `filmFor` asks the Kubelka-Munk render what thickness of the
// line's own paints makes that step over that ground, and `loadFor` reads the swatch for the load that leaves it. DOM free.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, dry, layersOf, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { renderLayers } from '../../media/km.mjs';
import { lPlane } from './ink-match.mjs';
import { lineDarkness } from './line-weight.mjs';

export const HOLDS = 0.9;            // a line holds along this share of its length, in every direction
/** The point: a small round fed from a full belly, wet enough to bridge the paper's tooth, pressed fully, its path followed. */
export const POINT = Object.freeze({ radiusMm: 0.26, water: 1, pressure: 1, brush: Object.freeze({ bristles: 6, capacity: 10, belly: 2, feed: 0.12, give: 0.5, free: 0.3, film: 0.2, splay: 0.02, stiffness: 6, wetMix: 0.1, bridge: 0.5, bridgeSoft: 1.0, streak: 0.2 }) });
/** The loads tried, lightest first: paint concentration on the point. */
export const POINT_LOADS = Object.freeze([0.05, 0.1, 0.2, 0.35, 0.6, 1, 1.7, 3, 5, 8]);
/** The point's radius in cells at a sheet density: its own size, and never under a cell. */
export const pointRadius = (mmPerCell, point = POINT) => Math.max(1, point.radiusMm / mmPerCell);
const SWATCH_PAINT = Object.freeze({ name: 'swatch dark', K: [1.2, 1.1, 0.9], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.1 });
/** The hand that lays the swatch: the engine's own brush, stroke and drying. A painting passes its own (`tools`), so the
 *  swatch is laid by the brush it will paint with: sized for its density, spaced as its strokes are, dried by its physics. */
const ENGINE = Object.freeze({ createBrush, dip, stroke, dry, physics: DEFAULTS });
const LENGTH = 120, MARGIN = 18, DIRECTIONS = Object.freeze([[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]]), WHITE = Object.freeze([252, 252, 252]);

const median = a => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };
const lOf = rgb => lPlane(rgb, 1)[0];

/** L* of a film of paints (thickness per pigment) over a ground colour: one cell of the render that draws every glaze. */
function filmL(thick, pigments, groundRGB) {
  return lOf(renderLayers([thick.map(x => Float32Array.of(x))], pigments, Uint8ClampedArray.from(groundRGB), 1, 1));
}

/**
 * The film that makes a step: the total thickness of paints in the proportions `shares` (one per pigment, summing to 1)
 * that reads `drop` L* darker than the ground `groundRGB` it lies on. Null when no thickness of these paints makes the
 * step (the ground is already as dark as the paints go).
 */
export function filmFor(drop, groundRGB, pigments, shares) {
  const L0 = lOf(Uint8ClampedArray.from(groundRGB)), at = x => L0 - filmL(shares.map(s => s * x), pigments, groundRGB);
  if (!(drop > 0)) return 0;
  let hi = 0.05; while (at(hi) < drop && hi < 40) hi *= 2;
  if (at(hi) < drop) return null;
  let lo = 0; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (at(m) < drop) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** The step in L* a film of `thickness` in the proportions `shares` makes over `groundRGB`. */
export function stepOf(thickness, groundRGB, pigments, shares) {
  return lOf(Uint8ClampedArray.from(groundRGB)) - filmL(shares.map(s => s * thickness), pigments, groundRGB);
}

function layLine({ mmPerCell, seed, conc, direction: [dx, dy], point, paperOpts, tools, paints }) {
  // the swatch's paint is the first of as many paints as the run's sheet carries, so the run's own dip fits its brush
  const pigs = Array.from({ length: paints }, () => SWATCH_PAINT), load = pigs.map((_, k) => (k ? 0 : conc));
  const W = LENGTH + 2 * MARGIN, n = W * W, paper = makePaper(W, W, paperOpts ?? { seed, coldPress: { mmPerCell }, mmPerCell }), sheet = createSheet(paper, pigs);
  const c = W / 2, a = { x: c - dx * LENGTH / 2, y: c - dy * LENGTH / 2 }, b = { x: c + dx * LENGTH / 2, y: c + dy * LENGTH / 2 };
  const r = pointRadius(mmPerCell, point), brush = tools.createBrush({ radius: r, ...point.brush, seed: 300 + seed });
  tools.dip(brush, { water: point.water, conc: load });
  tools.stroke(brush, sheet, [{ ...a, p: point.pressure, r }, { ...b, p: point.pressure, r }], { upright: false });
  tools.dry(sheet, 20000, tools.physics, { levelMax: 900 });
  const L = lPlane(renderLayers(layersOf(sheet), pigs, new Uint8ClampedArray(n * 3).fill(WHITE[0]), n, 1), n);
  const path = Array.from({ length: 13 }, (_, k) => [a.x + (b.x - a.x) * k / 12, a.y + (b.y - a.y) * k / 12]).slice(2, -2);
  return { L, W, path };
}

/** The share of a line's length that is at least half as dark as its median, cell by cell, and the longest gap in mm. */
export function lineHold(path, L, w, h, pxMm, paperL) {
  const steps = [], reach = Math.max(1, Math.round(0.4 / pxMm));
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1], [bx, by] = path[k], len = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.round(len)), nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let q = 0; q < m; q++) {
      const x = ax + (bx - ax) * q / m, y = ay + (by - ay) * q / m; let best = 0;
      for (let j = -2 * reach; j <= 2 * reach; j++) { const xi = Math.floor(x + nx * j / 2), yi = Math.floor(y + ny * j / 2); if (xi >= 0 && yi >= 0 && xi < w && yi < h) best = Math.max(best, paperL - L[yi * w + xi]); }
      steps.push(best);
    }
  }
  const med = median(steps); let held = 0, gap = 0, run = 0;
  for (const v of steps) { if (med > 0 && v >= 0.5 * med) { held++; run = 0; } else { run++; gap = Math.max(gap, run); } }
  return { held: steps.length ? held / steps.length : 0, gapMm: gap * pxMm };
}

/**
 * @param mmPerCell  the run's sheet density
 * @param paperOpts  the run's paper (makePaper options); a cold-press sheet of this density when not given
 * @param tools      the run's own { createBrush, dip, stroke, dry, physics }; the engine's when not given
 * @param paints     how many paints the run's sheet carries (its brushes are dipped for that many)
 * @returns {{ rows: [{ conc, drop, widthMm, held, gapMm, spread, thickness, holds }], lightest: row|null, heaviest: row|null,
 *   widthMm, mmPerCell, settings }} `drop` the L* the dried line reads darker than its paper, the mean of the three
 *   directions and `spread` their range; `widthMm` its width at half depth; `held` the least share of its length that
 *   holds, of the three; `thickness` the film of the swatch's paint that reads `drop` (filmFor). `lightest` and
 *   `heaviest` are the ends of the loads that hold a line; the top-level `widthMm` is the lightest's.
 */
export function measurePoint({ mmPerCell, seed = 1, loads = POINT_LOADS, point = POINT, paperOpts = null, tools = ENGINE, paints = 1 }) {
  if (!(mmPerCell > 0)) throw new Error('point swatch: mmPerCell must be positive');
  const paperL = lOf(Uint8ClampedArray.from(WHITE));
  const rows = loads.map(conc => {
    const read = DIRECTIONS.map(direction => { const { L, W, path } = layLine({ mmPerCell, seed, conc, direction, point, paperOpts, tools: { ...ENGINE, ...tools }, paints }); return { ...lineDarkness(path, L, W, W, mmPerCell), ...lineHold(path, L, W, W, mmPerCell, paperL) }; });
    const drops = read.map(r => r.drop), drop = drops.reduce((a, v) => a + v, 0) / drops.length, widths = read.map(r => r.widthMm).filter(Number.isFinite), held = Math.min(...read.map(r => r.held));
    return { conc, drop: +drop.toFixed(2), widthMm: +(widths.length ? Math.max(...widths) : 0).toFixed(3), held: +held.toFixed(3), gapMm: +Math.max(...read.map(r => r.gapMm)).toFixed(2), spread: +(Math.max(...drops) - Math.min(...drops)).toFixed(2),
      thickness: +(filmFor(drop, WHITE, [SWATCH_PAINT], [1]) ?? 0).toFixed(5), holds: held >= HOLDS && drop > 0 };
  });
  // a heavier load never reads lighter or leaves less: the paper's grain may make one rung dip a hair below the last
  for (let k = 1; k < rows.length; k++) { rows[k].drop = Math.max(rows[k].drop, rows[k - 1].drop); rows[k].thickness = Math.max(rows[k].thickness, rows[k - 1].thickness); }
  const holding = rows.filter(r => r.holds), lightest = holding[0] ?? null, heaviest = holding.at(-1) ?? null;
  return { rows, lightest, heaviest, widthMm: lightest ? lightest.widthMm : null, mmPerCell, settings: { ...point.brush, water: point.water, pressure: point.pressure, radiusCells: +pointRadius(mmPerCell, point).toFixed(3) } };
}

/**
 * The load that leaves a film of `thickness`, by straight interpolation between the swatch's rows that hold a line, and
 * the width of the line at that load. Null outside the loads that hold: a film thinner than the lightest line that
 * holds, or thicker than the heaviest tried, is not this point's line.
 * @returns {{ conc, widthMm }|null}
 */
export function loadFor(thickness, swatch) {
  const rows = swatch.rows.filter(r => r.holds);
  if (rows.length < 2 || !(thickness >= rows[0].thickness) || thickness > rows.at(-1).thickness) return null;
  for (let k = 1; k < rows.length; k++) {
    const a = rows[k - 1], b = rows[k];
    if (thickness <= b.thickness) { const t = (thickness - a.thickness) / Math.max(1e-9, b.thickness - a.thickness); return { conc: a.conc + (b.conc - a.conc) * t, widthMm: a.widthMm + (b.widthMm - a.widthMm) * t }; }
  }
  return null;
}
