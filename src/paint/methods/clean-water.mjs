// The clean water a wash is laid into. A painter wets the whole shape to its edge before the paint goes in, so the
// paint runs to the shape's own outline and into every corner the brush's lanes do not reach. Wetted only along the
// lanes (as it was, with a flat), the bed was the lanes' bands: the dried wash had square corners, a stepped outline
// along the lanes and a square notch of paper wherever one lane was shorter than the next (wash-edges DIAGNOSIS.md).
// Here the lanes are wetted with a round, the brush that lays the paint, and a round runs once round the shape's
// outline, its edge on the outline, so the bed reaches it everywhere. Geometry of the passage's own mask only.
import { distanceToZero } from '../../raster.js';
import { traceOutlines } from '../../crop/outline.mjs';

/** The round that carries the water round the outline is at most this wide (mm) ... */
const EDGE_WATER_MM = 4;
/** ... and at least this many cells across its radius. */
const EDGE_WATER_LEAST = 1.5;
/** A ring shorter than this many of its brush's radii is a speck the lanes already wet; it gets no stroke. */
const EDGE_RING_LEAST = 4;

/**
 * Round strokes of clean water a brush's radius inside the outline of `mask` (w x h, 1 inside), so the brush's edge runs
 * on the outline: one closed path per outline (a hole's too). Parts too narrow for the brush to run inside get none (their
 * lanes wet them).
 * @param mask the passage's cells on the sheet (Uint8Array, w x h)
 * @param mmPerCell the sheet's cell (mm)
 * @param laneRadius the lanes' brush radius (cells): the edge brush is no wider
 * @returns {Array<Array<{x:number,y:number,r:number,p:number,round:true}>>} paths in sheet cells
 */
export function outlineWater(mask, w, h, { mmPerCell, laneRadius }) {
  if (!(mmPerCell > 0) || !(laneRadius > 0)) throw Error('outline water: needs the cell size and the lanes\' radius');
  if (mask.length !== w * h) throw Error('outline water: the mask must be w x h');
  const r = Math.max(EDGE_WATER_LEAST, Math.min(laneRadius, EDGE_WATER_MM / 2 / mmPerCell));
  const d = distanceToZero(mask, w, h), inner = Uint8Array.from(d, v => (v >= r ? 1 : 0));
  if (!inner.some(v => v)) return [];
  const step = Math.max(1, Math.round(r / 2));
  const out = [];
  for (const c of traceOutlines(inner, w, h, { minLength: Math.ceil(EDGE_RING_LEAST * r / step), step })) {
    const pts = c.points.map(q => ({ x: q.x + 0.5, y: q.y + 0.5, r, p: 1, round: true }));
    // a closed outline is closed by the stroke too, so the ring has no gap where it starts
    const a = pts[0], b = pts[pts.length - 1];
    if (pts.length > 2 && Math.hypot(a.x - b.x, a.y - b.y) <= 2 * step + 1) pts.push({ ...a });
    out.push(pts);
  }
  return out;
}
