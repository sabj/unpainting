// Reads the line file from tools/seg/lines.py (work/lines/<base>-lines.json, polylines in source pixels) and puts
// the points on the plan's grid. Selection only: the pen draws each line with its own pressure and nib.
// Each axis scales on its own, since grids round differently (540 x 442 cells for a 304 x 249 target); lengths are
// re-measured in plan cells. Once the painter binds the target it paints (bindLineTarget), a file made for another
// image is refused: one whose targetSHA256 names another image, or whose image box is more than 2% off the target's
// aspect, since its lines would land stretched with no message. Register such a drawing to the target first
// (src/paint/methods/drawing-registration.mjs, which the painter runs on a --drawingfile by itself).
// DOM free. Reads JSON and nothing else.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DIR = 'work/lines';
// The most a line file's aspect may differ from the bound target's, as a share.
const ASPECT_LIMIT = 0.02;
let target = null;

/** The image the painter paints, { sha256, w, h }, against which every line file is checked; null unbinds. */
export function bindLineTarget(t) { target = t ? Object.freeze({ ...t }) : null; }

/** Why a line file does not belong to the bound target, or null when it does (or nothing is bound). */
export function lineTargetMismatch(doc) {
  if (!target || !doc) return null;
  if (doc.targetSHA256 && target.sha256 && doc.targetSHA256 !== target.sha256) return `it was made for image ${doc.targetSHA256.slice(0, 8)}, not the target ${target.sha256.slice(0, 8)} being painted`;
  const im = doc.image;
  if (im?.w && im?.h && target.w && target.h) {
    const a = (im.w / im.h) / (target.w / target.h), gap = Math.max(a, 1 / a) - 1;
    if (gap > ASPECT_LIMIT) return `its image is ${im.w} x ${im.h} and the target ${target.w} x ${target.h}, so its lines would be stretched ${(100 * gap).toFixed(0)}% along one axis`;
  }
  return null;
}

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
export function scaleLines(doc, w, h, { keepOrder = false, file = null } = {}) {
  const why = lineTargetMismatch(doc);
  if (why) throw new Error(`lines: ${file ?? doc.source ?? 'a line file'} does not belong to this target: ${why}. Register it to the target (tools/seg/register-lines.mjs) or make it from this image.`);
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
      if (g.kind) out.kind = g.kind;
      if (g.object) out.object = g.object;
      if (g.region) out.region = g.region;
      if (g.soft) out.soft = true;
      return out;
    })
    .filter(g => g.points.length >= 2);
  return keepOrder ? lines : lines.sort((a, b) => b.length - a.length);
}

export function loadLines(base, w, h, { dir = DEFAULT_DIR, keepOrder = false } = {}) {
  const file = linePaths(base, dir).lines;
  if (!fs.existsSync(file)) throw new Error(`lines: no line file at ${file}`);
  return scaleLines(JSON.parse(fs.readFileSync(file, 'utf8')), w, h, { keepOrder, file });
}
