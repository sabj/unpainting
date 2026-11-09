// The scrap swatch a painter tries a loaded brush on before it touches the sheet: a 50-cell square swept by one wide
// brush, dried, and read for how much of the charge it holds. tools/paint-plate.mjs lays one per technique and charges
// every passage by what its swatch delivered. The brushes, the dip, the stroke and the drying are the caller's own, so
// the swatch is laid with exactly the instruments the sheet is painted with.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { openEdgeShare } from '../../media/wash.mjs';

export const SWATCH = Object.freeze({ width: 90, height: 90, x0: 20, y0: 20, x1: 70, y1: 70, want: 0.3 });

/** The swatch's square as a 0/1 field over the scrap. */
export function swatchMask() {
  const mask = new Uint8Array(SWATCH.width * SWATCH.height);
  for (let y = SWATCH.y0; y < SWATCH.y1; y++) for (let x = SWATCH.x0; x < SWATCH.x1; x++) mask[y * SWATCH.width + x] = 1;
  return mask;
}

/**
 * Lay one technique on scrap and read what it delivers.
 * @param {{ water: number, passes: number, intoWet?: boolean, chunk?: number }} T the technique: its brush load, how many
 *   times the swatch is brushed while wet, whether clean water goes down first, and (chunk > 0) a recharge every
 *   `chunk` path points, as a graded wash is laid.
 * @param {object} env mask and paths of the swatch; pigment, physics and paperOptions of the scrap; charge, the
 *   concentration that should lay SWATCH.want; upright, the stroke heading; water(T), the dip's water;
 *   paintBrush(r, T) and waterBrush(r), the brushes; dip, stroke, step and dry, the caller's instruments.
 * @returns {{ delivered: number, all: number, escape: number, edge: number }} delivered: thickness inside the swatch
 *   over want; all: the whole scrap's pigment over the swatch's cells, over want; escape: the share that ran past the
 *   swatch; edge: the swatch's open-edge share.
 */
export function scrapDelivery(T, { mask, paths, pigment, physics, paperOptions, charge, upright, water, paintBrush, waterBrush, dip, stroke, step, dry }) {
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`scrap swatch: ${T.name} needs a whole number of passes, got ${T.passes}`);
  const { width: SW, height: SH, want } = SWATCH, SN = SW * SH;
  const scrap = createSheet(makePaper(SW, SH, paperOptions), [pigment]);
  for (const pts of paths) {
    const r = Math.max(1, ...pts.map(p => p.r));
    if (T.intoWet) { const wetB = waterBrush(r); dip(wetB, { water: 1, conc: [0] }); stroke(wetB, scrap, pts, { upright }); }
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

/** The charge factor a swatch reading gives: one over what it delivered; a swatch that laid nothing readable charges 1. */
export const chargeFactor = delivered => (delivered > 0.02 ? 1 / delivered : 1);
