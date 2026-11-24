// Shape helpers of the study wash plan (study-washes.mjs): a brush-rounded mask and a stable k-means. Planning only.

/** The mask grown by a disc of radius r cells. */
export function dilate(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  const a = new Float32Array(m.length), b = new Uint8Array(m.length), r2 = r * r;
  // a disc: rows by run, then the disc's half-chords
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; a[y * w + x] = x - last; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; a[y * w + x] = Math.min(a[y * w + x], last - x); } }
  // A cell further than r along its row from the mask cannot lie under the disc from that row, so a column of 2r + 1
  // such rows has no hit: counted down each column once (near), those cells are passed over without the walk, which was
  // most of a full-size plan's 111 s here. Every other cell is walked as before, so the mask is the same.
  const near = new Int32Array(w * (h + 1)), whole = Number.isInteger(r);   // a radius that is not whole is walked as it was
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) near[(y + 1) * w + x] = near[y * w + x] + (a[y * w + x] <= r ? 1 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (whole && near[Math.min(h, y + r + 1) * w + x] - near[Math.max(0, y - r) * w + x] === 0) continue;
    let hit = 0; for (let dy = -r; dy <= r && !hit; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; if (a[yy * w + x] * a[yy * w + x] + dy * dy <= r2) hit = 1; } b[y * w + x] = hit;
  }
  return b;
}
// a plain loop: Uint8Array.from with a mapping function walks the mask through an iterator and a call a cell, which
// was 348 s of a full-size plan's 607 s on a pod (the same bytes come out: each is 1 - v stored into a Uint8Array)
const invert = m => { const o = new Uint8Array(m.length); for (let i = 0; i < o.length; i++) o[i] = 1 - m[i]; return o; };
const erode = (m, w, h, r) => invert(dilate(invert(m), w, h, r));
/** A mask rounded as a brush of radius r would lay it: closed (gaps under 2r joined) then opened (parts under 2r dropped). */
export function roundMask(m, w, h, r) { return dilate(erode(erode(dilate(m, w, h, r), w, h, r), w, h, r), w, h, r); }

/** k-means on rows of features (Float32Array n x d), started from slices along the main axis; returns centres. */
export function kmeans(rows, d, k, iterations = 12) {
  const n = rows.length / d; if (!n) return [];
  // a start that a small change to the rows cannot flip: the means of k equal slices along the rows' main axis
  const mean = new Float64Array(d); for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) mean[j] += rows[i * d + j] / n;
  let axis = Array.from({ length: d }, (_, j) => (j === 0 ? 1 : 0.5));
  for (let it = 0; it < 20; it++) { const next = new Float64Array(d); for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < d; j++) t += (rows[i * d + j] - mean[j]) * axis[j]; for (let j = 0; j < d; j++) next[j] += t * (rows[i * d + j] - mean[j]); } const len = Math.hypot(...next) || 1; axis = Array.from(next, v => v / len); }
  const order = Array.from({ length: n }, (_, i) => i), proj = i => { let t = 0; for (let j = 0; j < d; j++) t += (rows[i * d + j] - mean[j]) * axis[j]; return t; }, pr = Float64Array.from(order, proj);
  order.sort((a, b) => pr[a] - pr[b]);
  const centres = [];
  for (let q = 0; q < k; q++) { const part = order.slice(Math.floor(q * n / k), Math.floor((q + 1) * n / k)); if (!part.length) continue; const c = new Array(d).fill(0); for (const i of part) for (let j = 0; j < d; j++) c[j] += rows[i * d + j] / part.length; centres.push(c); }
  const d2 = (i, c) => { let s = 0; for (let j = 0; j < d; j++) s += (rows[i * d + j] - c[j]) ** 2; return s; };
  for (let it = 0; it < iterations; it++) {
    const sum = centres.map(() => new Float64Array(d)), cnt = new Int32Array(centres.length);
    for (let i = 0; i < n; i++) { let best = 0, bd = Infinity; centres.forEach((c, q) => { const v = d2(i, c); if (v < bd) { bd = v; best = q; } }); cnt[best]++; for (let j = 0; j < d; j++) sum[best][j] += rows[i * d + j]; }
    centres.forEach((c, q) => { if (cnt[q]) for (let j = 0; j < d; j++) c[j] = sum[q][j] / cnt[q]; });
  }
  return centres;
}
