// Plan-time value optics: what a film of paint sends back to the eye, and the strength of one flat wash.
//
// Two rules, both from the sheet's own Kubelka-Munk optics (src/media/km.mjs), neither fitted:
//
// 1. A cell's paint is the film that returns the cell's light. Light crosses a transparent film twice, down to the
//    paper and back, so a thin absorbing film of thickness x has density 2 K x; scattering lifts the darkest films.
//    matchCellLight scales each cell's fitted pigment amounts until the film over the paper returns the cell's light.
// 2. One wash has one strength over its whole shape, and a painter judges a shape by its mass tone: the light the shape
//    sends back as a whole, squinted. Reflected light is not linear in paint (each added layer removes a share of what
//    is left), so a flat wash charged with the mean paint of its cells returns less light than those cells would. The
//    wash is charged at the strength whose flat film, over what is already laid, returns the same light as the cells'
//    own amounts would (createMassTone).
//
// Light is CIE luminance of the rendered sRGB colour: it is what adds when the eye or a lens blurs a shape.
// Plan time only: nothing here is read while the brush paints.

const LIN = Float64Array.from({ length: 4097 }, (_, i) => { const c = i / 4096; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** Linear light of an sRGB-encoded reflectance in 0..1. */
function linear(v) { const t = Math.min(1, Math.max(0, v)) * 4096, i = Math.min(4095, t | 0); return LIN[i] + (LIN[i + 1] - LIN[i]) * (t - i); }

/** Reflectance of one film with absorption kx = K x and scattering sx = S x over a ground of reflectance rp. */
export function filmOverGround(kx, sx, rp) {
  if (kx <= 1e-12 && sx <= 1e-12) return rp;
  let r, t;
  if (sx < 1e-9) { r = 0; t = Math.exp(-kx); }
  else if (kx < 1e-9) { r = sx / (1 + sx); t = 1 / (1 + sx); }
  else {
    const a = 1 + kx / sx, b = Math.sqrt(a * a - 1), z = b * sx;
    if (z > 20) return a - b;
    const sh = Math.sinh(z), c = a * sh + b * Math.cosh(z);
    r = sh / c; t = b / c;
  }
  return r + t * t * rp / (1 - r * rp);
}

const Y = [0.2126, 0.7152, 0.0722];
/** Luminance of a film (per-channel kx, sx) over the paper (per-channel reflectance). */
export function filmLight(kx, sx, paper) {
  return Y[0] * linear(filmOverGround(kx[0], sx[0], paper[0])) + Y[1] * linear(filmOverGround(kx[1], sx[1], paper[1])) + Y[2] * linear(filmOverGround(kx[2], sx[2], paper[2]));
}
export function colourLight(r, g, b) { return Y[0] * linear(r / 255) + Y[1] * linear(g / 255) + Y[2] * linear(b / 255); }

// The largest strength searched for, as a multiple of the starting amounts. A film that cannot reach the light asked
// within it (a target darker than the pigments' own body colour) keeps its starting amounts.
const MAX_SCALE = 64;
/** The scale in 0..MAX_SCALE at which the decreasing function `light(scale)` equals `want`, or null when out of reach. */
function solveScale(light, want) {
  if (light(0) <= want) return 0;
  let lo = 0, hi = 1;
  while (light(hi) > want) { lo = hi; hi *= 2; if (hi > MAX_SCALE) return null; }
  for (let it = 0; it < 40 && hi - lo > 1e-6 * hi; it++) { const mid = (lo + hi) / 2; if (light(mid) > want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * Rule 1. Scales every unprotected cell's pigment amounts so its film over the paper returns the target cell's light.
 * The mix (the proportions between pigments) is kept. A cell lighter than the paper, or darker than its pigments can
 * go, keeps its amounts and is counted in `unmatched`.
 * @returns {{demand: Float32Array, matched: number, unmatched: number, meanScale: number}}
 */
export function matchCellLight({ demand, rgb, pigments, paperRGB, k = pigments.length, protect = null }) {
  const n = demand.length / k, out = Float32Array.from(demand), paper = Array.from(paperRGB, v => v / 255), paperY = filmLight([0, 0, 0], [0, 0, 0], paper);
  const kx = [0, 0, 0], sx = [0, 0, 0], kk = [0, 0, 0], ss = [0, 0, 0];
  let matched = 0, unmatched = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    if (protect?.[i]) continue;
    let mass = 0; kk[0] = kk[1] = kk[2] = ss[0] = ss[1] = ss[2] = 0;
    for (let j = 0; j < k; j++) { const a = demand[i * k + j]; if (!(a > 0)) continue; mass += a; for (let c = 0; c < 3; c++) { kk[c] += a * pigments[j].K[c]; ss[c] += a * pigments[j].S[c]; } }
    if (!(mass > 0)) continue;
    const want = colourLight(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    const scale = want >= paperY ? null : solveScale(s => { for (let c = 0; c < 3; c++) { kx[c] = s * kk[c]; sx[c] = s * ss[c]; } return filmLight(kx, sx, paper); }, want);
    if (scale == null) { unmatched++; continue; }
    matched++; sum += scale;
    for (let j = 0; j < k; j++) out[i * k + j] = demand[i * k + j] * scale;
  }
  return { demand: out, matched, unmatched, meanScale: matched ? sum / matched : 1 };
}

/**
 * Rule 2. Keeps what the plan has laid so far, cell by cell, and finds each passage's strength.
 * `strength(list, mix, asked)`: `list` the passage's cells, `mix[j]` the flat charge of pigment j (the mean of what the
 * cells ask), `asked(i, j)` what cell i asks of pigment j in this passage. Returns the factor on `mix` at which the flat
 * wash over what is already laid returns the same light as the cells' own amounts would. `lay(list, mix)` then books
 * the wash. A shape over `sample` cells is read at that many cells, spread through it by the golden ratio so the
 * sample cannot fall into step with the rows or columns of the grid.
 */
export function createMassTone({ n, pigments, paperRGB, sample = 4096 }) {
  const k = pigments.length, paper = Array.from(paperRGB, v => v / 255);
  const laidK = [0, 1, 2].map(() => new Float32Array(n)), laidS = [0, 1, 2].map(() => new Float32Array(n));
  const kx = [0, 0, 0], sx = [0, 0, 0], mk = [0, 0, 0], ms = [0, 0, 0], PHI = (Math.sqrt(5) - 1) / 2;
  return {
    strength(list, mix, asked) {
      const all = list.length <= sample, count = all ? list.length : sample, at = all ? q => list[q] : q => list[Math.floor(((q * PHI) % 1) * list.length)];
      for (let c = 0; c < 3; c++) { mk[c] = 0; ms[c] = 0; for (let j = 0; j < k; j++) { mk[c] += mix[j] * pigments[j].K[c]; ms[c] += mix[j] * pigments[j].S[c]; } }
      if (!(mk[0] + mk[1] + mk[2] + ms[0] + ms[1] + ms[2] > 0)) return 1;
      let want = 0;
      for (let q = 0; q < count; q++) {
        const i = at(q);
        for (let c = 0; c < 3; c++) { kx[c] = laidK[c][i]; sx[c] = laidS[c][i]; }
        for (let j = 0; j < k; j++) { const a = asked(i, j); if (a > 0) for (let c = 0; c < 3; c++) { kx[c] += a * pigments[j].K[c]; sx[c] += a * pigments[j].S[c]; } }
        want += filmLight(kx, sx, paper);
      }
      const flat = f => { let sum = 0; for (let q = 0; q < count; q++) { const i = at(q); for (let c = 0; c < 3; c++) { kx[c] = laidK[c][i] + f * mk[c]; sx[c] = laidS[c][i] + f * ms[c]; } sum += filmLight(kx, sx, paper); } return sum; };
      return solveScale(flat, want) ?? 1;
    },
    lay(list, mix) {
      for (let c = 0; c < 3; c++) { let dk = 0, ds = 0; for (let j = 0; j < k; j++) { dk += mix[j] * pigments[j].K[c]; ds += mix[j] * pigments[j].S[c]; } const K = laidK[c], S = laidS[c]; for (const i of list) { K[i] += dk; S[i] += ds; } }
    },
    /** Light of what is laid at cell i. */
    light(i) { for (let c = 0; c < 3; c++) { kx[c] = laidK[c][i]; sx[c] = laidS[c][i]; } return filmLight(kx, sx, paper); },
  };
}
