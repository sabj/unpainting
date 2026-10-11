// Linked linework stages from one line set (the plan's drawing.stages):
//
//   prep       a light pencil placement: the big structural lines of the set, ranked (big shapes, features, detail)
//   prepInk    ink mostly over the pencil, with small deviations: the pen refines each line (a slight smoothing, a small
//              sideways drift, a start a little late or an end a little past), drops some pencil lines, which stay
//              visible as pencil, and adds a few lines the pencil left out
//   finishInk  closing accents after the washes: a share of the earlier stage's lines, chosen on the target's edges or
//              darks at plan time, restated where they are strongest (or whole, for the architecture method)
//
// Every choice is made here, before the first mark, from the line file and the target's density at plan time. DOM free,
// no file IO, deterministic: the same set and options give the same stages.

export const STAGE_NAMES = Object.freeze(['prep', 'prepInk', 'finishInk']);
export const PREP_INK_FROM = Object.freeze(['prep', 'lines']);
export const FINISH_FROM = Object.freeze(['prepInk', 'prep', 'lines']);
export const FINISH_SELECT = Object.freeze(['edges', 'darks', 'both']);
export const FINISH_METHODS = Object.freeze(['accent', 'architecture']);

export const STAGE_DEFAULTS = Object.freeze({
  prep: Object.freeze({ amount: 0.5 }),
  prepInk: Object.freeze({ keep: 0.8, add: 0.15, amount: 1, deviate: 0.25 }),
  finishInk: Object.freeze({ restate: 0.3, select: 'both', method: 'accent', deviate: 0.5 }),
});

// The role a line file gives a line, as a placement priority: a pencil sketch states structure first.
const ROLE_GAIN = { structure: 1.5, silhouette: 1.5, subject: 1.2, opening: 1, setting: 0.9, ornament: 0.5, strand: 0.6, 'dark fill': 0.3, hatch: 0.3 };

const hash = i => { let s = (Math.imul(i + 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0; s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };

export function polyLength(points) {
  let L = 0;
  for (let k = 1; k < points.length; k++) L += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return L;
}

/** A sampler of a plan-time field (the target's density), in source pixels: mean along a line, or per point. */
export function fieldSampler(F, fw, fh, imageW, imageH) {
  if (!F) return null;
  const sx = fw / imageW, sy = fh / imageH;
  return ([x, y]) => F[Math.min(fh - 1, Math.max(0, Math.round(y * sy))) * fw + Math.min(fw - 1, Math.max(0, Math.round(x * sx)))];
}

/** Gradient magnitude of a field (central differences), for the edge selection. */
export function edgeField(F, w, h) {
  const E = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    E[i] = Math.hypot(F[i + 1] - F[i - 1], F[i + w] - F[i - w]) / 2;
  }
  return E;
}

const mean = (pts, at) => (at ? pts.reduce((a, p) => a + at(p), 0) / Math.max(1, pts.length) : 0);

/** A line's placement score: length, its own weight and strength, its role, and how dark and edged it sits. */
export function placementScore(g, { dark = null, edge = null } = {}) {
  const L = g.length ?? polyLength(g.points);
  const role = ROLE_GAIN[g.role] ?? 1;
  const weight = Number.isFinite(g.weight) ? g.weight : 1, strength = Number.isFinite(g.strength) ? g.strength : 0.5;
  const evidence = 0.5 + Math.min(1, strength) + 0.5 * Math.min(1, mean(g.points, dark)) + Math.min(1, 4 * mean(g.points, edge));
  return L * role * weight * evidence;
}

// Strongest first by `score`, ties by file order.
const ranked = (lines, score) => lines.map((g, i) => ({ g, i, s: score(g, i) })).sort((a, b) => b.s - a.s || a.i - b.i);

/** The highest-scoring lines until `share` of the set's total length is taken (at least one line when any exist). */
export function takeLength(lines, share, score) {
  if (!(share > 0)) return [];
  const total = lines.reduce((a, g) => a + (g.length ?? polyLength(g.points)), 0);
  const out = [];
  let used = 0;
  for (const r of ranked(lines, score)) {
    if (out.length && used >= share * total) break;
    out.push(r);
    used += r.g.length ?? polyLength(r.g.points);
  }
  return out;
}

// Linear interpolation of a per-point array at fractional index t.
const lerpAt = (arr, t) => { const a = Math.floor(t), b = Math.min(arr.length - 1, a + 1); return arr[a] + (arr[b] - arr[a]) * (t - a); };

/**
 * Resample a line to `step` spacing, keeping its per-point widths and weights. Returns { points, widths?, weights? }.
 */
export function resampleLine(g, step) {
  const P = g.points, cum = [0];
  for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const L = cum.at(-1), m = Math.max(1, Math.round(L / Math.max(1e-6, step)));
  const out = { points: [] };
  if (g.widths) out.widths = [];
  if (g.weights) out.weights = [];
  let k = 1;
  for (let j = 0; j <= m; j++) {
    const d = (L * j) / m;
    while (k < P.length - 1 && cum[k] < d) k++;
    const seg = cum[k] - cum[k - 1], u = seg > 0 ? (d - cum[k - 1]) / seg : 0, t = k - 1 + Math.max(0, Math.min(1, u));
    out.points.push([P[k - 1][0] + (P[k][0] - P[k - 1][0]) * Math.max(0, Math.min(1, u)), P[k - 1][1] + (P[k][1] - P[k - 1][1]) * Math.max(0, Math.min(1, u))]);
    if (g.widths) out.widths.push(lerpAt(g.widths, t));
    if (g.weights) out.weights.push(lerpAt(g.weights, t));
  }
  return out;
}

const straightness = P => { const L = polyLength(P); return L > 0 ? Math.hypot(P.at(-1)[0] - P[0][0], P.at(-1)[1] - P[0][1]) / L : 1; };

/**
 * The pen's version of a line it follows: a light smoothing, a small sideways drift that varies slowly along it, a start
 * a little late and, on a straight line, an end a little past (an overshoot), or on a curve a little short. `scale` is
 * the drift's size in source pixels; `seed` makes it repeatable. Widths and weights follow their points.
 */
export function deviateLine(g, { scale, seed, step }) {
  if (!(scale > 0)) return { ...g };
  const r = resampleLine(g, step), P = r.points, n = P.length;
  if (n < 3) return { ...g, ...r };
  // smoothing: a three-point mean, the ends fixed
  const S = P.map((p, k) => (k === 0 || k === n - 1 ? p : [(P[k - 1][0] + 2 * p[0] + P[k + 1][0]) / 4, (P[k - 1][1] + 2 * p[1] + P[k + 1][1]) / 4]));
  const L = polyLength(S), ph = 2 * Math.PI * hash(seed), freq = 0.6 + 1.2 * hash(seed + 7), bias = 2 * hash(seed + 13) - 1;
  const D = S.map((p, k) => {
    const a = S[Math.max(0, k - 1)], b = S[Math.min(n - 1, k + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    const t = k / (n - 1), off = scale * (0.6 * Math.sin(2 * Math.PI * freq * t + ph) + 0.4 * bias) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85));
    return [p[0] - (ty / tl) * off, p[1] + (tx / tl) * off];
  });
  // ends: a late start (0 to 4% of the length) and an overshoot (straight) or a short stop (curved), 0 to 3%
  const straight = straightness(S) > 0.97;
  const late = Math.floor(Math.min(scale, 0.04 * L) * hash(seed + 21) / Math.max(1e-6, L) * (n - 1));
  let pts = D.slice(late), widths = r.widths?.slice(late), weights = r.weights?.slice(late);
  const endShare = Math.min(scale / Math.max(1e-6, L), 0.03) * hash(seed + 29);
  if (straight && pts.length >= 2) {
    const a = pts.at(-2), b = pts.at(-1), dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ext = endShare * L;
    pts = [...pts, [b[0] + (b[0] - a[0]) / dl * ext, b[1] + (b[1] - a[1]) / dl * ext]];
    if (widths) widths = [...widths, widths.at(-1)];
    if (weights) weights = [...weights, weights.at(-1)];
  } else {
    const cut = Math.floor(endShare * pts.length);
    if (cut > 0 && pts.length - cut >= 2) { pts = pts.slice(0, -cut); widths = widths?.slice(0, -cut); weights = weights?.slice(0, -cut); }
  }
  const out = { ...g, points: pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]), length: +polyLength(pts).toFixed(2) };
  if (widths) out.widths = widths.map(v => +v.toFixed(3)); else delete out.widths;
  if (weights) out.weights = weights.map(v => +v.toFixed(3)); else delete out.weights;
  return out;
}

/** The part of a line where `at` is at least its own median there, as runs of at least `minLen` source pixels. */
export function strongRuns(g, at, { minLen, step }) {
  const r = resampleLine(g, step), vals = r.points.map(at), sorted = [...vals].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const runs = [];
  let cur = null;
  const close = () => { if (cur && cur.points.length >= 2 && polyLength(cur.points) >= minLen) runs.push(cur); cur = null; };
  r.points.forEach((p, k) => {
    if (vals[k] >= med) {
      cur ??= { ...g, points: [], ...(r.widths ? { widths: [] } : {}), ...(r.weights ? { weights: [] } : {}) };
      cur.points.push(p);
      if (r.widths) cur.widths.push(r.widths[k]);
      if (r.weights) cur.weights.push(r.weights[k]);
    } else close();
  });
  close();
  return runs.map(q => ({ ...q, length: polyLength(q.points) }));
}

// Pencil passes by rank: 1 big shapes, 2 features, 3 detail (pencil-stage.mjs passOf).
const passRanks = (n, k) => (k < Math.ceil(0.4 * n) ? 1 : k < Math.ceil(0.75 * n) ? 2 : 3);

/**
 * The three stages from one line set.
 *
 * @param lines   the line file's lines, points in source pixels ([x, y]), with optional widths, weights, weight, strength,
 *                role and length
 * @param image   { w, h } of the line file's source
 * @param stages  { prep?, prepInk?, finishInk? }: each present stage's options (see STAGE_DEFAULTS); a stage left out
 *                is not drawn. `from` names the earlier stage a stage is drawn from ("lines" is the whole set).
 * @param density optional { D, w, h }: the target's density at plan time, for the darks and edges
 * @returns { prep, prepInk, finishInk, summary } with each stage's lines (or null), in drawing order
 */
export function planStages(lines, { image, stages, density = null }) {
  const short = Math.min(image.w, image.h);
  const D = density?.D ?? null;
  const dark = D ? fieldSampler(D, density.w, density.h, image.w, image.h) : null;
  const E = D ? edgeField(D, density.w, density.h) : null;
  const edge = E ? fieldSampler(E, density.w, density.h, image.w, image.h) : null;
  const set = lines.filter(g => g.points?.length >= 2).map((g, index) => ({ ...g, index, length: g.length ?? polyLength(g.points) }));
  const score = g => placementScore(g, { dark, edge });
  const step = Math.max(1, 0.004 * short), summary = {};
  const out = { prep: null, prepInk: null, finishInk: null };

  if (stages.prep) {
    const o = { ...STAGE_DEFAULTS.prep, ...stages.prep };
    const picked = takeLength(set, o.amount, score);
    out.prep = picked.map((r, k) => ({ ...r.g, rank: passRanks(picked.length, k) })).sort((a, b) => a.rank - b.rank || b.length - a.length);
    summary.prep = { lines: out.prep.length, of: set.length, amount: o.amount };
  }

  if (stages.prepInk) {
    const o = { ...STAGE_DEFAULTS.prepInk, ...stages.prepInk };
    const from = o.from ?? (out.prep ? 'prep' : 'lines');
    if (from === 'prep' && !out.prep) throw new Error('drawing.stages.prepInk.from "prep" needs a prep stage');
    let base;
    let added = [];
    if (from === 'prep') {
      // keep the strongest `keep` of the pencil lines, the rank jittered so the pen does not ink in a strict score order
      const order = ranked(out.prep, g => score(g) * (0.75 + 0.5 * hash(g.index + 101)));
      base = order.slice(0, Math.round(o.keep * order.length)).map(r => r.g);
      const inPrep = new Set(out.prep.map(g => g.index));
      // a few lines the pencil left out: the strongest of the rest by evidence per length, so features before long setting lines
      const rest = set.filter(g => !inPrep.has(g.index));
      const n = Math.round(o.add * base.length);
      added = ranked(rest, g => score(g) / Math.sqrt(Math.max(1, g.length))).slice(0, n).map(r => ({ ...r.g, added: true }));
    } else base = takeLength(set, o.amount, score).map(r => r.g);
    const scale = (stages.prepInk.deviate ?? (from === 'lines' ? 0 : o.deviate)) * 0.0025 * short;
    out.prepInk = [...base, ...added].map(g => ({ ...deviateLine(g, { scale, seed: g.index * 3 + 1, step }), rank: g.rank ?? 1 }));
    summary.prepInk = { from, lines: out.prepInk.length, kept: base.length, added: added.length, dropped: from === 'prep' ? out.prep.length - base.length : 0, drift: +scale.toFixed(2) };
  }

  if (stages.finishInk) {
    const o = { ...STAGE_DEFAULTS.finishInk, ...stages.finishInk };
    const from = o.from ?? (out.prepInk ? 'prepInk' : out.prep ? 'prep' : 'lines');
    const pool = from === 'prepInk' ? out.prepInk : from === 'prep' ? out.prep : set;
    if (!pool) throw new Error(`drawing.stages.finishInk.from "${from}" needs a ${from} stage`);
    const at = o.select === 'darks' ? dark : o.select === 'edges' ? edge : (dark && edge ? p => 0.5 * Math.min(1, dark(p)) + 2 * Math.min(0.5, edge(p)) : dark ?? edge);
    const sel = g => (at ? mean(resampleLine(g, step).points, at) : 1) * Math.sqrt(g.length ?? polyLength(g.points)) * (Number.isFinite(g.weight) ? g.weight : 1);
    const picked = ranked(pool, sel).slice(0, o.restate > 0 ? Math.max(pool.length ? 1 : 0, Math.round(o.restate * pool.length)) : 0).map(r => r.g);
    const architecture = o.method === 'architecture';
    // an accent restates the strong part of each line; the architecture method restates the whole line, its width set
    // by how dark the target is along it (1.6 to 4 source pixels, the Y1 closing pen)
    // a line with no strong run long enough to read as a stroke is restated whole
    const pieces = architecture || !at ? picked : picked.flatMap(g => { const runs = strongRuns(g, at, { minLen: 0.008 * short, step }); return runs.length ? runs : [g]; });
    const scale = o.deviate * 0.0025 * short;
    out.finishInk = pieces.map((g, k) => {
      const d = deviateLine(g, { scale, seed: (g.index ?? k) * 3 + 2, step });
      if (architecture && dark) d.widths = d.points.map(p => +(1.6 + 2.4 * Math.min(1, dark(p) / 1.2)).toFixed(3));
      return { ...d, rank: 1 };
    });
    summary.finishInk = { from, select: o.select, method: o.method, lines: out.finishInk.length, restated: picked.length, of: pool.length };
  }
  return { ...out, summary };
}

/** A stage's lines as a line file document (tools/seg/ink-lines.mjs's format), points in source pixels. */
export function stageDoc(lines, { image, stage, source }) {
  return {
    source: `${stage} stage of ${source} (src/paint/methods/drawing-stages.mjs)`,
    image: { w: image.w, h: image.h },
    lines: lines.map(({ index, added, ...g }) => ({ ...g, ...(added ? { added: true } : {}) })),
  };
}
