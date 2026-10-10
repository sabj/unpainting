// Gaussian blur of a float plane. Many painting and scoring modules use it.
import { blurRows, blurCols } from './blur-kernel.mjs';

export function gaussian(src, w, h, sigma) {
  if (!sigma) return src;
  const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  // the thread pool (sheet-par.mjs) takes row bands when running and the image is big enough; results are identical
  if (BLUR_THREADS) { const par = BLUR_THREADS(src, w, h, k, r); if (par) return par; }
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  blurRows(src, tmp, w, k, r, 0, h); blurCols(tmp, out, w, h, k, r, 0, h);
  return out;
}
let BLUR_THREADS = null;
export const useBlurThreads = f => { BLUR_THREADS = f; };
