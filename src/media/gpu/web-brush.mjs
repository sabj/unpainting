import { postureContact, POSTURES } from './web-posture.mjs';
// Brush for the web build (DOM free): a row of bristles across the stroke, based on "Hairy Brushes",
// fed from a belly reservoir as in DAB. Water and pigment move as separate masses. One contact model covers
// every load: paint reaches a cell when the hair's liquid spans the depth of the paper's tooth below it.
import { deposit, soak, collectFlows } from '../sheet.mjs';

export function createBrush(opts = {}) {
  const b = makeBrush(opts);
  if (BRUSHES) b._tapeId = brushId(opts);
  return b;
}
function makeBrush({ bristles = 22, radius = 6, capacity = 20, give = 0.8, feed = 0.04, wetness = 0.9, flat = false, belly = 1.6, free = 0.4, film = 0.25, breakup = 1.5, bridge = 0, bridgeSoft = 0.25, bridgeStreak = 1, fine = 0.1, streak = 0.35, streakLength = 14, coarse = 0.3, splay = 0.03, stiffness, wetMix = 0, grainShift = 0, model = 'row', lag = 0.6, posture = 'auto', seed = 3 } = {}) {
  if (!POSTURES.includes(posture)) throw Error('Invalid brush posture');
  let s = seed * 7919 + 13; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const hairs = [], clumps = []; let left = 0, c = -1;
  for (let j = 0; j < bristles; j++) {
    if (left <= 0) { c++; left = 2 + Math.floor(rnd() * 6); clumps.push({ lift: rnd() }); } // wet hairs stick in clumps
    left--;
    hairs.push({ len: flat ? 0.95 + 0.05 * rnd() : 1 - 0.55 * ((j / Math.max(1, bristles - 1)) * 2 - 1) ** 2 + 0.08 * (rnd() - 0.5), water: 0, pig: null, clump: c });
  }
  // grainShift (cells): offsets where this brush reads the paper's relief, stepped through as it travels, so
  // overlapping sweeps over one passage break up differently instead of compounding the same speckle.
  const gs = grainShift > 0 ? grainShift : 0;
  const grainTable = gs ? Array.from({ length: 8 }, () => [Math.round((rnd() * 2 - 1) * gs), Math.round((rnd() * 2 - 1) * gs)]) : null;
  return { hairs, clumps, radius, capacity, give, feed, wetness, flat, belly, free, film, breakup, bridge, bridgeSoft, bridgeStreak, fine, streak, streakLength, coarse, splay, travel: 0, wetMix, grainTable, grainPeriod: 9, stiffness: stiffness ?? Math.max(4, Math.round(radius * 0.5)), rnd, resW: 0, resP: null, K: 0, carry: 0, model, lag, posture, tip: null, bend: 0 };
}

/** Dip: water at a pigment concentration (per unit of water, per pigment), into the belly and every bristle. */
export function dip(brush, { water = 1, conc }) {
  if (TAPE && brush._tapeId !== undefined) TAPE.push({ k: 'd', b: brush._tapeId, w: water, c: conc.map(v => +v.toFixed(4)) });
  brush.K = conc.length; brush.load = water; brush.carry = 0; brush.travel = 0;
  brush.resW = water * brush.capacity * brush.hairs.length * brush.belly; brush.resP = conc.map(v => v * brush.resW);
  for (const hr of brush.hairs) { hr.water = water * brush.capacity * hr.len; hr.pig = conc.map(v => v * hr.water); }
}

/** A thirsty brush: damp, with no free liquid, for lifting paint out of a wet wash. A dip at a little water and no
 *  pigment; `stroke` does the lifting where a hair below `free` saturation crosses a wet cell. */
export function thirsty(brush, { water = 0.15 } = {}) {
  if (!Number.isFinite(water) || water < 0) throw new RangeError('thirsty water must be finite and nonnegative');
  // the brush keeps the pigments it was last dipped with, at zero concentration, so its hairs stay the width of the
  // sheet's pigment list; a brush that has never been dipped is given the one pigment it cannot be wrong about
  dip(brush, { water, conc: new Array(brush.K || 1).fill(0) });
  return brush;
}

const moveMass = (from, to, water) => { // water and its share of pigment from one {water, pig} to another
  if (water <= 0 || from.water <= 0) return;
  const f = Math.min(1, water / from.water);
  for (let k = 0; k < from.pig.length; k++) { const q = from.pig[k] * f; from.pig[k] -= q; to.pig[k] += q; }
  const wq = from.water * f; from.water -= wq; to.water += wq;
};
// moveMass from the belly (brush.resW and `pig`) into a hair, without the accessor object: this runs for every hair every step.
const feedHair = (brush, pig, hr, water) => {
  if (water <= 0 || brush.resW <= 0) return;
  const f = Math.min(1, water / brush.resW);
  for (let k = 0; k < pig.length; k++) { const q = pig[k] * f; pig[k] -= q; hr.pig[k] += q; }
  const wq = brush.resW * f; brush.resW -= wq; hr.water += wq;
};
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// The paper under a hair. A hair lies along the stroke over a short contact length, so what it feels is the paper's
// tooth averaged along that length behind its tip; the fibres roughen the edge of each touch. High ground is touched
// first. Averaging along the stroke draws both the touches and the gaps out along it, a tooth wide and a hair long.
function groundAt(paper, xx, yy, tx, ty, L, fine, coarse = 0.3) {
  const { w, h, tooth, height, valley } = paper; let sum = 0, n = 0;
  for (let m = 0; m <= L; m++) {
    const bx = Math.round(xx - tx * m), by = Math.round(yy - ty * m); if (bx < 0 || by < 0 || bx >= w || by >= h) break;
    const j = by * w + bx; sum += height[j] - (1 - coarse) * tooth[j]; n++;
  }
  const i = yy * w + xx; return sum / (n || 1) + fine * (height[i] - valley[i]);
}
// a smooth random value in [0, 1] along a line, one line per clump
const hash1 = (c, k) => { const v = Math.sin(c * 91.7 + k * 12.9898) * 43758.5453; return v - Math.floor(v); };
const along1 = (c, x) => { const k = Math.floor(x), f = x - k, u = f * f * (3 - 2 * f); return hash1(c, k) + (hash1(c, k + 1) - hash1(c, k)) * u; };
// How the ground is spread on this paper for this hair length, so a brush's load maps to the share of the paper it
// reaches (coverage) whatever the paper's scale. Sampled once per paper and hair length.
const GROUNDS = new WeakMap();
function groundQuantiles(paper, L, fine, coarse) {
  let byPaper = GROUNDS.get(paper); if (!byPaper) GROUNDS.set(paper, (byPaper = new Map()));
  const key = `${L}:${fine}:${coarse}`; if (byPaper.has(key)) return byPaper.get(key);
  const { w, h } = paper, gs = []; let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // a paper narrower than the contact length has no interior to sample: keep the samples on the sheet
  const spanX = Math.max(1, w - 2 * L), spanY = Math.max(1, h - 2 * L);
  const at = (span, len, r) => Math.min(len - 1, L + Math.floor(r * span));
  for (let j = 0; j < 4000; j++) { const a = rnd() * 2 * Math.PI; gs.push(groundAt(paper, at(spanX, w, rnd()), at(spanY, h, rnd()), Math.cos(a), Math.sin(a), L, fine, coarse)); }
  gs.sort((x, y) => x - y);
  const q = Float32Array.from({ length: 201 }, (_, k) => gs[Math.round((k / 200) * (gs.length - 1))]);
  byPaper.set(key, q); return q;
}

// The mark tape: records instrument calls (never pixels) so a browser can replay the marks. Off unless a recorder is attached.
export let TAPE = null;
// Each createBrush call is its own instance, since a brush carries residual paint between strokes; option sets are deduped.
// The tape records calls, not residual state, because residuals cannot rebuild the per-hair loading dip sets up.
export let BRUSHES = null;
export let BRUSHOPTS = null;
// Pens share the tape with their own dictionary: one instance per createPen call, option sets deduped.
export let PENS = null;
export let PENOPTS = null;
const optKey = new Map();
const penKey = new Map();
export const recordMarks = on => {
  TAPE = on ? [] : null;
  BRUSHES = on ? [] : null; BRUSHOPTS = on ? [] : null; optKey.clear();
  PENS = on ? [] : null; PENOPTS = on ? [] : null; penKey.clear();
  return TAPE;
};
// One instrument: its option sets deduped into `opts`, one entry per call in `calls`; the id is that call's index.
const instrumentId = (options, seen, calls, opts) => {
  const key = JSON.stringify(options);
  let o = seen.get(key);
  if (o === undefined) { o = opts.length; opts.push(options); seen.set(key, o); }
  calls.push(o);
  return calls.length - 1;
};
const brushId = options => instrumentId(options, optKey, BRUSHES, BRUSHOPTS);
export const penId = options => instrumentId(options, penKey, PENS, PENOPTS);

/** Drag the brush along points {x, y, p}; `between(step)` lets the sheet flow while the brush moves. With lift false
 *  the brush stays on the paper, and the next call continues from where this one stopped.
 *  `upright` holds one heading for the whole stroke: true is the sheet's vertical, 'sweep' is first point to last. */
export function stroke(brush, sheet, path, { spacing = 0.7, between, lift = true, upright = false, flowEvery = 0, stationary = false } = {}) {
  let rec = TAPE && brush._tapeId !== undefined && sheet._tape ? [] : null;
  // record only the painting's own sheet, not scrap test sheets
  if (TAPE && brush._tapeId !== undefined && sheet._tape) TAPE.push({
    k: 's', b: brush._tapeId,
    u: upright === false ? 0 : upright === true ? 1 : 2,
    // sheet.wetting (set by prewetArea) marks sheet.ever, which governs where a later wash may creep
    ...(sheet.wetting ? { wt: 1 } : {}),
    // only non-default lift and spacing are recorded
    ...(lift ? {} : { lf: 0 }),
    ...(spacing === 0.7 ? {} : { sp: spacing }),
    // where this stroke flowed the sheet (`between`), as step indices inside it
    fl: rec,
    // points as integers: x, y in tenths of a cell, pressure in hundredths, and the point's own radius when the
    // path has one (contained wash sweeps taper, so brush.radius is only their widest point)
    d: path.some(q => q.r != null)
      ? path.map(q => [Math.round(q.x * 10), Math.round(q.y * 10), q.p == null ? -1 : Math.round(q.p * 100), q.r == null ? -1 : Math.round(q.r * 10)])
      : path.map(q => [Math.round(q.x * 10), Math.round(q.y * 10), q.p == null ? -1 : Math.round(q.p * 100)]),
  });
  const { w, h, paper } = sheet, K = sheet.K, L = brush.stiffness, Q = groundQuantiles(paper, L, brush.fine, brush.coarse);
  const belly = { get water() { return brush.resW; }, set water(v) { brush.resW = v; }, pig: brush.resP };
  const lanes = brush.hairs.length;
  // 'sweep': path builders sweep a passage along one axis, so first point to last gives that axis
  let hx = 0, hy = 1;
  if (upright === 'sweep' && path.length > 1) {
    const ex = path[path.length - 1].x - path[0].x, ey = path[path.length - 1].y - path[0].y, em = Math.hypot(ex, ey);
    if (em > 1e-6) { hx = ex / em; hy = ey / em; }
  }
  let t = brush.carry, k = 1, steps = 0;
  if (rec) collectFlows(rec, () => steps);
  // each cell is touched once as the brush passes: the steps' strips overlap a little so a curve leaves no gaps, and a
  // cell touched in the last few steps is not touched again (a stroke that loops back still paints over itself)
  if (!sheet.touched || sheet.touched.length !== w * h) sheet.touched = new Int32Array(w * h).fill(-1e9);
  // Free liquid joins the round tuft into one contact patch; as it retreats, contact narrows to the hairs and breaks on the tooth.
  const roundLiquid = hr => brush.flat ? 0 : smooth((hr.water / (brush.capacity * hr.len || 1) - brush.free) / (1 - brush.free));
  const liquidShare = brush.hairs.reduce((v, hr) => Math.max(v, roundLiquid(hr)), 0);
  const maxRadius = path.reduce((v, pt) => Math.max(v, pt.r ?? brush.radius), 0);
  // a cell under the wet patch gets one film as it passes, not one per overlapping disc
  const stamp = sheet.touched, recent = Math.ceil(Math.max(4, liquidShare * (2.2 * maxRadius + 2)) / spacing);
  if (!sheet.contactStrength || sheet.contactStrength.length !== w * h) sheet.contactStrength = new Float32Array(w * h);
  const strengths = sheet.contactStrength;
  // the wash edge a painter holds the bead to (sheet.mjs setClip); unset, the brush reaches wherever it touches
  const clip = sheet.clip ?? null;
  sheet.clock = sheet.clock ?? 0; // shared by every instrument on this sheet
  // Recent-contact suppression lasts one uninterrupted stroke: a lifted or different brush can touch the same cells at once.
  // Drying does not advance this clock.
  if (sheet._contactBrush !== brush) sheet.clock += recent;
  sheet._contactBrush = brush;
  // per-step working values: a clump's wander is the same for every cell of one step, so it is worked out once a step
  // (three sines) instead of once a cell; the film handed to the paper goes through one reused buffer
  const tuft = brush.model === 'tuft', postured = brush.posture !== 'auto', shaped = tuft || postured, offs = shaped ? new Float64Array(lanes) : null;
  const hairs = brush.hairs, nClumps = brush.clumps.length, wanderOf = new Float64Array(nClumps), wanderAt = new Int32Array(nClumps).fill(-1), liquidOf = new Float64Array(lanes);
  let pigBuf = new Float64Array(0), stepNo = 0;
  while (k < path.length) {
    const a = path[k - 1], b = path[k], seg = Math.hypot(b.x - a.x, b.y - a.y) || (stationary ? 0 : 1e-6);
    if (t > seg) { t -= seg; k++; continue; }
    const u = seg ? t / seg : 0, q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * u };
    let tx = upright ? hx : (b.x - a.x) / seg, ty = upright ? hy : (b.y - a.y) / seg;
    let cx = q.x, cy = q.y, reachOff = 0, pe = q.p, tipShare = 0; // where the footprint sits, how far its hairs reach along the stroke, the pressure it bends to
    if (tuft) {
      // The spine runs from the handle (the path) to the tip. The tip drags behind the handle by more the harder the
      // brush is pressed, so a turn is cut across and the mark trails; the tuft's heading is tip to handle. The bend
      // follows the pressure with a spring: it flattens over about a brush radius when pressed, and recovers faster
      // (about a third of a radius) when the brush lifts.
      const tp = brush.tip ?? (brush.tip = { x: q.x, y: q.y });
      brush.bend += (q.p - brush.bend) * (1 - Math.exp(-spacing / (brush.radius * (q.p > brush.bend ? 0.9 : 0.35))));
      pe = brush.bend;
      const lagLen = Math.max(0.3, (a.r === undefined ? brush.radius : a.r) * brush.lag * (0.25 + 0.75 * pe));
      const kTip = 1 - Math.exp(-spacing / lagLen);
      tp.x += (q.x - tp.x) * kTip; tp.y += (q.y - tp.y) * kTip;
      const sx = q.x - tp.x, sy = q.y - tp.y, sm = Math.hypot(sx, sy);
      if (!upright && sm > 0.25) { const wgt = Math.min(1, sm / (0.5 * lagLen + 0.5)); let ux = tx + (sx / sm - tx) * wgt, uy = ty + (sy / sm - ty) * wgt; const um = Math.hypot(ux, uy) || 1; tx = ux / um; ty = uy / um; }
      cx = tp.x; cy = tp.y;
    }
    let nx = -ty, ny = tx;
    // a flat brush keeps its width under pressure; as it lifts, the corners leave the paper first and the end rounds off
    const radius = a.r === undefined ? brush.radius : a.r + ((b.r ?? a.r) - a.r) * u;
    let half = brush.flat ? radius * (0.9 + 0.1 * q.p) * Math.sqrt(Math.min(1, q.p / 0.5)) : radius * (0.25 + 0.75 * q.p);
    if (tuft) {
      // Pressed, the tuft splays wider and its belly flattens onto the paper: hairs near the ferrule (the short ones) reach
      // out ahead of the tip, which makes the round brush's teardrop, thinning to the tip as pressure lifts. A flat's
      // width holds, its corners splay a little and trail behind the middle.
      half = brush.flat ? radius * (0.9 + 0.1 * pe) * Math.sqrt(Math.min(1, pe / 0.5)) * (1 + 0.1 * pe) : radius * (0.2 + 0.65 * pe + 0.2 * pe * pe);
      const reach = radius * 0.9 * (0.15 + 0.85 * pe);
      for (let j = 0; j < lanes; j++) {
        const rel = lanes > 1 ? (2 * j) / (lanes - 1) - 1 : 0;
        offs[j] = brush.flat ? -radius * 0.35 * pe * rel * rel : reach * (1 - hairs[j].len);
        reachOff = Math.max(reachOff, Math.abs(offs[j]));
      }
    }
    if (postured) {
      const pose = postureContact(brush.posture, { radius, p: q.p, flat: brush.flat, tx, ty,
        tiltX: (a.tiltX ?? 0) + ((b.tiltX ?? a.tiltX ?? 0) - (a.tiltX ?? 0)) * u,
        tiltY: (a.tiltY ?? 0) + ((b.tiltY ?? a.tiltY ?? 0) - (a.tiltY ?? 0)) * u, lengths: hairs.map(hr => hr.len) });
      half = pose.half; tipShare = pose.tipShare; offs.set(pose.offsets); reachOff = pose.reachOff;
      tx = pose.tx; ty = pose.ty; nx = pose.nx; ny = pose.ny;
    }
    // the outer hairs splay: each side of the brush wanders in and out a little as it travels, and the last hairs on each
    // side press less and hold less, so they touch only where the paper stands high
    const sideL = half * (1 + brush.splay * (2 * along1(1001, brush.travel / 9) - 1)), sideR = half * (1 + brush.splay * (2 * along1(2003, brush.travel / 9) - 1));
    const fullFringe = 1 + 0.08 * half, fringe = postured ? Math.min(fullFringe, tipShare * .25 * half + (1 - tipShare) * fullFringe) : fullFringe;

    // the belly feeds the bristles up to the dip's level; a dry bristle takes a little from its neighbours
    for (let j = 0; j < lanes; j++) {
      const hr = hairs[j];
      // a brush dipped past full carries the excess as free liquid, and the belly keeps refilling the hairs to that level
      const target = brush.capacity * hr.len * (brush.load ?? 1);
      if (hr.water < target && brush.resW > 0) feedHair(brush, belly.pig, hr, Math.min(brush.resW, (target - hr.water) * brush.feed));
      if (hr.water < 0.05 * brush.capacity && brush.rnd() < 0.05) { const nb = hairs[Math.max(0, Math.min(lanes - 1, j + (brush.rnd() < 0.5 ? -1 : 1)))]; moveMass(nb, hr, nb.water * 0.2); }
      // fixed per step, so depletion during the raster scan does not shrink the patch on its last rows
      liquidOf[j] = roundLiquid(hr);
    }

    const roundReach = brush.flat ? 0 : half * liquidShare;
    const R = Math.ceil(half + 1 + reachOff), thin = spacing * 0.5 + 1.1 + (postured ? reachOff : 0) + roundReach;
    // A broad upright mop touches a thin strip across its heading, not its whole bounding square.
    const rx = upright ? Math.abs(ty) * R + Math.abs(tx) * thin : R, ry = upright ? Math.abs(tx) * R + Math.abs(ty) * thin : R;
    // The cells a step can touch lie within `reachA` of the brush's centre line along the stroke and within the wider
    // side (plus half a cell) across it. The square round the brush is mostly outside that strip, so each row is cut
    // to the strip first, a cell wider on each side than the exact tests below, which still decide every cell.
    const reachA = spacing * 0.5 + 0.6 + reachOff + roundReach, reachS = Math.max(sideL, sideR) + 0.5, clk = sheet.clock;
    const X0 = Math.max(0, Math.floor(cx - rx)), X1 = Math.min(w - 1, Math.ceil(cx + rx)), Y1 = Math.min(h - 1, Math.ceil(cy + ry));
    stepNo++;
    for (let yy = Math.max(0, Math.floor(cy - ry)); yy <= Y1; yy++) {
      const dy = yy + 0.5 - cy;
      let lo = -Infinity, hi = Infinity;
      if (Math.abs(tx) > 1e-6) { const c = dy * ty, u1 = (-reachA - c) / tx, u2 = (reachA - c) / tx; lo = Math.max(lo, Math.min(u1, u2)); hi = Math.min(hi, Math.max(u1, u2)); }
      if (Math.abs(nx) > 1e-6 && reachS === reachS) { const c = dy * ny, u1 = (-reachS - c) / nx, u2 = (reachS - c) / nx; lo = Math.max(lo, Math.min(u1, u2)); hi = Math.min(hi, Math.max(u1, u2)); }
      let xa = X0, xb = X1;
      if (lo === lo && hi === hi) {
        if (lo > -Infinity) xa = Math.max(xa, Math.floor(lo + cx - 0.5) - 1);
        if (hi < Infinity) xb = Math.min(xb, Math.ceil(hi + cx - 0.5) + 1);
      }
      for (let xx = xa; xx <= xb; xx++) {
        const dx = xx + 0.5 - cx, along = dx * tx + dy * ty, across = dx * nx + dy * ny;
        const side = across < 0 ? sideL : sideR;
        if (Math.abs(across) > side + 0.5) continue;
        if (clip && !clip[yy * w + xx]) continue;
        const cell = yy * w + xx, recentContact = clk - stamp[cell] < recent;
        if (recentContact && (liquidShare <= 0 || strengths[cell] >= 1)) continue;
        const rel = side > 0 ? across / side : 0; // a flat brush lifted to no pressure has no width: everything is the centre lane
        let lane = Math.max(0, Math.min(lanes - 1, Math.round(((rel + 1) / 2) * (lanes - 1))));
        if (tipShare > 0) {
          const baseLane = lane;
          // a subpixel tip can overlap a cell whose centre is beyond the tuft: use the longest hair crossing the cell
          const pixelReach = .5 * (Math.abs(nx) + Math.abs(ny)); let longest = -Infinity;
          for (let j = 0; j < lanes; j++) { const hairAcross = (2 * j / Math.max(1, lanes - 1) - 1) * side;
            if (Math.abs(hairAcross - across) <= pixelReach && hairs[j].len > longest) { longest = hairs[j].len; lane = j; }
          }
          if (longest === -Infinity) continue;
          lane = Math.round(baseLane * (1 - tipShare) + lane * tipShare);
        }
        const hr = hairs[lane], edgeAcross = postured ? across * (1 - tipShare) + tipShare * (2 * lane / Math.max(1, lanes - 1) - 1) * side : across;
        // liquid spans the round tuft's circular cross-section; interpolating hair offsets avoids a staircase edge between hairs
        const laneAt = Math.max(0, Math.min(lanes - 1, ((rel + 1) / 2) * (lanes - 1)));
        const lower = Math.floor(laneAt), upper = Math.min(lanes - 1, lower + 1), liquid = liquidOf[lane];
        const hairOffset = shaped ? offs[lane] : 0;
        const offset = shaped ? hairOffset + liquid * (offs[lower] + (offs[upper] - offs[lower]) * (laneAt - lower) - hairOffset) : 0;
        const cap = half * Math.sqrt(Math.max(0, 1 - Math.min(1, Math.abs(rel)) ** 2)) * liquid;
        const alongLimit = spacing * 0.5 + 0.6 + cap;
        if (Math.abs(along - offset) > alongLimit) continue;
        if (liquidShare <= 0) stamp[cell] = clk; // dry contact suppression
        const outer = fringe > 0 ? smooth((Math.abs(edgeAcross) - (side - fringe)) / fringe) : 0;
        if (hr.water <= 1e-6) continue;
        if (postured) {
          if (q.p <= 0 || (!brush.flat && q.p * (0.6 + 0.4 * hr.len) < .18 * (1 - tipShare) + 0.5 * (1 - hr.len))) continue;
        } else if (!brush.flat && q.p * (0.6 + 0.4 * hr.len) < 0.18 + 0.5 * (1 - hr.len)) continue;
        const i = yy * w + xx, sat = hr.water / (brush.capacity * hr.len || 1);

        // paint reaches the paper where the liquid held in the hair spans the depth below it: everywhere while the hair has
        // free liquid, a shrinking share of the paper as it empties (coverage = fill^breakup). A clump presses and feeds a
        // little unevenly as the brush travels, so its share wanders along the stroke and the gaps become streaks; pressing
        // harder pushes the hairs into the tooth.
        const cl = hr.clump;
        if (wanderAt[cl] !== stepNo) { wanderAt[cl] = stepNo; wanderOf[cl] = 1 + brush.streak * (2 * along1(cl + brush.clumps[cl].lift * 7, brush.travel / brush.streakLength) - 1); }
        const fill = Math.min(1, sat / brush.free), wander = wanderOf[cl];
        const empty = Math.max(0, Math.min(1, Math.max(0, 1 - sat / brush.free) * wander - (0.15 * (q.p - 0.7) - 0.6 * outer) * Math.min(1, 1.5 * (1 - fill))));
        let contact = smooth(side + 0.5 - Math.abs(across));
        if (liquid > 0) contact *= 1 - liquid + liquid * smooth(alongLimit - Math.abs(along - offset));
        if (contact <= 0) continue;
        // A loaded hair's liquid bridges the tooth and reaches only so far down, further when fuller or pressed harder;
        // lower paper stays dry until the wash flows in. `bridge` 0 disables this (pen and dry brush).
        if (brush.bridge > 0 && brush.bridge < 1) {
          // `bridge` is the share of this paper's own relief the liquid spans: 1 reaches the bottom of every pit and
          // changes nothing, 0.2 wets only the high fifth. Fuller hairs and harder pressing reach further.
          const relief = paper.relief ?? 0.2;
          // per-clump `wander` varies the reach along the stroke, which gives a wash its patchiness over several pixels
          const reach = brush.bridge * relief * (0.45 + 0.55 * fill) * (0.55 + 0.45 * q.p)
            * (1 + brush.bridgeStreak * (wander - 1));
          // how sharply the liquid stops: a narrow transition covers a few cells fully and misses the rest, which
          // reads as scattered dots; a wide one grades the cover and reads as the paper showing through
          contact *= smooth((paper.height[i] - paper.tooth[i] + reach) / (brush.bridgeSoft * relief) + 0.5);
          if (contact <= 0) continue;
        }
        if (empty > 0) {
          const cov = (1 - empty) ** brush.breakup, qi = (1 - cov) * 200, lo = Math.min(199, Math.floor(qi)), g = Q[lo] + (Q[lo + 1] - Q[lo]) * (qi - lo);
          contact *= smooth((groundAt(paper, xx, yy, tx, ty, L, brush.fine, brush.coarse) - g) / 0.03 + 0.5);
          if (contact <= 0) continue;
        }

        // the fringe wets a cell lightly before the belly arrives: add only the extra contact strength, so overlapping
        // samples neither leave unpainted gaps nor pile up puddles
        const fullContact = contact;
        if (liquidShare > 0 && recentContact) contact = Math.max(0, contact - strengths[i]);
        if (contact <= 0) continue;

        // Bristles stirred through a wet film exchange equal volumes with it. This lets a loaded mop charge
        // pre-wetted paper without adding a second puddle, and mixes overlaps before they dry.
        if (brush.wetMix && sheet.W[i] > 0.03) {
          const water = sheet.W[i], exchange = Math.min(hr.water, water) * brush.wetMix * contact;
          for (let kk = 0; kk < K; kk++) {
            const delta = exchange * (hr.pig[kk] / hr.water - sheet.G[kk][i] / water);
            hr.pig[kk] -= delta; sheet.G[kk][i] += delta;
          }
        }
        const Wi = sheet.W[i], freeL = Math.max(0, (sat - brush.free) / (1 - brush.free));
        const want = brush.wetness * freeL * (0.6 + 0.4 * q.p);
        if (sat < brush.free && Wi > 0.05 && sheet.M[i]) { // a thirsty brush (no free liquid) drinks from wetter paper, pigment and all
          const take = Math.min((Wi - 0.05) * 0.3 * contact * (1 - fill), Wi * 0.5, brush.capacity * hr.len - hr.water); if (take <= 0) continue;
          const f = take / Wi; sheet.W[i] -= take; hr.water += take;
          for (let kk = 0; kk < K; kk++) { const g = sheet.G[kk][i] * f; sheet.G[kk][i] -= g; hr.pig[kk] += g; }
          stamp[i] = clk; strengths[i] = fullContact;
          continue;
        }
        // a film of paint wherever it touches, plus free water towards the brush's wetness
        // fibres standing proud take more of the film: paper.proud is the sheet's relief at the tooth's own scale, read
        // where this brush finds it (brush.grainDX/DY, so two sweeps over one passage do not break up identically)
        let gi = i;
        if (brush.grainTable) {
          const [gdx, gdy] = brush.grainTable[((brush.travel / brush.grainPeriod) | 0) % brush.grainTable.length];
          gi = Math.min(paper.h - 1, Math.max(0, ((i / paper.w) | 0) + gdy)) * paper.w + Math.min(paper.w - 1, Math.max(0, (i % paper.w) + gdx));
        }
        const proud = paper.proud ? paper.proud[gi] : paper.height[gi] - paper.valley[gi];
        const grain = 0.7 + 1.2 * proud + 0.3 * paper.valley[gi];
        const give = Math.min(hr.water, contact * (brush.film * grain * (0.7 + 0.3 * q.p) * (1 - Math.min(1, Wi / 0.2)) + brush.give * Math.max(0, want - Wi) * q.p));
        if (give <= 0) continue;
        const f = give / hr.water, hp = hr.pig;
        if (pigBuf.length !== hp.length) pigBuf = new Float64Array(hp.length);
        const pig = pigBuf; for (let kk = 0; kk < hp.length; kk++) pig[kk] = hp[kk] * f;
        hr.water -= give; for (let kk = 0; kk < K; kk++) hr.pig[kk] -= pig[kk];
        soak(sheet, i, give, pig);
        stamp[i] = clk; strengths[i] = fullContact;
      }
    }
    steps++; if (between) between(steps);
    t += spacing; brush.travel += spacing; sheet.clock++;
  }
  brush.carry = t; // how far past the last point the next touch falls
  if (rec) collectFlows(null, null);
  if (!lift) return brush.hairs.reduce((s2, hr) => s2 + hr.water, 0) + brush.resW;
  brush.carry = 0; brush.tip = null; brush.bend = 0; // the tuft springs back
  sheet._contactBrush = null;
  // lifting off: a brush with free liquid leaves a bead at the last contact
  const last = path[path.length - 1], r = Math.max(1.5, brush.radius * 0.35), pool = { water: 0, pig: new Array(brush.K || K).fill(0) }; // the hairs' pigment count, so the bead can go back to the belly
  for (const hr of brush.hairs) if (hr.water / (brush.capacity * hr.len || 1) > brush.free) moveMass(hr, pool, Math.min(hr.water, 0.0015 * brush.capacity));
  const cells = [];
  for (let yy = Math.floor(last.y - r); yy <= Math.ceil(last.y + r); yy++) for (let xx = Math.floor(last.x - r); xx <= Math.ceil(last.x + r); xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h && Math.hypot(xx - last.x, yy - last.y) <= r && sheet.M[yy * w + xx]) cells.push(yy * w + xx);
  if (pool.water > 0 && cells.length) for (const i of cells) deposit(sheet, i, pool.water / cells.length, pool.pig.map(v => v / cells.length));
  else if (pool.water > 0) moveMass(pool, belly, pool.water); // lifted off the sheet, or over dry paper: the bead stays on the brush rather than vanishing
  return brush.hairs.reduce((s2, hr) => s2 + hr.water, 0) + brush.resW;
}

/** One initial contact that keeps carry and stamps for the movement after it. A fixed heading avoids a zero-length direction. */
export function touchBrush(brush, sheet, pt) {
  return stroke(brush, sheet, [pt, pt], { upright: true, lift: false, stationary: true });
}
