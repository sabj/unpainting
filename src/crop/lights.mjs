// The small lights a painter keeps inside paint (a catchlight, a fleck in a dark coat, a light whisker), sealed with
// masking fluid before the first wash: the plan's closing and the wash both fill holes a few cells wide.
//
// A light is a pixel within `white` of paper in its furthest channel that a grey closing of `radius` px raises by at
// least `depth`, and that is enclosed: of eight rays out to the radius, at least `enclose` meet paint of at least
// `hold` of the closed tone, and none reaches ground the closing leaves light. `ratio` is off by default because on
// photographs it takes in every light hair. DOM free.
import { minFilter, maxFilter } from '../raster.js';

const RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * How far each pixel is from paper, in its furthest channel. On luminance alone, tan sand reads as cream paper.
 * @param px  RGB bytes, n pixels
 */
export function paperDensity(px, n, paperRGB) {
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, -Math.log(Math.max(0.02, Math.min(1, px[i * 3 + c] / Math.max(1, paperRGB[c])))));
    D[i] = d;
  }
  return D;
}

/**
 * The small lights in a density field.
 * @param D        optical density per pixel, 0 at paper
 * @param radius   pixels: lights up to twice this wide are found, and enclosure is looked for this far
 * @param depth    how much the closing must raise a light's tone
 * @param white    the most density a light may have
 * @param ratio    or, where more, this share of its closed tone
 * @param enclose  of eight rays, how many must meet paint within the radius, with none reaching open ground
 * @param hold     paint, on a ray, is at least this share of the light's closed tone and `depth` above the light
 * @returns {{ mask: Uint8Array, count: number }}
 */
export function smallLights(D, w, h, { radius = 3, depth = 0.25, white = 0.12, ratio = 0, enclose = 6, hold = 0.5 } = {}) {
  const n = w * h, r = Math.max(1, Math.round(radius));
  const surround = minFilter(maxFilter(D, w, h, r), w, h, r);
  const mask = new Uint8Array(n);
  let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, d = D[i];
    if (d > Math.max(white, ratio * surround[i]) || surround[i] - d < depth) continue;
    const dark = Math.max(d + depth, hold * surround[i]);
    let closed = 0, open = false;
    for (let k = 0; k < 8 && !open && closed + (8 - k) >= enclose; k++) {
      const [dx, dy] = RAYS[k];
      for (let s = 1; s <= r; s++) {
        const xx = x + dx * s, yy = y + dy * s;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
        const j = yy * w + xx;
        if (D[j] >= dark) { closed++; break; }
        if (surround[j] < dark) { open = true; break; }
      }
    }
    if (!open && closed >= enclose) { mask[i] = 1; count++; }
  }
  return { mask, count };
}

/** The share of each of the sheet's cells that a fine mask covers. */
export function cellShare(fine, fw, fh, w, h) {
  const hit = new Float32Array(w * h), all = new Float32Array(w * h);
  for (let y = 0; y < fh; y++) {
    const cy = Math.min(h - 1, Math.floor(y * h / fh));
    for (let x = 0; x < fw; x++) { const c = cy * w + Math.min(w - 1, Math.floor(x * w / fw)); all[c]++; hit[c] += fine[y * fw + x]; }
  }
  return Float32Array.from(hit, (v, i) => (all[i] > 0 ? v / all[i] : 0));
}

/** A fine mask brought down to the sheet's cells: a cell is set where the fine mask covers at least `share` of it. */
export function coverCells(fine, fw, fh, w, h, { share = 0.3 } = {}) {
  return Uint8Array.from(cellShare(fine, fw, fh, w, h), v => (v >= share ? 1 : 0));
}

/**
 * A passage's mask with the reserved lights inside it filled back, for the brush to follow: over masking fluid the
 * brush sweeps straight across rather than narrowing at each hole. A light is filled where the passage lies on both
 * sides of it within `reach` cells.
 */
export function fillReserved(mask, reserve, w, h, { reach = 3 } = {}) {
  const out = Uint8Array.from(mask), r = Math.max(1, Math.round(reach));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (out[i] || !reserve[i]) continue;
    let left = false, right = false, up = false, down = false;
    for (let d = 1; d <= r; d++) {
      if (!left && x - d >= 0 && mask[i - d]) left = true;
      if (!right && x + d < w && mask[i + d]) right = true;
      if (!up && y - d >= 0 && mask[i - d * w]) up = true;
      if (!down && y + d < h && mask[i + d * w]) down = true;
    }
    if ((left && right) || (up && down)) out[i] = 1;
  }
  return out;
}

/** Keep the largest 4-connected lights with at least min cells, up to max components.
 * Dropping small specks avoids fragmented reserves.
 * @returns {mask, kept, dropped}; mask is a new Uint8Array and counts refer to components. */
export function keepLargestLights(mask, w, h, { min = 2, max = 24 } = {}) {
  const n = w * h, label = new Int32Array(n).fill(-1), groups = [];
  for (let i = 0; i < n; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = groups.length, cells = [i]; label[i] = id;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], x = c % w, y = (c / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx; if (mask[q] && label[q] < 0) { label[q] = id; cells.push(q); }
      }
    }
    groups.push(cells);
  }
  const big = groups.filter(g => g.length >= min).sort((a, b) => b.length - a.length).slice(0, max);
  const out = new Uint8Array(n);
  for (const g of big) for (const i of g) out[i] = 1;
  return { mask: out, kept: big.length, dropped: groups.length - big.length };
}
