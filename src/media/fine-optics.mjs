import { renderLayers } from './km.mjs';

// Bound temporary suspension storage independently of the painting's area.
// Fixed layers are read through views; only G+D+P needs a temporary f32 sum.
const CHUNK = 16384;

/** Native KM RGB, without an additional whole-sheet palette snapshot. */
export function renderFine(F, paperRGB, scale = 1) {
  if (F.L?.steps) throw new Error('two grids: consume the fine step before rendering');
  if (!Number.isSafeInteger(F.fn) || F.fn < 1 || !ArrayBuffer.isView(paperRGB) || paperRGB.length !== F.fn * 3) throw new Error('fine optics: paper geometry does not match the fine sheet');
  if (!(Number.isFinite(scale) && scale >= 0)) throw new Error('fine optics: KM scale must be finite and nonnegative');
  const out = new Uint8ClampedArray(F.fn * 3), count = Math.min(CHUNK, F.fn);
  const top = Array.from({ length: F.K }, () => new Float32Array(count));
  for (let start = 0; start < F.fn; start += count) {
    const end = Math.min(F.fn, start + count), n = end - start;
    for (let k = 0; k < F.K; k++) {
      const g = F.G[k], d = F.D[k], p = F.P[k], a = top[k];
      for (let i = start; i < end; i++) a[i - start] = g[i] + d[i] + p[i];
    }
    const layers = F.layers.map(layer => layer.map(a => a.subarray(start, end)));
    layers.push(top.map(a => a.subarray(0, n)));
    out.set(renderLayers(layers, F.sheet.pigments, paperRGB.subarray(start * 3, end * 3), n, scale), start * 3);
  }
  return out;
}
