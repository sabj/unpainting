// A brush as a row of bristles across the stroke, based on "Hairy Brushes", with a belly
// reservoir as in DAB. Water and pigment move as separate masses. One contact model covers every load:
// paint reaches a cell when the hair's liquid spans the depth from the hair to the paper's tooth there.
import { deposit, soak, collectFlows } from './sheet.mjs';
import { localRowPlanBound } from './gpu/local-row-plan.mjs';
import { checkedStroke } from './gpu/stroke-check.mjs';
import { markCpuStrokeCell } from './cpu-stroke-dirty.mjs';
import { brushContactLookahead,lookaheadCount } from './cpu-contact-lookahead.mjs';

export function createBrush(opts = {}) {
  const b = makeBrush(opts);
  if (BRUSHES) b._tapeId = brushId(opts);
  return b;
}
function makeBrush({ loadWater = 0, depositDepth = 0, bristles = 22, radius = 6, capacity = 20, give = 0.8, feed = 0.04, wetness = 0.9, flat = false, belly = 1.6, free = 0.4, film = 0.25, breakup = 1.5, bridge = 0, bridgeSoft = 0.25, bridgeStreak = 1, fine = 0.1, streak = 0.35, streakLength = 14, coarse = 0.3, splay = 0.03, stiffness, wetMix = 0, grainShift = 0, model = 'row', lag = 0.6, seed = 3, variety = null, merge = null } = {}) {
  if (!['row','tuft'].includes(model)) throw new RangeError('Invalid brush model');
  if (!Number.isFinite(lag) || lag < 0) throw new RangeError('Invalid tuft lag');
  const rs = { s: seed * 7919 + 13 }; const rnd = () => (rs.s = (rs.s * 16807) % 2147483647) / 2147483647; // rs: the generator's state, kept where a snapshot can reach it
  const hairs = [], clumps = []; let left = 0, c = -1;
  for (let j = 0; j < bristles; j++) {
    if (left <= 0) { c++; left = 2 + Math.floor(rnd() * 6); clumps.push({ lift: rnd() }); } // wet hairs stick in clumps
    left--;
    hairs.push({ len: flat ? 0.95 + 0.05 * rnd() : 1 - 0.55 * ((j / Math.max(1, bristles - 1)) * 2 - 1) ** 2 + 0.08 * (rnd() - 0.5), water: 0, pig: null, clump: c });
  }
  // Optional metered reservoir in cell-depth units: a tenth in the tips, the rest in the belly.
  if (loadWater > 0) capacity = loadWater / (10 * hairs.reduce((a, hr) => a + hr.len, 0));
  // grainShift: up to that many cells of offset in where the brush reads the paper's relief, stepped through as it
  // travels, so overlapping sweeps break up differently instead of compounding on the same cells.
  const gs = grainShift > 0 ? grainShift : 0;
  const grainTable = gs ? Array.from({ length: 8 }, () => [Math.round((rnd() * 2 - 1) * gs), Math.round((rnd() * 2 - 1) * gs)]) : null;
  return { loadWater, depositDepth, hairs, clumps, radius, capacity, give, feed, wetness, flat, belly, free, film, breakup, bridge, bridgeSoft, bridgeStreak, fine, streak, streakLength, coarse, splay, travel: 0, wetMix, grainTable, grainPeriod: 9, stiffness: stiffness ?? Math.max(4, Math.round(radius * 0.5)), rnd, rs, resW: 0, resP: null, K: 0, carry: 0, model, lag, tip: null, bend: 0, seed, dips: 0, sinceDip: 0, variety, merge };
}

/** Dip: water at a pigment concentration (per unit of water, per pigment), into the belly and every bristle. */
export function dip(brush, { water = 1, conc }) {
  // A pending GPU stroke's hair state is overwritten here; stroke() still restores the generator state.
  if (brush._pend) brush._pend.hairs = false;
  if (TAPE && brush._tapeId !== undefined) TAPE.push({ k: 'd', b: brush._tapeId, w: water, c: Array.from(conc) });
  brush.K = conc.length; brush.load = water; brush.carry = 0; brush.travel = 0;
  brush.dips = (brush.dips ?? 0) + 1; brush.sinceDip = 0; brush._onPaper = false;
  if (varietyOf(brush)) reclump(brush);
  brush.resW = water * brush.capacity * brush.hairs.length * brush.belly; brush.resP = conc.map(v => v * brush.resW);
  for (const hr of brush.hairs) { hr.water = water * brush.capacity * hr.len; hr.pig = conc.map(v => v * hr.water); }
  if (brush.loadWater > 0) {
    const total = water * brush.loadWater;
    const tipCap = brush.capacity * brush.hairs.reduce((a, hr) => a + hr.len, 0);
    // A blotted brush remains dry; a loaded belly keeps the tips saturated.
    const tip = Math.min(total, tipCap * (water < brush.free ? water : 1));
    for (const hr of brush.hairs) { hr.water = tip * hr.len * brush.capacity / tipCap; hr.pig = conc.map(v => v * hr.water); }
    brush.resW = total - tip; brush.resP = conc.map(v => v * brush.resW);
  }
}

/** A thirsty brush: a dip at a little water and no pigment, damp with no free liquid, for lifting out of a wet wash.
 *  The lifting happens in `stroke`, where a hair below `free` saturation over a wet cell drinks water and pigment. */
export function thirsty(brush, { water = 0.15 } = {}) {
  if (!Number.isFinite(water) || water < 0) throw new RangeError('thirsty water must be finite and nonnegative');
  // zero concentration of the last dip's pigments keeps the hairs as wide as the sheet's pigment list
  dip(brush, { water, conc: new Array(brush.K || 1).fill(0) });
  return brush;
}

const moveMass = (from, to, water) => { // water and its share of pigment from one {water, pig} to another
  if (water <= 0 || from.water <= 0) return;
  const f = Math.min(1, water / from.water);
  for (let k = 0; k < from.pig.length; k++) { const q = from.pig[k] * f; from.pig[k] -= q; to.pig[k] += q; }
  const wq = from.water * f; from.water -= wq; to.water += wq;
};
// moveMass from the belly into a hair, without the accessor object: this runs for every hair on every step.
const feedHair = (brush, pig, hr, water) => {
  if (water <= 0 || brush.resW <= 0) return;
  const f = Math.min(1, water / brush.resW);
  for (let k = 0; k < pig.length; k++) { const q = pig[k] * f; pig[k] -= q; hr.pig[k] += q; }
  const wq = brush.resW * f; brush.resW -= wq; hr.water += wq;
};
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// The paper under a hair: the tooth averaged over the contact length L (cells) behind the tip, plus fine fibre relief.
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
// a smooth random value in [0, 1] over the sheet (cells / scale): the hand's variance as a field over the paper
const hash2 = (c, i, j) => { const v = Math.sin(c * 91.7 + i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
const field2 = (c, x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const a = hash2(c, i, j), b = hash2(c, i + 1, j), d = hash2(c, i, j + 1), e = hash2(c, i + 1, j + 1);
  return a + (b - a) * u + (d - a) * w + (a - b - d + e) * u * w;
};

// Stroke variety, all deterministic: the hand lands and lifts, pressure, width and line wander (varyPath), hairs
// re-clump per dip, the wet edge breathes and follows the tooth (sidesAt, edgeShift), a stroke films a cell once,
// and the outer hairs merge with damp paint they overlap (mergePickup). Without it, overlapping strokes dry as ruled seams.
// Variety 0 (setStrokeVariety, a brush's variety, or STROKE_VARIETY=0) turns all of it off.
// Environment switches, read once; the browser (Paint Lab) has no process and runs with none set.
const ENV = typeof process !== 'undefined' ? process.env : {};
const ENV_V = ENV.STROKE_VARIETY === '0' ? 0 : 1;
let VARIETY = ENV_V, MERGE = ENV_V;
export const setStrokeVariety = (v = 1, { merge = v ? 1 : 0 } = {}) => { VARIETY = +v; MERGE = +merge; };
const varietyOf = b => b.variety ?? VARIETY;
export const mergeOf = b => b.merge ?? MERGE;
const hashu = (a, b, c) => {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296;
};
// A stroke's key comes from its planned path, so one pass per pigment over the same path lands as one stroke and the
// mixture does not fringe. A stroke laid in several calls keeps the key it landed with.
const pathKey = path => { const a = path[0], b = path[path.length - 1]; return [Math.round(a.x * 4) | 0, Math.round(a.y * 4) | 0, (Math.round(b.x * 4) ^ Math.imul(Math.round(b.y * 4), 65599) ^ Math.imul(path.length, 40503)) | 0]; };
const keyOf = (b, path) => (b._onPaper && b._strokeKey ? b._strokeKey : pathKey(path));
const strokePhase = key => Math.floor(4096 * hashu(key[0] + 7, key[1], key[2]));
// where along its wander a stroke starts: set as the brush lands (brush.travel drives the splay, clump wander and grain)
function land(b, path) {
  if (!varietyOf(b) || b._onPaper || !Array.isArray(path) || !path.length) return;
  b._strokeKey = pathKey(path); b.travel = strokePhase(b._strokeKey);
}
function nextStroke(b) { b._onPaper = false; b.sinceDip = (b.sinceDip ?? 0) + 1; }
// each dip clumps the hairs afresh without advancing the generator
function reclump(b) {
  const clumps = []; let left = 0, c = -1;
  for (let j = 0; j < b.hairs.length; j++) {
    if (left <= 0) { c++; left = 2 + Math.floor(hashu(b.seed ?? 3, b.dips, 1000 + j) * 6); clumps.push({ lift: hashu(b.seed ?? 3, b.dips, 5000 + c) }); }
    left--; b.hairs[j].clump = c;
  }
  b.clumps = clumps;
}
// The footprint's two half-widths here: the brush's splay, plus with variety a breathing edge at two scales. The
// breathing is a field over the paper so passes of one mixture over the same path keep their edges together.
function sidesAt(brush, half, x = 0, y = 0) {
  const v = varietyOf(brush), t = brush.travel;
  if (!v) return [half * (1 + brush.splay * (2 * along1(1001, t / 9) - 1)), half * (1 + brush.splay * (2 * along1(2003, t / 9) - 1))];
  const l1 = Math.max(3, 0.8 * half), l2 = Math.max(8, 3 * half);
  const s = c => brush.splay * (2 * along1(c, t / 9) - 1) + v * (0.05 * (2 * field2(c + 17, x / l1, y / l1) - 1) + 0.05 * (2 * field2(c + 29, x / l2, y / l2) - 1));
  return [half * (1 + s(1001)), half * (1 + s(2003))];
}
// the most sidesAt can add, as a share of half
export const sideReach = brush => Math.abs(brush.splay) + 0.1 * varietyOf(brush);
// How far the wet rim shifts with the tooth, in cells (0.08 mm, clamped at twice that); 0 without variety.
export const edgeTooth = (brush, paper) => { const v = varietyOf(brush); return v && paper?.height ? v * 0.08 / (paper.mmPerCell || 280 / 1086) : 0; };
// a cell's distance across the footprint, moved by the tooth there (towards the centre on high paper, away in hollows)
const edgeShift = (across, ET, height) => {
  if (!ET) return across;
  const e = ET * Math.max(-2, Math.min(2, (height - 0.54) / 0.16));
  return across < 0 ? Math.min(0, across + e) : Math.max(0, across - e);
};
// Paint brushed over paint still damp in the paper trades places with it: the hair takes up some of the old paint as
// it lays the new, so a same-load overlap nets out with no dark seam. Dry pores glaze as usual.
function mergePickup(m, sheet, i, hr, give, ks, edge = 1) {
  const cap = sheet.paper.capacity[i], si = sheet.s[i];
  if (!(cap > 0) || !(si > 0)) return;
  // the trade falls off with the cell's share of the brush's own pigments, so a different mixture keeps its hue
  let mine = 0, all = 0; for (let k = 0; k < sheet.K; k++) all += sheet.D[k][i]; for (const k of ks) mine += sheet.D[k][i];
  if (!(all > 0)) return;
  // damp paint only: full below a film of 0.005, none above 0.02, where wetMix trades with the standing film instead
  const wet = Math.min(1, Math.max(0, (0.02 - sheet.W[i]) / 0.015)), sim = mine / all, ft = Math.min(1, m * Math.min(1, si / cap) * give / si) * sim * sim * sim * sim * wet * edge;
  for (const k of ks) { const q = sheet.D[k][i] * ft; if (q > 0) { sheet.D[k][i] -= q; hr.pig[k] += q; } }
}
// The executed path is deterministic from brush state, so CPU and GPU contact agree;
// the tape keeps the planned path.
export function varyPath(brush, path, paper, lift = true) {
  const v = varietyOf(brush); if (!v || !Array.isArray(path) || path.length < 2) return path;
  const R0 = brush.radius, maxSeg = Math.max(1.5, 0.5 * R0), pts = [];
  for (let k = 0; k < path.length; k++) {
    const a = path[k];
    if (k) {
      const b = path[k - 1], L = Math.hypot(a.x - b.x, a.y - b.y), m = Math.min(400, Math.ceil(L / maxSeg));
      for (let j = 1; j < m; j++) {
        const u = j / m, q = { ...b, x: b.x + (a.x - b.x) * u, y: b.y + (a.y - b.y) * u };
        if (b.p != null || a.p != null) q.p = (b.p ?? 1) + ((a.p ?? 1) - (b.p ?? 1)) * u;
        if (b.r !== undefined) q.r = b.r + ((a.r ?? b.r) - b.r) * u;
        pts.push(q);
      }
    }
    pts.push({ ...a });
  }
  const n = pts.length, S = new Float64Array(n);
  for (let k = 1; k < n; k++) S[k] = S[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  const L = S[n - 1]; if (!(L > 1)) return path;
  const mmc = paper?.mmPerCell || 280 / 1086;
  // wander, pressure and spread are fields over the paper (see sidesAt), so passes over one path register
  const lw = Math.max(6, 4 * R0), lp = Math.max(8, 5 * R0), lo = Math.max(8, 3 * R0);
  let pmin = Infinity, pmax = -Infinity; for (const q of path) { const p = q.p ?? 1; pmin = Math.min(pmin, p); pmax = Math.max(pmax, p); }
  // the hand lands where the brush was off the paper, and lifts where this call lifts it
  const flatP = pmax - pmin < 0.03, landOn = !brush._onPaper, liftOn = lift !== false, land = Math.min(0.15 * L, 0.8 * R0), liftL = Math.min(0.25 * L, 1.5 * R0), capOff = 0.5 / mmc;
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], tl = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / tl, ny = (b.x - a.x) / tl;
    const q = pts[k], rad = q.r ?? R0, s = S[k];
    let off = rad * (0.12 * (2 * field2(4001, q.x / lo, q.y / lo) - 1) + 0.06 * (2 * field2(4003, q.x / lw, q.y / lw) - 1)) * v;
    off = Math.max(-capOff, Math.min(capOff, off));
    const o = { ...q, x: q.x + nx * off, y: q.y + ny * off };
    let p = (q.p ?? 1) * (1 + 0.07 * v * (2 * field2(4005, q.x / lp, q.y / lp) - 1));
    if (flatP && landOn) p *= 1 - v + v * (0.6 + 0.4 * smooth(s / land));
    if (flatP && liftOn) p *= 1 - v + v * (0.45 + 0.55 * smooth((L - s) / liftL));
    o.p = Math.max(0, Math.min(1.2, p));
    o.r = Math.max(0, rad * (1 + 0.05 * v * (2 * field2(4007, q.x / lw, q.y / lw) - 1)));
    out[k] = o;
  }
  return out;
}
// The heading the footprint lies across. Taking each path segment's own direction snapped the strip round at every
// vertex, and a wide footprint left a notch on the outside of each kink: a scalloped edge at the vertex spacing of a
// pointer or pixel-grid path. A real brush turns smoothly, so the heading eases towards the segment over half the
// footprint's half-width and swings the footprint's end at most 1.2 cells a step, which keeps successive strips
// overlapping. `head` is the previous step's heading ([x, y], null when the brush has just landed); a turn of 90 degrees
// or more starts afresh, as reversing a footprint lays it on the same line. A press on one point has no direction of
// its own: it keeps the heading it has, or the sheet's vertical, instead of a zero heading that passes every cell of
// the footprint's box. Returns a new [x, y].
export function turnHeading(head, tx, ty, half, spacing) {
  if (!tx && !ty) return head ?? [0, 1];
  if (!head || head[0] * tx + head[1] * ty <= 0) return [tx, ty];
  const a0 = Math.atan2(head[1], head[0]);
  let d = Math.atan2(ty, tx) - a0;
  if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(d) < 1e-9) return [tx, ty];
  const reach = Math.max(1, half), ease = 1 - Math.exp(-spacing / Math.max(spacing, 0.5 * reach)), cap = 1.2 / reach;
  const a = a0 + Math.max(-cap, Math.min(cap, d * ease));
  return [Math.cos(a), Math.sin(a)];
}
// The row footprint's half-width at a point of the path, as the step lays it (the tuft's own spread aside)
const footHalf = (brush, a, b, u, p) => {
  const radius = a.r === undefined ? brush.radius : a.r + ((b.r ?? a.r) - a.r) * u;
  return brush.flat ? radius * (0.9 + 0.1 * p) * Math.sqrt(Math.min(1, p / 0.5)) : radius * (0.25 + 0.75 * p);
};
// Quantiles of the ground for this paper and hair length, so a load maps to coverage whatever the paper's scale.
const GROUNDS = new WeakMap();
function groundQuantiles(paper, L, fine, coarse) {
  let byPaper = GROUNDS.get(paper); if (!byPaper) GROUNDS.set(paper, (byPaper = new Map()));
  const key = `${L}:${fine}:${coarse}`; if (byPaper.has(key)) return byPaper.get(key);
  const { w, h } = paper, gs = []; let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // a paper narrower than the contact length has no interior to sample: keep the samples on the sheet
  const spanX = Math.max(1, w - 2 * L), spanY = Math.max(1, h - 2 * L);
  // Scaled replay brushes have fractional stiffness; paper samples must still be integer cells.
  const at = (span, len, r) => Math.min(len - 1, Math.floor(L + r * span));
  for (let j = 0; j < 4000; j++) { const a = rnd() * 2 * Math.PI; gs.push(groundAt(paper, at(spanX, w, rnd()), at(spanY, h, rnd()), Math.cos(a), Math.sin(a), L, fine, coarse)); }
  gs.sort((x, y) => x - y);
  const q = Float32Array.from({ length: 201 }, (_, k) => gs[Math.round((k / 200) * (gs.length - 1))]);
  byPaper.set(key, q); return q;
}

// The mark tape: off unless a recorder is attached. It records calls (createBrush options, dips, strokes), never
// pixels, so a player can redraw the marks by making the same calls in order.
export let TAPE = null;
// One entry per createBrush call, since a brush carries residual paint between strokes; option sets are deduped.
export let BRUSHES = null;
export let BRUSHOPTS = null;
// The pen's own dictionary on the same tape, one entry per createPen call.
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
// Option sets dedupe into `opts`; one entry per call goes in `calls`, and the id is that call's index.
const instrumentId = (options, seen, calls, opts) => {
  const key = JSON.stringify(options);
  let o = seen.get(key);
  if (o === undefined) { o = opts.length; opts.push(options); seen.set(key, o); }
  calls.push(o);
  return calls.length - 1;
};
const brushId = options => instrumentId(options, optKey, BRUSHES, BRUSHOPTS);
export const penId = options => instrumentId(options, penKey, PENS, PENOPTS);
// A painting saved at a passage boundary and taken over by a fresh process (tools/aware/pause.mjs) keeps one tape. The
// instrument dictionaries are saved with it and refilled in place (pen.mjs holds live bindings to them).
export const tapeState = () => (TAPE ? { tape: TAPE.length, brushes: BRUSHES.slice(), brushOpts: BRUSHOPTS.slice(), pens: PENS.slice(), penOpts: PENOPTS.slice() } : null);
export const restoreTapeState = s => {
  if (!TAPE || !s) throw new Error('restoreTapeState: no tape recorder attached');
  const refill = (a, b) => { a.length = 0; for (const v of b) a.push(v); };
  refill(BRUSHES, s.brushes); refill(BRUSHOPTS, s.brushOpts); refill(PENS, s.pens); refill(PENOPTS, s.penOpts);
  optKey.clear(); BRUSHOPTS.forEach((o, i) => optKey.set(JSON.stringify(o), i));
  penKey.clear(); PENOPTS.forEach((o, i) => penKey.set(JSON.stringify(o), i));
};

// The rectangle a stroke can touch: its path's box plus the brush's widest reach.
// How far past its path a stroke of radius r can touch the paper, in cells.
export function strokeReach(brush, paper, r = brush.radius) {
  const vm = varietyOf(brush) ? 0.25 * r + 2 * edgeTooth(brush, paper) + 0.5 / (paper?.mmPerCell || 280 / 1086) : 0; // varyPath's wander and edgeShift
  return Math.ceil(r * (brush.model === 'tuft' ? 2.2 : 1) * (1 + (brush.splay ?? 0)) + 3 + vm);
}
function strokeRect(brush, sheet, path) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, r = brush.radius;
  for (const q of path) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; if (q.r != null && q.r > r) r = q.r; }
  const b = strokeReach(brush, sheet.paper, r), X0 = Math.max(0, Math.floor(x0 - b)), Y0 = Math.max(0, Math.floor(y0 - b)), X1 = Math.min(sheet.w - 1, Math.ceil(x1 + b)), Y1 = Math.min(sheet.h - 1, Math.ceil(y1 + b));
  const A = Math.min(X0, sheet.w - 1), B = Math.min(Y0, sheet.h - 1); // a path wholly off the sheet touches nothing: one cell keeps the rectangle valid
  return [A, B, Math.max(1, X1 - A + 1), Math.max(1, Y1 - B + 1)];
}

// Splats (--washsplat), based on Sudo Aquarelle (https://sudoaquarelle.com/, no code copied): a loaded
// wash brush (capacity >= 50, dipped at >= 0.3) lays soft round splats every max(0.38 r, 1.5) cells instead of hairs.
// Each cell gets water by smoothstep(r, 0.25 r) of its distance, at the brush's concentration.
// `water` scales each splat's water (1: the film a hair aims for at the middle of a sweep).
let WASH_SPLAT = false, SPLAT_WATER = 1;
export const setWashSplat = (on, { water = 1 } = {}) => { WASH_SPLAT = !!on; SPLAT_WATER = water; };
export const splatWater = () => SPLAT_WATER;
const splats = brush => WASH_SPLAT && brush.capacity >= 50 && (brush.load ?? 0) >= 0.3;
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// the brush as one reservoir: water, the paint's concentration, and the water it would hold dipped at 1
function reservoir(brush, K) {
  let W = brush.resW, len = 0; const P = new Float64Array(K);
  for (let k = 0; k < K; k++) P[k] = brush.resP?.[k] ?? 0;
  for (const hr of brush.hairs) { W += hr.water; len += hr.len; if (hr.pig) for (let k = 0; k < K; k++) P[k] += hr.pig[k]; }
  const conc = Float64Array.from(P, v => (W > 0 ? v / W : 0));
  return { W, conc, cap: brush.capacity * (len + brush.hairs.length * brush.belly) };
}
// what the brush keeps after giving water: every hair and the belly by the same share
function drain(brush, f) {
  if (f === 1) return;
  for (const hr of brush.hairs) { hr.water *= f; if (hr.pig) for (let k = 0; k < hr.pig.length; k++) hr.pig[k] *= f; }
  brush.resW *= f; if (brush.resP) for (let k = 0; k < brush.resP.length; k++) brush.resP[k] *= f;
}
// The splats of a path, with the flows `between` asks for after each (walked as strokeImpl walks: a step every `spacing`)
function splatWalk(brush, path, spacing, between, onSplat, onFlow) {
  let t = brush.carry, k = 1, steps = 0, lx = NaN, ly = NaN, lsp = 0;
  const put = (x, y, r, p) => { const sp = Math.max(0.38 * r, 1.5); if (lx === lx && Math.hypot(x - lx, y - ly) < Math.max(sp, lsp)) return; onSplat(x, y, r, p, sp); lx = x; ly = y; lsp = sp; };
  let lastQ = null;
  while (k < path.length) {
    const a = path[k - 1], b = path[k], seg = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (t > seg) { t -= seg; k++; continue; }
    const u = t / seg, q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * u };
    const radius = a.r === undefined ? brush.radius : a.r + ((b.r ?? a.r) - a.r) * u;
    const half = brush.flat ? radius * (0.9 + 0.1 * q.p) * Math.sqrt(Math.min(1, q.p / 0.5)) : radius * (0.25 + 0.75 * q.p);
    put(q.x, q.y, half + 0.5, q.p); lastQ = { x: q.x, y: q.y, r: half + 0.5, p: q.p };
    steps++; if (between) { onFlow(); between(steps); }
    t += spacing; brush.travel += spacing;
  }
  const e = path[path.length - 1];
  if (lastQ && path.length > 1) put(e.x, e.y, lastQ.r, lastQ.p);
  brush.carry = t;
  return steps;
}
// One splat on a CPU sheet; returns the water given. `c` is one splat's share of a touch: a cell on the stroke's
// line sits under about 1.25 r / spacing splats.
function splatCpu(sheet, x, y, r, want, c, brush, p, conc, pig) {
  const { w, h } = sheet, clip = sheet.clip ?? null, K = sheet.K;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(w - 1, Math.ceil(x + r)), y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(h - 1, Math.ceil(y + r));
  let used = 0;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const i = yy * w + xx; if (clip && !clip[i]) continue;
    const fall = sstep(r, 0.25 * r, Math.hypot(xx + 0.5 - x, yy + 0.5 - y)); if (fall <= 0) continue;
    // wetMix trades paint with a wet film; the brush's own concentration is held, as its belly dwarfs one stroke
    if (brush.wetMix && sheet.W[i] > 0.03) {
      const water = sheet.W[i], ex = water * brush.wetMix * fall * c;
      for (let k = 0; k < K; k++) sheet.G[k][i] = Math.max(0, sheet.G[k][i] + ex * (conc[k] - sheet.G[k][i] / water));
    }
    const Wi = sheet.W[i], give = fall * c * (brush.film * (0.7 + 0.3 * p) * (1 - Math.min(1, Wi / 0.2)) + brush.give * Math.max(0, want - Wi) * p);
    if (give <= 0) continue;
    for (let k = 0; k < K; k++) pig[k] = conc[k] * give;
    soak(sheet, i, give, pig); used += give;
  }
  return used;
}
// the water a hair aims for here (strokeImpl's `want`), from the brush's free liquid
const splatWant = (brush, Wb, cap, p) => {
  const sat = cap > 0 ? Wb / cap : 0, freeL = Math.max(0, (sat - brush.free) / (1 - brush.free));
  return brush.wetness * freeL * (0.6 + 0.4 * p);
};
function splatStroke(brush, sheet, path, { spacing = 0.7, between, lift = true, upright = false } = {}) {
  const link = sheet._gpu, prior = brush._pend;
  if (prior && !(link?.resident && prior.splat && prior.link === link && !link.paused && path.length)) prior.link.settleBrush(brush);
  if (link && !link.paused && path.length) return splatStrokeGpu(brush, sheet, path, { spacing, between, lift, upright });
  const rec = tapeStroke(brush, sheet, path, { spacing, lift, upright, splat: true });
  land(brush, path); path = varyPath(brush, path, sheet.paper, lift);
  if (rec) collectFlows(rec, () => steps);
  const K = sheet.K, R = reservoir(brush, K), pig = new Float64Array(K), W0 = R.W;
  let Wb = R.W, steps = 0;
  const pending = [];
  splatWalk(brush, path, spacing, between ? s => { steps = s; between(s); } : null, (x, y, r, p, sp) => {
    if (Wb <= 0) return;
    Wb = Math.max(0, Wb - splatCpu(sheet, x, y, r, splatWant(brush, Wb, R.cap, p), SPLAT_WATER * sp / (1.25 * r), brush, p, R.conc, pig));
  }, () => {});
  if (rec) collectFlows(null, null);
  drain(brush, W0 > 0 ? Wb / W0 : 1);
  if (lift) { brush.carry = 0; nextStroke(brush); } else brush._onPaper = true;
  return Wb;
}
// GPU splats: planned here, laid by stepfull.wgsl splat_run.
function splatStrokeGpu(brush, sheet, path, { spacing, between, lift, upright }) {
  const link = sheet._gpu, rec = tapeStroke(brush, sheet, path, { spacing, lift, upright, splat: true });
  land(brush, path); path = varyPath(brush, path, sheet.paper, lift);
  let steps = 0;
  if (rec) collectFlows(rec, () => steps);
  const K = sheet.K, R = reservoir(brush, K), recs = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, flowsBefore = 0;
  const plan = { flows: () => { if (recs.length) recs[recs.length - 1][5]++; else flowsBefore++; } };
  link.splatPlanning = plan;
  splatWalk(brush, path, spacing, between ? s => { steps = s; link.planning = plan; try { between(s); } finally { link.planning = null; } } : null, (x, y, r, p, sp) => {
    recs.push([x, y, r, p, sp, 0]);
    x0 = Math.min(x0, Math.floor(x - r)); x1 = Math.max(x1, Math.ceil(x + r)); y0 = Math.min(y0, Math.floor(y - r)); y1 = Math.max(y1, Math.ceil(y + r));
  }, () => {});
  link.splatPlanning = null;
  if (rec) collectFlows(null, null);
  link.postSplats(sheet, brush, { recs, flowsBefore, rect: [x0, y0, x1, y1], conc: R.conc, W: R.W, cap: R.cap, scale: SPLAT_WATER });
  if (lift) { brush.carry = 0; nextStroke(brush); } else brush._onPaper = true;
  return undefined;
}

// CPU_STROKE_TRACE=1: count why strokes stayed on the CPU copy, printed at exit
const CPU_TRACE = ENV.CPU_STROKE_TRACE === '1' ? new Map() : null;
if (CPU_TRACE) process.on('exit', () => { for (const [k, n] of CPU_TRACE) console.error(`CPUSTROKE ${n} ${k}`); });
export function stroke(brush, sheet, path, options = {}) {
  if (brush.model !== 'tuft' && !brush.depositDepth && splats(brush)) return splatStroke(brush, sheet, path, options);
  const link = sheet._gpu;
  // A stroke goes to the GPU when its `between` only flows the sheet; gpuBetween: false keeps it on the CPU copy.
  // The link throws if a `between` reads the sheet during planning.
  const betweenOk = !options.between || options.gpuBetween === true || (options.gpuBetween !== false && link?.anyBetween);
  // The GPU contact kernel is row-only: tufts use CPU contact; metered tips require GPU_RESIDENT=1.
  const planLimit=link?.strokePlanCapacity??3900000;
  let fits=planFits(brush,varyPath(brush,path,sheet.paper,options.lift),options.spacing??.7,planLimit);
  if(!fits&&link&&!link.paused&&link.brushGpu&&betweenOk&&brush.model!=='tuft'&&(!brush.depositDepth||ENV.GPU_RESIDENT==='1')&&ENV.GPU_LOCAL_ROW_PLAN==='1'&&onGpu(brush,sheet)){
    const bound=localRowPlanBound(brush,sheet,path,options,planLimit);fits=bound.eligible;
    const stats=link.stats??(link.stats={});stats.localRowPlanChecks=(stats.localRowPlanChecks??0)+1;
    if(fits){stats.localRowPlanAdmitted=(stats.localRowPlanAdmitted??0)+1;stats.localRowPlanWords=(stats.localRowPlanWords??0)+bound.words;stats.localRowPlanEmptySteps=(stats.localRowPlanEmptySteps??0)+bound.emptySteps;}
  }
  const gpuOk = brush.model !== 'tuft' && (!brush.depositDepth || ENV.GPU_RESIDENT === '1') && !!link && !link.paused && path.length > 0 && link.brushGpu && betweenOk && onGpu(brush, sheet) && fits;
  const p = brush._pend;
  if (p) {
    // A pending GPU stroke: continue on the GPU when possible (_cont 2 when hairs and belly are still there, 1 for the
    // generator only), otherwise settle the brush's state back first.
    if (gpuOk && !link.check && link.resident && !p.splat && p.link === link) {
      brush._cont = p.hairs ? 2 : 1; brush._restore = p.state;
    } else if (gpuOk && !link.check && !p.splat && link.lastPend === p && p.link === link) brush._cont = p.hairs ? 2 : 1;
    else p.link.settleBrush(brush);
  }
  if (CPU_TRACE && link && !gpuOk) { const k = JSON.stringify({ tuft: brush.model === 'tuft', depth: !!brush.depositDepth, paused: !!link.paused, empty: !path.length, brushGpu: !!link.brushGpu, betweenOk, onGpu: onGpu(brush, sheet), fits, model: brush.model, pathLen: path.length > 2000 ? '>2000' : path.length > 200 ? '>200' : 'small' }); CPU_TRACE.set(k, (CPU_TRACE.get(k) ?? 0) + 1); }
  if (!link || link.paused || !path.length) return strokeImpl(brush, sheet, path, options);
  if (gpuOk) {
    if (link.check) return checkedStroke(brush, sheet, path, options, { cpuStroke: strokeImpl, gpuStroke: strokeGpu, rect: link.validRect(strokeRect(brush, sheet, path)) });
    return strokeGpu(brush, sheet, path, options);
  }
  link.beginStroke(sheet, strokeRect(brush, sheet, path), { tracked: !options.between || options.gpuBetween === true, instrument:'brush', planOverflow:!!link.brushGpu&&onGpu(brush,sheet)&&!fits, periodic:options.gpuBetween===true&&typeof options.between==='function', flowEvery:options.flowEvery??0 });
  try { return strokeImpl(brush, sheet, path, options); } finally { link.endStroke(sheet); }
}

// The stroke's entry on the mark tape (nothing when no tape is recording); returns the list its flows are collected into.
function tapeStroke(brush, sheet, path, { spacing, lift, upright, splat = false }) {
  let rec = TAPE && brush._tapeId !== undefined && sheet._tape ? [] : null;
  // Only the painting's own sheet records; scrap test sheets do not.
  if (TAPE && brush._tapeId !== undefined && sheet._tape) TAPE.push({
    k: 's', b: brush._tapeId, points: path.map(p=>({...p})),
    u: upright === false ? 0 : upright === true ? 1 : 2,
    // prewet strokes: sheet.wetting marks sheet.ever, which bounds where later washes creep
    ...(sheet.wetting ? { wt: 1 } : {}),
    // defaults (lift, spacing 0.7) are left off the tape
    ...(lift ? {} : { lf: 0 }),
    ...(spacing === 0.7 ? {} : { sp: spacing }),
    ...(splat ? { splat: 1 } : {}),
    // step indices where this stroke flowed the sheet
    fl: rec,
    // points as integers: x and y in tenths of a cell, pressure in hundredths, and the point's own radius in tenths
    // when the path carries one (contained wash sweeps taper)
    d: path.some(q => q.r != null)
      ? path.map(q => [Math.round(q.x * 10), Math.round(q.y * 10), q.p == null ? -1 : Math.round(q.p * 100), q.r == null ? -1 : Math.round(q.r * 10)])
      : path.map(q => [Math.round(q.x * 10), Math.round(q.y * 10), q.p == null ? -1 : Math.round(q.p * 100)]),
  });
  return rec;
}

const unionRect = (a, b) => { const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]); return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0]; };
function strokeImpl(brush, sheet, path, { spacing = 0.7, between, lift = true, upright = false, flowEvery = 0, candidateMask = null } = {}) {
  const rec = candidateMask ? null : tapeStroke(brush, sheet, path, { spacing, lift, upright });
  land(brush, path); path = varyPath(brush, path, sheet.paper, lift);
  const { w, h, paper } = sheet, K = sheet.K, L = brush.stiffness, Q = candidateMask ? null : groundQuantiles(paper, L, brush.fine, brush.coarse);
  const ET = edgeTooth(brush, paper), sideX = ET ? 0.1 * varietyOf(brush) : 0, mergeM = mergeOf(brush);
  // the pigments this brush carries (the GPU's brushPigmentAt list): the ones it can take up from damp paint
  const mergeK = mergeM > 0 && !candidateMask && brush.resP ? Array.from({ length: K }, (_, k) => k).filter(k => brush.resP[k] > 0 || brush.hairs.some(hr => hr.pig && hr.pig[k] > 0)) : null;
  const belly = { get water() { return brush.resW; }, set water(v) { brush.resW = v; }, pig: brush.resP };
  const lanes = brush.hairs.length;
  // heading: the sheet's vertical, or with upright 'sweep' the run from the path's first point to its last
  let hx = 0, hy = 1;
  if (upright === 'sweep' && path.length > 1) {
    const ex = path[path.length - 1].x - path[0].x, ey = path[path.length - 1].y - path[0].y, em = Math.hypot(ex, ey);
    if (em > 1e-6) { hx = ex / em; hy = ey / em; }
  }
  let t = brush.carry, k = 1, steps = 0;
  if (rec) collectFlows(rec, () => steps);
  // a cell touched in the last few steps is not touched again; a stroke that loops back still paints over itself
  if (!sheet.touched || sheet.touched.length !== w * h) sheet.touched = new Int32Array(w * h).fill(-1e9);
  const tuft = brush.model === 'tuft';
  const roundLiquid = hr => !tuft || brush.flat ? 0 : smooth((hr.water / (brush.capacity * hr.len || 1) - brush.free) / (1 - brush.free));
  const liquidShare = brush.hairs.reduce((v,hr)=>Math.max(v,roundLiquid(hr)),0);
  const maxRadius = path.reduce((v,pt)=>Math.max(v,pt.r ?? brush.radius),0);
  const stamp = sheet.touched, recent = Math.ceil((tuft ? Math.max(4,liquidShare*(2.2*maxRadius+2)) : 4) / spacing);
  if (tuft && (!sheet.contactStrength || sheet.contactStrength.length !== w*h)) sheet.contactStrength = new Float32Array(w*h);
  const strengths = sheet.contactStrength;
  // the wash edge a painter holds the bead to (sheet.mjs setClip); unset, the brush reaches wherever it touches
  const clip = sheet.clip ?? null;
  sheet.clock = sheet.clock ?? 0; // shared by every instrument on this sheet
  // recent-contact suppression lasts one uninterrupted stroke; drying does not advance this clock
  if (sheet._contactBrush !== brush) sheet.clock += recent;
  // With variety, one stroke films a cell once until the brush lifts: fibres it has just wetted wick no more film.
  if (varietyOf(brush) && (!brush._onPaper || brush._strokeT0 === undefined)) brush._strokeT0 = sheet.clock;
  const onceT0 = varietyOf(brush) && brush.model !== 'tuft' ? brush._strokeT0 : Infinity;
  sheet._contactBrush = brush;
  // a clump's wander is computed once per step, not per cell
  const hairs = brush.hairs, nClumps = brush.clumps.length, wanderOf = new Float64Array(nClumps), wanderAt = new Int32Array(nClumps).fill(-1);
  let pigBuf = new Float64Array(0), stepNo = 0;
  const offs = tuft ? new Float64Array(lanes) : null, liquidOf = new Float64Array(lanes);
  let head = brush._onPaper ? brush.heading ?? null : null;
  while (k < path.length) {
    const a = path[k - 1], b = path[k], seg = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (t > seg) { t -= seg; k++; continue; }
    const u = t / seg, q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * u };
    let tx = upright ? hx : (b.x-a.x)/seg, ty = upright ? hy : (b.y-a.y)/seg;
    // a tuft turns with its trailing tip below, which already eases the heading
    if (!upright && !tuft) { head = turnHeading(head, tx, ty, footHalf(brush, a, b, u, q.p), spacing); [tx, ty] = head; }
    let cx=q.x,cy=q.y,reachOff=0,pe=q.p;
    if (tuft) {
      const tp=brush.tip ?? (brush.tip={x:q.x,y:q.y});
      brush.bend += (q.p-brush.bend)*(1-Math.exp(-spacing/(brush.radius*(q.p>brush.bend?.9:.35))));
      pe=brush.bend;
      const lagLen=Math.max(.3,(a.r===undefined?brush.radius:a.r)*brush.lag*(.25+.75*pe)),kTip=1-Math.exp(-spacing/lagLen);
      tp.x+=(q.x-tp.x)*kTip;tp.y+=(q.y-tp.y)*kTip;
      const sx=q.x-tp.x,sy=q.y-tp.y,sm=Math.hypot(sx,sy);
      if (!upright && sm>.25) { const wgt=Math.min(1,sm/(.5*lagLen+.5));let ux=tx+(sx/sm-tx)*wgt,uy=ty+(sy/sm-ty)*wgt;const um=Math.hypot(ux,uy)||1;tx=ux/um;ty=uy/um; }
      cx=tp.x;cy=tp.y;
    }
    const nx=-ty,ny=tx;
    // a flat brush keeps its width under pressure; as it lifts, the corners leave the paper first and the end rounds off
    const radius = a.r === undefined ? brush.radius : a.r + ((b.r ?? a.r) - a.r) * u;
    let half = brush.flat ? radius * (0.9 + 0.1 * q.p) * Math.sqrt(Math.min(1, q.p / 0.5)) : radius * (0.25 + 0.75 * q.p);
    if (tuft) {
      half=brush.flat?radius*(.9+.1*pe)*Math.sqrt(Math.min(1,pe/.5))*(1+.1*pe):radius*(.2+.65*pe+.2*pe*pe);
      const reach=radius*.9*(.15+.85*pe);
      for(let j=0;j<lanes;j++){const rel=lanes>1?2*j/(lanes-1)-1:0;offs[j]=brush.flat?-radius*.35*pe*rel*rel:reach*(1-hairs[j].len);reachOff=Math.max(reachOff,Math.abs(offs[j]));}
    }
    // the outer hairs press less, so in the fringe they touch only where the paper stands high
    const [sideL, sideR] = sidesAt(brush, half, cx, cy);
    const fringe = 1 + 0.08 * half;

    // the belly feeds the bristles up to the dip's level; a dry bristle takes a little from its neighbours
    for (let j = 0; j < lanes; j++) {
      const hr = hairs[j];
      if (candidateMask) { liquidOf[j]=roundLiquid(hr); continue; }
      const target = brush.capacity * hr.len * Math.min(1, brush.load ?? 1);
      if (hr.water < target && brush.resW > 0) feedHair(brush, belly.pig, hr, Math.min(brush.resW, (target - hr.water) * brush.feed));
      if (hr.water < 0.05 * brush.capacity && brush.rnd() < 0.05) { const nb = hairs[Math.max(0, Math.min(lanes - 1, j + (brush.rnd() < 0.5 ? -1 : 1)))]; moveMass(nb, hr, nb.water * 0.2); }
      liquidOf[j]=roundLiquid(hr);
    }

    const roundReach=brush.flat?0:half*liquidShare;
    const R = Math.ceil(half * (1 + sideX) + 1 + reachOff + 2 * ET), thin = spacing * 0.5 + 1.1 + reachOff + roundReach;
    // an upright brush touches a thin strip across its heading, not its whole bounding square
    const rx = upright ? Math.abs(ty) * R + Math.abs(tx) * thin : R, ry = upright ? Math.abs(tx) * R + Math.abs(ty) * thin : R;
    // Each row is cut to the strip a step can touch, a cell wider than the exact per-cell tests below.
    const reachA = spacing * 0.5 + 0.6 + reachOff + roundReach, reachS = Math.max(sideL, sideR) + 0.5 + 2 * ET, clk = sheet.clock;
    const X0 = Math.max(0, Math.floor(cx - rx)), X1 = Math.min(w - 1, Math.ceil(cx + rx)), Y1 = Math.min(h - 1, Math.ceil(cy + ry));
    const demandY0 = Math.max(0, Math.floor(cy - ry));
    if (sheet._cpuDemandWindow && X1 >= X0 && Y1 >= demandY0)
      {
        const contact=[X0,demandY0,X1-X0+1,Y1-demandY0+1],count=tuft?0:lookaheadCount(flowEvery);
        if(!sheet._cpuDemandWindow.covers(contact)){const la=count?brushContactLookahead(brush,path,{k,t,spacing,upright,hx,hy,count,w,h}):null;
          sheet._cpuDemandWindow.require(la?unionRect(la,contact):contact);}
      }
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
        const dx = xx + 0.5 - cx, along = dx * tx + dy * ty, across = edgeShift(dx * nx + dy * ny, ET, paper.height[yy * w + xx]);
        const side = across < 0 ? sideL : sideR;
        if ((!tuft && Math.abs(along) > spacing * .5 + .6) || Math.abs(across) > side + .5) continue;
        if (clip && !clip[yy * w + xx]) continue;
        const recentContact=clk-stamp[yy*w+xx]<recent;
        if (recentContact && (!tuft || liquidShare<=0 || strengths[yy*w+xx]>=1)) continue;
        if (stamp[yy * w + xx] >= onceT0) continue;
        if (!tuft) stamp[yy*w+xx]=clk;
        const rel = side > 0 ? across / side : 0; // a flat brush lifted to no pressure has no width: everything is the centre lane
        const lane = Math.max(0, Math.min(lanes - 1, Math.round(((rel + 1) / 2) * (lanes - 1)))), hr = hairs[lane], outer = smooth((Math.abs(across) - (side - fringe)) / fringe);
        const laneAt=Math.max(0,Math.min(lanes-1,((rel+1)/2)*(lanes-1))),lower=Math.floor(laneAt),upper=Math.min(lanes-1,lower+1),liquid=liquidOf[lane];
        const hairOffset=tuft?offs[lane]:0,offset=tuft?hairOffset+liquid*(offs[lower]+(offs[upper]-offs[lower])*(laneAt-lower)-hairOffset):0;
        const cap=tuft?half*Math.sqrt(Math.max(0,1-Math.min(1,Math.abs(rel))**2))*liquid:0,alongLimit=spacing*.5+.6+cap;
        if (tuft && Math.abs(along-offset)>alongLimit) continue;
        if (tuft && liquidShare<=0) stamp[yy*w+xx]=clk;
        if (candidateMask) {
          if (q.p>0 && (brush.flat || q.p*(.6+.4*hr.len)>=.18+.5*(1-hr.len))) candidateMask[yy*w+xx]=1;
          continue;
        }
        // metered tips refill from the belly's finite mass at contact
        if (brush.depositDepth && (brush.load ?? 0) >= brush.free)
          feedHair(brush, belly.pig, hr, Math.max(0, brush.capacity * hr.len - hr.water));
        if (hr.water <= 1e-6) continue;
        if (!brush.flat && q.p * (0.6 + 0.4 * hr.len) < 0.18 + 0.5 * (1 - hr.len)) continue; // only the point touches when light
        const i = yy * w + xx, sat = hr.water / (brush.capacity * hr.len || 1);

        // Coverage shrinks as the hair empties (fill^breakup); each clump's share wanders along the stroke, so gaps streak.
        const cl = hr.clump;
        if (wanderAt[cl] !== stepNo) { wanderAt[cl] = stepNo; wanderOf[cl] = 1 + brush.streak * (2 * along1(cl + brush.clumps[cl].lift * 7, brush.travel / brush.streakLength) - 1); }
        const fill = Math.min(1, sat / brush.free), wander = wanderOf[cl];
        const empty = Math.max(0, Math.min(1, Math.max(0, 1 - sat / brush.free) * wander - (0.15 * (q.p - 0.7) - 0.6 * outer) * Math.min(1, 1.5 * (1 - fill))));
        let contact = smooth(side + 0.5 - Math.abs(across));
        if (tuft && liquid>0) contact*=1-liquid+liquid*smooth(alongLimit-Math.abs(along-offset));
        if (contact <= 0) continue;
        // `bridge`: the share of the paper's relief a loaded hair's liquid reaches down into (1 every pit, 0 off).
        // Deeper pits stay paper until the wash flows in. Fuller hairs, harder pressure and a fuller clump reach further.
        if (brush.bridge > 0 && brush.bridge < 1) {
          const relief = paper.relief ?? 0.2;
          const reach = (brush.depositDepth ? brush.bridge + (1 - brush.bridge) * fill : brush.bridge) * relief * (0.45 + 0.55 * fill) * (0.55 + 0.45 * q.p)
            * (1 + brush.bridgeStreak * (wander - 1));
          // bridgeSoft: how sharply the liquid stops; narrow gives scattered dots, wide gives graded cover
          const bridgeContact = smooth((paper.height[i] - paper.tooth[i] + reach) / (brush.bridgeSoft * relief) + 0.5);
          contact *= brush.depositDepth ? fill + (1 - fill) * bridgeContact : bridgeContact;
          if (contact <= 0) continue;
        }
        if (empty > 0) {
          const cov = (1 - empty) ** brush.breakup, qi = (1 - cov) * 200, lo = Math.min(199, Math.floor(qi)), g = Q[lo] + (Q[lo + 1] - Q[lo]) * (qi - lo);
          contact *= smooth((groundAt(paper, xx, yy, tx, ty, L, brush.fine, brush.coarse) - g) / 0.03 + 0.5);
          if (contact <= 0) continue;
        }

        const fullContact=contact;
        if (tuft && liquidShare>0 && recentContact) contact=Math.max(0,contact-strengths[i]);
        if (contact<=0) continue;
        markCpuStrokeCell(sheet, i);
        // wetMix: bristles in a wet film exchange equal volumes with it, charging prewet paper without a second puddle
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
          if (tuft) { stamp[i]=clk;strengths[i]=fullContact; }
          continue;
        }
        // a film of paint where it touches, plus free water towards the brush's wetness; proud fibres take more film,
        // read at the brush's grain offset
        let gi = i;
        if (brush.grainTable) {
          const [gdx, gdy] = brush.grainTable[((brush.travel / brush.grainPeriod) | 0) % brush.grainTable.length];
          gi = Math.min(paper.h - 1, Math.max(0, ((i / paper.w) | 0) + gdy)) * paper.w + Math.min(paper.w - 1, Math.max(0, (i % paper.w) + gdx));
        }
        const proud = paper.proud ? paper.proud[gi] : paper.height[gi] - paper.valley[gi];
        const grain = 0.7 + 1.2 * proud + 0.3 * paper.valley[gi];
        const give = Math.min(hr.water, contact * (brush.depositDepth ? Math.max(0, brush.depositDepth * (0.7 + 0.3 * q.p) - Wi) * (fill + (1 - fill) * grain) : (brush.film * grain * (0.7 + 0.3 * q.p) * (1 - Math.min(1, Wi / 0.2)) + brush.give * Math.max(0, want - Wi) * q.p)));
        if (give <= 0) continue;
        // only the outer hairs merge, where a stroke laps over its neighbour; merging the whole body stripes overlapping lanes
        if (mergeK) mergePickup(mergeM, sheet, i, hr, give, mergeK, Math.min(1, Math.max(0, (Math.abs(across) / (side || 1) - 0.5) / 0.3)));
        const f = give / hr.water, hp = hr.pig;
        if (pigBuf.length !== hp.length) pigBuf = new Float64Array(hp.length);
        const pig = pigBuf; for (let kk = 0; kk < hp.length; kk++) pig[kk] = hp[kk] * f;
        hr.water -= give; for (let kk = 0; kk < K; kk++) hr.pig[kk] -= pig[kk];
        soak(sheet, i, give, pig);
        if (tuft) { stamp[i]=clk;strengths[i]=fullContact; }
      }
    }
    steps++; if (between) between(steps);
    t += spacing; brush.travel += spacing; sheet.clock++;
  }
  brush.carry = t; // how far past the last point the next touch falls
  brush.heading = lift ? null : head;
  if (rec) collectFlows(null, null);
  if (candidateMask) return;
  if (!lift) { brush._onPaper = true; return brush.hairs.reduce((s2, hr) => s2 + hr.water, 0) + brush.resW; }
  brush.carry = 0; nextStroke(brush);
  if (tuft) { brush.tip=null;brush.bend=0; }
  sheet._contactBrush = null;
  // lifting off: hairs with free liquid leave a bead at the last contact, drawn from the tips only
  const last = path[path.length - 1], r = Math.max(1.5, brush.radius * 0.35), pool = { water: 0, pig: new Array(brush.K || K).fill(0) }; // sized to the hairs' pigment count so the bead can go back to the belly
  for (const hr of brush.hairs) if (hr.water / (brush.capacity * hr.len || 1) > brush.free) moveMass(hr, pool, Math.min(hr.water, 0.0015 * (brush.depositDepth || brush.capacity)));
  const cells = [];
  if (sheet._cpuDemandWindow) {
    const x0=Math.max(0,Math.floor(last.x-r)),x1=Math.min(w-1,Math.ceil(last.x+r));
    const y0=Math.max(0,Math.floor(last.y-r)),y1=Math.min(h-1,Math.ceil(last.y+r));
    if(x1>=x0 && y1>=y0)sheet._cpuDemandWindow.require([x0,y0,x1-x0+1,y1-y0+1]);
  }
  for (let yy = Math.floor(last.y - r); yy <= Math.ceil(last.y + r); yy++) for (let xx = Math.floor(last.x - r); xx <= Math.ceil(last.x + r); xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h && Math.hypot(xx - last.x, yy - last.y) <= r && sheet.M[yy * w + xx]) cells.push(yy * w + xx);
  if (pool.water > 0 && cells.length) for (const i of cells) { markCpuStrokeCell(sheet, i); deposit(sheet, i, pool.water / cells.length, pool.pig.map(v => v / cells.length)); }
  else if (pool.water > 0) moveMass(pool, belly, pool.water); // off the sheet or over dry paper, the bead stays on the brush
  return brush.hairs.reduce((s2, hr) => s2 + hr.water, 0) + brush.resW;
}

// The strokeImpl stroke with cell work on the GPU (gpu/stepfull.wgsl, stroke_run). Geometry and cell selection are
// planned here in the same double arithmetic as strokeImpl, so edge cells go the same way as on the CPU.
function strokeGpu(brush, sheet, path, { spacing = 0.7, between, lift = true, upright = false } = {}, observational = false) {
  const link = sheet._gpu, rec = observational ? null : tapeStroke(brush, sheet, path, { spacing, lift, upright });
  land(brush, path); path = varyPath(brush, path, sheet.paper, lift);
  const { w, h, paper } = sheet, K = sheet.K, L = brush.stiffness, Q = observational ? null : groundQuantiles(paper, L, brush.fine, brush.coarse);
  const ET = edgeTooth(brush, paper), sideX = ET ? 0.1 * varietyOf(brush) : 0;
  const hairs = brush.hairs, lanes = hairs.length, nClumps = brush.clumps.length;
  let hx = 0, hy = 1;
  if (upright === 'sweep' && path.length > 1) {
    const ex = path[path.length - 1].x - path[0].x, ey = path[path.length - 1].y - path[0].y, em = Math.hypot(ex, ey);
    if (em > 1e-6) { hx = ex / em; hy = ey / em; }
  }
  let t = brush.carry, k = 1, steps = 0;
  if (rec) collectFlows(rec, () => steps);
  if (!sheet.touched || sheet.touched.length !== w * h) sheet.touched = new Int32Array(w * h).fill(-1e9);
  const stamp = sheet.touched, recent = Math.ceil(4 / spacing), clip = sheet.clip ?? null;
  sheet.clock = sheet.clock ?? 0;
  if (sheet._contactBrush !== brush) sheet.clock += recent;
  // With variety, one stroke films a cell once until the brush lifts: fibres it has just wetted wick no more film.
  if (varietyOf(brush) && (!brush._onPaper || brush._strokeT0 === undefined)) brush._strokeT0 = sheet.clock;
  const onceT0 = varietyOf(brush) && brush.model !== 'tuft' ? brush._strokeT0 : Infinity;
  sheet._contactBrush = brush;
  const plan = link.beginPlan(sheet, brush, { K, lanes, nClumps, Q });
  const cI = [], cL = [], cA = []; // one step's cells: index, hair, distance across the brush
  let head = brush._onPaper ? brush.heading ?? null : null;
  while (k < path.length) {
    const a = path[k - 1], b = path[k], seg = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    if (t > seg) { t -= seg; k++; continue; }
    const u = t / seg, q = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * u };
    let tx = upright ? hx : (b.x - a.x) / seg, ty = upright ? hy : (b.y - a.y) / seg;
    if (!upright) { head = turnHeading(head, tx, ty, footHalf(brush, a, b, u, q.p), spacing); [tx, ty] = head; }
    const nx = -ty, ny = tx;
    const radius = a.r === undefined ? brush.radius : a.r + ((b.r ?? a.r) - a.r) * u;
    const half = brush.flat ? radius * (0.9 + 0.1 * q.p) * Math.sqrt(Math.min(1, q.p / 0.5)) : radius * (0.25 + 0.75 * q.p);
    const [sideL, sideR] = sidesAt(brush, half, q.x, q.y);
    const fringe = 1 + 0.08 * half;
    let gdx = 0, gdy = 0;
    if (brush.grainTable) [gdx, gdy] = brush.grainTable[((brush.travel / brush.grainPeriod) | 0) % brush.grainTable.length];
    const o = plan.step(), F = plan.F, I = plan.I, U = plan.U;
    F[o] = q.p; F[o + 1] = fringe; F[o + 2] = sideL; F[o + 3] = sideR; U[o + 4] = gdx + 1000000; U[o + 5] = gdy + 1000000; U[o + 6] = 0;
    F[o + 9] = tx; F[o + 10] = ty;
    for (let c = 0; c < nClumps; c++) F[o + 16 + c] = 1 + brush.streak * (2 * along1(c + brush.clumps[c].lift * 7, brush.travel / brush.streakLength) - 1);
    // strokeImpl's geometric tests, without reading what the cell holds
    const R = Math.ceil(half * (1 + sideX) + 1 + 2 * ET), thin = spacing * 0.5 + 1.1;
    const rx = upright ? Math.abs(ty) * R + Math.abs(tx) * thin : R, ry = upright ? Math.abs(tx) * R + Math.abs(ty) * thin : R;
    const reachA = spacing * 0.5 + 0.6, reachS = Math.max(sideL, sideR) + 0.5 + 2 * ET, clk = sheet.clock;
    const X0 = Math.max(0, Math.floor(q.x - rx)), X1 = Math.min(w - 1, Math.ceil(q.x + rx)), Y1 = Math.min(h - 1, Math.ceil(q.y + ry));
    let cnt = 0;
    for (let yy = Math.max(0, Math.floor(q.y - ry)); yy <= Y1; yy++) {
      const dy = yy + 0.5 - q.y;
      let lo = -Infinity, hi = Infinity;
      if (Math.abs(tx) > 1e-6) { const c = dy * ty, u1 = (-reachA - c) / tx, u2 = (reachA - c) / tx; lo = Math.max(lo, Math.min(u1, u2)); hi = Math.min(hi, Math.max(u1, u2)); }
      if (Math.abs(nx) > 1e-6 && reachS === reachS) { const c = dy * ny, u1 = (-reachS - c) / nx, u2 = (reachS - c) / nx; lo = Math.max(lo, Math.min(u1, u2)); hi = Math.min(hi, Math.max(u1, u2)); }
      let xa = X0, xb = X1;
      if (lo === lo && hi === hi) {
        if (lo > -Infinity) xa = Math.max(xa, Math.floor(lo + q.x - 0.5) - 1);
        if (hi < Infinity) xb = Math.min(xb, Math.ceil(hi + q.x - 0.5) + 1);
      }
      for (let xx = xa; xx <= xb; xx++) {
        const dx = xx + 0.5 - q.x, along = dx * tx + dy * ty, across = edgeShift(dx * nx + dy * ny, ET, paper.height[yy * w + xx]);
        const side = across < 0 ? sideL : sideR;
        if (Math.abs(along) > spacing * 0.5 + 0.6 || Math.abs(across) > side + 0.5) continue;
        if (clip && !clip[yy * w + xx]) continue;
        if (clk - stamp[yy * w + xx] < recent || stamp[yy * w + xx] >= onceT0) continue;
        stamp[yy * w + xx] = clk;
        const rel = side > 0 ? across / side : 0;
        cI[cnt] = yy * w + xx; cL[cnt] = Math.max(0, Math.min(lanes - 1, Math.round(((rel + 1) / 2) * (lanes - 1)))); cA[cnt++] = across;
      }
    }
    U[o + 7] = plan.emit(cI, cL, cA, cnt);
    steps++;
    if (between) { link.planning = plan; try { between(steps); } finally { link.planning = null; } }
    t += spacing; brush.travel += spacing; sheet.clock++;
  }
  brush.carry = t; brush.heading = lift ? null : head;
  if (rec) collectFlows(null, null);
  // the paint left on the brush is still on the GPU, so nothing is returned
  if (!lift) { if (!observational) brush._onPaper = true; link.endPlan(sheet, brush, plan, null, strokeRect(brush, sheet, path)); return undefined; }
  brush.carry = 0; if (!observational) nextStroke(brush);
  sheet._contactBrush = null;
  // lift-off bead cells; the GPU keeps the wet ones
  const last = path[path.length - 1], r = Math.max(1.5, brush.radius * 0.35), cells = [];
  for (let yy = Math.floor(last.y - r); yy <= Math.ceil(last.y + r); yy++) for (let xx = Math.floor(last.x - r); xx <= Math.ceil(last.x + r); xx++) if (xx >= 0 && yy >= 0 && xx < w && yy < h && Math.hypot(xx - last.x, yy - last.y) <= r) cells.push(yy * w + xx);
  link.endPlan(sheet, brush, plan, cells, strokeRect(brush, sheet, path));
  return undefined;
}

// a brush the GPU path can take: dipped to the sheet's pigment count and within the shader's limits
function onGpu(brush, sheet) {
  const K = sheet.K, hs = brush.hairs;
  // 576 hairs: FEED_MAX in stepfull.wgsl
  return K <= 16 && hs.length > 0 && hs.length <= 576 && (hs.length + 2) * (4 + K) <= 4000 && Array.isArray(brush.resP) && brush.resP.length === K && hs.every(hr => hr.pig && hr.pig.length === K);
}
// the plan has to fit the GPU's plan buffer (4M floats)
function planFits(brush, path, spacing,limit=3900000) {
  let len = 0, rmax = brush.radius; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  for (const q of path) if (q.r != null && q.r > rmax) rmax = q.r;
  // a step's record, and its cells at three words each: a strip of about three cells along the stroke over the brush's width
  const perStep = 16 + brush.clumps.length + brush.hairs.length + 1 + (brush.depositDepth ? 3 : 2) * 3.2 * (2.2 * rmax + 4);
  return (len / spacing + 2) * perStep + 400 + (brush.hairs.length + 2) * (4 + (brush.K || 16)) + 3 * (4 * rmax + 20) ** 2 < limit;
}

/** Read-only upper bound of the cells a stroke can touch, from the GPU planner's geometry and stamp tests, plus the
 *  unclipped lift-off disk. Neighbours are unclipped because wet paint can flow across a passage boundary. */
export function candidateContact(brush, sheet, path, { spacing = 0.7, lift = true, upright = false, neighborRadius = 0, sparseRow = false } = {}) {
  if (brush.model !== 'tuft' && !brush.depositDepth && splats(brush)) throw new Error('candidate contact does not support the active wash-splat route');
  if (!Number.isFinite(spacing) || spacing <= 0) throw new Error('candidate contact spacing must be positive');
  if (!Number.isInteger(neighborRadius) || neighborRadius < 0) throw new Error('candidate neighbor radius must be a nonnegative integer');
  if (!Array.isArray(path)) throw new Error('candidate contact path must be an array');
  for (const q of path) if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y) || (q.p !== undefined && (!Number.isFinite(q.p) || q.p < 0)) || (q.r !== undefined && (!Number.isFinite(q.r) || q.r < 0))) throw new Error('candidate contact path coordinates, pressure and radius must be finite and valid');
  if (![brush.radius, brush.splay, brush.carry, brush.travel].every(Number.isFinite) || brush.radius < 0 || brush.carry < 0) throw new Error('candidate contact instrument geometry must be finite and valid');
  for (let k = 1; k < path.length; k++) if (!Number.isFinite(Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y))) throw new Error('candidate contact path segment must be finite');
  const n = sheet.w * sheet.h, mask = new Uint8Array(n), copy = { ...brush, tip:brush.tip?{...brush.tip}:null, hairs:brush.hairs.map(hr=>({...hr,pig:hr.pig?.slice()})), resP:brush.resP?.slice() };
  const sparse = sparseRow === true && brush.model !== 'tuft', emitted = sparse ? [] : null;
  // row-major index range of the set cells, so dense passes scan only that range
  let lo = n, hi = -1, primaryCount = 0, neighborCount = 0;
  const link = {
    beginPlan() { const F = new Float32Array(16 + brush.clumps.length); return { F, U: new Uint32Array(F.buffer), I: new Int32Array(F.buffer), step() { return 0; }, emit(indices, lanes, across, count) { for (let j = 0; j < count; j++) { const i=indices[j]; if(!mask[i]){if(sparse)emitted.push(i);primaryCount++;if(i<lo)lo=i;if(i>hi)hi=i;} mask[i]=1; } return 0; } }; },
    endPlan() {},
  };
  const scratch = { w: sheet.w, h: sheet.h, K: sheet.K, paper: sheet.paper, clip: sheet.clip, _gpu: link, clock: sheet.clock,
    touched: sheet.touched?.slice(), contactStrength:sheet.contactStrength?.slice(), _contactBrush: sheet._contactBrush === brush ? copy : null };
  // an undipped tuft is treated as full, the widest footprint
  if (brush.model==='tuft' && !brush.K) for (const hr of copy.hairs) hr.water=brush.capacity*hr.len;
  if (path.length > 1) {
    if (brush.model==='tuft') strokeImpl(copy,scratch,path,{spacing,lift,upright,candidateMask:mask});
    else strokeGpu(copy,scratch,path,{spacing,lift,upright},true);
  }
  const tuft = brush.model === 'tuft'; if (tuft) { lo = 0; hi = n - 1; } // strokeImpl writes the mask directly
  const primaryMask = mask.slice(), liftMask = new Uint8Array(n), sparseCells = sparse ? emitted.slice() : null, sparseNeighbors = sparse ? [] : null;
  let liftCount=0;
  if (lift && path.length > 1) {
    const vp = varyPath(brush, path, sheet.paper, lift), last = vp[vp.length - 1], r = Math.max(1.5, brush.radius * 0.35);
    for (let yy = Math.max(0, Math.floor(last.y - r)); yy <= Math.min(sheet.h - 1, Math.ceil(last.y + r)); yy++)
      for (let xx = Math.max(0, Math.floor(last.x - r)); xx <= Math.min(sheet.w - 1, Math.ceil(last.x + r)); xx++)
        if (Math.hypot(xx - last.x, yy - last.y) <= r) { const i=yy*sheet.w+xx; liftMask[i]=1; liftCount++; if(sparse&&!mask[i])sparseCells.push(i); if(i<lo)lo=i; if(i>hi)hi=i; mask[i]=1; }
  }
  const neighbors = new Uint8Array(n);
  let nlo = lo, nhi = hi;
  if (neighborRadius) for (let k=sparse?0:Math.max(0,lo), count=sparse?sparseCells.length:hi+1; k<count; k++) { const i=sparse?sparseCells[k]:k; if (!mask[i]) continue;
    const x = i % sheet.w, y = Math.floor(i / sheet.w);
    for (let dy = -neighborRadius; dy <= neighborRadius; dy++) for (let dx = -neighborRadius; dx <= neighborRadius; dx++) {
      if (dx * dx + dy * dy > neighborRadius * neighborRadius) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= sheet.w || yy >= sheet.h) continue;
      const j = yy * sheet.w + xx;
      if (!mask[j]) { if(!neighbors[j]){if(sparse)sparseNeighbors.push(j);neighborCount++;if(j<nlo)nlo=j;if(j>nhi)nhi=j;} neighbors[j]=1; }
    }
  }
  const indices = [], neighborIndices = [];
  if(sparse) { sparseCells.sort((a,b)=>a-b); sparseNeighbors.sort((a,b)=>a-b); for(const i of sparseCells)indices.push(i); for(const i of sparseNeighbors)neighborIndices.push(i); }
  else for (let i = Math.max(0, Math.min(lo, nlo)), end = Math.min(n - 1, Math.max(hi, nhi)); i <= end; i++) { if (mask[i]) indices.push(i); if (neighbors[i]) neighborIndices.push(i); }
  // a stable identity for the contract and instrument, not a source hash
  const source = 'brush-primary-contact-v1:' + JSON.stringify({ model:brush.model??'row', lag:brush.lag??.6, flat: !!brush.flat, radius: brush.radius, splay: brush.splay, spacing, upright, lift, neighborRadius, ...(varietyOf(brush) ? { variety: varietyOf(brush) } : {}) });
  return { kind: 'instrument-candidate-contact', source, cells: indices, mask, primaryMask, liftMask, neighbors, neighborIndices,
    contact: { kind: 'instrument-candidate-contact', source, cells: indices },
    cellCount: indices.length, primaryCellCount: sparse ? emitted.length : tuft ? primaryMask.reduce((sum, value) => sum + value, 0) : primaryCount, liftCellCount: liftCount, neighborCells: sparse ? sparseNeighbors.length : neighborCount,
    continuation: { carry: copy.carry, travel: copy.travel, clock: scratch.clock, touched: scratch.touched } };
}
