// Reads the line file from tools/seg/lines.py (work/lines/<base>-lines.json, polylines in source pixels) and puts
// the points on the plan's grid. Selection only: the pen draws each line with its own pressure and nib.
// Each axis scales on its own, since a plan rarely has the source's aspect; lengths are re-measured in plan cells.
// DOM free. Reads JSON and nothing else.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = 'work/lines';

// A bare name is looked up in the line directory; anything with a slash is taken as the path prefix itself.
export function linePaths(base, dir = DEFAULT_DIR) {
  const stem = base.includes('/') ? base : path.join(dir, base);
  return { map: `${stem}.png`, lines: `${stem}-lines.json` };
}

export function hasLines(base, dir = DEFAULT_DIR) {
  return fs.existsSync(linePaths(base, dir).lines);
}

/** Arc length of a polyline of {x, y}, in whatever units its points are in. */
function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/**
 * The file's polylines on a w by h grid, longest first. `keepOrder` keeps the file's order (big shapes first),
 * as a selected drawing wants.
 *
 * @param doc the parsed <base>-lines.json
 */
export function scaleLines(doc, w, h, { keepOrder = false } = {}) {
  const src = doc?.image || { w, h };
  const sx = w / (src.w || w), sy = h / (src.h || h);
  const lines = (doc?.lines || [])
    .map(g => {
      // per-point width (scaled by the mean axis scale) and darkness 0..1, when the file has them
      const ws = Array.isArray(g.widths) && g.widths.length === (g.points || []).length ? g.widths : null;
      const wt = Array.isArray(g.weights) && g.weights.length === (g.points || []).length ? g.weights : null;
      const sw = (sx + sy) / 2;
      const points = (g.points || []).map(([x, y], k) => {
        const q = { x: x * sx, y: y * sy };
        if (ws) q.width = ws[k] * sw;
        if (wt) q.weight = wt[k];
        return q;
      });
      const out = { points, length: pathLength(points), strength: Number.isFinite(g.strength) ? g.strength : 0 };
      if (Number.isFinite(g.weight)) out.weight = g.weight;
      if (g.role) out.role = g.role;
      if (g.object) out.object = g.object;
      if (g.region) out.region = g.region;
      return out;
    })
    .filter(g => g.points.length >= 2);
  return keepOrder ? lines : lines.sort((a, b) => b.length - a.length);
}

export function loadLines(base, w, h, { dir = DEFAULT_DIR, keepOrder = false } = {}) {
  const file = linePaths(base, dir).lines;
  if (!fs.existsSync(file)) throw new Error(`lines: no line file at ${file}`);
  return scaleLines(JSON.parse(fs.readFileSync(file, 'utf8')), w, h, { keepOrder });
}
