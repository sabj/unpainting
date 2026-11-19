// Mixes: the colour a brush is loaded with for one wash.
//
// A wash is one shape and one mix. The mix is judged for the shape as a whole: the amounts of the box paints whose flat
// film returns the shape's colour (mixFor), or, over paint already laid, the amounts that bring what is under the shape
// to its colour (mixOver). Any combination of the paints may be mixed and a picture has as many mixes as it has washes.
// A mix is never computed from the cells a stroke covers: it has one colour to answer, the shape's.
// Plan time only.
import { unmix, channelDensity } from '../../crop/pigments.mjs';
import { renderLayers } from '../../media/km.mjs';
import { labOf } from '../../eval/colour.mjs';
import { filmLight, colourLight } from './mass-tone.mjs';

const sumOf = a => { let s = 0; for (const v of a) s += v; return s; };

/** Lab of a flat film of `amounts` (one per pigment) over the paper. */
export function filmLab(amounts, pigments, paperRGB) {
  const out = renderLayers([pigments.map((_, j) => Float32Array.of(amounts[j]))], pigments.map(q => ({ K: q.K, S: q.S ?? [0, 0, 0] })), Uint8ClampedArray.from(paperRGB), 1, 1);
  return labOf(out, 0, paperRGB);
}

/** The strongest wash searched for, as total paint. A colour darker than a mix can go is asked at this. */
const MAX_STRENGTH = 64;
/** The strength (total paint) at which a film of `mix` (proportions) returns the light of `rgb`; 0 when the colour is the paper's or lighter. */
function strengthFor(mix, rgb, pigments, paperRGB) {
  const paper = Array.from(paperRGB, v => v / 255), kk = [0, 0, 0], ss = [0, 0, 0];
  mix.forEach((a, j) => { for (let c = 0; c < 3; c++) { kk[c] += a * pigments[j].K[c]; ss[c] += a * (pigments[j].S?.[c] ?? 0); } });
  const light = t => filmLight(kk.map(v => v * t), ss.map(v => v * t), paper), want = colourLight(rgb[0], rgb[1], rgb[2]);
  if (want >= light(0) || !(kk[0] + kk[1] + kk[2] > 0)) return 0;
  if (light(MAX_STRENGTH) >= want) return MAX_STRENGTH;
  let lo = 0, hi = MAX_STRENGTH;
  for (let it = 0; it < 48; it++) { const mid = (lo + hi) / 2; if (light(mid) > want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** The amounts of each pigment whose flat film returns the light of one colour (sRGB 0..255) in that colour's own mix. */
export function mixFor(rgb, pigments, paperRGB) {
  const k = pigments.length, D = channelDensity(Float32Array.from(rgb), 1, paperRGB);
  for (let c = 0; c < 3; c++) D[c] = Math.max(0, D[c]);
  const raw = unmix(D, 1, pigments.map(p => p.K.map(v => v / 0.55))), total = sumOf(raw);
  if (!(total > 1e-6)) return new Array(k).fill(0);
  const mix = Array.from(raw, v => v / total), strength = strengthFor(mix, rgb, pigments, paperRGB);
  return mix.map(v => v * strength);
}

/**
 * The amounts of each pigment to lay over a film of `under` (amounts already on the paper) so that the two together
 * return the light of `rgb`. The paints added are those the colour's own mix holds more of than is under it; they are
 * laid at the strength that brings the whole film to the colour's light, so a paint already there in excess makes the
 * wash weaker, never the result darker. All zeros when what is under is already as dark as the colour.
 */
export function mixOver(rgb, under, pigments, paperRGB) {
  const own = mixFor(rgb, pigments, paperRGB), more = own.map((v, j) => Math.max(0, v - under[j])), none = own.map(() => 0);
  if (!(sumOf(more) > 1e-6)) return none;
  const paper = Array.from(paperRGB, v => v / 255), want = colourLight(rgb[0], rgb[1], rgb[2]);
  const light = t => { const kk = [0, 0, 0], ss = [0, 0, 0]; pigments.forEach((p, j) => { const a = under[j] + t * more[j]; for (let c = 0; c < 3; c++) { kk[c] += a * p.K[c]; ss[c] += a * (p.S?.[c] ?? 0); } }); return filmLight(kk, ss, paper); };
  if (light(0) <= want) return none;
  if (light(1) >= want) return more;
  let lo = 0, hi = 1;
  for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (light(mid) > want) lo = mid; else hi = mid; }
  return more.map(v => v * (lo + hi) / 2);
}
