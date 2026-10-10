// A watercolour-style target for a photograph with no artwork behind it: the picture the painter aims at and the
// reference its result is measured against. It carries only what holds across paired photographs and artworks: chroma falls,
// fine structure survives, and the range and values compress. How much paper a picture keeps is composition and
// belongs to --finish (src/crop/finish.mjs). DOM free. The caller supplies its palette and unmix.

/** Edge-preserving mean: the average of the neighbours within `range` of this cell's own value, over `radius` cells.
 *  Detail below the brush goes; the line between a coat and a sky stays. */
export function seeAsMasses(L, w, h, { radius = 3, range = 0.12 } = {}) {
  const n = w * h, out = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = L[i];
    let sum = 0, cnt = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const v = L[yy * w + xx];
        if (Math.abs(v - c) <= range) { sum += v; cnt++; }
      }
    }
    out[i] = cnt ? sum / cnt : c;
  }
  return out;
}

/**
 * The edge-preserving mean over all three channels: a cell takes the average colour of the neighbours whose density
 * is within `range` of its own in every channel, over `radius` cells. No paper threshold and no value steps, so a pale
 * form keeps its value and loses only its speckle. Used by paint-plate's --masses to plan from big shapes.
 */
export function massesOf(D3, w, h, { radius = 5, range = 0.12 } = {}) {
  const n = w * h, out = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let r = 0, g = 0, b = 0, cnt = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const j = yy * w + xx;
        // every channel within range, not only the mean: two colours of equal value (a red shirt against a green hill)
        // are two masses, and a mean-only test smeared one into the other
        if (Math.abs(D3[j * 3] - D3[i * 3]) <= range && Math.abs(D3[j * 3 + 1] - D3[i * 3 + 1]) <= range && Math.abs(D3[j * 3 + 2] - D3[i * 3 + 2]) <= range) { r += D3[j * 3]; g += D3[j * 3 + 1]; b += D3[j * 3 + 2]; cnt++; }
      }
    }
    out[i * 3] = r / cnt; out[i * 3 + 1] = g / cnt; out[i * 3 + 2] = b / cnt;
  }
  return out;
}

/**
 * Compress a density field into what paper and pigment hold: nothing below `paperAt` of the range is painted at all,
 * and the darkest note stops at `deepest` of what the photograph reaches.
 */
export function setKey(D, n, { paperAt = 0.06, deepest = 0.82 } = {}) {
  let hi = 0;
  for (let i = 0; i < n; i++) if (D[i] > hi) hi = D[i];
  const floor = paperAt * hi, span = Math.max(1e-6, hi - floor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = D[i] <= floor ? 0 : (deepest * hi) * ((D[i] - floor) / span);
  return out;
}

/** Continuous tone into `values` washes, with the step nearest each cell. Paper stays paper. */
export function chooseValues(D, n, { values = 7 } = {}) {
  let hi = 0;
  for (let i = 0; i < n; i++) if (D[i] > hi) hi = D[i];
  if (!(hi > 0)) return Float32Array.from(D);
  const step = hi / values, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = D[i] <= 0 ? 0 : Math.max(1, Math.round(D[i] / step)) * step;
  return out;
}

/**
 * The whole pass, over per-channel density.
 *
 * @param D3       channel density, 3 per cell, as channelDensity gives it
 * @param unmixTo  (D3) => ({ amounts, pigments }) the caller's palette fit, so the target holds only mixable colour
 * @param chroma   how far to push what chroma survived, 1 leaving it alone
 * @returns Float32Array of channel density, the same shape as the input
 */
export function styleTarget(D3, w, h, unmixTo, { radius = 5, range = 0.12, values = 9, paperAt = 0.2, deepest = 0.58, chroma = 0.65 } = {}) {
  const n = w * h;
  // masses first, on the luminance the eye groups by, and the channels carried with it so hue does not swim
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (D3[i * 3] + D3[i * 3 + 1] + D3[i * 3 + 2]) / 3;
  const M = seeAsMasses(L, w, h, { radius, range });
  const keyed = chooseValues(setKey(M, n, { paperAt, deepest }), n, { values });
  const shaped = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const scale = L[i] > 1e-6 ? keyed[i] / L[i] : 0;
    for (let c = 0; c < 3; c++) shaped[i * 3 + c] = D3[i * 3 + c] * scale;
  }
  // only colour the box can mix, then damped: a box of pans is duller than a sensor
  const fitted = unmixTo ? unmixTo(shaped) : shaped;
  if (chroma === 1) return fitted;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const m = (fitted[i * 3] + fitted[i * 3 + 1] + fitted[i * 3 + 2]) / 3;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, m + (fitted[i * 3 + c] - m) * chroma);
  }
  return out;
}
