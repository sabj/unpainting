// For faces: the small-brush and pen detail once the washes are dry (--facedetail 1, off by default). Eyes, lids, nostrils
// and mouth are found as the strongest thin dark ridges (1 to 3 mm) inside the figure mask, then walked as short lines,
// dabbed as flecks at isolated peaks, or filled as small dark blobs. Tens of marks, not thousands.
import { lineField } from '../../media/draw.mjs';
import { planGestures } from '../../crop/gestures.mjs';
import { gaussian } from '../../keyframes/density.mjs';

const quantile = (vals, q) => { const v = Array.from(vals).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 0; };

/**
 * @param src      density plane of the reference (0 paper, larger darker), w x h cells
 * @param subject  Uint8Array figure mask or null
 * @param o        { K, sigma (cells multiplier of the ridge scales), q (share of the face's ridge cells that are kept out),
 *                   lines (most walked gestures), flecks (most dabs), margin (cells kept off the mask edge), seed, log }
 * @returns { field, lines, flecks } gestures in cells, field the ridge strength scaled so its 95th percentile is 1
 */
export function faceDetail(src, w, h, subject, { K = 1, sigma = 1, q = 0.9, lines = 60, flecks = 30, margin = 3, tile = 0, absfloor = 0.25, maxLen = 0, lineNear = null, rgb = null, blobs = 0, blobq = 0.97, blobmax = 40, seed = 0, log = () => {} } = {}) {
  const n = w * h;
  const raw = lineField(src, src, w, h, { sigmas: [1.0, 1.5, 2.2].map(v => v * K * sigma) });
  // inside the figure, off its silhouette edge (the pen already states the silhouette), not on the sheet's border
  const inside = new Uint8Array(n);
  const mx = Math.round(0.04 * w), my = Math.round(0.04 * h);
  for (let i = 0; i < n; i++) inside[i] = (!subject || subject[i]) && (i % w) >= mx && ((i / w) | 0) >= my && (i % w) < w - mx && ((i / w) | 0) < h - my ? 1 : 0;
  if (subject && margin > 0) {
    // distance to the mask edge by a few dilations of its complement
    let out = Uint8Array.from(inside, v => 1 - v);
    for (let r = 0; r < Math.round(margin * K); r++) {
      const next = Uint8Array.from(out);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!out[i] && (out[i - 1] || out[i + 1] || out[i - w] || out[i + w])) next[i] = 1; }
      out = next;
    }
    for (let i = 0; i < n; i++) inside[i] = out[i] ? 0 : 1;
  }
  const F = new Float32Array(n), vals = [];
  for (let i = 0; i < n; i++) { F[i] = inside[i] ? raw[i] : 0; if (F[i] > 0) vals.push(F[i]); }
  const p95 = quantile(vals, 0.95) || 1;
  for (let i = 0; i < n; i++) F[i] /= p95;
  let floor = quantile(vals.map(v => v / p95), q);
  // tiles: with tile > 0 the share is kept tile by tile (tile x K cells, at least 8), so the eyes, the nose and the
  // mouth each get their strongest marks rather than a glasses frame taking them all; a tile's marks are scaled to that
  // tile's own strongest ridge. Ridges under absfloor are noise.
  if (tile > 0) {
    const T = Math.max(8, Math.round(tile * K)), G = new Float32Array(n), P = new Float32Array(n).fill(1);
    for (let y0 = 0; y0 < h; y0 += T) for (let x0 = 0; x0 < w; x0 += T) {
      const v = [];
      for (let y = y0; y < Math.min(h, y0 + T); y++) for (let x = x0; x < Math.min(w, x0 + T); x++) if (F[y * w + x] > 0) v.push(F[y * w + x]);
      if (v.length < T) continue;
      const fl = Math.max(absfloor, quantile(v, q)), top = Math.max(1e-3, quantile(v, 0.97));
      for (let y = y0; y < Math.min(h, y0 + T); y++) for (let x = x0; x < Math.min(w, x0 + T); x++) { const i = y * w + x; if (F[i] >= fl) { G[i] = Math.min(1.2, F[i] / top); } }
    }
    for (let i = 0; i < n; i++) F[i] = G[i] * P[i];
    floor = 0.01;
  }
  log(`face detail: ${vals.length} ridge cells inside the figure, floor ${floor.toFixed(2)} (keeps the strongest ${(100 * (1 - q)).toFixed(0)}%${tile > 0 ? ` of each ${tile}-cell tile` : ''})`);
  const found = planGestures(F, w, h, { scales: [0], seed: 53 + seed, floor, keep: lines, claimRadius: Math.max(1, 1.5 * K), reachShare: 0.2, turn: 0.85, carry: 2 * K, minLength: Math.max(3, Math.round(4 * K)), tries: 2000 });
  // a mark of the face is short: a long one is a hair edge or the jaw, which the pen has already drawn
  if (maxLen > 0) {
    const len = g => { let s = 0; for (let k = 1; k < g.points.length; k++) s += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); return s; };
    // a short mark (a lid, a nostril, a gap between teeth) is kept wherever the reference has it; a long one is kept only
    // where the reference itself has a pen line (lineNear: the separator's ink, dilated), like a glasses frame
    const onLine = g => { let c = 0; for (const q of g.points) { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); c += lineNear && lineNear[y * w + x] ? 1 : 0; } return c >= 0.6 * g.points.length; };
    const before = found.gestures.length;
    found.gestures = found.gestures.filter(g => len(g) <= maxLen * K || onLine(g));
    log(`face detail: ${before - found.gestures.length} long walks off the reference's pen lines left off (over ${maxLen} cells)`);
  }
  const claimed = found.claimed;
  // flecks: isolated ridge peaks the walk did not claim, strongest first, kept apart from each other
  // --facedetailskin: flecks only on skin, read from the reference's colour (a few cells' mean: red at least 10 over
  // blue, green 0.5 to 0.9 of red) so a hat, a white ground and a red shirt get none
  let skin = null;
  if (rgb) {
    const mean = c => { const a = Float32Array.from({ length: n }, (_, i) => rgb[i * 3 + c]), r = Math.max(1, Math.round(3 * K)), t = new Float32Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, m = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += a[yy * w + xx]; m++; } } t[y * w + x] = s / m; }
      return t; };
    const R = mean(0), G = mean(1), B = mean(2);
    skin = Uint8Array.from({ length: n }, (_, i) => (R[i] - B[i] >= 10 && G[i] / Math.max(1, R[i]) >= 0.5 && G[i] / Math.max(1, R[i]) <= 0.9 ? 1 : 0));
  }
  const peaks = [];
  const gap = Math.max(3, Math.round(4 * K));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = F[i];
    if (v < floor * 0.8 || claimed[i] > 0 || (skin && !skin[i])) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && F[i + dy * w + dx] > v) { ok = false; break; }
    if (ok) peaks.push({ x, y, v });
  }
  peaks.sort((a, b) => b.v - a.v);
  const fl = [];
  let s = (seed * 2654435761 + 12345) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (const p of peaks) {
    if (fl.length >= flecks) break;
    if (fl.some(f => Math.hypot(f.x - p.x, f.y - p.y) < gap)) continue;
    const a = rnd() * Math.PI, d = 0.9 * K;
    fl.push({ x: p.x, y: p.y, points: [{ x: p.x - Math.cos(a) * d, y: p.y - Math.sin(a) * d }, { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d }] });
  }
  log(`face detail: ${found.gestures.length} lines, ${fl.length} flecks`);
  // blobs (--facedetailblobs): the small dark round things, an iris, a pupil, a nostril: connected cells that are much
  // darker than their 4 mm surround (difference of two blurs), small and compact, inside the figure. Each is filled
  // with row strokes of the small nib over its own cells, so a catchlight (a light cell inside) is left as paper.
  const dabs = [];
  if (blobs > 0) {
    const fine = gaussian(src, w, h, 0.7 * K), wide = gaussian(src, w, h, 3.5 * K), dog = new Float32Array(n), dv = [];
    for (let i = 0; i < n; i++) { dog[i] = inside[i] ? fine[i] - wide[i] : 0; if (dog[i] > 0) dv.push(dog[i]); }
    const thr = quantile(dv, blobq), seen = new Uint8Array(n), maxA = Math.round(blobmax * K * K), comps = [];
    for (let i0 = 0; i0 < n; i0++) {
      if (seen[i0] || dog[i0] < thr) continue;
      const cells = [], stack = [i0]; seen[i0] = 1;
      while (stack.length) { const i = stack.pop(); cells.push(i); const x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && dog[j] >= thr) { seen[j] = 1; stack.push(j); } }
      if (cells.length < 4 || cells.length > maxA) continue;
      let x0 = w, x1 = 0, y0 = h, y1 = 0, s = 0;
      for (const i of cells) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); s += dog[i]; }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.max(bw, bh) > 3.2 * Math.min(bw, bh) || cells.length < 0.4 * bw * bh) continue;
      comps.push({ cells, score: s });
    }
    comps.sort((a, b) => b.score - a.score);
    for (const c of comps.slice(0, blobs)) {
      const rows = new Map();
      for (const i of c.cells) { const y = (i / w) | 0; (rows.get(y) ?? rows.set(y, []).get(y)).push(i % w); }
      for (const [y, xs] of rows) {
        xs.sort((a, b) => a - b);
        let a = xs[0], b = xs[0];
        const emit = () => dabs.push({ points: [{ x: a - 0.3, y }, { x: b + 0.3, y }] });
        for (const x of xs.slice(1)) { if (x === b + 1) b = x; else { emit(); a = b = x; } }
        emit();
      }
    }
    log(`face detail: ${Math.min(blobs, comps.length)} dark blobs of ${comps.length} found, ${dabs.length} row strokes`);
  }
  return { field: F, lines: found.gestures, flecks: fl, dabs };
}
