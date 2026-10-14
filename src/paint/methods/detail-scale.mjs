// Detail-scaled minimum shape (--detailscale k). The value planner drops every passage, light and shadow piece under
// one fixed minimum shape (144 cells, about 11 mm2 on a 152 mm sheet). That size suits a sky or a wall; on a face,
// where nostrils, lips, lid shadows and the teeth are 1 to 6 mm2, it drops every feature and leaves a few flat planes.
// A painter changes brush and mark size with the detail an area holds. Here the minimum shape shrinks where the
// target holds mid-scale structure (features 1 to 3 mm across), measured from the value field alone, so busy
// areas keep their small planes and broad areas keep their broad washes. Planning only.

function boxMean(src, w, h, r) {
  let a = Float32Array.from(src);
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const row = y * w; let s = 0; for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    a = o;
  }
  return a;
}

/** Mid-scale structure 0..1 per cell: |blur(1 mm) - blur(3 mm)| of the value field, averaged over 3 mm, divided by its
 *  95th percentile on the sheet. */
export function detailField(values, w, h, cellMm) {
  const r1 = Math.max(1, Math.round(1 / cellMm / 2)), r3 = Math.max(r1 + 1, Math.round(3 / cellMm / 2));
  const a = boxMean(values, w, h, r1), b = boxMean(values, w, h, r3);
  const d = boxMean(Float32Array.from(a, (v, i) => Math.abs(v - b[i])), w, h, r3);
  const sorted = Float32Array.from(d).sort(), p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] || 1;
  return Float32Array.from(d, v => Math.min(1, v / p95));
}

/** The minimum shape where the detail is d: minArea shrunk by share k of d, never under floor cells. */
export const localMinShape = (minArea, d, k, floor = 12) => Math.max(floor, Math.round(minArea * (1 - k * d)));

export const meanOver = (list, f) => { let s = 0; for (const i of list) s += f[i]; return list.length ? s / list.length : 0; };

/** removeSmall with a local minimum: a piece is kept when it is at least localMinShape of its own mean detail. */
export function keepByDetail(mask, w, h, minArea, detail, k, floor = 12) {
  const n = w * h, out = new Uint8Array(n), seen = new Uint8Array(n), q = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue;
    let qh = 0, qt = 0, sum = 0;
    q[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const i = q[qh++], x = i % w; sum += detail[i];
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1]) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; q[qt++] = j; }
    }
    if (qt >= localMinShape(minArea, sum / qt, k, floor)) for (let t = 0; t < qt; t++) out[q[t]] = 1;
  }
  return out;
}
