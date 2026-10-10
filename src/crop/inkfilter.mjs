// Select ink paths before the pen: each walker path is classified against the source density (marks.mjs) and only
// contours are drawn; wash, dry brush and texture are dropped. Selects only: no point moves, no path is invented.
// DOM free. No file IO.
import { measureMarks, classifyMark } from './marks.mjs';

// classifyMark's vocabulary: only a contour earns the nib.
const INK_KEPT = 'contour';

const lengthOf = points => {
  let total = 0;
  for (let j = 1; j < points.length; j++) total += Math.hypot(points[j].x - points[j - 1].x, points[j].y - points[j - 1].y);
  return total;
};

/**
 * Measure every path against the source and say which ones are drawn.
 *
 * @param paths   [{ points: [{x, y}], outline? }] in the cells D is on
 * @param D       the source optical density the walker followed
 * @param opts.scale     source pixels per cell, as measureMarks takes it
 * @param opts.accent    kept paths shorter than this many cells are labelled accent in the report; never changes
 *                       what is drawn.
 * @returns [{ index, kept, type, role, length, samples, outline, at, to, measures }]
 */
export function classifyInkPaths(paths, D, w, h, { scale = 1, accent = 10, ridges } = {}) {
  const M = measureMarks(D, w, h, { scale, ridges });
  return paths.map((g, index) => {
    const points = g.points ?? [];
    const length = lengthOf(points);
    // Under two points the pen draws nothing at all, so there is no mark to measure and none to reject.
    if (points.length < 2) return { index, kept: true, type: INK_KEPT, role: 'accent', length, samples: points.length, outline: !!g.outline, at: null, to: null, measures: null };
    const { type, evidence } = classifyMark(g, M);
    const kept = type === INK_KEPT;
    const round = p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
    return {
      index, kept, type, role: kept && length < accent ? 'accent' : type, length: +length.toFixed(1),
      samples: points.length, outline: !!g.outline, at: round(points[0]), to: round(points[points.length - 1]),
      measures: Object.fromEntries(Object.entries(evidence).map(([k, v]) => [k, +v.toFixed(4)])),
    };
  });
}

/** kept/total and a count per class, for one line of log. */
export function inkFilterCounts(entries) {
  const counts = { total: entries.length, kept: 0, contour: 0, accent: 0, wash: 0, dry: 0, texture: 0 };
  for (const e of entries) {
    if (e.kept) { counts.kept++; counts[e.role === 'accent' ? 'accent' : 'contour']++; }
    else counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

const stamp = (rgb, w, h, x, y, colour, radius) => {
  const r = Math.max(1, Math.ceil(radius));
  for (let yy = Math.round(y) - r; yy <= Math.round(y) + r; yy++) for (let xx = Math.round(x) - r; xx <= Math.round(x) + r; xx++) {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
    if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > radius) continue;
    const i = 3 * (yy * w + xx);
    rgb[i] = colour[0]; rgb[i + 1] = colour[1]; rgb[i + 2] = colour[2];
  }
};

const polyline = (rgb, w, h, points, colour, width) => {
  const radius = Math.max(0.5, width / 2);
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1], b = points[j], L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L * 2));
    for (let q = 0; q <= steps; q++) stamp(rgb, w, h, a.x + (b.x - a.x) * q / steps, a.y + (b.y - a.y) * q / steps, colour, radius);
  }
  if (points.length === 1) stamp(rgb, w, h, points[0].x, points[0].y, colour, radius);
};

/**
 * The source in light grey with the kept paths green over the dropped paths red, so the decision can be looked at
 * rather than measured. Raw RGB; the caller writes the file.
 *
 * @param marks [{ points, kept }] in the cells D is on
 */
export function inkFilterOverlay(D, w, h, marks, { width = 2, kept = [40, 160, 60], dropped = [214, 40, 40] } = {}) {
  const n = w * h, rgb = new Uint8Array(n * 3);
  const sorted = Array.from(D).sort((a, b) => a - b), top = sorted[Math.floor(0.98 * (n - 1))] || 1;
  for (let i = 0; i < n; i++) {
    const v = Math.round(255 - 120 * Math.min(1, Math.max(0, D[i] / top)));
    rgb[3 * i] = v; rgb[3 * i + 1] = v; rgb[3 * i + 2] = v;
  }
  // Dropped first: where a kept path runs beside one that was dropped, the kept one is the thing being checked.
  for (const m of marks) if (!m.kept) polyline(rgb, w, h, m.points, dropped, width);
  for (const m of marks) if (m.kept) polyline(rgb, w, h, m.points, kept, width);
  return rgb;
}
