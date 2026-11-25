// Soft edges of a value-plan passage. The planner classes every boundary cell of a passage soft or hard
// (light-to-dark.mjs: the value across it differs by under .14 and the colour edge is under .45 for soft). A passage is
// laid wet on dry and clipped to its mask, so its boundary dries as a hard step of one cell; the sheet never carries
// pigment across a clip on its own. A painter softens an edge with a clean damp brush run along it while the wash is
// wet (src/paint/techniques/soften-lift.mjs, tools/painter/soften-lift-run.mjs), so the paint creeps out to the damp
// strip and the line goes. These helpers pick where that brush goes and how big it is. Hard cells stay as cut, and so
// does any soft cell the damp brush would reach a hard edge or a reserved light from.

/** The box (x0, y0, x1, y1) around the cells of every list, grown by `reach`, inside w x h. */
function reachBox(lists, w, h, reach) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const list of lists) for (const i of list) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0: Math.max(0, x0 - reach), y0: Math.max(0, y0 - reach), x1: Math.min(w - 1, x1 + reach), y1: Math.min(h - 1, y1 + reach) };
}

/** Square dilation by `r` of a byte mask over a box, two sliding passes. Returns a new mask. */
function dilateBox(mask, bw, bh, r) {
  const row = new Uint8Array(bw * bh), out = new Uint8Array(bw * bh), next = new Float64Array(Math.max(bw, bh));
  const pass = (src, dst, len, lines, at) => {
    for (let l = 0; l < lines; l++) {
      for (let k = len - 1, nx = Infinity; k >= 0; k--) { if (src[at(l, k)]) nx = k; next[k] = nx; }
      let last = -Infinity;
      for (let k = 0; k < len; k++) { if (src[at(l, k)]) last = k; dst[at(l, k)] = k - last <= r || next[k] - k <= r ? 1 : 0; }
    }
  };
  pass(mask, row, bw, bh, (y, x) => y * bw + x);
  pass(row, out, bh, bw, (x, y) => y * bw + x);
  return out;
}

/** `protect` grown by `reach` cells over the whole sheet; null when there is no reserve. Cache one per reach. */
export function growReserve(protect, w, h, reach) {
  return protect ? dilateBox(protect, w, h, reach) : null;
}

/**
 * The cells of a passage's soft boundary that the damp brush may run along: soft cells with no hard boundary cell of the
 * same passage within `reach` cells, and no reserved light within `reach` (`nearReserve`, from growReserve).
 * Returns a w x h byte mask of those cells and their neighbours, or null when no cell qualifies.
 */
export function softenWhere({ softCells, hardCells, nearReserve = null, w, h, reach }) {
  if (!softCells?.length) return null;
  const R = Math.max(1, Math.ceil(reach)), box = reachBox([softCells, hardCells ?? []], w, h, R), bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  const hard = new Uint8Array(bw * bh);
  for (const i of hardCells ?? []) hard[(((i / w) | 0) - box.y0) * bw + (i % w) - box.x0] = 1;
  const near = hardCells?.length ? dilateBox(hard, bw, bh, R) : null;
  const local = new Uint8Array(bw * bh);
  let any = 0;
  for (const i of softCells) {
    const x = i % w, y = (i / w) | 0;
    if (near && near[(y - box.y0) * bw + x - box.x0]) continue;
    if (nearReserve && nearReserve[i]) continue;
    local[(y - box.y0) * bw + x - box.x0] = 1; any++;
  }
  if (!any) return null;
  // the traced outline the brush follows is smoothed, so a point can land a cell off the boundary cell it came from
  const grown = dilateBox(local, bw, bh, 1), out = new Uint8Array(w * h);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (y + box.y0) * w + x + box.x0; if (grown[y * bw + x] && !(near && near[y * bw + x]) && !(nearReserve && nearReserve[i])) out[i] = 1; }
  return out;
}

/**
 * The damp brush: the largest round of the kit (`halves`, their half widths in cells) that fits inside the shape (its
 * width is at most the shape's support width), is no wider than the passage's own brush, and is within `cap`. Returns
 * its radius in cells, or 0 when none fits, so a shape narrower than the kit's finest brush keeps its dry edge.
 */
export function softenBrushCells(halves, { ownCells, supportCells, cap = Infinity }) {
  let best = 0;
  for (const h of halves) if (h > best && 2 * h <= supportCells && h <= ownCells && h <= cap) best = h;
  return best;
}
