// The pen-and-wash style's wash plan (--style penwash): a confident ink drawing first, then a few simple transparent
// washes that support it. This module only plans; pen-wash.mjs lays the passages with the ordinary mop and brush.
//
// Three planners, chosen with --penwashplan:
//   stages (recipe)   the order a pen-and-wash illustrator works in: paper whites kept, one pale unifying first wash,
//                     one mid-value shadow wash, then a few small darks (planStages below, DIAGNOSIS in the commit).
//   values (default)  the subject reduced to three values (light, mid, dark). Light stays paper, except a pale sky
//                     or unifying wash. Mid gets one or two local-colour washes (split only where the hue clearly
//                     differs), dark one shadow glaze and, where the deepest darks are big enough, one deeper glaze.
//   colour            the comparison planner: the subject cut into a few colour regions (k-means in Lab), one flat
//                     wash per region darker than the light threshold, light to dark.
// Either way there are at most six passages, each one connected wash with one mix, never a per-cell fit.
// Pure functions over typed arrays, planning only: every target read happens here, before the target guard seals it.
import { gaussian } from '../../keyframes/density.mjs';
import { components, dilate, erode } from '../../raster.js';
import { renderLayers } from '../../media/km.mjs';

const PENWASH_PLANNERS = Object.freeze(['values', 'colour', 'stages']);
export const PENWASH_MAX_PASSAGES = 6;

// sRGB 0..255 to CIE L*a*b* (D65), one cell.
function lab(r, g, b) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** L*, a*, b* planes of an RGB buffer, each blurred by sigma cells (0: unblurred). */
function labPlanesOf(px, w, h, sigma = 0) {
  const n = w * h, L = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = lab(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]); L[i] = v[0]; a[i] = v[1]; b[i] = v[2]; }
  return sigma > 0 ? { L: gaussian(L, w, h, sigma), a: gaussian(a, w, h, sigma), b: gaussian(b, w, h, sigma) } : { L, a, b };
}

function quantile(values, q) {
  const s = Float32Array.from(values).sort();
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : 0;
}

// 1D k-means with three centres started at the 15th, 50th and 85th percentiles: the two thresholds between them.
function threeValueThresholds(L) {
  const c = [quantile(L, 0.15), quantile(L, 0.5), quantile(L, 0.85)];
  for (let it = 0; it < 16; it++) {
    const s = [0, 0, 0], k = [0, 0, 0];
    for (const v of L) { const j = Math.abs(v - c[0]) < Math.abs(v - c[1]) ? 0 : Math.abs(v - c[1]) < Math.abs(v - c[2]) ? 1 : 2; s[j] += v; k[j]++; }
    for (let j = 0; j < 3; j++) if (k[j]) c[j] = s[j] / k[j];
  }
  return { dark: (c[0] + c[1]) / 2, light: (c[1] + c[2]) / 2 };
}

// Majority smoothing of a label map: each label's indicator blurred, the strongest wins. Removes speckle without
// moving the big boundaries.
function smoothLabels(labels, count, w, h, sigma) {
  const n = w * h, best = new Float32Array(n).fill(-1), out = new Uint8Array(n);
  for (let k = 0; k < count; k++) {
    const f = gaussian(Float32Array.from(labels, v => (v === k ? 1 : 0)), w, h, sigma);
    for (let i = 0; i < n; i++) if (f[i] > best[i]) { best[i] = f[i]; out[i] = k; }
  }
  return out;
}

// Components of label k smaller than minArea cells are given to label `to`.
function absorbSmall(labels, k, to, w, h, minArea) {
  const m = Uint8Array.from(labels, v => (v === k ? 1 : 0)), { labels: lab8, areas } = components(m, w, h);
  for (let i = 0; i < labels.length; i++) if (lab8[i] && areas[lab8[i]] < minArea) labels[i] = to;
}

/**
 * The three-value simplification: 0 light, 1 mid, 2 dark, from L* blurred over `sigma` cells. Light keeps at least
 * `minLight` of the sheet and dark at most `maxDark`, so the style keeps its white paper. Small islands are merged
 * into the next lighter value (or, for small lights inside a mass, into mid).
 */
export function valueGroups(L, w, h, { sigma = 6, minLight = 0.3, maxDark = 0.22, minArea = 0.004 } = {}) {
  const n = w * h, B = sigma > 0 ? gaussian(L, w, h, sigma) : L;
  const t = threeValueThresholds(B);
  const light = Math.min(t.light, quantile(B, 1 - minLight)), dark = Math.min(t.dark, quantile(B, maxDark), light - 1);
  let g = Uint8Array.from(B, v => (v >= light ? 0 : v >= dark ? 1 : 2));
  g = smoothLabels(g, 3, w, h, Math.max(1, sigma / 2));
  const min = Math.max(4, Math.round(minArea * n));
  absorbSmall(g, 2, 1, w, h, min);
  absorbSmall(g, 1, 0, w, h, min);
  absorbSmall(g, 0, 1, w, h, Math.round(min / 2));
  const share = k => g.reduce((a, v) => a + (v === k ? 1 : 0), 0) / n;
  return { groups: g, thresholds: { light, dark }, shares: [share(0), share(1), share(2)] };
}

/**
 * A photograph's dark mount or plate border: out to the innermost row or column near each edge that is dark
 * (L* under `dark`) nearly all along, at most `maxShare` of the side. Returns the border mask and its thickness per side; it is neither painted nor planned.
 */
function frameMask(L, w, h, { dark = 40, maxShare = 0.08 } = {}) {
  // a border line is dark nearly all along (85th percentile), unlike a building's shadow side that meets the sky
  const med = a => { const s = Float32Array.from(a).sort(); return s[Math.floor(0.85 * (s.length - 1))]; };
  const row = y => med(Array.from({ length: w }, (_, x) => L[y * w + x])), col = x => med(Array.from({ length: h }, (_, y) => L[y * w + x]));
  // the innermost dark line within reach: a scan's white margin can lie outside the black plate edge
  const run = (count, f) => { let k = 0; for (let j = 0; j < count; j++) if (f(j) < dark) k = j + 1; return k; };
  const my = Math.round(maxShare * h), mx = Math.round(maxShare * w);
  const t = run(my, y => row(y)), b = run(my, k => row(h - 1 - k)), l = run(mx, x => col(x)), r = run(mx, k => col(w - 1 - k));
  // the border's own soft inner edge goes with it
  const pad = k => (k ? k + 2 : 0), T = pad(t), B = pad(b), Lf = pad(l), R = pad(r);
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < T || y >= h - B || x < Lf || x >= w - R) m[y * w + x] = 1;
  return { mask: m, top: T, bottom: B, left: Lf, right: R };
}

/**
 * A painted target's own bare margin: cells paper-pale (L* `minL` or more) and as pale as its palest (within `tol` of
 * the 98th percentile) joined to
 * the edge of the picture or to `frame`. Like a border, it is left as paper and is no sky.
 */
function paperMargin(L, w, h, { frame = null, tol = 2.5, minL = 94 } = {}) {
  const s = Float32Array.from(L).sort(), pale = Math.max(minL, s[Math.floor(0.98 * (s.length - 1))] - tol), n = w * h;
  const m = new Uint8Array(n), stack = [];
  const seed = i => { if (!m[i] && (L[i] >= pale || (frame && frame[i]))) { m[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) { const i = stack.pop(), x = i % w, y = (i - x) / w; if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w); }
  if (frame) for (let i = 0; i < n; i++) if (frame[i]) m[i] = 0;
  return m;
}

/** Sky: light cells reached from the top down each column, past any border or margin, kept above `maxDepth`. */
export function skyMask(groups, w, h, { maxDepth = 0.75, frame = null } = {}) {
  const m = new Uint8Array(w * h), lim = Math.round(maxDepth * h);
  for (let x = 0; x < w; x++) {
    let y = 0; while (y < lim && frame && frame[y * w + x]) y++;
    for (; y < lim && groups[y * w + x] === 0 && !(frame && frame[y * w + x]); y++) m[y * w + x] = 1;
  }
  return m;
}

const share = (mask, n) => mask.reduce((a, v) => a + v, 0) / n;

/**
 * One mix for one passage: the palette's blend (on a simplex of tenths) and amount whose flat render on the paper
 * comes closest (CIEDE76) to the region's median colour `want` = [L, a, b]. Returns { dir, amount }. One fit per
 * passage, so the wash keeps a single charge; nothing is fitted per cell.
 */
const FIT_AMOUNTS = [0.04, 0.06, 0.08, 0.11, 0.15, 0.2, 0.25, 0.32, 0.4, 0.6, 0.9];
// `lWeight` < 1 weighs lightness less than hue: a wash capped below its region's value matches its hue, not its depth.
export function fitMix(want, pigments, paperRGB = [247, 244, 236], amounts = FIT_AMOUNTS, lWeight = 1) {
  const K = pigments.length, step = K > 4 ? 0.25 : 0.1, dirs = [];
  const walk = (j, left, cur) => { if (j === K - 1) { dirs.push([...cur, left]); return; } for (let v = 0; v <= left + 1e-9; v += step) walk(j + 1, +(left - v).toFixed(4), [...cur, +v.toFixed(4)]); };
  walk(0, 1, []);
  const m = dirs.length * amounts.length, paper = new Uint8ClampedArray(m * 3);
  for (let i = 0; i < m; i++) paper.set(paperRGB, i * 3);
  const layer = pigments.map((_, j) => Float32Array.from({ length: m }, (_, i) => dirs[(i / amounts.length) | 0][j] * amounts[i % amounts.length]));
  const rgb = renderLayers([layer], pigments, paper, m, 1);
  let best = null;
  for (let i = 0; i < m; i++) {
    const [L, a, b] = lab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]), e = Math.hypot(lWeight * (L - want[0]), a - want[1], b - want[2]);
    if (!best || e < best.e) best = { e, dir: dirs[(i / amounts.length) | 0], amount: amounts[i % amounts.length], got: [L, a, b] };
  }
  return { ...best, want };
}

// L* of a stack of washes laid flat on the paper, oldest first, each { dir, strength }.
function stackL(stack, pigments, paperRGB) {
  const layers = stack.map(g => pigments.map((_, j) => Float32Array.of(g.dir[j] * g.strength)));
  const rgb = renderLayers(layers, pigments, Uint8ClampedArray.from(paperRGB), 1, 1);
  return lab(rgb[0], rgb[1], rgb[2])[0];
}

// The largest x in [lo, hi] with ok(x), for ok true at lo and monotone.
function bisect(ok, lo, hi, steps = 24) {
  for (let s = 0; s < steps; s++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * Charges solved from the target. A passage's band is its cells under no later passage. Its charge is the one that
 * makes the flat stack there (the earlier passages covering at least half the band, then this one) render at
 * paper - c x (paper - the band's median target L*), c being the passage's own `ladderC` (else `c`): a pale copy of
 * the target's value. No passage may darken bare paper by more than its `maxDL` (else `maxDL`) L* or pass charge
 * `maxStrength`, and one that would darken its band by less than `minDL` is left out. Returns new passages.
 */
export function ladderStrengths(passages, { L, n, pigments, paperRGB = [247, 244, 236], c = 0.5, maxDL = 9, minDL = 1.5, maxStrength = 0.45, minBand = 0.003 }) {
  const paperL = stackL([], pigments, paperRGB), mean = p => (p.grade ? (p.grade.from + p.grade.to) / 2 : 1);
  const out = [];
  passages.forEach((p, k) => {
    const later = passages.slice(k + 1);
    let band = []; for (let i = 0; i < n; i++) if (p.mask[i] && !later.some(q => q.mask[i])) band.push(i);
    if (band.length < minBand * n) { band = []; for (let i = 0; i < n; i++) if (p.mask[i]) band.push(i); }
    if (!band.length) return;
    const goal = paperL - (p.ladderC ?? c) * Math.max(0, paperL - quantile(band.map(i => L[i]), 0.5));
    const under = out.filter(q => band.reduce((a, i) => a + q.mask[i], 0) >= 0.5 * band.length).map(q => ({ dir: q.dir, strength: q.strength * mean(q) }));
    const own = s => ({ dir: p.dir, strength: s * mean(p) });
    const cap = bisect(s => paperL - stackL([own(s)], pigments, paperRGB) <= (p.maxDL ?? maxDL), 0, maxStrength);
    const base = stackL(under, pigments, paperRGB), at = s => stackL([...under, own(s)], pigments, paperRGB);
    const s = at(cap) >= goal ? cap : bisect(x => at(x) > goal, 0, cap);
    if (base - at(s) < minDL) return;
    out.push({ ...p, strength: +s.toFixed(4), ladder: { goal: +goal.toFixed(1), band: band.length / n } });
  });
  return out;
}

// The median L*, a*, b* of a region, its L* taken `lightness` of the way from the paper toward it: the pale wash the
// style wants. Hue and chroma are kept (times `chroma`): a dilute transparent wash stays clean. With `lit`, the hue and chroma are read on the
// region's lighter half only: local colour is the colour in the light, before its shadows grey it.
const medianLab = (P, mask, paperLab = [96, 0, 3], lightness = 1, lit = false, chroma = 1) => {
  const all = []; for (let i = 0; i < mask.length; i++) if (mask[i]) all.push(P.L[i]);
  const cut = lit ? quantile(all, 0.5) : -Infinity, a = [], b = [];
  for (let i = 0; i < mask.length; i++) if (mask[i] && P.L[i] >= cut) { a.push(P.a[i]); b.push(P.b[i]); }
  const m = [quantile(all, 0.5), quantile(a, 0.5), quantile(b, 0.5)];
  return [paperLab[0] + lightness * (m[0] - paperLab[0]), chroma * m[1], chroma * m[2]];
};

// The palette's paints by role: the bluest (cool), the warmest earth or yellow (warm) and the reddest earth (earth).
export function paletteRoles(pigments) {
  const score = (p, f) => { const [r, g, b] = Array.from(p.K); return f(r, g, b); };
  const by = f => pigments.map((p, j) => [score(p, f), j]).sort((a, b) => b[0] - a[0])[0][1];
  const cool = by((r, g, b) => (r + g) / 2 - b), warm = by((r, g, b) => b - r + 0.3 * (b - g)), earth = by((r, g, b) => g - r);
  return { cool, warm, earth };
}

// A mix direction from role weights, e.g. { cool: 0.6, earth: 0.4 }.
function roleMix(roles, K, weights) {
  const d = new Array(K).fill(0);
  for (const [role, v] of Object.entries(weights)) d[roles[role]] += v;
  const s = d.reduce((a, v) => a + v, 0);
  return d.map(v => v / s);
}

const passage = (id, role, mask, dir, strength, extra = {}) => ({ id, role, mask, dir, strength, ...extra });

/**
 * The value planner. `px` is the target (RGB, w x h), `pigments` the painting's limited palette and `paperRGB` the
 * sheet. Each wash's mix is fitted once to its region's median colour (fitMix); monochrome targets take palette roles. Returns { passages, groups, sky, monochrome, notes }. Each passage has a mask on the
 * plan grid, a mix direction (sums to one), a strength (optical density of the whole mix), and how it is laid.
 */
function planValues({ px, w, h, pigments, mmPerCell, paperRGB, options = {} }) {
  const n = w * h, K = pigments.length, cells = mm => Math.max(1, mm / mmPerCell);
  const o = { joinMm: 2, minPiece: 0.008, blurMm: 2.5, minLight: 0.3, maxDark: 0.22, lightness: 0.5, chroma: 1, skyMin: 0.06, skyColumns: 0.4, haloMm: 0.8, minArea: 0.004, lightChroma: 0, localMax: 0.26, monoLocal: { warm: 0.6, earth: 0.4 }, capLWeight: 1, shadowMin: 0.12, deepMin: 0.1, shadowBlurMm: 0, shadowMaxDark: 0.3, shadowJoinMm: 1, shadowMinPiece: 0.002, foliageGreen: 0, foliageMax: 0.3, shadowOneMm: 0, skyStrength: 0, skyTo: 0.3, deepContrast: 0, deepShare: 0.06, deepRingMm: 2, keepLights: 0, keepLightsMm2: 4, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) };
  // a photograph's dark border and a painting's bare margin are no part of the subject: found on the barely blurred
  // picture, then read as paper before the planning blur, so the border's dark cannot bleed into the sky
  const P1 = labPlanesOf(px, w, h, 1), frame = frameMask(P1.L, w, h), margin = paperMargin(P1.L, w, h, { frame: frame.mask });
  for (let i = 0; i < n; i++) if (margin[i]) frame.mask[i] = 1;
  const P = { L: gaussian(Float32Array.from(P1.L, (v, i) => (frame.mask[i] ? 100 : v)), w, h, cells(o.blurMm) / 2), a: gaussian(P1.a, w, h, cells(o.blurMm) / 2), b: gaussian(P1.b, w, h, cells(o.blurMm) / 2) };
  const Lp = Float32Array.from(P.L, (v, i) => (frame.mask[i] ? 100 : v));
  const { groups, thresholds, shares } = valueGroups(Lp, w, h, { sigma: cells(o.blurMm), minLight: o.minLight, maxDark: o.maxDark, minArea: o.minArea });
  for (let i = 0; i < n; i++) if (frame.mask[i]) groups[i] = 0;
  let chroma = 0; for (let i = 0; i < n; i++) chroma += Math.hypot(P.a[i], P.b[i]); chroma /= n;
  const monochrome = chroma < 6, roles = paletteRoles(pigments), notes = [];
  const density = Float32Array.from(P.L, v => Math.max(0, Math.log10(100 / Math.max(1, v))) );
  const medOD = mask => { const v = []; for (let i = 0; i < n; i++) if (mask[i]) v.push(density[i]); return quantile(v, 0.5); };
  const paperLab = lab(...(paperRGB ?? [247, 244, 236])), fit = (mask, lit = true, max = Infinity) => fitMix(medianLab(P, mask, paperLab, o.lightness, lit, o.chroma), pigments, paperRGB, FIT_AMOUNTS.filter(v => v <= max), Number.isFinite(max) ? o.capLWeight : 1);
  const passages = [];
  const masses = Uint8Array.from(groups, (v, i) => (v > 0 && !frame.mask[i] ? 1 : 0)), darks0 = Uint8Array.from(groups, (v, i) => (v === 2 && !frame.mask[i] ? 1 : 0));
  // with `shadowBlurMm` > 0 the shadow glaze is read from a finer value map, so cast shadows keep their shapes (dappled
  // shade across a wall) instead of melting into the masses; its pieces may be smaller (`shadowMinPiece`)
  const fineDarks = o.shadowBlurMm > 0 ? (() => {
    const Lf = Float32Array.from(P1.L, (v, i) => (frame.mask[i] ? 100 : v));
    const g = valueGroups(Lf, w, h, { sigma: cells(o.shadowBlurMm), minLight: o.minLight, maxDark: o.shadowMaxDark, minArea: o.minArea / 4 }).groups;
    return Uint8Array.from(g, (v, i) => (v === 2 && !frame.mask[i] ? 1 : 0));
  })() : null;
  const darks = fineDarks ?? darks0, shadowPiece = fineDarks ? { joinMm: o.shadowJoinMm, minPiece: o.shadowMinPiece } : {};
  if (fineDarks) notes.push(`shadows read at ${o.shadowBlurMm} mm: ${(100 * share(darks, n)).toFixed(0)}% of the sheet`);
  // 1. sky or a pale unifying wash
  // a sky spans the top: light reached from the top in at least `skyColumns` of the columns, not a lit patch of wall
  const sky1 = skyMask(groups, w, h, { frame: frame.mask });
  let cols = 0; for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) if (sky1[y * w + x]) { cols++; break; } }
  const sky0 = cols >= o.skyColumns * w ? sky1 : new Uint8Array(n), skyArea = share(sky0, n);
  if (share(margin, n) > 0.01) notes.push(`the target's own paper margin (${(100 * share(margin, n)).toFixed(0)}% of the sheet) left unpainted`);
  if (frame.top + frame.bottom + frame.left + frame.right) notes.push(`photo border left unpainted (${frame.top}/${frame.right}/${frame.bottom}/${frame.left} cells)`);
  if (skyArea >= o.skyMin) {
    const sky = erode(sky0, w, h, cells(o.haloMm));
    const f = monochrome ? null : fit(sky), dir = f ? f.dir : roleMix(roles, K, { cool: 0.85, earth: 0.15 });
    // a warm light reached from the top is lit wall, not sky: same pale graded wash, honest name
    // with skyStrength > 0 a true sky takes that charge, graded down to skyTo: a deeper sky sets a pale lit tower off it
    const lit = f && f.want[2] > 6;
    passages.push(passage(lit ? 'top-light' : 'sky', 'unify', sky, dir, o.skyStrength > 0 && !lit ? o.skyStrength : Math.min(0.14, Math.max(0.07, 0.6 * medOD(sky) + 0.06)), { wet: true, grade: { from: 1, to: lit ? 0.3 : o.skyTo } }));
  } else {
    const glow = dilate(masses, w, h, cells(1.5));
    const dir = monochrome ? roleMix(roles, K, { warm: 0.8, earth: 0.2 }) : fit(masses).dir;
    passages.push(passage('light', 'unify', glow, dir, 0.08, { wet: true }));
    notes.push('no sky: a pale unifying wash over the masses');
  }
  // 2. local colour over mid and dark, split in two only where the hue clearly differs
  // with `lightChroma` > 0, a light that is clearly coloured (sunlit ochre stone, not a grey pavement) takes the local
  // wash too: local colour is laid across the lit form, and the shadow glaze then makes its value
  const warmLight = o.lightChroma > 0 ? Uint8Array.from(groups, (v, i) => (v === 0 && !frame.mask[i] && !sky0[i] && Math.hypot(P.a[i], P.b[i]) >= o.lightChroma ? 1 : 0)) : null;
  const local = Uint8Array.from(masses, (v, i) => ((v || (warmLight && warmLight[i])) && !sky0[i] ? 1 : 0));
  if (warmLight) notes.push(`coloured lights (chroma ${o.lightChroma} or more, ${(100 * share(warmLight, n)).toFixed(0)}% of the sheet) take the local wash`);
  const split = monochrome ? null : hueSplit(P, local, w, h, { minShare: 0.06, minGap: o.hueGap ?? 12 });
  const locals = split ?? [local];
  locals.forEach((m, k) => {
    // the mix is fitted within the strength the wash may have, so a capped wash keeps its hue instead of greying
    const f = monochrome ? null : fit(m, true, o.localMax), dir = f ? f.dir : roleMix(roles, K, o.monoLocal);
    const strength = f ? f.amount : o.lightness * medOD(m);
    passages.push(passage(`local-${k + 1}`, 'local', m, dir, Math.min(o.localMax, Math.max(0.08, strength)), { wet: false, fit: f }));
  });
  if (split) notes.push(`local colour split by hue into ${split.length} washes`);
  // 2b. with `foliageGreen` > 0, clearly green cells (a* at most -foliageGreen) get their own green wash at their own
  // value, fitted on the whole foliage (lights and darks), and the shadow glaze keeps off them so the green stays clean
  let foliage = null;
  if (o.foliageGreen > 0 && !monochrome) {
    const g0 = Uint8Array.from({ length: n }, (_, i) => (!frame.mask[i] && !sky0[i] && P.a[i] <= -o.foliageGreen && P.b[i] > 0 ? 1 : 0));
    const m = consolidate(g0, w, h, cells(o.joinMm), o.minPiece * n);
    if (share(m, n) >= 0.01) {
      const f = fitMix(medianLab(P, m, paperLab, o.lightness, false, o.chroma), pigments, paperRGB, FIT_AMOUNTS.filter(v => v <= o.foliageMax), o.capLWeight);
      passages.push(passage('foliage', 'local', m, f.dir, Math.min(o.foliageMax, Math.max(0.08, f.amount)), { wet: false, fit: f }));
      foliage = m;
      notes.push(`foliage: ${(100 * share(m, n)).toFixed(0)}% of the sheet in its own green wash`);
    }
  }
  // 3. one shadow glaze over the dark value, cool and neutral
  if (o.shadowOneMm > 0 && share(darks, n) > 0.01) {
    // with `shadowOneMm` > 0: the shadow pattern as one connected cool wash, its gaps narrower than shadowOneMm closed,
    // instead of hue-split pieces; the deep glaze below still states the darkest darks
    const m0 = foliage ? Uint8Array.from(darks, (v, i) => (v && !foliage[i] ? 1 : 0)) : darks;
    let m = consolidate(m0, w, h, cells(o.shadowOneMm), o.minPiece * n); const localOD = passages.at(-1).strength;
    // with `keepLights` > 0 (L*): the one wash leaves its lights. Inside it, connected patches at least keepLights
    // brighter than the wash's median (on the finer read) and of at least keepLightsMm2 stay out of the glaze, so
    // dappled sun on a shaded wall or path keeps the local colour under it instead of being filled in
    let kept = 0;
    if (o.keepLights > 0) {
      const Lf = gaussian(Float32Array.from(P1.L, (v, i) => (frame.mask[i] ? 100 : v)), w, h, cells(o.shadowBlurMm || 0.8) / 2);
      const inside = []; for (let i = 0; i < n; i++) if (m[i]) inside.push(Lf[i]);
      const cut = quantile(inside, 0.5) + o.keepLights, lit = Uint8Array.from(Lf, (v, i) => (m[i] && v >= cut ? 1 : 0));
      const { labels, areas } = components(lit, w, h), minCells = o.keepLightsMm2 / (mmPerCell * mmPerCell);
      m = Uint8Array.from(m, (v, i) => { const hole = labels[i] && areas[labels[i]] >= minCells; if (v && hole) kept++; return v && !hole ? 1 : 0; });
      notes.push(`lights kept inside the shadow wash: ${(100 * kept / n).toFixed(1)}% of the sheet`);
    }
    const f = monochrome ? null : fit(m, false), base = f ? f.dir : roleMix(roles, K, { cool: 0.6, earth: 0.4 });
    const dir = base.map((v, j) => 0.5 * v + (j === roles.cool ? 0.5 : 0));
    passages.push(passage('shadow', 'shadow', m, dir, Math.min(Math.max(0.32, o.shadowMin), Math.max(o.shadowMin, o.lightness * medOD(m) - 0.5 * localOD)), { wet: false, fit: f, joinMm: o.keepLights > 0 ? 0 : o.shadowOneMm }));
    notes.push(`one connected shadow wash (gaps under ${o.shadowOneMm} mm closed): ${(100 * share(m, n)).toFixed(0)}% of the sheet`);
  }
  if (share(darks, n) > 0.01) {
    // split like the local colour where the darks clearly differ in hue (green foliage against blue shadow on stone)
    const dsplit = monochrome || o.shadowOneMm > 0 ? null : hueSplit(P, darks, w, h, { minShare: 0.04, minGap: o.darkHueGap ?? o.hueGap ?? 12 });
    const localOD = passages.at(-1).strength;
    (o.shadowOneMm > 0 ? [] : dsplit ?? [darks]).forEach((m, k) => {
      const f = monochrome ? null : fit(m, false), base = f ? f.dir : roleMix(roles, K, { cool: 0.6, earth: 0.4 });
      // a shadow leans to the cool paint; a clearly coloured dark (foliage) keeps its own hue
      const chromaOf = f ? Math.hypot(f.want[1], f.want[2]) : 0, cool = chromaOf > 14 ? 0.15 : 0.4;
      const dir = base.map((v, j) => (1 - cool) * v + (j === roles.cool ? cool : 0));
      passages.push(passage(dsplit ? `shadow-${k + 1}` : 'shadow', 'shadow', m, dir, Math.min(Math.max(0.32, o.shadowMin), Math.max(o.shadowMin, o.lightness * medOD(m) - 0.5 * localOD)), { wet: false, fit: f, ...shadowPiece }));
    });
    if (dsplit) notes.push('shadow split by hue into 2 glazes');
    const dir = passages.at(-1).dir;
    // 4. a deeper glaze where the deepest darks hold together
    let keep;
    if (o.deepContrast > 0) {
      // with `deepContrast` > 0, the same rule for every subject: on a finer read, the darkest connected shapes (the
      // darkest `deepShare` of the sheet, at least `minArea`) that stand at least deepContrast L* under a ring around
      // them, so a dark opening in a lit wall gets the deep glaze and a dark that merely shades into dark does not
      const Lf = gaussian(Float32Array.from(P1.L, (v, i) => (frame.mask[i] ? 100 : v)), w, h, cells(o.shadowBlurMm || 0.8) / 2);
      keep = contrastDarks(Lf, w, h, { share: o.deepShare, minArea: Math.round(o.minArea * n), ring: Math.max(2, Math.round(cells(o.deepRingMm))), contrast: o.deepContrast, close: Math.max(1, Math.round(cells(0.6))) });
      notes.push(`deep: darkest shapes standing ${o.deepContrast} L* under their ${o.deepRingMm} mm surround, ${(100 * share(keep, n)).toFixed(1)}% of the sheet`);
    } else {
      const deepT = quantile(Lp, 0.06), deep0 = Uint8Array.from(Lp, (v, i) => (darks[i] && v <= deepT ? 1 : 0));
      const deep = dilate(erode(deep0, w, h, cells(0.6)), w, h, cells(0.6));
      keep = new Uint8Array(n); const { labels, areas } = components(deep, w, h);
      for (let i = 0; i < n; i++) if (labels[i] && areas[labels[i]] >= o.minArea * n) keep[i] = 1;
    }
    if (share(keep, n) >= (o.deepContrast > 0 ? 0.003 : 0.01)) passages.push(passage('deep', 'shadow', keep, roleMix(roles, K, { cool: 0.55, earth: 0.45 }).map((v, j) => (monochrome ? v : 0.5 * v + 0.5 * dir[j])), Math.min(Math.max(0.22, o.deepMin), Math.max(o.deepMin, 0.25 * medOD(keep))), { wet: false }));
  }
  for (const p of passages) { for (let i = 0; i < n; i++) if (frame.mask[i]) p.mask[i] = 0; p.mask = consolidate(p.mask, w, h, cells(p.joinMm ?? o.joinMm), (p.minPiece ?? o.minPiece) * n); }
  return { passages: passages.slice(0, PENWASH_MAX_PASSAGES), groups, frame: frame.mask, sky: skyArea >= o.skyMin ? sky0 : null, monochrome, chroma, thresholds, shares, roles, notes };
}

/**
 * The darkest connected shapes of L (the darkest `share` of cells, gaps under `close` cells closed) of at least
 * `minArea` cells whose mean L stands at least `contrast` under the mean of a `ring` cells wide band around them.
 */
export function contrastDarks(L, w, h, { share: q = 0.06, minArea = 20, ring = 6, contrast = 15, close = 1 } = {}) {
  const n = w * h, t = quantile(L, q), dark = erode(dilate(Uint8Array.from(L, v => (v <= t ? 1 : 0)), w, h, close), w, h, close);
  const { labels, areas } = components(dark, w, h), out = new Uint8Array(n), box = new Map();
  for (let i = 0; i < n; i++) { const k = labels[i]; if (!k || areas[k] < minArea) continue; const x = i % w, y = (i - x) / w, b = box.get(k); if (!b) box.set(k, [x, y, x, y, 0, 0]); else { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } }
  for (const [k, b] of box) {
    const x0 = Math.max(0, b[0] - ring), y0 = Math.max(0, b[1] - ring), x1 = Math.min(w - 1, b[2] + ring), y1 = Math.min(h - 1, b[3] + ring), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const own = new Uint8Array(bw * bh); let inS = 0, inN = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (labels[y * w + x] === k) { own[(y - y0) * bw + x - x0] = 1; inS += L[y * w + x]; inN++; }
    const grown = dilate(own, bw, bh, ring); let rS = 0, rN = 0;
    for (let j = 0; j < bw * bh; j++) if (grown[j] && !own[j]) { const x = x0 + (j % bw), y = y0 + ((j / bw) | 0), i = y * w + x; if (!dark[i]) { rS += L[i]; rN++; } }
    if (rN && rS / rN - inS / inN >= contrast) for (let j = 0; j < bw * bh; j++) if (own[j]) out[(y0 + ((j / bw) | 0)) * w + x0 + (j % bw)] = 1;
  }
  return out;
}

// The mass split into two by hue (k-means on a*, b*), or null when one wash serves it.
function hueSplit(P, mask, w, h, { minShare, minGap }) {
  const n = w * h, idx = []; for (let i = 0; i < n; i++) if (mask[i]) idx.push(i);
  if (idx.length < 50) return null;
  let c = [[quantile(idx.map(i => P.a[i]), 0.2), quantile(idx.map(i => P.b[i]), 0.2)], [quantile(idx.map(i => P.a[i]), 0.8), quantile(idx.map(i => P.b[i]), 0.8)]];
  const lab = new Uint8Array(n);
  for (let it = 0; it < 12; it++) {
    const s = [[0, 0, 0], [0, 0, 0]];
    for (const i of idx) { const d0 = Math.hypot(P.a[i] - c[0][0], P.b[i] - c[0][1]), d1 = Math.hypot(P.a[i] - c[1][0], P.b[i] - c[1][1]); const k = d0 <= d1 ? 0 : 1; lab[i] = k; s[k][0] += P.a[i]; s[k][1] += P.b[i]; s[k][2]++; }
    c = s.map((v, k) => (v[2] ? [v[0] / v[2], v[1] / v[2]] : c[k]));
  }
  if (Math.hypot(c[0][0] - c[1][0], c[0][1] - c[1][1]) < minGap) return null;
  const labels = Uint8Array.from({ length: n }, (_, i) => (mask[i] ? lab[i] + 1 : 0));
  const smooth = smoothLabels(labels, 3, w, h, 4);
  const parts = [1, 2].map(k => Uint8Array.from(smooth, (v, i) => (v === k && mask[i] ? 1 : 0)));
  if (parts.some(m => share(m, n) < minShare)) return null;
  return parts;
}

// One wash, not a scatter: gaps narrower than `r` cells closed, then pieces under `minArea` cells dropped.
function consolidate(mask, w, h, r, minArea) {
  const c = erode(dilate(mask, w, h, r), w, h, r), { labels, areas } = components(c, w, h), out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) if (labels[i] && areas[labels[i]] >= minArea) out[i] = 1;
  return out;
}

// A square max (or min, with f = Math.min) filter of radius r over a plane, separable.
function rankFilter(L, w, h, r, f) {
  const pass = (src, horizontal) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = src[y * w + x];
      for (let d = -r; d <= r; d++) {
        const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) v = f(v, src[yy * w + xx]);
      }
      out[y * w + x] = v;
    }
    return out;
  };
  return pass(pass(L, true), false);
}

// The slope of a plane in units per mm (central differences over cells mmPerCell wide).
function gradientMm(L, w, h, mmPerCell) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (L[y * w + Math.min(w - 1, x + 1)] - L[y * w + Math.max(0, x - 1)]) / 2, gy = (L[Math.min(h - 1, y + 1) * w + x] - L[Math.max(0, y - 1) * w + x]) / 2;
    g[y * w + x] = Math.hypot(gx, gy) / mmPerCell;
  }
  return g;
}

// Holes in a mask (connected unmasked areas not touching the border) smaller than `minCells` filled.
function fillHoles(mask, w, h, minCells) {
  if (!(minCells > 0)) return mask;
  const inv = Uint8Array.from(mask, v => (v ? 0 : 1)), { labels, areas } = components(inv, w, h), edge = new Set();
  for (let x = 0; x < w; x++) { edge.add(labels[x]); edge.add(labels[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { edge.add(labels[y * w]); edge.add(labels[y * w + w - 1]); }
  return Uint8Array.from(mask, (v, i) => (v || (labels[i] && !edge.has(labels[i]) && areas[labels[i]] < minCells) ? 1 : 0));
}

/**
 * A wash's vertical grade from the target: the target's darkness (paper L* minus L*) over the mask, fitted by a
 * straight line down the sheet, as charge multipliers at the top and bottom rows (mean 1 at the mask's mean row,
 * never under `floor`). Null when the two ends differ by less than `min`: a flat wash.
 */
function gradeOf(L, mask, w, h, paperL, { min = 0.3, floor = 0.15 } = {}) {
  let n = 0, sy = 0, sd = 0, syy = 0, syd = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) continue; const d = Math.max(0, paperL - L[i]); n++; sy += y; sd += d; syy += y * y; syd += y * d; }
  if (n < 50) return null;
  const my = sy / n, md = sd / n, vy = syy / n - my * my;
  if (md <= 0 || vy <= 0) return null;
  const b = (syd / n - my * md) / vy, at = y => Math.max(floor, (md + b * (y - my)) / md);
  const from = at(0), to = at(h - 1);
  return Math.abs(from - to) < min ? null : { from: +from.toFixed(3), to: +to.toFixed(3) };
}

/**
 * The stage planner (--penwashplan stages): the order a pen-and-wash illustrator works in, lights first.
 *   0. whites: paper is kept where the target is in the upper half of its own light mass (sunlit faces, sky lights,
 *      glints), read at `whiteMm`; holes under `holeMm2` inside a white (a figure on a sunlit street) stay white
 *      for the pen. No wash covers a white.
 *   1. first wash: one pale, wet, unifying wash over the rest of the sheet, split in two touching parts only where
 *      the hue clearly differs (smoothed over `hueSmoothMm`), graded down the sheet where the target grades, at
 *      `firstC` of the target's value and no more than `firstMaxDL` L*.
 *   2. shadow wash: one mid-value wash over the darker half of the mid value and the dark (shadow planes and cast
 *      shadows), read at `fineMm`, pieces under `shadowPiece` of the sheet left to the pen, laid wet on dry so its
 *      edge is crisp; where no sharp target edge (`softGrad` L* per mm) lies within `softBandMm`, the band outside the
 *      edge is marked `soft` and wetted first (pen-wash.mjs), so the edge softens where the form turns.
 *   3. darks: the darkest shapes standing `darkContrast` L* under their surround (windows, recesses, accents), at
 *      most `darkShare` of the sheet, laid last, dry, with a small brush.
 * Every charge comes from ladderStrengths at the wash's own share of the target value, so the washes stay lighter
 * than the photo and the ink carries the darkest structure.
 */
function planStages({ px, w, h, pigments, mmPerCell, paperRGB, options = {} }) {
  const n = w * h, K = pigments.length, cells = mm => Math.max(1, mm / mmPerCell), paper = paperRGB ?? [247, 244, 236];
  const o = { blurMm: 2.5, fineMm: 0.8, whiteMm: 0.8, chroma: 1.25, hueGap: 18, hueSmoothMm: 5, joinMm: 1.5, minPiece: 0.004,
    whiteMinMm2: 2, holeMm2: 0, shadowPiece: 0.004, firstC: 0.35, firstMaxDL: 9, shadowC: 0.55, shadowMaxDL: 16,
    darkC: 0.65, darkMaxDL: 14, darkShare: 0.04, darkContrast: 12, darkRingMm: 2, darkBrushMm: 3, softGrad: 0, softBandMm: 1.5,
    softBlurMm: 0.8, maxStrength: 0.45, minDL: 1.5, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) };
  const P0 = labPlanesOf(px, w, h, 1), frame = frameMask(P0.L, w, h), margin = paperMargin(P0.L, w, h, { frame: frame.mask });
  for (let i = 0; i < n; i++) if (margin[i]) frame.mask[i] = 1;
  const inside = i => !frame.mask[i], blur = mm => gaussian(Float32Array.from(P0.L, (v, i) => (frame.mask[i] ? 100 : v)), w, h, cells(mm) / 2);
  const P = { L: blur(o.blurMm), a: gaussian(P0.a, w, h, cells(o.blurMm) / 2), b: gaussian(P0.b, w, h, cells(o.blurMm) / 2) };
  const Lw = blur(o.whiteMm), Lf = blur(o.fineMm), notes = [];
  // the target's own three values (3-means on the coarse read, inside the frame) and the centre of its light mass
  const { light: tLight, dark: tDark } = threeValueThresholds(P.L.filter((_, i) => inside(i)));
  let ls = 0, lc = 0; for (let i = 0; i < n; i++) if (inside(i) && P.L[i] >= tLight) { ls += P.L[i]; lc++; }
  const tWhite = (tLight + (lc ? ls / lc : tLight)) / 2, tShadow = (tLight + tDark) / 2, mm2 = a => a / (mmPerCell * mmPerCell);
  // 0. whites
  const white0 = Uint8Array.from(Lw, (v, i) => (inside(i) && v >= tWhite ? 1 : 0)), { labels: wl, areas: wa } = components(white0, w, h);
  const white = fillHoles(Uint8Array.from(white0, (v, i) => (v && wa[wl[i]] >= mm2(o.whiteMinMm2) ? 1 : 0)), w, h, mm2(o.holeMm2));
  notes.push(`whites kept: ${(100 * share(white, n)).toFixed(0)}% of the sheet (target L* ${tWhite.toFixed(1)} or more; light mass from ${tLight.toFixed(1)})`);
  let chroma = 0; for (let i = 0; i < n; i++) chroma += Math.hypot(P.a[i], P.b[i]); chroma /= n;
  const monochrome = chroma < 6, roles = paletteRoles(pigments), paperLab = lab(...paper);
  const fitOf = (mask, lit) => fitMix(medianLab(P, mask, paperLab, 1, lit, o.chroma), pigments, paper, FIT_AMOUNTS.filter(v => v <= 0.3), 0.3);
  const passages = [];
  // the shadow wash's shape: the darker half of the mid value and the dark, pieces under shadowPiece left to the pen
  const shadow0 = consolidate(Uint8Array.from(Lf, (v, i) => (inside(i) && !white[i] && v < tShadow ? 1 : 0)), w, h, cells(o.joinMm), o.shadowPiece * n);
  const shadow = Uint8Array.from(fillHoles(shadow0, w, h, mm2(o.holeMm2)), (v, i) => (v && !white[i] ? 1 : 0));
  // 1. first wash over everything that is not white, in at most two hue parts; graded by the target over its own
  // band (outside the shadow wash, whose darkness is the shadow wash's job)
  const first = consolidate(Uint8Array.from({ length: n }, (_, i) => (inside(i) && !white[i] ? 1 : 0)), w, h, cells(o.joinMm), o.minPiece * n);
  const parts = (() => {
    const raw = monochrome ? null : hueSplit(P, first, w, h, { minShare: 0.06, minGap: o.hueGap });
    if (!raw) return null;
    const lab3 = smoothLabels(Uint8Array.from({ length: n }, (_, i) => (raw[0][i] ? 1 : raw[1][i] ? 2 : 0)), 3, w, h, cells(o.hueSmoothMm));
    const two = [1, 2].map(k => consolidate(Uint8Array.from(lab3, (v, i) => (v === k && first[i] ? 1 : 0)), w, h, cells(o.joinMm), 0.01 * n));
    if (!two.every(m => share(m, n) >= 0.06)) return null;
    // cells the smoothing left out go to the bigger part, so the first wash still covers them
    const big = share(two[0], n) >= share(two[1], n) ? 0 : 1;
    return two.map((m, k) => (k === big ? Uint8Array.from(m, (v, i) => (v || (first[i] && !two[1 - k][i]) ? 1 : 0)) : m));
  })();
  (parts ?? [first]).forEach((m, k) => {
    const f = monochrome ? null : fitOf(m, true), dir = f ? f.dir : roleMix(roles, K, { warm: 0.7, cool: 0.15, earth: 0.15 });
    passages.push(passage(`first-${k + 1}`, 'local', m, dir, 0.1, { fit: f, ladderC: o.firstC, maxDL: o.firstMaxDL, grade: gradeOf(P.L, Uint8Array.from(m, (v, i) => (v && !shadow[i] ? 1 : 0)), w, h, paperLab[0]) ?? undefined, pad: 0 }));
  });
  if (parts) notes.push('first wash in 2 touching parts by hue');
  // 2. one shadow wash over the darker half of the mid value and the dark (its shape read above)
  if (share(shadow, n) > 0.005) {
    const f = monochrome ? null : fitOf(shadow, false), base = f ? f.dir : roleMix(roles, K, { cool: 0.6, earth: 0.4 });
    let soft = null;
    if (o.softGrad > 0) {
      const band = Math.max(1, Math.round(cells(o.softBandMm))), ring = Uint8Array.from(dilate(shadow, w, h, band), (v, i) => (v && !shadow[i] ? 1 : 0));
      const sharp = rankFilter(gradientMm(blur(o.softBlurMm), w, h, mmPerCell), w, h, band, Math.max);
      soft = Uint8Array.from(ring, (v, i) => (v && sharp[i] < o.softGrad && !white[i] ? 1 : 0));
      notes.push(`shadow edge soft on ${(100 * share(soft, n) / Math.max(1e-9, share(ring, n))).toFixed(0)}% of its outside band (no target edge of ${o.softGrad} L*/mm within ${o.softBandMm} mm)`);
    }
    passages.push(passage('shadow', 'shadow', shadow, base.map((v, j) => 0.75 * v + (j === roles.cool ? 0.25 : 0)), 0.2, { fit: f, ladderC: o.shadowC, maxDL: o.shadowMaxDL, dry: true, pad: 0, soft }));
    notes.push(`shadow wash: ${(100 * share(shadow, n)).toFixed(0)}% of the sheet (target L* under ${tShadow.toFixed(1)})`);
  }
  // 3. darks last: small and few
  const dk = contrastDarks(Lf, w, h, { share: o.darkShare, minArea: Math.max(4, Math.round(mm2(1))), ring: Math.max(2, Math.round(cells(o.darkRingMm))), contrast: o.darkContrast, close: Math.max(1, Math.round(cells(0.4))) });
  const darks = Uint8Array.from(dk, (v, i) => (v && inside(i) ? 1 : 0));
  if (share(darks, n) > 0.001) {
    const sh = passages.at(-1).dir;
    passages.push(passage('darks', 'shadow', darks, roleMix(roles, K, { cool: 0.55, earth: 0.45 }).map((v, j) => (monochrome ? v : 0.5 * v + 0.5 * sh[j])), 0.3, { ladderC: o.darkC, maxDL: o.darkMaxDL, dry: true, brushMm: o.darkBrushMm }));
    notes.push(`darks: ${(100 * share(darks, n)).toFixed(1)}% of the sheet`);
  }
  // hairline gaps (0.3 mm) closed in every wash; no piece is dropped here
  const closed = passages.map(p => ({ ...p, mask: consolidate(p.mask, w, h, cells(0.3), 0) }));
  const laid = ladderStrengths(closed, { L: P.L, n, pigments, paperRGB: paper, minDL: o.minDL, maxStrength: o.maxStrength });
  notes.push(`stages: ${laid.map(p => `${p.id} ${p.strength.toFixed(2)}${p.grade ? ` graded ${p.grade.from} to ${p.grade.to}` : ''}`).join(', ')}`);
  const groups = Uint8Array.from({ length: n }, (_, i) => (white[i] ? 0 : darks[i] || shadow[i] ? 2 : 1));
  return { passages: laid, groups, frame: frame.mask, sky: null, monochrome, chroma, thresholds: { white: tWhite, light: tLight, shadow: tShadow, dark: tDark }, shares: [share(white, n), 0, share(shadow, n)], roles, notes };
}

/** The comparison planner: up to `k` colour regions, one flat wash each, light to dark. Light regions stay paper. */
function planColourRegions({ px, w, h, pigments, mmPerCell, paperRGB, options = {} }) {
  const n = w * h, K = pigments.length, cells = mm => Math.max(1, mm / mmPerCell);
  const o = { blurMm: 2.5, k: 5, minLight: 0.3, lightness: 0.5, minArea: 0.03, ...options };
  const P = labPlanesOf(px, w, h, cells(o.blurMm)), frame0 = frameMask(P.L, w, h).mask, margin = paperMargin(P.L, w, h, { frame: frame0 }), frame = Uint8Array.from(frame0, (v, i) => v | margin[i]), paperLab = lab(...(paperRGB ?? [247, 244, 236]));
  for (let i = 0; i < n; i++) if (frame[i]) { P.L[i] = 100; P.a[i] = 0; P.b[i] = 0; }
  // k-means in Lab, started on L* quantiles
  let c = Array.from({ length: o.k }, (_, j) => { const q = (j + 0.5) / o.k, t = quantile(P.L, q); let s = [0, 0, 0], m = 0; for (let i = 0; i < n; i += 7) if (Math.abs(P.L[i] - t) < 3) { s[0] += P.L[i]; s[1] += P.a[i]; s[2] += P.b[i]; m++; } return m ? s.map(v => v / m) : [t, 0, 0]; });
  let lab8 = new Uint8Array(n);
  for (let it = 0; it < 14; it++) {
    const s = c.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { let bj = 0, bd = Infinity; for (let j = 0; j < o.k; j++) { const d = (P.L[i] - c[j][0]) ** 2 + (P.a[i] - c[j][1]) ** 2 + (P.b[i] - c[j][2]) ** 2; if (d < bd) { bd = d; bj = j; } } lab8[i] = bj; s[bj][0] += P.L[i]; s[bj][1] += P.a[i]; s[bj][2] += P.b[i]; s[bj][3]++; }
    c = s.map((v, j) => (v[3] ? [v[0] / v[3], v[1] / v[3], v[2] / v[3]] : c[j]));
  }
  lab8 = smoothLabels(lab8, o.k, w, h, cells(o.blurMm) / 2);
  const lightL = quantile(P.L, 1 - o.minLight);
  const regions = c.map((ctr, j) => ({ j, L: ctr[0], mask: Uint8Array.from(lab8, v => (v === j ? 1 : 0)) }))
    .filter(r => r.L < lightL && share(r.mask, n) >= o.minArea).sort((a, b) => b.L - a.L).slice(0, PENWASH_MAX_PASSAGES);
  const passages = regions.map((r, k) => {
    const f = fitMix(medianLab(P, r.mask, paperLab, o.lightness, true), pigments, paperRGB);
    return passage(`region-${k + 1}`, 'region', r.mask, f.dir, Math.min(0.3, Math.max(0.04, f.amount)), { wet: false, fit: f });
  });
  return { passages, groups: lab8, sky: null, monochrome: false, notes: [`${regions.length} colour regions of ${o.k}`] };
}

/** Either planner by name. */
export function planPenWash({ planner = 'values', ...args }) {
  if (!PENWASH_PLANNERS.includes(planner)) throw new Error(`--penwashplan: ${PENWASH_PLANNERS.join(' or ')}, not ${planner}`);
  return planner === 'colour' ? planColourRegions(args) : planner === 'stages' ? planStages(args) : planValues(args);
}

/** A passage's planned pigment per cell (cells x K): the mix at its strength over its mask, graded if it says so. */
export function passageAmounts(p, w, h, K) {
  const out = new Float32Array(w * h * K);
  for (let y = 0; y < h; y++) {
    const g = p.grade ? p.grade.from + (p.grade.to - p.grade.from) * (y / Math.max(1, h - 1)) : 1;
    for (let x = 0; x < w; x++) { const i = y * w + x; if (p.mask[i]) for (let j = 0; j < K; j++) out[i * K + j] = p.dir[j] * p.strength * g; }
  }
  return out;
}

/** Summary rows for pen-wash-plan.json (no masks). */
export const describePlan = (plan, n, pigments) => ({
  monochrome: plan.monochrome, chroma: plan.chroma ?? null, thresholds: plan.thresholds ?? null, valueShares: plan.shares ?? null, notes: plan.notes,
  passages: plan.passages.map(p => ({ id: p.id, role: p.role, ...(p.fit ? { fit: { want: p.fit.want.map(v => +v.toFixed(1)), got: p.fit.got.map(v => +v.toFixed(1)), dE: +p.fit.e.toFixed(1) } } : {}), area: +share(p.mask, n).toFixed(4), strength: +p.strength.toFixed(3), wet: !!p.wet, grade: p.grade ?? null,
    mix: Object.fromEntries(p.dir.map((v, j) => [pigments[j].name ?? `pigment ${j}`, +v.toFixed(3)]).filter(([, v]) => v > 0.005)) })),
});
