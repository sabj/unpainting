// Thin lights a wash cannot reserve: a hair, a whisker, a strand of rigging, a lane line, the glint in an eye or on a
// nose. The wash planner goes round lights down to about a rigger touch (TOUCH_MM). Anything thinner is laid last, in
// opaque white tinted to its own colour, with the rigger (src/media/gouache.mjs). This module finds those lights in the
// planning data (the source's optical density, read once before painting) and returns each as a smooth, whole stroke.
//
// A ridge qualifies by the step, not by how white it is: it is narrower than a rigger touch, clearly lighter than its
// own ring in L* (STEP_L, a visible step), over a dark surround (DARK_L), and long for its width. A grey hair on a
// near-black coat is as good a light as a white one; the paint is tinted to the strand's own colour. Where many such
// ridges run the same way inside one dark region they are a coat, and src/crop/strand-field.mjs lays that passage
// from a direction field; the ridges outside a passage are single lights (whiskers, rigging, lane lines) and each is
// fitted with one cubic. A dot qualifies only as a true glint: a few tenths of a millimetre across, near paper white,
// ringed by a smooth dark. Constants are painter's limits in millimetres and L*, the same for every subject. DOM free.
import { components, thin, minFilter, maxFilter, distanceToOne } from '../raster.js';
import { walkChains, simplify, splitAtTurns, joinPieces } from './pen-trace.mjs';
import { densify, plen, smoothStrokes, turnSigns } from './curve-fit.mjs';
import { strandFields } from './strand-field.mjs';

export const TOUCH_MM = 1.2;            // the narrowest light the wash planner can go round (a rigger touch)
export const RIGGER_MM = Object.freeze({ min: 0.25, max: 1.0 });   // a rigger's line, point to belly
const STEP_L = 10;                      // lighter than its ring by at least this much L*: a step the eye sees
const DARK_L = 55;                      // the ring is at most this light (L*): over dark, never in a light area
const MIN_LENGTH_MM = 4;                // a single stroke shorter than this is a fragment, not a hair
const RIDGE_MM = 1.5;                   // ridges shorter than this are not read into a direction field
const ASPECT = 8;                       // length over width
const FIT_MM = 0.3;                     // the most a single stroke may leave its ridge
const MAX_TURNS_PER_CM = 0.75;          // curvature sign changes per cm of a laid stroke
const CHAINS_MAX = 8000, SINGLES_MAX_CHAINS = 1500;
const GLINT = Object.freeze({ maxMm: 1.8, lightOd: 0.2, stepOd: 0.5, darkOd: 0.7, smoothSd: 0.2, aroundMm: 2.5 });

/** L* of a density (0 at paper): the lightness the eye reads, 0 black to 100 paper. */
export const lstar = d => { const y = Math.exp(-Math.max(0, d)); return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y; };

// the lightness at each side of a stroke, a little beyond its own width, as the medians along it: the darker side and the
// lighter one. A hair has a dark ring; the notches along the edge of a broad light have the light on one side, and
// there the lighter side is as light as the stroke itself.
function sideLight(curve, L, w, h, offsetPx) {
  const at = (x, y) => L[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const dark = [], light = [];
  for (let i = 1; i < curve.length - 1; i++) {
    const tx = curve[i + 1][0] - curve[i - 1][0], ty = curve[i + 1][1] - curve[i - 1][1], m = Math.hypot(tx, ty) || 1, nx = -ty / m, ny = tx / m;
    const side = k => Math.min(at(curve[i][0] + k * nx * offsetPx, curve[i][1] + k * ny * offsetPx), at(curve[i][0] + k * nx * (offsetPx + 1), curve[i][1] + k * ny * (offsetPx + 1)));
    const a = side(1), b = side(-1);
    dark.push(Math.min(a, b)); light.push(Math.max(a, b));
  }
  const med = v => { v.sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 100; };
  return { dark: med(dark), light: med(light) };
}

const median = a => { const v = [...a].sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; };

// glints: compact, near paper white, ringed by dark on every side and set in a smooth dark (an eye, a nose, a pane), not
// among many lights (fur, hair)
function findGlints(D, w, h, pixelMm) {
  const n = w * h, r = Math.max(1, Math.round(TOUCH_MM / 2 / pixelMm)), closed = minFilter(maxFilter(D, w, h, r), w, h, r), margin = r + 1, mask = new Uint8Array(n);
  for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) { const i = y * w + x; if (closed[i] >= GLINT.darkOd && closed[i] - D[i] >= GLINT.stepOd && D[i] <= GLINT.lightOd) mask[i] = 1; }
  const { labels, areas, count } = components(mask, w, h, 8);
  const comp = Array.from({ length: count + 1 }, () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, minD: Infinity, sx: 0, sy: 0 }));
  for (let i = 0; i < n; i++) { const l = labels[i]; if (!l) continue; const c = comp[l], x = i % w, y = (i - x) / w; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; if (D[i] < c.minD) c.minD = D[i]; c.sx += x; c.sy += y; }
  const glints = [];
  for (let l = 1; l <= count; l++) {
    const c = comp[l], ext = Math.max(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1) * pixelMm;
    if (ext > GLINT.maxMm) continue;
    const cx = c.sx / areas[l] + 0.5, cy = c.sy / areas[l] + 0.5, ci = Math.min(h - 1, Math.floor(cy)) * w + Math.min(w - 1, Math.floor(cx)), contrast = closed[ci] - c.minD;
    if (contrast < GLINT.stepOd) continue;
    const ring = ext / 2 / pixelMm + 2;
    let ringed = true;
    for (let k = 0; k < 8 && ringed; k++) {
      const a = k * Math.PI / 4, at = q => D[Math.min(h - 1, Math.max(0, Math.round(cy + Math.sin(a) * q))) * w + Math.min(w - 1, Math.max(0, Math.round(cx + Math.cos(a) * q)))];
      if (Math.max(at(ring), at(ring + 1)) < GLINT.darkOd) ringed = false;
    }
    if (!ringed) continue;
    const rOut = Math.max(ring + 2, GLINT.aroundMm / pixelMm);
    let sum = 0, sum2 = 0, cnt = 0;
    for (let dy = -Math.ceil(rOut); dy <= Math.ceil(rOut); dy++) for (let dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
      const d = Math.hypot(dx, dy); if (d < ring || d > rOut) continue;
      const xx = Math.round(cx + dx), yy = Math.round(cy + dy); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const v = D[yy * w + xx]; sum += v; sum2 += v * v; cnt++;
    }
    const mean = cnt ? sum / cnt : 0, sd = cnt ? Math.sqrt(Math.max(0, sum2 / cnt - mean * mean)) : 1;
    if (mean < GLINT.darkOd || sd > GLINT.smoothSd) continue;
    const half = Math.max(ext, RIGGER_MM.min) / 2 / pixelMm;
    glints.push({ kind: 'glint', points: [[cx - half * 0.5, cy], [cx + half * 0.5, cy]], widthMm: Math.min(RIGGER_MM.max, Math.max(RIGGER_MM.min, ext)), lengthMm: Math.max(ext, RIGGER_MM.min), lightOd: c.minD, surroundOd: closed[ci], rgb: null, fit: { maxMm: 0, meanMm: 0, turnsPerCm: 0 }, score: contrast });
  }
  return glints;
}

/**
 * The thin lights in a density field.
 * @param D        optical density per pixel (0 at paper), w * h
 * @param pixelMm  millimetres of the sheet one pixel spans
 * @param rgb      optional RGB bytes, 3 * w * h: the light's own colour is read from it along each stroke
 * @param strokesMax  the most single strokes; glintsMax the most glints; fieldCeiling the most field strokes
 * @returns {{ strokes, fields, stats }} strokes: [{ kind: 'strand'|'glint', field?, points: [[x, y]] (pixels), widthMm,
 *   lengthMm, lightOd, surroundOd, rgb|null, fit: { maxMm, meanMm, turnsPerCm } }], best singles first; fields: the
 *   passages laid from a direction field, for the run card
 */
export function thinLights(D, w, h, { pixelMm, rgb = null, strokesMax = Infinity, glintsMax = Infinity, fieldCeiling = Infinity } = {}) {
  if (!(pixelMm > 0)) throw new Error('thin lights: the millimetres of one pixel');
  const n = w * h, r = Math.max(1, Math.round(TOUCH_MM / 2 / pixelMm));
  const L = Float32Array.from(D, lstar);
  // closing of darkness = opening of lightness: what a thin light is lighter than, and what its ring is
  const E = Float32Array.from(L, v => -v), closedE = minFilter(maxFilter(E, w, h, r), w, h, r);
  const margin = r + 1, mask = new Uint8Array(n);
  for (let y = margin; y < h - margin; y++) for (let x = margin; x < w - margin; x++) { const i = y * w + x; if (-closedE[i] <= DARK_L && closedE[i] - E[i] >= STEP_L) mask[i] = 1; }
  const { labels, areas, count } = components(mask, w, h, 8);
  const skeleton = thin(mask, w, h), skelCount = new Int32Array(count + 1);
  for (let i = 0; i < n; i++) if (skeleton[i] && labels[i]) skelCount[labels[i]]++;
  const ridgeDist = distanceToOne(skeleton, w, h);
  const colourOf = pts => {
    if (!rgb) return null;
    const px = pts.map(([x, y]) => { const i = Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x))); return [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]]; });
    px.sort((a, b) => b[3] - a[3]);
    const top = px.slice(0, Math.max(1, Math.ceil(px.length / 2)));
    return [0, 1, 2].map(c => Math.round(top.reduce((s, p) => s + p[c], 0) / top.length));
  };
  const along = (pts, F) => median(pts.map(([x, y]) => F[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))]));
  const labelAt = ([x, y]) => labels[Math.min(h - 1, Math.floor(y)) * w + Math.min(w - 1, Math.floor(x))];
  const widthOf = P => { const l = labelAt(P[P.length >> 1]) || labelAt(P[0]); return l && skelCount[l] ? areas[l] / skelCount[l] * pixelMm : Infinity; };

  // chains of the skeleton that could belong to a hair: a millimetre long, no wider than a rigger touch, a step lighter than
  // a dark ring on both sides
  const offset = Math.ceil(RIGGER_MM.min / 2 / pixelMm) + 2;
  const chains = [], drop = { raw: 0, short: 0, wide: 0, sides: 0 };
  let maskPx = 0, skelPx = 0; for (let i = 0; i < n; i++) { maskPx += mask[i]; skelPx += skeleton[i]; }
  for (const P of walkChains(skeleton, w, h).map(ch => simplify(ch.map(i => [i % w + 0.5, ((i / w) | 0) + 0.5]), 1)).filter(P => P.length >= 2 && plen(P) * pixelMm >= 1).flatMap(splitAtTurns)) {
    drop.raw++;
    if (P.length < 2 || plen(P) * pixelMm < 1) { drop.short++; continue; }
    if (widthOf(P) > TOUCH_MM) { drop.wide++; continue; }
    const dense = densify(P); if (dense.length < 3) { drop.short++; continue; }
    const side = sideLight(dense, L, w, h, offset), sideL = side.dark, lightL = along(dense, L);
    if (sideL > DARK_L || lightL - sideL < STEP_L || lightL - side.light < STEP_L / 2) { drop.sides++; continue; }
    chains.push({ pts: dense, raw: P, widthMm: Math.min(RIGGER_MM.max, Math.max(RIGGER_MM.min, widthOf(P))), rgb: colourOf(dense), lightOd: along(dense, D), lightL, sideL, score: (lightL - sideL) * dense.length });
  }
  chains.sort((a, b) => b.score - a.score); chains.length = Math.min(chains.length, CHAINS_MAX);

  // a coat: many ridges one way inside one dark region, laid from the field (src/crop/strand-field.mjs)
  const field = strandFields(chains.filter(c => c.pts.length * pixelMm >= RIDGE_MM), { w, h, pixelMm, ceiling: fieldCeiling });
  const outside = chains.filter(c => !field.inside(...c.pts[c.pts.length >> 1])).slice(0, SINGLES_MAX_CHAINS);

  // single lights: the chains outside any coat, joined where one carries on another, each fitted with one cubic
  const singles = [], tolPx = FIT_MM / pixelMm, minLen = MIN_LENGTH_MM / pixelMm;
  for (const P of joinPieces(outside.map(c => c.raw), { gap: TOUCH_MM / pixelMm })) {
    if (plen(P) < minLen) continue;
    const widthMm = widthOf(P);
    if (widthMm > TOUCH_MM) continue;
    for (const s of smoothStrokes(densify(P), { tol: tolPx, minLen, step: 1 })) {
      const lengthMm = plen(s.curve) * pixelMm;
      let sum = 0, mx = 0;
      for (const [x, y] of s.curve) { const d = ridgeDist[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))]; sum += d; if (d > mx) mx = d; }
      s.dev = sum / s.curve.length; s.max = mx;
      if (s.max * pixelMm > FIT_MM) continue;
      const perCm = s.turns / Math.max(0.1, lengthMm / 10);
      if (lengthMm < MIN_LENGTH_MM || lengthMm / Math.max(widthMm, 0.05) < ASPECT || perCm > MAX_TURNS_PER_CM) continue;
      const lightL = along(s.curve, L), side = sideLight(s.curve, L, w, h, Math.ceil(widthMm / 2 / pixelMm) + 2), sideL = side.dark;
      if (sideL > DARK_L || lightL - sideL < STEP_L || lightL - side.light < STEP_L / 2) continue;
      singles.push({ kind: 'strand', points: s.curve, widthMm: Math.min(RIGGER_MM.max, Math.max(RIGGER_MM.min, widthMm)), lengthMm, lightOd: along(s.curve, D), surroundOd: -Math.log(Math.max(1e-3, (sideL + 16) ** 3 / 116 ** 3)), rgb: colourOf(s.curve),
        fit: { maxMm: +(s.max * pixelMm).toFixed(3), meanMm: +(s.dev * pixelMm).toFixed(3), turnsPerCm: +perCm.toFixed(3) }, score: (lightL - sideL) * lengthMm });
    }
  }
  const byScore = (a, b) => b.score - a.score;
  const keptSingles = singles.sort(byScore).slice(0, strokesMax), keptGlints = findGlints(D, w, h, pixelMm).sort(byScore).slice(0, glintsMax);
  return {
    strokes: [...keptSingles, ...field.strokes, ...keptGlints], fields: field.passages, fieldStats: field.stats,
    stats: { maskPx, skelPx, dropped: drop, ridges: chains.length, singles: keptSingles.length, fieldStrokes: field.strokes.length, passages: field.passages.length, glints: keptGlints.length, closingRadiusPx: r },
  };
}
