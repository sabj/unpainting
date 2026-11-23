// The section brush (brush model 'section'): a tuft with a spine that lies on the paper, and one film law for what
// passes between the tuft and the paper. BRUSH-PHYSICS.md stages S1 (units and the transfer law) and S2 (tuft geometry).
//
// Geometry. The tuft is a chain of TUFT.sections points on the paper, from where it first touches (at the hand) back to
// the tip. Pressure lays more of it down: the share of the tuft in contact grows from nothing (the tip alone) to cMax,
// and the chain's length with it. The chain is towed: each point follows the one before it at the segment length, so the
// tip trails the hand and swings round a turn late, as a tractrix does. A round is a cone of circles along the chain,
// widest at the belly and coming to a point at the tip; a flat is a blade held at an angle to the path, swept along
// the chain. Footprint cells are covered by their distance to that shape, so an edge is antialiased and never stepped.
//
// Liquid. Every amount is physical: a lane's water in the legacy hair units times kappa is mm^3, a cell's depth times its
// area (mm^2) is mm^3, and time is the distance the hand moved over its speed (mm/s). The tuft has a head, the depth of
// liquid it stands its film at: proportional to its free liquid above the retention share, and negative (it sucks)
// below it. The paper's head is its standing water. Over a contact of length dt the two films level at a rate set by
// pressure, and a dry sheet's pores pull through the sizing where no film stands. The same law lays a loaded brush's
// film on dry paper, pours paint into a wet wash, lets a damp clean brush lift a wet wash, and leaves a nearly dry brush's
// paint only where the pores pull it, on the tooth it reaches. Films in contact also trade equal volumes, so colours
// merge even where the two heads are level.
import { soak, deposit, depositDry } from './sheet.mjs';
import { SIZING } from './sizing.mjs';

export const REF_MM = 280 / 1086;          // the cell the legacy per-cell brush numbers were tuned at, mm
export const TUFT = Object.freeze({
  sections: 6,
  speed: 60,          // mm/s: the hand's speed when a stroke gives none
  rate: 30,           // 1/s: how fast the tuft's film and the paper's level at full pressure
  suck: 0.6,          // head (depth) of a bone-dry tuft
  pore: 0.15,         // head of a dry sheet's pores, through the sizing
  poreFilm: 0.03,     // mm: a standing film this deep keeps the tuft off the pores (1/e), the sheet's own film depth
  refSpeed: 60,       // the hand speed the legacy per-step feed was tuned at, mm/s
  wick: 60,           // 1/s: the slowest the belly refills the tips by capillary flow
  keep: 0.5,          // a tuft's retention share, of the legacy free threshold
  mix: 0.25,          // the share of the film under the hairs that the moving hairs stir into their own (the rest only levels)
  creep: 0.8,         // the share of a press's growth the tuft's tip slides out by (the rest it bows)
  // mm: the film a fully loaded tuft stands on dry sized paper, times the brush's wetness (0.9 by default, so 0.2 mm).
  // A loaded wash brush leaves 0.1 to 0.25 mm of liquid (100 to 250 g of water a square metre) with a bead at its
  // trailing edge; a puddle poured or flooded on stands deeper (0.3 mm and more). This was the wetness itself read as
  // millimetres (0.9 mm), so a five-sweep square stood 0.75 mm deep, two and a half times the poured puddle, and dried
  // with a heavy outline (rim 2.4 over interior; real brushed washes 1.03 to 1.29). The rim follows from it: the
  // thinner film loses more of its water to the pores, where the pinned edge's flow cannot carry its pigment.
  head: 0.22,
});

// The tuft's proportions, in belly half-widths (R): its length, the most of it pressure lays down, where the belly is
// (share of the length from the ferrule), and for a flat the blade's half-thickness.
export const tuftShape = flat => (flat ? { length: 2.4, cMax: 0.35, belly: 0, thick: 0.12 } : { length: 4.5, cMax: 0.62, belly: 0.45, thick: 0 });

/** The share of the tuft's length in contact at pressure p. */
export const contactShare = (shape, p) => (p > 0 ? shape.cMax * Math.min(1.2, p) ** 0.85 : 0);

/** A round tuft's half-width at s (0 at the ferrule, 1 at the tip), as a share of the belly's. */
export function roundProfile(s, belly = 0.45) {
  if (s <= belly) return 0.8 + 0.2 * (s / belly);
  return Math.max(0.03, (1 - s) / (1 - belly));
}

/** mm^3 per unit of lane water. A metered brush (loadWater) was loaded in mm^3 / mmPerCell^2; a legacy brush's
 *  capacity was tuned at REF_MM cells, with hair counts in proportion to its radius in cells, so its volume in mm^3 is
 *  its legacy total times mmPerCell x REF_MM whatever the cell. */
export const kappaOf = (brush, mmPerCell) => (brush.loadWater > 0 ? mmPerCell * mmPerCell : mmPerCell * REF_MM);

/** The head (depth) of a lane at saturation sat: the film it stands with free liquid above the retention share `free`, or
 *  its suction below it. */
export function headOf(sat, free, Hb, suck = TUFT.suck) {
  // A tuft holds its film near full head while it has liquid to spare and loses it fast as the last of it goes: its
  // capillary pressure curve is flat over most of the load (1 - (1 - x)^3 of the free share x).
  return sat >= free ? Hb * (1 - (1 - Math.min(1, (sat - free) / Math.max(1e-6, 1 - free))) ** 3) : suck * (sat - free) / Math.max(1e-6, free);
}

/** Feed rate (1/s) from the legacy per-step feed share, no slower than a tuft wicks (TUFT.wick). */
export const feedRate = feed => Math.max(TUFT.wick, -Math.log(1 - Math.min(0.99, Math.max(0, feed))) / (0.7 * REF_MM / TUFT.refSpeed));

/** Move the towed chain `pts` (x0, y0, x1, y1 ... in cells, the hand first, then each segment's length) for the hand
 *  at (hx, hy), segment length seg (cells), the previous step's seg0, and the direction (dx, dy) a chain lies in when
 *  it has none. A point further than seg from the one before it is pulled in along the line between them (towed); a
 *  segment shorter than seg grows by TUFT.creep of the growth of seg that the hand's travel does not take up, as pressure
 *  bends the tuft over and its tip slides. With `hold` the tip is held where it landed: nothing slides, and the tuft
 *  only unrolls between the landing point and the hand as the hand moves away from it.
 *  Returns pts (made, gathered at the hand, when null). */
export function moveChain(pts, S, hx, hy, seg, seg0, dx, dy, hold = false) {
  const moved = pts ? Math.hypot(hx - pts[0], hy - pts[1]) : 0;
  if (!pts) { pts = new Float64Array(3 * S); for (let j = 0; j < S; j++) { pts[2 * j] = hx; pts[2 * j + 1] = hy; } }
  pts[0] = hx; pts[1] = hy;
  // what the press grows the tuft by that the hand's own travel does not take up slides the tip out: all of it in a tap,
  // little of it when the brush lands on the move (its tip holds where it touched and the hand draws the belly down)
  const grow = hold ? 0 : Math.max(0, seg - seg0 - moved / (S - 1));
  for (let j = 1; j < S; j++) {
    const ax = pts[2 * j - 2], ay = pts[2 * j - 1];
    let ex = pts[2 * j] - ax, ey = pts[2 * j + 1] - ay, L = Math.hypot(ex, ey);
    if (L > 1e-9) { ex /= L; ey /= L; }
    // the line of the chain before this point (the lie direction at the hand)
    let px = dx, py = dy;
    if (j > 1) { const qx = ax - pts[2 * j - 4], qy = ay - pts[2 * j - 3], q = Math.hypot(qx, qy); if (q > 1e-9) { px = qx / q; py = qy / q; } }
    const own = pts[2 * S + j - 1];
    if (L <= 1e-9 || (own <= 0 && !hold)) { ex = px; ey = py; L = 0; } // gathered at the one before: it lies on in the chain's line
    const to = L > seg ? seg : Math.min(seg, Math.max(L, own + TUFT.creep * grow));
    if (L < to && ex * px + ey * py < 0) { ex = px; ey = py; } // a segment growing under a press lies on in the chain's line
    pts[2 * j] = ax + ex * to; pts[2 * j + 1] = ay + ey * to; pts[2 * S + j - 1] = to;
  }
  return pts;
}

// Signed distance from (X, Y) in a cone segment's frame (X across, >= 0; Y along from A) to a cone of radii r1 at A and
// r2 at h (Quilez's uneven capsule).
function coneDist(X, Y, h, r1, r2) {
  if (Math.abs(r1 - r2) >= h) return Math.min(Math.hypot(X, Y) - r1, Math.hypot(X, Y - h) - r2);
  const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b), k = -b * X + a * Y;
  if (k < 0) return Math.hypot(X, Y) - r1;
  if (k > a * h) return Math.hypot(X, Y - h) - r2;
  return X * a + Y * b - r1;
}
// Signed distance to a box of half-extents (a, b) with corners rounded at rc.
function boxDist(u, v, a, b, rc) {
  const qx = Math.abs(u) - a + rc, qy = Math.abs(v) - b + rc, mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
  // hypot only off a corner: with one part 0 it is the other exactly (Math.hypot is slow)
  return (my === 0 ? mx : mx === 0 ? my : Math.hypot(mx, my)) + Math.min(Math.max(qx, qy), 0) - rc;
}

/**
 * Visit every cell the tuft may cover: visit(i, d, across, x, y) with d the cell centre's signed distance to the
 * shape in cells and across its place across the tuft (-1 .. 1). `g` is { pts, S, rad (per point: a round's
 * half-width, a flat's blade half-length), flat, bx, by (blade direction), thick (blade half-thickness), onBox }; onBox,
 * when set, is told the box before any cell is visited. `pad` widens
 * the box the cells are taken from (edge noise). With `cut`, a cell further than cut from the shape is not visited: each
 * row is walked only where some part of the shape can come within cut, and only the parts that can are measured; a cell
 * that is visited gets the same distance and place across as without it. Returns [x0, y0, x1, y1], the box visited.
 */
export function footprint(g, w, h, pad, visit, cut = Infinity) {
  const { pts, S, rad, flat } = g;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, rmax = 0;
  for (let j = 0; j < S; j++) { const x = pts[2 * j], y = pts[2 * j + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); rmax = Math.max(rmax, rad[j]); }
  const m = rmax + (flat ? g.thick : 0) + pad + 1;
  const X0 = Math.max(0, Math.floor(x0 - m)), X1 = Math.min(w - 1, Math.ceil(x1 + m)), Y0 = Math.max(0, Math.floor(y0 - m)), Y1 = Math.min(h - 1, Math.ceil(y1 + m));
  if (X1 < X0 || Y1 < Y0) return null;
  g.onBox?.(X0, Y0, X1, Y1);
  if (flat) return flatFootprint(g, w, X0, Y0, X1, Y1, visit, cut);
  // per segment: origin, axis, length and the radii at its two ends, flat (7 numbers a segment)
  const ns = S - 1, seg = g._seg && g._seg.length === 7 * ns ? g._seg : (g._seg = new Float64Array(7 * ns));
  const on = g._on && g._on.length >= ns ? g._on : (g._on = new Int32Array(ns));
  for (let j = 0; j < ns; j++) {
    const ax = pts[2 * j], ay = pts[2 * j + 1], ex = pts[2 * j + 2] - ax, ey = pts[2 * j + 3] - ay, L = Math.hypot(ex, ey), o = 7 * j;
    seg[o] = ax; seg[o + 1] = ay; seg[o + 2] = L > 1e-9 ? ex / L : 1; seg[o + 3] = L > 1e-9 ? ey / L : 0; seg[o + 4] = L; seg[o + 5] = rad[j]; seg[o + 6] = rad[j + 1];
  }
  const start = cut < Infinity ? cut + 1e-9 : Infinity;
  for (let y = Y0; y <= Y1; y++) {
    const py = y + 0.5;
    // the segments whose capsule (wider radius, widened by cut) reaches this row, and the span of the row they can reach
    let n = 0, xa = X0, xb = X1;
    if (start < Infinity) {
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j < ns; j++) {
        const o = 7 * j, ax = seg[o], ay = seg[o + 1], bx = ax + seg[o + 2] * seg[o + 4], by = ay + seg[o + 3] * seg[o + 4], Rc = Math.max(seg[o + 5], seg[o + 6]) + start + 1e-6;
        if (py < Math.min(ay, by) - Rc || py > Math.max(ay, by) + Rc) continue;
        // the part of the axis within Rc of the row in y, then Rc either side in x
        let ta = 0, tb = 1;
        if (by !== ay) { const t1 = (py - Rc - ay) / (by - ay), t2 = (py + Rc - ay) / (by - ay); ta = Math.max(0, Math.min(t1, t2)); tb = Math.min(1, Math.max(t1, t2)); }
        const xA = ax + (bx - ax) * ta, xB = ax + (bx - ax) * tb;
        lo = Math.min(lo, xA, xB) - Rc; hi = Math.max(hi, xA, xB) + Rc; on[n++] = o;
      }
      if (!n) continue;
      xa = Math.max(X0, Math.floor(lo - 0.5)); xb = Math.min(X1, Math.ceil(hi - 0.5));
    } else for (let j = 0; j < ns; j++) on[n++] = 7 * j;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5;
      let best = start, across = 0;
      for (let q = 0; q < n; q++) {
        const o = on[q], ax = seg[o], ay = seg[o + 1], ex = seg[o + 2], ey = seg[o + 3], L = seg[o + 4], r1 = seg[o + 5], r2 = seg[o + 6];
        const dx = px - ax, dy = py - ay, Y = dx * ex + dy * ey, Xs = -dx * ey + dy * ex;
        // the cone lies inside the capsule of its wider radius round its axis: a segment that cannot come nearer than the
        // nearest so far is passed over (the result is the same)
        const Yc = Y < 0 ? Y : Y > L ? Y - L : 0;
        if (Math.sqrt(Xs * Xs + Yc * Yc) - (r1 > r2 ? r1 : r2) >= best) continue;
        const d = L > 1e-6 ? coneDist(Math.abs(Xs), Y, L, r1, r2) : Math.hypot(dx, dy) - Math.max(r1, r2);
        if (d < best) { best = d; const t = L > 1e-6 ? Math.max(0, Math.min(1, Y / L)) : 0, r = r1 + (r2 - r1) * t; across = r > 1e-6 ? Math.max(-1, Math.min(1, Xs / r)) : 0; }
      }
      if (best === start && start < Infinity) continue;
      visit(y * w + x, best, across, x, y);
    }
  }
  return [X0, Y0, X1, Y1];
}
function flatFootprint(g, w, X0, Y0, X1, Y1, visit, cut) {
  const { pts, S, rad, bx, by, thick } = g, nx = -by, ny = bx;
  // sub-points along the chain no further apart than the blade is thick, so the swept blade has no gaps: x, y, the
  // blade's half-length there, the radius of its box's circumcircle, and where it lies along and across the blade
  let n = 0;
  for (let j = 0; j + 1 < S; j++) n += Math.max(1, Math.ceil(Math.hypot(pts[2 * j + 2] - pts[2 * j], pts[2 * j + 3] - pts[2 * j + 1]) / Math.max(0.35, 0.7 * thick)));
  n++;
  const sub = g._sub && g._sub.length >= 6 * n ? g._sub : (g._sub = new Float64Array(6 * n + 96));
  const on = g._on && g._on.length >= n ? g._on : (g._on = new Int32Array(n + 16));
  const ord = g._ord && g._ord.length >= n ? g._ord : (g._ord = new Int32Array(n + 16)), vsS = g._vs && g._vs.length >= n ? g._vs : (g._vs = new Float64Array(n + 16));
  let o = 0;
  const put = (x, y, a) => { sub[o] = x; sub[o + 1] = y; sub[o + 2] = a; sub[o + 3] = Math.sqrt(a * a + thick * thick); sub[o + 4] = x * bx + y * by; sub[o + 5] = x * nx + y * ny; o += 6; };
  for (let j = 0; j + 1 < S; j++) {
    const ax = pts[2 * j], ay = pts[2 * j + 1], ex = pts[2 * j + 2] - ax, ey = pts[2 * j + 3] - ay, m = Math.max(1, Math.ceil(Math.hypot(ex, ey) / Math.max(0.35, 0.7 * thick)));
    for (let q = 0; q < m; q++) { const t = q / m; put(ax + ex * t, ay + ey * t, rad[j] + (rad[j + 1] - rad[j]) * t); }
  }
  put(pts[2 * S - 2], pts[2 * S - 1], rad[S - 1]);
  const start = cut < Infinity ? cut + 1e-9 : Infinity;
  for (let y = Y0; y <= Y1; y++) {
    const py = y + 0.5;
    // the sub-points whose box can come within cut of this row, and the span of the row their circles reach
    let k = 0, xa = X0, xb = X1;
    if (start < Infinity) {
      let lo = Infinity, hi = -Infinity;
      for (let q = 0; q < o; q += 6) {
        const Rc = sub[q + 3] + start + 1e-5, dy = py - sub[q + 1];
        if (dy > Rc || dy < -Rc) continue;
        const half = Math.sqrt(Rc * Rc - dy * dy);
        if (sub[q] - half < lo) lo = sub[q] - half;
        if (sub[q] + half > hi) hi = sub[q] + half;
        on[k++] = q;
      }
      if (!k) continue;
      xa = Math.max(X0, Math.floor(lo - 0.5)); xb = Math.min(X1, Math.ceil(hi - 0.5));
    } else for (let q = 0; q < o; q += 6) on[k++] = q;
    // the sub-points sorted by where they lie across the blade: a cell measures them outward from its own place across,
    // and stops once the rest lie further across than the nearest so far (a tie goes to the earliest on the chain, so
    // the first nearest wins as before)
    for (let r = 0; r < k; r++) {
      const q = on[r], v = sub[q + 5];
      let s2 = r;
      while (s2 > 0 && vsS[s2 - 1] > v) { vsS[s2] = vsS[s2 - 1]; ord[s2] = ord[s2 - 1]; s2--; }
      vsS[s2] = v; ord[s2] = r;
    }
    let p = 0;
    for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, U = px * bx + py * by, V = px * nx + py * ny;
      while (p > 0 && vsS[p - 1] >= V) p--;
      while (p < k && vsS[p] < V) p++;
      let best = start, across = 0, won = k;
      for (let side = 0; side < 2; side++) {
        for (let s2 = side ? p - 1 : p; side ? s2 >= 0 : s2 < k; side ? s2-- : s2++) {
          const lv = (side ? V - vsS[s2] : vsS[s2] - V) - thick - 1e-6;
          if (lv > best) break;
          const at = ord[s2], q = on[at], a = sub[q + 2], lu = Math.abs(U - sub[q + 4]) - a - 1e-6;
          // the blade lies within its box: one whose box cannot come nearer than the nearest so far is passed over (with
          // a margin over rounding, so the result is the same)
          if (lu > best || ((lu === best || lv === best) && at > won)) continue;
          const dx = px - sub[q], dy = py - sub[q + 1];
          const u = dx * bx + dy * by, v = dx * nx + dy * ny;
          const d = boxDist(u, v, a, thick, Math.min(thick, a));
          if (d < best || (d === best && at < won)) { best = d; across = a > 1e-6 ? Math.max(-1, Math.min(1, u / a)) : 0; won = at; }
        }
      }
      if (best === start && start < Infinity) continue;
      visit(y * w + x, best, across, x, y);
    }
  }
  return [X0, Y0, X1, Y1];
}

/**
 * One lane against one cell for one step. `a` is the share of the difference that levels in this step (1 - exp(-k dt)),
 * `share` the share of the cell's area the tuft's liquid touches (its footprint's cover of the cell, and the tooth it
 * reaches), `hb` the lane's head, `g` lane units per depth unit of one cell, `lane` { water, pig } with its capacity
 * `capL` and retention `freeAt` (lane units). The cell's water is its mean depth, so where the tuft wets a share of it
 * the film levels towards that share of the head: an edge cell, or a pitted one, holds less. Returns the water the lane
 * lost (lane units, negative when it took up). Conserves water and every pigment between lane and cell.
 */
export function exchangeCell(sheet, i, lane, capL, freeAt, a, share, hb, g, buf) {
  const K = sheet.K, W = sheet.W[i], start = lane.water;
  // 1. the films in contact trade equal volumes: colour passes even where the heads are level
  if (W > 1e-9 && lane.water > 1e-12 && hb > 0) {
    const X = TUFT.mix * a * share * Math.min(W, hb, lane.water / g);
    for (let k = 0; k < K; k++) {
      const cb = lane.pig[k] / lane.water, cp = sheet.G[k][i] / W;
      let d = X * (cb - cp);
      if (d > 0) d = Math.min(d, lane.pig[k] / g); else d = Math.max(d, -sheet.G[k][i]);
      sheet.G[k][i] += d; lane.pig[k] -= d * g;
    }
  }
  // 2. the films level: the tuft pours into a lower film and drinks from a higher one
  const J = hb * share > W ? a * (hb * share - W) : hb < W ? a * share * (hb - W) : 0;
  if (J > 0) {
    const give = Math.min(J, Math.max(0, lane.water - freeAt) / g);
    if (give > 0) {
      const f = give * g / lane.water;
      for (let k = 0; k < K; k++) { buf[k] = lane.pig[k] * f / g; lane.pig[k] -= buf[k] * g; }
      lane.water -= give * g;
      if (sheet.M[i]) deposit(sheet, i, give, buf); else soak(sheet, i, give, buf, give);
    }
  } else if (J < 0 && W > 1e-9) {
    const take = Math.min(-J, W, Math.max(0, capL - lane.water) / g);
    if (take > 0) {
      const f = take / W;
      for (let k = 0; k < K; k++) { const q = sheet.G[k][i] * f; sheet.G[k][i] -= q; lane.pig[k] += q * g; }
      sheet.W[i] -= take; lane.water += take * g; sheet.wetDirty = 1;
    }
  }
  // 3. a dry sheet's pores pull from the tuft through the sizing where they touch it; a film standing between them
  //    feeds them instead (the sheet's own absorption), and the tuft keeps that film up. The sizing holds a loaded
  //    tuft's free liquid out of the pores as soak does (only 1 - SIZING of its head pushes in), and the pores drink
  //    through a standing film only once it is thinner than the sheet's film (poreFilm). Both pulled at full head, a
  //    loaded flat's first touch filled the pores (0.32 of 0.375 mm) and fixed the paint they drank on the fibres where
  //    each lane and each sweep laid it, so a wash laid in sweeps dried in lanes and bands the film could not level.
  //    A nearly dry tuft (no free head) still leaves its paint where the pores pull it: dry brush is unchanged.
  const cap = sheet.paper.capacity[i], dryness = cap > 0 ? Math.max(0, 1 - sheet.s[i] / cap) : 0;
  if (dryness > 0 && lane.water > 1e-12) {
    const free = hb > 0 ? hb : 0, push = free * (1 - SIZING * free / (free + TUFT.poreFilm)) + (hb < 0 ? hb : 0);
    const Jp = Math.min(a * share * Math.max(0, push + TUFT.pore * dryness) * Math.exp(-sheet.W[i] / TUFT.poreFilm), lane.water / g, share * cap - sheet.s[i]); // only the pores it touches
    if (Jp > 1e-12) {
      const f = Jp * g / lane.water;
      for (let k = 0; k < K; k++) { buf[k] = lane.pig[k] * f / g; lane.pig[k] -= buf[k] * g; }
      lane.water -= Jp * g;
      depositDry(sheet, i, Jp, buf);
    }
  }
  return start - lane.water;
}

/** How far a lane's liquid reaches into the tooth below the hills, as a share of the paper's relief, from its head hb
 *  (of a full head Hb): past the deepest pit for a loaded tuft (or the brush's own `bridge` share when it has one),
 *  less as the free film thins, to the paper's median at no free film, and only the crests once it holds none and the
 *  fibres it touches must draw the paint out of it. A nearly dry tuft so leaves its paint on the crests with white
 *  hollows between (dry brush; looks/drybrush-real.jpg), where it once reached a third of the way into every pit and
 *  laid an even, pale film. */
export function toothReach(hb, Hb, p, bridge, wander = 1) {
  const x = Math.max(-1, Math.min(1, hb / Math.max(1e-6, Hb))), full = (bridge > 0 ? bridge : 3) * (0.55 + 0.45 * Math.min(1, p)) * wander;
  return x >= 0 ? full * Math.sqrt(x) : 1.5 * x;
}
