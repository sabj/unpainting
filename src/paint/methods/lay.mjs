// One act of laying paint: a mop charged from one well at one dilution, taken over one passage in sweeps.
// In the older standalone painter, this module lays brush paint passage by passage. Brush settings per technique
// follow chooseTechnique (src/crop/technique.mjs); which technique to use is the painter's choice.
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { createSheet, dry, step, thickness } from '../../media/sheet.mjs';
import { makePaper } from '../../media/paper.mjs';
import { brushedWashPaths, washPaths, containPaths, sweepCover, prewetArea, softArcs, soften } from '../../media/wash.mjs';
import { distanceToZero } from '../../raster.js';

/** Technique settings, chooseTechnique's numbers (technique.mjs), keyed by name. */
export const TECHNIQUES = Object.freeze({
  'wet on dry': { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true, passes: 1 },
  // a first wash: the same brush carried fuller, reaching the bottom of the tooth; a lower bridge leaves paper showing
  // as white holes. Bridge 0.9 with a transition of 3 matches paint-plate's first stain.
  'first wash': { name: 'first wash', water: 0.76, wetMix: 0.7, bridge: 0.9, bridgeSoft: 3, intoWet: false, dryAfter: true, passes: 1 },
  'wet on wet': { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 },
  glazed: { name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, dryAfter: true, passes: 2 },
  'dry brush': { name: 'dry brush', water: 0.22, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, intoWet: false, dryAfter: false, passes: 1 },
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A flat mop of radius r for a technique; under 2.5 cells a round brush, since a mop that small is a point. */
export function brushFor(r, T, seed, { grainShift = 0 } = {}) {
  if (r < 2.5) return createBrush({ grainShift, radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: T.intoWet ? 0.6 : 0.15, bridge: Math.min(T.bridge, 0.55), bridgeSoft: 1.2, streak: 0.5, seed });
  return createBrush({ grainShift, flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed });
}

/** A sweep's pressure: it lands, bears down through its body, lifts, and presses harder where the passage wants more. */
function shapeSweep(pts, want, w, h, amount, { land = 0.06, lift = 0.1, followMin = 0.35, followMax = 1.6 } = {}) {
  const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
  let run = 0;
  return pts.map((p, i) => {
    if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    const u = run / total, body = 0.72 + 0.28 * Math.sin(Math.PI * u);
    const ease = Math.min(1, u / land, (1 - u) / lift);
    let follow = 1;
    if (want && amount > 1e-4) { const sx = clamp(Math.round(p.x), 0, w - 1), sy = clamp(Math.round(p.y), 0, h - 1); follow = clamp(want[sy * w + sx] / amount, followMin, followMax); }
    return { ...p, p: clamp(body * ease * follow, 0.18, 1) };
  });
}

/** The sweeps a passage takes with a mop no wider than `maxRadius`, held inside it, and the widest brush among them.
 *  A passage too narrow for the mop gets a small brush drawn down its middle, not skipped. Callers charge by `radius`:
 *  a mop held in a narrow passage is the small brush, and charging it at the mop's yield lays about twice the paint. */
export function passagePaths(mask, w, h, { maxRadius, want = null, seed = 1, pad = 1.5 } = {}) {
  const dist = distanceToZero(mask, w, h);
  let paths = containPaths(brushedWashPaths(mask, w, h, { pad, minRadius: 1, minLength: 3, maxRadius, field: want, seed, overlap: 0.15, walk: true, outerDrift: 1.5 }), dist, w, h, { minRadius: 0.8, minLength: 2, slack: 0.5 });
  if (!paths.length) paths = washPaths(mask, w, h, { pad: 0.2, minRadius: 0.5, minLength: 2 });
  let radius = 0; for (const pts of paths) for (const p of pts) if (p.r > radius) radius = p.r;
  return { paths, radius, cover: paths.length ? sweepCover(paths, mask, w, h) : 0 };
}

/**
 * Lay `charge` (per-pigment concentration in the dip) over `mask` with technique `T`.
 * @param opts.want      a field the sweep's pressure may follow inside the passage (the residual's tone)
 * @param opts.onSweep   called after each sweep with (done, total), for frames of the brush at work
 * @returns { sweeps, dips, cover } cover is sweeps over the mean cell
 */
export function layPassage(sheet, mask, charge, { w, h, T, maxRadius, seed = 1, O, want = null, amount = 0, onSweep = null, flowEvery = null, pad = 1.5, paths = null, tone = null, reach = 0, settle = 60, graded = 6 }) {
  if (!paths) paths = passagePaths(mask, w, h, { maxRadius, want, seed, pad }).paths;
  if (!paths.length) return { sweeps: 0, dips: 0, cover: 0 };
  const every = flowEvery ?? Math.max(24, Math.round(24 * Math.sqrt(paths.length)));
  let sweeps = 0, dips = 0;
  const flow = s => { if (s % every === 0) step(sheet, O); };
  // wet on wet: clean water first. Over the passage and, with `reach`, past it onto paper the source holds no darker
  // than the passage's pale end (prewetArea), so the wash fades out instead of drying to a hard rim at the mask's edge.
  if (T.intoWet) {
    const area = reach > 0 && tone ? prewetArea(mask, tone, w, h, { reach }) : mask;
    const wetPaths = area === mask ? paths : passagePaths(area, w, h, { maxRadius: Math.max(maxRadius, 3), seed: seed + 900, pad: 1 }).paths;
    for (const pts of wetPaths) {
      const r = Math.max(1, ...pts.map(p => p.r)), wet = brushFor(Math.max(2.5, r), TECHNIQUES['wet on wet'], seed + 900);
      dip(wet, { water: 1, conc: charge.map(() => 0) });
      sheet.wetting = 1; stroke(wet, sheet, pts, { upright: 'sweep', between: flow }); sheet.wetting = 0;
    }
  }
  for (const pts of paths) {
    const r = Math.max(1, ...pts.map(p => p.r)), brush = brushFor(r, T, seed + 31 + sweeps);
    const shaped = shapeSweep(pts, want, w, h, amount);
    // A graded sweep: the brush is recharged every `graded` cells at the strength the picture wants there, since one dip
    // carried the length of a sweep lays a flat slab. The factors average one over the sweep, so the calibrated charge holds.
    const chunks = [];
    if (graded > 0 && want && amount > 1e-4 && shaped.length > graded * 2) {
      for (let k = 0; k < shaped.length; k += graded) chunks.push(shaped.slice(Math.max(0, k - 1), k + graded + 1));
    } else chunks.push(shaped);
    const factor = chunks.length > 1 ? chunks.map(ch => { let a = 0; for (const q of ch) { const sx = clamp(Math.round(q.x), 0, w - 1), sy = clamp(Math.round(q.y), 0, h - 1); a += want[sy * w + sx]; } return clamp(a / ch.length / Math.max(1e-4, amount), 0.3, 2.0); }) : [1];
    const meanF = factor.reduce((a, b) => a + b, 0) / factor.length || 1;
    for (let pass = 0; pass < T.passes; pass++) chunks.forEach((ch, k) => {
      dip(brush, { water: T.water, conc: charge.map(v => v * factor[k] / meanF) }); dips++;
      stroke(brush, sheet, ch, { upright: 'sweep', between: flow });
    });
    sweeps++;
    if (onSweep) onSweep(sweeps, paths.length);
  }
  for (let q = 0; q < settle; q++) if (!step(sheet, O)) break;
  return { sweeps, dips, cover: sweepCover(paths, mask, w, h) };
}

/**
 * Lose the stretches of a wet passage's edge that the source loses: a damp brush drawn along them (wash.mjs
 * softenEdge) and a quiet interval for the wash to creep out. The stretches are chosen from the source: where its tone
 * changes little across the boundary the edge is soft; where it steps, or where a light lies outside, it is kept.
 * Called while the passage is still wet, before anything dries it.
 */
export function softenPassage(sheet, mask, tone, lights, w, h, O, { share = 0.4, radius = 8, probe = 3, step = 0.12, seed = 17, settle = 300 } = {}) {
  const at = (x, y) => { const xi = Math.max(0, Math.min(w - 1, Math.round(x))), yi = Math.max(0, Math.min(h - 1, Math.round(y))); return yi * w + xi; };
  const want = (x, y, nx, ny) => {
    const o = at(x + nx * probe, y + ny * probe), i = at(x - nx * probe, y - ny * probe);
    if (lights && lights[o]) return -1;
    return Math.max(0, step - Math.abs(tone[o] - tone[i])) / step;
  };
  const arcs = softArcs(mask, w, h, want, { share, minRun: 10, minLoop: 30 });
  if (!arcs.length) return 0;
  // the damp band has to be a real share of the passage: a radius of 4 cells moves nothing past the contact line
  return soften(sheet, arcs, O, { radius, seed, settle });
}

/** Dry the sheet and fix the wash as a layer. Levels for a short while, then runs time fast. */
export function dryFully(sheet, O, { levelMax = 400, dt = 4 } = {}) {
  for (let q = 0; q < 60; q++) if (!step(sheet, O)) break;
  return dry(sheet, 40000, O, { levelMax, dt });
}

/** Mass laid per unit of charge by each technique, from one swatch on scrap, and the sweeps over the swatch's mean
 *  cell that laid it (`cover`), so a passage the brush covers more thinly or more thickly can be charged for it. */
export function calibrateYield(paints, O, { size = 80, seed = 5, maxRadius = 8 } = {}) {
  const out = {}, n = size * size, mask = new Uint8Array(n);
  for (let y = 16; y < size - 16; y++) for (let x = 16; x < size - 16; x++) mask[y * size + x] = 1;
  for (const T of Object.values(TECHNIQUES)) {
    const scrap = createSheet(makePaper(size, size, { seed, scale: 1, toothScale: 0.2 }), [paints[0]]);
    const { paths, cover } = passagePaths(mask, size, size, { maxRadius, seed });
    layPassage(scrap, mask, [1], { w: size, h: size, T, maxRadius, seed, O, paths });
    dryFully(scrap, O);
    const th = thickness(scrap)[0]; let s = 0, c = 0;
    for (let i = 0; i < n; i++) if (mask[i]) { s += th[i]; c++; }
    out[T.name] = Math.max(0.02, s / c);
    out.cover = cover;
  }
  return out;
}

/** The charge to dip for `mass` along a well: recipe times mass over the technique's yield, padded to the sheet's
 *  pigments (graphite, ink) with zeros, the total clamped to what a dip can carry. */
export function chargeFor(well, mass, yield1, K, { most = 8, least = 0.005 } = {}) {
  const conc = new Array(K).fill(0);
  let total = 0;
  for (let j = 0; j < well.recipe.length && j < K; j++) { conc[j] = well.recipe[j] * mass / Math.max(1e-6, yield1); total += conc[j]; }
  if (total > most) for (let j = 0; j < K; j++) conc[j] *= most / total;
  if (total < least && total > 0) for (let j = 0; j < K; j++) conc[j] *= least / total;
  return conc;
}
