// Pipeline: inking, stage 3b (what of a traced drawing is laid). DOM free, no file IO.
// Each stroke's contribution: the drawing's ink (darkness x area, at the stroke's own width and weight) it
// accounts for that the strokes ranked above it do not already cover, times a structure term (long, connected, on an
// outline), so a thin defining contour outranks a fat scribble and a crumb isolated from every form ranks last. Ranking is
// greedy in two passes: by own ink x structure, then by the ink left after the strokes above. What is laid is everything
// above a contribution threshold (the marks a hand would not make, model jitter, specks and stray ticks, fall under it),
// and each object keeps its form whatever its strokes' rank. The ranking decides what is laid, never when.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lengthOf = P => P.reduce((s, q, k) => (k ? s + dist(P[k - 1], q) : 0), 0);

/** Samples along a path every `step` with the width there (`widths` per point, else `width`). */
function along(P, widths, width, step) {
  const out = [];
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], d = dist(a, b), n = Math.max(1, Math.ceil(d / step));
    const wa = widths ? widths[k - 1] : width, wb = widths ? widths[k] : width;
    for (let i = k === 1 ? 0 : 1; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, wa + (wb - wa) * t]); }
  }
  if (P.length === 1) out.push([P[0][0], P[0][1], widths ? widths[0] : width]);
  return out;
}

/**
 * strokes: [{ points (mm), width (mm), widths? (mm per point), weight (0..1), role, len?, touches? (an end meets another line) }];
 * a stroke made of several pieces gives `paths: [{ points, width, widths? }]` instead of its own points and widths.
 * Returns { contribution: Float64Array (the ink each stroke adds over the strokes above it, mm2 x darkness, structure-weighted:
 * a mark's own size, whatever the size of the drawing), share: Float64Array (the same as a share of the drawing's ink, unweighted), rank: Int32Array
 * (0 = most), order: indices most first, total: the drawing's ink (mm2 x darkness), curve: cumulative share by rank }.
 */
export function strokeContributions(strokes, widthMm, heightMm, o = {}) {
  const cell = o.cellMm ?? 0.1, W = Math.ceil(widthMm / cell) + 1, H = Math.ceil(heightMm / cell) + 1;
  const n = strokes.length;
  // each stroke's footprint: the cells under its nib, with its darkness
  const foot = strokes.map(s => {
    const set = new Map(), wt = Math.max(0.05, Math.min(1, s.weight ?? 1));
    for (const [x, y, w] of (s.paths ?? [s]).flatMap(p => along(p.points, p.widths, p.width, cell))) {
      const r = Math.max(cell / 2, w / 2), ri = Math.ceil(r / cell), ci = Math.round(x / cell), cj = Math.round(y / cell);
      for (let j = cj - ri; j <= cj + ri; j++) for (let i = ci - ri; i <= ci + ri; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H || ((i - x / cell) ** 2 + (j - y / cell) ** 2) * cell * cell > r * r + cell * cell / 4) continue;
        set.set(j * W + i, wt);
      }
    }
    return set;
  });
  // the drawing's ink: every cell at the darkest stroke over it
  const ink = new Float32Array(W * H);
  for (const f of foot) for (const [k, v] of f) if (v > ink[k]) ink[k] = v;
  let total = 0; for (const v of ink) total += v;
  total = total || 1;
  // structure: long lines count more (up to 30 mm), an outline more, a mark touching no other line (isolated) less
  const roleW = o.roleWeight ?? { outline: 1.5, inner: 1.2, fine: 1, hatch: 0.9, texture: 0.8, small: 0.6 };
  const struct = strokes.map(s => (roleW[s.role] ?? 1) * (1 + Math.min(s.len ?? (s.paths ?? [s]).reduce((a, p) => a + lengthOf(p.points), 0), 30) / 30) * (s.touches === false ? 0.6 : 1));
  const own = foot.map(f => { let a = 0; for (const v of f.values()) a += v; return a; });
  // pass 1 by own ink, pass 2 by what is left after the strokes above
  const first = [...Array(n).keys()].sort((a, b) => own[b] * struct[b] - own[a] * struct[a]);
  const got = new Float32Array(W * H), left = new Float64Array(n);
  for (const i of first) { let a = 0; for (const [k, v] of foot[i]) { const add = Math.max(0, Math.min(v, ink[k]) - got[k]); if (add > 0) { a += add; got[k] += add; } } left[i] = a; }
  const order = [...Array(n).keys()].sort((a, b) => left[b] * struct[b] - left[a] * struct[a]);
  got.fill(0);
  const contribution = new Float64Array(n), share = new Float64Array(n), rank = new Int32Array(n), curve = new Float64Array(n);
  let cum = 0;
  order.forEach((i, r) => {
    let a = 0; for (const [k, v] of foot[i]) { const add = Math.max(0, Math.min(v, ink[k]) - got[k]); if (add > 0) { a += add; got[k] += add; } }
    cum += a; curve[r] = cum / total; rank[i] = r; share[i] = a / total; contribution[i] = a * cell * cell * struct[i];
  });
  return { contribution, share, rank, order, total: total * cell * cell, curve };
}

/** The number of strokes (in rank order) that capture each share of the drawing's ink. */
export function strokesFor(curve, shares = [0.5, 0.8, 0.9, 0.95, 0.99]) {
  return Object.fromEntries(shares.map(s => { const k = curve.findIndex(v => v >= s); return [s, k < 0 ? curve.length : k + 1]; }));
}
