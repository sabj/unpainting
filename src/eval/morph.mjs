// Mask morphology: distance transform, components, thinning, blurs, contours.
// Kept separate from src/raster.js so the measures stay stable while painting code changes.

// Felzenszwalb & Huttenlocher's exact squared distance transform, one dimension at a time.
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

// Distance from every set pixel to the nearest clear pixel. For an ink mask this is the local half-width.
export function distanceTransform(mask, w, h) {
  const INF = 1e12, sq = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) sq[i] = mask[i] ? INF : 0;
  const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = sq[y * w + x]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) sq[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) f[x] = sq[o + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) sq[o + x] = d[x]; }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(sq[i]);
  return out;
}

// Labels start at 1. conn is 4 or 8.
export function components(mask, w, h, conn = 8) {
  const labels = new Int32Array(w * h), areas = [0], stack = new Int32Array(w * h);
  let next = 1;
  const dx = conn === 8 ? [-1, 0, 1, -1, 1, -1, 0, 1] : [-1, 1, 0, 0], dy = conn === 8 ? [-1, -1, -1, 0, 0, 1, 1, 1] : [0, 0, -1, 1];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = next++; let top = 0, area = 0; stack[top++] = s; labels[s] = id;
    while (top) {
      const p = stack[--top]; area++; const px = p % w, py = (p / w) | 0;
      for (let k = 0; k < dx.length; k++) {
        const nx = px + dx[k], ny = py + dy[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx; if (mask[q] && !labels[q]) { labels[q] = id; stack[top++] = q; }
      }
    }
    areas.push(area);
  }
  return { labels, areas, count: next - 1 };
}

export function dilate(mask, w, h, radius) {
  if (radius <= 0) return mask.slice();
  const d = distanceTransform(invert(mask, w, h), w, h), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] <= radius ? 1 : 0;
  return out;
}
export function erode(mask, w, h, radius) {
  if (radius <= 0) return mask.slice();
  const d = distanceTransform(mask, w, h), out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i] > radius ? 1 : 0;
  return out;
}
export const invert = (mask, w, h) => { const o = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) o[i] = mask[i] ? 0 : 1; return o; };
export const close = (mask, w, h, r) => erode(dilate(mask, w, h, r), w, h, r);

// Separable box blur, three passes, approximating a Gaussian.
export function blur(src, w, h, radius) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) { const o = y * w; let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[o + x] = sum / (2 * r + 1); sum += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) { let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = sum / (2 * r + 1); sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}

// Zhang-Suen thinning to a fixed point.
export function thin(mask, w, h) {
  const m = Uint8Array.from(mask), at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  let changed = true, guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    for (const step of [0, 1]) {
      const kill = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (!m[y * w + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p.reduce((a, v) => a + v, 0); if (b < 2 || b > 6) continue;
        let a = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        const [P2, P3, P4, P5, P6, P7, P8, P9] = p;
        if (step === 0) { if (P2 * P4 * P6 || P4 * P6 * P8) continue; } else { if (P2 * P4 * P8 || P2 * P6 * P8) continue; }
        kill.push(y * w + x);
      }
      for (const i of kill) m[i] = 0;
      if (kill.length) changed = true;
    }
  }
  return m;
}

// Outer boundary pixels of a mask: set pixels with at least one clear 4-neighbour.
export function boundary(mask, w, h) {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) out.push(i);
  }
  return out;
}

export function sampleBilinear(F, w, h, x, y) {
  const x0 = Math.min(w - 2, Math.max(0, Math.floor(x))), y0 = Math.min(h - 2, Math.max(0, Math.floor(y)));
  const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
  const a = F[y0 * w + x0], b = F[y0 * w + x0 + 1], c = F[(y0 + 1) * w + x0], d = F[(y0 + 1) * w + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
