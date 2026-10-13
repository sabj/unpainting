// The geometry check on an image model's sketch (tools/seg/sketch-target.mjs) before any of it reaches the paper.
// The model chooses well what an artist would draw but shifts, stretches and invents: an anchor and rigging on a
// ship, moved windows on a facade. The target's own edges (line-evidence.mjs) are the reference:
//
//   1. Registration. The sketch is scaled on each axis and moved as a whole to best lie along the target's edges,
//      searched coarse to fine (the image model frames to its own aspect ratio).
//   2. Correspondence. Each point of a line looks along its normal, up to `matchMm` each way, for a target edge
//      running the same way (within `angle` degrees). A line with too few such points is invented and dropped; a
//      long line partly matched keeps its matched runs.
//   3. Snap. A kept line moves onto its target edge by its own smoothed offset (over `smoothMm`), so the sketch's
//      choice of lines, its weights and its small hand wobble stay while their positions are the target's.
//   4. Acceptance. The sketch is used only when enough of its ink matched, little was invented, and it covers at least
//      half of the target's strongest edges (a sketch that leaves out half the structure is too thin to carry the
//      drawing); otherwise the stage falls back to its next source.
// Short unmatched marks over dark areas of the target are hatching, kept as such and not counted either way.
//
// Pure: lines are plan-grid polylines [{ points: [{x, y, width?, weight?}], ... }], evidence from edgeEvidence.

export const SKETCH_CHECK = Object.freeze({
  matchMm: 2.5, angle: 30, smoothMm: 3, invented: 0.4, partial: 0.75, gapMm: 1.5, hatchMm: 3, hatchDark: 0.45, minMm: 0.8,
  minMatched: 0.55, maxInvented: 0.3, minCoverage: 0.5, maxScale: 0.25, maxShiftShare: 0.08, minGain: 0.02, coverMm: 1.2,
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lengthOf = pts => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return L; };

// Points every `step` cells along each line, with the line's tangent.
function samples(lines, step) {
  const out = [];
  for (const g of lines) {
    const p = g.points;
    for (let k = 1; k < p.length; k++) {
      const dx = p[k].x - p[k - 1].x, dy = p[k].y - p[k - 1].y, L = Math.hypot(dx, dy);
      if (!(L > 0)) continue;
      const n = Math.max(1, Math.round(L / step));
      for (let s = 0; s < n; s++) out.push({ x: p[k - 1].x + dx * s / n, y: p[k - 1].y + dy * s / n, tx: dx / L, ty: dy / L });
    }
  }
  return out;
}

/** Distance to the nearest target edge at (x, y) and how well the tangent (tx, ty) runs along it (1 along, 0 across). */
export function supportAt(ev, x, y, tx, ty) {
  const { w, h } = ev, X = Math.round(x), Y = Math.round(y);
  if (X < 0 || Y < 0 || X >= w || Y >= h) return { d: Infinity, agree: 0 };
  const i = Y * w + X, j = ev.near[i];
  if (j < 0) return { d: Infinity, agree: 0 };
  const gx = Math.cos(ev.ori[j]), gy = Math.sin(ev.ori[j]);
  return { d: ev.dist[i], agree: Math.abs(tx * gy - ty * gx) };
}

// A blurred raster of points on a grid `f` times coarser than the plan's.
function raster(pts, w, h, f, blur) {
  const W = Math.ceil(w / f), H = Math.ceil(h / f), m = new Float32Array(W * H);
  for (const p of pts) { const X = Math.floor(p.x / f), Y = Math.floor(p.y / f); if (X >= 0 && Y >= 0 && X < W && Y < H) m[Y * W + X] += 1; }
  return { m: blur(m, W, H, 1), W, H };
}

// Normalised cross-correlation of the target's edge raster with the sketch's, the sketch scaled about the centre and
// shifted (in plan cells). Normalised, so shrinking the sketch onto a busy patch of the target does not win.
function ncc(T, S, f, cx, cy, sx, sy, dx, dy) {
  const { W, H } = T; let st = 0, ss = 0, stt = 0, sss = 0, sts = 0, n = 0;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    // the sketch cell that lands on this target cell
    const x = ((X + 0.5) * f - dx - cx) / sx + cx, y = ((Y + 0.5) * f - dy - cy) / sy + cy;
    const u = x / f - 0.5, v = y / f - 0.5, u0 = Math.floor(u), v0 = Math.floor(v);
    let s = 0;
    if (u0 >= 0 && v0 >= 0 && u0 + 1 < S.W && v0 + 1 < S.H) {
      const a = u - u0, b = v - v0, i = v0 * S.W + u0;
      s = (1 - a) * (1 - b) * S.m[i] + a * (1 - b) * S.m[i + 1] + (1 - a) * b * S.m[i + S.W] + a * b * S.m[i + S.W + 1];
    }
    const t = T.m[Y * W + X]; st += t; ss += s; stt += t * t; sss += s * s; sts += t * s; n++;
  }
  const cov = sts / n - (st / n) * (ss / n), vt = stt / n - (st / n) ** 2, vs = sss / n - (ss / n) ** 2;
  return vt > 0 && vs > 0 ? cov / Math.sqrt(vt * vs) : 0;
}

/**
 * The best whole-sketch scale per axis and shift against the target's edges: normalised cross-correlation of blurred
 * edge rasters, coarse to fine. `blur` is (F, w, h, sigma) => F.
 */
export function registerSketch(lines, ev, { blur, maxScale = SKETCH_CHECK.maxScale, maxShift, sampleStep = 1 } = {}) {
  const { w, h, edge, mag } = ev, strong = [];
  for (let i = 0; i < edge.length; i++) if (edge[i]) strong.push(mag[i]);
  strong.sort((a, b) => a - b);
  const cut = strong[Math.floor(strong.length / 2)] ?? 0, tp = [];
  for (let i = 0; i < edge.length; i++) if (edge[i] && mag[i] >= cut) tp.push({ x: i % w + 0.5, y: Math.floor(i / w) + 0.5 });
  const sp = samples(lines, sampleStep), cx = w / 2, cy = h / 2;
  const level = f => ({ f, T: raster(tp, w, h, f, blur), S: raster(sp, w, h, f, blur) });
  const coarse = level(6), fine = level(3);
  const identity = ncc(fine.T, fine.S, 3, cx, cy, 1, 1, 0, 0);
  let best = { sx: 1, sy: 1, dx: 0, dy: 0, score: -Infinity };
  const search = (L, sStep, sSpan, tStep, tSpan) => {
    const from = { ...best.score > -Infinity ? best : { sx: 1, sy: 1, dx: 0, dy: 0 } };
    best = { ...from, score: ncc(L.T, L.S, L.f, cx, cy, from.sx, from.sy, from.dx, from.dy) };
    for (let sx = from.sx - sSpan; sx <= from.sx + sSpan + 1e-9; sx += sStep) for (let sy = from.sy - sSpan; sy <= from.sy + sSpan + 1e-9; sy += sStep) {
      if (Math.abs(sx - 1) > maxScale + 1e-9 || Math.abs(sy - 1) > maxScale + 1e-9) continue;
      for (let dx = from.dx - tSpan; dx <= from.dx + tSpan + 1e-9; dx += tStep) for (let dy = from.dy - tSpan; dy <= from.dy + tSpan + 1e-9; dy += tStep) {
        if (Math.hypot(dx, dy) > maxShift) continue;
        const score = ncc(L.T, L.S, L.f, cx, cy, sx, sy, dx, dy);
        if (score > best.score) best = { sx, sy, dx, dy, score };
      }
    }
  };
  search(coarse, 0.05, maxScale, 6, maxShift);
  search(fine, 0.0125, 0.05, 3, 6);
  search(fine, 0.005, 0.0125, 1, 3);
  return { ...best, identity, cx, cy };
}

// Along the normal of a point, the nearest target edge cell (either side, up to `reach` cells) that runs with the
// tangent; returns the signed offset or null.
function matchAlongNormal(ev, x, y, tx, ty, reach, cosA) {
  const nx = -ty, ny = tx, { w, h, edge, ori } = ev;
  for (let r = 0; r <= reach; r += 0.5) for (const sgn of r ? [1, -1] : [1]) {
    const X = Math.round(x + sgn * r * nx), Y = Math.round(y + sgn * r * ny);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X; if (!edge[i]) continue;
    const gx = Math.cos(ori[i]), gy = Math.sin(ori[i]);
    if (Math.abs(tx * gy - ty * gx) >= cosA) return sgn * r;
  }
  return null;
}

/**
 * Check, register and snap an image model's sketch. `ev` from edgeEvidence on the same grid, `dark` an optional
 * w*h darkness 0..1 (1 black) of the target for the hatching rule, `mmPerCell` the sheet scale.
 * @returns { accepted, lines, why, stats, transform }
 */
export function checkSketch(lines, ev, { mmPerCell, blur, dark = null, options = {} } = {}) {
  const o = { ...SKETCH_CHECK, ...options }, cells = mm => mm / mmPerCell, reach = cells(o.matchMm), cosA = Math.cos(o.angle * Math.PI / 180);
  const reg = registerSketch(lines, ev, { blur, maxScale: o.maxScale, maxShift: o.maxShiftShare * Math.max(ev.w, ev.h) });
  // move the sketch only when that clearly helps; a near tie keeps it where the model put it
  const t = reg.score >= reg.identity + o.minGain ? reg : { ...reg, sx: 1, sy: 1, dx: 0, dy: 0 };
  const move = q => ({ ...q, x: reg.cx + t.sx * (q.x - reg.cx) + t.dx, y: reg.cy + t.sy * (q.y - reg.cy) + t.dy });
  const darkAt = q => (dark ? dark[clamp(Math.round(q.y), 0, ev.h - 1) * ev.w + clamp(Math.round(q.x), 0, ev.w - 1)] : 0);
  const stats = { lines: lines.length, inkMm: 0, matchedMm: 0, inventedMm: 0, inventedLines: 0, hatchLines: 0, hatchMm: 0, partialLines: 0, snapMm: 0, coverage: 0 };
  const out = [], half = Math.max(1, Math.round(cells(o.smoothMm) / 2));
  for (const g0 of lines) {
    const p = g0.points.map(move), L = lengthOf(p); if (!(L > 0)) continue;
    const mm = L * mmPerCell;
    if (mm < o.minMm) continue;
    const off = p.map((q, k) => {
      const a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tx = (b.x - a.x) / d, ty = (b.y - a.y) / d, m = matchAlongNormal(ev, q.x, q.y, tx, ty, reach, cosA);
      return m == null ? null : { m, nx: -ty, ny: tx };
    });
    const share = off.filter(Boolean).length / off.length;
    if (share < o.invented) {
      if (mm < o.hatchMm && darkAt(p[Math.floor(p.length / 2)]) >= o.hatchDark) { out.push({ ...g0, points: p, role: 'hatch', sketch: 'hatch' }); stats.hatchLines++; stats.hatchMm += mm; continue; }
      stats.inkMm += mm; stats.inventedMm += mm; stats.inventedLines++; continue;
    }
    stats.inkMm += mm;
    // snap: the matched offsets, smoothed along the line (unmatched points borrow their neighbours'), moved along the normal
    const snapped = p.map((q, k) => {
      let sx = 0, sy = 0, c = 0;
      for (let j = Math.max(0, k - half); j <= Math.min(p.length - 1, k + half); j++) if (off[j]) { sx += off[j].m * off[j].nx; sy += off[j].m * off[j].ny; c++; }
      return c ? { ...q, x: q.x + sx / c, y: q.y + sy / c } : q;
    });
    for (let k = 0; k < p.length; k++) stats.snapMm += Math.hypot(snapped[k].x - p[k].x, snapped[k].y - p[k].y) * mmPerCell / p.length;
    if (share >= o.partial) { out.push({ ...g0, points: snapped, sketch: 'matched' }); stats.matchedMm += mm; continue; }
    // partly matched: keep the matched runs, bridging unmatched gaps up to gapMm
    let run = [], gap = [], keptMm = 0;
    const flush = () => { if (run.length >= 2 && lengthOf(run) * mmPerCell >= o.minMm) { out.push({ ...g0, points: run, sketch: 'partial' }); keptMm += lengthOf(run) * mmPerCell; } run = []; };
    snapped.forEach((q, k) => {
      if (off[k]) { if (gap.length && run.length && lengthOf([run.at(-1), ...gap, q]) * mmPerCell <= o.gapMm) run.push(...gap); else if (gap.length) flush(); gap = []; run.push(q); }
      else gap.push(q);
    });
    flush(); stats.partialLines++;
    stats.matchedMm += keptMm; stats.inventedMm += Math.max(0, mm - keptMm);
  }
  // coverage: the share of the target's strongest edge cells (top fifth by strength) a kept line passes near
  const { mag, edge } = ev, strong = [];
  for (let i = 0; i < edge.length; i++) if (edge[i]) strong.push(mag[i]);
  strong.sort((a, b) => b - a);
  const cut = strong[Math.floor(strong.length * 0.2)] ?? Infinity, near = new Uint8Array(ev.w * ev.h), r = cells(o.coverMm), R = Math.ceil(r);
  for (const g of out) if (g.sketch !== 'hatch') for (const q of g.points) {
    const X = Math.round(q.x), Y = Math.round(q.y);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < ev.w && y < ev.h && dx * dx + dy * dy <= r * r) near[y * ev.w + x] = 1; }
  }
  let nStrong = 0, hit = 0;
  for (let i = 0; i < edge.length; i++) if (edge[i] && mag[i] >= cut) { nStrong++; if (near[i]) hit++; }
  stats.coverage = nStrong ? hit / nStrong : 0;
  const matched = stats.inkMm ? stats.matchedMm / stats.inkMm : 0, invented = stats.inkMm ? stats.inventedMm / stats.inkMm : 1;
  stats.snapMm = out.length ? stats.snapMm / Math.max(1, out.length) : 0;
  const why = [];
  if (matched < o.minMatched) why.push(`only ${(100 * matched).toFixed(0)}% of the sketch's ink matches the target's edges (needs ${100 * o.minMatched}%)`);
  if (invented > o.maxInvented) why.push(`${(100 * invented).toFixed(0)}% of its ink has no edge in the target (allows ${100 * o.maxInvented}%)`);
  if (stats.coverage < o.minCoverage) why.push(`it covers ${(100 * stats.coverage).toFixed(0)}% of the target's strongest edges (needs ${100 * o.minCoverage}%)`);
  const round = v => +v.toFixed(3);
  return {
    accepted: why.length === 0, lines: out, why,
    stats: Object.fromEntries(Object.entries({ ...stats, matched, invented }).map(([k, v]) => [k, Number.isInteger(v) ? v : round(v)])),
    transform: { sx: round(t.sx), sy: round(t.sy), dx: round(t.dx), dy: round(t.dy), score: round(reg.score), identity: round(reg.identity) },
  };
}
