// Picture analysis for the target painter (target.js): CIE Lab per cell, k-means in Lab, a majority filter, connected
// regions with small ones merged into their neighbours, and the structure tensor's orientation field. DOM free.

const lin = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB bytes to CIE Lab (D65). */
export function toLab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** A small seeded generator, so a picture gives the same plan every time. */
export const seeded = seed => { let s = (seed * 7919 + 13) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

/** Lab of each cell of an RGBA buffer, as three Float32Arrays. */
export function labField(px, n) {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const [l, a, b] = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); L[i] = l; A[i] = a; B[i] = b; }
  return { L, A, B };
}

/** k-means in Lab over the cells where `mask` is set (lightness weighted by `wL`). Labels are -1 outside the mask. */
export function kmeans({ L, A, B }, mask, k, rnd, wL = 1) {
  const idx = []; for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const labels = new Int16Array(mask.length).fill(-1);
  if (!idx.length) return { labels, centres: [] };
  const pt = i => [L[i] * wL, A[i], B[i]], d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

  const centres = [pt(idx[Math.floor(rnd() * idx.length)])];
  while (centres.length < Math.min(k, idx.length)) {
    const w = idx.map(i => Math.min(...centres.map(c => d2(pt(i), c)))), sum = w.reduce((a, b) => a + b, 0);
    if (!sum) break;
    let r = rnd() * sum, j = 0; while (r > w[j] && j < w.length - 1) r -= w[j++];
    centres.push(pt(idx[j]));
  }
  for (let it = 0; it < 12; it++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (const i of idx) {
      const p = pt(i); let best = 0, bd = Infinity;
      centres.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; best = j; } });
      labels[i] = best; const a = acc[best]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++;
    }
    acc.forEach((a, j) => { if (a[3]) centres[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  return { labels, centres: centres.map(c => [c[0] / wL, c[1], c[2]]) };
}

/** A 3 x 3 majority filter over the labels, `times` over; cells outside the mask (-1) stay out. */
export function majority(labels, cols, rows, times = 2) {
  let cur = labels;
  for (let t = 0; t < times; t++) {
    const next = Int16Array.from(cur);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x; if (cur[i] < 0) continue;
      const count = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
        const l = cur[Y * cols + X]; if (l >= 0) count.set(l, (count.get(l) ?? 0) + 1);
      }
      let best = cur[i], bc = 0; for (const [l, c] of count) if (c > bc) { bc = c; best = l; }
      next[i] = best;
    }
    cur = next;
  }
  return cur;
}

/** Connected regions (4-neighbour) of equal label: { id per cell (-1 outside), regions: [{ label, cells }] }. */
function components(labels, cols, rows) {
  const id = new Int32Array(labels.length).fill(-1), regions = [];
  for (let s = 0; s < labels.length; s++) {
    if (labels[s] < 0 || id[s] >= 0) continue;
    const r = regions.length, cells = [s]; id[s] = r;
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q], x = i % cols, y = (i / cols) | 0;
      for (const [X, Y] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
        const j = Y * cols + X; if (id[j] < 0 && labels[j] === labels[s]) { id[j] = r; cells.push(j); }
      }
    }
    regions.push({ label: labels[s], cells });
  }
  return { id, regions };
}

/** Relabel regions smaller than `minCells` with their most common neighbouring label, then find the regions again. */
export function mergeSmall(labels, cols, rows, minCells) {
  const out = Int16Array.from(labels);
  const { id, regions } = components(out, cols, rows);
  for (const r of regions) {
    if (r.cells.length >= minCells) continue;
    const count = new Map();
    for (const i of r.cells) {
      const x = i % cols, y = (i / cols) | 0;
      for (const [X, Y] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
        const j = Y * cols + X; if (out[j] >= 0 && id[j] !== id[i]) count.set(out[j], (count.get(out[j]) ?? 0) + 1);
      }
    }
    let best = -1, bc = 0; for (const [l, c] of count) if (c > bc) { bc = c; best = l; }
    if (best >= 0) for (const i of r.cells) out[i] = best;
  }
  return components(out, cols, rows);
}

const blur = (v, cols, rows, radius) => {
  const tmp = new Float32Array(v.length), out = new Float32Array(v.length);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let s = 0, n = 0; for (let d = -radius; d <= radius; d++) { const X = x + d; if (X >= 0 && X < cols) { s += v[y * cols + X]; n++; } } tmp[y * cols + x] = s / n; }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let s = 0, n = 0; for (let d = -radius; d <= radius; d++) { const Y = y + d; if (Y >= 0 && Y < rows) { s += tmp[Y * cols + x]; n++; } } out[y * cols + x] = s / n; }
  return out;
};

/**
 * The structure tensor of lightness: per cell the direction along the edges (radians), how coherent it is (0..1) and the
 * gradient's magnitude.
 */
export function orientation(L, cols, rows, radius = 3) {
  const n = cols * rows, gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const at = (X, Y) => L[Math.min(rows - 1, Math.max(0, Y)) * cols + Math.min(cols - 1, Math.max(0, X))];
    const i = y * cols + x;
    gx[i] = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / 8;
    gy[i] = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) / 8;
    mag[i] = Math.hypot(gx[i], gy[i]);
  }
  const xx = blur(gx.map((v, i) => v * v), cols, rows, radius), yy = blur(gy.map(v => v * v), cols, rows, radius), xy = blur(gx.map((v, i) => v * gy[i]), cols, rows, radius);
  const angle = new Float32Array(n), coherence = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = xx[i], b = yy[i], c = xy[i], tr = a + b, root = Math.sqrt((a - b) ** 2 + 4 * c * c);
    // the gradient's dominant direction, turned a quarter: the stroke runs along the edge
    angle[i] = 0.5 * Math.atan2(2 * c, a - b) + Math.PI / 2;
    coherence[i] = tr > 1e-6 ? (root / tr) ** 2 : 0;
  }
  return { angle, coherence, mag };
}

/** A region's centre and principal axis (radians) from its cells' second moments. */
export function axisOf(cells, cols) {
  let sx = 0, sy = 0; for (const i of cells) { sx += i % cols; sy += (i / cols) | 0; }
  const mx = sx / cells.length, my = sy / cells.length;
  let a = 0, b = 0, c = 0; for (const i of cells) { const dx = i % cols - mx, dy = ((i / cols) | 0) - my; a += dx * dx; b += dy * dy; c += dx * dy; }
  return { cx: mx, cy: my, angle: 0.5 * Math.atan2(2 * c, a - b), elongation: Math.sqrt(((a - b) ** 2 + 4 * c * c)) / Math.max(1e-6, a + b) };
}
