// Explicit light reserves (plan `reserves[]`: {bounds: [x0, y0, x1, y1] as shares of the sheet, reason}).
// A reserve is the target's own light inside its box, not the box. The planner draws a roomy box round a catchlight
// or a cloud crest; the frisket goes on the cells inside it that the plan's paper rule calls light (the closed
// inferred-light mask the lights themselves come from). Every such cell is kept whatever its size, because the
// planner pointed at it; a box with no target light reserves nothing and the report says so. Planning only: it runs
// before any paint and reads no target during painting.

/** Throws on a malformed reserve: a reason and four finite bounds in [0, 1] with x0 < x1 and y0 < y1. */
export function validateReserves(reserves) {
  for (const r of reserves) {
    const b = r?.bounds;
    if (!r?.reason || !Array.isArray(b) || b.length !== 4 || b.some(v => !Number.isFinite(v) || v < 0 || v > 1) || b[0] >= b[2] || b[1] >= b[3]) throw Error('invalid explicit light reserve');
  }
}

/** The box of a reserve in cells, clipped to the grid: {x0, y0, x1, y1} with x1 and y1 exclusive. */
function reserveBox(r, w, h) {
  const b = r.bounds;
  return { x0: Math.max(0, Math.floor(b[0] * w)), y0: Math.max(0, Math.floor(b[1] * h)), x1: Math.min(w, Math.ceil(b[2] * w)), y1: Math.min(h, Math.ceil(b[3] * h)) };
}

/** Cells in the disc a brush of `brushMm` width leaves on a grid of `cellMm` cells, at least one. */
export function brushFootprintCells(brushMm, cellMm) {
  if (!(brushMm > 0) || !(cellMm > 0)) throw Error('brush footprint needs a positive brush width and cell size');
  return Math.max(1, Math.round(Math.PI * (brushMm / 2 / cellMm) ** 2));
}

// A catchlight is often lighter than its surround without reaching the paper rule. Grow the lightest connected cells
// of the box by the plan's own target value (0 paper to 1 deepest), lightest first, up to one smallest-brush footprint:
// the least paper a real brush can leave. Only cells lighter than the box itself are candidates, so a flat box keeps none.
function lightestConnected(box, { w, values, minCells }) {
  const { x0, y0, x1, y1 } = box, inBox = i => { const x = i % w, y = (i / w) | 0; return x >= x0 && x < x1 && y >= y0 && y < y1; };
  let seed = -1, sum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += values[y * w + x];
  const lighter = sum / Math.max(1, (x1 - x0) * (y1 - y0));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (values[i] < lighter && (seed < 0 || values[i] < values[seed])) seed = i; }
  if (seed < 0) return [];
  const taken = new Set([seed]), edge = new Set([seed]), out = [];
  while (edge.size && out.length < minCells) {
    let best = -1;
    for (const i of edge) if (best < 0 || values[i] < values[best] || (values[i] === values[best] && i < best)) best = i;
    edge.delete(best); out.push(best);
    const x = best % w, y = (best / w) | 0;
    for (const j of [x > 0 ? best - 1 : -1, best + 1, best - w, best + w]) {
      if (j < 0 || taken.has(j) || !inBox(j) || (j % w === 0 && best % w === w - 1) || !(values[j] < lighter)) continue;
      taken.add(j); edge.add(j);
    }
  }
  return out;
}

/**
 * The reserve mask: light cells inside every reserve box. `light` is the plan's closed inferred-light mask (1 where
 * the target shows paper). When a box holds none, `values` (the plan's target value, 0 paper to 1 deepest) and
 * `minCells` (the smallest brush's footprint) keep its lightest connected cells instead.
 * Returns {mask, report: [{reason, boxCells, kept, fromPlan?}]}.
 */
export function reserveLights(reserves, { w, h, light, values = null, minCells = 0 }) {
  if (!light || light.length !== w * h) throw Error('reserveLights needs the light mask of the grid');
  if (values && values.length !== w * h) throw Error('reserveLights needs the value map of the grid');
  const mask = new Uint8Array(w * h), report = [];
  for (const r of reserves) {
    const box = reserveBox(r, w, h), { x0, y0, x1, y1 } = box;
    let boxCells = 0, kept = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { boxCells++; const i = y * w + x; if (light[i]) { mask[i] = 1; kept++; } }
    const entry = { reason: r.reason, boxCells, kept };
    if (!kept && values && minCells > 0) {
      const cells = lightestConnected(box, { w, values, minCells });
      for (const i of cells) mask[i] = 1;
      if (cells.length) { entry.kept = cells.length; entry.fromPlan = cells.length; }
    }
    report.push(entry);
  }
  return { mask, report };
}

// The wash and detail brushes of brushes.json, as loadPhysical lists them; the pen and the dry drag brush lay no wash.
const PAINT_BRUSHES = ['rigger', 'round4', 'round8', 'round12', 'flat1in', 'mop'];

/** The width in mm of the narrowest paint brush in a brushes.json config; it sets the least paper a reserve keeps. */
export function smallestBrushMm(cfg) {
  const widths = PAINT_BRUSHES.map(k => cfg?.brushes?.[k]?.width_mm).filter(v => Number.isFinite(v) && v > 0);
  if (!widths.length) throw Error('brushes config has no paint brush with a width_mm');
  return Math.min(...widths);
}
