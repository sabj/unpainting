// The scrap swatch a painter tries a loaded brush on before it touches the sheet: a 50-cell square swept by one wide
// brush, dried, and read for how much of the charge it holds. tools/paint-plate.mjs lays one per technique and charges
// every passage by what its swatch delivered. The brushes, the dip, the stroke and the drying are the caller's own, so
// the swatch is laid with exactly the instruments the sheet is painted with.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { openEdgeShare } from '../../media/wash.mjs';

export const SWATCH = Object.freeze({ width: 90, height: 90, x0: 20, y0: 20, x1: 70, y1: 70, want: 0.3 });

/** The swatch's square as a 0/1 field over the scrap. */
export const swatchMask = () => swatchStrip(SWATCH.y1 - SWATCH.y0).mask;

/**
 * A swatch strip `cols` wide (default the square's 50) and `rows` long, swept along its length, with the same margin of
 * scrap all round. A brush that holds a real load is tried over one load's length at its own width (tools/plate/sheet.mjs),
 * so the swatch shows where it runs short as the sheet's lanes do. The square is the strip 50 by 50.
 * @returns {{ mask: Uint8Array, width: number, height: number }}
 */
export function swatchStrip(rows, cols = SWATCH.x1 - SWATCH.x0) {
  for (const [what, v] of [['rows', rows], ['columns', cols]]) if (!Number.isInteger(v) || v < 1) throw new RangeError(`scrap swatch: a strip needs a whole number of ${what}, got ${v}`);
  const width = cols + SWATCH.x0 + (SWATCH.width - SWATCH.x1), height = rows + SWATCH.y0 + (SWATCH.height - SWATCH.y1), mask = new Uint8Array(width * height);
  for (let y = SWATCH.y0; y < SWATCH.y0 + rows; y++) for (let x = SWATCH.x0; x < SWATCH.x0 + cols; x++) mask[y * width + x] = 1;
  return { mask, width, height };
}

/**
 * Lay one technique on scrap and read what it delivers.
 * @param {{ water: number, passes: number, intoWet?: boolean, chunk?: number }} T the technique: its brush load, how many
 *   times the swatch is brushed while wet, whether clean water goes down first, and (chunk > 0) a recharge every
 *   `chunk` path points, as a graded wash is laid.
 * @param {object} env mask and paths of the swatch, and the scrap's width and height (default the square's); pigment, physics and paperOptions of the scrap; charge, the
 *   concentration that should lay SWATCH.want; upright, the stroke heading; water(T), the dip's water;
 *   paintBrush(r, T) and waterBrush(r), the brushes; dip, stroke, step and dry, the caller's instruments;
 *   prepareBed(scrap, pts, r, T, cells), the sheet's own wetting of a wet-into-wet bed (its brushes, pickup and wait), or
 *   null for one sweep of waterBrush at a full load; settle(scrap,
 *   cells), the wait the sheet makes between wetting a lane and charging it (the cells are the lane's footprint), or
 *   null where the sheet charges a wet lane at once.
 * @returns {{ delivered: number, all: number, escape: number, edge: number }} delivered: thickness inside the swatch
 *   over want; all: the whole scrap's pigment over the swatch's cells, over want; escape: the share that ran past the
 *   swatch; edge: the swatch's open-edge share.
 */
export function scrapDelivery(T, { mask, paths, width: SW = SWATCH.width, height: SH = SWATCH.height, pigment, physics, paperOptions, charge, upright, water, paintBrush, waterBrush, dip, stroke, step, dry, settle = null, prepareBed = null }) {
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`scrap swatch: ${T.name} needs a whole number of passes, got ${T.passes}`);
  if (mask.length !== SW * SH) throw new RangeError(`scrap swatch: a ${mask.length}-cell mask on a ${SW} x ${SH} scrap`);
  const { want } = SWATCH, SN = SW * SH;
  const scrap = createSheet(makePaper(SW, SH, paperOptions), [pigment]);
  for (const pts of paths) {
    const r = Math.max(1, ...pts.map(p => p.r));
    if (T.intoWet) {
      const before = settle ? Float32Array.from(scrap.W) : null;
      if (prepareBed) prepareBed(scrap, pts, r, T, laneCells(pts, r, SW, SH));
      else { const wetB = waterBrush(r); dip(wetB, { water: 1, conc: [0] }); stroke(wetB, scrap, pts, { upright }); }
      // the lane is charged when the sheet would charge it: after the same wait for the shine to go off, read over the
      // cells the water brush wetted
      if (settle) settle(scrap, wettedCells(scrap, before, laneCells(pts, r, SW, SH)));
    }
    const b = paintBrush(r, T);
    dip(b, { water: water(T), conc: [charge] });
    if (T.chunk) {
      // the water moves on the same clock as an unbroken sweep: counted across the chunks, not restarted in each
      let st = 0;
      for (let q = 0; q < T.passes; q++) for (let k = 0; k < pts.length; k += T.chunk) { dip(b, { water: water(T), conc: [charge] }); stroke(b, scrap, pts.slice(Math.max(0, k - 1), k + T.chunk + 1), { upright, between: () => { if (++st % 24 === 0) step(scrap, physics); } }); }
    } else
    for (let q = 0; q < T.passes; q++) stroke(b, scrap, pts, { upright, between: st => { if (st % 24 === 0) step(scrap, physics); } });
  }
  for (let q = 0; q < 60; q++) step(scrap, physics);
  dry(scrap, 20000, physics, { levelMax: 400, dt: 4 });
  const th = thickness(scrap)[0];
  let got = 0, all = 0, c = 0; for (let i = 0; i < SN; i++) { all += th[i]; if (mask[i]) { got += th[i]; c++; } }
  return { delivered: c ? got / c / want : 1, all: c ? all / c / want : 1, escape: all > 1e-9 ? 1 - got / all : 0, edge: openEdgeShare(mask, SW, SH) };
}

/** The cells a lane's brush covers: every cell within its radius of its path, the segments between points included. */
function laneCells(pts, r, w, h) {
  const seen = new Uint8Array(w * h), cells = [];
  const disc = (px, py, R) => {
    for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(h - 1, Math.ceil(py + R)); y++)
      for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(w - 1, Math.ceil(px + R)); x++) {
        const i = y * w + x;
        if (!seen[i] && (x - px) ** 2 + (y - py) ** 2 <= R * R) { seen[i] = 1; cells.push(i); }
      }
  };
  pts.forEach((p, k) => {
    const q = k ? pts[k - 1] : p, steps = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.y - q.y)));
    for (let j = k ? 1 : 0; j <= steps; j++) { const u = j / steps; disc(q.x + (p.x - q.x) * u, q.y + (p.y - q.y) * u, Math.max(r, (q.r ?? r) + ((p.r ?? r) - (q.r ?? r)) * u)); }
  });
  return cells;
}

/** The cells of a lane the water brush actually wetted: those whose standing water rose under its stroke. */
const wettedCells = (scrap, before, cells) => cells.filter(i => scrap.W[i] > before[i]);

/** The charge factor a swatch reading gives: one over what it delivered; a swatch that laid nothing readable charges 1. */
export const chargeFactor = delivered => (delivered > 0.02 ? 1 / delivered : 1);
