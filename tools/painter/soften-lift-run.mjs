// Runs an area pass's softening and lifting (src/paint/techniques/soften-lift.mjs) right after its strokes, before any
// dry: a clean damp brush the size of the pass brush, rinsed and squeezed before every stroke (thirsty), along the
// pass's edge or over its lift polygon. Returns what it did, for the run log.
import { softenPaths, liftPaths, SOFTEN_WATER } from '../../src/paint/techniques/soften-lift.mjs';

const insidePoly = (p, poly) => { let yes = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes; } return yes; };

/** Cells of a W x H sheet inside a normalized-target polygon, through the plan's crop (as rasterAreaPlan places them). */
export function polygonCells(poly, plan, W, H) {
  const T = plan.doc.target, c = plan.crop;
  return Uint8Array.from({ length: W * H }, (_, i) => (insidePoly([(c[0] + (i % W + .5) * c[2] / W) / T.width, (c[1] + (Math.floor(i / W) + .5) * c[3] / H) / T.height], poly) ? 1 : 0));
}

export function softenAndLift({ pass, plan, mask, W, H, mmPerCell, newBrush, dip, thirsty, stroke, K, upright = true }) {
  const lift = pass.lights?.mode === 'lift';
  if (!pass.soften && !lift) return null;
  const r = pass.brush.widthMm / (2 * mmPerCell), damp = () => { const b = newBrush(r); dip(b, { water: 1, conc: new Array(K).fill(0) }); return thirsty(b); };
  // softening lays a little water past the edge (SOFTEN_WATER); lifting drinks (thirsty)
  const softBrush = () => thirsty(damp(), { water: SOFTEN_WATER });
  const done = { pass: pass.id, brushMm: pass.brush.widthMm, softenStrokes: 0, liftStrokes: 0 };
  if (pass.soften) {
    const where = pass.soften.polygon ? polygonCells(pass.soften.polygon, plan, W, H) : null;
    done.softenStrokes = softenEdge({ mask, where, W, H, r, damp: softBrush, stroke, upright });
    done.softenReason = pass.soften.reason;
  }
  if (lift) {
    const light = polygonCells(pass.lights.polygon, plan, W, H);
    for (let i = 0; i < light.length; i++) light[i] = light[i] && mask[i] ? 1 : 0;
    for (const path of liftPaths(light, W, H, { r })) { stroke(damp(), path, { upright }); done.liftStrokes++; }
    done.liftReason = pass.lights.reason;
  }
  return done;
}

/**
 * A clean damp brush of radius r (sheet cells), made by damp(), run along the edge of `mask` where `where` allows, right
 * after the wash while it is wet. Returns the number of strokes. Used by area passes (pass.soften) and by a mass plan's
 * forms whose edges the plan marks soft (mass-passages.mjs intent.soften).
 */
export function softenEdge({ mask, where = null, W, H, r, damp, stroke, upright = true }) {
  let count = 0;
  for (const path of softenPaths(mask, W, H, { r, where })) { stroke(damp(), path, { upright }); count++; }
  return count;
}
