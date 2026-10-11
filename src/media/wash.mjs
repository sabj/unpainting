// What a painter does to a wash that a fill cannot do: takes the brush round the lights, and softens part of
// the wet edge before the sheet dries. The solver is the one in sheet.mjs; nothing here draws anything.
//
// Why a wash needs a second action at all. A wash laid on dry paper is pinned everywhere the brush stopped:
// the contact line sticks on the fibres, water evaporates fastest within a cell or two of it (Deegan et al.,
// Nature 1997), and the flow that replaces what evaporates carries pigment out to the rim. Every side of the
// shape dries the same way, so every side reads hard and every side carries a rim. Real sheets are not like
// that: about half a shape's perimeter is hard and about a quarter is lost, on the same shape.
//
// The painter's move is one stroke. Rinse the brush, squeeze it damp, draw it once along the part of the wet
// edge that should go. A damp brush has no free liquid, so it leaves no standing film: its water goes into
// the pores just outside the line. The contact line then meets damp paper instead of dry sized paper, the front
// creeps out onto the damp band, and the pigment that travels with it goes mostly through the pores, where
// the fibres filter a share of it at every step. The tone falls away instead of stopping. It is the same
// pinned contact line with the same pigment mobility; only how wet the paper is has changed.
// DOM free.
import { contours, loopSignedArea } from '../raster.js';
import { createBrush, dip, stroke } from './brush.mjs';
import { step, DEFAULTS } from './sheet.mjs';
import { gradRows, tensorRows } from './flow-kernel.mjs';

/** A mop's sweeps down a shape: one path per connected strip of each scanline run, so a broad wash is a
 *  handful of sweeps rather than an outline and a hatch. Splitting where a run splits is how the brush goes
 *  round a reserve: the strip parts at the light and rejoins past it, and the brush never crosses it. */
export function washPaths(mask, w, h, { pad = 3, padShare = 0, minRadius = 2, minLength = 6, box = null } = {}) {
  // `box` [x0, y0, x1, y1]: the scan is limited to a box that holds every set cell. Rows outside it
  // have no runs and a column outside it no cells, so the paths are the same.
  const [bx0, by0, bx1, by1] = box ?? [0, 0, w - 1, h - 1];
  const paths = []; let previous = [];
  for (let y = by0; y <= by1; y++) {
    const next = [];
    for (let x = bx0; x <= bx1; x++) {
      if (!mask[y * w + x]) continue;
      const left = x; while (x + 1 <= bx1 && mask[y * w + x + 1]) x++;
      // The pad keeps the brush off the shape's edge so it does not cross it. A fixed pad on a narrow run is most of
      // the run: five cells wide less a cell and a half each side is a brush that reaches two of the five.
      // padShare makes it a share of the half-width, never more than pad.
      const half = (x - left + 1) / 2, right = x, r = half - (padShare > 0 ? Math.min(pad, padShare * half) : pad);
      if (r < minRadius) continue;
      const cx = (left + right + 1) / 2;
      const candidates = previous.filter(v => !v.used && Math.min(v.right, right) - Math.max(v.left, left) > 0);
      candidates.sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
      const old = candidates[0], pts = old ? old.pts : [];
      if (old) old.used = true; else paths.push(pts);
      pts.push({ x: cx, y: y + 0.5, r, p: 1 }); next.push({ x: cx, left, right, pts });
    }
    previous = next;
  }
  return paths.filter(pts => pts.length > minLength);
}

// The outward normal at a boundary vertex: the tangent turned a quarter, then flipped if it points into the
// shape. Reading the mask beats trusting a winding rule, since marching squares emits holes the other way.
function outward(loop, j, mask, w, h) {
  const n = loop.length, a = loop[(j - 1 + n) % n], b = loop[(j + 1) % n];
  let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
  let nx = ty, ny = -tx;
  const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); return xi < 0 || yi < 0 || xi >= w || yi >= h ? 0 : mask[yi * w + xi]; };
  const p = loop[j];
  if (at(p.x + 2 * nx, p.y + 2 * ny) && !at(p.x - 2 * nx, p.y - 2 * ny)) { nx = -nx; ny = -ny; }
  return { nx, ny };
}

const circularSmooth = (v, r) => {
  const n = v.length, o = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { s += v[(i + k + n * 2) % n]; c++; } o[i] = s / c; }
  return o;
};
const quantileOf = (v, q) => { const a = Float64Array.from(v).sort(); const i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };

/** The runs of a shape's outline the painter would lose, as arcs of points with their outward normals.
 *  `want(x, y, nx, ny)` scores a boundary point: higher means readier to go, and a negative score means
 *  never (a reserved light is next to it, and water run into it would take the light with it). The share is
 *  of each loop's length, so every shape keeps both kinds of edge instead of one shape going soft entirely. */
export function softArcs(mask, w, h, want, { share = 0.4, minRun = 14, minLoop = 48, smooth = 9 } = {}) {
  const arcs = [];
  for (const loop of contours(mask, w, h)) {
    if (loop.length < minLoop || loopSignedArea(loop) <= 0) continue;
    const norms = loop.map((_, j) => outward(loop, j, mask, w, h));
    const raw = loop.map((p, j) => want(p.x, p.y, norms[j].nx, norms[j].ny));
    const scored = circularSmooth(raw, Math.min(smooth, Math.floor(loop.length / 4)));
    // Forbidden stretches keep their veto after smoothing, so a light never has water run into it.
    for (let j = 0; j < raw.length; j++) if (raw[j] < 0) scored[j] = -1;
    const open = scored.filter(v => v >= 0);
    if (open.length < minRun) continue;
    const cut = quantileOf(open, 1 - share * (loop.length / Math.max(1, open.length)));
    const take = scored.map(v => (v >= 0 && v >= cut ? 1 : 0));
    // Walk the loop once from a point that is not being softened, so a run is never cut in half by the seam.
    let start = take.indexOf(0); if (start < 0) start = 0;
    let run = [];
    for (let k = 0; k <= loop.length; k++) {
      const j = (start + k) % loop.length;
      if (k < loop.length && take[j]) { run.push({ ...loop[j], nx: norms[j].nx, ny: norms[j].ny }); continue; }
      if (run.length >= minRun) arcs.push(run);
      run = [];
    }
  }
  return arcs;
}

/** One damp brush drawn along an arc of the wet edge. It straddles the contact line, held a little outside
 *  it: the hairs on the wash side find water already there and take a little back, the hairs outside leave
 *  their film on dry paper, where the pores drink all of it. Nothing stands, so nothing is painted, and the
 *  wash does the rest itself. How far the tone then falls away is set by how wide the damp band is, which is
 *  why the brush is sized against the shape rather than against the line. */
function softenEdge(sheet, arc, { radius = 10, water = 1, free = 0.4, wetness = 0.9, film = 0.25, seed = 17, offset = radius * 0.5 } = {}) {
  const b = createBrush({ flat: true, radius, bristles: Math.max(10, Math.ceil(radius * 2)),
    // A hair with liquid above `free` gives water; below it, it drinks from water it finds. Set free above
    // the load and the brush is damp: it lays a film the pores drink and nothing stands. Set it below and
    // the brush is charged: it lays clean water that stands deeper than the wash's own thinning edge, and
    // the levelling then runs inward. That is the difference between a wash that creeps out at its own
    // strength and one whose pigment has to cross the band by diffusion, arriving weaker the further it goes.
    capacity: 24, belly: 3, feed: 0.25, free, wetness, film, splay: 0, stiffness: 6, streak: 0.2, breakup: 0.8, seed });
  dip(b, { water, conc: new Array(sheet.K).fill(0) });
  const path = arc.map(p => ({ x: p.x + p.nx * offset, y: p.y + p.ny * offset, p: 1, r: radius }));
  const was = sheet.wetting; sheet.wetting = 1;
  stroke(b, sheet, path);
  sheet.wetting = was;
  return path.length;
}

/** Soften the chosen arcs and let the wash run out onto them before anything dries it. The creep is slow
 *  next to the brushwork and fast next to the drying, so it needs its own quiet interval. */
export function soften(sheet, arcs, o = DEFAULTS, { radius = 10, water = 1, free = 0.4, film = 0.25, offset, seed = 17, settle = 150, dt = 0.4 } = {}) {
  let n = 0;
  for (const arc of arcs) { softenEdge(sheet, arc, { radius, water, free, film, offset, seed: seed + n }); n++; }
  if (n) for (let t = 0; t < settle; t++) if (!step(sheet, { ...o, dt })) break;
  return n;
}

/** Orient sweeps along the passage to avoid horizontal banding.
 * Long shapes use their major axis; round shapes use the source structure.
 * @param field Optional source field for structure-guided direction. Without it, use the shape's major axis. */
export function directedWashPaths(mask, w, h, opts = {}) {
  const { field = null, minElongation = 1.35, fallbackAngle = null, jitter = 0, angle: given = null } = opts;
  // A passage with no direction of its own takes fallbackAngle, the way the hand happens to take it, so such passages
  // do not all run parallel like an inkjet printer's lanes. `angle` is a direction the
  // caller has already chosen: a graded wash runs down its own gradient (gradientSweepAngle).
  // the mask's bounding box, once: the angle, the rotation and the scan read only inside it
  let mx0 = w, my0 = h, mx1 = -1, my1 = -1;
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) if (mask[row + x]) { if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; } }
  if (mx1 < 0) return [];
  const mbox = [mx0, my0, mx1, my1];
  let angle = given ?? sweepAngle(mask, field, w, h, minElongation, mbox);
  if (given == null && Math.abs(angle) < 1e-3 && fallbackAngle != null) angle = fallbackAngle;
  // Vary neighboring passage angles to prevent aligned lanes.
  angle += jitter;
  if (Math.abs(angle) < 1e-3) return washPaths(mask, w, h, { ...opts, box: mbox });

  // rotate into the passage's own frame, band it there, and bring the paths back. Rotating the picture rather than
  // writing a second scanner keeps one implementation of what a band is.
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const cx = w / 2, cy = h / 2;
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => [(x - cx) * cos - (y - cy) * sin, (x - cx) * sin + (y - cy) * cos]);
  const rw = Math.ceil(Math.max(...corners.map(c => c[0])) - Math.min(...corners.map(c => c[0]))) + 2;
  const rh = Math.ceil(Math.max(...corners.map(c => c[1])) - Math.min(...corners.map(c => c[1]))) + 2;
  const rot = new Uint8Array(rw * rh);
  const back = (rx, ry) => {
    const ux = rx - rw / 2, uy = ry - rh / 2;
    return [ux * cos + uy * sin + cx, -ux * sin + uy * cos + cy];
  };
  // only the rotated cells whose centres can land in the mask's box (its corners taken forward into the rotated frame,
  // widened by 3 cells for the rounding); every other rotated cell reads a mask cell outside the box, which is 0
  const fwd = (x, y) => { const dx = x - cx, dy = y - cy; return [dx * cos - dy * sin + rw / 2, dx * sin + dy * cos + rh / 2]; };
  const rc = [[mx0, my0], [mx1 + 1, my0], [mx0, my1 + 1], [mx1 + 1, my1 + 1]].map(([x, y]) => fwd(x, y));
  const RX0 = Math.max(0, Math.floor(Math.min(...rc.map(c => c[0]))) - 3), RX1 = Math.min(rw - 1, Math.ceil(Math.max(...rc.map(c => c[0]))) + 3);
  const RY0 = Math.max(0, Math.floor(Math.min(...rc.map(c => c[1]))) - 3), RY1 = Math.min(rh - 1, Math.ceil(Math.max(...rc.map(c => c[1]))) + 3);
  for (let ry = RY0; ry <= RY1; ry++) for (let rx = RX0; rx <= RX1; rx++) {
    const ux = rx + 0.5 - rw / 2, uy = ry + 0.5 - rh / 2;
    const x = ux * cos + uy * sin + cx, y = -ux * sin + uy * cos + cy;
    const xi = Math.round(x - 0.5), yi = Math.round(y - 0.5);
    if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi]) rot[ry * rw + rx] = 1;
  }
  return washPaths(rot, rw, rh, { ...opts, box: [RX0, RY0, RX1, RY1] }).map(pts => pts.map(p => {
    const [x, y] = back(p.x, p.y);
    return { ...p, x, y };
  }));
}

/**
 * How far to turn the picture so that the direction the sweeps should run comes out vertical, because washPaths
 * chains its runs down the sheet. So this returns the direction to sweep, less a quarter turn.
 */
export function sweepAngle(mask, field, w, h, minElongation = 1.35, box = null) {
  // `box`: a box holding every set cell; the sums visit the same cells in the same order
  const [bx0, by0, bx1, by1] = box ?? [0, 0, w - 1, h - 1];
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = 0;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (mask[y * w + x]) { sx += x; sy += y; n++; }
  if (n < 12) return 0;
  const mx = sx / n, my = sy / n;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (mask[y * w + x]) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  sxx /= n; sxy /= n; syy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, root = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const big = tr / 2 + root, small = Math.max(1e-9, tr / 2 - root);

  // a passage long enough to have a length is swept along it
  if (big / small >= minElongation * minElongation) {
    let ax, ay;
    if (Math.abs(sxy) > 1e-12) { ax = sxy; ay = big - sxx; }
    else if (sxx >= syy) { ax = 1; ay = 0; }
    else { ax = 0; ay = 1; }
    return Math.atan2(ay, ax) - Math.PI / 2;           // the passage's length, turned to vertical
  }

  // otherwise follow what the picture does inside it: the direction its gradients least disagree with
  if (!field) return 0;
  let gxx = 0, gxy = 0, gyy = 0;
  for (let y = Math.max(1, by0); y <= Math.min(h - 2, by1); y++) for (let x = Math.max(1, bx0); x <= Math.min(w - 2, bx1); x++) {
    if (!mask[y * w + x]) continue;
    const gx = (field[y * w + x + 1] - field[y * w + x - 1]) / 2, gy = (field[(y + 1) * w + x] - field[(y - 1) * w + x]) / 2;
    gxx += gx * gx; gxy += gx * gy; gyy += gy * gy;
  }
  const t2 = gxx + gyy;
  if (t2 < 1e-9) return 0;
  const r2 = Math.sqrt(Math.max(0, (gxx - gyy) * (gxx - gyy) / 4 + gxy * gxy)), b2 = t2 / 2 + r2, s2 = t2 / 2 - r2;
  if (b2 < 1e-9 || (b2 - s2) / b2 < 0.25) return 0;        // no direction worth following
  // Along the structure is across its strongest gradient. The eigenvector has to handle the axis-aligned case: with
  // stripes running straight down the sheet the cross term is zero and atan2(0, 0) is 0, so the one direction easiest
  // to see by eye came back as no direction at all.
  let ex, ey;
  if (Math.abs(gxy) > 1e-12) { ex = gxy; ey = b2 - gxx; }
  else if (gxx >= gyy) { ex = 1; ey = 0; }
  else { ex = 0; ey = 1; }
  const em = Math.hypot(ex, ey) || 1;
  return Math.atan2(ex / em, -ey / em) - Math.PI / 2;     // along the structure, turned to vertical
}

/**
 * The turn that brings a field's strongest gradient inside a mask to vertical, so the sweeps run down the gradient.
 * null where the field has no direction.
 *
 * A graded wash is charged afresh every few cells along its sweep (tools/paint-plate.mjs), so the charge can only follow
 * a gradient the sweep runs along. The passage's own shape decides the sweep otherwise, and a sky is wider than it is
 * tall: its lanes ran level, each lane at one strength, which lays the ramp as a staircase of lane-wide steps.
 */
export function gradientSweepAngle(field, mask, w, h) {
  let gxx = 0, gxy = 0, gyy = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) continue;
    const gx = (field[i + 1] - field[i - 1]) / 2, gy = (field[i + w] - field[i - w]) / 2;
    gxx += gx * gx; gxy += gx * gy; gyy += gy * gy;
  }
  const t2 = gxx + gyy;
  if (t2 < 1e-12) return null;
  const r2 = Math.sqrt(Math.max(0, (gxx - gyy) * (gxx - gyy) / 4 + gxy * gxy)), b2 = t2 / 2 + r2;
  let ex, ey;
  if (Math.abs(gxy) > 1e-12) { ex = gxy; ey = b2 - gxx; }
  else if (gxx >= gyy) { ex = 1; ey = 0; }
  else { ex = 0; ey = 1; }
  return Math.atan2(ey, ex) - Math.PI / 2;
}

/** Cover the passage with overlapping sweeps capped at a physical brush size.
 * Sweeps follow the passage with varying width to avoid uniform horizontal bands.
 * @param maxRadius Maximum brush radius, in cells. */
export function brushedWashPaths(mask, w, h, { maxRadius = 14, overlap = 0.15, field = null, wobble = 0.16, seed = 1, flow = null, walk = true, ...rest } = {}) {
  // the flow field is read only by walkLane: built only when the sweeps are walked, and once per field (the floor brush
  // plans a passage up to eight times over the same field while its budget grows the brush)
  const F = flow ?? (field && walk ? cachedFlowField(field, w, h) : null);
  const base = directedWashPaths(mask, w, h, { ...rest, field });
  let s = (seed | 0) || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = [];
  for (const pts of base) {
    const widest = Math.max(...pts.map(p => p.r));
    // A lane whose brush is as wide as its passage has only the pad to wander in: its radius is the passage's half-width
    // less the pad, so drifting further puts the brush over the edge, and containPaths then narrows it to fit. Nothing
    // turns a walk back towards its centre, so a wider drift would hold a lane off centre for its whole length.
    if (widest <= maxRadius) { out.push(breathe(walk ? walkLane(pts, field, w, h, { rnd, radius: widest, flow: F, maxDrift: rest.pad ?? 3 }) : pts, widest, rnd, wobble)); continue; }
    // how many sweeps of the biggest brush it takes, and where their centres sit across the passage
    const step = maxRadius * 2 * (1 - overlap);
    const lanes = Math.max(2, Math.ceil((widest * 2) / step));
    for (let k = 0; k < lanes; k++) {
      const across = -widest + maxRadius + k * ((2 * widest - 2 * maxRadius) / Math.max(1, lanes - 1));
      const lane = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        // across the sweep's own direction, so a turned passage stays covered
        let dx = q.x - o.x, dy = q.y - o.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
        const nx = -dy, ny = dx;
        const reach = Math.min(maxRadius, Math.max(1, p.r - Math.abs(across) * 0.25));
        lane.push({ ...p, x: p.x + nx * across, y: p.y + ny * across, r: reach });
      }
      // The outermost lanes carry the passage's edge, so they are held to the pad as a lone lane is, or a strip along
      // the edge is left pale (--outerdrift, in cells; negative lets them wander like the inner lanes).
      const outer = k === 0 || k === lanes - 1, od = rest.outerDrift ?? rest.pad ?? 3;
      out.push(breathe(walk ? walkLane(lane, field, w, h, { rnd, radius: maxRadius, flow: F, maxDrift: outer && od >= 0 ? od : null }) : lane, maxRadius, rnd, wobble));
    }
  }
  return out;
}

/** Follow the passage's local direction with momentum and small directional variation.
 * The field supplies the direction; gradual turns avoid rigid parallel lanes. */
/**
 * The direction the picture runs at every cell, and how strongly, worked out once for a passage.
 *
 * A five by five structure tensor at every step of every sweep costs more than the fluid simulation it feeds. The
 * field does not change while a passage is being painted, so it is built once and read.
 */
export function flowField(field, w, h) {
  // A passage's field is zero outside the passage, and a zero field has no gradient and no direction, so only the rows
  // within reach of a nonzero one (one for the gradient, two more for the five by five tensor) can differ from zero.
  let r0 = -1, r1 = -1;
  for (let y = 0; y < h && r0 < 0; y++) { const b = y * w; for (let x = 0; x < w; x++) if (field[b + x] !== 0) { r0 = y; break; } }
  if (r0 >= 0) for (let y = h - 1; y >= r0 && r1 < 0; y--) { const b = y * w; for (let x = 0; x < w; x++) if (field[b + x] !== 0) { r1 = y; break; } }
  const n = w * h;
  if (r0 < 0) return { fx: new Float32Array(n), fy: new Float32Array(n), coh: new Float32Array(n) };
  const rng = { glo: Math.max(1, r0 - 1), ghi: Math.min(h - 2, r1 + 1), tlo: Math.max(2, r0 - 3), thi: Math.min(h - 3, r1 + 3) };
  const par = FLOW_THREADS && FLOW_THREADS(field, w, h, rng);
  if (par) return par;
  const fx = new Float32Array(n), fy = new Float32Array(n), coh = new Float32Array(n);
  const gx = new Float32Array(n), gy = new Float32Array(n);
  gradRows(field, w, gx, gy, rng.glo, rng.ghi);
  tensorRows(gx, gy, w, fx, fy, coh, rng.tlo, rng.thi);
  return { fx, fy, coh };
}
// flowField for the same field array (and size) is the same field: kept while the array lives
const FLOW_CACHE = new WeakMap();
function cachedFlowField(field, w, h) {
  const hit = FLOW_CACHE.get(field);
  if (hit && hit.w === w && hit.h === h) return hit.F;
  const F = flowField(field, w, h); FLOW_CACHE.set(field, { w, h, F }); return F;
}
// the thread pool's banded version (sheet-par.mjs), the same arithmetic per cell; it returns null where it declines
let FLOW_THREADS = null;
export const useFlowThreads = f => { FLOW_THREADS = f; };

function walkLane(pts, field, w, h, { turn = 0.3, wander = 0.05, rnd, radius, flow: cached = null, maxDrift = null }) {
  maxDrift = maxDrift ?? Math.max(1.5, radius * 0.7);
  if (!field || pts.length < 3) return pts;
  const at = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))); return field[yi * w + xi]; };
  const F = cached ?? flowField(field, w, h);
  const flow = (x, y) => {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))), i = yi * w + xi;
    return F.coh[i] > 1e-6 ? { x: F.fx[i], y: F.fy[i], coherence: F.coh[i] } : null;
  };

  const out = [pts[0]];
  let x = pts[0].x, y = pts[0].y;
  let dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
  const step = Math.hypot(dx, dy) || 1; dx /= step; dy /= step;
  for (let i = 1; i < pts.length; i++) {
    const f = flow(x, y);
    if (f) {
      let tx = f.x, ty = f.y;
      if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
      const pull = turn * f.coherence;
      let nx = dx + (tx - dx) * pull, ny = dy + (ty - dy) * pull;
      const a = (rnd() * 2 - 1) * wander, c = Math.cos(a), sn = Math.sin(a);
      [nx, ny] = [nx * c - ny * sn, nx * sn + ny * c];
      const m = Math.hypot(nx, ny) || 1; dx = nx / m; dy = ny / m;
    }
    x += dx * step; y += dy * step;
    // A sweep paints the passage it was given and no other, so forms do not run into each other. It may drift within
    // the passage and is pulled back gently when it reaches the edge; snapping it back would leave white tracks.
    const drift = Math.hypot(x - pts[i].x, y - pts[i].y);
    if (drift > maxDrift || at(x, y) <= 0) {
      const back = Math.min(1, (drift - maxDrift) / Math.max(1e-6, maxDrift) + (at(x, y) <= 0 ? 1 : 0));
      x += (pts[i].x - x) * Math.min(1, back); y += (pts[i].y - y) * Math.min(1, back);
      // and it takes the lane's own direction again, rather than carrying on the way that took it out
      dx = pts[Math.min(pts.length - 1, i + 1)].x - pts[Math.max(0, i - 1)].x;
      dy = pts[Math.min(pts.length - 1, i + 1)].y - pts[Math.max(0, i - 1)].y;
      const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    }
    out.push({ ...pts[i], x, y });
  }
  return out;
}

/** A brush bends and lifts as it runs, so its width is not constant down a stroke. */
function breathe(pts, radius, rnd, amount) {
  if (!amount) return pts;
  const phase = rnd() * Math.PI * 2, rate = 0.6 + rnd() * 1.4, tilt = (rnd() - 0.5) * amount;
  return pts.map((p, i) => {
    const u = i / Math.max(1, pts.length - 1);
    const breath = 1 + amount * Math.sin(phase + u * Math.PI * rate) + tilt * (u - 0.5) * 2;
    return { ...p, r: Math.max(0.6, p.r * breath) };
  });
}

/**
 * The share of a passage's cells that lie on an edge its wash can run past: next to paper outside the passage, not
 * against the border of the sheet. A wet wash loses what runs past such an edge, so this is how exposed a passage is to
 * that loss; a swatch of 50 cells in the middle of scrap has 0.078, a sky taking the top half of a sheet about a tenth
 * of that.
 */
export function openEdgeShare(mask, w, h) {
  let area = 0, open = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    area++;
    if ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w])) open++;
  }
  return area ? open / area : 0;
}

/**
 * Where clean water goes before a graded wash: the passage, and up to `reach` cells past it onto paper the source
 * holds no darker than the passage's own pale end (its lightest tenth, plus `margin` of density). The water runs the
 * foot of the wash out into damp paper so it fades; it stops short of anything darker beside the passage, whose edge
 * against it is real and would bleed. It grows a cell at a time through pale paper only, so it does not step over a
 * dark line onto the paper beyond it.
 *
 * @param D source density per cell
 */
export function prewetArea(mask, D, w, h, { reach = 6, margin = 0.05 } = {}) {
  const inside = []; for (let i = 0; i < mask.length; i++) if (mask[i]) inside.push(D[i]);
  if (!inside.length || reach <= 0) return mask;
  inside.sort((a, b) => a - b);
  const pale = inside[Math.floor(inside.length * 0.1)] + margin;
  let out = Uint8Array.from(mask);
  for (let r = 0; r < reach; r++) {
    const next = Uint8Array.from(out);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (out[i] || D[i] > pale) continue;
      if ((x > 0 && out[i - 1]) || (x < w - 1 && out[i + 1]) || (y > 0 && out[i - w]) || (y < h - 1 && out[i + w])) next[i] = 1;
    }
    out = next;
  }
  return out;
}

/** Estimate mean sweep overlap per cell.
 * Divide the passage charge by this factor so overlapping lanes do not multiply the paint load. */
export function sweepCover(paths, mask, w, h) {
  let under = 0, cells = 0;
  for (let i = 0; i < w * h; i++) cells += mask[i] ? 1 : 0;
  if (!cells) return 0;
  for (const pts of paths) under += countUnder(pts, mask, w, h);
  return under / cells;
}

// eachCellUnder's cells that are in `mask`, counted: the same cells by the same test, with each disc row walked only over
// the columns its radius can reach and one stamp buffer reused across sweeps instead of a fresh one per sweep
let STAMP = new Int32Array(0), STAMP_ID = 0;
function countUnder(pts, mask, w, h) {
  if (!pts.length) return 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q.x - q.r); y0 = Math.min(y0, q.y - q.r); x1 = Math.max(x1, q.x + q.r); y1 = Math.max(y1, q.y + q.r); }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(w - 1, Math.ceil(x1) + 1); y1 = Math.min(h - 1, Math.ceil(y1) + 1);
  if (!(x1 >= x0 && y1 >= y0)) return 0;
  const bw = x1 - x0 + 1, size = bw * (y1 - y0 + 1);
  if (STAMP.length < size) { STAMP = new Int32Array(Math.max(size, 2 * STAMP.length)); STAMP_ID = 0; }
  if (++STAMP_ID === 2147483647) { STAMP.fill(0); STAMP_ID = 1; }
  const id = STAMP_ID, seen = STAMP;
  let under = 0;
  for (const q of pts) {
    const R = Math.ceil(q.r), rr = q.r * q.r, ax = q.x - 0.5, ay = q.y - 0.5;
    for (let dy = -R; dy <= R; dy++) {
      const y = Math.round(ay + dy);
      if (y < y0 || y > y1) continue;
      // the columns with dx * dx + dy * dy <= r * r: a run about zero, found by the same comparison
      let m = R; while (m >= 0 && m * m + dy * dy > rr) m--;
      if (m < 0) continue;
      const row = (y - y0) * bw, srow = y * w;
      for (let dx = -m; dx <= m; dx++) {
        const x = Math.round(ax + dx);
        if (x < x0 || x > x1) continue;
        const k = row + (x - x0);
        if (seen[k] !== id) { seen[k] = id; if (mask[srow + x]) under++; }
      }
    }
  }
  return under;
}

/**
 * How many sweeps lie over each cell: sweepCover's count, kept per cell.
 *
 * A graded wash (tools/paint-plate.mjs, --gradedwash) is charged cell by cell along each sweep, and a wet on wet sweep
 * over paper another sweep has already wetted lays its pigment again into the standing water, so a cell under four
 * sweeps gets four charges. Folded passages are big and ragged, so their cells sit under several sweeps each.
 */
export function sweepCount(paths, w, h) {
  const count = new Uint16Array(w * h);
  for (const pts of paths) eachCellUnder(pts, w, h, i => { if (count[i] < 65535) count[i]++; });
  return count;
}

/** Every cell one sweep's brush passes over, once each. Per path, only over its own bounding box: a whole-sheet buffer
 *  per sweep cost a billion cell visits at 420. */
function eachCellUnder(pts, w, h, visit) {
  if (!pts.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q.x - q.r); y0 = Math.min(y0, q.y - q.r); x1 = Math.max(x1, q.x + q.r); y1 = Math.max(y1, q.y + q.r); }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(w - 1, Math.ceil(x1) + 1); y1 = Math.min(h - 1, Math.ceil(y1) + 1);
  if (!(x1 >= x0 && y1 >= y0)) return;       // a sweep wholly off the sheet covers nothing (and a NaN radius is off it)
  const bw = x1 - x0 + 1, seen = new Uint8Array(bw * (y1 - y0 + 1));
  for (const q of pts) {
    const R = Math.ceil(q.r), rr = q.r * q.r, ax = q.x - 0.5, ay = q.y - 0.5;
    for (let dy = -R; dy <= R; dy++) {
      const y = Math.round(ay + dy);
      if (y < y0 || y > y1) continue;
      let m = R; while (m >= 0 && m * m + dy * dy > rr) m--;
      for (let dx = -m; dx <= m; dx++) {
        const x = Math.round(ax + dx);
        if (x < x0 || x > x1) continue;
        const k = (y - y0) * bw + (x - x0);
        if (!seen[k]) { seen[k] = 1; visit(y * w + x); }
      }
    }
  }
}

/** Clamp brush radius to the distance from the passage edge to preserve reserved lights.
 * Cut paths where the radius falls below minRadius and discard short fragments.
 * @param dist Distance to the nearest cell outside the passage, from raster.distanceToZero. */
export function containPaths(paths, dist, w, h, { minRadius = 1, minLength = 3, slack = 0.5, segments = false, floor = 0 } = {}) {
  const at = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.floor(x))), yi = Math.min(h - 1, Math.max(0, Math.floor(y))); return dist[yi * w + xi]; };
  // floor (cells): a loaded wash brush is not narrowed below this, even where the
  // passage is narrower; it spills past the edge the way a real wash does instead of tapering to a hair. 0 = off.
  // floor may also be a function (x, y) -> cells, so it can apply in part of the sheet only; where it returns 0
  // the point is contained exactly as without a floor.
  if (typeof floor === 'function' || floor > 0) {
    const fAt = typeof floor === 'function' ? floor : () => floor;
    const out = [];
    for (const pts of paths) {
      let run = [];
      for (const p of pts) {
        const f = fAt(p.x, p.y), r0 = Math.min(p.r, at(p.x, p.y) - slack);
        if (f > 0) { run.push({ ...p, r: Math.max(r0, Math.min(p.r, f)) }); continue; }
        if (r0 >= minRadius) run.push({ ...p, r: r0 });
        else { if (run.length > minLength) out.push(run); run = []; }
      }
      if (run.length > minLength) out.push(run);
    }
    return out;
  }
  // --firstwash: a sweep is held to its passage along its segments too, so a lane whose points jump across a notch in
  // the passage (a head over the shoulders) does not paint the paper between (src/paint/methods/first-wash.mjs). A
  // segment that leaves the passage anywhere ends the run.
  const leaves = (a, b) => {
    const m = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let t = 1; t < m; t++) if (at(a.x + (b.x - a.x) * t / m, a.y + (b.y - a.y) * t / m) - slack < minRadius) return true;
    return false;
  };
  const out = [];
  for (const pts of paths) {
    let run = [];
    for (const p of pts) {
      const r = Math.min(p.r, at(p.x, p.y) - slack);
      if (segments && run.length && r >= minRadius && leaves(run[run.length - 1], p)) { if (run.length > minLength) out.push(run); run = []; }
      if (r >= minRadius) run.push({ ...p, r });
      else { if (run.length > minLength) out.push(run); run = []; }
    }
    if (run.length > minLength) out.push(run);
  }
  return out;
}
