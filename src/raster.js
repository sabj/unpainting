// Raster analysis on typed arrays: masks, exact distance transforms, morphology,
// components, hole filling, thinning and contour extraction. DOM free.

const INF = 1e20;

function edt1d(f, d, v, z, n) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Exact Euclidean distance (not squared) from every pixel to the nearest pixel where mask is 0. */
export function distanceToZero(mask, w, h) {
  const n = w * h, g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = mask[i] ? INF : 0;
  const size = Math.max(w, h), f = new Float32Array(size), d = new Float32Array(size), v = new Int32Array(size), z = new Float32Array(size + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = g[row + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) g[row + x] = Math.sqrt(d[x]);
  }
  return g;
}

/** Distance from each pixel to the nearest pixel where mask is 1. */
export function distanceToOne(mask, w, h) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = 1 - mask[i];
  return distanceToZero(inv, w, h);
}

// Dilation and erosion by a small radius without the full distance transform, giving the same cells.
// Per column, vertical distance to the nearest seed up to floor(r); a seed at vertical distance v covers its row
// within the disc half-width, using the transform's own float32 test. Radii from SMALL_R up use the transform.
const SMALL_R = 16;
function covered(mask, w, h, r, ones) {
  const R = Math.floor(r), n = w * h, far = R + 1, dv = new Int32Array(n), last = new Int32Array(w);
  // distanceToOne seeds where (1 - m) is 0 as a Uint8, distanceToZero where m is falsy
  const seedAt = ones ? new Uint8Array(n) : null;
  if (ones) for (let i = 0; i < n; i++) seedAt[i] = ((1 - mask[i]) & 255) === 0 ? 1 : 0;
  last.fill(-far - 1);
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) { const i = row + x; if (ones ? seedAt[i] : !mask[i]) last[x] = y; const d = y - last[x]; dv[i] = d > R ? far : d; } }
  last.fill(h + far + 1);
  for (let y = h - 1; y >= 0; y--) { const row = y * w; for (let x = 0; x < w; x++) { const i = row + x; if (ones ? seedAt[i] : !mask[i]) last[x] = y; const d = last[x] - y; if (d < dv[i]) dv[i] = d; } }
  // half-width of the disc at vertical distance v (-1: none)
  const half = new Int32Array(far + 1).fill(-1);
  for (let v = 0; v <= R; v++) { let dx = -1; while (dx + 1 <= R && Math.fround(Math.sqrt((dx + 1) * (dx + 1) + v * v)) <= r) dx++; half[v] = dx; }
  const out = new Uint8Array(n), run = new Int32Array(w + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w; run.fill(0);
    for (let x = 0; x < w; x++) { const hw = half[dv[row + x]]; if (hw < 0) continue; run[x - hw < 0 ? 0 : x - hw]++; const e = x + hw + 1; run[e > w ? w : e]--; }
    let c = 0; for (let x = 0; x < w; x++) { c += run[x]; if (c > 0) out[row + x] = 1; }
  }
  return out;
}
export function dilate(mask, w, h, r) {
  if (r >= 0 && r < SMALL_R && mask.length === w * h) return covered(mask, w, h, r, true);
  const d = distanceToOne(mask, w, h), o = new Uint8Array(mask.length);
  for (let i = 0; i < o.length; i++) o[i] = d[i] <= r ? 1 : 0;
  return o;
}
export function erode(mask, w, h, r) {
  if (r >= 0 && r < SMALL_R && mask.length === w * h) { const c = covered(mask, w, h, r, false); for (let i = 0; i < c.length; i++) c[i] = c[i] ? 0 : 1; return c; }
  const d = distanceToZero(mask, w, h), o = new Uint8Array(mask.length);
  for (let i = 0; i < o.length; i++) o[i] = d[i] > r ? 1 : 0;
  return o;
}
export const close = (mask, w, h, r) => erode(dilate(mask, w, h, r), w, h, r);

/**
 * erode(dilate(mask, r), r) inside the mask's bounding box widened by ceil(r) + 2, pasted into a sheet-sized mask.
 * Same cells as `close`: the dilation stays inside the box and its outer ring stays 0. The box clips at the sheet edge.
 */
export function closeLocal(mask, w, h, r) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) if (mask[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const out = new Uint8Array(w * h);
  if (x1 < 0) return out;
  const m = Math.ceil(r) + 2, X0 = Math.max(0, x0 - m), Y0 = Math.max(0, y0 - m), X1 = Math.min(w - 1, x1 + m), Y1 = Math.min(h - 1, y1 + m);
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, sub = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) { const s = (Y0 + y) * w + X0; for (let x = 0; x < bw; x++) sub[y * bw + x] = mask[s + x]; }
  const c = erode(dilate(sub, bw, bh, r), bw, bh, r);
  for (let y = 0; y < bh; y++) { const s = (Y0 + y) * w + X0; for (let x = 0; x < bw; x++) out[s + x] = c[y * bw + x]; }
  return out;
}
export const open = (mask, w, h, r) => dilate(erode(mask, w, h, r), w, h, r);
/**
 * dilate(erode(mask, r), r) inside the widened bounding box, as closeLocal. Same cells as `open`: every nearest 0 or 1
 * lies inside the box. The box clips at the sheet edge.
 */
export function openLocal(mask, w, h, r) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) { const row = y * w; for (let x = 0; x < w; x++) if (mask[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const out = new Uint8Array(w * h);
  if (x1 < 0) return out;
  const m = Math.ceil(r) + 2, X0 = Math.max(0, x0 - m), Y0 = Math.max(0, y0 - m), X1 = Math.min(w - 1, x1 + m), Y1 = Math.min(h - 1, y1 + m);
  const bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, sub = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) { const s = (Y0 + y) * w + X0; for (let x = 0; x < bw; x++) sub[y * bw + x] = mask[s + x]; }
  const c = dilate(erode(sub, bw, bh, r), bw, bh, r);
  for (let y = 0; y < bh; y++) { const s = (Y0 + y) * w + X0; for (let x = 0; x < bw; x++) out[s + x] = c[y * bw + x]; }
  return out;
}

/** 8-connected component labels (Int32, 0 = background) and per-label areas. */
export function components(mask, w, h, connectivity = 8) {
  const labels = new Int32Array(mask.length), areas = [0];
  const stack = new Int32Array(mask.length);
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    let sp = 0, area = 0;
    stack[sp++] = start; labels[start] = next;
    while (sp) {
      const i = stack[--sp]; area++;
      const x = i % w, y = (i - x) / w;
      const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : w - 1, y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : h - 1;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        if (connectivity === 4 && xx !== x && yy !== y) continue;
        const j = yy * w + xx;
        if (mask[j] && !labels[j]) { labels[j] = next; stack[sp++] = j; }
      }
    }
    areas.push(area); next++;
  }
  return { labels, areas, count: next - 1 };
}

/** Drop components with fewer than minArea pixels. */
export function removeSmall(mask, w, h, minArea) {
  const { labels, areas } = components(mask, w, h);
  const o = new Uint8Array(mask.length);
  for (let i = 0; i < o.length; i++) o[i] = labels[i] && areas[labels[i]] >= minArea ? 1 : 0;
  return o;
}

/** Fill background holes (4-connected background regions not touching the border) smaller than maxArea. */
export function fillHoles(mask, w, h, maxArea) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = 1 - mask[i];
  const { labels, areas, count } = components(inv, w, h, 4);
  const touches = new Uint8Array(count + 1);
  for (let x = 0; x < w; x++) { touches[labels[x]] = 1; touches[labels[(h - 1) * w + x]] = 1; }
  for (let y = 0; y < h; y++) { touches[labels[y * w]] = 1; touches[labels[y * w + w - 1]] = 1; }
  const o = new Uint8Array(mask);
  for (let i = 0; i < o.length; i++) { const l = labels[i]; if (l && !touches[l] && areas[l] < maxArea) o[i] = 1; }
  return o;
}

/** Zhang-Suen thinning to a one pixel wide 8-connected skeleton. */
export function thin(mask, w, h) {
  const s = new Uint8Array(mask);
  const toDelete = [];
  let changed = true, iter = 0;
  while (changed && iter < 200) {
    changed = false; iter++;
    for (let pass = 0; pass < 2; pass++) {
      toDelete.length = 0;
      for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
          const i = row + x;
          if (!s[i]) continue;
          const p2 = s[i - w], p3 = s[i - w + 1], p4 = s[i + 1], p5 = s[i + w + 1], p6 = s[i + w], p7 = s[i + w - 1], p8 = s[i - 1], p9 = s[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          let a = 0;
          if (!p2 && p3) a++; if (!p3 && p4) a++; if (!p4 && p5) a++; if (!p5 && p6) a++;
          if (!p6 && p7) a++; if (!p7 && p8) a++; if (!p8 && p9) a++; if (!p9 && p2) a++;
          if (a !== 1) continue;
          if (pass === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
          else if (p2 * p4 * p8 || p2 * p6 * p8) continue;
          toDelete.push(i);
        }
      }
      if (toDelete.length) { changed = true; for (const i of toDelete) s[i] = 0; }
    }
  }
  return s;
}

/**
 * Closed contours of a binary mask by marching squares on the pixel grid.
 * Returns loops of {x, y} in pixel coordinates (vertices at cell-edge midpoints).
 * Outer boundaries wind one way and holes the other; the caller fills evenodd.
 */
export function contours(mask, w, h) {
  const W = w + 1, H = h + 1;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  // map directed segments start vertex -> end vertex, then walk loops; a cell emits up to two segments
  const segs = new Map(); // key: vertex index -> next vertex index (Map of arrays for saddles)
  const key = (x2, y2) => y2 * (2 * W) + x2; // half-integer coordinates doubled
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); const list = segs.get(k); if (list) list.push(key(bx, by)); else segs.set(k, [key(bx, by)]); };
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y), tr = at(x + 1, y), bl = at(x, y + 1), br = at(x + 1, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // midpoints of the cell (whose corners are pixel centres) edges, in doubled coordinates
      const top = [2 * x + 1, 2 * y], right = [2 * x + 2, 2 * y + 1], bottom = [2 * x + 1, 2 * y + 2], left = [2 * x, 2 * y + 1];
      // inside (mask = 1) on the left when walking
      const emit = (a, b) => add(a[0] + 1, a[1] + 1, b[0] + 1, b[1] + 1);
      switch (c) {
        case 1: emit(left, bottom); break;
        case 2: emit(bottom, right); break;
        case 3: emit(left, right); break;
        case 4: emit(right, top); break;
        case 5: emit(left, top); emit(right, bottom); break;
        case 6: emit(bottom, top); break;
        case 7: emit(left, top); break;
        case 8: emit(top, left); break;
        case 9: emit(top, bottom); break;
        case 10: emit(top, right); emit(bottom, left); break;
        case 11: emit(top, right); break;
        case 12: emit(right, left); break;
        case 13: emit(right, bottom); break;
        case 14: emit(bottom, left); break;
      }
    }
  }
  const loops = [];
  const stride = 2 * W;
  for (const [startKey] of segs) {
    if (!segs.get(startKey)?.length) continue;
    const loop = [];
    let k = startKey;
    let guard = 0;
    while (guard++ < 10000000) {
      const list = segs.get(k);
      if (!list || !list.length) break;
      const nextKey = list.pop();
      const x2 = k % stride, y2 = (k - x2) / stride;
      loop.push({ x: (x2 - 1) / 2 + 0.5, y: (y2 - 1) / 2 + 0.5 });
      k = nextKey;
      if (k === startKey) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Signed area of a loop: positive when the mask interior is on its left (outer boundary). */
export function loopSignedArea(loop) {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) a += (loop[j].x * loop[i].y - loop[i].x * loop[j].y);
  return a / 2;
}

/** Separable square min filter of radius r on a float field. */
export function minFilter(field, w, h, r) {
  const tmp = new Float32Array(field.length), out = new Float32Array(field.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = Infinity;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = field[y * w + k]; if (v < m) m = v; }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = Infinity;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]; if (v < m) m = v; }
    out[y * w + x] = m;
  }
  return out;
}

/** Separable square max filter of radius r on a float field. */
export function maxFilter(field, w, h, r) {
  const tmp = new Float32Array(field.length), out = new Float32Array(field.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = field[y * w + k]; if (v > m) m = v; }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]; if (v > m) m = v; }
    out[y * w + x] = m;
  }
  return out;
}

