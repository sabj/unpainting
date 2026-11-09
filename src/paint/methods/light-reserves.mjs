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
export function reserveBox(r, w, h) {
  const b = r.bounds;
  return { x0: Math.max(0, Math.floor(b[0] * w)), y0: Math.max(0, Math.floor(b[1] * h)), x1: Math.min(w, Math.ceil(b[2] * w)), y1: Math.min(h, Math.ceil(b[3] * h)) };
}

/**
 * The reserve mask: light cells inside every reserve box. `light` is the plan's closed inferred-light mask (1 where
 * the target shows paper). Returns {mask, report: [{reason, boxCells, kept}]}.
 */
export function reserveLights(reserves, { w, h, light }) {
  if (!light || light.length !== w * h) throw Error('reserveLights needs the light mask of the grid');
  const mask = new Uint8Array(w * h), report = [];
  for (const r of reserves) {
    const { x0, y0, x1, y1 } = reserveBox(r, w, h);
    let boxCells = 0, kept = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { boxCells++; const i = y * w + x; if (light[i]) { mask[i] = 1; kept++; } }
    report.push({ reason: r.reason, boxCells, kept });
  }
  return { mask, report };
}
