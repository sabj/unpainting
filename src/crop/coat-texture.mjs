// A coat's texture, planned from what the subject shows in it. Fur and hair read as fur because of thousands of fine
// strands, which a rigger cannot honestly lay one by one. A painter dry-brushes: a brush with little water, dragged along
// the way the hair lies, whose bristles and the paper's tooth break one stroke into many fine streaks. This module plans
// those strokes for a region the labels call a coat: where the subject shows thin light hair over the coat, light strokes
// (white gouache tinted to the hair's own colour); where it shows thin dark hair over a lighter passage, dark strokes (the
// coat's own paint). Direction is the structure of the strands themselves, smoothed over a millimetre or two. The number of
// strokes follows the strand share of the region: strokes are laid until the paint they leave on the tooth covers as much of
// the region as the strands do (STREAK is the share of a dry-brush stroke's footprint that takes paint). Where there are no
// strands there are no strokes. Planning only; nothing is read from the target at paint time. DOM free.
import { minFilter, maxFilter } from '../raster.js';
import { gaussian } from '../keyframes/density.mjs';
import { orientationField } from './fur.mjs';
import { lstar } from './thin-lights.mjs';

export const STREAK = 0.22;                 // the share of a dry-brush stroke's footprint that holds paint: measured on the engine's dry brush
export const LENGTH_MM = Object.freeze({ 'short-coat': 4, 'curly-coat': 5, 'long-hair': 10 });
const WIDTH_MM = Object.freeze({ 'short-coat': 1.0, 'curly-coat': 1.0, 'long-hair': 1.4 });  // a small round's dry belly
const STEP_L = 10, DARK_L = 55, GROUND_L = 25, GROUND_TOL = 12, GROUND_MM = 3, THIN_MM = 1.2, SIGMA_MM = 1.5, COLOUR_MM = 2;

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Thin lights and thin darks of a density field, as 0/1 planes: lighter, or darker, than the ring by a step the eye sees.
 * The ring must be the ground of the region, within GROUND_TOL of its mean lightness over GROUND_MM: the gaps between dense
 * light hairs are not dark hairs, and the gaps between dense dark hairs are not light ones.
 */
export function thinPlanes(D, w, h, mmPerCell) {
  const r = Math.max(1, Math.round(THIN_MM / 2 / mmPerCell)), L = Float32Array.from(D, lstar);
  const E = Float32Array.from(L, v => -v), cE = minFilter(maxFilter(E, w, h, r), w, h, r), cL = minFilter(maxFilter(L, w, h, r), w, h, r);
  const light = new Uint8Array(w * h), dark = new Uint8Array(w * h), Lm = gaussian(L, w, h, GROUND_MM / mmPerCell);
  const m = r + 1; // the filters see the sheet's edge as a wall: nothing within their reach of it
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
    const i = y * w + x;
    if (-cE[i] <= DARK_L && cE[i] - E[i] >= STEP_L && Math.abs(-cE[i] - Lm[i]) <= GROUND_TOL) light[i] = 1;
    else if (cL[i] >= GROUND_L && cL[i] - L[i] >= STEP_L && Math.abs(cL[i] - Lm[i]) <= GROUND_TOL) dark[i] = 1;
  }
  return { light, dark };
}

/**
 * @param D, rgb   the source's density and RGB bytes at the plan grid w x h
 * @param labelMap region id per cell; kinds { id: 'short-coat'|'curly-coat'|'long-hair' }
 * @returns {{ strokes, regions }} strokes [{ polarity, region, kind, points: [{x, y, r, p}] (cells), widthMm, lengthMm, rgb, od }]
 */
export function coatTexture({ D, rgb, labelMap, kinds, w, h, mmPerCell, ceiling = Infinity, seed = 1 }) {
  const planes = thinPlanes(D, w, h, mmPerCell), rnd = rng(seed), sigma = SIGMA_MM / mmPerCell;
  const strokes = [], regions = [];
  for (const [id, kind] of Object.entries(kinds)) {
    const R = new Uint8Array(w * h); let cells = 0; for (let i = 0; i < w * h; i++) if (labelMap[i] === Number(id)) { R[i] = 1; cells++; }
    if (!cells) continue;
    const widthMm = WIDTH_MM[kind], lengthMm = LENGTH_MM[kind], halfW = widthMm / 2 / mmPerCell, lenCells = lengthMm / mmPerCell;
    const record = { id: Number(id), kind, cells, areaMm2: +(cells * mmPerCell * mmPerCell).toFixed(0), widthMm, lengthMm };
    for (const polarity of ['light', 'dark']) {
      const T = Float32Array.from(planes[polarity], (v, i) => (v && R[i] ? 1 : 0));
      let px = 0; for (let i = 0; i < w * h; i++) px += T[i];
      const share = px / cells; record[`${polarity}Share`] = +share.toFixed(4);
      if (share <= 0) { record[`${polarity}Strokes`] = 0; continue; }
      const O = orientationField(T, w, h, gaussian, { sigma }), density = gaussian(T, w, h, sigma * 1.3);
      // the strand colour and density at each cell: the colours of the strand pixels, spread over a couple of millimetres
      const cs = gaussian(T, w, h, COLOUR_MM / mmPerCell), col = [0, 1, 2].map(c => gaussian(Float32Array.from(T, (v, i) => v * rgb[i * 3 + c]), w, h, COLOUR_MM / mmPerCell)), od = gaussian(Float32Array.from(T, (v, i) => v * D[i]), w, h, COLOUR_MM / mmPerCell);
      // strokes until the paint on the tooth covers as much of the region as the strands do
      const perStroke = lenCells * (2 * halfW) * STREAK, want = Math.min(Math.round(share * cells / perStroke), Math.max(0, ceiling - strokes.length));
      const pick = []; let total = 0; for (let i = 0; i < w * h; i++) if (R[i] && density[i] > 1e-4) { total += density[i]; pick.push([i, total]); }
      let made = 0, tries = 0, lengthSum = 0;
      while (made < want && tries++ < want * 6 && pick.length) {
        const u = rnd() * total; let lo = 0, hi = pick.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pick[m][1] < u) lo = m + 1; else hi = m; }
        const si = pick[lo][0], sx = (si % w) + rnd(), sy = ((si / w) | 0) + rnd();
        const target = lenCells * (0.7 + 0.6 * rnd()), walk = sign => {
          const pts = []; let x = sx, y = sy, prev = null, used = 0;
          while (used < target / 2) {
            const i = Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));
            let dx = O.dx[i], dy = O.dy[i]; if (prev && dx * prev[0] + dy * prev[1] < 0) { dx = -dx; dy = -dy; } else if (!prev && sign < 0) { dx = -dx; dy = -dy; }
            x += dx * 0.5; y += dy * 0.5; used += 0.5; prev = [dx, dy];
            const j = Math.round(y) * w + Math.round(x); if (x < 0 || y < 0 || x >= w || y >= h || !R[j]) break;
            pts.push([x, y]);
          }
          return pts;
        };
        const line = [...walk(-1).reverse(), [sx, sy], ...walk(1)];
        if (line.length * 0.5 < lenCells * 0.4) continue;
        const k = Math.round(sy) * w + Math.round(sx), c = cs[k] > 1e-6 ? col.map(F => Math.round(F[k] / cs[k])) : null;
        if (!c) continue; // no strand near enough to give a colour
        strokes.push({ polarity, region: Number(id), kind, widthMm, lengthMm: +((line.length - 1) * 0.5 * mmPerCell).toFixed(2), rgb: c, od: cs[k] > 1e-6 ? od[k] / cs[k] : 0,
          points: line.map(([x, y], q) => ({ x, y, r: halfW, p: 1 - 0.4 * (q / Math.max(1, line.length - 1)) })) });
        made++; lengthSum += (line.length - 1) * 0.5 * mmPerCell;
      }
      record[`${polarity}Strokes`] = made; record[`${polarity}LengthMm`] = +lengthSum.toFixed(0);
    }
    regions.push(record);
  }
  return { strokes, regions };
}
