// --palettewide 1: a palette that reaches the picture's saturated local colours, and a puddle per local colour.
// The recovered palette clusters by density, so a small saturated passage (a red shirt, a clear sky) forms no cluster,
// and mixes of greyed directions cannot leave the greyed gamut. This picks box pans (box.mjs) on whole-sheet mean
// CIEDE2000 plus the mean hue-and-chroma error over the picture's local colours (k-means on a* b* of chromatic cells,
// each at least `minShare` of the sample, plus the toned greys), so a 3% colour counts as much as a 30% one.
// A monochrome lean palette is returned as it is.
// Puddle labels cut each passage again by local colour, so a passage spanning a shirt and a sky does not mix to grey
// (blockin.mjs `puddles`). DOM free.
import { chooseBox, sampleSource, sampleError, renderedLab, renderedUnique } from './boxpick.mjs';
import { boxPigment, BOX } from './box.mjs';
import { chromaOf } from './palette.mjs';
import { channelDensity, unmix } from './pigments.mjs';
import { renderLayers } from '../media/km.mjs';
import { labPlanes, deltaE2000 } from '../eval/colour.mjs';

const hueChroma = (L, a1, b1, a2, b2) => deltaE2000([L, a1, b1], [L, a2, b2]);

/** Deterministic k-means on points (m x d, flat), seeded by farthest-point from the first. @returns labels, centres */
export function kmeans(P, m, d, K, { iters = 20 } = {}) {
  if (!m) return { labels: new Int32Array(0), centres: [] };
  const centres = [Array.from({ length: d }, (_, c) => P[c])];
  const dist = (i, ctr) => { let s = 0; for (let c = 0; c < d; c++) { const v = P[i * d + c] - ctr[c]; s += v * v; } return s; };
  const near = new Float64Array(m).fill(Infinity);
  while (centres.length < Math.min(K, m)) {
    let far = 0, fd = -1;
    for (let i = 0; i < m; i++) { near[i] = Math.min(near[i], dist(i, centres[centres.length - 1])); if (near[i] > fd) { fd = near[i]; far = i; } }
    if (fd <= 1e-9) break;
    centres.push(Array.from({ length: d }, (_, c) => P[far * d + c]));
  }
  const labels = new Int32Array(m);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < m; i++) { let best = 0, bd = Infinity; for (let k = 0; k < centres.length; k++) { const v = dist(i, centres[k]); if (v < bd) { bd = v; best = k; } } labels[i] = best; }
    const sum = centres.map(() => new Float64Array(d)), cnt = new Float64Array(centres.length);
    for (let i = 0; i < m; i++) { cnt[labels[i]]++; for (let c = 0; c < d; c++) sum[labels[i]][c] += P[i * d + c]; }
    for (let k = 0; k < centres.length; k++) if (cnt[k]) for (let c = 0; c < d; c++) centres[k][c] = sum[k][c] / cnt[k];
  }
  return { labels, centres };
}

/**
 * The picture's local colours on the chooser's sample: its chromatic cells (chroma at least `minChroma`) clustered on
 * a* b*, each cluster kept when it holds `minShare` of the sample. @returns [{ cells (sample indices), share, L, C, h }]
 */
export function localColours(sample, { K = 8, minChroma = 8, minShare = 0.005, greyChroma = 6, greyL = 85 } = {}) {
  const { m, lab } = sample, idx = [], greys = [];
  for (let s = 0; s < m; s++) {
    const C = Math.hypot(lab.a[s], lab.b[s]);
    if (C >= minChroma) idx.push(s);
    else if (C < greyChroma && lab.L[s] < greyL) greys.push(s);
  }
  const P = new Float32Array(idx.length * 2);
  idx.forEach((s, q) => { P[q * 2] = lab.a[s]; P[q * 2 + 1] = lab.b[s]; });
  const { labels, centres } = kmeans(P, idx.length, 2, K);
  return centres.map((_, k) => {
    const cells = idx.filter((_, q) => labels[q] === k);
    let L = 0, a = 0, b = 0; for (const s of cells) { L += lab.L[s]; a += lab.a[s]; b += lab.b[s]; }
    const c = Math.max(1, cells.length);
    return { cells: Int32Array.from(cells), share: cells.length / m, L: L / c, C: Math.hypot(a, b) / c, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
  }).concat(greyColour(lab, greys, m)).filter(r => r.share >= minShare).sort((p, q) => q.share - p.share);
}

// The toned greys (under `greyChroma`, darker than `greyL`) are one more local colour: a slate shirt or black hair has
// no chroma to cluster on, and chromatic pans alone paint it green-brown.
function greyColour(lab, greys, m) {
  let L = 0, a = 0, b = 0; for (const s of greys) { L += lab.L[s]; a += lab.a[s]; b += lab.b[s]; }
  const c = Math.max(1, greys.length);
  return [{ cells: Int32Array.from(greys), share: greys.length / m, L: L / c, C: Math.hypot(a, b) / c, h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, grey: true }];
}

/** Each local colour's mean hue-and-chroma error when the paints unmix and render the sample, and the mean over them. */
export function localError(sample, colours, paints, rendered = undefined) {
  const { lab } = sample, L2 = renderedLab(sample, paints, rendered);
  const per = colours.map(r => { let e = 0; for (const s of r.cells) e += hueChroma(lab.L[s], lab.a[s], lab.b[s], L2.a[s], L2.b[s]); return e / Math.max(1, r.cells.length); });
  return { per, mean: per.length ? per.reduce((x, y) => x + y, 0) / per.length : 0 };
}

/** One exact per-colour solve shared by both score terms, with accumulation order unchanged. No cross-call cache. */
export function wideScore(sample, colours, paints, weight = 1) {
  const rendered = renderedUnique(sample, paints);
  return sampleError(sample, paints, rendered) + weight * localError(sample, colours, paints, rendered).mean;
}

/**
 * The wide palette: box paints chosen on sheet error plus local-colour error (see the head of this file). `lean` is the
 * recovered lean palette; a monochrome lean palette is returned unchanged.
 * @returns { palette, note }
 */
export function widePalette(px, w, h, paperRGB, lean, { weight = 1, gain = 0.5, min = 3, max = 6, K = 8, minShare = 0.005, minChroma = 8, keys = null, add = null } = {}) {
  if (!keys && (lean.monochrome || lean.pigments.length < 2)) return { palette: lean, note: `palette wide: the picture is one fluid (chroma ${lean.chroma.toFixed(3)}), kept ${lean.pigments.length} (lean)` };
  const sample = sampleSource(px, w, h, paperRGB, { stride: 3 });
  const colours = localColours(sample, { K, minChroma, minShare });
  const score = paints => wideScore(sample, colours, paints, weight);
  // --paints a,b,c: the painter's own choice of pans from the box, in place of the fit's
  const chosen = keys
    ? (() => { const ps = keys.map(k => BOX.find(p => p.key === k) ?? (() => { throw new Error(`--paints: no box paint ${k} (${BOX.map(p => p.key).join(', ')})`); })()); const s = score(ps); return { paints: ps, e: s, trail: [s] }; })()
    : chooseBox(px, w, h, paperRGB, { min, max, gain, score });
  // --paintsadd a,b,c: the fitted pans stay and these are added for passages that need them, so the figure keeps its
  // colours
  const extra = (add || []).map(k => BOX.find(p => p.key === k) ?? (() => { throw new Error(`--paintsadd: no box paint ${k} (${BOX.map(p => p.key).join(', ')})`); })()).filter(p => !chosen.paints.some(q => q.key === p.key));
  const paints = [...chosen.paints, ...extra], e = extra.length ? score(paints) : chosen.e, trail = extra.length ? [...chosen.trail, e] : chosen.trail;
  const n = w * h, chroma = chromaOf(channelDensity(px, n, paperRGB), n);
  const loc = localError(sample, colours, paints);
  const palette = { pigments: paints.map(p => boxPigment(p)), ink: 0, chroma, paintChroma: chroma, inkApart: 0, monochrome: false, wide: true, box: { keys: paints.map(p => p.key), sampleError: e, trail } };
  const cols = colours.map((r, q) => `${r.grey ? 'greys ' : ''}h ${r.h.toFixed(0)} C ${r.C.toFixed(0)} ${(100 * r.share).toFixed(1)}% off ${loc.per[q].toFixed(1)}`).join('; ');
  return { palette, note: `palette wide: ${paints.length} box paints (${paints.map(p => p.name).join(', ')}), sheet and local error ${trail.map(v => v.toFixed(2)).join(' to ')}; ${colours.length} local colours: ${cols}` };
}

/**
 * Puddle labels per cell: the plan's amounts as proportions of each pan, clustered (k-means, K puddles) over the cells
 * that hold paint, then every cell given its nearest puddle and the labels smoothed by a majority over a (2r+1) square,
 * so a puddle's edge follows a colour's edge and not the grain. Cells with no paint take their nearest puddle too.
 * @returns { labels (Uint8Array, n), centres (K proportions of the k pans) }
 */
export function puddleLabels(A, k, w, h, { K = 8, floor = 0.04, radius = 2, stride = 2 } = {}) {
  const n = w * h, prop = new Float32Array(n * k), sums = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += A[i * k + j]; sums[i] = s; for (let j = 0; j < k; j++) prop[i * k + j] = s > 1e-6 ? A[i * k + j] / s : 1 / k; }
  const pick = []; for (let i = 0; i < n; i += stride) if (sums[i] >= floor) pick.push(i);
  const P = new Float32Array(pick.length * k); pick.forEach((i, q) => { for (let j = 0; j < k; j++) P[q * k + j] = prop[i * k + j]; });
  const { centres } = kmeans(P, pick.length, k, K);
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bd = Infinity;
    for (let c = 0; c < centres.length; c++) { let s = 0; for (let j = 0; j < k; j++) { const v = prop[i * k + j] - centres[c][j]; s += v * v; } if (s < bd) { bd = s; best = c; } }
    raw[i] = best;
  }
  const labels = new Uint8Array(n), votes = new Int32Array(centres.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    votes.fill(0);
    for (let yy = Math.max(0, y - radius); yy <= Math.min(h - 1, y + radius); yy++) for (let xx = Math.max(0, x - radius); xx <= Math.min(w - 1, x + radius); xx++) votes[raw[yy * w + xx]]++;
    let best = raw[y * w + x]; for (let c = 0; c < votes.length; c++) if (votes[c] > votes[best]) best = c;
    labels[y * w + x] = best;
  }
  return { labels, centres };
}

/**
 * A pass's components cut again by puddle: connected pieces that share a component and a puddle label, with any piece
 * under `small` cells folded into the largest neighbouring piece of its own component (so a colour's fringe is laid
 * with its neighbour rather than dropped). Same shape as raster.js components' result.
 */
export function splitByPuddle(labels, puddles, w, h, small) {
  const n = w * h, out = new Int32Array(n), stack = new Int32Array(n), areas = [0];
  let next = 1;
  for (let s = 0; s < n; s++) {
    if (!labels[s] || out[s]) continue;
    let sp = 0, area = 0; stack[sp++] = s; out[s] = next;
    while (sp) {
      const i = stack[--sp]; area++;
      const x = i % w, y = (i - x) / w;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
        const j = yy * w + xx;
        if (!out[j] && labels[j] === labels[i] && puddles[j] === puddles[i]) { out[j] = next; stack[sp++] = j; }
      }
    }
    areas.push(area); next++;
  }
  // fold small pieces into their largest neighbour in the same component, a few rounds so chains of slivers resolve
  for (let round = 0; round < 3; round++) {
    const into = new Int32Array(next).fill(0), bestArea = new Int32Array(next).fill(0);
    for (let i = 0; i < n; i++) {
      const p = out[i]; if (!p || areas[p] >= small) continue;
      const x = i % w, y = (i - x) / w;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
        const j = yy * w + xx, q = out[j];
        if (q && q !== p && labels[j] === labels[i] && areas[q] > bestArea[p]) { bestArea[p] = areas[q]; into[p] = q; }
      }
    }
    let moved = 0;
    for (let i = 0; i < n; i++) { const p = out[i]; if (p && into[p]) { out[i] = into[p]; moved++; } }
    if (!moved) break;
    areas.fill(0); for (let i = 0; i < n; i++) if (out[i]) areas[out[i]]++;
  }
  const map = new Int32Array(next), dense = [0];
  let c = 0;
  for (let p = 1; p < next; p++) if (areas[p] > 0) { map[p] = ++c; dense.push(areas[p]); }
  for (let i = 0; i < n; i++) if (out[i]) out[i] = map[out[i]];
  return { labels: out, areas: dense, count: c };
}
