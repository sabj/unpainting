// Pipeline: inking, stage 2 (hold and measure the lines): geometry over squiggles.
// A trace is replaced by the geometry it suggests only where the source shows that geometry: a straight run or an arc that
// stays within a tenth of a millimetre of the trace and sits on a pen line of the source. A piece that is not clearly
// geometry, a form contour (long and smooth) or a face or hand feature is left out and the wash carries it; wiggly
// fragments are never joined into longer wiggly lines. Only pieces that are collinear across a short gap are joined.
// Pure: arrays in, arrays out. Coordinates are the line file's image pixels.
import { resample } from './ink-lines.mjs';
import { crossProfile, MASS_DEFAULTS } from './line-class.mjs';

export const GEOM_DEFAULTS = Object.freeze({
  tolMm: 0.15,          // a primitive stays this close to the trace
  supportShare: 0.7,    // and at least this share of it lies on a pen line of the source
  penContrast: MASS_DEFAULTS.penContrast,
  arcMinRadiusMm: 1,
  arcMaxSweepDeg: 270,
  maxPiecesPerMm: 1.2,  // more primitives than this and the piece is a squiggle, not geometry
  formMm: 6,            // a form contour is at least this long ...
  formDegPerMm: 20,     // ... and turns no faster than this
  gapMm: 2.5,           // collinear pieces join across at most this
  joinCos: 0.98,
  joinAim: 0.97,
  energyStepMm: 0.5,    // the spacing curvature energy is read at, coarse enough to ignore the pixel staircase
});

const len = pts => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return s; };

/** Mean of kappa squared along a path, kappa in radians per mm, read every `energyStepMm`. 0 for a straight line. */
export function curvatureEnergy(pts, pxMm, o = GEOM_DEFAULTS, stepMm = o.energyStepMm) {
  const R = resample(pts, Math.max(1, stepMm / pxMm)); if (R.length < 3) return 0;
  const ds = len(R) * pxMm / (R.length - 1);
  let e = 0;
  for (let k = 1; k < R.length - 1; k++) {
    const a1 = Math.atan2(R[k].y - R[k - 1].y, R[k].x - R[k - 1].x), a2 = Math.atan2(R[k + 1].y - R[k].y, R[k + 1].x - R[k].x);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    e += (d / ds) ** 2;
  }
  return e / (R.length - 2);
}

const chordDev = (pts, i, j) => {
  const a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  let far = 0, at = i;
  for (let k = i + 1; k < j; k++) { const e = Math.abs((pts[k].x - a.x) * dy - (pts[k].y - a.y) * dx) / L; if (e > far) { far = e; at = k; } }
  return { far, at };
};

// Kasa circle fit on pts[i..j]; the arc if every point is within tol of it and it turns one way through at most the sweep
function arcFit(pts, i, j, tolPx, o, pxMm) {
  const n = j - i + 1; if (n < 5) return null;
  let sx = 0, sy = 0; for (let k = i; k <= j; k++) { sx += pts[k].x; sy += pts[k].y; }
  const mx = sx / n, my = sy / n; let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (let k = i; k <= j; k++) { const u = pts[k].x - mx, v = pts[k].y - my; suu += u * u; suv += u * v; svv += v * v; suuu += u ** 3; svvv += v ** 3; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-9) return null;
  const c1 = 0.5 * (suuu + suvv), c2 = 0.5 * (svvv + svuu), uc = (c1 * svv - c2 * suv) / det, vc = (suu * c2 - suv * c1) / det;
  const cx = uc + mx, cy = vc + my; let r = 0; for (let k = i; k <= j; k++) r += Math.hypot(pts[k].x - cx, pts[k].y - cy); r /= n;
  if (r * pxMm < o.arcMinRadiusMm || r * pxMm > 400) return null;
  for (let k = i; k <= j; k++) if (Math.abs(Math.hypot(pts[k].x - cx, pts[k].y - cy) - r) > tolPx) return null;
  // one way round, within the sweep
  let sweep = 0, sign = 0;
  for (let k = i + 1; k <= j; k++) { let d = Math.atan2(pts[k].y - cy, pts[k].x - cx) - Math.atan2(pts[k - 1].y - cy, pts[k - 1].x - cx); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (!sign) sign = Math.sign(d); if (Math.sign(d) !== sign && Math.abs(d) > 1e-6) return null; sweep += Math.abs(d); }
  if (sweep * 180 / Math.PI > o.arcMaxSweepDeg) return null;
  const a0 = Math.atan2(pts[i].y - cy, pts[i].x - cx), steps = Math.max(2, Math.ceil(r * sweep)), out = [];
  for (let s = 0; s <= steps; s++) { const a = a0 + sign * sweep * s / steps; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  out[0] = { x: pts[i].x, y: pts[i].y }; out[out.length - 1] = { x: pts[j].x, y: pts[j].y };
  return out;
}

/** Split `pts` (1 px apart) into straight runs and arcs within tolPx. Returns primitives [{ kind, pts }]. */
export function fitPrimitives(pts, tolPx, o = GEOM_DEFAULTS, pxMm = 0.14) {
  const out = [];
  const rec = (i, j) => {
    if (j - i < 1) return;
    const { far, at } = chordDev(pts, i, j);
    if (far <= tolPx || j - i < 3) { out.push({ kind: 'line', pts: [{ x: pts[i].x, y: pts[i].y }, { x: pts[j].x, y: pts[j].y }] }); return; }
    const arc = arcFit(pts, i, j, tolPx, o, pxMm);
    if (arc) { out.push({ kind: 'arc', pts: arc }); return; }
    rec(i, at); rec(at, j);
  };
  rec(0, pts.length - 1);
  return out;
}

const share = (prim, L, w, h, pxMm, o) => {
  const R = resample(prim, 1); let on = 0;
  for (let k = 0; k < R.length; k++) {
    const a = R[Math.max(0, k - 2)], b = R[Math.min(R.length - 1, k + 2)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // read within a pixel either side of the primitive: it sits within the tolerance of the trace, not on its pixel
    const nx = -(b.y - a.y) / tl, ny = (b.x - a.x) / tl;
    if ([-0.8, 0, 0.8].some(d => crossProfile(L, w, h, { x: R[k].x + d * nx, y: R[k].y + d * ny }, nx, ny, pxMm).contrast >= o.penContrast)) on++;
  }
  return on / R.length;
};

/**
 * Replace each trace by geometry, keep a form contour or a feature, drop the rest; join collinear pieces across short gaps.
 * `lines` [{ points: [{x, y, ...}] }]; ctx { L, w, h, pxMm, isFeature(x, y) }.
 * @returns { lines, stats } stats: fragments and mean curvature energy per stroke, before and after, and what was done
 */
export function geometrise(lines, ctx, o = GEOM_DEFAULTS) {
  const { L, w, h, pxMm } = ctx, tolPx = Math.max(0.5, o.tolMm / pxMm), out = [];
  const energy = ls => (ls.length ? ls.reduce((s, g) => s + curvatureEnergy(g.points, pxMm, o), 0) / ls.length : 0);
  const stats = { fragmentsBefore: lines.length, energyBefore: energy(lines), geometry: 0, kept: 0, droppedSquiggle: 0, offSource: 0, tooManyPieces: 0 };
  for (const g of lines) {
    const R = resample(g.points, 1); if (R.length < 2) continue;
    const mm = len(R) * pxMm, feature = ctx.isFeature?.(R[R.length >> 1].x, R[R.length >> 1].y);
    const prims = fitPrimitives(R, tolPx, o, pxMm);
    const supported = prims.every(p => share(p.pts, L, w, h, pxMm, o) >= o.supportShare);
    if (supported && prims.length <= Math.max(1, o.maxPiecesPerMm * mm)) {
      // the geometry the source shows: its primitives chained end to end
      const pts = []; for (const p of prims) pts.push(...(pts.length ? p.pts.slice(1) : p.pts));
      out.push({ ...g, points: resample(pts, 1) }); stats.geometry++; continue;
    }
    // smooth at the coarse reading, and not a fine zigzag that the coarse reading steps over
    const limit = (o.formDegPerMm * Math.PI / 180) ** 2;
    const smooth = mm >= o.formMm && curvatureEnergy(R, pxMm, o) <= limit && curvatureEnergy(R, pxMm, o, o.energyStepMm / 2) <= 4 * limit;
    if (smooth || feature) { out.push({ ...g, points: R }); stats.kept++; continue; }
    stats.droppedSquiggle++; if (!supported) stats.offSource++; else stats.tooManyPieces++;
  }
  const joined = joinCollinear(out, ctx, o);
  stats.fragmentsAfter = joined.length; stats.energyAfter = energy(joined);
  return { lines: joined, stats };
}

/** Join two lines only where their ends are within the gap, facing, and aimed along the line between them. */
export function joinCollinear(lines, { pxMm }, o = GEOM_DEFAULTS) {
  const gap = o.gapMm / pxMm, n = lines.length, used = new Set(), items = lines.map(g => ({ g, pts: g.points }));
  const dir = (pts, atEnd) => { const a = atEnd ? pts[Math.max(0, pts.length - 4)] : pts[Math.min(pts.length - 1, 3)], b = atEnd ? pts.at(-1) : pts[0], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
  const ends = []; items.forEach((it, i) => { ends.push({ i, tail: false, p: it.pts[0], t: dir(it.pts, false) }, { i, tail: true, p: it.pts.at(-1), t: dir(it.pts, true) }); });
  const pairs = [];
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const A = ends[a], B = ends[b]; if (A.i === B.i) continue;
    const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y, d = Math.hypot(dx, dy); if (d > gap) continue;
    const u = d > 1e-6 ? { x: dx / d, y: dy / d } : null;
    if (-(A.t.x * B.t.x + A.t.y * B.t.y) < o.joinCos) continue;
    if (u && (Math.min(A.t.x * u.x + A.t.y * u.y, -(B.t.x * u.x + B.t.y * u.y)) < o.joinAim)) continue;
    pairs.push({ a, b, d });
  }
  pairs.sort((p, q) => p.d - q.d);
  const taken = new Set(), links = new Map();
  for (const { a, b } of pairs) { if (taken.has(a) || taken.has(b)) continue; taken.add(a); taken.add(b); links.set(a, b); links.set(b, a); }
  const done = new Uint8Array(n), out = [];
  const idx = (i, tail) => 2 * i + (tail ? 1 : 0);
  for (let i = 0; i < n; i++) {
    if (done[i]) continue;
    const headFree = !taken.has(idx(i, false)), tailFree = !taken.has(idx(i, true));
    if (!headFree && !tailFree) continue;
    let cur = i, enter = headFree ? 'head' : 'tail', pts = [];
    while (cur != null && !done[cur]) {
      done[cur] = 1; const seg = enter === 'head' ? items[cur].pts : [...items[cur].pts].reverse();
      pts.push(...seg);
      const nxt = links.get(idx(cur, enter === 'head'));
      if (nxt == null) break; cur = ends[nxt].i; enter = ends[nxt].tail ? 'tail' : 'head';
    }
    out.push({ ...items[i].g, points: pts });
  }
  for (let i = 0; i < n; i++) if (!done[i]) out.push(items[i].g);
  return out;
}
