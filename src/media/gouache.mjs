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

// ---------------------------------------------------------------------------------------------------------------
// Rigger gouache in the sheet's physics. White gouache is a pigment like the others: a scatterer with almost no
// absorption, laid dry on top of the dry washes in the sheet's own top layer, and rendered by the same
// Kubelka-Munk composite as every glaze. It hides what it lies on because it is thick, not because it is composited
// over the picture: a film of thickness x scatters t = S x, reflects t / (1 + t) of the light and passes 1 / (1 + t).
// The scatter is the paint table's own value for an opaque paint (src/media/pigment-physical.mjs, one rule for every
// paint); the film is the thickness at which a loaded rigger's stroke hides (HIDING = S x), a physical property of
// gouache, not a gain fitted to any picture. A stroke is laid by the dry-deposit route a pencil uses
// (src/media/graphite.mjs), so pressure, the paper's tooth and the stroke's width are the physics already in use.
import { physicalOf } from './pigment-physical.mjs';

/** S x of a full-pressure rigger stroke: the film passes 1 / (1 + HIDING) = 8% of the light that reaches it. */
export const HIDING = 12;
const OPAQUE_S = physicalOf('cadred').scatter[0]; // the table's value for an opaque paint
export const GOUACHE_PIGMENT = Object.freeze({ name: 'white gouache', K: Object.freeze([0.0005, 0.0005, 0.0005]), S: Object.freeze([OPAQUE_S, OPAQUE_S, OPAQUE_S]), rho: 0.084, omega: 0.5, gamma: 0 });
/** The deposit, in the sheet's thickness units, of a full-pressure stroke. */
export const GOUACHE_FILM = HIDING / OPAQUE_S;

// the reflectance of a gouache film of scatter t = HIDING over a dark ground, at absorption ratio k
function filmReflectance(k, t = HIDING) {
  const a = 1 + k, b = Math.sqrt(Math.max(1e-12, a * a - 1)), bt = b * t;
  if (bt > 20) return a - b;
  const sh = Math.sinh(bt), ch = Math.cosh(bt);
  return sh / (a * sh + b * ch);
}
// the absorption ratio k = K / S that gives reflectance r, by bisection (reflectance falls as k rises)
function filmAbsorption(r) {
  const top = filmReflectance(0), want = Math.min(r, 0.98 * top);
  let lo = 0, hi = 60;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (filmReflectance(mid) > want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * White tinted toward a colour: gouache mixed with a little of the palette's paints, as a painter does for a light that
 * is not paper white. A film that scatters S x = HIDING and absorbs K x over a dark ground reflects
 * R = sinh(b t) / (a sinh(b t) + b cosh(b t)), a = 1 + k, b = sqrt(a^2 - 1), k = K / S, t = HIDING (Kubelka-Munk, the
 * ground's own share is under 1% at this thickness). A reflectance R in a channel asks for the k that gives it, by
 * bisection. The paints that give that absorption best, in least squares over the three channels, are the tint: every
 * mix of one, two or three palette paints is solved for non-negative amounts, and the one that misses least wins, a
 * mix of two paints only when it misses at least 15% less than one. A colour within 8% of the paper in every channel
 * is a true glint: pure white.
 * @param rgb       the light's colour, 0..255
 * @param paperRGB  the sheet's paper colour
 * @param pigments  the palette's pigments (K per channel)
 * @param floor     the darkest reflectance a light may take
 * @returns {{ mix: [{ pigment: number, amount: number }], residual: number }} pigment is an index into `pigments`
 */
export function gouacheTint(rgb, paperRGB, pigments, { floor = 0.35 } = {}) {
  const R = [0, 1, 2].map(c => Math.min(0.98, Math.max(floor, rgb[c] / Math.max(1, paperRGB[c]))));
  if (R.every(v => v >= 0.92)) return { mix: [], residual: 0 };
  const need = R.map((r, c) => Math.max(0, filmAbsorption(r) * HIDING - GOUACHE_PIGMENT.K[c] * GOUACHE_FILM));
  return mixFor(need, pigments);
}

/**
 * The palette paints, one, two or three, whose absorption (K x, amounts x non-negative) best matches `need` in the three
 * channels, in least squares. A mix of more paints is taken only when it misses at least 15% less than the one before.
 * @returns {{ mix: [{ pigment, amount }], residual }}
 */
export function mixFor(need, pigments) {
  const subsets = [];
  for (let i = 0; i < pigments.length; i++) {
    subsets.push([i]);
    for (let j = i + 1; j < pigments.length; j++) { subsets.push([i, j]); for (let k = j + 1; k < pigments.length; k++) subsets.push([i, j, k]); }
  }
  let best = { mix: [], residual: need.reduce((a, v) => a + v * v, 0) };
  for (const sub of subsets) {
    const amounts = solveNonNegative(sub.map(i => pigments[i].K), need);
    if (!amounts) continue;
    let res = 0; for (let c = 0; c < 3; c++) res += (need[c] - sub.reduce((a, i, q) => a + amounts[q] * pigments[i].K[c], 0)) ** 2;
    const score = res * (1 + 0.15 * (sub.length - 1));
    if (score < best.residual * (best.mix.length > 1 ? 1 + 0.15 * (best.mix.length - 1) : 1) - 1e-12) best = { mix: sub.map((i, q) => ({ pigment: i, amount: amounts[q] })).filter(m => m.amount > 1e-9), residual: res };
  }
  return best;
}

// least squares for non-negative amounts a_q of the rows K_q (3 channels) against `need`; null when any amount is negative
function solveNonNegative(rows, need) {
  const m = rows.length, A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (let p = 0; p < m; p++) { for (let q = 0; q < m; q++) for (let c = 0; c < 3; c++) A[p][q] += rows[p][c] * rows[q][c]; for (let c = 0; c < 3; c++) A[p][m] += rows[p][c] * need[c]; }
  for (let i = 0; i < m; i++) {
    let piv = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-12) return null;
    [A[i], A[piv]] = [A[piv], A[i]];
    for (let r = 0; r < m; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c]; }
  }
  const a = A.map((row, i) => row[m] / row[i]);
  return a.every(v => v >= 0) ? a : null;
}

/**
 * A stroke as the points the dry deposit takes: sheet cells, a width in cells at each point (the rigger's, pressed at
 * the root and lifting to the tip), and the pressure along it. `curve` is [[x, y]] in plan cells, scaled by `scale`.
 */
export function riggerPoints(curve, { widthCells, scale = 1 }) {
  const n = curve.length;
  return curve.map(([x, y], i) => {
    const t = n > 1 ? i / (n - 1) : 0, lift = 1 - 0.55 * t, entry = Math.min(1, 0.55 + t / 0.12 * 0.45);
    return { x: x * scale, y: y * scale, nw: Math.max(0.5, widthCells * lift * entry), s: 0.35 + 0.65 * (1 - t) };
  });
}
