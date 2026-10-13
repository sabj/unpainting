// Ink/wash self-consistency of a plan, before anything is painted.
//
// Given the original, a proposed wash (the planned sheet without ink) and a proposed line drawing (the pen paths
// rendered at their contact widths), ask: once the wash is divided out of the original, does what is left look like
// the drawing? The division is Part 1's split (the checkpoint comparator in the old painter, tools/checkpoint/index.html
// composite()): ink transmittance is ONE number per cell, read from lightness, original lightness over wash lightness,
// capped at 1, ratios within 4% of 1 treated as no ink, floored at 0.02. Ink is near neutral; dividing channel by
// channel turns a multi-pigment wash into rainbow speckle. Lightness is Rec. 709 luma on the encoded values, as there.
//
// Everything here is pure arithmetic on typed arrays so it can be unit-tested on hand-drawn buffers.

export const DEFAULTS = Object.freeze({
  inkT: 0.70,        // a cell is "ink" when its transmittance is below this (30% darker than what explains it)
  tolerance: 2,      // cells a line may sit off its evidence and still count
  massHalfWidth: 3,  // residual this many cells from its own edge is wider than any pen: a mass, not a line
  structureSpan: 40, // a thin missed component spanning at least this many cells is a missed structure line
  grainSpan: 10,     // a missed component smaller than this (about 1.4 mm at 1080 cells) is grain, not a pen mark
  grainT: 0.55,      // a missed component paler than this on average is grain too
  washDarkRatio: 1.08, // original lighter than the wash by this ratio: the wash is too dark there
  clean: 0.96,       // Part 1: transmittance above this is no ink
  floor: 0.02,       // Part 1: transmittance floor
});

export const lumaOf = (rgb, n, channels = 3) => {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * channels;
    L[i] = 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
  }
  return L;
};

/** Part 1's split: transmittance the ink must have so that wash x ink = original, and the raw ratio. */
export function residual(original, wash, { clean = DEFAULTS.clean, floor = DEFAULTS.floor } = {}) {
  const n = original.length, T = new Float32Array(n), ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = original[i] / Math.max(1, wash[i]);
    ratio[i] = r;
    const t = Math.min(1, r);
    T[i] = t > clean ? 1 : Math.max(floor, t);
  }
  return { T, ratio };
}

/** Euclidean-ish (3-4 chamfer, divided by 3) distance from every cell to the nearest set cell of mask. */
export function distanceTo(mask, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const relax = (i, j, c) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, 3);
    if (y > 0) { relax(i, i - w, 3); if (x > 0) relax(i, i - w - 1, 4); if (x < w - 1) relax(i, i - w + 1, 4); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, 3);
    if (y < h - 1) { relax(i, i + w, 3); if (x < w - 1) relax(i, i + w + 1, 4); if (x > 0) relax(i, i + w - 1, 4); }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

const invert = (mask) => { const o = new Uint8Array(mask.length); for (let i = 0; i < o.length; i++) o[i] = mask[i] ? 0 : 1; return o; };
const below = (T, t) => { const m = new Uint8Array(T.length); for (let i = 0; i < m.length; i++) m[i] = T[i] < t ? 1 : 0; return m; };

/** 8-connected components of mask; returns label per cell (0 = none) and per-label bounding-box span. */
function components(mask, w, h) {
  const label = new Int32Array(w * h), spans = [0], areas = [0], stack = [];
  let next = 1;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    label[s] = next; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (mask[j] && !label[j]) { label[j] = next; stack.push(j); }
      }
    }
    spans.push(Math.hypot(x1 - x0 + 1, y1 - y0 + 1)); areas.push(area); next++;
  }
  return { label, spans, areas, count: next - 1 };
}

export const CLASSES = Object.freeze({
  matched: 1,          // a proposed line on residual ink
  missedStructure: 2,  // long thin residual ink with no line near it
  missedTexture: 3,    // short, dark, pen-scale residual ink (hatching, stone joints, foliage) with no line near it
  washTooLight: 4,     // broad residual: darkness the wash should have carried, left to the pen
  lineOnMass: 5,       // a proposed line inside broad residual: mass mis-assigned to ink
  clutter: 6,          // a proposed line with no residual under it
  washTooDark: 7,      // a proposed line where the wash is already darker than the original
  residualCovered: 8,  // residual ink with a line near it
  fineGrain: 9,        // specks and pale flecks smaller or fainter than a pen mark: tone the wash does not model
});

/**
 * Compare residual ink (transmittance R) with the proposed drawing (transmittance P), both w x h.
 * `ratio` is original/wash lightness, used to tell clutter from lines the wash has already over-explained.
 */
export function compare(R, P, ratio, w, h, opts = {}) {
  const o = { ...DEFAULTS, ...opts }, n = w * h;
  const res = below(R, o.inkT), pen = below(P, o.inkT);
  const toRes = distanceTo(res, w, h), toPen = distanceTo(pen, w, h);
  const depth = distanceTo(invert(res), w, h); // inside residual: distance to its own edge
  const mass = new Uint8Array(n);
  for (let i = 0; i < n; i++) mass[i] = res[i] && depth[i] >= o.massHalfWidth ? 1 : 0;
  const massZone = distanceTo(mass, w, h); // residual within a pen width of a mass core belongs to that mass
  const thinMissed = new Uint8Array(n);
  for (let i = 0; i < n; i++) thinMissed[i] = res[i] && toPen[i] > o.tolerance && massZone[i] > o.massHalfWidth ? 1 : 0;
  const comp = components(thinMissed, w, h), meanT = new Float64Array(comp.count + 1);
  for (let i = 0; i < n; i++) if (comp.label[i]) meanT[comp.label[i]] += R[i];
  for (let l = 1; l <= comp.count; l++) meanT[l] /= comp.areas[l];
  comp.meanT = meanT;
  const darkWash = new Uint8Array(n);
  for (let i = 0; i < n; i++) darkWash[i] = ratio[i] > o.washDarkRatio ? 1 : 0;
  const toDarkWash = distanceTo(darkWash, w, h);

  const cls = new Uint8Array(n), count = new Float64Array(10), resCount = new Float64Array(10);
  for (let i = 0; i < n; i++) {
    let c = 0;
    if (res[i]) resCount[residualClass(i, toPen, massZone, comp, o)]++;
    if (pen[i]) {
      if (depth[i] >= o.massHalfWidth) c = CLASSES.lineOnMass;
      else if (toRes[i] <= o.tolerance) c = CLASSES.matched;
      else if (toDarkWash[i] <= o.tolerance) c = CLASSES.washTooDark;
      else c = CLASSES.clutter;
    } else if (res[i]) c = residualClass(i, toPen, massZone, comp, o);
    cls[i] = c; count[c]++;
  }
  return { cls, ...summarise(count, resCount, res, pen, toRes, toPen, ratio, n, o) };
}

function residualClass(i, toPen, massZone, comp, o) {
  if (toPen[i] <= o.tolerance) return CLASSES.residualCovered;
  if (massZone[i] <= o.massHalfWidth) return CLASSES.washTooLight;
  const l = comp.label[i];
  if (comp.spans[l] >= o.structureSpan) return CLASSES.missedStructure;
  return comp.spans[l] < o.grainSpan || comp.meanT[l] > o.grainT ? CLASSES.fineGrain : CLASSES.missedTexture;
}

function summarise(count, resCount, res, pen, toRes, toPen, ratio, n, o) {
  let resN = 0, penN = 0, penHit = 0, resHit = 0, darkArea = 0;
  for (let i = 0; i < n; i++) {
    if (res[i]) { resN++; if (toPen[i] <= o.tolerance) resHit++; }
    if (pen[i]) { penN++; if (toRes[i] <= o.tolerance) penHit++; }
    if (ratio[i] > o.washDarkRatio) darkArea++;
  }
  const precision = penN ? penHit / penN : 0, recall = resN ? resHit / resN : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const share = (c, of) => (of ? count[c] / of : 0), rshare = c => (resN ? resCount[c] / resN : 0);
  // recall of pen-scale ink: residual a pen could draw, leaving out grain finer or fainter than a pen mark
  const penScale = resN - resCount[CLASSES.fineGrain], recallPenScale = penScale > 0 ? resHit / penScale : 0;
  const f1PenScale = precision + recallPenScale ? 2 * precision * recallPenScale / (precision + recallPenScale) : 0;
  return {
    precision, recall, f1, recallPenScale, f1PenScale,
    residualInkShare: resN / n, penShare: penN / n, washTooDarkArea: darkArea / n,
    // shares of residual ink (what the original has that the wash does not explain)
    residual: {
      covered: rshare(CLASSES.residualCovered), missedStructure: rshare(CLASSES.missedStructure),
      missedTexture: rshare(CLASSES.missedTexture), fineGrain: rshare(CLASSES.fineGrain), washTooLight: rshare(CLASSES.washTooLight),
    },
    // shares of proposed line cells
    lines: {
      matched: share(CLASSES.matched, penN), lineOnMass: share(CLASSES.lineOnMass, penN),
      clutter: share(CLASSES.clutter, penN), washTooDark: share(CLASSES.washTooDark, penN),
    },
  };
}

/** How much of the original's darkness the plan explains: luma error of wash alone and of wash x ink. */
export function reconstruction(original, wash, P) {
  let a = 0, b = 0;
  for (let i = 0; i < original.length; i++) {
    a += Math.abs(original[i] - wash[i]);
    b += Math.abs(original[i] - wash[i] * P[i]);
  }
  const n = original.length;
  return { washOnlyError: a / n / 255, washAndInkError: b / n / 255 };
}

export const CLASS_COLOURS = Object.freeze({
  0: [250, 248, 244], 1: [30, 30, 30], 2: [220, 30, 30], 3: [245, 150, 30], 4: [150, 70, 200],
  5: [40, 90, 230], 6: [20, 170, 80], 7: [230, 60, 200], 8: [150, 150, 150], 9: [225, 205, 160],
});
