// White gouache laid last over the dry washes, for small lights the washes covered. Gouache is opaque and does not
// flow, so it stays out of the sheet's physics and is composited over the rendered washes as a cover. A thin or
// dry brush covers less: a sub-cell whisker covers its share, and a dry brush skips the paper's hollows. DOM free.

/**
 * How much white each cell wants: where the source has a small light (`share`, the part of the cell the light covers
 * on the source) and the painting has lost it (it reads more than `margin` denser than the source there).
 * @param share     Float32Array per cell, 0..1
 * @param painted   the painting's density per cell
 * @param source    the source's density per cell
 * @param full      the share of a cell at which the white covers it
 * @returns Float32Array cover per cell, 0..1
 */
export function gouacheCover(share, painted, source, n, { margin = 0.08, full = 0.5 } = {}) {
  const cover = new Float32Array(n);
  for (let i = 0; i < n; i++) if (share[i] > 0 && painted[i] - source[i] > margin) cover[i] = Math.min(1, share[i] / Math.max(1e-6, full));
  return cover;
}

/**
 * The cover as a dry brush lays it: at most `opacity` of the cell, and less where the paper is low. `height` is the
 * paper's surface (0 in its hollows, 1 on its hills); `dry` is how much of the white the deepest hollows miss.
 */
export function dryCover(cover, height, n, { opacity = 0.9, dry = 0.5 } = {}) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cover[i]) continue;
    const low = Math.max(0, Math.min(1, (0.55 - height[i]) / 0.35));
    out[i] = cover[i] * opacity * (1 - dry * low);
  }
  return out;
}

/** An RGB buffer with an opaque colour laid over it at each cell's cover. The buffer given is not changed. */
export function overlay(rgb, cover, colour, n) {
  const out = Buffer.from(rgb);
  for (let i = 0; i < n; i++) {
    const a = cover[i]; if (!a) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[i * 3 + c] * (1 - a) + colour[c] * a);
  }
  return out;
}
