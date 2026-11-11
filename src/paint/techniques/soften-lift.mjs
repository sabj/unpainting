// Softening and lifting: the two things painters do with a clean damp brush right after a wash, while it is still wet
// (painting-study.md section 3: softening an edge 9 of 11 painters, lifting from damp paint 7 of 11).
//
// Both use the brush's own thirsty state (src/media/brush.mjs thirsty: rinsed, squeezed, damp with no free liquid).
// Softening runs that brush along the wash's edge, centred on it, so the paint bleeds a brush-width out into the paper
// and the line goes. Lifting runs it over a light shape inside the wash in lanes one brush-width apart, so the hairs
// drink water and pigment back out. No number here comes from a subject: the brush is the pass's own brush, the lane
// pitch is its width. Planning only: the painter lays these paths with the physical brush (tools/plate/paint.mjs).
import { traceOutlines } from '../../crop/outline.mjs';

const fail = m => { throw Error(`semantic areas: ${m}`); };

// The clean damp brush that softens holds a little free liquid, just past the point where its hairs give water (the
// brush's free share, 0.4): the water it lays on the dry side lets the wet wash creep out to it. It is the load the
// value route's selected-edge softening already dips (tools/plate/paint.mjs, water .48). A thirsty brush, squeezed to
// no free liquid, gives the paper nothing and only drinks: that is the lifting brush.
export const SOFTEN_WATER = 0.48;

/** The contract text for --areahelp. */
export const SOFTEN_LIFT_CONTRACT = Object.freeze({
  soften: 'Optional pass.soften:{reason,polygon?} on a wet on wet or wet on dry pass (not authored, not dry brush): right after the pass, while it is wet, a clean damp brush the size of the pass brush (a little free liquid) runs along the edge of its shapes (inside polygon only, when given), so the wash creeps out and the edge goes soft.',
  lift: 'lights.mode lift:{reason,polygon} on a wet on wet or wet on dry pass (not authored): the pass paints over the light, then a clean damp brush the size of the pass brush lifts the polygon while the paint is wet, in lanes one brush width apart.',
});

/** Checks pass.soften and a lift light. key names the pass in errors. polygonCheck validates a polygon. */
export function validateSoftenLift(pass, key, polygonCheck) {
  const lifts = pass.lights?.mode === 'lift';
  if (pass.soften === undefined && !lifts) return;
  if (pass.source === 'authored') fail(`soften/lift ${key}: not on authored passes`);
  if (!['wet on wet', 'wet on dry'].includes(pass.move)) fail(`soften/lift ${key}: needs a wet on wet or wet on dry pass`);
  if (pass.soften !== undefined) {
    if (typeof pass.soften !== 'object' || pass.soften === null) fail(`soften ${key}`);
    if (typeof pass.soften.reason !== 'string' || !pass.soften.reason.trim()) fail(`soften ${key}.reason required`);
    for (const k of Object.keys(pass.soften)) if (!['reason', 'polygon'].includes(k)) fail(`soften ${key}: unknown field ${k}`);
    if (pass.soften.polygon !== undefined) polygonCheck(pass.soften.polygon, `${key}.soften`);
  }
}

/** Paths along the edge of `mask` (cells inside `where`, when given), one brush wide, centred on the edge. */
export function softenPaths(mask, w, h, { r, where = null }) {
  if (!(r > 0)) throw Error('soften: brush radius must be positive');
  const out = [];
  for (const chain of traceOutlines(mask, w, h, { minLength: 2, step: Math.max(1, Math.round(r / 2)) })) {
    let run = [];
    for (const q of chain.points) {
      const x = Math.round(q.x), y = Math.round(q.y);
      const ok = !where || where[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
      if (ok) run.push({ x: x + 0.5, y: y + 0.5, p: 1, r });
      else { if (run.length > 1) out.push(run); run = []; }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}

/** Lanes over `mask`, one brush width apart, as the runs of each row band that fall inside it. */
export function liftPaths(mask, w, h, { r }) {
  if (!(r > 0)) throw Error('lift: brush radius must be positive');
  const out = [], pitch = Math.max(1, 2 * r);
  for (let y = r / 2, row = 0; y < h; y += pitch, row++) {
    const yy = Math.min(h - 1, Math.floor(y)), runs = [];
    let x0 = -1;
    for (let x = 0; x <= w; x++) {
      const inside = x < w && mask[yy * w + x];
      if (inside && x0 < 0) x0 = x;
      if (!inside && x0 >= 0) { runs.push([x0, x - 1]); x0 = -1; }
    }
    for (const [a, b] of row % 2 ? runs.reverse() : runs) {
      const [s, e] = row % 2 ? [b, a] : [a, b];
      out.push([{ x: s + 0.5, y: yy + 0.5, p: 1, r }, { x: e + 0.5 + (s === e ? (row % 2 ? -0.5 : 0.5) : 0), y: yy + 0.5, p: 1, r }]);
    }
  }
  return out;
}
