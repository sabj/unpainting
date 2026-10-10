// The placing drawing, made before the first wash: the figure's edge and the edges of the big darks, nothing finer.
// Drawn with the pen model carrying graphite as a non-lifting pigment, because the pencil model's graphite field
// is not composited by the sheet's optics.
import { silhouette, traceOutlines } from '../../crop/outline.mjs';
import { drawGestures } from '../../media/draw.mjs';
import { dry } from '../../media/sheet.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { components } from '../../raster.js';

/** Graphite as a sheet pigment: a flat grey that does not lift under a wash. */
export const GRAPHITE = Object.freeze({ K: [0.22, 0.22, 0.23], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 60, gamma: 0, name: 'graphite' });

/**
 * The outlines a pencil places first: the figure's edge and the darks' edges, as chains of points, longest first,
 * their total length capped at `budget` of the sheet's cells (a placing drawing, not a rendering).
 */
export function outlineGestures(S, w, h, { scale = null, minArea = 0.002, minLength = 30, step = 3, budget = 0.025, darkQuantile = 0.7, bare = 0.05, most = 12 } = {}) {
  const { tone, n } = S, sc = scale ?? Math.max(1.5, 0.012 * Math.min(w, h));
  // the figure: wherever the picture is painted at all, at a hand's blur. silhouette's halfway split would sit
  // inside the figure on a high-key sheet and outline only its darks
  const Bf = gaussian(tone, w, h, sc), figure = Uint8Array.from(Bf, v => (v > 2 * bare ? 1 : 0));
  const { labels, areas, count } = components(figure, w, h);
  for (let i = 0; i < n; i++) if (figure[i] && areas[labels[i]] < minArea * n) figure[i] = 0;
  void count;
  // the darks: silhouette's cut, halfway between the sheet's ground and its figures at the same blur
  void darkQuantile;
  const darks = silhouette(tone, w, h, gaussian, { scale: sc, minArea });
  // the figure's edge first, then the darks', longest chains first, at most `most`: a fuller map reads as closed outlines
  const seen = new Set(), out = [];
  let used = 0;
  for (const mask of [figure, darks]) {
    if (out.length >= most) break;
    for (const ch of traceOutlines(mask, w, h, { minLength, step })) {
      const key = ch.points.slice(0, 3).map(p => `${p.x | 0},${p.y | 0}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      if (out.length >= most || used + ch.points.length * step > budget * n) continue;
      used += ch.points.length * step;
      out.push({ points: ch.points.map(p => ({ x: p.x, y: p.y })) });
    }
  }
  return out;
}

/** Draw the gestures in graphite with the pen, then let the sheet settle dry. */
export function drawPencil(sheet, gestures, { w, h, graphiteAt, conc = 2.5, O, pen = { nib: 0.55, flex: 1.0 } }) {
  const want = new Float32Array(w * h).fill(0.6), ink = sheet.pigments.map((_, j) => (j === graphiteAt ? conc : 0));
  const r = drawGestures(sheet, gestures, want, w, h, { ink, pen, O, peak: 1 });
  dry(sheet, 20000, O, { levelMax: 200, dt: 4 });
  return r;
}

