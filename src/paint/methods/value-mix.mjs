// The mix that brings a place to a colour's VALUE over what is already laid there. A study's shapes and values are
// trusted more than its hues: the mix is the palette's nearest to the colour (puddles.mjs mixFor, or mixOver what is
// under), its strength then set so the whole film reaches the colour's lightness (L*). The hue follows only as far as
// the palette allows. A near-monochrome subject (mono-mix.mjs) is mixed from its own one or two paints at that value.
// Used by the study wash plan (study-washes.mjs) and by an edit of that plan (plan-edit.mjs): one rule for both.
import { labOf } from '../../eval/colour.mjs';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { monoAt } from './mono-mix.mjs';

/** A sheet darker than this (L* against white) is toned. */
const TONED_L = 95;

/**
 * What a colour's value is read against. On a toned sheet a study (an image on white) is a picture of the subject's
 * values from white down, and its white is the sheet: the value is read against white and laid that much darker than
 * the sheet. Read against the sheet instead, every value lighter than the buff is lost and the rest come out too deep.
 */
export function valueRefOf(paperCol) {
  return labOf(paperCol, 0, [255, 255, 255])[0] < TONED_L ? [255, 255, 255] : paperCol;
}

/**
 * The amounts of each pigment to lay over `under` (amounts already there) so the place reads at `colour`'s value.
 * `given`: proportions to keep (a shadow glaze's first mix); `mono`: the subject's own paints; `want(L)`: the
 * lightness aimed at for a colour of lightness L (the study plan may err light).
 */
export function valueMix(colour, under, { pigments, paperCol, valueRef = valueRefOf(paperCol), mono = null, given = null, want = L => L }) {
  const fresh = under.every(v => v <= 1e-9), aim = want(labOf(colour, 0, valueRef)[0]);
  const base = given ?? mono ? given ?? monoAt(mono, aim) : fresh ? mixFor(colour, pigments, paperCol) : mixOver(colour, under, pigments, paperCol);
  if (!(base.reduce((a, v) => a + v, 0) > 1e-9)) return base;
  const Lat = t => filmLab(under.map((v, j) => v + t * base[j]), pigments, paperCol)[0];
  let lo = mono ? 0.01 : 0.05, hi = mono ? 32 : 8; if (Lat(hi) > aim) return base.map(v => v * hi); if (Lat(lo) < aim) return base.map(v => v * lo);
  for (let it = 0; it < 11; it++) { const mid = Math.sqrt(lo * hi); if (Lat(mid) > aim) lo = mid; else hi = mid; }
  return base.map(v => v * Math.sqrt(lo * hi));
}
