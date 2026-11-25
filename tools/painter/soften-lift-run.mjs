// The value plan's soft edges: a clean damp brush run along the soft side of a wash right after it, while it is wet
// (src/paint/techniques/soften-lift.mjs). Returns the number of strokes.
import { softenPaths } from '../../src/paint/techniques/soften-lift.mjs';

export function softenEdge({ mask, where = null, W, H, r, damp, stroke, upright = true }) {
  let count = 0;
  for (const path of softenPaths(mask, W, H, { r, where })) { stroke(damp(), path, { upright }); count++; }
  return count;
}
