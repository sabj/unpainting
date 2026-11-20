// Generated from src/media/contact-distance.mjs by tools/lab/sync-site-media.mjs. Edit the source.
import { edgeProfile } from './edge-profile.js';
// Exact Euclidean distance to the axis-aligned faces of a liquid footprint.
// On a half-cell lattice every projection of a cell centre onto a boundary
// face is a lattice point (including diagonal corners). The old 3/4 chamfer
// distance misplaced these corners by nearly a cell on coarse grids.
const BIG = 1e20;
function edt(f, n, out, v, z) {
  let k = 0; v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
    while (k > 0 && s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k])); }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
// box [x0, y0, x1, y1] (optional): the footprint lies inside it, so its faces and every cell asked about do too, and the
// transform runs over that part of the half-cell lattice only. The distances are the same numbers (the same feature
// points, squared distances exact in lattice units); the first version transformed the whole sheet for a mark.
export function contactDistance(mask, w, h, pinned, box = null) {
  const [bx0, by0, bx1, by1] = box ?? [0, 0, w - 1, h - 1], ox = 2 * bx0, oy = 2 * by0;
  const width = 2 * (bx1 - bx0 + 1) + 1, height = 2 * (by1 - by0 + 1) + 1, distance = new Float64Array(width * height).fill(BIG);
  const point = (x, y) => { distance[(y - oy) * width + x - ox] = 0; };
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (mask[y * w + x]) {
    const xx = 2 * x, yy = 2 * y;
    if (pinned(x - 1, y)) for (let k = 0; k < 3; k++) point(xx, yy + k);
    if (pinned(x + 1, y)) for (let k = 0; k < 3; k++) point(xx + 2, yy + k);
    if (pinned(x, y - 1)) for (let k = 0; k < 3; k++) point(xx + k, yy);
    if (pinned(x, y + 1)) for (let k = 0; k < 3; k++) point(xx + k, yy + 2);
  }
  const size = Math.max(width, height), f = new Float64Array(size), out = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = distance[y * width + x];
    edt(f, height, out, v, z);
    for (let y = 0; y < height; y++) distance[y * width + x] = out[y];
  }
  for (let y = 0; y < height; y++) {
    const r = y * width;
    f.set(distance.subarray(r, r + width)); edt(f, width, out, v, z);
    for (let x = 0; x < width; x++) distance[r + x] = .5 * Math.sqrt(out[x]);
  }
  return { distance, width, ox, oy };
}

// Average over the entire square cell, including the zero-flux portion beyond
// the band. Quadrature spacing follows the physical regularisation length,
// never a fixed count of grid cells. Distances are bilinear between exact
// half-cell samples, so straight contact lines are represented exactly.
export function cellEdgeFlux(field, x, y, mm, E) {
  const { distance: d, width: w } = field, x0 = 2 * x - (field.ox ?? 0), y0 = 2 * y - (field.oy ?? 0);
  if (d[(y0 + 1) * w + x0 + 1] * mm > E + Math.SQRT2 * mm) return 0;
  const base = y0 * w + x0, first = d[base], gx = .5 * (d[base + 2] - first), gy = .5 * (d[base + 2 * w] - first);
  let straight = Math.abs(Math.abs(2 * gx) - 1) < 1e-12 && Math.abs(gy) < 1e-12 || Math.abs(Math.abs(2 * gy) - 1) < 1e-12 && Math.abs(gx) < 1e-12;
  if (straight) for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) if (Math.abs(d[base + iy * w + ix] - first - ix * gx - iy * gy) > 1e-12) straight = false;
  if (straight) {
    const a = Math.min(first, d[base + 2], d[base + 2 * w], d[base + 2 * w + 2]) * mm;
    const b = Math.max(first, d[base + 2], d[base + 2 * w], d[base + 2 * w + 2]) * mm;
    return edgeProfile(a, b, E);
  }
  // Samples 0.005 E apart, but at most 64 a side: a cell several millimetres wide (a coarse sheet, or the scrap a coarse
  // sheet calibrates on) asked for 635 a side, 400,000 samples an edge cell and a step, and a 48-cell painting took
  // minutes in its swatches. At 64 a 3 mm cell is still sampled every 0.05 mm, twenty samples across a 1 mm band.
  const count = Math.min(64, Math.max(2, Math.ceil(mm / (.005 * E)))), tail = 1 / Math.sqrt(1.02), norm = 2 * (Math.sqrt(1.02) - Math.sqrt(.02)) - tail;
  let sum = 0;
  for (let iy = 0; iy < count; iy++) for (let ix = 0; ix < count; ix++) {
    const xq = 2 * (ix + .5) / count, yq = 2 * (iy + .5) / count, ax = Math.floor(xq), ay = Math.floor(yq), fx = xq - ax, fy = yq - ay;
    const i = (y0 + ay) * w + x0 + ax;
    const dist = ((1 - fy) * ((1 - fx) * d[i] + fx * d[i + 1]) + fy * ((1 - fx) * d[i + w] + fx * d[i + w + 1])) * mm;
    if (dist < E) sum += (1 / Math.sqrt(dist / E + .02) - tail) / norm;
  }
  return sum / (count * count);
}
