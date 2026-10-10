// Choose the few paints from the box (box.mjs) a source needs, by Kubelka-Munk render error in dE00.
// Forward selection until a paint saves less than `gain`, then a drop pass and a swap pass.
// The error is taken on a blurred sample of every third pixel to keep trials cheap. DOM free.
import { BOX, boxPigment } from './box.mjs';
import { chromaOf } from './palette.mjs';
import { channelDensity, unmix } from './pigments.mjs';
import { renderLayers } from '../media/km.mjs';
import { labPlanes, deltaE2000 } from '../eval/colour.mjs';
import { gaussian } from '../keyframes/density.mjs';

/** The source as the chooser sees it: blurred by `sigma`, every `stride`-th pixel, as colour, Lab and density. */
export function sampleSource(px, w, h, paperRGB, { stride = 3, sigma = 2 } = {}) {
  const n = w * h, m = Math.ceil(n / stride), rgb = new Uint8ClampedArray(m * 3);
  for (let c = 0; c < 3; c++) {
    const B = gaussian(Float32Array.from({ length: n }, (_, i) => px[i * 3 + c]), w, h, sigma);
    for (let i = 0, s = 0; i < n; i += stride, s++) rgb[s * 3 + c] = B[i];
  }
  const flat = new Uint8ClampedArray(m * 3);
  for (let s = 0; s < m; s++) for (let c = 0; c < 3; c++) flat[s * 3 + c] = paperRGB[c];
  return { m, rgb, flat, paperRGB, lab: labPlanes(rgb, m, paperRGB), D: channelDensity(rgb, m, paperRGB) };
}

/** The sample error read only on the darkest tenth of the sample, which the mean never feels. */
export function darkError(sample, paints) {
  const { m, lab } = sample;
  const order = Array.from({ length: m }, (_, s) => s).sort((a, b) => lab.L[a] - lab.L[b]);
  const deep = new Set(order.slice(0, Math.max(1, Math.round(m * 0.1))));
  const { m: _m, ...rest } = sample;
  const idx = [...deep];
  const sub = {
    m: idx.length, paperRGB: sample.paperRGB,
    lab: { L: Float32Array.from(idx, i => sample.lab.L[i]), a: Float32Array.from(idx, i => sample.lab.a[i]), b: Float32Array.from(idx, i => sample.lab.b[i]) },
    D: Float32Array.from(idx.flatMap(i => [sample.D[i * 3], sample.D[i * 3 + 1], sample.D[i * 3 + 2]])),
    flat: Uint8ClampedArray.from(idx.flatMap(i => [sample.flat[i * 3], sample.flat[i * 3 + 1], sample.flat[i * 3 + 2]])),
    rgb: Uint8ClampedArray.from(idx.flatMap(i => [sample.rgb[i * 3], sample.rgb[i * 3 + 1], sample.rgb[i * 3 + 2]])),
  };
  return sampleError(sub, paints);
}

/** How warm the darkest tenth is, as mean b*. With paints null it reads the source itself. */
export function darkWarmth(sample, paints) {
  const { m, lab } = sample;
  const idx = Array.from({ length: m }, (_, s) => s).sort((a, b) => lab.L[a] - lab.L[b]).slice(0, Math.max(1, Math.round(m * 0.1)));
  if (!paints) { let b = 0; for (const i of idx) b += lab.b[i]; return b / idx.length; }
  const L2 = renderedLab(sample, paints);
  let b = 0; for (const i of idx) b += L2.b[i];
  return b / idx.length;
}

// Every per-cell result depends only on the cell's colour, so the work runs once per distinct colour.
function uniqueOf(sample) {
  if (sample._u) return sample._u;
  const { m, rgb } = sample, ids = new Int32Array(m), seen = new Map(), first = [];
  for (let s = 0; s < m; s++) {
    const key = (rgb[s * 3] << 16) | (rgb[s * 3 + 1] << 8) | rgb[s * 3 + 2];
    let j = seen.get(key); if (j === undefined) { j = first.length; seen.set(key, j); first.push(s); }
    ids[s] = j;
  }
  const u = first.length, Du = new Float32Array(u * 3);
  for (let j = 0; j < u; j++) for (let c = 0; c < 3; c++) Du[j * 3 + c] = sample.D[first[j] * 3 + c];
  return (sample._u = { ids, first: Int32Array.from(first), u, Du, flat: sample.flat.subarray(0, u * 3) });
}
/** The sample's rendered colour (Lab) with these paints, per different colour: { L, a, b } of length u. */
export function renderedUnique(sample, paints) {
  const U = uniqueOf(sample), { u } = U, k = paints.length, pigments = paints.map(p => boxPigment(p));
  const A = unmix(U.Du, u, pigments.map(q => q.K.map(v => v / 0.55)));
  const layer = pigments.map((_, j) => Float32Array.from({ length: u }, (_, s) => A[s * k + j]));
  return { U, L2: labPlanes(renderLayers([layer], pigments, U.flat, u, 1), u, sample.paperRGB) };
}
/** The rendered Lab of every cell (the per-colour result handed back to each cell). */
export function renderedLab(sample, paints, rendered = renderedUnique(sample, paints)) {
  const { U, L2 } = rendered, { m } = sample, L = new Float32Array(m), a = new Float32Array(m), b = new Float32Array(m);
  for (let s = 0; s < m; s++) { const j = U.ids[s]; L[s] = L2.L[j]; a[s] = L2.a[j]; b[s] = L2.b[j]; }
  return { L, a, b };
}

/** Mean CIEDE2000 between the sample and its render with these paints: the amounts unmixed, laid as one layer. */
export function sampleError(sample, paints, rendered = renderedUnique(sample, paints)) {
  const { m, lab } = sample, { U, L2 } = rendered, de = new Float64Array(U.u);
  for (let j = 0; j < U.u; j++) { const s = U.first[j]; de[j] = deltaE2000([lab.L[s], lab.a[s], lab.b[s]], [L2.L[j], L2.a[j], L2.b[j]]); }
  let e = 0;
  for (let s = 0; s < m; s++) e += de[U.ids[s]];
  return e / m;
}

/**
 * Forward selection of paints from the box, then a pass dropping paints the others made redundant, then one swap pass.
 * The drop pass matters because the first paint is chosen for a palette of one, often a neutral between two colours.
 * @returns { paints, e, trail } the chosen box entries, their sample error, and the error after each addition
 */
export function chooseBox(px, w, h, paperRGB, { library = BOX, min = 2, max = 5, gain = 0.25, swap = true, stride = 3, score: scoreOf = null } = {}) {
  const sample = sampleSource(px, w, h, paperRGB, { stride });
  const cache = new Map();
  // `score` (paints => error) replaces the sample's mean CIEDE2000 as the objective (palettewide.mjs)
  const score = paints => {
    const key = paints.map(p => p.key).sort().join('+');
    if (!cache.has(key)) cache.set(key, scoreOf ? scoreOf(paints) : sampleError(sample, paints));
    return cache.get(key);
  };
  const lowest = trials => trials.map(t => ({ t, e: score(t) })).reduce((a, b) => (b.e < a.e ? b : a));
  let chosen = [];
  const trail = [];
  while (chosen.length < Math.min(max, library.length)) {
    const best = lowest(library.filter(p => !chosen.includes(p)).map(p => [...chosen, p]));
    if (chosen.length >= min && score(chosen) - best.e < gain) break;
    chosen = best.t;
    trail.push(best.e);
  }
  // drop the paint whose loss costs least, for as long as that loss costs less than a paint has to earn
  while (chosen.length > min) {
    const best = lowest(chosen.map(p => chosen.filter(q => q !== p)));
    if (best.e - score(chosen) >= gain) break;
    chosen = best.t;
  }
  // Add a dark when the dark cells' warmth (b*) is off. dE00 compresses hue error at low lightness and misses it.
  const darkKeys = ['lampblack', 'paynes', 'sepia', 'umber'];
  // no typed-array spread into Math.min: hundreds of thousands of cells overflow the call stack
  let darkest = Infinity;
  for (let i = 0; i < sample.lab.L.length; i++) if (sample.lab.L[i] < darkest) darkest = sample.lab.L[i];
  if (darkest < 45 && !chosen.some(p => darkKeys.includes(p.key))) {
    const want = darkWarmth(sample, null), have = darkWarmth(sample, chosen);
    if (Math.abs(have - want) > 1.5) {
      let best = null;
      for (const p of library.filter(q => darkKeys.includes(q.key) && !chosen.includes(q))) {
        const b = darkWarmth(sample, [...chosen, p]);
        const off = Math.abs(b - want);
        if (best === null || off < best.off) best = { p, off };
      }
      if (best && best.off < Math.abs(have - want)) {
        chosen = [...chosen, best.p];
        trail.push(score(chosen));
      }
    }
  }
  if (swap) {
    for (let i = 0; i < chosen.length; i++) {
      const trials = library.filter(p => !chosen.includes(p)).map(p => chosen.map((q, j) => (j === i ? p : q)));
      const best = lowest([chosen, ...trials]);
      chosen = best.t;
    }
  }
  return { paints: chosen, e: score(chosen), trail };
}

/** The chosen paints as a palette in paletteOf's shape, so the painter can use it in place of a recovered one. */
export function boxPalette(px, w, h, paperRGB, options = {}) {
  const n = w * h, { paints, e, trail } = chooseBox(px, w, h, paperRGB, options);
  const chroma = chromaOf(channelDensity(px, n, paperRGB), n);
  return {
    pigments: paints.map(p => boxPigment(p)), ink: 0, chroma, paintChroma: chroma, inkApart: 0, monochrome: false,
    box: { keys: paints.map(p => p.key), sampleError: e, trail },
  };
}
