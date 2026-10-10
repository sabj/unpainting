// Mark counts and lengths, ink on tone steps, and reserved paper: things pixel line precision and recall cannot see.
import { gaussian } from '../keyframes/density.mjs';
import { hessianRidges, ridgeMask } from '../crop/layers.mjs';
import { thin, components } from '../raster.js';

// One bench-wide setting so numbers compare across crops and tools.
const RIDGE_SIGMAS = [0.7, 1.0, 1.4, 2.0], RIDGE_HIGH = 0.05, RIDGE_LOW = 0.02;

/** The ink of a picture: thin dark ridges, hysteresis-linked. Washes are broad, so they are not in here. */
export function inkMask(D, w, h) {
  const R = hessianRidges(D, w, h, RIDGE_SIGMAS);
  return { mask: ridgeMask(R.dark, R.nxD, R.nyD, w, h, RIDGE_HIGH, RIDGE_LOW), R };
}

/**
 * Mark count and lengths: the ink skeleton cut at junctions, one piece per mark. Length is pixel count (undercounts
 * diagonals by up to 41%), so compare count and short share against the keyframe's own.
 */
export function markStats(mask, w, h, minLength = 3) {
  const sk = thin(mask, w, h), cut = new Uint8Array(sk);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!sk[i]) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && sk[i + dy * w + dx]) n++;
    if (n >= 3) cut[i] = 0;
  }
  const { areas, count } = components(cut, w, h);
  const lengths = [];
  for (let id = 1; id <= count; id++) if (areas[id] >= minLength) lengths.push(areas[id]);
  lengths.sort((a, b) => a - b);
  const total = lengths.reduce((s, v) => s + v, 0), q = p => (lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * p))] : 0);
  return {
    count: lengths.length, totalLength: total, medianLength: q(0.5), p90Length: q(0.9),
    // share of drawn length in marks under 8 px
    shortShare: total ? lengths.filter(v => v < 8).reduce((s, v) => s + v, 0) / total : 0,
  };
}

/**
 * Share of the painting's ink on a keyframe tone step rather than a ridge (line).
 * Across the ink's ridge direction: peak = rise above the lighter neighbour, step = neighbour difference.
 * A ridge has peak at least half the step; too little of either is flat. Each side takes the lightest of several
 * probe distances so hatching does not read as steps.
 */
export function inkPlacement(paintD, keyD, w, h, { probe = [2, 3, 4, 5], minPeak = 0.02, minStep = 0.04 } = {}) {
  const { mask, R } = inkMask(paintD, w, h), K = gaussian(keyD, w, h, 1.0);
  const at = (F, x, y) => F[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  let ink = 0, line = 0, boundary = 0, flat = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue; ink++;
    const nx = R.nxD[i], ny = R.nyD[i];
    const side = s => { let m = Infinity; for (const d of probe) m = Math.min(m, at(K, x + nx * d * s, y + ny * d * s)); return m; };
    const c = at(K, x, y), l = side(1), r = side(-1);
    const peak = c - Math.max(l, r), step = Math.abs(l - r);
    if (peak > minPeak && peak >= 0.5 * step) line++;
    else if (step > minStep) boundary++;
    else flat++;
  }
  return { ink, lineShare: ink ? line / ink : 0, boundaryShare: ink ? boundary / ink : 0, flatShare: ink ? flat / ink : 0 };
}

/** Untouched paper share against the keyframe's own. Threshold 0.03 OD is about where paper stops reading blank. */
export const paperShare = (D, n, threshold = 0.03) => { let c = 0; for (let i = 0; i < n; i++) if (D[i] < threshold) c++; return c / n; };
