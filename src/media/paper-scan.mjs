// A sheet of paper from a scanned height map instead of noise. Everything else is derived from the height as in
// makePaper; fibre direction still comes from makePaper, since a height scan has none. The scan tiles mirrored at
// each seam, one scan pixel to `scanScale` cells. DOM free apart from the loader.
import { makePaper } from './paper.mjs';

function box(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y * w + xx]; c++; } } tmp[y * w + x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; c++; } } out[y * w + x] = s / c; }
  return out;
}

const normalise = a => { let lo = Infinity, hi = -Infinity; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); } const d = hi - lo || 1; for (let i = 0; i < a.length; i++) a[i] = (a[i] - lo) / d; return a; };

/**
 * scan: { data: Uint8Array of grey values, width, height }. opts as makePaper's, plus scanScale (cells per scan
 * pixel), scanMix (share of the height from the scan; the rest is makePaper's own relief), cmin, cmax.
 */
export function scanPaper(w, h, scan, { scanScale = 1, scanMix = 1, cmin = 0.2, cmax = 0.55, scale = 1, toothScale = 1, proudBlur = 1, ...rest } = {}) {
  const base = makePaper(w, h, { scale, toothScale, proudBlur, cmin, cmax, ...rest });
  const n = w * h, sw = scan.width, sh = scan.height;
  // mirrored tiling: a coordinate runs 0..sw-1 then back down, so the tile's edges meet themselves
  const mirror = (v, m) => { const p = 2 * m; let q = ((v % p) + p) % p; return q < m ? q : p - 1 - q; };
  const height = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = mirror(Math.floor(x / scanScale), sw), sy = mirror(Math.floor(y / scanScale), sh);
    height[y * w + x] = scan.data[sy * sw + sx] / 255;
  }
  normalise(height);
  for (let i = 0; i < n; i++) height[i] = scanMix * height[i] + (1 - scanMix) * base.height[i];
  normalise(height);
  const blur = r => Math.max(1, Math.round(r * scale * toothScale));
  const valley = normalise(box(height, w, h, blur(1))), capacity = new Float32Array(n);
  for (let i = 0; i < n; i++) capacity[i] = valley[i] * (cmax - cmin) + cmin;
  const tooth = normalise(box(box(box(height, w, h, blur(2)), w, h, blur(2)), w, h, blur(2)));
  const proudLow = box(height, w, h, Math.max(1, Math.round(proudBlur)));
  const proud = new Float32Array(n); for (let i = 0; i < n; i++) proud[i] = height[i] - proudLow[i];
  const rel = new Float32Array(n); for (let i = 0; i < n; i++) rel[i] = height[i] - tooth[i];
  const sorted = Float32Array.from(rel).sort();
  const relief = Math.max(1e-4, sorted[Math.floor(n * 0.9)] - sorted[Math.floor(n * 0.1)]);
  return { w, h, n, height, capacity, valley, proud, tooth, fdx: base.fdx, fdy: base.fdy, grain: base.grain, relief };
}
