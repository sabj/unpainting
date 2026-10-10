// How a wash behaves inside its own shape: flatness versus blotches, and the dark drying rim on its edge.
import { gaussian } from '../keyframes/density.mjs';
import { components, contours, distanceToZero, dilate, open, close, removeSmall, fillHoles } from '../raster.js';

/**
 * Wash shapes read off the keyframe so both pictures are measured inside the same outlines.
 * Opened and closed, holes filled, anything under minArea dropped.
 */
export function washShapes(keyD, w, h, { level = 0.12, minArea = 500, blur = 1.5 } = {}) {
  // light blur only: a heavy one would push the outline past the edge where the rim is measured
  const K = gaussian(keyD, w, h, blur);
  let m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = K[i] >= level ? 1 : 0;
  m = fillHoles(removeSmall(open(close(m, w, h, 2), w, h, 2), w, h, minArea), w, h, 200);
  const { labels, areas, count } = components(m, w, h);
  const shapes = [];
  for (let id = 1; id <= count; id++) {
    if (areas[id] < minArea) continue;
    const one = new Uint8Array(w * h); for (let i = 0; i < one.length; i++) one[i] = labels[i] === id ? 1 : 0;
    const dist = distanceToZero(one, w, h); let maxDist = 0; for (let i = 0; i < dist.length; i++) if (dist[i] > maxDist) maxDist = dist[i];
    shapes.push({ id, area: areas[id], mask: one, dist, maxDist });
  }
  return shapes;
}

/**
 * Blotchiness inside one shape: coefficient of variation (sd / mean) of blurred density, lines excluded
 * (dilated by 2). The mean is floored at 0.05 so a near-blank shape cannot score huge.
 */
export function flatness(D, shape, w, h, exclude, { inset: insetMax = 4, blur = 3, floor = 0.05 } = {}) {
  // inset from the edge so the rim is not a blotch, at most half the shape's thickness
  const inset = Math.min(insetMax, Math.max(1, Math.floor((shape.maxDist ?? insetMax * 2) / 2)));
  // low pass inside the shape and off linework only, so outside paper and lines do not read as blotches
  const keep = new Float32Array(w * h), wet = new Float32Array(w * h);
  for (let i = 0; i < keep.length; i++) if (shape.mask[i] && !exclude[i]) { keep[i] = 1; wet[i] = D[i]; }
  const num = gaussian(wet, w, h, blur), den = gaussian(keep, w, h, blur), low = new Float32Array(w * h);
  for (let i = 0; i < low.length; i++) low[i] = den[i] > 1e-3 ? num[i] / den[i] : 0;
  let n = 0, s = 0, s2 = 0;
  for (let i = 0; i < w * h; i++) { if (!shape.mask[i] || shape.dist[i] < inset || exclude[i]) continue; n++; s += low[i]; s2 += low[i] * low[i]; }
  if (n < 30) return null;
  const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  // below the floor the wash is barely there; the ratio is inflated, so `faint` says to read mean and sd instead
  return { pixels: n, mean, sd, blotch: sd / Math.max(floor, mean), faint: mean < floor };
}

/**
 * Share of a shape's perimeter with a dark rim (real washes: a third to two thirds). Compares density 1 to 3 px
 * inside the edge with 6 to 12 px in, along the inward normal. Points too thin to have an inside are skipped.
 */
export function rim(D, shape, w, h, { edge = [2, 3, 4], inner = [7, 9, 11, 13], minRise = 0.03, stride = 2 } = {}) {
  const S = gaussian(D, w, h, 1.0), at = (x, y) => S[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const inside = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))); return shape.dist[yi * w + xi] > 0; };
  let tested = 0, rimmed = 0, rise = 0;
  for (const loop of contours(shape.mask, w, h)) {
    if (loop.length < 12) continue;
    for (let j = 0; j < loop.length; j += stride) {
      const p = loop[j], xi = Math.min(w - 2, Math.max(1, Math.round(p.x))), yi = Math.min(h - 2, Math.max(1, Math.round(p.y))), i = yi * w + xi;
      // the distance transform is zero outside and grows inward, so its gradient is the inward normal
      const gx = shape.dist[i + 1] - shape.dist[i - 1], gy = shape.dist[i + w] - shape.dist[i - w], g = Math.hypot(gx, gy);
      if (g < 1e-3) continue;
      const ux = gx / g, uy = gy / g;
      const band = steps => { let s = 0, n = 0; for (const d of steps) { const x = p.x + ux * d, y = p.y + uy * d; if (!inside(x, y)) continue; s += at(x, y); n++; } return n ? { mean: s / n, n } : null; };
      const near = band(edge), far = band(inner);
      if (!near || !far || far.n < 2) continue;
      tested++; const r = near.mean - far.mean; rise += r; if (r > minRise) rimmed++;
    }
  }
  return tested < 8 ? null : { tested, rimShare: rimmed / tested, meanRise: rise / tested };
}

/** Line pixels in either picture, excluded from both sides' wash statistics. */
export const lineExclusion = (maskA, maskB, w, h, r = 2) => {
  const both = new Uint8Array(maskA.length); for (let i = 0; i < both.length; i++) both[i] = maskA[i] | maskB[i];
  return dilate(both, w, h, r);
};
