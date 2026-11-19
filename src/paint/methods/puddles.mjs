// Puddles: the mixes a painter makes for a picture before the washes go on.
//
// Every wash shape asks for a colour (its mean). The amounts of the box paints whose flat film returns that colour's
// light are the shape's own mix. A puddle is one mix of all its paints, made for a group of shapes; a wash is charged
// from a puddle, never from the shape it covers. The rule for how many:
//
//   The first puddle is the largest shape's mix. The next is always the mix of the shape furthest in hue and chroma
//   (CIEDE2000 at the shape's own lightness) from every puddle so far. Mixing stops when every shape is within
//   PUDDLE_TOLERANCE of a puddle, or at PUDDLES_MAX. A picture of few colours gets few puddles: a puddle more than
//   the picture needs would split a plane that is one colour. Each puddle is then remixed as the pooled paint of the
//   shapes that take it.
//
// A puddle is used at up to three named dilutions, one a stage, light to dark. The values its shapes need are sorted
// into at most three steps (the steps that leave the shapes nearest what they need; steps the eye could not tell apart,
// under VISIBLE_STEP L* of a wash on paper, are one). The first stage lays the lightest step over every shape the
// puddle paints; each later stage lays only the difference up to the next step, over the shapes that need it. So each
// wash lies inside the one before and no stage repeats the last over the same shapes.
// Plan time only.
import { unmix, channelDensity } from '../../crop/pigments.mjs';
import { renderLayers } from '../../media/km.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';
import { filmLight, colourLight } from './mass-tone.mjs';

export const PUDDLES_MAX = 25;
/** A shape is served by a puddle whose hue and chroma, at the shape's lightness, are within this CIEDE2000 of its own. */
export const PUDDLE_TOLERANCE = 5;
/** The weakest wash laid darkens bare paper by this much L*. */
const VISIBLE_STEP = 2;
export const DILUTIONS = Object.freeze([{ name: 'pale' }, { name: 'middle' }, { name: 'full' }]);
/** The dilution (index into DILUTIONS) each stage lays, light to dark. */
export const STAGE_DILUTION = Object.freeze([0, 1, 2]);
export const MAX_STAGES = STAGE_DILUTION.length;

const sumOf = a => { let s = 0; for (const v of a) s += v; return s; };

/** Lab of a flat film of `amounts` (one per pigment) over the paper. */
export function filmLab(amounts, pigments, paperRGB) {
  const out = renderLayers([pigments.map((_, j) => Float32Array.of(amounts[j]))], pigments.map(q => ({ K: q.K, S: q.S ?? [0, 0, 0] })), Uint8ClampedArray.from(paperRGB), 1, 1);
  return labOf(out, 0, paperRGB);
}

/** The strongest wash searched for, as total paint. A colour darker than a mix can go is asked at this. */
const MAX_STRENGTH = 64;
/** The strength (total paint) at which a film of `mix` (proportions) returns the light of `rgb`; 0 when the colour is the paper's or lighter. */
export function strengthFor(mix, rgb, pigments, paperRGB) {
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
 * The puddles for a set of shapes.
 * @param shapes [{ amounts: number[k] (the shape's own mix, mixFor), area }]
 * @returns {{ puddles: Array<{mix:number[]}>, assign: Int32Array (puddle per shape, -1 for a shape with no paint), worst: number }}
 */
export function choosePuddles(shapes, { pigments, paperRGB, tolerance = PUDDLE_TOLERANCE, max = PUDDLES_MAX } = {}) {
  const k = pigments.length, painted = shapes.map((s, i) => ({ i, total: sumOf(s.amounts), area: s.area, amounts: s.amounts })).filter(s => s.total > 1e-6);
  const assign = new Int32Array(shapes.length).fill(-1);
  if (!painted.length) return { puddles: [], assign, worst: 0 };
  for (const s of painted) { s.mix = s.amounts.map(v => v / s.total); s.lab = filmLab(s.amounts, pigments, paperRGB); }
  // how far a puddle's mix is from the shape's colour, laid at the shape's own strength: hue and chroma only
  const apart = (s, mix) => { const q = filmLab(mix.map(v => v * s.total), pigments, paperRGB); return deltaE2000([s.lab[0], s.lab[1], s.lab[2]], [s.lab[0], q[1], q[2]]); };
  const first = painted.reduce((a, b) => (b.area > a.area ? b : a));
  const mixes = [first.mix], near = painted.map(s => apart(s, first.mix));
  for (;;) {
    let far = 0; for (let q = 1; q < painted.length; q++) if (near[q] > near[far]) far = q;
    if (mixes.length >= max || near[far] <= tolerance) break;
    mixes.push(painted[far].mix);
    painted.forEach((s, q) => { near[q] = Math.min(near[q], apart(s, painted[far].mix)); });
  }
  const nearest = s => { let best = 0, bd = Infinity; mixes.forEach((m, p) => { const d = apart(s, m); if (d < bd) { bd = d; best = p; } }); return [best, bd]; };
  // remix each puddle as the pooled paint of the shapes that take it, then let every shape choose again
  const pool = mixes.map(() => new Float64Array(k));
  for (const s of painted) { const [p] = nearest(s); for (let j = 0; j < k; j++) pool[p][j] += s.amounts[j] * s.area; }
  pool.forEach((a, p) => { const t = sumOf(a); if (t > 0) mixes[p] = Array.from(a, v => v / t); });
  let worst = 0; const used = new Int32Array(mixes.length).fill(-1), puddles = [];
  for (const s of painted) { const [p, d] = nearest(s); if (used[p] < 0) { used[p] = puddles.length; puddles.push({ mix: mixes[p] }); } assign[s.i] = used[p]; if (d > worst) worst = d; }
  return { puddles, assign, worst };
}

/**
 * A puddle's dilutions and the stages each of its shapes takes.
 * @param needs the strength each of the puddle's shapes needs of this puddle (strengthFor)
 * @returns {{ levels: number[] (the value steps, as total paint), dilutions: Array<{name:string, strength:number}>, strengths:
 *   number[] (one per stage: what that stage adds), steps: number[][] }} steps[q] lists the stages (0 first) shape q is
 *   washed in, always the first so many; empty for a shape left as paper.
 */
export function dilutionLadder(mix, needs, pigments, paperRGB) {
  const most = Math.max(0, ...needs), none = { levels: [], dilutions: [], strengths: [], steps: needs.map(() => []) };
  if (!(most > 0)) return none;
  const paperL = filmLab(mix.map(() => 0), pigments, paperRGB)[0], lightOf = t => filmLab(mix.map(v => v * t), pigments, paperRGB)[0];
  // a shape that would take less than half a visible wash is left as paper
  const shows = t => paperL - lightOf(t) >= VISIBLE_STEP / 2, live = needs.filter(shows).sort((a, b) => a - b);
  if (!live.length) return none;
  // at most MAX_STAGES steps: one-dimensional k-means from evenly spread starts, then steps too close to tell apart joined
  const starts = Math.min(MAX_STAGES, live.length);
  let levels = [...new Set(Array.from({ length: starts }, (_, q) => live[Math.round(q * (live.length - 1) / Math.max(1, starts - 1))]))];
  const nearest = t => { let best = 0; for (let l = 1; l < levels.length; l++) if (Math.abs(levels[l] - t) < Math.abs(levels[best] - t)) best = l; return best; };
  for (let it = 0; it < 12; it++) { const sum = levels.map(() => 0), count = levels.map(() => 0); for (const t of live) { const l = nearest(t); sum[l] += t; count[l]++; } levels = levels.map((v, l) => (count[l] ? sum[l] / count[l] : v)).sort((a, b) => a - b); }
  levels = levels.filter((v, l) => !l || lightOf(levels[l - 1]) - lightOf(v) >= VISIBLE_STEP);
  const strengths = levels.map((v, l) => v - (l ? levels[l - 1] : 0));
  const steps = needs.map(t => (shows(t) ? Array.from({ length: nearest(t) + 1 }, (_, j) => j) : []));
  return { levels, dilutions: strengths.map((strength, l) => ({ name: DILUTIONS[l].name, strength })), strengths, steps };
}
