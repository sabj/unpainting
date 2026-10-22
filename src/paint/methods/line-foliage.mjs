// Pipeline: inking, stage 2 (hold and measure the lines): foliage by colour and texture.
// Leaves are wash. Where the regions' labels miss a leaf mass, a cell is foliage when the source around it is green and busy:
// a green cast (a* under -2.5, b* over 3 in CIE Lab) smoothed over a millimetre, and a spread of L* within it. Pure.
import { boxBlur } from './ink-labels.mjs';

const FOLIAGE_DEFAULTS = Object.freeze({ greenA: -0.025, greenB: 0.03, textureL: 4.5, radiusMm: 1.0, growMm: 0.8 });

/** 0/1 plane of foliage cells. L in L* (0..100), A and B as line-evidence.mjs labPlanes gives them (units of 100). */
export function foliageMask(L, A, B, w, h, pxMm, o = FOLIAGE_DEFAULTS) {
  const r = Math.max(1, Math.round(o.radiusMm / pxMm)), a = boxBlur(A, w, h, r), b = boxBlur(B, w, h, r);
  const m = boxBlur(L, w, h, r), sq = boxBlur(Float32Array.from(L, v => v * v), w, h, r);
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) raw[i] = a[i] < o.greenA && b[i] > o.greenB && Math.sqrt(Math.max(0, sq[i] - m[i] * m[i])) >= o.textureL ? 1 : 0;
  const g = Math.max(1, Math.round(o.growMm / pxMm)), grown = boxBlur(Float32Array.from(raw), w, h, g), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = grown[i] > 0.15 ? 1 : 0;
  return out;
}
