// --drawingfile <base>: the first pen draws exactly the lines of work/lines/<base>-lines.json (tools/seg/select-drawing.py),
// whole, in file order, at the outline tier's pressure; no walker gestures, ink filter or silhouette pass.
// Each line is split into strokes of --drawstroke (share of the short side), one dip each, so the pen does not run dry.
import { hasLines, loadLines } from '../../crop/lines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';
import { boundPreparation } from './preparation-binding.mjs';
import { drawingLogic } from './drawing-logic.mjs';
import { planLines } from '../drawing-plan.mjs';

// Contact width for a drawn width W: the pen at K 1 on dry paper draws about 0.72 x contact + 0.3 cells,
// so contact = (W - 0.3) / 0.72 = 1.39 W - 0.42 cells.
const GAIN = 1.39, MARGIN = 0.42;

// The selected drawing as tier-1 strokes, or null when no file applies to this pen. `walked` is for the log only.
// --drawinglast <base>: the closing pen (--drawing both|last, over the dry sheet) draws only lines of weight at least
// --drawinglastmin, so the darks and features stay crisp over the glazes.
export function selectedDrawing({ first, fine = false, w, h, opt, num, log, walked, D = null, want = null, cells = 0, K = 1, walker = null, field = null, style = null }) {
  const lastPass = !first && !fine && opt('drawinglast', '');
  if (!(first && opt('drawingfile', '')) && !lastPass) return null;
  const b = first ? opt('drawingfile', '') : opt('drawinglast', '');
  if (!hasLines(b)) throw new Error(`drawing: no work/lines/${b}-lines.json`);
  if (first && opt('preparationbinding','')) return boundPreparation({bindingFile:opt('preparationbinding',''),base:b,image:opt('image',''),guide:opt('penpencil',''),w,h,num,log});
  // --drawinglogic 1: rank, budget, filter, connect and shape the file's lines (drawing-logic.mjs)
  if (num('drawinglogic', 0) > 0) return drawingLogic({ base: b, first, w, h, opt, num, log, D, want, cells, K, walker, field, style });
  // --drawingskip: comma list of line roles left out of both pens ('dark fill' drops hatching, leaving contours)
  const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean));
  // the plan's choice (drawing-plan.mjs planLines): --drawshare's strongest share, --drawregions' subject-first ranking
  // and --drawmax's cap
  const candidates = loadLines(b, w, h, { keepOrder: true }).filter(g => !skip.has(g.role)), min = num('drawinglastmin', 0.6);
  const all = planLines(candidates, num);
  if (skip.size) log(`drawing: lines with role ${[...skip].join(', ')} left out`);
  if (all.length < candidates.length) log(`drawing: ${all.length} of ${candidates.length} lines kept (--drawshare ${num('drawshare', 1)}, --drawregions ${num('drawregions', 0)}, --drawmax ${num('drawmax', Infinity)})`);
  const lines = first ? all : all.filter(g => (g.weight ?? 1) >= min);
  log(first ? `drawing: ${lines.length} selected lines from work/lines/${b}-lines.json, drawn whole; the walker's ${walked} gestures are not used`
    : `drawing, closing pen: ${lines.length} of ${all.length} lines of work/lines/${b}-lines.json at weight ${min} or more, over the dry sheet`);
  const strokesOf = g => { const L = num('drawstroke', 0.12) * Math.min(w, h), out = []; let cur = [g.points[0]], d = 0; for (let k = 1; k < g.points.length; k++) { const s = Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); d += s; cur.push(g.points[k]); if (d >= L && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; } } if (cur.length >= 2) out.push(cur); return out.map(points => ({ points, length: pathLength(points), tier: 1, weight: g.weight ?? 1 })); };
  // Per-point `width` (px) and `weight` (0..1) set the pen along the stroke: contact = width x --drawwidthgain
  // - --drawwidthmargin cells (see GAIN), pressure = weight x --drawwant. Points without them are unchanged.
  const base = num('drawwant', num('tier1want', 0.6)), margin = num('drawwidthmargin', MARGIN), gain = num('drawwidthgain', GAIN), minNib = num('drawwidthmin', 0.3);
  const perPoint = q => (q.width == null && q.weight == null ? q : {
    x: q.x, y: q.y,
    ...(q.width == null ? {} : { nw: Math.max(minNib, q.width * gain - margin) }),
    ...(q.weight == null ? {} : { s: base * Math.max(0, Math.min(1, q.weight)) }),
  });
  const measured = lines.some(g => g.points.some(q => q.width != null || q.weight != null));
  if (measured) log(`drawing: per-point widths and darkness from the file, contact = width x ${gain} - ${margin} cells, pressure share = ${base} x darkness`);
  return lines.flatMap(strokesOf).map(g => (measured ? { ...g, points: g.points.map(perPoint) } : g));
}

// Pen pressure field for a selected drawing, on the sheet grid (W2 x H2, SC sheet cells per plan cell): each stroke's
// weight (0..1, default 1) times `base`, a nib's width either side, max where strokes cross; `floor` x `base` elsewhere.
export function drawingWant(strokes, W2, H2, SC, { base = 0.6, floor = 0.15, radius = 1.5 } = {}) {
  const want = new Float32Array(W2 * H2).fill(floor * base), r = Math.max(1, Math.round(radius * SC));
  for (const g of strokes) {
    const v = base * Math.max(0, Math.min(1, g.weight ?? 1));
    for (let k = 0; k < g.points.length; k++) {
      const a = g.points[k], b = g.points[Math.min(k + 1, g.points.length - 1)];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * SC));
      for (let s = 0; s <= steps; s++) {
        const cx = Math.round((a.x + (b.x - a.x) * s / steps) * SC), cy = Math.round((a.y + (b.y - a.y) * s / steps) * SC);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W2 || y >= H2) continue;
          const i = y * W2 + x; if (v > want[i]) want[i] = v;
        }
      }
    }
  }
  return want;
}
