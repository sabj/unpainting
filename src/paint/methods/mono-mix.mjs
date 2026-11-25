// Mixes for a near-monochrome subject (a brown wash drawing, a sepia study): strengths of the subject's own one or two
// paints, not the palette's nearest to each study colour. The study wash plan (study-washes.mjs) trusts a block-in
// study's shapes and values, not its hues: an image model drifts a brown drawing to pink and violet, and the palette's
// nearest to those is a blue-grey. Here the subject is read only at a coarse scale, as the palette pick reads it: its
// few colours, and whether one or two paints in a fixed proportion reach them all. Plan time only.
import { kmeans } from './study-shapes.mjs';
import { labOf } from '../../eval/colour.mjs';
import { filmLab } from './puddles.mjs';

/** The subject is read on a grid about this many cells across, its colours as this many clusters. */
const GRID = 48, COLOURS = 10;
/** A cell is coloured when its chroma (a*b*, against the paper) is at least this; ... */
const CHROMATIC = 5;
/** ... and the subject is near-monochrome when at least this share of its coloured cells lie within HUE_SPAN degrees of their mean hue ... */
const HUE_SHARE = 0.95, HUE_SPAN = 25;
/** ... and one or two paints reach its colours at their own lightness within this mean distance in a*b*. */
const FIT_AB = 6;
/** Proportions of the second paint tried. */
const RATIOS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];

/** The strength (total paint) of proportions `mix` whose film reaches lightness L; with its Lab. */
function atLightness(mix, L, pigments, paperRGB) {
  let lo = 0.01, hi = 32; const lab = t => filmLab(mix.map(v => v * t), pigments, paperRGB);
  if (lab(hi)[0] > L) return { t: hi, lab: lab(hi) };
  for (let it = 0; it < 18; it++) { const mid = Math.sqrt(lo * hi); if (lab(mid)[0] > L) lo = mid; else hi = mid; }
  const t = Math.sqrt(lo * hi); return { t, lab: lab(t) };
}

/**
 * {mono: true, pigments: [j] or [j, k], k, fits: [{L, r}], fit, hueShare, note} (plain data; monoAt mixes from it) when the
 * w x h sRGB subject is near-monochrome and its paints reach it; else {mono: false, note}.
 */
export function monoPaints(rgb, w, h, pigments, paperRGB) {
  const step = Math.max(1, Math.round(w / GRID)), rows = [];
  for (let y = Math.floor(step / 2); y < h; y += step) for (let x = Math.floor(step / 2); x < w; x += step) {
    let r = 0, g = 0, b = 0, c = 0; for (let dy = 0; dy < step && y - (step >> 1) + dy < h; dy++) for (let dx = 0; dx < step && x - (step >> 1) + dx < w; dx++) { const i = (y - (step >> 1) + dy) * w + x - (step >> 1) + dx; r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; c++; }
    rows.push(...labOf([r / c, g / c, b / c], 0, paperRGB));
  }
  const n = rows.length / 3, hues = [];
  let sa = 0, sb = 0; for (let i = 0; i < n; i++) { const a = rows[i * 3 + 1], b = rows[i * 3 + 2]; if (Math.hypot(a, b) >= CHROMATIC) { const hh = Math.atan2(b, a); hues.push(hh); sa += Math.cos(hh); sb += Math.sin(hh); } }
  if (hues.length < 0.2 * n) return { mono: false, note: `mono: ${(100 * hues.length / n).toFixed(0)}% of the subject coloured; read as a grey picture, not one paint` };
  const mean = Math.atan2(sb, sa), near = hues.filter(hh => Math.abs(((hh - mean) * 180 / Math.PI + 540) % 360 - 180) <= HUE_SPAN).length / hues.length;
  if (near < HUE_SHARE) return { mono: false, note: `mono: no (${(100 * near).toFixed(0)}% of the coloured cells within ${HUE_SPAN} degrees of their mean hue)` };
  const colours = kmeans(Float32Array.from(rows), 3, COLOURS, 12).filter(c => c[0] < 97);
  // every paint alone and every pair at each proportion: the mean a*b* distance to the colours at their own lightness
  const k = pigments.length, cand = [];
  for (let j = 0; j < k; j++) for (let q = j; q < k; q++) {
    const props = q === j ? [0] : RATIOS.slice(1, -1);
    const per = colours.map(c => Math.min(...props.map(r => { const mix = new Array(k).fill(0); mix[j] += 1 - r; mix[q] += r; const f = atLightness(mix, c[0], pigments, paperRGB).lab; return Math.hypot(f[1] - c[1], f[2] - c[2]); })));
    cand.push({ pair: q === j ? [j] : [j, q], e: per.reduce((a, v) => a + v, 0) / per.length });
  }
  cand.sort((a, b) => a.e - b.e);
  // one paint unless a pair is clearly better
  const one = cand.find(c => c.pair.length === 1), best = one && one.e <= cand[0].e + 1.5 ? one : cand[0];
  if (best.e > FIT_AB) return { mono: false, note: `mono: hue held (${(100 * near).toFixed(0)}%) but no one or two paints reach it (best ${best.e.toFixed(1)} a*b*)` };
  // for a pair: its proportion at each colour's lightness, so a value is mixed as the subject mixes it there
  const fits = best.pair.length === 1 ? [] : colours.map(c => {
    let br = 0, be = Infinity; for (const r of RATIOS.slice(1, -1)) { const mix = new Array(k).fill(0); mix[best.pair[0]] = 1 - r; mix[best.pair[1]] = r; const f = atLightness(mix, c[0], pigments, paperRGB).lab, e = Math.hypot(f[1] - c[1], f[2] - c[2]); if (e < be) { be = e; br = r; } }
    return { L: c[0], r: br };
  }).sort((a, b) => a.L - b.L);
  return { mono: true, pigments: best.pair, k, fits, fit: best.e, hueShare: near, note: `mono: yes, ${best.pair.length === 1 ? 'one paint' : 'two paints'} (${best.pair.map(j => pigments[j].name ?? `pigment ${j}`).join(' and ')}) reach the subject's ${colours.length} colours within ${best.e.toFixed(1)} a*b*; ${(100 * near).toFixed(0)}% of its coloured cells within ${HUE_SPAN} degrees of their hue` };
}

/** The proportions (one per paint of the palette, summing to 1) of a near-monochrome subject's paints at lightness L: for a
 * pair, the proportion its fitted colours have near that lightness. */
export function monoAt(m, L) {
  const mix = new Array(m.k).fill(0);
  if (m.pigments.length === 1) { mix[m.pigments[0]] = 1; return mix; }
  let sw = 0, sr = 0; for (const f of m.fits) { const wgt = 1 / (1 + (f.L - L) ** 2 / 25); sw += wgt; sr += wgt * f.r; }
  const r = sr / sw; mix[m.pigments[0]] = 1 - r; mix[m.pigments[1]] = r; return mix;
}
