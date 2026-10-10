// Is this a drawing or a bundle of loops near the edges? Legibility checks where ink lands; this checks how it runs.
// Three readings, each in [0, 1]:
// - along:  how well a stroke's own direction agrees with the source's edge direction beneath it, as |cos| of twice the
//           angle between them (undirected: a line up the edge and a line down it are the same line). 1 is a line that
//           follows the form, 0.5 is ink whose direction has nothing to do with the form.
// - steady: how straight the ink runs, as the share of ink cells whose local direction holds within 30 degrees over a
//           run of `reach` cells. A loop turns through 360 degrees in a few cells and scores near 0.
// - placed: the share of ink lying where the source has an edge at all, so ink strewn over open paper counts against it.
//
// The score is their product. Callers pass the blur.

const dirAt = (gx, gy) => Math.atan2(gy, gx);

/**
 * @param ink   Float32Array, the ink layer's density (0 where there is no ink)
 * @param D     Float32Array, the source's density
 * @param blur  (F, w, h, sigma) => Float32Array
 * @param opts.threshold  the density a cell needs to count as ink
 * @param opts.reach      cells a run must hold its direction over to count as steady
 * @param opts.edge       the source gradient a cell needs to count as an edge
 */
export function lineQuality(ink, D, w, h, blur, { threshold = 0.06, reach = 4, edge = 0.02, sigma = 1.5 } = {}) {
  const n = w * h;
  const S = blur(D, w, h, sigma), I = blur(ink, w, h, 1);
  const sgx = new Float32Array(n), sgy = new Float32Array(n), igx = new Float32Array(n), igy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    sgx[i] = (S[i + 1] - S[i - 1]) / 2; sgy[i] = (S[i + w] - S[i - w]) / 2;
    igx[i] = (I[i + 1] - I[i - 1]) / 2; igy[i] = (I[i + w] - I[i - w]) / 2;
  }
  let cells = 0, along = 0, steady = 0, placed = 0;
  for (let y = reach; y < h - reach; y++) for (let x = reach; x < w - reach; x++) {
    const i = y * w + x;
    if (ink[i] < threshold) continue;
    cells++;
    // the stroke runs across its own gradient; the form's edge runs across the source's
    const strokeDir = dirAt(igx[i], igy[i]) + Math.PI / 2, formDir = dirAt(sgx[i], sgy[i]) + Math.PI / 2;
    const strength = Math.hypot(sgx[i], sgy[i]);
    if (strength >= edge) { placed++; along += Math.abs(Math.cos(2 * (strokeDir - formDir))); }
    // hold: step along the stroke and see whether its direction survives the walk
    let held = 1;
    for (const s of [1, -1]) {
      const dx = Math.cos(strokeDir) * s, dy = Math.sin(strokeDir) * s;
      const xx = Math.round(x + dx * reach), yy = Math.round(y + dy * reach), j = yy * w + xx;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || ink[j] < threshold) { held = 0; break; }
      const d2 = dirAt(igx[j], igy[j]) + Math.PI / 2;
      if (Math.abs(Math.cos(strokeDir - d2)) < Math.cos(Math.PI / 6)) { held = 0; break; }
    }
    steady += held;
  }
  if (!cells) return { along: 0, steady: 0, placed: 0, score: 0, cells: 0 };
  const A = placed ? along / placed : 0, T = steady / cells, P = placed / cells;
  return { along: A, steady: T, placed: P, score: A * T * P, cells };
}
