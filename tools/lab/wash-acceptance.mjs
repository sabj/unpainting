// Physical measurements for the three wash fixtures. These use density at
// simulation resolution; display resizing and gallery thumbnails never enter.
import { gaussian, insideDistance, washMask } from './wash-measure.mjs';

export function discProfile(od, w, h, mm, { radius = 15, binMm = 2 } = {}) {
  const bins = Math.ceil((radius - 2) / binMm), sums = new Float64Array(bins), counts = new Uint32Array(bins);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot((x + .5 - w / 2) * mm, (y + .5 - h / 2) * mm);
    if (r > radius - 2) continue;
    const b = Math.min(bins - 1, Math.floor(r / binMm)); sums[b] += od[y * w + x]; counts[b]++;
  }
  const profile = Array.from(sums, (s, i) => s / counts[i]), mean = sums.reduce((a, b) => a + b, 0) / counts.reduce((a, b) => a + b, 0);
  return { profile, flatness: Math.max(...profile.map(v => Math.abs(v / mean - 1))) };
}

export function squareRims(od, w, h, mm) {
  const mask = washMask(od), distance = insideDistance(mask, w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w, y = (i / w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sums = [0, 0, 0, 0], counts = [0, 0, 0, 0];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x; if (!mask[i] || distance[i] * mm > 1) continue;
    const ds = [x - x0, x1 - x, y - y0, y1 - y], side = ds.indexOf(Math.min(...ds));
    if (side < 2 ? Math.min(y - y0, y1 - y) * mm < 3 : Math.min(x - x0, x1 - x) * mm < 3) continue;
    sums[side] += od[i]; counts[side]++;
  }
  const sides = sums.map((s, i) => s / counts[i]), mean = sides.reduce((a, b) => a + b) / 4;
  return { sides, deviation: Math.max(...sides.map(v => Math.abs(v / mean - 1))) };
}

function solve3(a, b) {
  const m = a.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < 3; k++) {
    let pivot = k; for (let j = k + 1; j < 3; j++) if (Math.abs(m[j][k]) > Math.abs(m[pivot][k])) pivot = j;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k]; if (Math.abs(d) < 1e-12) return [0, 0, 0];
    for (let j = k; j < 4; j++) m[k][j] /= d;
    for (let i = 0; i < 3; i++) if (i !== k) { const f = m[i][k]; for (let j = k; j < 4; j++) m[i][j] -= f * m[k][j]; }
  }
  return m.map(row => row[3]);
}

export function bloomFront(od, w, h, mm, { minMm = 5, maxMm = 13, angles = 72, blurMm = .4 } = {}) {
  const smooth = gaussian(od, w, h, blurMm / mm), cx = w / 2, cy = h / 2;
  const sample = (r, a) => {
    const x = cx - .5 + r * Math.cos(a) / mm, y = cy - .5 + r * Math.sin(a) / mm;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    return smooth[iy * w + ix] * (1 - fx) * (1 - fy) + smooth[iy * w + ix + 1] * fx * (1 - fy) + smooth[(iy + 1) * w + ix] * (1 - fx) * fy + smooth[(iy + 1) * w + ix + 1] * fx * fy;
  };
  let peak = minMm, best = -Infinity;
  for (let r = minMm; r <= maxMm; r += mm / 2) { let v = 0; for (let q = 0; q < angles; q++) v += sample(r, 2 * Math.PI * q / angles); if (v > best) { best = v; peak = r; } }
  const points = []; let ring = 0, centre = 0, nc = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x + .5 - cx) * mm, (y + .5 - cy) * mm) < 3) { centre += od[y * w + x]; nc++; }
  for (let q = 0; q < angles; q++) {
    const a = 2 * Math.PI * q / angles; let value = -Infinity, radius = peak;
    for (let r = Math.max(minMm, peak - 2); r <= Math.min(maxMm, peak + 2); r += mm / 4) { const v = sample(r, a); if (v > value) { value = v; radius = r; } }
    points.push([radius * Math.cos(a), radius * Math.sin(a)]); ring += value;
  }
  const a = Array.from({ length: 3 }, () => [0, 0, 0]), b = [0, 0, 0];
  for (const [x, y] of points) { const v = [x, y, 1], rhs = x * x + y * y; for (let i = 0; i < 3; i++) { b[i] += v[i] * rhs; for (let j = 0; j < 3; j++) a[i][j] += v[i] * v[j]; } }
  const fit = solve3(a, b), radii = points.map(([x, y]) => Math.hypot(x - fit[0] / 2, y - fit[1] / 2)), radius = radii.reduce((a, b) => a + b) / angles;
  return { contrast: (ring / angles) / (centre / nc), radius, radiusRms: Math.sqrt(radii.reduce((s, r) => s + (r - radius) ** 2, 0) / angles), centre: centre / nc, ring: ring / angles };
}

// The poured-disc fixture has a prescribed physical contact line. Measure
// its outer millimetre directly; a chamfer mask selects different band areas
// at 0.25 and 0.1 mm and confounds a native-grid convergence check.
export function discContrast(od, w, h, mm, { radius = 15, bandMm = 1, innerMm = 3 } = {}) {
  let rim = 0, rn = 0, interior = 0, count = 0;
  const interiorMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, depth = radius - Math.hypot((x + .5 - w / 2) * mm, (y + .5 - h / 2) * mm);
    if (depth > 0 && depth <= bandMm) { rim += od[i]; rn++; }
    else if (depth > innerMm) { interior += od[i]; count++; interiorMask[i] = 1; }
  }
  return { rim: rim / rn, interior: interior / count, contrast: (rim / rn) / (interior / count), interiorMask };
}
