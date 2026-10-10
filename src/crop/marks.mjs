// Mark evidence, read before choosing an instrument. Distances are in source pixels; density ratios, coherence
// and cross-mark contrast do not depend on the ink's hue or the crop's exposure.
import { gaussian } from '../keyframes/density.mjs';
import { hessianRidges, ridgeMask, matchMasks } from './layers.mjs';

export function measureMarks(D, w, h, { scale = 1, endpoint = D, ridges } = {}) {
  const n = w * h, at = (F, x, y) => F[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const fine = gaussian(D, w, h, 0.6 * scale), tone = gaussian(D, w, h, 4 * scale), gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = fine[i + 1] - fine[i - 1]; gy[i] = fine[i + w] - fine[i - w]; }
  const xx = gaussian(gx.map(v => v * v), w, h, 3 * scale), yy = gaussian(gy.map(v => v * v), w, h, 3 * scale), xy = gaussian(gx.map((v, i) => v * gy[i]), w, h, 3 * scale);
  const variance = gaussian(D.map((v, i) => (v - tone[i]) ** 2), w, h, 3 * scale), tooth = gaussian(D.map((v, i) => (v - fine[i]) ** 2), w, h, 3 * scale);
  const coherence = new Float32Array(n), ux = new Float32Array(n), uy = new Float32Array(n), roughness = new Float32Array(n), reserve = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    coherence[i] = Math.hypot(xx[i] - yy[i], 2 * xy[i]) / Math.max(1e-12, xx[i] + yy[i]);
    const a = 0.5 * Math.atan2(2 * xy[i], xx[i] - yy[i]) + Math.PI / 2; ux[i] = Math.cos(a); uy[i] = Math.sin(a);
    roughness[i] = Math.sqrt(tooth[i] / Math.max(1e-12, variance[i])); reserve[i] = endpoint[i] < -Math.log(0.97) ? 1 : 0;
  }
  const R = ridges || hessianRidges(D, w, h, [0.5, 0.7, 1, 1.4].map(s => s * scale));
  return { D, w, h, scale, at, fine, tone, variance, coherence, ux, uy, roughness, reserve, R };
}

// The footprint across the gesture. The 20 to 80% edge ramp separates a soft brush flank from a sharp nib; the width
// range records the hand bearing down and lifting.
export function markInstrument(stroke, M, kind = classifyMark(stroke, M)) {
  const { D, at, scale } = M, P = stroke.points, widths = [], softness = [], density = [];
  for (let j = 0; j < P.length; j++) {
    const p = P[j], a = P[Math.max(0, j - 2)], b = P[Math.min(P.length - 1, j + 2)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    let peak = at(D, p.x, p.y), centre = 0;
    for (let q = -scale; q <= scale; q += scale / 4) { const v = at(D, p.x + nx * q, p.y + ny * q); if (v > peak) { peak = v; centre = q; } }
    const ground = Math.max(at(D, p.x + nx * 8 * scale, p.y + ny * 8 * scale), at(D, p.x - nx * 8 * scale, p.y - ny * 8 * scale)), contrast = Math.max(0, peak - ground);
    const reach = (sign, fraction) => { let q = 0; while (q < 8 * scale && at(D, p.x + nx * (centre + sign * q), p.y + ny * (centre + sign * q)) > ground + fraction * contrast) q += scale / 4; return q; };
    const half = reach(1, 0.5) + reach(-1, 0.5), ramp = (reach(1, 0.2) - reach(1, 0.8) + reach(-1, 0.2) - reach(-1, 0.8)) / 2;
    widths.push(Math.max(0.4 * scale, half)); softness.push(ramp / scale); density.push(peak);
  }
  const sorted = [...widths].sort((a, b) => a - b), quantile = q => sorted[Math.floor(q * (sorted.length - 1))] || scale;
  const width = quantile(0.5) / scale, widthVariation = quantile(0.9) / Math.max(0.4 * scale, quantile(0.1)), edgeSoftness = softness.reduce((a, b) => a + b, 0) / Math.max(1, softness.length);
  // A one-pixel interpolation ramp is not evidence of wet bristles: require a resolved broad, soft flank.
  const instrument = kind.type === 'dry' || kind.type === 'wash' || (width > 2.6 && edgeSoftness > 1.25 && (widthVariation > 1.35 || width > 3.5)) ? 'brush' : 'nib';
  return { instrument, widths, density, evidence: { width, widthVariation, edgeSoftness } };
}

export function classifyMark(stroke, M) {
  const { D, at, R, scale } = M, P = stroke.points;
  let symmetric = 0, contrast = 0, ground = 0, coherent = 0, rough = 0, repeated = 0, broad = 0, n = 0;
  for (let j = 0; j < P.length; j += 2) {
    const p = P[j], a = P[Math.max(0, j - 2)], b = P[Math.min(P.length - 1, j + 2)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L, width = Math.max(scale, at(R.scaleD, p.x, p.y)), d = Math.max(3 * scale, 2.5 * width);
    // Sample a strip, recentred within the ridge's scale: skeleton simplification can shift a narrow centreline a pixel.
    const side = sign => { const values = []; for (let q = d; q <= d + 3 * scale; q += scale) values.push(at(D, p.x + nx * q * sign, p.y + ny * q * sign)); values.sort((a, b) => a - b); return values[Math.floor(values.length / 4)]; };
    const l = side(1), r = side(-1); let peak = at(D, p.x, p.y);
    for (let q = -width; q <= width; q += scale / 2) peak = Math.max(peak, at(D, p.x + nx * q, p.y + ny * q));
    const c = Math.max(0, peak - Math.max(l, r));
    symmetric += Math.max(0, peak - Math.min(l, r)); contrast += c; ground += Math.min(l, r);
    coherent += at(M.coherence, p.x, p.y); rough += at(M.roughness, p.x, p.y);
    // A broad mound changes little over a nib width. A step has no dark maximum against both sides.
    broad += c / Math.max(1e-5, peak) < 0.12 ? 1 : 0;
    let peaks = 0, last = -Infinity;
    for (let q = -12 * scale; q <= 12 * scale; q += scale) {
      if (Math.abs(q) < d) continue;
      const x = p.x + nx * q, y = p.y + ny * q, v = at(M.fine, x, y), lq = at(M.fine, x - nx * scale, y - ny * scale), rq = at(M.fine, x + nx * scale, y + ny * scale);
      const foot = Math.max(at(M.fine, x - nx * 2 * width, y - ny * 2 * width), at(M.fine, x + nx * 2 * width, y + ny * 2 * width));
      const aligned = Math.abs(at(R.nxD, x, y) * nx + at(R.nyD, x, y) * ny) > 0.8;
      if (v > lq && v >= rq && v - foot > c * 0.25 && aligned && q - last > 2 * scale) { peaks++; last = q; }
    }
    repeated += peaks >= 2 ? 1 : 0; n++;
  }
  n = Math.max(1, n);
  const evidence = { symmetry: contrast / Math.max(1e-5, symmetric), contrast: contrast / n, ground: ground / n, coherence: coherent / n, roughness: rough / n, repetition: repeated / n, broad: broad / n };
  const e = evidence, tonal = e.ground > e.contrast * 0.65;
  let type = 'contour';
  if (e.roughness > 0.55 && e.coherence < 0.65 && tonal) type = 'dry';
  else if (e.symmetry < 0.45 || e.broad > 0.6) type = 'wash';
  else if (tonal && e.repetition > 0.25 && e.coherence > 0.3) type = 'texture';
  else if (tonal && e.contrast < e.ground * 0.45) type = e.roughness > 0.35 ? 'dry' : 'wash';
  return { type, evidence };
}

// Bundles hold neighbouring separate strokes, never bridges between their tips. Darkness resolves the tensor's 180 degree
// ambiguity: the heavier end is the root. Sparse evidence is left to the wash.
export function textureBundles(strokes, M) {
  const pool = strokes.map(s => {
    const P = s.points, p = P[Math.floor(P.length / 2)], a = P[0], b = P[P.length - 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { ...s, x: p.x, y: p.y, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L };
  }), used = new Set(), bundles = [];
  for (let i = 0; i < pool.length; i++) {
    if (used.has(i)) continue; const a = pool[i], nearby = [];
    for (let j = i; j < pool.length; j++) { const b = pool[j]; if (!used.has(j) && Math.hypot(a.x - b.x, a.y - b.y) <= 28 * M.scale && Math.abs(a.ux * b.ux + a.uy * b.uy) > 0.8) nearby.push(j); }
    nearby.sort((i, j) => Math.hypot(pool[i].x - a.x, pool[i].y - a.y) - Math.hypot(pool[j].x - a.x, pool[j].y - a.y));
    if (nearby.length < 5) continue;
    const bundle = nearby.slice(0, 15).map(j => { used.add(j); const s = pool[j], P = s.points; return { ...s, points: M.at(M.D, P[0].x, P[0].y) >= M.at(M.D, P[P.length - 1].x, P[P.length - 1].y) ? P : [...P].reverse() }; });
    bundles.push(bundle);
  }
  return bundles;
}

// Image-derived diagnostics, not ground truth labels. The ridge score stays beside them so suppressing everything
// cannot win recall.
export function markScores(rendered, target, w, h, endpoint = target) {
  const A = measureMarks(rendered, w, h, { endpoint }), B = measureMarks(target, w, h, { endpoint });
  const masks = M => {
    const ridge = ridgeMask(M.R.dark, M.R.nxD, M.R.nyD, w, h, 0.05, 0.02), contour = new Uint8Array(w * h), texture = new Uint8Array(w * h), boundary = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!ridge[i]) continue;
      const ux = -M.R.nyD[i], uy = M.R.nxD[i], s = classifyMark({ points: [{ x: x - ux, y: y - uy }, { x, y }, { x: x + ux, y: y + uy }] }, M);
      contour[i] = s.type === 'contour' ? 1 : 0; texture[i] = s.type === 'texture' || s.type === 'dry' ? 1 : 0; boundary[i] = s.type === 'wash' ? 1 : 0;
    }
    return { contour, texture, boundary, ridge };
  };
  const a = masks(A), b = masks(B); let boundaryInk = 0, marks = 0, lights = 0, lightError = 0, direction = 0, textureN = 0;
  for (let i = 0; i < w * h; i++) {
    if (a.ridge[i]) { marks++; if (b.boundary[i]) boundaryInk++; }
    if (B.reserve[i]) { lights++; lightError += Math.max(0, rendered[i] - target[i]); }
    if (b.texture[i]) { direction += 1 - Math.abs(A.ux[i] * B.ux[i] + A.uy[i] * B.uy[i]); textureN++; }
  }
  return { contour: matchMasks(a.contour, b.contour, w, h, 1), texture: matchMasks(a.texture, b.texture, w, h, 1), boundaryInk: boundaryInk / Math.max(1, marks), lightError: lightError / Math.max(1, lights), directionError: direction / Math.max(1, textureN) };
}
