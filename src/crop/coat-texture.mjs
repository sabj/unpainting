// A coat's texture, planned from what the subject shows in it, at the scale the brush can lay it. A painter dry-brushes
// fur: a brush with little water dragged along the way the hair lies, whose bristles and the paper's tooth break one stroke
// into streaks. This module plans those strokes for a region the labels call a coat: where the subject shows thin light hair
// over the coat, light strokes (white gouache tinted to the hair's own colour); where it shows thin dark hair over a lighter
// passage, dark strokes (the coat's own paint).
//
// Scale comes first. A strand is as wide as the subject's own ridge (measured here, per pixel, from the ridge mask). The
// narrowest line the brush lays at this run's density is measured on a swatch (src/paint/methods/brush-swatch.mjs). Where
// the laid line would be more than SCALE_LIMIT times the strand, no mark is laid: a stroke wider than the hair is not that
// hair. At a density where the brush is as fine as the strand, the strands are laid; where it is not, only the strands
// that are as wide as the brush can make them are, and a coarse sheet gets few or none.
//
// Structure first: no strand mark goes within a millimetre and a half of a broad dark or light feature (an eye, a nostril, the
// mouth line, a reserved light); the washes carry those. Direction is the structure of the wide-enough strands, smoothed
// over a millimetre or two. The number of strokes is an outcome: strokes are laid until the paint a stroke leaves, as
// measured on the swatch, covers as much of the region as the strands do. Strokes vary in length, pressure and width along
// their length, and taper to the tip; seeds follow the strand density, so spacing varies as the subject's does. Planning
// only; nothing is read from the target at paint time. DOM free.
import { minFilter, maxFilter, distanceToZero } from '../raster.js';
import { gaussian } from '../keyframes/density.mjs';
import { orientationField } from './fur.mjs';
import { lstar } from './thin-lights.mjs';
import { SCALE_LIMIT } from '../paint/methods/brush-swatch.mjs';

export const LENGTH_MM = Object.freeze({ 'short-coat': 4, 'curly-coat': 5, 'long-hair': 10 });
const MIN_ASPECT_LEN = 0.4;                 // a stroke shorter than this share of its kind's length is a fleck and is not laid
const STEP_L = 10, DARK_L = 55, GROUND_L = 25, GROUND_TOL = 12, GROUND_MM = 3, THIN_MM = 1.2, SIGMA_MM = 1.5, COLOUR_MM = 2, FEATURE_L = 18, FEATURE_MM = 1.5;

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const gauss01 = rnd => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / Math.sqrt(0.5); };

/**
 * Thin lights and thin darks of a density field, as 0/1 planes: lighter, or darker, than the ring by a step the eye sees.
 * The ring must be the ground of the region, within GROUND_TOL of its mean lightness over GROUND_MM: the gaps between dense
 * light hairs are not dark hairs, and the gaps between dense dark hairs are not light ones.
 */
export function thinPlanes(D, w, h, mmPerCell) {
  const r = Math.max(1, Math.round(THIN_MM / 2 / mmPerCell)), L = Float32Array.from(D, lstar);
  const E = Float32Array.from(L, v => -v), cE = minFilter(maxFilter(E, w, h, r), w, h, r), cL = minFilter(maxFilter(L, w, h, r), w, h, r);
  const light = new Uint8Array(w * h), dark = new Uint8Array(w * h), Lm = gaussian(L, w, h, GROUND_MM / mmPerCell), m = r + 1; // the filters see the sheet's edge as a wall
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
    const i = y * w + x;
    if (-cE[i] <= DARK_L && cE[i] - E[i] >= STEP_L && Math.abs(-cE[i] - Lm[i]) <= GROUND_TOL) light[i] = 1;
    else if (cL[i] >= GROUND_L && cL[i] - L[i] >= STEP_L && Math.abs(cL[i] - Lm[i]) <= GROUND_TOL) dark[i] = 1;
  }
  return { light, dark, L };
}

/** Each plane pixel's strand width in mm: twice the distance to the ridge's edge, taken at the ridge's centre line nearby. */
export function strandWidths(plane, w, h, mmPerCell) {
  const dt = distanceToZero(plane, w, h), near = maxFilter(dt, w, h, 1), out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (plane[i]) out[i] = Math.max(1, 2 * near[i] - 1) * mmPerCell;
  return out;
}

/** The cells near a broad dark or light feature (an eye, a nostril, a mouth line, a reserved light): the washes carry these. */
export function structureMask(L, w, h, mmPerCell) {
  const fine = gaussian(L, w, h, 0.8 / mmPerCell), wide = gaussian(L, w, h, 5 / mmPerCell), feat = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (Math.abs(fine[i] - wide[i]) >= FEATURE_L) feat[i] = 1;
  const r = Math.max(1, Math.round(FEATURE_MM / mmPerCell)), grown = maxFilter(Float32Array.from(feat), w, h, r);
  return Uint8Array.from(grown, v => (v > 0 ? 1 : 0));
}

/**
 * @param fine     { D, rgb, labelMap, w, h, mmPerCell }: the planning data on its own grid (the source's, or the plan's if finer)
 * @param plan     { w, h, mmPerCell }: the sheet's plan grid, which the strokes are returned on
 * @param kinds    { regionId: 'short-coat'|'curly-coat'|'long-hair' }
 * @param brush    the swatch (src/paint/methods/brush-swatch.mjs measureDryBrush) at the plan's density
 * @returns {{ strokes, regions }} strokes [{ polarity, region, kind, points: [{x, y, r, p}] (plan cells), widthMm, strandMm, lengthMm, rgb, od }]
 */
export function coatTexture({ fine, plan, kinds, brush, ceiling = Infinity, seed = 1 }) {
  const { D, rgb, labelMap, w, h, mmPerCell: mm } = fine, scale = plan.w / w, rnd = rng(seed);
  const planes = thinPlanes(D, w, h, mm), features = structureMask(planes.L, w, h, mm), sigma = SIGMA_MM / mm;
  const narrow = brush?.narrowest ?? null, laidMm = narrow?.widthMm ?? Infinity;
  const strokes = [], regions = [];
  for (const [id, kind] of Object.entries(kinds)) {
    const R = new Uint8Array(w * h); let cells = 0; for (let i = 0; i < w * h; i++) if (labelMap[i] === Number(id)) { R[i] = 1; cells++; }
    if (!cells) continue;
    const record = { id: Number(id), kind, cells, areaMm2: +(cells * mm * mm).toFixed(0), laidLineMm: Number.isFinite(laidMm) ? laidMm : null, scaleLimit: SCALE_LIMIT };
    const lengthMm = LENGTH_MM[kind], lenCells = lengthMm / mm;
    for (const polarity of ['light', 'dark']) {
      const plane = Uint8Array.from(planes[polarity], (v, i) => (v && R[i] ? 1 : 0));
      const widths = strandWidths(plane, w, h, mm), ws = []; for (let i = 0; i < w * h; i++) if (plane[i]) ws.push(widths[i]);
      record[`${polarity}StrandMm`] = ws.length ? +median(ws).toFixed(3) : null; record[`${polarity}StrandP90Mm`] = ws.length ? +[...ws].sort((a, b) => a - b)[Math.floor(0.9 * (ws.length - 1))].toFixed(3) : null;
      // the scale rule: a strand narrower than the line the brush lays, over SCALE_LIMIT, is not laid
      const need = laidMm / SCALE_LIMIT, T = new Float32Array(w * h); let px = 0;
      for (let i = 0; i < w * h; i++) if (plane[i] && widths[i] >= need && !features[i]) { T[i] = 1; px++; }
      record[`${polarity}StrandPx`] = ws.length; record[`${polarity}WideEnoughPx`] = px;
      record[`${polarity}Rule`] = !narrow ? 'no stable line measured: nothing laid' : !ws.length ? 'no strands' : px === 0 ? `every strand is under ${need.toFixed(2)} mm: the brush's ${laidMm} mm line is over ${SCALE_LIMIT} times it` : `strands of ${need.toFixed(2)} mm and wider are laid (${(100 * px / ws.length).toFixed(0)}% of them)`;
      if (!px) { record[`${polarity}Strokes`] = 0; continue; }
      const widthsLaid = []; for (let i = 0; i < w * h; i++) if (T[i]) widthsLaid.push(widths[i]);
      const O = orientationField(T, w, h, gaussian, { sigma }), density = gaussian(T, w, h, sigma * 1.3);
      const cs = gaussian(T, w, h, COLOUR_MM / mm), wmap = gaussian(Float32Array.from(T, (v, i) => v * widths[i]), w, h, COLOUR_MM / mm), col = [0, 1, 2].map(c => gaussian(Float32Array.from(T, (v, i) => v * rgb[i * 3 + c]), w, h, COLOUR_MM / mm)), od = gaussian(Float32Array.from(T, (v, i) => v * D[i]), w, h, COLOUR_MM / mm);
      // strokes until the paint they leave, as measured on the swatch, covers as much of the region as the strands do
      const areaPerMm = narrow.areaPerCell * plan.mmPerCell, strandArea = px * mm * mm, perStroke = lengthMm * areaPerMm, widthMm = Math.max(laidMm, median(widthsLaid));
      const want = Math.min(Math.round(strandArea / perStroke), Math.max(0, ceiling - strokes.length));
      const pick = []; let total = 0; for (let i = 0; i < w * h; i++) if (R[i] && !features[i] && density[i] > 1e-4) { total += density[i]; pick.push([i, total]); }
      let made = 0, tries = 0, lengthSum = 0;
      const rCells = Math.max(1, widthMm / 2 / plan.mmPerCell);
      while (made < want && tries++ < want * 6 && pick.length) {
        const u = rnd() * total; let lo = 0, hi = pick.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pick[m][1] < u) lo = m + 1; else hi = m; }
        const si = pick[lo][0], sx = (si % w) + rnd(), sy = ((si / w) | 0) + rnd();
        // length varies as strand lengths do; the share of it either side of the seed varies too
        const target = Math.min(2.2, Math.max(0.5, Math.exp(0.35 * gauss01(rnd)))) * lenCells, split = 0.3 + 0.4 * rnd();
        const walk = (sign, budget) => {
          const pts = []; let x = sx, y = sy, prev = null, used = 0;
          while (used < budget) {
            const i = Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));
            let dx = O.dx[i], dy = O.dy[i]; if (prev && dx * prev[0] + dy * prev[1] < 0) { dx = -dx; dy = -dy; } else if (!prev && sign < 0) { dx = -dx; dy = -dy; }
            x += dx * 0.5; y += dy * 0.5; used += 0.5; prev = [dx, dy];
            const j = Math.round(y) * w + Math.round(x); if (x < 0 || y < 0 || x >= w || y >= h || !R[j] || features[j]) break;
            pts.push([x, y]);
          }
          return pts;
        };
        const line = [...walk(-1, target * split).reverse(), [sx, sy], ...walk(1, target * (1 - split))];
        const len = (line.length - 1) * 0.5 * mm;
        if (len < MIN_ASPECT_LEN * lengthMm) continue;
        const k = Math.round(sy) * w + Math.round(sx), c = cs[k] > 1e-6 ? col.map(F => Math.round(F[k] / cs[k])) : null;
        if (!c) continue; // no strand near enough to give a colour
        const p0 = 0.7 + 0.3 * rnd(), n1 = line.length - 1;
        strokes.push({ polarity, region: Number(id), kind, widthMm: +widthMm.toFixed(3), strandMm: +(wmap[k] / cs[k]).toFixed(3), lengthMm: +len.toFixed(2), rgb: c, od: od[k] / cs[k],
          // pressed at the root, lifting to a fine tip: the width and the pressure fall along the stroke
          points: line.map(([x, y], q) => { const t = n1 ? q / n1 : 0; return { x: x * scale, y: y * scale, r: rCells * (1 - 0.45 * t ** 1.5), p: p0 * (1 - 0.55 * t ** 1.2) }; }) });
        made++; lengthSum += len;
      }
      record[`${polarity}Strokes`] = made; record[`${polarity}LengthMm`] = +lengthSum.toFixed(0); record[`${polarity}WantedStrokes`] = want;
    }
    regions.push(record);
  }
  return { strokes, regions };
}
