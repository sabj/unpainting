// Ringlet fur: a curly dark coat built from curly marks with light left on their tops, and an outline broken by locks.
//   1. clipForCurls stops the glazes over the region at the tone of the lit curl tops, so the lights keep that tone;
//   2. ringletMarks lays the rest as short strokes that turn at the curl radius and stop where a lit arc begins;
//   3. edgeMarks starts locks inside the outline and runs them out, tapering.
// Pure and DOM free: callers pass the blur, and curlpaint.mjs lays the marks on a sheet.

import { components, fillHoles, erode, dilate, distanceToOne, minFilter, maxFilter } from '../raster.js';
import { curlyFur } from '../eval/curls.mjs';

const quantileOf = (vals, q) => { if (!vals.length) return NaN; const s = Float32Array.from(vals).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const rng = seed => { let s = (seed | 0) || 1; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/**
 * The curly dark regions of a source. A region is a dark component of at least `minArea` cells, read with curlyFur.
 * It is curly if its lights look like curl tops (lit share at least `minLit`, coherence under `maxCoherence`) or its
 * outline is broken (rough at least `minRough`).
 *
 * @param px   RGB bytes, w * h * 3
 * @returns {{region: Uint8Array, lit: Uint8Array, radius: number, parts: object[]}}
 *   region: the curly regions' cells; lit: the lit curl tops inside them; radius: the curls' radius in cells, half the
 *   median run of dark between lights (clamped to `minRadius` .. `maxRadius`); parts: each dark component's reading
 */
export function curlRegions(px, w, h, blur, { dark = 0.2, grow = 0.35, growTexture = 0.01, warmMax = 3, reach = null, massBlur = 1.5, minArea = null, minLit = 0.03, maxCoherence = 0.85, minRough = 1.12, liftMin = 0.08, r = 2, minRadius = 1.5, maxRadius = 4.5 } = {}) {
  const n = w * h, L = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = px[i * 3], b = px[i * 3 + 1], c = px[i * 3 + 2]; L[i] = 0.2126 * a + 0.7152 * b + 0.0722 * c; V[i] = Math.max(a, b, c); }
  const lightV = quantileOf(V, 0.9), lightL = quantileOf(L, 0.9);
  // the mass is read on value blurred over a curl, so dense lit curl tops do not cut it into bands;
  // the outline keeps the finer reading, with its hooks
  const Vs = blur(V, w, h, 0.7), raw = Uint8Array.from(Vs, v => (v < dark * lightV ? 1 : 0));
  const Vm = blur(V, w, h, massBlur), core = Uint8Array.from(Vm, (v, i) => (v < dark * lightV || raw[i] ? 1 : 0));
  // Grow the core within `reach` cells into cells up to `grow` of the light that are textured and not warm.
  // Value alone cannot tell a lit black coat from shaded sand; hue can, since the sand is warm.
  const G = new Float32Array(n), warm = new Float32Array(n);
  for (let i = 0; i < n; i++) warm[i] = px[i * 3] - px[i * 3 + 2];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; G[i] = Math.hypot(Vs[i + 1] - Vs[i - 1], Vs[i + w] - Vs[i - w]) / 2; }
  const T = blur(G, w, h, 1.5), Wm = blur(warm, w, h, 1.5), limit = reach ?? Math.max(4, Math.round(0.06 * Math.min(w, h)));
  const dist = new Int16Array(n).fill(-1), queue = [];
  for (let i = 0; i < n; i++) if (core[i]) { dist[i] = 0; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i / w) | 0;
    if (dist[i] >= limit) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy, j = yy * w + xx;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || dist[j] >= 0) continue;
      if (Vm[j] < grow * lightV && T[j] > growTexture * lightV && Wm[j] <= warmMax) { dist[j] = dist[i] + 1; core[j] = 1; queue.push(j); }
    }
  }
  const closed = erode(dilate(core, w, h, 1), w, h, 1);
  const { labels, areas, count } = components(closed, w, h);
  const least = minArea ?? Math.max(60, Math.round(0.002 * n));
  const Ls = blur(L, w, h, 0.7), opened = maxFilter(minFilter(Ls, w, h, r), w, h, r);
  const region = new Uint8Array(n), lit = new Uint8Array(n), parts = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < least) continue;
    const main = Uint8Array.from(labels, v => (v === id ? 1 : 0));
    const holes = Math.max(20, 0.02 * areas[id]), mass = fillHoles(main, w, h, holes);
    const outline = fillHoles(Uint8Array.from(raw, (v, i) => (v && main[i] ? 1 : 0)), w, h, holes);
    const m = curlyFur(L, w, h, blur, { mass, outline, light: lightL, liftMin, r });
    const curly = (m.lit >= minLit && m.coherence < maxCoherence) || m.rough >= minRough;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) if (mass[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    parts.push({ id, area: m.area, box: [x0, y0, x1, y1], curly, ...m });
    if (!curly) continue;
    const inner = erode(mass, w, h, 1);
    for (let i = 0; i < n; i++) if (mass[i]) { region[i] = 1; if (inner[i] && Ls[i] - opened[i] > liftMin * lightL) lit[i] = 1; }
  }
  return { region, lit, radius: curlRadius(region, lit, w, h, { min: minRadius, max: maxRadius }), parts };
}

/** The curls' radius in cells: half the median run of dark between lights, which is the median distance to the nearest. */
export function curlRadius(region, lit, w, h, { min = 1.5, max = 4.5 } = {}) {
  const n = w * h, runs = [];
  let any = false; for (let i = 0; i < n; i++) if (lit[i] && region[i]) { any = true; break; }
  if (!any) return min;
  const dist = distanceToOne(lit, w, h);
  for (let i = 0; i < n; i++) if (region[i] && !lit[i]) runs.push(dist[i]);
  return Math.max(min, Math.min(max, runs.length ? quantileOf(runs, 0.5) : min));
}

/**
 * The share of the region's dark the glazes carry: the lit tops' density over the dark's, so the washes stop at the
 * lights' tone. Clamped, since a backlit coat has almost no lights to read.
 * @param D  the source's density per cell
 */
export function capShareOf(D, region, lit, w, h, { min = 0.3, max = 0.65 } = {}) {
  const l = [], d = [];
  for (let i = 0; i < w * h; i++) if (region[i]) (lit[i] ? l : d).push(D[i]);
  if (!l.length || !d.length) return min;
  const dd = quantileOf(d, 0.5);
  return dd > 1e-6 ? Math.max(min, Math.min(max, quantileOf(l, 0.5) / dd)) : min;
}

/**
 * The glazes, clipped where a curly region has had its underlayer.
 * In painting order, a passage keeps a region cell only while the running density there is under `share` of the
 * plan's total; the cells it gives up are owed to the curl marks. Passages left under `minArea` cells are dropped.
 *
 * @param layers   the painter's glazes: [{ pigment, value, shapes: [{ mask, mix, amount, area, graded? }] }]
 * @param weight   per pigment, the density one unit lays (the mean of its K)
 * @returns {{ layers, owed: Float32Array }} owed: per cell and pigment (n * k), the amounts the clipped passages would
 *   have laid
 */
export function clipForCurls(layers, region, w, h, k, weight, { share = 0.4, minArea = 8, split = false } = {}) {
  const n = w * h, lays = (sh, i) => (sh.graded ? sh.graded[i] / Math.max(1e-6, sh.amount) : 1);
  // --curlsplit: every passage over the region keeps `share` of its strength there and owes the rest of its own mix,
  // so warm early passages and blue late ones are split evenly between underlayer and marks.
  if (split) {
    const owed = new Float32Array(n * k), out = [];
    for (const L of layers) {
      const shapes = [];
      for (const sh of L.shapes) {
        const inR = new Uint8Array(n), outR = new Uint8Array(n); let aIn = 0, aOut = 0;
        for (let i = 0; i < n; i++) if (sh.mask[i]) { if (region[i]) { inR[i] = 1; aIn++; } else { outR[i] = 1; aOut++; } }
        if (!aIn) { shapes.push(sh); continue; }
        for (let i = 0; i < n; i++) if (inR[i]) for (let j = 0; j < k; j++) owed[i * k + j] += (1 - share) * sh.mix[j] * lays(sh, i);
        if (aOut >= minArea) shapes.push({ ...sh, mask: outR, area: aOut });
        if (aIn >= minArea) shapes.push({ ...sh, mask: inR, area: aIn, amount: sh.amount * share, ...(sh.graded ? { graded: Float32Array.from(sh.graded, v => v * share) } : {}) });
        else for (let i = 0; i < n; i++) if (inR[i]) for (let j = 0; j < k; j++) owed[i * k + j] += share * sh.mix[j] * lays(sh, i);
      }
      if (!shapes.length) continue;
      const mask = new Uint8Array(n); for (const sh of shapes) for (let i = 0; i < n; i++) if (sh.mask[i]) mask[i] = 1;
      out.push({ ...L, shapes, mask, area: shapes.reduce((a, sh) => a + sh.area, 0) });
    }
    return { layers: out, owed };
  }
  const full = new Float32Array(n);
  for (const L of layers) for (const sh of L.shapes) {
    const kk = sh.mix.reduce((a, v, j) => a + v * weight[j], 0);
    for (let i = 0; i < n; i++) if (sh.mask[i] && region[i]) full[i] += kk * lays(sh, i);
  }
  const run = new Float32Array(n), owed = new Float32Array(n * k), out = [];
  for (const L of layers) {
    const shapes = [];
    for (const sh of L.shapes) {
      const kk = sh.mix.reduce((a, v, j) => a + v * weight[j], 0);
      let touches = false;
      for (let i = 0; i < n; i++) if (sh.mask[i] && region[i]) { touches = true; break; }
      if (!touches) { shapes.push(sh); continue; }
      const mask = new Uint8Array(n); let area = 0;
      for (let i = 0; i < n; i++) {
        if (!sh.mask[i]) continue;
        if (region[i] && run[i] >= share * full[i]) { for (let j = 0; j < k; j++) owed[i * k + j] += sh.mix[j] * lays(sh, i); continue; }
        mask[i] = 1; area++;
        if (region[i]) run[i] += kk * lays(sh, i);
      }
      if (area >= minArea) shapes.push({ ...sh, mask, area });
      else for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < k; j++) owed[i * k + j] += sh.mix[j] * lays(sh, i);
    }
    if (!shapes.length) continue;
    const mask = new Uint8Array(n); for (const sh of shapes) for (let i = 0; i < n; i++) if (sh.mask[i]) mask[i] = 1;
    out.push({ ...L, shapes, mask, area: shapes.reduce((a, sh) => a + sh.area, 0) });
  }
  return { layers: out, owed };
}

/**
 * Everything the painter needs for the curly regions: where they are, their lights and curl size, the clipped glazes,
 * and what those glazes owe.
 * @param D         the source's density per cell
 * @param pigments  the palette, [{ K }]
 * @param box       optional [x0, y0, x1, y1] as fractions of the sheet: only regions inside it. Tone, colour and lights
 *                  cannot tell a black coat from dark trousers, so the caller can say where the coat is.
 * @param share     the glazes' share of the dark, or null for capShareOf
 */
export function planCurls(px, w, h, layers, D, pigments, blur, { box = null, share = null, shareMin = 0.3, shareMax = 0.65, split = false, ...detect } = {}) {
  const n = w * h, found = curlRegions(px, w, h, blur, detect);
  let { region, lit } = found;
  if (box) {
    const [a, b, c, d] = box, x0 = a * w, y0 = b * h, x1 = c * w, y1 = d * h, inBox = i => { const x = i % w, y = (i / w) | 0; return x >= x0 && x < x1 && y >= y0 && y < y1; };
    region = Uint8Array.from(region, (v, i) => (v && inBox(i) ? 1 : 0));
    lit = Uint8Array.from(lit, (v, i) => (v && region[i] ? 1 : 0));
  }
  let area = 0; for (let i = 0; i < n; i++) area += region[i];
  const radius = curlRadius(region, lit, w, h, { min: detect.minRadius ?? 1.5, max: detect.maxRadius ?? 4.5 });
  const cap = share ?? capShareOf(D, region, lit, w, h, { min: shareMin, max: shareMax });
  const weight = pigments.map(p => (p.K[0] + p.K[1] + p.K[2]) / 3);
  const { layers: clipped, owed } = area ? clipForCurls(layers, region, w, h, pigments.length, weight, { share: cap, split }) : { layers, owed: new Float32Array(n * pigments.length) };
  return { layers: clipped, owed, region, lit, radius, share: cap, area, parts: found.parts };
}

// one curly stroke: a walk that turns at `radius` in the sense it started with and leans towards the level lines of P,
// stopping at a cell `stop` refuses or at its length
function curlWalk(x0, y0, heading, sense, P, w, h, { radius, length, follow, stop }) {
  const pts = [{ x: x0, y: y0 }];
  let x = x0, y = y0, a = heading;
  for (let t = 1; t <= length; t++) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi > 0 && yi > 0 && xi < w - 1 && yi < h - 1 && follow > 0) {
      const i = yi * w + xi, gx = (P[i + 1] - P[i - 1]) / 2, gy = (P[i + w] - P[i - w]) / 2;
      if (Math.hypot(gx, gy) > 1e-4) {
        let along = Math.atan2(gx, -gy);                       // the level line, turned the way the stroke is going
        if (Math.abs(wrap(along - a)) > Math.PI / 2) along = wrap(along + Math.PI);
        a = wrap(a + follow * wrap(along - a));
      }
    }
    a = wrap(a + sense / radius);
    const nx = x + Math.cos(a), ny = y + Math.sin(a);
    if (nx < 0 || ny < 0 || nx > w - 1 || ny > h - 1) break;
    if (stop(Math.round(nx), Math.round(ny))) break;
    x = nx; y = ny; pts.push({ x, y });
  }
  return pts;
}

/**
 * The dark of the coat as curly marks. Seeds are cells still owed paint, darkest first with jitter. Each mark walks
 * half to one and a half turns of a curl of `radius`, bends towards the level lines of P and stops before a light.
 * The cells a mark covers, plus `spacing`, are spent, so a sliver of underlayer shows between marks.
 *
 * @param want   per cell, how much dark is still owed (zero outside the regions)
 * @param lit    the lit curl tops, which marks do not enter
 * @returns [[{x, y, want, p}]] pressure landing light, full through the body, lifting to a point
 */
export function ringletMarks(want, lit, P, w, h, { radius = 3, coverage = 0.8, spacing = 1, seed = 7, follow = 0.35, turns = [0.5, 1.4], minWant = 1e-3, minPoints = 3 } = {}) {
  const rnd = rng(seed), n = w * h, avoid = lit;
  const cells = [];
  for (let i = 0; i < n; i++) if (want[i] > minWant && !avoid[i]) cells.push([i, want[i] * (0.6 + 0.8 * rnd())]);
  cells.sort((a, b) => b[1] - a[1]);
  const taken = new Uint8Array(n), marks = [];
  let covered = 0; const goal = coverage * cells.length;
  const stop = (x, y) => { const i = y * w + x; return avoid[i] || want[i] <= minWant; };
  for (const [i] of cells) {
    if (covered >= goal) break;
    if (taken[i]) continue;
    const x0 = i % w, y0 = (i / w) | 0;
    const length = Math.round(2 * Math.PI * radius * (turns[0] + (turns[1] - turns[0]) * rnd()));
    const pts = curlWalk(x0, y0, rnd() * 2 * Math.PI, rnd() < 0.5 ? -1 : 1, P, w, h, { radius, length, follow, stop });
    if (pts.length < minPoints) { taken[i] = 1; continue; }
    const last = pts.length - 1;
    pts.forEach((q, k) => { const u = k / last; q.want = want[Math.round(q.y) * w + Math.round(q.x)]; q.p = Math.max(0.2, Math.min(1, Math.min(u / 0.15, 1) * 0.35 + 0.65 * Math.min(1, (1 - u) / 0.35))); });
    for (const q of pts) {
      const px = Math.round(q.x), py = Math.round(q.y);
      for (let oy = -spacing; oy <= spacing; oy++) for (let ox = -spacing; ox <= spacing; ox++) {
        const xx = px + ox, yy = py + oy, j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox * ox + oy * oy <= spacing * spacing && !taken[j]) { taken[j] = 1; if (want[j] > minWant && !avoid[j]) covered++; }
      }
    }
    marks.push(pts);
  }
  return marks;
}

/**
 * Locks that cross the outline: one seed every `gap` cells in shuffled order. Each starts `radius` inside, heads out
 * along the normal within `spread` radians, curls at `loose` times the ringlet radius (a lock hangs looser than a
 * ringlet), and runs `reach` radii past the edge, tapering to a tip.
 * @returns [[{x, y, p}]]
 */
export function edgeMarks(region, w, h, blur, { radius = 3, gap = null, reach = 1.5, spread = 0.5, loose = 3, seed = 11, minPoints = 3 } = {}) {
  const rnd = rng(seed), n = w * h, S = blur(Float32Array.from(region), w, h, Math.max(1, radius));
  const outline = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (region[i] && (!region[i - 1] || !region[i + 1] || !region[i - w] || !region[i + w])) outline.push(i); }
  for (let k = outline.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [outline[k], outline[j]] = [outline[j], outline[k]]; }
  const step = gap ?? Math.max(2, Math.round(1.5 * radius)), taken = new Uint8Array(n), marks = [];
  for (const i of outline) {
    if (taken[i]) continue;
    const x = i % w, y = (i / w) | 0, gx = (S[i + 1] - S[i - 1]) / 2, gy = (S[i + w] - S[i - w]) / 2, g = Math.hypot(gx, gy);
    if (g < 1e-4) continue;
    const ox = -gx / g, oy = -gy / g;                              // outward: down the smoothed region
    const sx = x - ox * radius, sy = y - oy * radius;
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
    const length = Math.round(radius * (1 + reach) + radius * rnd());
    const pts = curlWalk(sx, sy, Math.atan2(oy, ox) + (rnd() - 0.5) * 2 * spread, rnd() < 0.5 ? -1 : 1, null, w, h, { radius: loose * radius, length, follow: 0, stop: () => false });
    if (pts.length < minPoints) continue;
    const last = pts.length - 1;
    pts.forEach((q, k) => { const u = k / last; q.p = Math.max(0.12, Math.min(1, Math.min(1, u / 0.12) * 0.3 + 0.9 * Math.pow(1 - u, 0.7))); });
    marks.push(pts);
    for (let oy2 = -step; oy2 <= step; oy2++) for (let ox2 = -step; ox2 <= step; ox2++) { const xx = x + ox2, yy = y + oy2; if (xx >= 0 && yy >= 0 && xx < w && yy < h && ox2 * ox2 + oy2 * oy2 <= step * step) taken[yy * w + xx] = 1; }
  }
  return marks;
}
