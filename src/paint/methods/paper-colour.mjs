// The sheet a target was painted on, read from the target itself, and which of its cells are bare paper.
// One estimate serves the painter's sheet colour (--paperrgb auto) and the planner's reserved lights (--paperrel,
// --paperlights), so the lights are measured against the same paper the plate is painted on.
//
// Paper is read as a material, never as a subject. The lightest connected region of the picture is the sheet when it
// covers at least 1% of the cells, shows along at least 30% of the border zone (a mount or a frame line may cut the
// region off the border, so the border is matched by colour), is light (L* 75 or more) and near neutral (chroma 24 or
// under: white, cream, grey or buff). Anything else (a crop with no margin, a photograph, a dark painting) shows no
// paper and is painted on white. There is no hue test: a cool grey sheet counts as much as a warm cream one.
//
// For crops with no margin (no visible paper along the border zone): the plate is painted on white paper, but
// highlights/lights fall back to the lightest tenth of the target when that material is light (L* >= 90) and near-neutral
// (chroma <= 24). Saturated or dark washes in photographs and crops never become bare white paper.
import { components } from '../../raster.js';
import { labOf } from '../../eval/colour.mjs';

export const WHITE_SHEET = Object.freeze([252, 251, 248]);
export const PAPER_RULE = Object.freeze({
  lightCut: 6,            // luminance (0-255) below the 96th percentile that still counts as lightest
  minShare: 0.01,         // the region covers at least this share of the cells
  borderMargin: 0.04,     // the border zone is the outer share of each side
  minBorderShare: 0.30,   // the paper shows along at least this share of the border zone
  borderTol: 22,          // a border cell within this of the paper, per channel, shows the paper
  minL: 75,               // paper is light
  maxChroma: 24,          // and near neutral
  minHighlightL: 90,      // highlights on a crop without visible paper must be light
  toleranceL: 5,          // a cell this far below the paper in L* is still bare paper (one tea glaze)...
  toleranceC: 6,          // ...when it is no more than this much more chromatic than the paper (delta E > 5 is a different colour)...
  fullToleranceL: 85,     // ...at the full L* tolerance on a sheet this light or lighter...
  noToleranceL: 72,       // ...and at none on a sheet this dark or darker (nothing in it is paper)
});
const D65 = [255, 255, 255];

/** L*a*b* of one colour against D65 white. */
export const labOfColour = rgb => labOf(rgb, 0, D65);

/**
 * The largest connected region among the lightest cells: luminance at or above the 96th percentile less lightCut.
 * Returns {rgb (mean), cells, share, touchesBorder} or null when there is none.
 */
export function lightestRegion(rgb, w, h, { lightCut = PAPER_RULE.lightCut } = {}) {
  const n = w * h;
  if (!(n > 0) || !rgb || rgb.length < 3 * n) return null;
  const lum = Float32Array.from({ length: n }, (_, i) => 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2]);
  const sorted = Float32Array.from(lum).sort(), cut = sorted[Math.floor(n * 0.96)] - lightCut;
  const c = components(Uint8Array.from(lum, v => (v >= cut ? 1 : 0)), w, h), size = new Uint32Array(c.count + 1);
  for (let i = 0; i < n; i++) if (c.labels[i]) size[c.labels[i]]++;
  let best = 0; for (let k = 1; k <= c.count; k++) if (size[k] > size[best]) best = k;
  if (!best) return null;
  const sum = [0, 0, 0]; let touchesBorder = false;
  for (let i = 0; i < n; i++) {
    if (c.labels[i] !== best) continue;
    for (let q = 0; q < 3; q++) sum[q] += rgb[3 * i + q];
    const x = i % w, y = (i / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
  }
  return { rgb: sum.map(v => v / size[best]), cells: size[best], share: size[best] / n, touchesBorder };
}

/** Share of the border zone (outer borderMargin of each side) within borderTol of `colour`, per channel. */
export function borderShare(rgb, w, h, colour, { borderMargin = PAPER_RULE.borderMargin, borderTol = PAPER_RULE.borderTol } = {}) {
  const mx = Math.max(1, Math.round(borderMargin * w)), my = Math.max(1, Math.round(borderMargin * h));
  let total = 0, match = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= mx && y >= my && x < w - mx && y < h - my) continue;
    total++;
    const i = y * w + x;
    if (Math.abs(rgb[3 * i] - colour[0]) <= borderTol && Math.abs(rgb[3 * i + 1] - colour[1]) <= borderTol && Math.abs(rgb[3 * i + 2] - colour[2]) <= borderTol) match++;
  }
  return total ? match / total : 0;
}

/**
 * Mean colour of the lightest tenth of the target cells by luminance.
 */
export function lightestTenth(rgb, w, h) {
  const n = w * h;
  if (!(n > 0) || !rgb || rgb.length < 3 * n) return [...WHITE_SHEET];
  const lum = Float32Array.from({ length: n }, (_, i) => 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2]);
  const sorted = Float32Array.from(lum).sort(), cut = sorted[Math.floor(n * 0.90)];
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (lum[i] >= cut) {
      r += rgb[3 * i]; g += rgb[3 * i + 1]; b += rgb[3 * i + 2]; count++;
    }
  }
  return count ? [r / count, g / count, b / count] : [...WHITE_SHEET];
}

/**
 * The sheet colour of a target. Returns {rgb, detected, candidate, reason}: `rgb` is the target's own paper when the
 * lightest region passes the paper rule, else WHITE_SHEET; `candidate` describes that region (rgb, share, borderShare,
 * L, chroma) or is null; `reason` says why the candidate was refused, or that it is the sheet.
 */
export function sheetColour(rgb, w, h, opts = {}) {
  const o = { ...PAPER_RULE, ...opts };
  const region = lightestRegion(rgb, w, h, o);
  if (!region) return { rgb: [...WHITE_SHEET], detected: false, candidate: null, reason: 'no cells' };
  const [L, a, b] = labOfColour(region.rgb), chroma = Math.hypot(a, b), border = borderShare(rgb, w, h, region.rgb, o);
  const candidate = { rgb: region.rgb.map(v => Math.round(v)), share: region.share, borderShare: border, L, chroma, touchesBorder: region.touchesBorder };
  const pct = v => `${(100 * v).toFixed(1)}%`, reasons = [];
  if (region.share < o.minShare) reasons.push(`covers ${pct(region.share)} of the sheet, under ${pct(o.minShare)}`);
  if (border < o.minBorderShare) reasons.push(`shows along ${pct(border)} of the border, under ${pct(o.minBorderShare)}`);
  if (L < o.minL) reasons.push(`L* ${L.toFixed(1)} is under ${o.minL}`);
  if (chroma > o.maxChroma) reasons.push(`chroma ${chroma.toFixed(1)} is over ${o.maxChroma}`);
  const detected = reasons.length === 0;
  return { rgb: detected ? candidate.rgb : [...WHITE_SHEET], detected, candidate, reason: detected ? "the target's own sheet" : reasons.join('; ') };
}

/**
 * The reference colours for paper and lights. Returns { sheet, lightRef, detected, fallback, reason }.
 * - When the target shows a visible sheet (pass across border and area), both sheet and lights follow that sheet.
 * - When no sheet shows (a crop painted edge-to-edge), the plate is painted on white paper (WHITE_SHEET), while
 *   reserved lights fall back to the lightest tenth of the target when that material is light (L* >= 90) and near-neutral
 *   (chroma <= 24); otherwise lights require true near-white cells (WHITE_SHEET).
 */
export function paperLightReference(rgb, w, h, paperRGB = null, opts = {}) {
  const o = { ...PAPER_RULE, ...opts };
  const sheet = sheetColour(rgb, w, h, o);
  if (paperRGB) {
    const rgbArr = paperRGB.map(Number);
    if (sheet.detected) {
      return { sheet: rgbArr, lightRef: rgbArr, detected: true, fallback: false, reason: 'relative to declared sheet' };
    }
    if (rgbArr.every((v, j) => v === WHITE_SHEET[j])) {
      const lt = lightestTenth(rgb, w, h);
      const [L, a, b] = labOfColour(lt), chroma = Math.hypot(a, b);
      const minHighlightL = o.minHighlightL ?? 90;
      if (L >= minHighlightL && chroma <= o.maxChroma) {
        const ref = lt.map(v => Math.round(v));
        return {
          sheet: rgbArr,
          lightRef: ref,
          detected: false,
          fallback: true,
          reason: `no visible paper; lights against lightest tenth (${ref.join('/')}, L* ${L.toFixed(1)}, chroma ${chroma.toFixed(1)})`
        };
      }
    }
    return { sheet: rgbArr, lightRef: rgbArr, detected: false, fallback: false, reason: sheet.reason };
  }
  if (sheet.detected) {
    return { sheet: sheet.rgb, lightRef: sheet.rgb, detected: true, fallback: false, reason: sheet.reason };
  }
  const lt = lightestTenth(rgb, w, h);
  const [L, a, b] = labOfColour(lt), chroma = Math.hypot(a, b);
  const minHighlightL = o.minHighlightL ?? 90;
  if (L >= minHighlightL && chroma <= o.maxChroma) {
    const ref = lt.map(v => Math.round(v));
    return {
      sheet: [...WHITE_SHEET],
      lightRef: ref,
      detected: false,
      fallback: true,
      reason: `no visible paper; lights against lightest tenth (${ref.join('/')}, L* ${L.toFixed(1)}, chroma ${chroma.toFixed(1)})`
    };
  }
  return {
    sheet: [...WHITE_SHEET],
    lightRef: [...WHITE_SHEET],
    detected: false,
    fallback: false,
    reason: `no visible paper; lightest tenth is not neutral/light (L* ${L.toFixed(1)}, chroma ${chroma.toFixed(1)}); lights against white`
  };
}

/**
 * How far a cell may fall from the paper and still be bare paper: {L, C}. L* tolerance is the full toleranceL on a
 * sheet at fullToleranceL or lighter, falling to nothing at noToleranceL (a sheet that dark is no paper at all); the
 * chroma tolerance does not change.
 */
export function lightTolerance(paperRGB, { toleranceL = PAPER_RULE.toleranceL, toleranceC = PAPER_RULE.toleranceC, fullToleranceL = PAPER_RULE.fullToleranceL, noToleranceL = PAPER_RULE.noToleranceL } = {}) {
  const [L] = labOfColour(paperRGB);
  const t = Math.max(0, Math.min(1, (L - noToleranceL) / (fullToleranceL - noToleranceL)));
  return { L: toleranceL * t, C: toleranceC };
}

/**
 * A test (rgb, i) => bool for bare paper against `paper`: the cell's L* is no more than tol.L below the paper's and its
 * chroma no more than tol.C above it (lighter than the paper always is paper).
 */
export function paperLightTest(paper, tol = lightTolerance(paper)) {
  const [pL, pa, pb] = labOfColour(paper), pC = Math.hypot(pa, pb), minL = pL - tol.L, maxC = pC + tol.C;
  return (rgb, i) => { const [L, a, b] = labOf(rgb, i, D65); return L >= minL && Math.hypot(a, b) <= maxC; };
}

/** --paperdelta d: cell i is bare paper when no channel is more than d below the paper (a plan's own tolerance). */
export const isPaperLight = (rgb, i, paper, d) => rgb[3 * i] >= paper[0] - d && rgb[3 * i + 1] >= paper[1] - d && rgb[3 * i + 2] >= paper[2] - d;
