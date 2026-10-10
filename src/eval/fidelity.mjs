// Does the painting resemble its target? Single-picture measures cannot say so; a flooded wash passes those
// but fails these.
import { dilate } from './morph.mjs';
import { mean, sd, quantile } from './image.mjs';

const shifted = (f, w, h, dx, dy) => (x, y) => {
  const nx = x + dx, ny = y + dy;
  return (nx < 0 || ny < 0 || nx >= w || ny >= h) ? null : ny * w + nx;
};

// Tone per ~16 px cell. Too dark (flooding) and too light (unpainted yet) are reported separately,
// since only flooding is a fault in an unfinished picture.
export function toneAgreement(tf, pf, shift = { dx: 0, dy: 0 }, cell = 16) {
  const { w, h } = tf;
  const cx = Math.max(4, Math.floor(w / cell)), cy = Math.max(4, Math.floor(h / cell));
  const T = [], P = [];
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const x0 = Math.floor(i * w / cx), x1 = Math.floor((i + 1) * w / cx);
    const y0 = Math.floor(j * h / cy), y1 = Math.floor((j + 1) * h / cy);
    let st = 0, sp = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const pi = shifted(null, w, h, shift.dx, shift.dy)(x, y); if (pi === null) continue;
      st += tf.D[y * w + x]; sp += pf.D[pi]; n++;
    }
    if (n) { T.push(st / n); P.push(sp / n); }
  }
  const nCells = T.length, span = Math.max(0.15, quantile(T, 0.95));
  let err = 0, flood = 0, unpainted = 0;
  for (let k = 0; k < nCells; k++) {
    const d = P[k] - T[k]; err += Math.abs(d);
    if (d > 0.22) flood++;
    if (d < -0.22) unpainted++;
  }
  const mt = mean(T), mp = mean(P), st = sd(T), sp = sd(P);
  let cov = 0; for (let k = 0; k < nCells; k++) cov += (T[k] - mt) * (P[k] - mp);
  const corr = (st > 1e-6 && sp > 1e-6) ? cov / ((nCells - 1) * st * sp) : NaN;
  return { cells: nCells, cellError: err / nCells, relError: (err / nCells) / span,
    floodFrac: flood / nCells, unpaintedFrac: unpainted / nCells, corr,
    targetMean: mt, paintingMean: mp, overInk: mp / Math.max(1e-3, mt) };
}

// Structure: recall of the target's line work, weighted by its density so a lost dark contour costs more.
export function structureAgreement(tf, pf, shift = { dx: 0, dy: 0 }, tol = 2) {
  const { w, h } = tf;
  const near = dilate(pf.ink, w, h, tol), nearT = dilate(tf.ink, w, h, tol);
  const at = shifted(null, w, h, shift.dx, shift.dy);
  let lineW = 0, lineHit = 0, inkT = 0, inkP = 0, both = 0, penW = 0, penHit = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, pi = at(x, y); if (pi === null) continue;
    if (tf.lineMask[i]) { const wt = tf.D[i]; lineW += wt; if (near[pi]) lineHit += wt; }
    // darkest quarter of the target's line work
    if (tf.lineMask[i] && tf.D[i] >= tf.dMax * 0.45) { penW += tf.D[i]; if (near[pi]) penHit += tf.D[i]; }
    if (tf.ink[i]) inkT++;
    if (pf.ink[pi]) { inkP++; if (nearT[i]) both++; }
    if (tf.ink[i] && pf.ink[pi]) { /* counted above */ }
  }
  let inter = 0, union = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, pi = at(x, y); if (pi === null) continue;
    const a = tf.ink[i], b = pf.ink[pi];
    if (a && b) inter++; if (a || b) union++;
  }
  return { lineRecall: lineW ? lineHit / lineW : NaN, penRecall: penW ? penHit / penW : NaN,
    inkPrecision: inkP ? both / inkP : NaN, iou: union ? inter / union : NaN,
    inkRatio: inkT ? inkP / inkT : NaN };
}

