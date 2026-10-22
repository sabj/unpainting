// Pipeline: inking, stage 4 (hand plan: strokes from the line file).
// --drawingfile <base>: the first pen draws exactly the lines of work/lines/<base>-lines.json (tools/seg/select-drawing.py),
// whole, in file order, at the outline tier's pressure; no walker gestures, ink filter or silhouette pass.
// Each line is split into strokes of --drawstroke (share of the short side), one dip each, so the pen does not run dry.
import fs from 'node:fs';
import { hasLines, loadLines, linePaths } from '../../crop/lines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';
import { boundPreparation } from './preparation-binding.mjs';
import { drawingLogic } from './drawing-logic.mjs';
import { planLines } from '../drawing-plan.mjs';
import { scribbleMasses } from './drawing-scribble.mjs';
import { personStrokes, handDrawing } from './drawing-hand.mjs';
import { gaussian } from '../../keyframes/density.mjs';

// Contact width for a drawn width W: the pen at K 1 on dry paper draws about 0.72 x contact + 0.3 cells,
// so contact = (W - 0.3) / 0.72 = 1.39 W - 0.42 cells.
const GAIN = 1.39, MARGIN = 0.42;

/**
 * Why a line file says nothing is drawn, or null. Only a file with no lines at all counts: medium "none" (a
 * pure-watercolor plan) for either pen, or, for the opening pen, the linked stages' `empty` marker (linework-plan.mjs).
 * Malformed or filtered-out paths never count, so they still fail the first pen.
 */
export function noDrawingDeclared(doc, { first = true } = {}) {
  if (!doc || !Array.isArray(doc.lines) || doc.lines.length) return null;
  if (doc.medium === 'none') return 'the drawing explicitly declares medium none';
  return first && doc.empty ? doc.empty : null;
}

// The selected drawing as tier-1 strokes, or null when no file applies to this pen. `walked` is for the log only.
// --drawinglast <base>: the closing pen (--drawing both|last, over the dry sheet) draws only lines of weight at least
// --drawinglastmin, so the darks and features stay crisp over the glazes.
// `prune` (pen and wash, pen-wash-lines.mjs) thins the opening pen's planned lines before they are split into strokes.
export function selectedDrawing({ first, fine = false, w, h, opt, num, log, walked, D = null, want = null, cells = 0, K = 1, walker = null, field = null, style = null, prune = null }) {
  const lastPass = !first && !fine && opt('drawinglast', '');
  if (!(first && opt('drawingfile', '')) && !lastPass) return null;
  const b = first ? opt('drawingfile', '') : opt('drawinglast', '');
  if (!hasLines(b)) throw new Error(`drawing: no work/lines/${b}-lines.json`);
  if (first && opt('preparationbinding','')) return boundPreparation({bindingFile:opt('preparationbinding',''),base:b,image:opt('image',''),guide:opt('penpencil',''),w,h,num,log});
  // A declared no-drawing file is read before the logic branch and the line loader, for both pens, so --drawinglogic,
  // --drawinglastlogic, --finishmasses and the loader's target check of an empty file add or refuse nothing.
  const declared = noDrawingDeclared(JSON.parse(fs.readFileSync(linePaths(b).lines, 'utf8')), { first });
  if (declared) {
    log(first ? `drawing: no opening ink, since ${declared}; the walker's ${walked} gestures are not used` : `drawing, closing pen: no closing ink, since ${declared}`);
    return [];
  }
  // --drawinglogic 1: rank, budget, filter, connect and shape the file's lines (drawing-logic.mjs)
  // --drawinglastlogic: the closing pen's own logic (default --drawinglogic); linked stages set it to 0, since the
  // finish-ink file is already the closing drawing
  if (num(first ? 'drawinglogic' : 'drawinglastlogic', num('drawinglogic', 0)) > 0) return drawingLogic({ base: b, first, w, h, opt, num, log, D, want, cells, K, walker, field, style });
  // --drawingskip: comma list of line roles left out of both pens ('dark fill' drops hatching, leaving contours)
  const skip = new Set(opt('drawingskip', '').split(',').map(r => r.trim()).filter(Boolean));
  // the plan's choice (drawing-plan.mjs planLines): --drawshare's strongest share, --drawregions' subject-first ranking
  // and --drawmax's cap
  const candidates = loadLines(b, w, h, { keepOrder: true }).filter(g => !skip.has(g.role)), min = num('drawinglastmin', 0.6);
  const planned = planLines(candidates, num), all = first && prune ? prune(planned) : planned;
  if (skip.size) log(`drawing: lines with role ${[...skip].join(', ')} left out`);
  if (all.length < candidates.length) log(`drawing: ${all.length} of ${candidates.length} lines kept (--drawshare ${num('drawshare', 1)}, --drawregions ${num('drawregions', 0)}, --drawmax ${num('drawmax', Infinity)})`);
  const lines = first ? all : all.filter(g => (g.weight ?? 1) >= min);
  const file = linePaths(b).lines;
  // Linked stages can explicitly omit prep ink; pure-watercolor plans declare medium none.
  // Recognize medium none only for an empty source file, not malformed or filtered-out paths.
  const doc = first && !candidates.length ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const empty = doc?.empty || (doc?.medium === 'none' && Array.isArray(doc.lines) && doc.lines.length === 0
    ? 'the drawing explicitly declares medium none' : null);
  if (empty) { log(`drawing: no opening ink, since ${empty}; the walker's ${walked} gestures are not used`); return []; }
  if (first && !lines.length) throw new Error(`drawing: the first pen selected 0 of ${candidates.length} lines from ${file}${skip.size ? ` (roles left out: ${[...skip].join(', ')})` : ''}`);
  log(first ? `drawing: ${lines.length} selected lines from ${file}, drawn whole; the walker's ${walked} gestures are not used`
    : `drawing, closing pen: ${lines.length} of ${all.length} lines of ${file} at weight ${min} or more, over the dry sheet`);
  // --inkbleed d: a line the target shows soft and spread (ink-lines.mjs marks it `soft`) is drawn on paper d damp
  const bleed = num('inkbleed', 0);
  if (!(bleed >= 0 && bleed <= 1)) throw new Error('--inkbleed: a dampness from 0 to 1');
  const strokesOf = g => { const L = num('drawstroke', 0.12) * Math.min(w, h), out = []; let cur = [g.points[0]], d = 0; for (let k = 1; k < g.points.length; k++) { const s = Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); d += s; cur.push(g.points[k]); if (d >= L && k < g.points.length - 1) { out.push(cur); cur = [g.points[k]]; d = 0; } } if (cur.length >= 2) out.push(cur); return out.map(points => ({ points, length: pathLength(points), tier: 1, weight: g.weight ?? 1, ...(g.soft && bleed > 0 ? { damp: bleed } : {}) })); };
  // Per-point `width` (px) and `weight` (0..1) set the pen along the stroke: contact = width x --drawwidthgain
  // - --drawwidthmargin cells (see GAIN), pressure = weight x --drawwant. Points without them are unchanged.
  // The flexible drawing nib's high-concentration dry line is approximately
  // contact + 0.3 cells. The legacy K=1 calibration above over-widens observed
  // thick marks when copying with this instrument. Explicit calibration wins.
  const copyingNib = opt('inkprofile', '') === 'drawing-ink';
  // The margin and the least contact are cell effects of the painting's grid (a pen on a cell floors its line to a cell). On
  // a fine ink sheet (--inkres N) a cell is N times smaller, and so are they.
  const inkN = Math.max(1, Math.round(num('inkres', 1)));
  const base = num('drawwant', num('tier1want', 0.6)), margin = num('drawwidthmargin', (copyingNib ? .3 : MARGIN) / inkN), gain = num('drawwidthgain', copyingNib ? .95 : GAIN), minNib = num('drawwidthmin', 0.3 / inkN);
  if (num('drawinghand', 0) > 0) {
    const handScale=w/1080*152.4/num('sheetmm',152.4);
    const r = handDrawing(lines, { gap: num('drawjoingap', 4) * handScale,
      cos: num('drawjoincos', .8), aim: num('drawjoinaim', .7),
      strokeLength: num('drawstroke', .35) * Math.min(w, h),
      base, gain, margin:margin*handScale, minNib:minNib*handScale, inLen: num('drawtaperin', 3) * handScale,
      outLen: num('drawtaperout', 5) * handScale, start: num('drawtaperstart', .45), end: num('drawtaperend', .3),
      detailScale: num('drawdetailscale', 1), D, w, h, lit: num('drawlit', 0), reach: num('drawlitreach', 2) * handScale });
    log(`drawing hand: ${lines.length} reviewed lines, ${r.joined} joins, ${r.gestures} ordered gestures, ${r.runs} light-edge runs, ${r.strokes.length} tapered strokes`);
    // --inkhand 1: the hand's speed along each stroke (slower on curves, which lays a wider, darker line, faster on straights)
    // without a second taper or a blot at the nib's first touch: the gestures are already tapered
    if (num('inkhand', 0) > 0) return r.strokes.map(g => inkHand(g, { base, inLen: 0, outLen: 0, dwell: 0 }));
    return r.strokes;
  }
  const perPoint = q => (q.width == null && q.weight == null ? q : {
    x: q.x, y: q.y,
    ...(q.width == null ? {} : { nw: Math.max(minNib, q.width * gain - margin) }),
    ...(q.weight == null ? {} : { s: base * Math.max(0, Math.min(1, q.weight)) }),
  });
  const measured = lines.some(g => g.points.some(q => q.width != null || q.weight != null));
  if (measured) log(`drawing: per-point widths and darkness from the file, contact = width x ${gain} - ${margin} cells, pressure share = ${base} x darkness`);
  let strokes = lines.flatMap(strokesOf).map(g => (measured ? { ...g, points: g.points.map(perPoint) } : g));
  // --inkhand 1 (ink only): each stroke as a hand draws it (inkHand)
  if (num('inkhand', 0) > 0 && !/graphite/.test(opt('outlinemedium', 'graphite'))) { strokes = strokes.map(g => inkHand(g, { base })); log(`drawing: ${strokes.length} strokes set down, tapered and slowed on curves (--inkhand)`); }
  // --finishmasses 1 (plan finishInk.masses "scribble"): the closing pen also states the dark masses of the plan-time
  // source density as looping scribble with the lights left open (drawing-scribble.mjs), for black or curly coats and
  // dark hair. Off by default: a dark surface is paint's job, not the pen's.
  if (!first && num('finishmasses', 0) > 0 && D) {
    const masses = scribbleMasses(D, w, h, gaussian, { K, dark: num('scribbledark', 0.06), minMass: num('scribblemass', 0.002), loop: num('scribbleloop', 0.008), hole: num('scribblehole', 0.35), seed: 11 });
    const scribbles = masses.flatMap(g => personStrokes(g, num('scribblestrokes', 0.12) * Math.min(w, h), { dipFirst: true, load: 0.6, low: 0.05 })).map(g => ({ ...g, tier: 1, weight: num('finishmassweight', 0.6) }));
    log(`drawing, closing pen: ${masses.length} dark masses as scribble in ${scribbles.length} strokes (--finishmasses)`);
    return [...strokes, ...scribbles];
  }
  return strokes;
}

const ease = u => u * u * (3 - 2 * u);
/**
 * A stroke as a hand draws it with a dip pen, in the pen's own terms (src/media/pen.mjs): the nib sets down and holds
 * a moment, so the first drop pools into a small blot (`dwell`); pressure and width rise over the first `inLen` cells
 * and fall over the last `outLen`; the hand slows on curves, and a slow nib lays a wider, darker line by capillary
 * pull, while a long straight run is drawn faster and finer. Speed `v` runs from 1.9 - 1.1 x share, as draw.mjs sets
 * it, scaled by the curve. Points keep their positions.
 */
export function inkHand(g, { base = 0.6, inLen = 3, outLen = 5, start = 0.35, end = 0.25, dwell = 0.5, slow = 0.45, fast = 1.15, turnSpan = 2 } = {}) {
  const P = g.points, n = P.length, d = [0];
  for (let k = 1; k < n; k++) d.push(d[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  const L = d[n - 1] || 1, tin = Math.min(inLen, 0.3 * L), tout = Math.min(outLen, 0.35 * L);
  const env = t => Math.min(tin > 0 && t < tin ? start + (1 - start) * ease(t / tin) : 1, tout > 0 && L - t < tout ? end + (1 - end) * ease((L - t) / tout) : 1);
  // turning at a point, over about turnSpan cells each way: 0 straight, 1 a right angle or more
  const turn = k => {
    let a = k, b = k;
    while (a > 0 && d[k] - d[a] < turnSpan) a--;
    while (b < n - 1 && d[b] - d[k] < turnSpan) b++;
    if (a === k || b === k) return 0;
    const ux = P[k].x - P[a].x, uy = P[k].y - P[a].y, vx = P[b].x - P[k].x, vy = P[b].y - P[k].y;
    const c = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    return Math.min(1, Math.acos(Math.max(-1, Math.min(1, c))) / (Math.PI / 2));
  };
  const points = P.map((q, k) => {
    const e = env(d[k]), share = (q.s ?? base * (g.weight ?? 1)) * e, c = turn(k);
    const out = { ...q, s: share, v: (1.9 - 1.1 * Math.min(1, share)) * (c > 0.05 ? 1 - slow * c : fast) };
    if (q.nw != null) out.nw = q.nw * (0.6 + 0.4 * e);
    if (k === 0) out.dwell = dwell;
    return out;
  });
  return { ...g, points };
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
