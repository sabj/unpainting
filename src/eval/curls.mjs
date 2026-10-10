// Curly dark fur: is a dark coat a mass of ringlets with lit tops, or one flat blob?
// Read on luminance inside the dark mass, in cells:
//
//   lit        the share of the coat's cells that are small lights standing above the dark round them: a white top-hat
//              (the picture less its opening over 2r + 1 cells) above `liftMin` of the picture's light level
//   lift       how far those lights stand above their surroundings, as a share of the light level
//   specks     separate lights per thousand cells of coat, and their median area in cells
//   arcs       the share of lit cells in lights of at least 4 cells shaped as strokes (strokeLike): the lit top of a curl
//              is an arc, a fleck of sand or a highlight on wet skin is a spot
//   texture    the mean luminance gradient per cell inside the coat (three cells in from its outline), over the light
//              level: a flat wash reads near zero
//   curvature  the median curvature of the coat's level lines where the gradient is real, in 1/cells: ringlets of
//              radius 3 cells read about 0.3, straight flicks and hard edges under 0.1
//   coherence  structure tensor coherence weighted by gradient energy: 1 is one direction; meaningful only where texture is high
//   rough      the outline's length against the same outline smoothed over `smooth` cells: a blob about 1.0 to 1.1
//   fringe     the area between the outline and the smoothed outline per cell of smoothed outline: the mean depth, in
//              cells, of the hooks and bays along the edge
//   spacing    twice the median distance from a dark cell of the coat to the nearest light: how wide the dark runs
//              between lights, in cells
//   value      the coat's median luminance over the light level
// Callers pass luminance (0..255) and the blur.

import { components, fillHoles, erode, dilate, distanceToOne, minFilter, maxFilter } from '../raster.js';

const quantileOf = (vals, q) => { if (!vals.length) return NaN; const s = Float32Array.from(vals).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

/** Cells where a 0/1 mask changes against its 4-neighbours, the picture's border counting as outside. */
export function perimeter(M, w, h) {
  let p = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!M[i]) continue;
    if (x === 0 || !M[i - 1]) p++;
    if (x === w - 1 || !M[i + 1]) p++;
    if (y === 0 || !M[i - w]) p++;
    if (y === h - 1 || !M[i + w]) p++;
  }
  return p;
}

/**
 * The largest dark region, small holes filled, plus the raw dark cells touching it.
 * @param dark   dark is below this share of the light level (the 90th percentile of luminance, unless `light` is given)
 * @param V      optional HSV value per cell, read for darkness instead of luminance so saturated colours are not taken as dark
 * @returns {{mass: Uint8Array, outline: Uint8Array, light: number, threshold: number, area: number}}
 *   mass is filled and closed; outline is the same region without the closing, so its hooks and bays are kept
 */
export function darkMass(L, w, h, blur, { dark = 0.35, light = null, closeR = 1, holeShare = 0.02, V = null } = {}) {
  const n = w * h, F = V ?? L, lightLevel = light ?? quantileOf(F, 0.9), t = dark * lightLevel;
  const Ls = blur(F, w, h, 0.7), raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = Ls[i] < t ? 1 : 0;
  const closed = closeR > 0 ? erode(dilate(raw, w, h, closeR), w, h, closeR) : raw;
  const { labels, areas, count } = components(closed, w, h);
  let best = 0; for (let id = 1; id <= count; id++) if (areas[id] > (areas[best] ?? 0)) best = id;
  const empty = { mass: new Uint8Array(n), outline: new Uint8Array(n), light: lightLevel, threshold: t, area: 0 };
  if (!best) return empty;
  const main = Uint8Array.from(labels, v => (v === best ? 1 : 0));
  const holes = Math.max(20, holeShare * areas[best]);
  const mass = fillHoles(main, w, h, holes);
  // the outline keeps what the closing bridged: raw dark cells of the main region, and its holes filled the same way
  const outline = fillHoles(Uint8Array.from(raw, (v, i) => (v && main[i] ? 1 : 0)), w, h, holes);
  let area = 0; for (let i = 0; i < n; i++) area += mass[i];
  return { mass, outline, light: lightLevel, threshold: t, area };
}

// the second moments of a set of cells, each cell counted with its own extent so one row is not infinitely thin
const moments = (cells, w) => {
  const k = cells.length;
  let mx = 0, my = 0; for (const i of cells) { mx += i % w; my += (i / w) | 0; } mx /= k; my /= k;
  let sxx = 0, syy = 0, sxy = 0;
  for (const i of cells) { const dx = (i % w) - mx, dy = ((i / w) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= k; syy /= k; sxy /= k;
  const tr = sxx + syy, d = Math.sqrt(Math.max(0, (sxx - syy) ** 2 + 4 * sxy * sxy));
  return { l1: (tr + d) / 2 + 1 / 12, l2: Math.max(1 / 12, (tr - d) / 2 + 1 / 12) };
};

/** Long axis over short axis of a set of cells, from their second moments. */
export function elongation(cells, w) {
  if (cells.length < 2) return 1;
  const { l1, l2 } = moments(cells, w);
  return Math.sqrt(l1 / l2);
}

/**
 * Whether a light is a stroke (line or arc) rather than a spot: long against its width, or filling little of its
 * moment ellipse (area 4 pi sqrt(l1 l2)). A blurred half ring fills about 0.76, a disc 0.95 to 1.
 */
export function strokeLike(cells, w, { long = 2.5, fill = 0.85 } = {}) {
  if (cells.length < 2) return false;
  const { l1, l2 } = moments(cells, w);
  return Math.sqrt(l1 / l2) > long || cells.length / (4 * Math.PI * Math.sqrt(l1 * l2)) < fill;
}

/** The measure. Pass `mass` (0/1 field) to use a region chosen elsewhere; otherwise darkMass finds it. */
export function curlyFur(L, w, h, blur, { mass: given = null, outline: givenOutline = null, light = null, dark = 0.35, r = 2, liftMin = 0.08, smooth = 2.5, gradMin = 0.02, V = null } = {}) {
  const n = w * h;
  const found = given ? null : darkMass(L, w, h, blur, { dark, light, V });
  const lightLevel = light ?? quantileOf(L, 0.9);
  const mass = given ?? found.mass, outline = givenOutline ?? found?.outline ?? mass;
  let area = 0; for (let i = 0; i < n; i++) area += mass[i];
  if (area < 20) return { area, lit: 0, lift: 0, specks: 0, speckArea: 0, arcs: 0, texture: 0, curvature: 0, coherence: 0, rough: 1, fringe: 0, spacing: NaN, value: NaN };
  const inner = erode(mass, w, h, 1);
  let innerArea = 0; for (let i = 0; i < n; i++) innerArea += inner[i];

  // the lights: what the opening takes off, where the opening is over 2r + 1 cells
  const Ls = blur(L, w, h, 0.7);
  const opened = maxFilter(minFilter(Ls, w, h, r), w, h, r);
  const lit = new Uint8Array(n); let litCount = 0, liftSum = 0;
  for (let i = 0; i < n; i++) if (inner[i]) { const th = Ls[i] - opened[i]; if (th > liftMin * lightLevel) { lit[i] = 1; litCount++; liftSum += th; } }
  const { labels, areas, count } = components(lit, w, h);
  const cellsOf = Array.from({ length: count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (labels[i]) cellsOf[labels[i]].push(i);
  let arcCells = 0; const speckAreas = [];
  for (let id = 1; id <= count; id++) { speckAreas.push(areas[id]); if (areas[id] >= 4 && strokeLike(cellsOf[id], w)) arcCells += areas[id]; }
  const dist = distanceToOne(lit, w, h), dists = [];
  if (litCount) for (let i = 0; i < n; i++) if (inner[i] && !lit[i]) dists.push(dist[i]);

  // read on a slightly blurred picture so paper tooth is not curl, and three cells in so the silhouette edge is not texture
  const deep = erode(mass, w, h, 3);
  const B = blur(L, w, h, 1.2), gx = new Float32Array(n), gy = new Float32Array(n), g = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = (B[i + 1] - B[i - 1]) / 2; gy[i] = (B[i + w] - B[i - w]) / 2; g[i] = Math.hypot(gx[i], gy[i]); }
  let gsum = 0, deepArea = 0; const kappas = [];
  const floor = gradMin * lightLevel;
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x; if (!deep[i]) continue;
    gsum += g[i]; deepArea++;
    if (g[i] < floor) continue;
    const Lx = gx[i], Ly = gy[i];
    const Lxx = B[i + 1] - 2 * B[i] + B[i - 1], Lyy = B[i + w] - 2 * B[i] + B[i - w], Lxy = (B[i + w + 1] - B[i + w - 1] - B[i - w + 1] + B[i - w - 1]) / 4;
    kappas.push(Math.abs(Lxx * Ly * Ly - 2 * Lxy * Lx * Ly + Lyy * Lx * Lx) / Math.pow(Lx * Lx + Ly * Ly, 1.5));
  }
  const Jxx = blur(Float32Array.from(gx, v => v * v), w, h, 2), Jyy = blur(Float32Array.from(gy, v => v * v), w, h, 2), Jxy = blur(Float32Array.from(gx, (v, i) => v * gy[i]), w, h, 2);
  let cohNum = 0, cohDen = 0;
  for (let i = 0; i < n; i++) if (deep[i]) { cohNum += Math.sqrt((Jxx[i] - Jyy[i]) ** 2 + 4 * Jxy[i] ** 2); cohDen += Jxx[i] + Jyy[i]; }

  // the outline against itself smoothed
  const soft = blur(Float32Array.from(mass), w, h, smooth), Sm = Uint8Array.from(soft, v => (v > 0.5 ? 1 : 0));
  const pSm = Math.max(1, perimeter(Sm, w, h));
  let apart = 0; for (let i = 0; i < n; i++) if (outline[i] !== Sm[i]) apart++;
  const values = []; for (let i = 0; i < n; i++) if (mass[i]) values.push(Ls[i]);

  return {
    area,
    lit: innerArea ? litCount / innerArea : 0,
    lift: litCount ? liftSum / litCount / lightLevel : 0,
    specks: innerArea ? (1000 * count) / innerArea : 0,
    speckArea: speckAreas.length ? quantileOf(speckAreas, 0.5) : 0,
    arcs: litCount ? arcCells / litCount : 0,
    texture: deepArea ? gsum / deepArea / lightLevel : 0,
    curvature: kappas.length ? quantileOf(kappas, 0.5) : 0,
    coherence: cohDen > 1e-9 ? cohNum / cohDen : 0,
    rough: perimeter(outline, w, h) / pSm,
    fringe: apart / pSm,
    spacing: dists.length ? 2 * quantileOf(dists, 0.5) : NaN,
    value: quantileOf(values, 0.5) / lightLevel,
  };
}

