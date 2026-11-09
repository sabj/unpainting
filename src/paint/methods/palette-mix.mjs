// Palette mixing: the two or three paints, and how much of each, that make a region's colour in one charge.
// A painter mixes a puddle on the palette until it is the right colour, thins it with water until it is the right
// value, and lays it once. Here the puddle is one Kubelka-Munk layer (thickness-weighted K and S, src/media/km.mjs)
// over whatever is under it: bare paper for a first wash, the dried colour of an earlier wash for a glaze.
// The recipe (shares) sets hue and chroma; the total mass, which is what the water ratio controls, sets value.
// Planning only: it takes a colour the plan already holds and never reads the sheet or the target.
import { reflectedColour } from './plan-optics-fit.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';

/** One just-noticeable colour difference in CIEDE2000 (src/eval/colour.mjs). Two mixes closer than this look the same. */
export const JND = 1;

const WHITE = [255, 255, 255];
/** CIELAB (D65, white 255) of an 8-bit sRGB colour given as numbers. */
export const labOfColour = rgb => labOf(rgb.map(v => Math.max(0, Math.min(255, v))), 0, WHITE);

/** The colour of one mixed layer of `masses` (one per pigment) over `under`, as the simulator renders it. */
export const mixtureColour = (masses, pigments, under) => reflectedColour(Array.from(masses), pigments, under, 1, 'mixed');

const scaled = (shares, t) => shares.map(v => v * t);

/**
 * How much of a recipe gives a lightness: the total mass at which `shares` over `under` reads L* `L`.
 * More paint is darker, so this is a bisection. `reached` is false when the under-colour is already darker than L
 * (paint cannot lighten) or when no thickness of this recipe gets that dark.
 * @returns {{mass: number, reached: boolean}}
 */
export function massForLightness(shares, pigments, under, L) {
  const at = t => labOfColour(mixtureColour(scaled(shares, t), pigments, under))[0];
  const bare = at(0);
  if (L >= bare) return { mass: 0, reached: L - bare < 1e-6 };
  let hi = 1, got = at(hi);
  for (let i = 0; got > L && i < 40; i++) {
    const next = at(hi * 2);
    if (next >= got - 1e-9) return { mass: hi, reached: false };
    hi *= 2; got = next;
  }
  if (got > L) return { mass: hi, reached: false };
  let lo = 0;
  for (let i = 0; i < 60 && hi - lo > 1e-10 * hi; i++) { const mid = (lo + hi) / 2; if (at(mid) > L) lo = mid; else hi = mid; }
  return { mass: (lo + hi) / 2, reached: true };
}

function candidate(indices, masses, pigments, under, targetLab, valueReached) {
  const mix = new Float64Array(pigments.length);
  indices.forEach((j, q) => { mix[j] = Math.max(0, masses[q]); });
  const rgb = mixtureColour(mix, pigments, under), lab = labOfColour(rgb);
  let mass = 0; for (const v of mix) mass += v;
  return { indices, mix, mass, rgb, lab, dE: deltaE2000(targetLab, lab), valueReached };
}

// One paint: only its amount is free, and that goes to the value.
function single(j, pigments, under, targetLab) {
  const shares = pigments.map((_, q) => (q === j ? 1 : 0)), { mass, reached } = massForLightness(shares, pigments, under, targetLab[0]);
  return candidate([j], [mass], pigments, under, targetLab, reached);
}

// Two paints: every share is thinned to the target's value, and the share whose colour is nearest is kept.
function pair(a, b, pigments, under, targetLab) {
  const make = u => {
    const shares = pigments.map((_, q) => (q === a ? u : q === b ? 1 - u : 0)), { mass, reached } = massForLightness(shares, pigments, under, targetLab[0]);
    return candidate([a, b], [u * mass, (1 - u) * mass], pigments, under, targetLab, reached);
  };
  const N = 32;
  let bestU = 0, best = null;
  for (let i = 1; i < N; i++) { const c = make(i / N); if (!best || c.dE < best.dE) { best = c; bestU = i / N; } }
  let lo = Math.max(1e-4, bestU - 1 / N), hi = Math.min(1 - 1e-4, bestU + 1 / N);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), c1 = make(x1), c2 = make(x2);
  for (let i = 0; i < 40 && hi - lo > 1e-6; i++) {
    if (c1.dE < c2.dE) { hi = x2; x2 = x1; c2 = c1; x1 = hi - g * (hi - lo); c1 = make(x1); }
    else { lo = x1; x1 = x2; c1 = c2; x2 = lo + g * (hi - lo); c2 = make(x2); }
  }
  for (const c of [c1, c2]) if (c.dE < best.dE) best = c;
  return best;
}

const density = (rgb, under) => rgb.map((v, c) => -Math.log(Math.max(1e-6, v) / Math.max(1e-6, under[c])));

function solve3(A, d) {
  const [a, b, c] = A, det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const size = Math.hypot(...a) * Math.hypot(...b) * Math.hypot(...c);
  if (!(Math.abs(det) > 1e-9 * size)) return null;
  return [
    (d[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (d[1] * c[2] - b[2] * d[2]) + a[2] * (d[1] * c[1] - b[1] * d[2])) / det,
    (a[0] * (d[1] * c[2] - b[2] * d[2]) - d[0] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * d[2] - d[1] * c[0])) / det,
    (a[0] * (b[1] * d[2] - d[1] * c[1]) - a[1] * (b[0] * d[2] - d[1] * c[0]) + d[0] * (b[0] * c[1] - b[1] * c[0])) / det,
  ];
}

// Three paints: three masses and three channels, so a colour inside their reach is matched exactly, value included.
// With no scattering a layer's density is 2 K x, which is linear in the masses; that solution seeds a Newton
// iteration on the full layer. A colour outside the three paints' reach has its nearest mix on a pair, tried above.
function triple(ids, pigments, under, targetRGB, targetLab) {
  const want = density(targetRGB, under);
  const linear = solve3([0, 1, 2].map(c => ids.map(j => 2 * pigments[j].K[c])), want);
  if (!linear || linear.some(v => !(v > 0))) return null;
  const residual = m => { const mix = new Float64Array(pigments.length); ids.forEach((j, q) => { mix[j] = m[q]; }); return density(mixtureColour(mix, pigments, under), under).map((v, c) => v - want[c]); };
  let m = linear;
  for (let it = 0; it < 30; it++) {
    const r = residual(m);
    if (Math.hypot(...r) < 1e-10) break;
    const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let q = 0; q < 3; q++) {
      const h = Math.max(1e-7, m[q] * 1e-5), up = m.slice(); up[q] += h;
      const ru = residual(up);
      for (let c = 0; c < 3; c++) J[c][q] = (ru[c] - r[c]) / h;
    }
    const step = solve3(J, r);
    if (!step) return null;
    m = m.map((v, q) => v - step[q]);
    if (m.some(v => !(v > 0) || !Number.isFinite(v))) return null;
  }
  if (Math.hypot(...residual(m)) > 1e-6) return null;
  return candidate(ids, m, pigments, under, targetLab, true);
}

/**
 * The palette mix for one colour.
 *
 * Every single paint, pair and triple from `pigments` (or from `allowed`, a list of indices) is tried. Mixes within
 * one just-noticeable difference of the best cannot be told apart, so among those the mix with the fewest paints is
 * taken: fewer paints are easier to repeat and to keep clean. Among mixes of that many paints the nearest colour
 * wins, and where several match exactly (three paints often do) the one that needs the least paint, which leaves
 * the thinnest, most transparent film.
 *
 * @param targetRGB the colour wanted, 8-bit sRGB numbers
 * @param pigments  [{ K: [r,g,b], S: [r,g,b] }] as the sheet holds them (box.mjs boxPigment, palette.mjs)
 * @param under     the colour under the layer: the paper for a first wash, the dried wash for a glaze
 * @param maxPigments at most this many paints in the puddle (1 to 3)
 * @param maxMass   the heaviest film one charge lays, when the caller has measured it on scrap; sets `charges`
 * @returns {{ indices: number[], shares: number[], mass: number, mix: Float64Array, rgb: number[], lab: number[],
 *   target: number[], dE: number, dL: number, dC: number, dh: number, reached: boolean, valueReached: boolean,
 *   charges: number|null }} `mix` is the mass of every pigment (zero for those left out), the form a shape's
 *   charge takes; `indices` and `shares` list the paints used, largest share first. `reached` is false when no mix
 *   comes within one just-noticeable difference: the colour is outside these paints' reach, and dC and dh say how.
 */
export function solveMix(targetRGB, pigments, under, { maxPigments = 3, allowed = null, maxMass = null } = {}) {
  if (!Array.isArray(pigments) || !pigments.length) throw new RangeError('palette mix needs at least one pigment');
  if (!(maxPigments >= 1 && maxPigments <= 3)) throw new RangeError('a palette mix holds one to three paints');
  if (![targetRGB, under].every(c => c?.length === 3 && Array.from(c).every(v => Number.isFinite(v) && v >= 0 && v <= 255))) throw new RangeError('palette mix colours are three numbers from 0 to 255');
  if (maxMass !== null && !(maxMass > 0)) throw new RangeError('the heaviest charge must be a positive mass');
  const ids = allowed ? [...new Set(allowed)] : pigments.map((_, j) => j);
  if (!ids.length || ids.some(j => !Number.isInteger(j) || j < 0 || j >= pigments.length)) throw new RangeError('allowed pigments must be indices into the pigment list');
  const target = Array.from(targetRGB), targetLab = labOfColour(target), found = [];
  for (const j of ids) found.push(single(j, pigments, under, targetLab));
  if (maxPigments >= 2) for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) found.push(pair(ids[a], ids[b], pigments, under, targetLab));
  if (maxPigments >= 3) for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) {
    const t = triple([ids[a], ids[b], ids[c]], pigments, under, target, targetLab);
    if (t) found.push(t);
  }
  let least = Infinity; for (const c of found) if (c.dE < least) least = c.dE;
  let pick = null;
  for (const c of found) {
    if (c.dE > least + JND) continue;
    const used = c.indices.filter(j => c.mix[j] > 0).length;
    const same = pick && used === pick.used && Math.abs(c.dE - pick.c.dE) <= 1e-6;
    if (!pick || used < pick.used || (used === pick.used && c.dE < pick.c.dE - 1e-6) || (same && c.mass < pick.c.mass)) pick = { c, used };
  }
  const c = pick.c, order = c.indices.filter(j => c.mix[j] > 0).sort((p, q) => c.mix[q] - c.mix[p]);
  const chroma = lab => Math.hypot(lab[1], lab[2]), hue = lab => Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
  let dh = hue(c.lab) - hue(targetLab); if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  return {
    indices: order, shares: order.map(j => c.mix[j] / c.mass), mass: c.mass, mix: c.mix, rgb: c.rgb, lab: c.lab, target: targetLab,
    dE: c.dE, dL: c.lab[0] - targetLab[0], dC: chroma(c.lab) - chroma(targetLab), dh: order.length ? dh : 0,
    reached: c.dE <= JND, valueReached: c.valueReached, charges: maxMass === null ? null : Math.max(1, Math.ceil(c.mass / maxMass - 1e-9)),
  };
}

/**
 * The same puddle with more or less water: the mix scaled to each lightness in `lightnesses`.
 * `water` is how many times the full-strength charge's water each part of paint now carries (1 at the mix's own
 * mass, 2 when it is thinned to half). Hue and chroma drift as a mix is thinned, so each step reports its colour.
 * @returns {{ L: number, mass: number, water: number, lab: number[], reached: boolean }[]}
 */
export function thinToValues(mix, pigments, under, lightnesses) {
  let total = 0; for (const v of mix) total += v;
  if (!(total > 0)) throw new RangeError('cannot thin an empty mix');
  const shares = Array.from(mix, v => v / total);
  return lightnesses.map(L => {
    const { mass, reached } = massForLightness(shares, pigments, under, L);
    return { L, mass, water: mass > 0 ? total / mass : Infinity, lab: labOfColour(mixtureColour(scaled(shares, mass), pigments, under)), reached };
  });
}
