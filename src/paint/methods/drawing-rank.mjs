// --drawinglogic 1: a dense drawing file (work/lines/<base>-lines.json) ranked like the walker's ink tiers
// (src/crop/inktiers.mjs) and split by what each line is: form for the first pen, tone for the closing pen.
// This module ranks and splits; drawing-hand.mjs connects, orders and shapes the gestures. DOM free, no file IO.
import { pathLength, straightness, meanContrast } from '../../crop/inktiers.mjs';
import { classifyInkPaths, inkFilterCounts } from '../../crop/inkfilter.mjs';

/** The subject's region from the file's own subject lines (the file carries no mask): their points on a coarse grid,
 *  closed and filled. Returns a byte mask on the coarse grid, and the grid's cell. */
export function subjectRegion(lines, w, h, { cell = 4, close = 3 } = {}) {
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), m = new Uint8Array(gw * gh);
  for (const g of lines) if (g.role === 'subject') for (const q of g.points) {
    const x = Math.min(gw - 1, Math.max(0, Math.floor(q.x / cell))), y = Math.min(gh - 1, Math.max(0, Math.floor(q.y / cell)));
    m[y * gw + x] = 1;
  }
  // dilate (grow true): on where any in-bounds neighbour is on; erode (grow false): off where any in-bounds one is off
  const grow = (src, dilate) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let v = src[y * gw + x];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        v = dilate ? v | src[yy * gw + xx] : v & src[yy * gw + xx];
      }
      out[y * gw + x] = v;
    }
    return out;
  };
  let a = m;
  for (let k = 0; k < close; k++) a = grow(a, true);
  // fill: whatever the border cannot reach through empty cells is inside
  const outside = new Uint8Array(a.length), stack = [];
  for (let x = 0; x < gw; x++) stack.push(x, (gh - 1) * gw + x);
  for (let y = 0; y < gh; y++) stack.push(y * gw, y * gw + gw - 1);
  while (stack.length) {
    const i = stack.pop();
    if (outside[i] || a[i]) continue;
    outside[i] = 1;
    const x = i % gw, y = (i / gw) | 0;
    if (x > 0) stack.push(i - 1); if (x < gw - 1) stack.push(i + 1); if (y > 0) stack.push(i - gw); if (y < gh - 1) stack.push(i + gw);
  }
  a = Uint8Array.from(a, (v, i) => (v || !outside[i] ? 1 : 0));
  for (let k = 0; k < close; k++) a = grow(a, false);
  return { mask: a, gw, gh, cell };
}

/** The share of a line's points on the region's edge band: region cells with a cell outside within `band` cells. */
function edgeShare(points, R, band = 2) {
  const { mask, gw, gh, cell } = R;
  let on = 0;
  for (const q of points) {
    const x = Math.min(gw - 1, Math.max(0, Math.floor(q.x / cell))), y = Math.min(gh - 1, Math.max(0, Math.floor(q.y / cell)));
    let edge = false;
    for (let dy = -band; dy <= band && !edge; dy++) for (let dx = -band; dx <= band; dx++) {
      const xx = x + dx, yy = y + dy, v = xx < 0 || yy < 0 || xx >= gw || yy >= gh ? 0 : mask[yy * gw + xx];
      if (v !== mask[y * gw + x]) { edge = true; break; }
    }
    if (edge) on++;
  }
  return points.length ? on / points.length : 0;
}

/**
 * Each line with the tier that would pay for it: 1 silhouette or setting structure, 2 feature, 3 interior structure,
 * 4 the setting's other long lines, 0 toning only (strands, and what is too short to be structure or a feature).
 * Within a tier `rank` orders it, highest first.
 */
export function rankLines(lines, { w, h, D, K = 1, featLen = 0.08, silLen = 0.04, longLen = 0.10, straight = 0.85, silhouette = 0.5, featMin = 2, reach = 4 } = {}) {
  const short = Math.min(w, h), R = subjectRegion(lines, w, h, { cell: Math.max(2, Math.round(0.008 * short)) });
  const fl = featLen * short, sl = silLen * short, ll = longLen * short;
  return lines.map((g, index) => {
    const length = g.length ?? pathLength(g.points), subject = g.role !== 'setting', strand = g.kind === 'strand';
    const contrast = D ? meanContrast(D, w, h, g.points, { reach: reach * K }) : 0;
    const weight = g.weight ?? 1;
    let tier = 0, rank = 0;
    // a long strand on the subject's edge is the outline of a mass of hair or fur, and states it as a contour would;
    // a long strand inside is how a prep drawing says where the hair falls (the hair mass must read)
    const longStrand = strand && length >= fl;
    if (g.focalFeature) { tier = 2; rank = contrast; }
    else if (subject && (!strand || longStrand) && length >= sl && edgeShare(g.points, R) >= silhouette) { tier = 1; rank = length * weight * (strand ? 0.6 : 1); }
    else if (!strand && !subject && length >= ll && (straightness(g.points) >= straight || length >= 2 * ll)) { tier = 1; rank = length * weight; }
    else if (!strand && subject && length < fl && length >= featMin * K) { tier = 2; rank = contrast; }
    else if ((!strand || longStrand) && subject && length >= fl) { tier = 3; rank = length * Math.max(0.05, contrast) * (strand ? 0.6 : 1); }
    else if (!strand && !subject && length >= ll) { tier = 4; rank = length * weight; }
    return { ...g, index, length, tier, rank, contrast };
  });
}

// A line costs its length times a nib and a half, as lineBudget prices the walker's gestures.
const cellsOf = (g, nib) => g.length * nib;

/**
 * The first pen's share of a ranked file, and what is left for the closing pen.
 *
 * @param cells   the ink budget in cells (paint-plate's CELLS: the source's line share times the sheet times --inkbudget)
 * @param shares  each tier's part of it; features are counted and capped by number, never by the budget
 * @returns { form, tone, log } with every input line in exactly one of the two
 */
export function splitForm(ranked, { cells, nib = 1.5, shares = { 1: 0.5, 3: 0.2, 4: 0.15 }, features = 40, filter = null, filterTiers = [3, 4], faces = ['face'], fill = 0 } = {}) {
  const log = [], form = new Set();
  const byTier = t => ranked.filter(g => g.tier === t).sort((a, b) => b.rank - a.rank);
  // the filter's call on its tiers: a line that reads as wash, dry brush or texture is not form. Silhouettes
  // (tier 1) are left out, since the filter reads many outlines as wash. Dropped lines go to the toning.
  const verdict = new Map();
  if (filter) {
    const judged = ranked.filter(g => filterTiers.includes(g.tier));
    const v = filter(judged);
    judged.forEach((g, i) => verdict.set(g.index, v[i]));
    const c = inkFilterCounts(v);
    log.push(`drawing logic: ink filter kept ${c.kept} of ${c.total} structure lines (dropped wash ${c.wash}, dry ${c.dry}, texture ${c.texture}); those go to the toning`);
  }
  const passes = g => !verdict.has(g.index) || verdict.get(g.index).kept;
  let spent = 0;
  for (const t of [1, 3, 4]) {
    const budget = cells * (shares[t] ?? 0);
    let used = 0, n = 0;
    const cand = byTier(t).filter(passes);
    for (const g of cand) { if (used >= budget) break; form.add(g.index); used += cellsOf(g, nib); n++; }
    log.push(`drawing logic: tier ${t} ${['', 'silhouette and setting structure', '', 'interior structure', 'setting'][t]}: ${n} of ${cand.length} lines, ${Math.round(used)} of ${Math.round(budget)} cells`);
    spent += used;
  }
  // features: the top by contrast, whatever the budget has left, as a person never skips the eyes to save ink. Every
  // short line on an object in `faces` is a feature whatever its contrast, so silhouette flicks cannot crowd out the face.
  const feats = byTier(2), faceF = feats.filter(g => faces.includes(g.object)), restF = feats.filter(g => !faces.includes(g.object));
  const keptF = [...faceF, ...restF.slice(0, Math.max(0, features - faceF.length))];
  for (const g of keptF) form.add(g.index);
  log.push(`drawing logic: tier 2 features: ${keptF.length} of ${feats.length} short subject lines (${faceF.length} on the face), outside the budget`);
  // --drawfill: a share of what the tiers left of the budget goes on the next short subject lines by contrast. A file
  // drawn in short strokes states its figure in lines too short for any tier.
  if (fill > 0) {
    const left = fill * Math.max(0, cells - spent);
    let used = 0, n = 0;
    for (const g of restF.slice(Math.max(0, features - faceF.length))) { if (used >= left) break; form.add(g.index); used += cellsOf(g, nib); n++; }
    log.push(`drawing logic: fill: ${n} more short subject lines, ${Math.round(used)} of ${Math.round(left)} cells the tiers left`);
  }
  const formLines = ranked.filter(g => form.has(g.index)), tone = ranked.filter(g => !form.has(g.index));
  log.push(`drawing logic: first pen ${formLines.length} lines (${Math.round(formLines.reduce((a, g) => a + g.length, 0))} cells of line), closing pen pool ${tone.length}`);
  return { form: formLines, tone, log };
}

/** The ink filter as splitForm takes it: classifyInkPaths on the density the walker reads. */
export const inkFilterOn = (D, w, h, K) => paths => classifyInkPaths(paths, D, w, h, { scale: K, accent: 10 * K });

/**
 * The closing pen's toning: the pool cut to runs that lie where the painting still needs darkening and off the lights,
 * kept more densely the more darkening the place needs. `want` is paint-plate's inkWant for the pass (the source less
 * what the washes laid, less --forgive), `D` the source density.
 *
 * @param light  a point on source density under this is a light, and the pen never goes there
 * @param lo,hi  the mean want at which a run starts to be kept, and at which every run is kept; between, a line is
 *               kept when its want clears a threshold hashed from its index, so density follows value without noise
 *               from a random generator
 */
export function toneRuns(pool, { w, h, D, want, light = 0.12, lo = 0.02, hi = 0.15, minPts = 3 } = {}) {
  const at = (F, q) => F[Math.min(h - 1, Math.max(0, Math.round(q.y))) * w + Math.min(w - 1, Math.max(0, Math.round(q.x)))];
  const hash = i => { let s = (Math.imul(i + 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0; s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };
  const out = [];
  let dropped = 0, lit = 0;
  for (const g of pool) {
    const runs = []; let cur = [];
    for (const q of g.points) { if (at(D, q) >= light) cur.push(q); else { if (cur.length >= minPts) runs.push(cur); cur = []; lit++; } }
    if (cur.length >= minPts) runs.push(cur);
    for (const points of runs) {
      const need = points.reduce((a, q) => a + at(want, q), 0) / points.length;
      // hi 0 is the gate off: every run off the lights is laid, at full need
      if (hi > 0 && need < lo + (hi - lo) * hash(g.index)) { dropped++; continue; }
      out.push({ ...g, points, length: pathLength(points), need: hi > 0 ? Math.min(1, need / hi) : 1 });
    }
  }
  return { lines: out, dropped, lit };
}
