// Shape helpers of the study wash plan (study-washes.mjs): a brush-rounded mask and a stable k-means. Planning only.

/** Tight bounding box of nonzero cells in a w x h mask, or null if empty. */
export function maskBounds(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const words = m instanceof Uint8Array && m.byteOffset % 4 === 0 ? new Uint32Array(m.buffer, m.byteOffset, m.length >>> 2) : null;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let rx0 = -1, rx1 = -1;
    if (words) {
      let x = 0;
      const startWord = (row + 3) >>> 2, endWord = (row + w) >>> 2;
      const headEnd = Math.min(w, (startWord << 2) - row);
      for (; x < headEnd; x++) if (m[row + x]) { rx0 = x; break; }
      if (rx0 < 0) {
        for (let wi = startWord; wi < endWord; wi++) {
          if (words[wi]) {
            const base = (wi << 2) - row;
            for (let k = 0; k < 4; k++) if (m[row + base + k]) { rx0 = base + k; break; }
            break;
          }
        }
        if (rx0 < 0) {
          for (x = (endWord << 2) - row; x < w; x++) if (m[row + x]) { rx0 = x; break; }
        }
      }
      if (rx0 < 0) continue;
      for (x = w - 1; x >= (endWord << 2) - row && x >= rx0; x--) if (m[row + x]) { rx1 = x; break; }
      if (rx1 < 0) {
        const minWord = (row + rx0) >>> 2;
        for (let wi = endWord - 1; wi >= minWord; wi--) {
          if (words[wi]) {
            const base = (wi << 2) - row;
            for (let k = 3; k >= 0; k--) {
              const px = base + k;
              if (px >= rx0 && px < w && m[row + px]) { rx1 = px; break; }
            }
            if (rx1 >= 0) break;
          }
        }
        if (rx1 < 0) rx1 = rx0;
      }
    } else {
      for (let x = 0; x < w; x++) if (m[row + x]) { rx0 = x; break; }
      if (rx0 < 0) continue;
      for (let x = w - 1; x >= rx0; x--) if (m[row + x]) { rx1 = x; break; }
    }
    if (rx0 < x0) x0 = rx0;
    if (rx1 > x1) x1 = rx1;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function discHalfWidths(r) {
  const half = new Int32Array(r + 2).fill(-1), r2 = r * r;
  for (let v = 0; v <= r; v++) half[v] = Math.floor(Math.sqrt(r2 - v * v));
  return half;
}

/** Exact integer-radius disc dilation over a sub-grid (or full grid). O(w * h), independent of r. */
function dilateInt(m, w, h, r) {
  const n = w * h, out = new Uint8Array(n);
  const box = maskBounds(m, w, h);
  if (!box) return out;
  const X0 = Math.max(0, box.x0 - r), X1 = Math.min(w - 1, box.x1 + r);
  const Y0 = Math.max(0, box.y0 - r), Y1 = Math.min(h - 1, box.y1 + r);
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, sx0 = box.x0, sx1 = box.x1, sbw = sx1 - sx0 + 1;
  const far = r + 1, dv = new Int32Array(sbw * bh), last = new Int32Array(sbw).fill(-far - 1);
  for (let ly = 0; ly < bh; ly++) {
    const y = Y0 + ly, mRow = y * w + sx0, dRow = ly * sbw;
    for (let lx = 0; lx < sbw; lx++) {
      if (m[mRow + lx]) last[lx] = ly;
      const d = ly - last[lx];
      dv[dRow + lx] = d > r ? far : d;
    }
  }
  last.fill(bh + far + 1);
  for (let ly = bh - 1; ly >= 0; ly--) {
    const y = Y0 + ly, mRow = y * w + sx0, dRow = ly * sbw;
    for (let lx = 0; lx < sbw; lx++) {
      if (m[mRow + lx]) last[lx] = ly;
      const d = last[lx] - ly;
      if (d < dv[dRow + lx]) dv[dRow + lx] = d;
    }
  }
  const half = discHalfWidths(r), run = new Int32Array(bw + 1), xOff = sx0 - X0;
  for (let ly = 0; ly < bh; ly++) {
    const dRow = ly * sbw, oRow = (Y0 + ly) * w + X0;
    run.fill(0);
    let any = false;
    for (let lx = 0; lx < sbw; lx++) {
      const hw = half[dv[dRow + lx]];
      if (hw < 0) continue;
      any = true;
      const cx = lx + xOff, a = cx - hw, b = cx + hw + 1;
      run[a < 0 ? 0 : a]++;
      run[b > bw ? bw : b]--;
    }
    if (!any) continue;
    let c = 0;
    for (let lx = 0; lx < bw; lx++) { c += run[lx]; if (c > 0) out[oRow + lx] = 1; }
  }
  return out;
}

/** Exact integer-radius disc erosion: invert(dilate(invert(m), r)), localized to m's bounding box. */
function erodeInt(m, w, h, r) {
  const n = w * h, out = new Uint8Array(n);
  const box = maskBounds(m, w, h);
  if (!box) return out;
  // Every cell in [box.x0..box.x1, box.y0..box.y1] has its nearest 0 within a 1-cell border (clamped to sheet edges).
  const X0 = Math.max(0, box.x0 - 1), X1 = Math.min(w - 1, box.x1 + 1);
  const Y0 = Math.max(0, box.y0 - 1), Y1 = Math.min(h - 1, box.y1 + 1);
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, far = r + 1;
  const dv = new Int32Array(bw * bh), last = new Int32Array(bw).fill(-far - 1);
  for (let ly = 0; ly < bh; ly++) {
    const mRow = (Y0 + ly) * w + X0, dRow = ly * bw;
    for (let lx = 0; lx < bw; lx++) {
      if (!m[mRow + lx]) last[lx] = ly;
      const d = ly - last[lx];
      dv[dRow + lx] = d > r ? far : d;
    }
  }
  last.fill(bh + far + 1);
  for (let ly = bh - 1; ly >= 0; ly--) {
    const mRow = (Y0 + ly) * w + X0, dRow = ly * bw;
    for (let lx = 0; lx < bw; lx++) {
      if (!m[mRow + lx]) last[lx] = ly;
      const d = last[lx] - ly;
      if (d < dv[dRow + lx]) dv[dRow + lx] = d;
    }
  }
  const half = discHalfWidths(r), run = new Int32Array(bw + 1);
  const yStart = box.y0 - Y0, yEnd = box.y1 - Y0, xStart = box.x0 - X0, xEnd = box.x1 - X0;
  for (let ly = yStart; ly <= yEnd; ly++) {
    const dRow = ly * bw, oRow = (Y0 + ly) * w + X0;
    run.fill(0);
    for (let lx = 0; lx < bw; lx++) {
      const hw = half[dv[dRow + lx]];
      if (hw < 0) continue;
      const a = lx - hw, b = lx + hw + 1;
      run[a < 0 ? 0 : a]++;
      run[b > bw ? bw : b]--;
    }
    let c = 0;
    for (let lx = 0; lx < xStart; lx++) c += run[lx];
    for (let lx = xStart; lx <= xEnd; lx++) {
      c += run[lx];
      if (c === 0 && m[oRow + lx]) out[oRow + lx] = 1;
    }
  }
  return out;
}

/** The mask grown by a disc of radius r cells. */
export function dilate(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  if (Number.isInteger(r) && m.length === w * h) return dilateInt(m, w, h, r);
  const a = new Float32Array(m.length), b = new Uint8Array(m.length), r2 = r * r;
  // a disc: rows by run, then the disc's half-chords (fractional radius fallback)
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; a[y * w + x] = x - last; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; a[y * w + x] = Math.min(a[y * w + x], last - x); } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let hit = 0; for (let dy = -r; dy <= r && !hit; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; if (a[yy * w + x] * a[yy * w + x] + dy * dy <= r2) hit = 1; } b[y * w + x] = hit;
  }
  return b;
}
const invert = m => { const o = new Uint8Array(m.length); for (let i = 0; i < o.length; i++) o[i] = 1 - m[i]; return o; };
/** The mask shrunk by a disc of radius r cells. */
export function erode(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  if (Number.isInteger(r) && m.length === w * h) return erodeInt(m, w, h, r);
  return invert(dilate(invert(m), w, h, r));
}
/** A mask rounded as a brush of radius r would lay it: closed (gaps under 2r joined) then opened (parts under 2r dropped). */
export function roundMask(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  if (!Number.isInteger(r) || m.length !== w * h) return dilate(erode(erode(dilate(m, w, h, r), w, h, r), w, h, r), w, h, r);
  const box = maskBounds(m, w, h);
  if (!box) return new Uint8Array(m.length);
  const pad = r + 2;
  const X0 = Math.max(0, box.x0 - pad), X1 = Math.min(w - 1, box.x1 + pad);
  const Y0 = Math.max(0, box.y0 - pad), Y1 = Math.min(h - 1, box.y1 + pad);
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1;
  if (bw * bh * 2 >= w * h) return dilateInt(erodeInt(erodeInt(dilateInt(m, w, h, r), w, h, r), w, h, r), w, h, r);
  const sub = new Uint8Array(bw * bh);
  for (let ly = 0; ly < bh; ly++) sub.set(m.subarray((Y0 + ly) * w + X0, (Y0 + ly) * w + X1 + 1), ly * bw);
  const res = dilateInt(erodeInt(erodeInt(dilateInt(sub, bw, bh, r), bw, bh, r), bw, bh, r), bw, bh, r);
  const out = new Uint8Array(w * h);
  for (let ly = 0; ly < bh; ly++) out.set(res.subarray(ly * bw, (ly + 1) * bw), (Y0 + ly) * w + X0);
  return out;
}

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
