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

/** The hand's pressure along a sweep, as the painter lays one (tools/plate/paint.mjs): it lands over the first `land` of
 *  the sweep, bears down through its middle and lifts over the last `lift`. u is the share of the sweep travelled. */
export const sweepPressure = (u, land = 0.06, lift = 0.1) => Math.max(0.18, Math.min(1.2, (0.72 + 0.28 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / land), Math.min(1, (1 - u) / lift))));

/**
 * The swatch laid as the sheet lays a wash: straight lanes of a brush of `radius` cells from one side of the square to
 * the other, as many as cover it with neighbours overlapping by `overlap` of the brush, the outer two inside its edges,
 * each pressed as the painter presses a sweep. A point every cell, so a graded swatch can recharge along a lane.
 * @returns {Array<Array<{x:number,y:number,r:number,p:number}>>}
 */
export function swatchLanes(radius, { overlap = 1 / 3 } = {}) {
  const { x0, x1, y0, y1 } = SWATCH, r = Math.max(0.5, Math.min(radius, (y1 - y0) / 2));
  const top = y0 + r, span = Math.max(0, y1 - r - top), count = span > 0 ? Math.ceil(span / (2 * r * (1 - overlap)) - 1e-9) + 1 : 1;
  const n = Math.max(2, Math.ceil(x1 - x0) + 1), lanes = [];
  for (let q = 0; q < count; q++) {
    const y = count > 1 ? top + q * span / (count - 1) : (y0 + y1) / 2;
    lanes.push(Array.from({ length: n }, (_, k) => ({ x: x0 + (x1 - x0) * k / (n - 1), y, r, p: sweepPressure(k / (n - 1)) })));
  }
  return lanes;
}

/**
 * Lay one technique on scrap and read what it delivers.
 * @param {{ water: number, passes: number, intoWet?: boolean, chunk?: number }} T the technique: its brush load, how many
 *   times the swatch is brushed while wet, whether clean water goes down first, and (chunk > 0) a recharge every
 *   `chunk` path points, as a graded wash is laid.
 * @param {object} env mask and paths of the swatch (bedPaths, when given, wet the whole bed before a passage laid into
 *   wet is charged along paths); pigment, physics and paperOptions of the scrap; charge, the
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
export function scrapDelivery(T, { mask, paths, bedPaths = null, pigment, physics, paperOptions, charge, upright, water, paintBrush, waterBrush, dip, stroke, step, dry, settle = null, prepareBed = null, scrap: given = null, channel = 0, finish = true }) {
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`scrap swatch: ${T.name} needs a whole number of passes, got ${T.passes}`);
  const { width: SW, height: SH, want } = SWATCH, SN = SW * SH;
  // `scrap`: a scrap already made and painted on (damp-swatch.mjs lays a wash on it first); this technique's paint goes
  // into its pigment `channel` and is read there. `finish` false lays the technique and leaves the scrap wet, unread.
  const scrap = given ?? createSheet(makePaper(SW, SH, paperOptions), [pigment]);
  const concOf = c => { const v = new Array(scrap.K).fill(0); v[channel] = c; return v; };
  // bedPaths: a passage laid in lanes into wet has its whole bed wetted first and is charged lane by lane after the wait
  if (T.intoWet && bedPaths) {
    const before = settle ? Float32Array.from(scrap.W) : null, cells = new Set();
    for (const pts of bedPaths) {
      const r = Math.max(1, ...pts.map(p => p.r)), lane = laneCells(pts, r, SW, SH);
      for (const i of lane) cells.add(i);
      if (prepareBed) prepareBed(scrap, pts, r, T, lane);
      else { const wetB = waterBrush(r); dip(wetB, { water: 1, conc: concOf(0) }); stroke(wetB, scrap, pts, { upright }); }
    }
    if (settle) settle(scrap, wettedCells(scrap, before, [...cells]));
  }
  for (const pts of paths) {
    const r = Math.max(1, ...pts.map(p => p.r));
    if (T.intoWet && !bedPaths) {
      const before = settle ? Float32Array.from(scrap.W) : null;
      if (prepareBed) prepareBed(scrap, pts, r, T, laneCells(pts, r, SW, SH));
      else { const wetB = waterBrush(r); dip(wetB, { water: 1, conc: concOf(0) }); stroke(wetB, scrap, pts, { upright }); }
      // the lane is charged when the sheet would charge it: after the same wait for the shine to go off, read over the
      // cells the water brush wetted
      if (settle) settle(scrap, wettedCells(scrap, before, laneCells(pts, r, SW, SH)));
    }
    const b = paintBrush(r, T);
    dip(b, { water: water(T), conc: concOf(charge) });
    if (T.chunk) {
      // the water moves on the same clock as an unbroken sweep: counted across the chunks, not restarted in each
      let st = 0;
      for (let q = 0; q < T.passes; q++) for (let k = 0; k < pts.length; k += T.chunk) { dip(b, { water: water(T), conc: concOf(charge) }); stroke(b, scrap, pts.slice(Math.max(0, k - 1), k + T.chunk + 1), { upright, between: () => { if (++st % 24 === 0) step(scrap, physics); } }); }
    } else
    for (let q = 0; q < T.passes; q++) stroke(b, scrap, pts, { upright, between: st => { if (st % 24 === 0) step(scrap, physics); } });
  }
  if (!finish) return null;
  for (let q = 0; q < 60; q++) step(scrap, physics);
  dry(scrap, 20000, physics, { levelMax: 400, dt: 4 });
  const th = thickness(scrap)[channel];
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
