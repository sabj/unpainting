// Kubelka-Munk optics for transparent pigment layers, following Computer-Generated Watercolor, section 5: each pigment has
// absorption K and scattering S per channel; a layer of thickness x has reflectance R and transmittance T; layers are
// composited in order over the paper: R = R1 + T1^2 R2 / (1 - R1 R2), T = T1 T2 / (1 - R1 R2). Mixed pigments within
// one layer use thickness-weighted K and S. Includes analytic limits for no scattering or no
// absorption, and overflow-safe evaluation for thick layers. DOM free.

/** K and S from a pigment's colour over white (Rw) and over black (Rb), per channel in 0..1 (Computer-Generated Watercolor, section 5.1). */
export function fromColours(Rw, Rb) {
  const K = [], S = [];
  for (let c = 0; c < 3; c++) {
    const rw = Math.min(0.995, Math.max(0.005, Rw[c])), rb = Math.min(rw - 0.001, Math.max(0.001, Rb[c]));
    const a = 0.5 * (rw + (rb - rw + 1) / rb), b = Math.sqrt(Math.max(1e-9, a * a - 1));
    const arg = (b * b - (a - rw) * (a - 1)) / (b * (1 - rw)), s = (1 / b) * 0.5 * Math.log((arg + 1) / (arg - 1));
    S.push(Math.max(0, s)); K.push(Math.max(0, s * (a - 1)));
  }
  return { K, S };
}

// The same reflectance and transmittance in two module variables instead of a pair: this runs three times per
// layer per cell.
let RT_R = 0, RT_T = 1;
function rt(Kc, Sc, x) {
  if (x <= 1e-9) { RT_R = 0; RT_T = 1; return; }
  if (Sc < 1e-7) { RT_R = 0; RT_T = Math.exp(-Kc * x); return; }                      // pure absorber
  if (Kc < 1e-7) { const t = Sc * x; RT_R = t / (1 + t); RT_T = 1 / (1 + t); return; } // pure scatterer
  const a = 1 + Kc / Sc, b = Math.sqrt(a * a - 1), bSx = b * Sc * x;
  if (bSx > 20) { RT_R = a - b; RT_T = 0; return; }                                   // effectively infinitely thick
  const sh = Math.sinh(bSx), ch = Math.cosh(bSx), c = a * sh + b * ch;
  RT_R = sh / c; RT_T = b / c;
}

/** Reflectance and transmittance of a layer. */
export function layerRT(Kc, Sc, x) { rt(Kc, Sc, x); return [RT_R, RT_T]; }

/**
 * Composite layers (arrays of per-pigment thickness fields, oldest first) over a paper colour buffer. `scale` converts
 * pigment mass to KM thickness. `extra(i, c)` multiplies the final reflectance (graphite on top, for instance).
 */
export function renderLayers(layers, pigments, paperRGB, n, scale = 1, extra, micro = null) {
  // the thread pool's banded version (sheet-par.mjs): the same arithmetic per cell over a share of the cells each
  if (RENDER_THREADS && !extra && !micro) { const out = RENDER_THREADS(layers, pigments, paperRGB, n, scale); if (out) return out; }
  const out = new Uint8ClampedArray(n * 3); // typed array: runs in a browser worker too
  renderCells(layers, pigments.map(p => p.K), pigments.map(p => p.S), paperRGB, 0, n, scale, extra, out, null, null, micro);
  return out;
}

/**
 * Optical microtexture of a granulating paint on rough paper. `micro.t` is a zero-mean per-cell texture in -1..1
 * (hollows positive) and `micro.amp[k]` how strongly paint k follows it. Thickness is multiplied by 1 + amp[k] t,
 * moving paint between neighbouring cells without changing its mass. Render time only; null leaves it off.
 */
export function microAmps(pigments, strength) {
  return pigments.map(p => strength * Math.min(1, 4 * Math.max(0, p.gamma ?? 0)));
}
let RENDER_THREADS = null;
export const useRenderThreads = f => { RENDER_THREADS = f; };

/** Cells c0..c1 - 1 of renderLayers, into `out`. Kp and Sp are the pigments' K and S. */
export function renderCells(layers, Kp, Sp, paperRGB, c0, c1, scale, extra, out, init = null, keep = null, micro = null) {
  // `init` (3 doubles a cell) starts from layers already composited instead of the paper; `keep` saves the composite
  // before 8-bit rounding (render-cache.mjs)
  const K = Kp.length, NL = layers.length;
  // a cell's layers are walked once, not once per channel
  const frac = new Float64Array(K);
  // Cells go a block at a time and, inside a block, a layer at a time, so empty layers are skipped per block.
  // Each cell still sees its layers oldest first with the same arithmetic.
  const B = Math.min(c1 - c0, RENDER_BLOCK), R = new Float64Array(B * 3), xt = new Float64Array(B);
  for (let b0 = c0; b0 < c1; b0 += B) {
    const b1 = Math.min(c1, b0 + B), nb = b1 - b0;
    if (init) for (let c = 0; c < nb * 3; c++) R[c] = init[b0 * 3 + c];
    else for (let c = 0; c < nb * 3; c++) R[c] = paperRGB[b0 * 3 + c] / 255;
    for (let L = 0; L < NL; L++) {
      const layer = layers[L];
      xt.fill(0, 0, nb);
      for (let k = 0; k < K; k++) { const a = layer[k]; for (let c = 0; c < nb; c++) xt[c] += a[b0 + c]; }
      for (let c = 0; c < nb; c++) {
        const x0 = xt[c]; if (x0 <= 1e-7) continue;
        const i = b0 + c;
        let x;
        if (micro) {
          // microtexture (microAmps): each paint's share moved toward the hollows by its own granulation
          const tv = micro.t[i];
          let xm = 0;
          for (let k = 0; k < K; k++) { const v = layer[k][i] * (1 + micro.amp[k] * tv); frac[k] = v; xm += v; }
          if (xm <= 1e-9) continue;
          for (let k = 0; k < K; k++) frac[k] /= xm;
          x = xm * scale;
        } else {
          for (let k = 0; k < K; k++) frac[k] = layer[k][i] / x0;
          x = x0 * scale;
        }
        let Kc = 0, Sc = 0, r = R[c * 3]; for (let k = 0; k < K; k++) { Kc += frac[k] * Kp[k][0]; Sc += frac[k] * Sp[k][0]; }
        rt(Kc, Sc, x); R[c * 3] = RT_R + RT_T * RT_T * r / (1 - RT_R * r);
        Kc = 0; Sc = 0; r = R[c * 3 + 1]; for (let k = 0; k < K; k++) { Kc += frac[k] * Kp[k][1]; Sc += frac[k] * Sp[k][1]; }
        rt(Kc, Sc, x); R[c * 3 + 1] = RT_R + RT_T * RT_T * r / (1 - RT_R * r);
        Kc = 0; Sc = 0; r = R[c * 3 + 2]; for (let k = 0; k < K; k++) { Kc += frac[k] * Kp[k][2]; Sc += frac[k] * Sp[k][2]; }
        rt(Kc, Sc, x); R[c * 3 + 2] = RT_R + RT_T * RT_T * r / (1 - RT_R * r);
      }
    }
    if (keep) for (let c = 0; c < nb * 3; c++) keep[b0 * 3 + c] = R[c];
    if (!out) continue;
    for (let c = 0; c < nb; c++) {
      const i = b0 + c;
      let R0 = R[c * 3], R1 = R[c * 3 + 1], R2 = R[c * 3 + 2];
      if (extra) { R0 *= extra(i, 0); R1 *= extra(i, 1); R2 *= extra(i, 2); }
      out[i * 3] = Math.max(0, Math.min(255, Math.round(R0 * 255)));
      out[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(R1 * 255)));
      out[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(R2 * 255)));
    }
  }
}
// cells per block: small enough for the block's working arrays to stay in cache
const RENDER_BLOCK = 4096;

// Cached per-cell optical coefficients of the sparse fixed lower layers, kept as doubles: floats change the image.
const OPTICAL_LAYERS = new WeakMap();
function opticalLayer(layer, pigments, n, scale, micro) {
  const version = layer._cacheVersion ?? 0;
  let cache = OPTICAL_LAYERS.get(layer);
  if (cache && cache.version === version && cache.pigments === pigments && cache.n === n && cache.scale === scale && cache.micro === micro) return cache;
  const K = pigments.length, frac = new Float64Array(K), indices = [], coefficients = [];
  for (let i = 0; i < n; i++) {
    let x0 = 0; for (let k = 0; k < K; k++) x0 += layer[k][i];
    if (x0 <= 1e-7) continue;
    let x;
    if (micro) {
      const tv = micro.t[i]; let xm = 0;
      for (let k = 0; k < K; k++) { const v = layer[k][i] * (1 + micro.amp[k] * tv); frac[k] = v; xm += v; }
      if (xm <= 1e-9) continue;
      for (let k = 0; k < K; k++) frac[k] /= xm;
      x = xm * scale;
    } else {
      for (let k = 0; k < K; k++) frac[k] = layer[k][i] / x0;
      x = x0 * scale;
    }
    indices.push(i);
    for (let c = 0; c < 3; c++) {
      let Kc = 0, Sc = 0;
      for (let k = 0; k < K; k++) { Kc += frac[k] * pigments[k].K[c]; Sc += frac[k] * pigments[k].S[c]; }
      rt(Kc, Sc, x); coefficients.push(RT_R, RT_T * RT_T);
    }
  }
  cache = { version, pigments, n, scale, micro, indices: Uint32Array.from(indices), coefficients: Float64Array.from(coefficients) };
  OPTICAL_LAYERS.set(layer, cache); return cache;
}

/** Same pixels as renderLayers; the last fixed layer and wet wash remain live. */
export function renderLayersCached(layers, pigments, paperRGB, n, scale = 1, micro = null) {
  const R = new Float64Array(n * 3), out = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < R.length; i++) R[i] = paperRGB[i] / 255;
  const fixed = Math.max(0, layers.length - 2);
  for (let L = 0; L < fixed; L++) {
    const cache = opticalLayer(layers[L], pigments, n, scale, micro), values = cache.coefficients;
    for (let q = 0; q < cache.indices.length; q++) {
      const i = cache.indices[q] * 3;
      for (let c = 0; c < 3; c++) {
        const j = q * 6 + c * 2, r = values[j], t2 = values[j + 1], under = R[i + c];
        R[i + c] = r + t2 * under / (1 - r * under);
      }
    }
  }
  renderCells(layers.slice(fixed), pigments.map(p => p.K), pigments.map(p => p.S), paperRGB, 0, n, scale, null, out, R, null, micro);
  return out;
}
