// Generated from src/media/fibre-throat.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The pinning throat of each cell: how hard a wet front on damp paper finds it to push into the cell, from the
// paper's own geometry. A contact line advancing over a felt of fibres pins on their edges (Gibbs' criterion: at an
// edge the line has to turn through the edge's angle before it moves on), so the more fibre a front has to cross in a
// cell, the more water it needs behind it; where the fibres leave a gap it runs on at once. A crest of the relief pins
// it the same way (a convex edge), a hollow lets it on. The direction of advance is the sheet's part: along a fibre
// the line slides in the corner the fibre makes (pinFibre in sheet.mjs), across one it has the full edge to climb.
//
// A cell of 0.26 mm holds a few fibres, so what a front meets there is the gap they leave, and a gap is walled by the
// same fibres for their length: the throat is the fibre the cell holds (as paper.mjs lays it) averaged along the
// fibres through it over half a fibre's length, plus how proud the cell stands. Fibres are 1.4 to 5 mm long, so the
// throats run in lines along the fibres and change across them, and a front stopped by them stops along the fibres:
// blooms and back-runs branch where the paper does. Nothing here moves water; the flow still decides how far a front gets.
//
// The throat enters the sheet's threshold as exp(2 pinning damp throat), so it is a log of the entry pressure, and
// it is mapped by its own distribution onto -0.5..0.5 evenly, the spread the per-cell hash it replaces had: pinning
// keeps its calibrated strength and only where the hard and easy cells lie changes. Made once with the paper
// (paper.mjs, paper-scan.mjs); a sheet reads paper.throat on the CPU and the GPU alike. DOM free.

const BINS = 4096;
// the relief's share beside the fibres' (each in its own spread): half, since the threshold already carries the
// cell's height (spillHeight in sheet.mjs) and proud is the part of the relief finer than that
const RELIEF = 0.5;

/**
 * paper fields { w, h, fibre, proud, fdx, fdy }, and the fibres' half length in cells. Returns a Float32Array of
 * throats, evenly spread over -0.5..0.5.
 */
export function fibreThroat({ w, h, fibre, proud, fdx, fdy }, half) {
  const n = w * h, out = streak(fibre, w, h, fdx, fdy, Math.max(1, Math.round(half))), zf = zscore(out), zp = zscore(proud);
  for (let i = 0; i < n; i++) out[i] = zf(out[i]) + RELIEF * zp(proud[i]);
  return evenly(out);
}

// The fibre a gap is bounded by, along the gap: the mean of f along the fibres through each cell, `r` one-cell steps
// each way, each step in the direction of the fibres under it (a fibre has no head or tail, so the direction is turned
// to keep going the same way). A gap between fibres is walled by the same fibres for their length.
function streak(f, w, h, fdx, fdy, r) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let s = f[i], c = 1;
    for (let sg = 1; sg >= -1; sg -= 2) {
      let px = x, py = y, vx = sg * fdx[i], vy = sg * fdy[i];
      for (let t = 0; t < r; t++) {
        px += vx; py += vy; const qx = Math.round(px), qy = Math.round(py);
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) break;
        const j = qy * w + qx; s += f[j]; c++;
        let ux = fdx[j], uy = fdy[j]; if (ux * vx + uy * vy < 0) { ux = -ux; uy = -uy; } vx = ux; vy = uy;
      }
    }
    out[i] = s / c;
  }
  return out;
}

function zscore(a) {
  let m = 0, v = 0; for (let i = 0; i < a.length; i++) { m += a[i]; v += a[i] * a[i]; }
  m /= a.length; const sd = Math.sqrt(Math.max(0, v / a.length - m * m));
  return sd > 0 ? x => (x - m) / sd : () => 0;
}

// map values onto -0.5..0.5 by their own distribution (a histogram, linear within a bin): rank order kept, spread even
function evenly(a) {
  const n = a.length; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
  if (!(hi > lo)) return a.fill(0);
  const k = (BINS - 1e-6) / (hi - lo), cnt = new Float64Array(BINS + 1);
  for (let i = 0; i < n; i++) cnt[1 + Math.floor((a[i] - lo) * k)]++;
  for (let b = 1; b <= BINS; b++) cnt[b] += cnt[b - 1];
  for (let i = 0; i < n; i++) {
    const p = (a[i] - lo) * k, b = Math.floor(p);
    a[i] = (cnt[b] + (p - b) * (cnt[b + 1] - cnt[b])) / n - 0.5;
  }
  return a;
}

/** Correlation of a field between cells t apart along the local fibre direction (fdx, fdy) and across it, for
 *  t = 1..maxLag; and the correlation length along and across in cells (where it falls to 1/e, interpolated). */
export function throatCorrelation({ w, h, fdx, fdy, grain }, f, { maxLag = 8, minGrain = 0 } = {}) {
  const at = (t, across) => {
    let s = 0, a = 0, b = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (grain[i] < minGrain) continue;
      const ux = across ? -fdy[i] : fdx[i], uy = across ? fdx[i] : fdy[i], xx = Math.round(x + ux * t), yy = Math.round(y + uy * t);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx; s += f[i] * f[j]; a += f[i] * f[i]; b += f[j] * f[j];
    }
    return s / Math.sqrt(a * b);
  };
  const len = r => { let prev = 1; for (let t = 1; t <= maxLag; t++) { if (r[t - 1] < Math.exp(-1)) return t - 1 + (prev - Math.exp(-1)) / (prev - r[t - 1]); prev = r[t - 1]; } return maxLag; };
  const along = [], across = [];
  for (let t = 1; t <= maxLag; t++) { along.push(at(t, false)); across.push(at(t, true)); }
  return { along, across, alongLen: len(along), acrossLen: len(across) };
}
