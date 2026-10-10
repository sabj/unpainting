// Layers of a keyframe crop, measured the way an ink drawing is made: dark ridges (pen lines and hatching),
// light ridges (strands of paper or pale wash kept free of later pigment) and the broad density field (washes).
// DOM free. Density is optical: D = -ln(L / paper).
import { gaussian } from '../keyframes/density.mjs';

/**
 * Multi-scale Hessian ridges on a density map. For each pixel: the strongest scale-normalised dark-ridge and
 * light-ridge response, the scale it came from, and the direction across the ridge.
 */
export function hessianRidges(D, w, h, sigmas = [0.8, 1.2, 1.8, 2.6]) {
  const n = w * h, dark = new Float32Array(n), light = new Float32Array(n), scaleD = new Float32Array(n), scaleL = new Float32Array(n), nxD = new Float32Array(n), nyD = new Float32Array(n), nxL = new Float32Array(n), nyL = new Float32Array(n);
  for (const s of sigmas) {
    const G = gaussian(D, w, h, s), norm = Math.pow(s, 1.5);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const dxx = G[i + 1] - 2 * G[i] + G[i - 1], dyy = G[i + w] - 2 * G[i] + G[i - w], dxy = (G[i + w + 1] - G[i + w - 1] - G[i - w + 1] + G[i - w - 1]) / 4;
      const half = (dxx + dyy) / 2, root = Math.sqrt(((dxx - dyy) / 2) ** 2 + dxy * dxy), lo = half - root, hi = half + root;
      // across a dark ridge the density falls on both sides: the most negative eigenvalue, its vector is "across"
      const r = Math.max(0, -lo - Math.max(0, hi)) * norm;
      if (r > dark[i]) { dark[i] = r; scaleD[i] = s; const [ex, ey] = eigvec(dxx, dxy, dyy, lo); nxD[i] = ex; nyD[i] = ey; }
      const l = Math.max(0, hi - Math.max(0, -lo)) * norm;
      if (l > light[i]) { light[i] = l; scaleL[i] = s; const [ex, ey] = eigvec(dxx, dxy, dyy, hi); nxL[i] = ex; nyL[i] = ey; }
    }
  }
  return { dark, light, scaleD, scaleL, nxD, nyD, nxL, nyL };
}

function eigvec(a, b, d, lambda) {
  let x = b, y = lambda - a; if (Math.abs(x) + Math.abs(y) < 1e-9) { x = lambda - d; y = b; }
  const m = Math.hypot(x, y); return m < 1e-9 ? [1, 0] : [x / m, y / m];
}

/** Thin ridge mask: non-maximum suppression across the ridge, then hysteresis between low and high. */
export function ridgeMask(resp, nx, ny, w, h, high, low) {
  const n = w * h, keep = new Uint8Array(n), at = (x, y) => { const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y))); return resp[yi * w + xi]; };
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, v = resp[i]; if (v < low) continue; if (v >= at(x + nx[i], y + ny[i]) && v >= at(x - nx[i], y - ny[i])) keep[i] = 1; }
  const out = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) if (keep[i] && resp[i] >= high) { out[i] = 1; stack.push(i); }
  while (stack.length) { const i = stack.pop(), x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (keep[q] && !out[q]) { out[q] = 1; stack.push(q); } } }
  return out;
}

/** Precision and recall of mask a against b with a positional tolerance in pixels. */
export function matchMasks(a, b, w, h, tol = 1) {
  const near = (m, x, y) => { for (let dy = -tol; dy <= tol; dy++) for (let dx = -tol; dx <= tol; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx]) return true; } return false; };
  let na = 0, nb = 0, ha = 0, hb = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (a[i]) { na++; if (near(b, x, y)) ha++; } if (b[i]) { nb++; if (near(a, x, y)) hb++; } }
  return { precision: na ? ha / na : 1, recall: nb ? hb / nb : 1, count: na, target: nb };
}
