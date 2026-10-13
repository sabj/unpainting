// The target's own edge evidence for the linework stage: where its edges are, which way they run and how far every
// cell is from the nearest one. The sketch check (sketch-check.mjs) measures a drawn line against it, the line
// cleanup (line-cleanup.mjs) reads which side of an edge is darker and whether its colour changes, and the gate
// (line-gate.mjs) counts the long straight edges. Planning only: it reads the target once, before the guard seals it.
import { gaussian } from '../../keyframes/density.mjs';

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const LIN = Float32Array.from({ length: 256 }, (_, i) => lin(i));
const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** CIE Lab planes of an sRGB image (D65), L in 0..1 and a, b in units of 100. */
export function labPlanes(rgb, w, h) {
  const n = w * h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = LIN[rgb[3 * i]], g = LIN[rgb[3 * i + 1]], b = LIN[rgb[3 * i + 2]];
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b), fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    L[i] = (116 * fy - 16) / 100; A[i] = 5 * (fx - fy); B[i] = 2 * (fy - fz);
  }
  return { L, A, B };
}

const quantile = (vals, q) => { if (!vals.length) return 0; const s = Float32Array.from(vals).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/**
 * Edges of a colour image: the Di Zenzo gradient of Lab (chroma counted at `chroma`), thinned across the edge and
 * kept by hysteresis between quantiles of the thinned magnitude. `ori` is the gradient angle (radians, across the
 * edge), `mag` its strength in Lab units per cell.
 */
export function colourEdges(rgb, w, h, { sigma = 1, chroma = 1, high = 0.8, low = 0.45, minContrast = 0.012, margin = 2 } = {}) {
  const n = w * h, { L, A, B } = labPlanes(rgb, w, h);
  const P = [gaussian(L, w, h, sigma), gaussian(A, w, h, sigma), gaussian(B, w, h, sigma)];
  const wts = [1, chroma, chroma];
  const mag = new Float32Array(n), ori = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; let xx = 0, yy = 0, xy = 0;
    for (let c = 0; c < 3; c++) { const p = P[c], gx = (p[i + 1] - p[i - 1]) / 2 * wts[c], gy = (p[i + w] - p[i - w]) / 2 * wts[c]; xx += gx * gx; yy += gy * gy; xy += gx * gy; }
    const tr = xx + yy, det = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy));
    mag[i] = Math.sqrt(Math.max(0, (tr + det) / 2));
    ori[i] = 0.5 * Math.atan2(2 * xy, xx - yy);
  }
  const thin = new Float32Array(n);
  for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) {
    const i = y * w + x, m = mag[i]; if (m < minContrast) continue;
    const ux = Math.cos(ori[i]), uy = Math.sin(ori[i]);
    const a = mag[Math.round(y + uy) * w + Math.round(x + ux)], b = mag[Math.round(y - uy) * w + Math.round(x - ux)];
    if (m >= a && m >= b) thin[i] = m;
  }
  const vals = []; for (let i = 0; i < n; i++) if (thin[i] > 0) vals.push(thin[i]);
  const hi = Math.max(minContrast * 2, quantile(vals, high)), lo = Math.max(minContrast, quantile(vals, low));
  const edge = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (thin[i] >= hi) { edge[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx; if (!edge[j] && thin[j] >= lo) { edge[j] = 1; stack.push(j); }
    }
  }
  return { edge, ori, mag, L, A, B, smooth: P, thresholds: { high: hi, low: lo } };
}

// One dimension of the exact squared distance transform (Felzenszwalb and Huttenlocher), with the argmin.
function edt1(fv, n, d, arg, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { const p = v[k]; s = ((fv[q] + q * q) - (fv[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
    if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + fv[v[k]]; arg[q] = v[k]; }
}

/**
 * Distance in cells from every cell to the nearest set cell of `mask`, and that cell's index (-1 when the mask is
 * empty). Exact Euclidean.
 */
export function nearestEdge(mask, w, h) {
  const n = w * h, BIG = 1e12, col = new Float64Array(n), rowOf = new Int32Array(n);
  const m = Math.max(w, h), fv = new Float64Array(m), d = new Float64Array(m), arg = new Int32Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) fv[y] = mask[y * w + x] ? 0 : BIG;
    edt1(fv, h, d, arg, v, z);
    for (let y = 0; y < h; y++) { col[y * w + x] = d[y]; rowOf[y * w + x] = arg[y]; }
  }
  const dist = new Float32Array(n), near = new Int32Array(n).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) fv[x] = col[y * w + x];
    edt1(fv, w, d, arg, v, z);
    for (let x = 0; x < w; x++) {
      const i = y * w + x; dist[i] = Math.sqrt(d[x]);
      if (d[x] < BIG / 2) near[i] = rowOf[y * w + arg[x]] * w + arg[x];
    }
  }
  return { dist, near };
}

/** The target's edge evidence on the w x h plan grid: colourEdges plus the distance to, and index of, the nearest edge. */
export function edgeEvidence(rgb, w, h, options = {}) {
  const e = colourEdges(rgb, w, h, options);
  return { ...e, ...nearestEdge(e.edge, w, h), w, h };
}
