// The wash plan in three layers, as a watercolourist lays them. Every shape is a smooth outline in millimetres; no clip
// mask reaches the brush and no colour is judged cell by cell.
//
// The subject is read only SQUINTED: blurred so that nothing under a few millimetres on the sheet is left (Gaussian
// sigma RESERVE_SIGMA_MM for the lights, SHADOW_SIGMA_MM for the shadows, ZONE_SIGMA_MM for the first wash's areas).
//
// 1. First wash: big, pale, connected. The sheet's areas of one local colour (the squinted colour clustered into a few
//    families, each area at least ZONE_LEAST_MM2) are laid in one wet session. An area's colour is its LIGHT-side local
//    colour (the lighter part of the area, not its mean). While it is wet, a few charges of a second mix are dropped in
//    where the area's light-side colour, read over a few centimetres, differs from the wash; the sheet's wet physics
//    blends them. The brightest lights are kept as bare paper, their outlines simplified as a painter squints them.
// 2. Shadow shapes, on the dry first wash: where the squinted subject is clearly darker than its area's light side, in
//    two steps (shadow, deeper shadow), each shape one glaze in one mix; the shapes cross the areas freely.
// 3. Darks and accents last: a few of the squinted subject's darkest spots, each one mark of a round brush along it.
// Every shape is filled with parallel overlapping sweeps (sweep-fill.mjs). Plan time only.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { labOf, deltaE2000 } from '../../eval/colour.mjs';
import { outlineLoops, loopsMask } from './wash-strokes.mjs';
import { sweepFill } from './sweep-fill.mjs';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { targetRegions } from './target-regions.mjs';
import { targetValueMap, estimatePaper } from './light-to-dark.mjs';

/** The plan's grid cell (mm): fine enough for a smooth outline, never finer than the sheet's cells. */
const PLAN_MM = 0.5;
/** Squint (Gaussian sigma, mm) for the reserved lights, the shadow shapes, the darks and the first wash's areas. */
export const RESERVE_SIGMA_MM = 5, SHADOW_SIGMA_MM = 5, DARK_SIGMA_MM = 3.5, ZONE_SIGMA_MM = 5;
/** Bare paper: squinted within this L* of the lighter of the paper and the picture's lightest tone, and no more chromatic than this. */
const RESERVE_WITHIN = 7, RESERVE_CHROMA = 12;
/** The least reserved light (mm2) and the brush (mm) that rounds its outline. */
const RESERVE_LEAST_MM2 = 25, RESERVE_ROUND_MM = 4;
/** First wash: at most this many colour families; families nearer than this (Lab) are one; an area is at least this big (mm2) or this share of the sheet. */
const ZONE_FAMILIES = 6, ZONE_JOIN = 6, ZONE_LEAST_MM2 = 150, ZONE_LEAST_SHARE = 0.012;
/** Areas are told apart by hue and chroma first: light weighs this much, so a lit face and its shadowed side are one area. */
const ZONE_L_WEIGHT = 0.15;
/** An area whose light side is this near the paper (CIEDE2000) is left as paper: a lot of the sheet stays bare. */
const ZONE_PAPER = 6;
/** Under a pen drawing (ink and wash) the drawing carries the structure and more is left bare: lights within this L*. */
const RESERVE_WITHIN_DRAWN = 12;
/** An area's wash goes round an area inside it that is lighter than it, or less than this much darker (L*). */
const AROUND_LIGHTER = 4;
/** ... and runs behind a hole in it no bigger than this share of it. */
const HOLE_MOST = 0.3;
/** The light side of an area: the cells between these quantiles of its L*. */
const LIGHT_SIDE = [0.6, 0.92];
/** Charges: tiles this wide (mm) read for the local light side; a charge where it is this far (CIEDE2000) from the wash; at most this many a wash, one per this much area (mm2). */
const CHARGE_TILE_MM = 24, CHARGE_DIFFERS = 5, CHARGE_MOST = 4, CHARGE_PER_MM2 = 1600;
/** Shadow steps: this much darker (L*) than the area's light side, and the deeper step. */
const SHADOW_STEP = 12, DEEP_STEP = 26;
/** The least shadow shape (mm2); the brush (mm) that rounds its outline (its smallest feature); the most shapes a step. */
const SHADOW_LEAST_MM2 = 40, SHADOW_ROUND_MM = 7, SHADOW_MOST = 30;
/** Darks: no lighter than the picture's 3rd percentile plus this, this much darker than what is laid there, at least this big (mm2), at most this many. */
const DARK_REACH = 10, DARK_UNDER = 14, DARK_LEAST_MM2 = 15, DARK_MOST = 14;
/** A wash is graded: its charge runs this share (at least, at most) either side of its mix; L* of the subject's own change per share. */
const GRADE_LEAST = 0.12, GRADE_MOST = 0.35, GRADE_PER_L = 40;
/** A wash is laid only when it darkens what is under it by this much L*. */
const VISIBLE_STEP = 2;
/** Outline tolerance (mm) for lights, areas, shadows. */
const LIGHT_TOL_MM = 0.6, ZONE_TOL_MM = 1.5, SHADOW_TOL_MM = 1.2;

// --- grids --------------------------------------------------------------------------------------------------------
/** Gaussian blur of a w x h plane (sigma in cells), edges clamped. */
export function blur(src, w, h, sigma) {
  if (!(sigma > 0.3)) return Float32Array.from(src);
  const r = Math.ceil(3 * sigma), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]; out[y * w + x] = a; }
  return out;
}
function dilate(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  const a = new Float32Array(m.length), b = new Uint8Array(m.length), r2 = r * r;
  // a disc: rows by run, then the disc's half-chords
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; a[y * w + x] = x - last; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; a[y * w + x] = Math.min(a[y * w + x], last - x); } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let hit = 0; for (let dy = -r; dy <= r && !hit; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; if (a[yy * w + x] * a[yy * w + x] + dy * dy <= r2) hit = 1; } b[y * w + x] = hit; }
  return b;
}
const invert = m => Uint8Array.from(m, v => 1 - v);
const erode = (m, w, h, r) => invert(dilate(invert(m), w, h, r));
/** A mask rounded as a brush of radius r would lay it: closed (gaps under 2r joined) then opened (parts under 2r dropped). */
export function roundMask(m, w, h, r) { return dilate(erode(erode(dilate(m, w, h, r), w, h, r), w, h, r), w, h, r); }
/** Clears the parts of `m` smaller than `least` cells; returns the components left. */
function keepParts(m, w, h, least) {
  const c = components(m, w, h, 4), size = new Int32Array(c.count + 1);
  for (const id of c.labels) if (id) size[id]++;
  for (let i = 0; i < m.length; i++) if (m[i] && size[c.labels[i]] < least) m[i] = 0;
  return components(m, w, h, 4);
}
/** The mask with its holes filled (the cells not reached from the sheet's edge through cells outside it). */
function fillHoles(m, w, h) {
  const out = Uint8Array.from(m, () => 1), stack = [];
  const push = i => { if (!m[i] && out[i]) { out[i] = 0; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) { const i = stack.pop(), x = i % w; if (x) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i + w < w * h) push(i + w); }
  return out;
}
/** The outline loops (mm) of the component `id` of `labels`, with its holes. */
function loopsOf(labels, id, w, h, planMm, tolMm) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < labels.length; i++) if (labels[i] === id) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? [] : outlineLoops(labels, id, { x0, y0, x1, y1 }, w, h, { cellMm: planMm, tolMm });
}
/** The 4-connected parts of a label map (cells with equal labels, label 0 left out): {labels, count}. */
function labelParts(lab, w, h) {
  const out = new Int32Array(lab.length), stack = new Int32Array(lab.length); let count = 0;
  for (let s0 = 0; s0 < lab.length; s0++) {
    if (!lab[s0] || out[s0]) continue;
    count++; let sp = 0; stack[sp++] = s0; out[s0] = count;
    while (sp) { const i = stack[--sp], x = i % w; for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < lab.length && !out[j] && lab[j] === lab[s0]) { out[j] = count; stack[sp++] = j; } }
  }
  return { labels: out, count };
}
const shoelace = P => P.reduce((a, p, q) => { const b = P[(q + 1) % P.length]; return a + (p[0] * b[1] - b[0] * p[1]) / 2; }, 0);

/** The median colour (sRGB) of `cells` between two quantiles of their L*. */
export function sideColour(cells, rgbAt, LAt, [lo, hi]) {
  if (!cells.length) return null;
  const s = [...cells].sort((a, b) => LAt(a) - LAt(b)), a = Math.min(s.length - 1, Math.floor(lo * s.length)), b = Math.max(a + 1, Math.ceil(hi * s.length)), mid = s.slice(a, b);
  return [0, 1, 2].map(c => { const v = mid.map(i => rgbAt(i)[c]).sort((p, q) => p - q); return v[v.length >> 1]; });
}

/** k-means on rows of features (Float32Array n x d), farthest-point start; returns centres. */
export function kmeans(rows, d, k, iterations = 12) {
  const n = rows.length / d; if (!n) return [];
  const centres = [Array.from(rows.subarray(0, d))], dist = new Float32Array(n).fill(Infinity);
  const d2 = (i, c) => { let s = 0; for (let j = 0; j < d; j++) s += (rows[i * d + j] - c[j]) ** 2; return s; };
  while (centres.length < k) { let far = -1, fd = 0; for (let i = 0; i < n; i++) { dist[i] = Math.min(dist[i], d2(i, centres[centres.length - 1])); if (dist[i] > fd) { fd = dist[i]; far = i; } } if (far < 0 || fd < 1e-6) break; centres.push(Array.from(rows.subarray(far * d, far * d + d))); }
  for (let it = 0; it < iterations; it++) {
    const sum = centres.map(() => new Float64Array(d)), cnt = new Int32Array(centres.length);
    for (let i = 0; i < n; i++) { let best = 0, bd = Infinity; centres.forEach((c, q) => { const v = d2(i, c); if (v < bd) { bd = v; best = q; } }); cnt[best]++; for (let j = 0; j < d; j++) sum[best][j] += rows[i * d + j]; }
    centres.forEach((c, q) => { if (cnt[q]) for (let j = 0; j < d; j++) c[j] = sum[q][j] / cnt[q]; });
  }
  return centres;
}

export function planLayeredWashes({ demand, k, density, w, h, rgb = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], hold = null, families = [], subject = null, shaped = true, drawn = false }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (demand.length !== n * k || density.length !== n || k < 1) throw Error('target/demand grid mismatch');
  if (!rgb || pigments.length !== k) throw Error('the wash plan needs the subject colours and the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  const paper = estimatePaper(rgb, w, h, density);
  const value = targetValueMap(paper ? Float32Array.from(density, v => Math.max(0, v - paper.density)) : density), region = targetRegions({ w, h, rgb, demand, k, density, families });
  // the plan's grid: the subject on it, mean light per cell
  const planMm = Math.max(PLAN_MM, cellMm), pw = Math.max(1, Math.round(sheetWidthMm / planMm)), ph = Math.max(1, Math.round(h * pw / w)), pn = pw * ph, mmX = sheetWidthMm / pw;
  const lin = [0, 1, 2].map(() => new Float32Array(pn)), cnt = new Float32Array(pn);
  for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) { const q = py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0), i = y * w + x; cnt[q]++; for (let c = 0; c < 3; c++) lin[c][q] += (rgb[i * 3 + c] / 255) ** 2.2; } }
  for (let q = 0; q < pn; q++) for (let c = 0; c < 3; c++) lin[c][q] /= Math.max(1, cnt[q]);
  const toRGB = (planes, q) => [0, 1, 2].map(c => Math.round(255 * Math.max(0, Math.min(1, planes[c][q])) ** (1 / 2.2)));
  const lab = (planes) => { const L = new Float32Array(pn), A = new Float32Array(pn), B = new Float32Array(pn); for (let q = 0; q < pn; q++) { const [l, a, b] = labOf(toRGB(planes, q), 0, paperCol); L[q] = l; A[q] = a; B[q] = b; } return { L, A, B }; };
  // the subject squinted at a sigma in mm: light blurred in linear light, then read as Lab
  const squint = sigmaMm => { const planes = lin.map(p => blur(p, pw, ph, sigmaMm / mmX)); return { planes, ...lab(planes) }; };
  const mm2 = cells => cells * mmX * mmX, cellsFor = a => a / (mmX * mmX), rC = mm => Math.max(1, Math.round(mm / mmX));

  const S6 = squint(ZONE_SIGMA_MM);
  // --- 1. the reserved lights ---
  const S2 = squint(RESERVE_SIGMA_MM), sortedL = Float32Array.from(S2.L).sort(), lightest = sortedL[Math.floor(.995 * (pn - 1))];
  const reserveFrom = Math.min(100, lightest) - (drawn ? RESERVE_WITHIN_DRAWN : RESERVE_WITHIN);
  let reserve = Uint8Array.from(S2.L, (v, q) => (v >= reserveFrom && Math.hypot(S2.A[q], S2.B[q]) <= RESERVE_CHROMA ? 1 : 0));
  reserve = roundMask(reserve, pw, ph, rC(RESERVE_ROUND_MM / 2));
  const rc = keepParts(reserve, pw, ph, cellsFor(RESERVE_LEAST_MM2)), lightLoops = [];
  for (let id = 1; id <= rc.count; id++) lightLoops.push(...loopsOf(rc.labels, id, pw, ph, mmX, LIGHT_TOL_MM).filter(l => Math.abs(shoelace(l.points)) >= RESERVE_LEAST_MM2 / 2));
  const lightMask = lightLoops.length ? loopsMask(lightLoops, pw, ph, mmX) : new Uint8Array(pn);

  // what the plan has laid, per plan cell and pigment
  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], polygons = [], byStage = [0, 0, 0, 0]; let strokeCount = 0;
  const STAGE = ['', 'first wash', 'charge', 'shadow', 'dark'];
  const under = cells => { const u = new Array(k).fill(0); for (const q of cells) for (let j = 0; j < k; j++) u[j] += laid[j][q] / cells.length; return u; };
  const cellsIn = loops => { const m = loopsMask(loops, pw, ph, mmX), out = []; for (let q = 0; q < pn; q++) if (m[q]) out.push(q); return out; };
  /**
   * One shape's wash: `colour` is what the shape is to read as when laid over what is under it (or, with `amounts`, the
   * mix itself). Returns the shape (a passage the painter lays) or null when it would not show.
   */
  const shape = (stage, what, loops, colour, { strokes = null, amounts = null, move = 'wet on dry', keepOut = null, growMm = 0 } = {}) => {
    if (!loops.length) return null;
    const cells = cellsIn(loops); if (!cells.length) return null;
    const u = under(cells);
    const mix = amounts ?? (u.every(v => v <= 1e-9) ? mixFor(colour, pigments, paperCol) : mixOver(colour, u, pigments, paperCol)), strength = mix.reduce((a, v) => a + v, 0);
    if (!(strength > 1e-6)) return null;
    const before = filmLab(u, pigments, paperCol)[0], after = filmLab(u.map((v, j) => v + mix[j]), pigments, paperCol)[0];
    if (stage !== 2 && before - after < VISIBLE_STEP) return null;
    const fill = strokes ? { strokes, brushMm: Math.max(...strokes.map(s => 2 * s.radiusMm)), depthMm: 0, uncovered: 0 } : sweepFill(loops, { kitMm: washKitMm, growMm, keepOut });
    if (!strokes) gradeStrokes(fill, cells);
    if (!fill.strokes.length) return null;
    for (const q of cells) if (!lightMask[q] || stage > 1) for (let j = 0; j < k; j++) laid[j][q] += mix[j];
    // the shape on the sheet's cells, for the painter's records (its edge is where the strokes end)
    const sm = loopsMask(loops, w, h, cellMm), ids = new Uint8Array(n), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
    for (let i = 0; i < n; i++) if (sm[i] && !hold?.[i]) { ids[i] = 1; area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    if (!area) return null;
    const mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage });
    const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...mix]; sh.graded = null; sh._follow = true; sh.firstWash = stage <= 2; sh._opening = 1;
    const areaMm2 = mm2(cells.length), phase = stage <= 2 ? 'light' : stage === 3 ? 'mid' : 'shadow';
    let rim = 0; for (const l of loops) for (let v = 0; v < l.points.length; v++) { const P = l.points[v], Q = l.points[(v + 1) % l.points.length]; rim += Math.hypot(Q[0] - P[0], Q[1] - P[1]); }
    strokeCount += fill.strokes.length;
    const wet = move === 'wet on wet';
    const intent = { id: `${phase}/s${stage}/m${mixId}/${STAGE[stage].replace(' ', '-')}`, phase, colour: colour.map(Math.round), valueBand: stage, stage, mixId, thing: what, kind: STAGE[stage], areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: stage === 3,
      referenceCue: ['', 'A big pale wash in the light side of its area\'s colour.', 'A second mix dropped into the wet first wash.', 'A shadow shape from the squinted subject, one glaze.', 'A dark accent, one mark of the brush.'][stage],
      intendedResult: ['', 'The area\'s light-side colour, pale and connected.', 'The wash varied while wet, blended by the water.', 'The shadow pattern across the forms.', 'An opening or the deepest dark.'][stage], cool: stage === 1 && colour[2] > colour[0] + 10,
      shaped, subject, move, paperBefore: wet ? 'wet: the first wash just laid' : 'fully dry; own same-passage wet overlap allowed', baseBefore: wet ? 'wet' : 'fully dry',
      brush: { kind: 'the widest wash brush of the kit that fits the shape, then a smaller one along its edge where the sweeps did not reach', contact: 'side/belly', width: 'each stroke names its brush', widthMm: fill.brushMm },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: wet ? .88 : .62, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: wet ? 'soft: dropped into a wet wash' : 'hard: the edge is where the strokes end' },
      outline: loops, strokes: fill.strokes, softEdges: [], depthMm: +(fill.depthMm ?? 0).toFixed(1), uncoveredShare: +(fill.uncovered ?? 0).toFixed(4), widestBrushMm: fill.brushMm,
      protectedLights: ['bare-paper outlines the strokes go round'], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the shape' };
    sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind: STAGE[stage], colour, loops });
    byStage[stage - 1]++;
    return sh;
  };
  // Every wash is graded (a little paler at one part than another): the sweeps go down the shape and each is charged
  // at its share of the mix, the share falling (water added at each recharge) or rising the way the subject squinted
  // at the first wash's scale grows lighter or darker down the sweeps; dark to pale when it is flat. The shares
  // average one, so the wash holds its mix.
  const gradeStrokes = (fill, cells) => {
    const c = Math.cos(fill.angle ?? 0), s = Math.sin(fill.angle ?? 0), down = (x, y) => -x * s + y * c;
    let n0 = 0, sv = 0, sl = 0, svv = 0, svl = 0;
    for (const q of cells) { const v = down((q % pw + .5) * mmX, (((q / pw) | 0) + .5) * mmX), l = S6.L[q]; n0++; sv += v; sl += l; svv += v * v; svl += v * l; }
    const slope = n0 > 2 ? (svl - sv * sl / n0) / Math.max(1e-9, svv - sv * sv / n0) : 0;
    const at = fill.strokes.map(st => { let v = 0; for (const [x, y] of st.points) v += down(x, y); return v / st.points.length; });
    const lo = Math.min(...at), hi = Math.max(...at), span = hi - lo; if (!(span > 1)) return;
    // lighter further down: pale at the end; darker further down: strong at the end
    const delta = slope * span, amp = Math.max(GRADE_LEAST, Math.min(GRADE_MOST, Math.abs(delta) / GRADE_PER_L)), sign = delta > 1 ? -1 : 1;
    const raw = at.map(v => 1 + sign * amp * (1 - 2 * (v - lo) / span)), mean = raw.reduce((a, v) => a + v, 0) / raw.length;
    fill.strokes.forEach((st, k) => { st.charge = +(raw[k] / mean).toFixed(3); });
  };
  // one layer: the shapes painted in one session (no drying between them); the painter dries at the end of a value
  const layer = (stage, shapes) => { if (!shapes.length) return; const area = shapes.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0); for (const s of shapes) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; }); const t = mix.reduce((a, v) => a + v, 0) || 1; layers.push({ value: stage, pigment: mix.indexOf(Math.max(...mix)), mixId: shapes[0]._valuePlan.mixId, shapes, mix: mix.map(v => v / t), amount: shapes.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: stage <= 2 ? 'ground' : stage <= 4 ? 'mid' : 'dark', region: 0, shoot: true }, _valuePhase: shapes[0]._valuePlan.phase }); };

  // --- 2. the first wash: areas of one local colour, light side, charged while wet ---
  // the light side is read off the subject squinted at the shadow's scale, so no fine mark of the subject sets it
  const S3 = squint(SHADOW_SIGMA_MM), sqAt = q => toRGB(S3.planes, q), sqL = q => S3.L[q];
  // an area is one local colour in light and in shadow: its chromaticity, (a*, b*) over L* (a shadow is darker and less
  // chromatic in proportion), and a little of its light
  const zoneFeature = q => { const l = Math.max(20, S6.L[q]); return [60 * S6.A[q] / l, 60 * S6.B[q] / l, ZONE_L_WEIGHT * S6.L[q]]; };
  const open = [];
  for (let q = 0; q < pn; q++) if (!lightMask[q]) open.push(q);
  const step = Math.max(1, Math.floor(open.length / 6000)), rows = [];
  for (let t = 0; t < open.length; t += step) { const q = open[t]; rows.push(...zoneFeature(q)); }
  let centres = kmeans(Float32Array.from(rows), 3, ZONE_FAMILIES, 30);
  // families too close are one
  for (let merged = true; merged;) { merged = false; for (let a = 0; a < centres.length && !merged; a++) for (let b = a + 1; b < centres.length && !merged; b++) if (Math.hypot(centres[a][0] - centres[b][0], centres[a][1] - centres[b][1], centres[a][2] - centres[b][2]) < ZONE_JOIN) { centres[a] = centres[a].map((v, j) => (v + centres[b][j]) / 2); centres.splice(b, 1); merged = true; } }
  const fam = new Int32Array(pn).fill(-1);
  for (const q of open) { let best = 0, bd = Infinity; centres.forEach((c, f) => { const [fa, fb, fl] = zoneFeature(q), d = (fa - c[0]) ** 2 + (fb - c[1]) ** 2 + (fl - c[2]) ** 2; if (d < bd) { bd = d; best = f; } }); fam[q] = best; }
  // areas: each family's parts, rounded by a big brush; a part under the least area joins the family it borders most
  const leastZone = cellsFor(Math.max(ZONE_LEAST_MM2, ZONE_LEAST_SHARE * sheetWidthMm * sheetWidthMm * ph / pw));
  for (let pass = 0; pass < 3; pass++) {
    const c = labelParts(Int32Array.from(fam, v => v + 1), pw, ph), size = new Int32Array(c.count + 1), famOf = new Int32Array(c.count + 1);
    for (let q = 0; q < pn; q++) { const id = c.labels[q]; if (id) { size[id]++; famOf[id] = fam[q]; } }
    let changed = false;
    for (let id = 1; id <= c.count; id++) {
      if (size[id] >= leastZone || famOf[id] < 0) continue;
      const votes = new Map();
      for (let q = 0; q < pn; q++) if (c.labels[q] === id) { const x = q % pw; for (const j of [x ? q - 1 : -1, x < pw - 1 ? q + 1 : -1, q - pw, q + pw]) if (j >= 0 && j < pn && c.labels[j] !== id && fam[j] >= 0) votes.set(fam[j], (votes.get(fam[j]) ?? 0) + 1); }
      let best = -1, bv = 0; for (const [f, v] of votes) if (v > bv) { bv = v; best = f; }
      if (best >= 0) { for (let q = 0; q < pn; q++) if (c.labels[q] === id) fam[q] = best; changed = true; }
    }
    if (!changed) break;
  }
  const zoneLabels = labelParts(Int32Array.from(fam, v => v + 1), pw, ph), zones = [];
  for (let id = 1; id <= zoneLabels.count; id++) {
    const cells = []; for (let q = 0; q < pn; q++) if (zoneLabels.labels[q] === id) cells.push(q);
    if (cells.length < leastZone / 2) continue;
    const colour = sideColour(cells, sqAt, sqL, LIGHT_SIDE);
    // an area near the paper's own colour is left bare; its shadows are still painted
    zones.push({ id, cells, colour, L: labOf(colour, 0, paperCol)[0], paper: deltaE2000(labOf(colour, 0, paperCol), [100, 0, 0]) < ZONE_PAPER });
  }
  // An area's wash runs on behind the darker things inside it (a sky behind a tree, a wall behind its windows): its
  // holes are filled, but for the lights and the areas lighter than it, which the wash goes round.
  const areaOf = new Int32Array(pn).fill(-1); zones.forEach((z, zi) => { for (const q of z.cells) areaOf[q] = zi; });
  for (const z of zones) {
    const m = new Uint8Array(pn); for (const q of z.cells) m[q] = 1;
    const rounded = roundMask(m, pw, ph, rC(3)), round = fillHoles(rounded, pw, ph);
    // only holes smaller than the area itself: a wash runs behind a tree, not behind a whole building
    { const hole = Uint8Array.from(round, (v, q) => (v && !rounded[q] ? 1 : 0)), hc = components(hole, pw, ph, 4), size = new Int32Array(hc.count + 1); for (const id of hc.labels) if (id) size[id]++; for (let q = 0; q < pn; q++) if (hc.labels[q] && size[hc.labels[q]] > HOLE_MOST * z.cells.length) round[q] = 0; }
    for (let q = 0; q < pn; q++) if (lightMask[q] || (areaOf[q] >= 0 && zones[areaOf[q]] !== z && zones[areaOf[q]].L > z.L - AROUND_LIGHTER)) round[q] = round[q] && m[q];
    const lc = keepParts(round, pw, ph, leastZone / 2), loops = [];
    for (let j = 1; j <= lc.count; j++) loops.push(...loopsOf(lc.labels, j, pw, ph, mmX, ZONE_TOL_MM));
    z.loops = loops;
  }
  for (let i = zones.length - 1; i >= 0; i--) if (!zones[i].loops.length) zones.splice(i, 1);
  // each area's charges follow it while it is wet
  // the largest area first (the sky or the main band), then the rest from the top of the sheet down: far to near, weakly
  for (const z of zones) { let y = 0; for (const q of z.cells) y += (q / pw) | 0; z.cy = y / z.cells.length; }
  const biggest = zones.reduce((b, z) => (!z.paper && (!b || z.cells.length > b.cells.length) ? z : b), null);
  zones.sort((a, b) => (a === biggest ? -1 : b === biggest ? 1 : a.cy - b.cy));
  const zoneOf = new Int32Array(pn).fill(-1), zoneL = new Float32Array(pn).fill(100);
  zones.forEach((z, zi) => { for (const q of z.cells) { zoneOf[q] = zi; zoneL[q] = z.L; } });
  const tile = rC(CHARGE_TILE_MM), sheetBrush = Math.max(...washKitMm.filter(b => b <= 14), washBrushMm);
  for (const z of zones) {
    if (z.paper) continue;
    const sh = shape(1, `area ${z.id}`, z.loops, z.colour, { keepOut: lightLoops, growMm: 0.8 });
    if (!sh) continue;
    // a pass of its own (a frame on the film), its charges in it while it is wet
    const first = [sh];
    const washMix = sh.mix, inZone = new Uint8Array(pn); for (const q of z.cells) inZone[q] = 1;
    // where the area's light side, read over a few centimetres, is another colour: a charge of that colour
    const cands = [];
    for (let ty = 0; ty < ph; ty += tile) for (let tx = 0; tx < pw; tx += tile) {
      const cells = []; for (let y = ty; y < Math.min(ph, ty + tile); y++) for (let x = tx; x < Math.min(pw, tx + tile); x++) if (inZone[y * pw + x] && !lightMask[y * pw + x]) cells.push(y * pw + x);
      if (cells.length < 0.5 * tile * tile) continue;
      const c = sideColour(cells, sqAt, sqL, LIGHT_SIDE), dE = deltaE2000(labOf(c, 0, paperCol), labOf(z.colour, 0, paperCol));
      if (dE >= CHARGE_DIFFERS) { let cx = 0, cy = 0; for (const q of cells) { cx += q % pw; cy += (q / pw) | 0; } cands.push({ c, dE, x: cx / cells.length, y: cy / cells.length }); }
    }
    cands.sort((a, b) => b.dE - a.dE);
    const most = Math.min(CHARGE_MOST, Math.max(1, Math.round(mm2(z.cells.length) / CHARGE_PER_MM2))), picked = [];
    for (const cd of cands) { if (picked.length >= most) break; if (picked.every(p => Math.hypot(p.x - cd.x, p.y - cd.y) >= 1.5 * tile)) picked.push(cd); }
    const b = sheetBrush / 2;
    for (const cd of picked) {
      // a charge is two touches of a loaded round, side by side, where it is dropped
      const cx = cd.x * mmX, cy = cd.y * mmX, len = Math.min(CHARGE_TILE_MM / 2, 3 * b);
      const strokes = [-0.6, 0.6].map(o => ({ kind: 'sweep', radiusMm: b, points: [[cx - len / 2, cy + o * b], [cx, cy + o * b], [cx + len / 2, cy + o * b]].map(p => p.map(v => +v.toFixed(3))) }));
      const disc = { points: Array.from({ length: 16 }, (_, t) => [cx + (len / 2 + b) * Math.cos(t * Math.PI / 8), cy + 1.6 * b * Math.sin(t * Math.PI / 8)]), soft: new Array(16).fill(true) };
      const amounts = mixOver(cd.c, washMix, pigments, paperCol);
      const ch = shape(2, `charge in area ${z.id}`, [disc], cd.c, { strokes, amounts, move: 'wet on wet' });
      if (ch) first.push(ch);
    }
    layer(1, first);
  }

  // --- 3. the shadow shapes, in two steps, across the areas ---
  const shadowCount = [0, 0];
  for (const [si, stepL] of [[0, SHADOW_STEP], [1, DEEP_STEP]]) {
    let m = Uint8Array.from(S3.L, (v, q) => (zoneOf[q] >= 0 && !lightMask[q] && zoneL[q] - v >= stepL ? 1 : 0));
    m = roundMask(m, pw, ph, rC(SHADOW_ROUND_MM / 2));
    for (let q = 0; q < pn; q++) if (lightMask[q]) m[q] = 0;
    const c = keepParts(m, pw, ph, cellsFor(SHADOW_LEAST_MM2)), parts = [];
    for (let id = 1; id <= c.count; id++) { const cells = []; for (let q = 0; q < pn; q++) if (c.labels[q] === id) cells.push(q); if (cells.length) parts.push({ id, cells }); }
    parts.sort((a, b) => b.cells.length - a.cells.length);
    for (const p of parts.slice(0, SHADOW_MOST)) {
      // the shadow's colour: the squinted subject over the whole shape, its middle half by light
      const colour = sideColour(p.cells, q => toRGB(S3.planes, q), q => S3.L[q], [0.25, 0.75]);
      const loops = loopsOf(c.labels, p.id, pw, ph, mmX, SHADOW_TOL_MM);
      const sh = shape(3, `${si ? 'deeper ' : ''}shadow ${p.id}`, loops, colour, { keepOut: lightLoops });
      // each shadow shape its own pass, laid on the dry sheet
      if (sh) { layer(3 + si, [sh]); shadowCount[si]++; }
    }
  }

  // --- 4. the darks: a few marks of a round brush ---
  const SD = squint(DARK_SIGMA_MM), sortedD = Float32Array.from(SD.L).sort(), darkFloor = sortedD[Math.floor(.03 * (pn - 1))];
  const tone = new Float32Array(pn); for (let q = 0; q < pn; q++) { const u = new Array(k); for (let j = 0; j < k; j++) u[j] = laid[j][q]; tone[q] = u.some(v => v > 0) ? filmLab(u, pigments, paperCol)[0] : 100; }
  const dm = Uint8Array.from(SD.L, (v, q) => (v <= darkFloor + DARK_REACH && tone[q] - v >= DARK_UNDER ? 1 : 0));
  // a dark is a decided touch: its pieces within a brush's width of each other are one
  const dc = keepParts(roundMask(dm, pw, ph, rC(1.5)), pw, ph, cellsFor(DARK_LEAST_MM2)), darks = [];
  for (let id = 1; id <= dc.count; id++) { const cells = []; for (let q = 0; q < pn; q++) if (dc.labels[q] === id) cells.push(q); if (cells.length) darks.push({ id, cells, L: cells.reduce((a, q) => a + SD.L[q], 0) / cells.length }); }
  darks.sort((a, b) => a.L - b.L);
  const small = Math.min(...washKitMm), darkShapes = [];
  for (const d of darks.slice(0, DARK_MOST)) {
    // one mark along the dark's long axis, as wide as the dark (within the smallest wash brush and a fine round)
    let sx = 0, sy = 0; for (const q of d.cells) { sx += q % pw + .5; sy += ((q / pw) | 0) + .5; }
    const mx = sx / d.cells.length, my = sy / d.cells.length; let a = 0, b = 0, cc = 0;
    for (const q of d.cells) { const dx = q % pw + .5 - mx, dy = ((q / pw) | 0) + .5 - my; a += dx * dx; b += dx * dy; cc += dy * dy; }
    const th = 0.5 * Math.atan2(2 * b, a - cc), ux = Math.cos(th), uy = Math.sin(th);
    let lo = Infinity, hi = -Infinity; for (const q of d.cells) { const t = (q % pw + .5 - mx) * ux + (((q / pw) | 0) + .5 - my) * uy; if (t < lo) lo = t; if (t > hi) hi = t; }
    const lenMm = (hi - lo) * mmX, widthMm = mm2(d.cells.length) / Math.max(mmX, lenMm), r = Math.max(0.6, Math.min(small / 2, widthMm / 2));
    const half = Math.max(r, lenMm / 2 - r), cx = mx * mmX, cy = my * mmX;
    const strokes = [{ kind: 'sweep', radiusMm: +r.toFixed(3), points: [[cx - ux * half, cy - uy * half], [cx, cy], [cx + ux * half, cy + uy * half]].map(p => p.map(v => +v.toFixed(3))) }];
    const loop = { points: Array.from({ length: 12 }, (_, t) => { const ang = t * Math.PI / 6, along = Math.cos(ang) * (half + r), across = Math.sin(ang) * r; return [cx + ux * along - uy * across, cy + uy * along + ux * across]; }), soft: new Array(12).fill(false) };
    const colour = sideColour(d.cells, q => toRGB(SD.planes, q), q => SD.L[q], [0.1, 0.6]);
    const sh = shape(4, `dark ${d.id}`, [loop], colour, { strokes });
    if (sh) darkShapes.push(sh);
  }
  layer(5, darkShapes);

  const protectedCells = hold?.some(v => v) ? Uint8Array.from(hold, v => (v ? 1 : 0)) : null;
  const lightsOnSheet = lightLoops.length ? loopsMask(lightLoops, w, h, cellMm) : new Uint8Array(n), lc = components(lightsOnSheet, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'the squinted subject\'s brightest lights kept as bare paper', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const areas = instructions.map(q => q.areaMm2).sort((a, b) => a - b), reservedShare = lightMask.reduce((a, v) => a + v, 0) / pn;
  const covered = new Uint8Array(pn); for (let q = 0; q < pn; q++) for (let j = 0; j < k; j++) if (laid[j][q] > 0) { covered[q] = 1; break; }
  const summary = { stages: byStage.filter(Boolean).length, washesByStage: byStage, mixes: mixes.length, washes: instructions.length, planCellMm: mmX, zones: zones.length, families: centres.length, shadows: shadowCount, darks: darkShapes.length, reservedShare, paintedShare: covered.reduce((a, v) => a + v, 0) / pn,
    lightestTone: lightest, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, firstWashCover: 1, drawn };
  console.log(`layered washes: ${centres.length} colour families, ${zones.length} areas (${zones.filter(z => z.paper).length} left as paper), ${byStage[1]} charges; shadows ${shadowCount[0]} + ${shadowCount[1]} deeper; ${darkShapes.length} darks; lights ${(100 * reservedShare).toFixed(1)}% of the sheet kept as paper, ${(100 * summary.paintedShare).toFixed(0)}% painted`);
  console.log(`washes: ${summary.washes} over 4 stages (${byStage.join(', ')}); widest brush ${Math.max(0, ...instructions.map(q => q.widestBrushMm)).toFixed(1)} mm; least wash ${summary.smallestWashMm2.toFixed(1)} mm2; ${strokeCount} strokes planned`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary, mixes, polygons,
    geometry: 'Three layers from the squinted subject: big pale first washes in each area\'s light-side colour, charged wet; shadow shapes in two steps across the areas; a few dark marks. Lights kept as bare-paper outlines. Every wash is an outline and parallel sweeps in mm.' };
}
