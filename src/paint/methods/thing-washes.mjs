// The wash plan by things: the washes a person would choose, one a thing, with no tracing of the subject's values.
//
// Inputs: the subject, its SAM regions (the run's segment map) and the things a local vision model named with rough
// boxes (thing-labels.mjs). A SAM region belongs to the most specific named thing whose box holds most of it.
// 1. Reserved lights: the few brightest named things, kept as bare paper. Each is a smooth outline no narrower than
//    the wash brush; every wash goes round them.
// 2. Big bands first: the sky, the ground, the water, the path and the main mass (a thing over a quarter of the
//    sheet), each one low-vertex polygon spanning the sheet, its holes filled: the things in it go on over it.
// 3. One polygon a named thing: its regions closed, filled and opened by the brush, simplified to a low-vertex smooth
//    outline (within DRAWN_TOL_MM of the drawn edge under a drawing). Nothing inside it is cut by value.
// 4. One glaze a named shadow: the regions in its box that are clearly darker than the box as a whole, as one polygon.
// 5. A few dark accents last: the darkest regions, small polygons for the small brush.
// Colour: one mix a polygon, from the trimmed median of the subject over the whole polygon; a polygon that clearly
// grades along its long axis is laid as two halves, one end colour each, meeting at a soft edge. The mix is solved for
// what it makes over the plan's own record of the dry paint already under the polygon (puddles.mjs mixOver).
// Order: bands light to dark; then things one at a time, nearest next, each thing with the things inside it light to
// dark; then the shadow glazes; then the accents. Every wash reaches the painter as an outline and strokes in mm
// (wash-strokes.mjs), with the widest brush that fits it; nothing clips the brush.
// Plan time only: the paint step lays what is written here.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { deltaE2000, labOf } from '../../eval/colour.mjs';
import { leastAreas } from './wash-shapes.mjs';
import { outlineLoops, softLines, planWashStrokes, loopsMask } from './wash-strokes.mjs';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { targetRegions } from './target-regions.mjs';
import { targetValueMap, estimatePaper } from './light-to-dark.mjs';

/** The plan's grid: this many plan cells across the smallest wash brush. */
const PLAN_CELLS_PER_BRUSH = 3;
/** Kinds the vision model names that are laid as a big band. */
const BAND_KINDS = new Set(['sky', 'ground', 'water', 'path']);
/** A thing over this share of the sheet is the main mass, laid as a band. */
const MASS_SHARE = 0.25;
/** A region belongs to a named thing when this share of it lies in the thing's box. */
const IN_BOX = 0.6;
/** Outline tolerance (mm): bands, things, things under a drawing, accents. */
const BAND_TOL_MM = 4, THING_TOL_MM = 2, DRAWN_TOL_MM = 1.5, ACCENT_TOL_MM = 1;
/** A light is a thing whose trimmed median L* is within this of the picture's lightest tone ... */
const LIGHT_WITHIN = 14;
/** ... and at least this many L* lighter than the picture's median. At most MOST_LIGHTS are kept. */
const LIGHT_CLEAR = 15, MOST_LIGHTS = 4;
/** The middle share of a polygon's cells (by L*) its colour is judged from. */
const TRIM = 0.6;
/** A polygon grades when its two end thirds along its long axis differ by this (CIEDE2000) and it is this long (mm). */
const GRADES = Object.freeze({ deltaE: 12, lengthMm: 40 });
/** A wash is laid only when it darkens what is under it by this much L*. */
const VISIBLE_STEP = 2;
/** A shadow region is this much darker (L*) than its box's trimmed median. */
const SHADOW_DARKER = 8;
/** Accents: at most this many, each at least this much darker (L*) than what is laid under it, and no lighter than the picture's 4th percentile plus ACCENT_REACH. */
const MOST_ACCENTS = 8, ACCENT_DARKER = 12, ACCENT_REACH = 10;
/** A band goes round a thing in it that is lighter than it by less than this L* (or lighter), or this far from it in colour (CIEDE2000). */
const AROUND = Object.freeze({ lighter: 3, hue: 25 });
/** A band reaches the sheet's edge where its outline comes within this of it (mm). */
const EDGE_SNAP_MM = 3;

// --- masks on the plan grid ---------------------------------------------------------------------------------------
function dilate(m, w, h, r) {
  if (r <= 0) return m;
  const a = new Uint8Array(m.length), b = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) a[y * w + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) a[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (a[y * w + x]) last = y; if (y - last <= r) b[y * w + x] = 1; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (a[y * w + x]) last = y; if (last - y <= r) b[y * w + x] = 1; } }
  return b;
}
const invert = m => Uint8Array.from(m, v => 1 - v);
const erode = (m, w, h, r) => invert(dilate(invert(m), w, h, r));
/** The mask with every hole filled: the cells not reached from the sheet's edge through cells outside it. */
export function fillHoles(m, w, h) {
  const out = Uint8Array.from(m, () => 1), stack = [];
  const push = i => { if (!m[i] && out[i]) { out[i] = 0; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) { const i = stack.pop(), x = i % w; if (x) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i + w < w * h) push(i + w); }
  return out;
}
const areaOf = m => m.reduce((a, v) => a + v, 0);

/**
 * A mask as the polygons a painter would lay: closed and opened by the brush (so nothing in it is narrower than the
 * brush and no fragment is left), its holes filled, each piece over the least wash an outline simplified to `tolMm`.
 * Returns the loops (outer outlines only, in mm), largest first, at most `most`.
 */
export function polygonsOf(mask, w, h, { planMm, brushMm, tolMm, leastMm2, most = 3, snapMm = 0 }) {
  const r = Math.max(1, Math.round(brushMm / 2 / planMm));
  let m = erode(dilate(mask, w, h, r), w, h, r);
  m = fillHoles(m, w, h);
  m = dilate(erode(m, w, h, r), w, h, r);
  const c = components(m, w, h, 4), size = new Float64Array(c.count + 1), box = Array.from({ length: c.count + 1 }, () => ({ x0: w, y0: h, x1: -1, y1: -1 }));
  for (let i = 0; i < w * h; i++) { const id = c.labels[i]; if (!id) continue; size[id]++; const x = i % w, y = (i / w) | 0, b = box[id]; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  const ids = []; for (let id = 1; id <= c.count; id++) if (size[id] * planMm * planMm >= leastMm2) ids.push(id);
  ids.sort((a, b) => size[b] - size[a]);
  const W = w * planMm, H = h * planMm;
  const loops = [];
  for (const id of ids.slice(0, most)) {
    const l = outlineLoops(c.labels, id, box[id], w, h, { cellMm: planMm, tolMm }).sort((a, b) => b.points.length - a.points.length)[0];
    if (!l) continue;
    if (snapMm > 0) l.points = l.points.map(([x, y]) => [x < snapMm ? -1 : x > W - snapMm ? W + 1 : x, y < snapMm ? -1 : y > H - snapMm ? H + 1 : y]);
    loops.push(l);
  }
  return loops;
}

// --- colour -------------------------------------------------------------------------------------------------------
/** The trimmed median colour (sRGB) of `cells`: the middle TRIM of them by L*, then each channel's median. */
export function trimmedMedian(cells, rgbAt, LAt) {
  if (!cells.length) return null;
  const s = [...cells].sort((a, b) => LAt(a) - LAt(b)), cut = Math.floor(s.length * (1 - TRIM) / 2), mid = s.slice(cut, Math.max(cut + 1, s.length - cut));
  return [0, 1, 2].map(c => { const v = mid.map(i => rgbAt(i)[c]).sort((a, b) => a - b); return v[v.length >> 1]; });
}
/** The long axis of a set of cells: centre and unit direction (principal axis), and the cells' extent along it. */
function longAxis(cells, pw) {
  let mx = 0, my = 0; for (const i of cells) { mx += i % pw; my += (i / pw) | 0; } mx /= cells.length; my /= cells.length;
  let xx = 0, yy = 0, xy = 0; for (const i of cells) { const dx = i % pw - mx, dy = ((i / pw) | 0) - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const t = 0.5 * Math.atan2(2 * xy, xx - yy), u = [Math.cos(t), Math.sin(t)];
  let lo = Infinity, hi = -Infinity; for (const i of cells) { const s = (i % pw - mx) * u[0] + (((i / pw) | 0) - my) * u[1]; if (s < lo) lo = s; if (s > hi) hi = s; }
  return { c: [mx, my], u, lo, hi };
}
/** A loop cut by the half-plane s(p) <= 0 (Sutherland-Hodgman); the new edge along the cut is soft. */
function clipLoop(loop, s) {
  const P = loop.points, n = P.length, out = [], soft = [];
  for (let q = 0; q < n; q++) {
    const A = P[q], B = P[(q + 1) % n], a = s(A), b = s(B);
    if (a <= 0) { out.push(A); soft.push(b > 0 ? false : loop.soft[q]); }
    if ((a <= 0) !== (b <= 0)) { const t = a / (a - b); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); soft.push(a <= 0 ? true : loop.soft[q]); }
  }
  return out.length >= 3 ? { points: out, soft } : null;
}

/**
 * The things of the picture: each SAM region given to the named thing with the smallest box that holds IN_BOX of it.
 * A region no box holds is a thing of its own (kind 'other') when it is large enough for a wash, else it joins the
 * thing it borders most. Shadows take no regions: they glaze across things.
 * @returns {{things: Array<{name, kind, box, cells:number[]}>, regionOf: Int32Array, regions: Map}}
 */
export function assignThings(region, pw, ph, named, leastCells) {
  const pn = pw * ph, regions = new Map();
  for (let i = 0; i < pn; i++) { let r = regions.get(region[i]); if (!r) regions.set(region[i], (r = { id: region[i], cells: [] })); r.cells.push(i); }
  const things = named.filter(t => t.kind !== 'shadow').map(t => ({ ...t, cells: [] }));
  const boxCells = t => [Math.floor(t.box[0] * pw), Math.floor(t.box[1] * ph), Math.ceil(t.box[2] * pw), Math.ceil(t.box[3] * ph)];
  const inside = (t, i) => { const [x0, y0, x1, y1] = boxCells(t), x = i % pw, y = (i / pw) | 0; return x >= x0 && x < x1 && y >= y0 && y < y1; };
  const area = t => (t.box[2] - t.box[0]) * (t.box[3] - t.box[1]);
  const owner = new Map();
  for (const r of regions.values()) {
    let best = -1;
    things.forEach((t, q) => { if (!t.box) return; let k = 0; for (const i of r.cells) if (inside(t, i)) k++; if (k >= IN_BOX * r.cells.length && (best < 0 || area(t) < area(things[best]))) best = q; });
    if (best < 0 && r.cells.length >= leastCells) { things.push({ name: `region ${r.id}`, kind: 'other', box: null, cells: [] }); best = things.length - 1; }
    owner.set(r.id, best);
  }
  // a small region no box holds joins the owned region it borders most
  for (let pass = 0; pass < 4; pass++) for (const r of regions.values()) {
    if (owner.get(r.id) >= 0) continue;
    const votes = new Map();
    for (const i of r.cells) { const x = i % pw; for (const j of [x ? i - 1 : -1, x < pw - 1 ? i + 1 : -1, i - pw, i + pw]) if (j >= 0 && j < pn && region[j] !== r.id) { const o = owner.get(region[j]); if (o >= 0) votes.set(o, (votes.get(o) ?? 0) + 1); } }
    let best = -1, bv = 0; for (const [o, v] of votes) if (v > bv) { bv = v; best = o; }
    if (best >= 0) owner.set(r.id, best);
  }
  const thingOf = new Int32Array(pn).fill(-1);
  for (const r of regions.values()) { const o = owner.get(r.id); if (o >= 0) for (const i of r.cells) { things[o].cells.push(i); thingOf[i] = o; } }
  return { things: things.filter(t => t.cells.length), thingOf, regions };
}

/** Which thing each thing lies inside: the smallest other thing whose box holds most of its box (or -1). */
function parents(things) {
  const area = b => (b[2] - b[0]) * (b[3] - b[1]);
  return things.map((t, q) => {
    if (!t.box) return -1; let best = -1;
    things.forEach((o, p) => {
      if (p === q || !o.box || area(o.box) <= area(t.box)) return;
      const ix = Math.max(0, Math.min(t.box[2], o.box[2]) - Math.max(t.box[0], o.box[0])), iy = Math.max(0, Math.min(t.box[3], o.box[3]) - Math.max(t.box[1], o.box[1]));
      if (ix * iy >= 0.8 * area(t.box) && (best < 0 || area(o.box) < area(things[best].box))) best = p;
    });
    return best;
  });
}

/**
 * The order things are painted in: one at a time, nearest next, starting from the largest; a thing and the things
 * inside it are one visit, light to dark.
 * @param things [{cx, cy, L, area, parent}] @returns indices
 */
export function thingOrder(things) {
  const root = q => { let r = q, guard = 0; while (things[r].parent >= 0 && guard++ < 50) r = things[r].parent; return r; };
  const groups = new Map(); things.forEach((t, q) => { const r = root(q); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(q); });
  const g = [...groups.entries()].map(([r, list]) => ({ list: list.sort((a, b) => things[b].L - things[a].L || a - b), cx: things[r].cx, cy: things[r].cy, area: list.reduce((s, q) => s + things[q].area, 0) }));
  const out = []; let at = g.reduce((b, x, q) => (x.area > g[b].area ? q : b), 0);
  const left = new Set(g.map((_, q) => q));
  while (left.size) {
    left.delete(at); out.push(...g[at].list);
    let best = -1, bd = Infinity; for (const q of left) { const d = Math.hypot(g[q].cx - g[at].cx, g[q].cy - g[at].cy); if (d < bd) { bd = d; best = q; } }
    if (best < 0) break; at = best;
  }
  return out;
}

export function planThingWashes({ demand, k, density, w, h, rgb = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], pointBrushMm = 0, hold = null, families = [], subject = null, shaped = true, segments = null, things: named = [], drawn = false }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (demand.length !== n * k || density.length !== n || k < 1) throw Error('target/demand grid mismatch');
  if (!rgb || pigments.length !== k) throw Error('the wash plan needs the subject colours and the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  const paper = estimatePaper(rgb, w, h, density);
  const value = targetValueMap(paper ? Float32Array.from(density, v => Math.max(0, v - paper.density)) : density), region = targetRegions({ w, h, rgb, demand, k, density, families });
  // the plan's grid, in mm; the subject on it (mean light) and the regions on it (nearest)
  const pw = Math.min(w, Math.max(1, Math.round(sheetWidthMm / (washBrushMm / PLAN_CELLS_PER_BRUSH)))), ph = pw === w ? h : Math.max(1, Math.round(h * pw / w)), pn = pw * ph, planMm = sheetWidthMm / pw;
  const lin = [0, 1, 2].map(() => new Float32Array(pn)), cnt = new Float32Array(pn);
  for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) { const q = py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0), i = y * w + x; cnt[q]++; for (let c = 0; c < 3; c++) lin[c][q] += (rgb[i * 3 + c] / 255) ** 2.2; } }
  const prgb = new Uint8ClampedArray(pn * 3); for (let q = 0; q < pn; q++) for (let c = 0; c < 3; c++) prgb[q * 3 + c] = 255 * (lin[c][q] / Math.max(1, cnt[q])) ** (1 / 2.2);
  const pL = Float32Array.from({ length: pn }, (_, q) => labOf(prgb, q, paperCol)[0]);
  const rgbAt = q => [prgb[q * 3], prgb[q * 3 + 1], prgb[q * 3 + 2]], LAt = q => pL[q];
  if (!segments || segments.length !== n) throw Error('the thing-wash plan needs the run\'s segment map (--segments sam)');
  const regionMap = Int32Array.from({ length: pn }, (_, q) => segments[(Math.min(h - 1, (((q / pw) | 0) + .5) * h / ph) | 0) * w + (Math.min(w - 1, ((q % pw) + .5) * w / pw) | 0)]);
  const least = leastAreas(washBrushMm), leastCells = least.washMm2 / (planMm * planMm);
  const { things, thingOf } = assignThings(regionMap, pw, ph, named, leastCells);
  const sortedL = Float32Array.from(pL).sort(), lightest = sortedL[Math.floor(.98 * (pn - 1))], medianL = sortedL[pn >> 1], darkFloor = sortedL[Math.floor(.04 * (pn - 1))];
  const maskOf = cells => { const m = new Uint8Array(pn); for (const i of cells) m[i] = 1; return m; };
  const cellsOf = m => { const out = []; for (let i = 0; i < pn; i++) if (m[i]) out.push(i); return out; };
  for (const t of things) { t.colour = trimmedMedian(t.cells, rgbAt, LAt); t.L = labOf(t.colour, 0, paperCol)[0]; let x = 0, y = 0; for (const i of t.cells) { x += i % pw; y += (i / pw) | 0; } t.cx = x / t.cells.length; t.cy = y / t.cells.length; t.area = t.cells.length; }

  // 1. the reserved lights
  const tolThing = drawn ? DRAWN_TOL_MM : THING_TOL_MM;
  const lightThings = things.filter(t => !BAND_KINDS.has(t.kind) && t.area < MASS_SHARE * pn && t.L >= lightest - LIGHT_WITHIN && t.L >= medianL + LIGHT_CLEAR).sort((a, b) => b.L - a.L).slice(0, MOST_LIGHTS);
  const lightLoops = [];
  for (const t of lightThings) { const loops = polygonsOf(maskOf(t.cells), pw, ph, { planMm, brushMm: washBrushMm, tolMm: tolThing, leastMm2: least.reserveMm2 }); if (loops.length) { t.light = true; lightLoops.push(...loops); } }
  const lightMask = lightLoops.length ? loopsMask(lightLoops, pw, ph, planMm) : new Uint8Array(pn);
  const keepOut = lightLoops.length ? lightLoops : null;

  // the plan's record of what it has laid, per plan cell and pigment
  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], byStage = [], polygons = []; let strokeCount = 0;
  const STAGE_NAME = ['', 'band', 'thing', 'shadow', 'accent'];
  // One polygon's wash (or its two graded halves): the mix judged for the polygon as a whole over what is under it.
  const lay = (stage, what, loops, { keepOut: ko = null, growMm = 0, grade = true } = {}) => {
    if (!loops.length) return 0;
    const koMask = ko ? loopsMask(ko, pw, ph, planMm) : null, m = loopsMask(loops, pw, ph, planMm), cells = cellsOf(m).filter(i => !(koMask && koMask[i]));
    if (!cells.length) return 0;
    let parts = [{ loops, cells }];
    const ax = longAxis(cells, pw);
    if (grade && (ax.hi - ax.lo) * planMm >= GRADES.lengthMm) {
      const at = i => (i % pw - ax.c[0]) * ax.u[0] + (((i / pw) | 0) - ax.c[1]) * ax.u[1], span = ax.hi - ax.lo;
      const A = cells.filter(i => at(i) <= ax.lo + span / 3), B = cells.filter(i => at(i) >= ax.hi - span / 3);
      const cA = trimmedMedian(A, rgbAt, LAt), cB = trimmedMedian(B, rgbAt, LAt);
      if (cA && cB && deltaE2000(labOf(cA, 0, paperCol), labOf(cB, 0, paperCol)) >= GRADES.deltaE) {
        const s = sign => p => sign * ((p[0] / planMm - .5 - ax.c[0]) * ax.u[0] + (p[1] / planMm - .5 - ax.c[1]) * ax.u[1]);
        const half = sign => { const ls = loops.map(l => clipLoop(l, s(sign))).filter(Boolean); return { loops: ls, cells: cells.filter(i => sign * at(i) <= 0) }; };
        parts = [half(1), half(-1)].filter(p => p.loops.length && p.cells.length);
      }
    }
    let made = 0;
    for (const part of parts) {
      const colour = trimmedMedian(part.cells, rgbAt, LAt), under = new Array(k).fill(0);
      for (const i of part.cells) for (let j = 0; j < k; j++) under[j] += laid[j][i] / part.cells.length;
      const fresh = under.every(v => v <= 1e-9), amounts = fresh ? mixFor(colour, pigments, paperCol) : mixOver(colour, under, pigments, paperCol), strength = amounts.reduce((a, v) => a + v, 0);
      if (!(strength > 1e-6)) continue;
      const before = filmLab(under, pigments, paperCol)[0], after = filmLab(under.map((v, j) => v + amounts[j]), pigments, paperCol)[0];
      if (before - after < VISIBLE_STEP) continue;
      const strokesOut = planWashStrokes(part.loops, { kitMm: washKitMm, pointMm: pointBrushMm, growMm, keepOut: ko });
      if (!strokesOut.strokes.length) continue;
      const pm = loopsMask(part.loops, pw, ph, planMm); for (let i = 0; i < pn; i++) if (pm[i] && !(koMask && koMask[i])) for (let j = 0; j < k; j++) laid[j][i] += amounts[j];
      // the wash on the sheet's cells, for the painter's records (its edge is where the strokes end)
      const sm = loopsMask(part.loops, w, h, cellMm), ids = new Uint8Array(n), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
      for (let i = 0; i < n; i++) if (sm[i] && !hold?.[i]) { ids[i] = 1; area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
      if (!area) continue;
      const mixId = mixes.length; mixes.push({ mix: amounts.map(v => v / strength), strength, stage });
      const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...amounts]; sh.graded = null; sh._follow = true; sh.firstWash = stage === 1; sh._opening = 1;
      const areaMm2 = part.cells.length * planMm * planMm, phase = stage === 1 ? 'light' : 'mid';
      let rim = 0; for (const l of part.loops) for (let v = 0; v < l.points.length; v++) { const P = l.points[v], Q = l.points[(v + 1) % l.points.length]; rim += Math.hypot(Q[0] - P[0], Q[1] - P[1]); }
      const used = Math.max(...strokesOut.strokes.map(st => 2 * st.radiusMm)); strokeCount += strokesOut.strokes.length;
      const intent = { id: `${phase}/s${stage}/m${mixId}/${STAGE_NAME[stage]}`, phase, valueBand: stage, stage, mixId, thing: what.name ?? null, kind: what.kind ?? null, areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: false,
        referenceCue: 'One polygon a thing, charged with one mix judged for the polygon as a whole.', intendedResult: stage === 1 ? 'A big band laid first.' : stage === 2 ? 'A thing in its own colour.' : stage === 3 ? 'A cast shadow, one glaze across what it falls on.' : 'A late dark accent.', cool: stage === 1 && colour[2] > colour[0] + 10,
        shaped, subject, move: 'wet on dry', paperBefore: 'fully dry; own same-passage wet overlap allowed', baseBefore: 'fully dry',
        brush: { kind: 'the widest wash brush of the kit that fits the polygon, then the smaller ones where it is narrow', contact: 'side/belly', width: 'each stroke names its brush', widthMm: strokesOut.brushMm },
        resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
        layer: stage, break: null, load: { water: .62, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
        edges: { hardCells: [], softCells: [], policy: 'hard, except where a graded polygon\'s two halves meet: a damp brush is run along that' },
        outline: part.loops, strokes: strokesOut.strokes, softEdges: softLines(part.loops), depthMm: +strokesOut.depthMm.toFixed(1), uncoveredShare: +strokesOut.uncovered.toFixed(4), widestBrushMm: used,
        protectedLights: ['bare-paper polygons the strokes go round'], failureSigns: 'Lost lights, muddy overlaps.', stop: 'after the polygon' };
      sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
      polygons.push({ stage, thing: what.name ?? null, kind: what.kind ?? null, colour, loops: part.loops });
      byStage[stage - 1] = (byStage[stage - 1] ?? 0) + 1;
      layers.push({ value: stage, pigment: amounts.indexOf(Math.max(...amounts)), mixId, shapes: [sh], mix: amounts.map(v => v / strength), amount: strength, area, _order: { phase: stage === 1 ? 'ground' : 'mid', region: 0, shoot: true }, _valuePhase: phase });
      made++;
    }
    return made;
  };

  // 2. the big bands, light to dark
  const mass = things.filter(t => !t.light && !BAND_KINDS.has(t.kind)).sort((a, b) => b.area - a.area)[0];
  const bands = things.filter(t => !t.light && (BAND_KINDS.has(t.kind) || (t === mass && t.area >= MASS_SHARE * pn))).sort((a, b) => b.L - a.L);
  // A band goes round the things in it that it cannot lie under: one lighter than the band, or of another hue.
  for (const t of bands) t.band = true;
  const rest = things.filter(t => !t.light && !t.band);
  for (const t of rest) t.loops = polygonsOf(maskOf(t.cells), pw, ph, { planMm, brushMm: washBrushMm, tolMm: tolThing, leastMm2: least.washMm2 });
  for (const t of bands) {
    const loops = polygonsOf(maskOf(t.cells), pw, ph, { planMm, brushMm: Math.max(washBrushMm, 2 * BAND_TOL_MM), tolMm: BAND_TOL_MM, leastMm2: least.washMm2, most: 2, snapMm: EDGE_SNAP_MM });
    if (!loops.length) continue;
    const inBand = loopsMask(loops, pw, ph, planMm), bandLab = labOf(t.colour, 0, paperCol);
    const around = rest.filter(o => o.loops.length && o.cells.filter(i => inBand[i]).length >= IN_BOX * o.cells.length && (o.L > bandLab[0] - AROUND.lighter || deltaE2000(labOf(o.colour, 0, paperCol), bandLab) > AROUND.hue));
    lay(1, t, loops, { keepOut: [...lightLoops, ...around.flatMap(o => o.loops)], growMm: 1 });
  }
  // 3. the things, one at a time
  const par = parents(rest);
  rest.forEach((t, q) => { t.parent = par[q]; });
  for (const q of thingOrder(rest)) { const t = rest[q]; lay(2, t, t.loops, { keepOut, growMm: .5 }); }
  // 4. the shadow glazes: the regions in each named shadow's box clearly darker than the box as a whole
  const regionCells = new Map(); for (let i = 0; i < pn; i++) { const r = regionMap[i]; if (!regionCells.has(r)) regionCells.set(r, []); regionCells.get(r).push(i); }
  for (const s of named.filter(t => t.kind === 'shadow' && t.box)) {
    const [x0, y0, x1, y1] = [Math.floor(s.box[0] * pw), Math.floor(s.box[1] * ph), Math.ceil(s.box[2] * pw), Math.ceil(s.box[3] * ph)], inBox = i => { const x = i % pw, y = (i / pw) | 0; return x >= x0 && x < x1 && y >= y0 && y < y1; };
    const boxCells = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) boxCells.push(y * pw + x);
    const boxL = labOf(trimmedMedian(boxCells, rgbAt, LAt), 0, paperCol)[0], pick = new Uint8Array(pn);
    for (const cells of regionCells.values()) { const inside = cells.filter(inBox); if (inside.length < IN_BOX * cells.length) continue; const c = trimmedMedian(cells, rgbAt, LAt); if (labOf(c, 0, paperCol)[0] <= boxL - SHADOW_DARKER) for (const i of cells) pick[i] = 1; }
    if (areaOf(pick) < leastCells) continue;
    lay(3, s, polygonsOf(pick, pw, ph, { planMm, brushMm: washBrushMm, tolMm: tolThing, leastMm2: least.washMm2, most: 1 }), { growMm: 0 });
  }
  // 5. a few dark accents: the darkest regions, each still clearly darker than what is laid under it
  const smallBrush = Math.min(...washKitMm), leastAccent = leastAreas(smallBrush), toneUnder = cells => { const u = new Array(k).fill(0); for (const i of cells) for (let j = 0; j < k; j++) u[j] += laid[j][i] / cells.length; return filmLab(u, pigments, paperCol)[0]; };
  const accents = [...regionCells.values()].map(cells => ({ cells, L: labOf(trimmedMedian(cells, rgbAt, LAt), 0, paperCol)[0] }))
    .filter(a => a.cells.length * planMm * planMm >= leastAccent.washMm2 && a.L <= darkFloor + ACCENT_REACH && toneUnder(a.cells) - a.L >= ACCENT_DARKER).sort((a, b) => a.L - b.L).slice(0, MOST_ACCENTS);
  for (const a of accents) lay(4, { name: 'accent', kind: thingOf[a.cells[0]] >= 0 ? things[thingOf[a.cells[0]]]?.kind ?? null : null }, polygonsOf(maskOf(a.cells), pw, ph, { planMm, brushMm: smallBrush, tolMm: ACCENT_TOL_MM, leastMm2: leastAccent.washMm2, most: 2 }), { grade: false });

  // nothing clips the brush: the lights are kept by the strokes going round them; only the run's own hold stays
  const protectedCells = new Uint8Array(n); if (hold) for (let i = 0; i < n; i++) if (hold[i]) protectedCells[i] = 1;
  const lightsOnSheet = lightLoops.length ? loopsMask(lightLoops, w, h, cellMm) : new Uint8Array(n), lc = components(lightsOnSheet, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a named light kept as a bare-paper polygon', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const areas = instructions.map(q => q.areaMm2).sort((a, b) => a - b);
  const summary = { stages: byStage.filter(Boolean).length, washesByStage: Array.from({ length: 4 }, (_, s) => byStage[s] ?? 0), mixes: mixes.length, washes: instructions.length, planCellMm: planMm, things: things.length, named: named.length, bands: bands.map(t => t.name), lights: lightThings.filter(t => t.light).map(t => t.name), reservedShare: areaOf(lightMask) / pn,
    lightestTone: lightest, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, firstWashCover: 1 };
  console.log(`thing washes: ${named.length} named things, ${things.length} things with regions; bands ${summary.bands.join(', ') || 'none'}; lights ${summary.lights.join(', ') || 'none'} (${(100 * summary.reservedShare).toFixed(1)}% of the sheet)`);
  console.log(`washes: ${summary.washes} (bands ${summary.washesByStage[0]}, things ${summary.washesByStage[1]}, shadows ${summary.washesByStage[2]}, accents ${summary.washesByStage[3]}); ${mixes.length} mixes; mean ${summary.meanWashMm2.toFixed(0)} mm2, median ${summary.medianWashMm2.toFixed(0)} mm2; ${strokeCount} strokes planned`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary, mixes, polygons,
    geometry: 'Named lights kept as paper; big bands first; one polygon a named thing, nearest next, light to dark within a thing; one glaze a named shadow; a few dark accents. Every wash is an outline and strokes in mm, one mix judged for the polygon as a whole.' };
}
