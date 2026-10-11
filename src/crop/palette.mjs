// Recovers the palette a picture was painted with. Transparent layers multiply, so densities add: D_c = sum_k a_k * K_ck.
// A pigment is a direction in (D_r, D_g, D_b); recovering the palette is clustering those directions.
// The ink stays its own pigment, or the washes inherit its darkness and every glaze comes out muddy.
// A monochrome picture has a palette of one, still measured: walnut, sepia and lamp black absorb differently.
import { channelDensity, estimatePigments, unmix } from './pigments.mjs';

/** Mean chroma: how far, in radians, a pixel's density direction typically sits from the mean direction.
 *  Near 0.1 for a one-colour wash; several times that for a watercolour with sky and skin. */
export function chromaOf(D3, n, { minStrength = 0.15 } = {}) {
  const mean = [0, 0, 0]; let weight = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, D3[i * 3]), b = Math.max(0, D3[i * 3 + 1]), c = Math.max(0, D3[i * 3 + 2]), m = Math.hypot(a, b, c);
    if (m < minStrength) continue;
    mean[0] += a; mean[1] += b; mean[2] += c; weight += m;
  }
  if (!weight) return 0;
  const mm = Math.hypot(...mean), u = mean.map(v => v / mm);
  let spread = 0, count = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, D3[i * 3]), b = Math.max(0, D3[i * 3 + 1]), c = Math.max(0, D3[i * 3 + 2]), m = Math.hypot(a, b, c);
    if (m < minStrength) continue;
    spread += Math.acos(Math.min(1, Math.max(-1, (a * u[0] + b * u[1] + c * u[2]) / m))); count++;
  }
  return count ? spread / count : 0;
}

/**
 * The pigments this picture was made with, as sheet pigments ready for createSheet.
 *
 * @param rgb    the finished picture, raw RGB
 * @param n      pixel count
 * @param paper  the paper colour [r,g,b]
 * @param inkMask optional: where the separator says ink is. Those pixels are excluded from the paint clustering and
 *                supply the ink pigment instead, so a pen line does not pull a wash colour towards black.
 * @returns { pigments, ink, chroma, monochrome } where `ink` is the index of the ink pigment, or -1 if there is none.
 */
export function paletteOf(rgb, n, paper, {
  paints = 3, kscale = 0.55, inkMask = null,
  // below this mean chroma the picture was made with one fluid and gets a palette of one
  monoChroma = 0.16,
  // how much of the unexplained colour another pigment has to remove before it is worth having
  gainPerPigment = 0.02,
  // a pigment whose absorption is this flat across the channels is grey, and grey is mixed rather than bought
  dropNeutral = true, neutralBelow = 0.18,
  // the pen's fluid is a pigment of its own only if its direction sits this far off every paint (radians)
  inkApart = 0.12,
  // how many pans to rescue for colours the mass-weighted fit cannot see (src/crop/pigments.mjs)
  rescue = 0,
  // a transparent ink scatters very little; a body colour scatters more
  inkScatter = [0.06, 0.025, 0.014], paintScatter = [0.02, 0.02, 0.02],
  // whether a one-pigment picture is treated as ink or as paint (--monoscatter)
  monoScatter = 'ink',
  // An invocation of pickPalette may compare several palettes for the same immutable source.
  shared = null,
} = {}) {
  const cached = (key, make) => {
    if (!shared) return make();
    if (!shared.has(key)) shared.set(key, make());
    return shared.get(key);
  };
  const D3 = cached('density', () => channelDensity(rgb, n, paper));
  const chroma = cached('chroma', () => chromaOf(D3, n));

  // the ink: the mean density direction of the pixels called ink, or of the darkest hundredth without a mask.
  // It is measured off this picture, not assumed grey.
  const inkDir = cached('ink-direction', () => {
    const v = [0, 0, 0]; let count = 0;
    if (inkMask) { for (let i = 0; i < n; i++) if (inkMask[i]) { for (let c = 0; c < 3; c++) v[c] += Math.max(0, D3[i * 3 + c]); count++; } }
    if (count < 20) {
      const lum = i => Math.max(0, D3[i * 3]) + Math.max(0, D3[i * 3 + 1]) + Math.max(0, D3[i * 3 + 2]);
      const idx = [...Array(n).keys()].sort((a, b) => lum(b) - lum(a)).slice(0, Math.max(1, Math.round(n / 100)));
      v[0] = v[1] = v[2] = 0;
      for (const i of idx) for (let c = 0; c < 3; c++) v[c] += Math.max(0, D3[i * 3 + c]);
    }
    const m = Math.hypot(...v);
    return m < 1e-6 ? [0.577, 0.577, 0.577] : v.map(x => x / m);
  });

  const asPigment = (dir, scatter, gamma) => ({ K: dir.map(v => v * kscale), S: [...scatter], rho: 0.05, omega: 1.4, gamma });

  // The pen's marks are taken out first: how many paints a picture needs is a question about the paint alone.
  // A sheet washed in one colour needs one pigment however strong; hue variety is what needs more.
  const { paintD, inkPixels } = cached('paint-density', () => {
    const paintD = new Float32Array(n * 3);
    let inkPixels = 0;
    for (let i = 0; i < n; i++) {
      const skip = inkMask && inkMask[i];
      if (skip) inkPixels++;
      for (let c = 0; c < 3; c++) paintD[i * 3 + c] = skip ? 0 : D3[i * 3 + c];
    }
    return { paintD, inkPixels };
  });
  const paintChroma = cached('paint-chroma', () => chromaOf(paintD, n));
  const estimate = (k, rescueCount = 0) => cached(`directions:${k}:${rescueCount}`, () => estimatePigments(paintD, n, k, { rescue: rescueCount }));
  // Fit one, two, three pigments and continue while the extra one removes a real share of the unexplained colour.
  // A threshold on hue spread cannot separate a one-colour sheet from a many-colour one.
  const fitError = k => cached(`fit-error:${k}`, () => {
    if (k < 1) return Infinity;
    // estimatePigments seeds from three directions and can return fewer than asked; never index past its list.
    const dirs = estimate(k).slice(0, k);
    if (dirs.length < k) return Infinity;
    // every third pixel: this is a ratio, not a total. Each pixel's unmix is independent, so only those are unmixed.
    const ns = Math.ceil(n / 3), sampleD = new Float32Array(ns * 3);
    for (let s = 0; s < ns; s++) for (let c = 0; c < 3; c++) sampleD[s * 3 + c] = paintD[s * 9 + c];
    const A = unmix(sampleD, ns, dirs);
    let err = 0, mass = 0;
    for (let i = 0; i < n; i += 3) {
      const s = i / 3;
      for (let c = 0; c < 3; c++) {
        let made = 0;
        for (let j = 0; j < dirs.length; j++) made += A[s * dirs.length + j] * dirs[j][c];
        err += Math.abs(paintD[i * 3 + c] - made);
        mass += Math.abs(paintD[i * 3 + c]);
      }
    }
    return mass > 0 ? err / mass : 0;
  });
  // Scan every count and keep the largest k whose every step earned the margin, looking past a single plateau.
  // Too few pans make every colour a mix of two, which gives mud and missing highlights.
  const errs = [0, fitError(1)];
  for (let k = 2; k <= paints; k++) errs[k] = fitError(k);
  let count = 1;
  for (let k = 2; k <= paints; k++) {
    let ok = true;
    for (let j = 2; j <= k; j++) if (errs[j - 1] - errs[j] < gainPerPigment) { ok = false; break; }
    if (ok) count = k;
    else {
      // one plateau may sit in front of a pan that earns a lot: allow a single skip, then require the pair to pay
      let pairOk = k > 2 && errs[k - 2] - errs[k] >= gainPerPigment * 2;
      for (let j = 2; j <= k - 2 && pairOk; j++) if (errs[j - 1] - errs[j] < gainPerPigment) pairOk = false;
      if (pairOk) count = k;
    }
  }
  // a rescue may buy a pan, so the slice has to leave room for it
  let dirs = estimate(count, rescue).slice(0, count + rescue);
  // A grey direction is mud: clustering finds one because a picture's average paint is grey, then unmixing sends most
  // mass to it. A watercolour box is chromatic, so a direction this flat is dropped and mixed from the others.
  if (dropNeutral && dirs.length >= 1) {
    const flatness = d => { const hi = Math.max(...d), lo = Math.min(...d); return hi > 1e-6 ? (hi - lo) / hi : 0; };
    // Dropping the grey leaves the box short, so ask the clustering for more until enough chromatic directions return.
    let want = count, got = dirs.filter(d => flatness(d) > neutralBelow);
    for (let k = count; got.length < want && k <= paints + 2; k++) {
      const more = estimate(k, rescue).slice(0, k + rescue).filter(d => flatness(d) > neutralBelow);
      if (more.length > got.length) got = more;
    }
    if (got.length) dirs = got.slice(0, Math.max(1, want + rescue));
  }
  count = dirs.length;
  // A one-colour picture is not necessarily ink. inkScatter [0.06, 0.025, 0.014] scatters red four times as much as
  // blue, as walnut ink does; paintScatter is flat and low. monoScatter chooses which a one-pigment sheet gets.
  const monoS = monoScatter === 'ink' ? inkScatter : paintScatter;
  const pigments = dirs.map(d => asPigment(d, count === 1 ? monoS : paintScatter, count === 1 ? 0.55 : 0.25));

  // The ink gets its own pigment only when pen and brush fluids differ. Walnut line over walnut wash is one fluid;
  // splitting it lets a wash inherit the line's darkness. Carbon over a blue wash is two; merging them paints it blue.
  const apart = Math.min(...dirs.slice(0, count).map(d => Math.acos(Math.min(1, Math.max(-1, d[0] * inkDir[0] + d[1] * inkDir[1] + d[2] * inkDir[2])))));
  const separateInk = inkPixels >= 20 && apart > inkApart;
  if (separateInk) pigments.push(asPigment(inkDir, inkScatter, 0.55));
  return {
    pigments, ink: separateInk ? pigments.length - 1 : 0,
    chroma, paintChroma, inkApart: apart, monochrome: count === 1 && !separateInk,
  };
}
