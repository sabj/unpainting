// --drawingfile <base>: the first pen draws exactly the lines of work/lines/<base>-lines.json (tools/seg/select-drawing.py),
// whole, in file order, at the outline tier's pressure; no walker gestures, ink filter or silhouette pass.
// Each line is split into strokes of --drawstroke (share of the short side), one dip each, so the pen does not run dry.
import { hasLines, loadLines } from "../../crop/lines.mjs";
import { pathLength } from "../../crop/inktiers.mjs";
import { simplify } from "../../crop/simplify.mjs";
import { boundPreparation } from "./preparation-binding.mjs";
import { drawingLogic } from "./drawing-logic.mjs";
import { planLines } from "../drawing-plan.mjs";
import { scribbleMasses } from "./drawing-scribble.mjs";
import { personStrokes } from "./drawing-hand.mjs";
import { gaussian } from "../../keyframes/density.mjs";

// Contact width for a drawn width W: the pen at K 1 on dry paper draws about 0.72 x contact + 0.3 cells,
// so contact = (W - 0.3) / 0.72 = 1.39 W - 0.42 cells.
const GAIN = 1.39, MARGIN = 0.42;

// Pen-path cleanup for pixel-traced chains: collapse the 1-px skeleton staircase (Douglas-Peucker at source-pixel tolerance,
// slightly higher on near-straight architectural segments), keep vertices where nib width or darkness would otherwise be
// interpolated wrongly, then subdivide long segments so each dip stays short.
function tidyLine(g, tolPx, maxSeg) {
  const sw = g.scale ?? 1;
  if (!(tolPx > 0) || g.points.length < 3) return g;
  const all = g.points.filter((q, k) => !k || Math.hypot(q.x - g.points[k - 1].x, q.y - g.points[k - 1].y) > 1e-6);
  if (all.length < 3) return g;
  const cum = [0];
  for (let k = 1; k < all.length; k++) cum.push(cum[k - 1] + Math.hypot(all[k].x - all[k - 1].x, all[k].y - all[k - 1].y));
  const arc = cum.at(-1), chord = Math.hypot(all.at(-1).x - all[0].x, all.at(-1).y - all[0].y);
  const straight = arc > 1e-6 ? chord / arc : 1;
  const tol = tolPx * sw * (chord >= 6 * sw && straight >= 0.85 ? (straight >= 0.92 ? 2.4 : 1.75) : 1);
  const at = new Map(all.map((q, k) => [q, k])), geoKeep = new Set(simplify(all, tol).map(q => at.get(q))), keep = new Set(geoKeep);
  const ws = all.map(q => q.width).filter(v => v != null).sort((a, b) => a - b), dw = Math.max(0.3, 0.35 * (ws[ws.length >> 1] ?? 0)), dq = 0.15;
  const ks = [...keep].sort((a, b) => a - b), stack = ks.slice(1).map((b, i) => [ks[i], b]);
  const projected = new Map();
  while (stack.length) {
    const [a, b] = stack.pop(); let far = -1, best = 1;
    for (let i = a + 1; i < b; i++) {
      const f = (cum[i] - cum[a]) / Math.max(1e-9, cum[b] - cum[a]), P = projected.get(a) ?? all[a], Q = projected.get(b) ?? all[b], q = all[i];
      const ew = q.width == null || P.width == null || Q.width == null ? 0 : Math.abs(q.width - (P.width + (Q.width - P.width) * f)) / dw;
      const eq = q.weight == null || P.weight == null || Q.weight == null ? 0 : Math.abs(q.weight - (P.weight + (Q.weight - P.weight) * f)) / dq;
      const e = Math.max(ew, eq); if (e > best) { best = e; far = i; }
    }
    if (far > 0) {
      const f = (cum[far] - cum[a]) / Math.max(1e-9, cum[b] - cum[a]), P = projected.get(a) ?? all[a], Q = projected.get(b) ?? all[b];
      projected.set(far, { ...all[far], x: P.x + (Q.x - P.x) * f, y: P.y + (Q.y - P.y) * f });
      keep.add(far); stack.push([a, far], [far, b]);
    }
  }
  const kept = [...keep].sort((a, b) => a - b).map(i => projected.get(i) ?? all[i]);
  const points = kept.flatMap((q, k) => {
    if (!k) return [q];
    const p = kept[k - 1], n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / maxSeg), out = [];
    for (let s = 1; s < n; s++) {
      const f = s / n, m = { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
      if (p.width != null && q.width != null) m.width = p.width + (q.width - p.width) * f;
      if (p.weight != null && q.weight != null) m.weight = p.weight + (q.weight - p.weight) * f;
      out.push(m);
    }
    out.push(q); return out;
  });
  return { ...g, points, length: pathLength(points) };
}

// The selected drawing as tier-1 strokes, or null when no file applies to this pen. `walked` is for the log only.
// --drawinglast <base>: the closing pen (--drawing both|last, over the dry sheet) draws only lines of weight at least
// --drawinglastmin, so the darks and features stay crisp over the glazes.
export function selectedDrawing({ first, fine = false, w, h, opt, num, log, walked, D = null, want = null, cells = 0, K = 1, walker = null, field = null, style = null }) {
  const lastPass = !first && !fine && opt("drawinglast", "");
  if (!(first && opt("drawingfile", "")) && !lastPass) return null;
  const b = first ? opt("drawingfile", "") : opt("drawinglast", "");
  if (!hasLines(b)) throw new Error(`drawing: no work/lines/${b}-lines.json`);
  if (first && opt("preparationbinding","")) return boundPreparation({bindingFile:opt("preparationbinding",""),base:b,image:opt("image",""),guide:opt("penpencil",""),w,h,num,log});
  // --drawinglogic 1: rank, budget, filter, connect and shape the file's lines (drawing-logic.mjs)
  // --drawinglastlogic: the closing pen's own logic (default --drawinglogic); linked stages set it to 0, since the
  // finish-ink file is already the closing drawing
  if (num(first ? "drawinglogic" : "drawinglastlogic", num("drawinglogic", 0)) > 0) return drawingLogic({ base: b, first, w, h, opt, num, log, D, want, cells, K, walker, field, style });
  // --drawingskip: comma list of line roles left out of both pens ('dark fill' drops hatching, leaving contours)
  const skip = new Set(opt("drawingskip", "").split(",").map(r => r.trim()).filter(Boolean));
  // the plan's choice (drawing-plan.mjs planLines): --drawshare's strongest share, --drawregions' subject-first ranking
  // and --drawmax's cap
  const maxSeg = 0.06 * Math.min(w, h), tolPx = num("drawsimplify", 0.85);
  const candidates = loadLines(b, w, h, { keepOrder: true }).filter(g => !skip.has(g.role)).map(g => tidyLine(g, tolPx, maxSeg)), min = num("drawinglastmin", 0.6);
  const all = planLines(candidates, num);
  if (skip.size) log(`drawing: lines with role ${[...skip].join(", ")} left out`);
  if (all.length < candidates.length) log(`drawing: ${all.length} of ${candidates.length} lines kept (--drawshare ${num("drawshare", 1)}, --drawregions ${num("drawregions", 0)}, --drawmax ${num("drawmax", Infinity)})`);
  const lines = first ? all : all.filter(g => (g.weight ?? 1) >= min);
  log(first ? `drawing: ${lines.length} selected lines from work/lines/${b}-lines.json, drawn whole; the walker's ${walked} gestures are not used`
    : `drawing, closing pen: ${lines.length} of ${all.length} lines of work/lines/${b}-lines.json at weight ${min} or more, over the dry sheet`);
  const strokesOf = g => { const L = num("drawstroke", 0.12) * Math.min(w, h), out = []; let cur = [g.points[0]], d = 0; for (let k = 1; k < g.points.length; k++) { const s = Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); d += s; cur.push(g.points[k]); if (d >= L && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; } } if (cur.length >= 2) out.push(cur); return out.map(points => ({ points, length: pathLength(points), tier: 1, weight: g.weight ?? 1 })); };
  const copyingNib = opt("inkprofile", "") === "drawing-ink";
  const base = num("drawwant", num("tier1want", 0.6)), margin = num("drawwidthmargin", copyingNib ? .3 : MARGIN), gain = num("drawwidthgain", copyingNib ? .95 : GAIN), minNib = num("drawwidthmin", 0.3);
  const perPoint = q => (q.width == null && q.weight == null ? q : {
    x: q.x, y: q.y,
    ...(q.width == null ? {} : { nw: Math.max(minNib, q.width * gain - margin) }),
    ...(q.weight == null ? {} : { s: base * Math.max(0, Math.min(1, q.weight)) }),
  });
  const measured = lines.some(g => g.points.some(q => q.width != null || q.weight != null));
  if (measured) log(`drawing: per-point widths and darkness from the file, contact = width x ${gain} - ${margin} cells, pressure share = ${base} x darkness`);
  const strokes = lines.flatMap(strokesOf).map(g => (measured ? { ...g, points: g.points.map(perPoint) } : g));
  if (!first && num("finishmasses", 0) > 0 && D) {
    const masses = scribbleMasses(D, w, h, gaussian, { K, dark: num("scribbledark", 0.06), minMass: num("scribblemass", 0.002), loop: num("scribbleloop", 0.008), hole: num("scribblehole", 0.35), seed: 11 });
    const scribbles = masses.flatMap(g => personStrokes(g, num("scribblestrokes", 0.12) * Math.min(w, h), { dipFirst: true, load: 0.6, low: 0.05 })).map(g => ({ ...g, tier: 1, weight: num("finishmassweight", 0.6) }));
    log(`drawing, closing pen: ${masses.length} dark masses as scribble in ${scribbles.length} strokes (--finishmasses)`);
    return [...strokes, ...scribbles];
  }
  return strokes;
}

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
