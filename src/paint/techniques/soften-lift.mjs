// Softening: a clean damp brush run along a wash's edge right after it, while it is still wet
// (painting-study.md section 3: softening an edge 9 of 11 painters).
//
// The brush is damp (src/media/brush.mjs thirsty) and runs along the wash's edge, centred on it, so the paint bleeds a
// brush-width out into the paper and the line goes. No number here comes from a subject. Planning only: the painter
// lays these paths with the physical brush (tools/plate/paint.mjs).
import { traceOutlines } from '../../crop/outline.mjs';

// The clean damp brush that softens holds a little free liquid, just past the point where its hairs give water (the
// brush's free share, 0.4): the water it lays on the dry side lets the wet wash creep out to it.
export const SOFTEN_WATER = 0.48;

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

