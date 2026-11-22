// The whites of the block-in that are not lights. A block-in study leaves its lightest masses white, and the planner
// keeps a white shape as bare paper. But a block-in often whitens a pale mass the picture tints (a pale sky, a cream
// sail, a hull in shadow: white in the block-in, pale blue and cream in every richer study). Such a white is read from
// the middle study instead, so its pale colours are shapes like any other and are washed. A white the richer studies
// keep white (the margin, a cloud, a catchlight) stays paper. Studies only; no subject pixels.

/**
 * The white shapes of the block-in to wash over: those of `lights` in which EVERY richer study tints at least `share` of
 * the cells (a cell is tinted when it is darker than `paperL` or more chromatic than `paperC`).
 * @param shapes [{cells}]
 * @param lights the block-in's white shapes kept as paper (indices into shapes)
 * @param richer one reader for each richer study: plan cell -> [L, a, b]
 * @param share the share of a white's cells every richer study must tint (a setting of the reading; above 1: none is washed)
 */
export function tintedWhites({ shapes, lights, richer, share, paperL, paperC }) {
  if (!richer.length || !(share <= 1)) return [];
  return lights.filter(i => {
    const cells = shapes[i].cells; if (!cells.length) return false;
    for (const labAt of richer) {
      let tinted = 0; for (const q of cells) { const [l, a, b] = labAt(q); if (l < paperL || Math.hypot(a, b) > paperC) tinted++; }
      if (tinted < share * cells.length) return false;
    }
    return true;
  });
}

/** A copy of the block-in grid (sRGB, 3 a cell) with the cells of the shapes `take` read from the grid `from`. */
export function readFrom(grid, from, shapes, take) {
  const out = Uint8ClampedArray.from(grid);
  for (const i of take) for (const q of shapes[i].cells) for (let c = 0; c < 3; c++) out[q * 3 + c] = from[q * 3 + c];
  return out;
}
