// Instrument fit: what kind of mark laid each patch of ink, and whether the target asks for that kind.
// Classes are named for mark behaviour, not tools.
import { blur } from './morph.mjs';

const CLASSES = ['thin-line', 'broad-line', 'wash', 'soft-grey'];

// Max in a square window, separable.
function maxFilter(src, w, h, r) {
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -Infinity; for (let k = -r; k <= r; k++) { const j = Math.min(w - 1, Math.max(0, x + k)); m = Math.max(m, src[y * w + j]); } a[y * w + x] = m; }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = -Infinity; for (let k = -r; k <= r; k++) { const j = Math.min(h - 1, Math.max(0, y + k)); m = Math.max(m, a[j * w + x]); } b[y * w + x] = m; }
  return b;
}

export function classifyInstruments(field) {
  const { w, h, n, D, ink, lineRadius, lineMask, lineWidth, broadMask, grain, dMax } = field;
  const r = Math.max(1, Math.round(lineWidth));
  const peak = maxFilter(D, w, h, r), markR = maxFilter(lineRadius, w, h, r);
  const absGrain = new Float32Array(n); for (let i = 0; i < n; i++) absGrain[i] = Math.abs(grain[i]);
  const gr = blur(absGrain, w, h, Math.max(2, lineWidth));
  const cls = new Uint8Array(n);        // 0 none, 1 thin-line, 2 broad-line, 3 wash, 4 soft-grey
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (!ink[i]) continue;
    let c;
    if (broadMask[i] && !lineMask[i]) c = 3;
    else if (peak[i] < Math.min(0.85, 0.5 * dMax) && gr[i] > 0.05 * Math.max(0.15, peak[i])) c = 4;
    else c = (2 * markR[i] <= 1.9 * lineWidth) ? 1 : 2;
    cls[i] = c; counts[c]++;
  }
  const inkTotal = counts.slice(1).reduce((a, b) => a + b, 0) || 1;
  return { cls, counts, mix: Object.fromEntries(CLASSES.map((k, j) => [k, counts[j + 1] / inkTotal])) };
}

// Best small shift of the painting onto the target, measured by how much ink lands on ink.
export function alignShift(tf, pf, span = 4) {
  const { w, h } = tf; let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
    let s = 0;
    for (let y = span; y < h - span; y += 2) for (let x = span; x < w - span; x += 2) {
      const t = tf.ink[y * w + x], p = pf.ink[(y + dy) * w + (x + dx)];
      s += t && p ? 1 : (t !== p ? -0.5 : 0);
    }
    if (s > best.score) best = { dx, dy, score: s };
  }
  return best;
}

// Share of the target's ink laid with the right kind of mark, weighted by target density.
// Ink never laid is reported separately as a coverage miss.
export function instrumentFit(tf, pf, tcls, pcls, shift = { dx: 0, dy: 0 }) {
  const { w, h } = tf;
  const confusion = Array.from({ length: 5 }, () => new Float64Array(5));
  let wsum = 0, match = 0, missing = 0;
  for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) {
    const ti = y * w + x, pi = (y + shift.dy) * w + (x + shift.dx);
    const tc = tcls.cls[ti]; if (!tc) continue;
    const wt = tf.D[ti]; wsum += wt;
    const pc = pcls.cls[pi];
    confusion[tc][pc] += wt;
    if (pc === tc) match += wt; else if (!pc) missing += wt;
  }
  const table = {};
  for (let t = 1; t <= 4; t++) {
    const row = confusion[t], tot = row.reduce((a, b) => a + b, 0);
    if (tot <= 0) continue;
    table[CLASSES[t - 1]] = { share: tot / (wsum || 1), asMade: Object.fromEntries([['none', row[0] / tot], ...CLASSES.map((k, j) => [k, row[j + 1] / tot])]) };
  }
  const covered = wsum - missing;
  return { fit: covered > 0 ? match / covered : NaN, fitOfAll: wsum ? match / wsum : NaN,
    missing: wsum ? missing / wsum : NaN, table, shift };
}
