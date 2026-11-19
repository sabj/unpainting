// Wash shapes: the areas of a picture a painter would wash in one go.
//
// The squinted subject is cut by contrast, with a margin. Every cell starts as its own shape. The two touching shapes
// nearest in colour join, again and again, until no two touching shapes are within LEAST_CONTRAST of each other. A
// shape is one colour: two shapes do not join when the cells of the joined shape would stray from its mean (so a chain
// of small steps cannot run a sky into a sail). Then
// the smallest shape under the least area joins the neighbour nearest it in colour, and a shape nowhere as wide as its
// brush is not a wash (it is a stroke, or the blurred edge between two shapes): its cells go to the neighbours nearest
// them in colour. So a shape exists only where the picture has a clear step, and a faint pattern laid over the picture
// moves no shape: it changes a shape's mean colour by a hair and is far under the margin.
//
//   least wash      LEAST_WASH_TOUCHES touches of the brush (a shape smaller than that is a stroke, not a wash)
//   least reserve   one touch of the brush (the least paper a wash can go round)
//   least contrast  LEAST_CONTRAST between the mean colours of two touching shapes
//
// Reserved lights are decided here too, before any wash: the shapes that stay paper. A light is a shape near the
// picture's own lightest tone that is clearly lighter than what surrounds it.
// Everything the plan decides after this is decided once a shape, from the shape's mean colour. Plan time only.
import { labOf } from '../../eval/colour.mjs';
import { footprintMm2 } from './brush-footprint.mjs';

/** A wash is at least this many touches of the brush that lays it. */
export const LEAST_WASH_TOUCHES = 4;
/** Two touching shapes are kept apart only when their mean colours differ by at least this (Lab distance). */
export const LEAST_CONTRAST = 10;
/** A shape is one colour: two shapes join only if the cells of the joined shape stay within this share of the least contrast of its mean (rms). */
const ONE_COLOUR = 0.5;
/** A wash is somewhere at least this share of its brush wide. */
const LEAST_DEPTH = 0.8;
/** A shape whose mean colour is within this of the paper, per channel, is paper: the tolerance the paper rule uses. */
const PAPER_TOLERANCE = [9, 9, 12];
/** A light is within this of the picture's lightest tone (Lab distance) ... */
const LIGHT_WITHIN = 10;
/** ... and at least this many L* lighter than the shapes around it. */
const LIGHT_CLEAR = 6;
/** The lights are cut from the picture at this contrast: a light is told from a pale wash beside it. */
const LIGHT_CONTRAST = 6;
/** The picture's lightest tone is this quantile of its squinted lightness. */
const LIGHTEST_QUANTILE = 0.98;

const LIN = Float32Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const encode = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** The least areas in mm2 for a brush whose belly is brushMm wide. */
export function leastAreas(brushMm) {
  const touch = footprintMm2(brushMm);
  return { washMm2: LEAST_WASH_TOUCHES * touch, reserveMm2: touch };
}

/** True when a mean colour (sRGB, 0..255) is the paper's within the paper tolerance. */
export function isPaper(mean, paperRGB) {
  return mean[0] >= paperRGB[0] - PAPER_TOLERANCE[0] && mean[1] >= paperRGB[1] - PAPER_TOLERANCE[1] && mean[2] >= paperRGB[2] - PAPER_TOLERANCE[2];
}

/** A binary heap of arrays ordered by their first entries. */
function heapOf(order) {
  const heap = [], less = (p, q) => { for (let c = 0; c < order; c++) if (p[c] !== q[c]) return p[c] < q[c]; return false; };
  return {
    get size() { return heap.length; },
    push(e) { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } },
    pop() { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && less(heap[l], heap[s])) s = l; if (r < heap.length && less(heap[r], heap[s])) s = r; if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; } } return top; },
  };
}

/**
 * The sheet cut into wash shapes.
 * @param rgb the squinted subject, sRGB bytes (n * 3). @param cellMm one cell in mm. @param brushMm the brush the shapes are laid with.
 * @param leastMm2 the least area of a shape (default: the brush's least wash). @param barrier cells (1) that belong to no shape.
 * @returns {{labels: Int32Array, shapes: Array<{id:number, area:number, areaMm2:number, mean:number[], lab:number[], paper:boolean}>,
 *   least: {washMm2:number, reserveMm2:number}}} labels are 1..shapes.length (0 on the barrier); `mean` is the shape's
 *   mean colour, averaged as light and given as sRGB 0..255.
 */
export function washShapes({ rgb, w, h, paperRGB, cellMm, brushMm, contrast = LEAST_CONTRAST, leastMm2 = null, barrier = null }) {
  const n = w * h;
  if (!rgb || rgb.length !== n * 3) throw new Error('wash shapes need the subject colours');
  if (!(cellMm > 0) || !(brushMm > 0)) throw new Error('wash shapes need a positive cell size and brush width');
  const least = leastAreas(brushMm), leastCells = (leastMm2 ?? least.washMm2) / (cellMm * cellMm);
  const lin = [0, 1, 2].map(c => { const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = LIN[rgb[i * 3 + c]]; return f; });
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const q = labOf(rgb, i, paperRGB); lab[i * 3] = q[0]; lab[i * 3 + 1] = q[1]; lab[i * 3 + 2] = q[2]; }
  const open = i => !barrier?.[i], spread = (ONE_COLOUR * contrast) ** 2;

  // 1. cells into regions: the closest touching pair joins first, while any pair is within the least contrast
  const parent = Int32Array.from({ length: n }, (_, i) => i), size = new Float64Array(n).fill(1), sum = [0, 1, 2].map(c => Float64Array.from({ length: n }, (_, i) => lab[i * 3 + c])), square = Float64Array.from({ length: n }, (_, i) => lab[i * 3] ** 2 + lab[i * 3 + 1] ** 2 + lab[i * 3 + 2] ** 2);
  // the mean square distance of a joined shape's cells from its mean colour
  const loose = (a, b) => { const m = size[a] + size[b]; return (square[a] + square[b]) / m - ((sum[0][a] + sum[0][b]) ** 2 + (sum[1][a] + sum[1][b]) ** 2 + (sum[2][a] + sum[2][b]) ** 2) / (m * m); };
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const apart = (a, b) => Math.hypot(sum[0][a] / size[a] - sum[0][b] / size[b], sum[1][a] / size[a] - sum[1][b] / size[b], sum[2][a] / size[a] - sum[2][b] / size[b]);
  for (let round = 0, joined = 1; joined && round < 8; round++) {
    joined = 0; const heap = heapOf(3), seen = new Set();
    for (let i = 0; i < n; i++) { if (!open(i)) continue; const x = i % w, a = find(i); for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]) { if (j < 0 || !open(j)) continue; const b = find(j); if (a === b) continue; const key = a < b ? a * n + b : b * n + a; if (seen.has(key)) continue; seen.add(key); const d = apart(a, b); if (d < contrast) heap.push([d, Math.min(a, b), Math.max(a, b)]); } }
    while (heap.size) {
      const [was, p, q] = heap.pop(), a = find(p), b = find(q); if (a === b) continue;
      // a pair whose shapes have changed since it was filed is filed again at what it is now
      const d = apart(a, b); if (d > was + 1e-9) { if (d < contrast) heap.push([d, Math.min(a, b), Math.max(a, b)]); continue; }
      if (loose(a, b) > spread) continue;
      const into = size[a] > size[b] || (size[a] === size[b] && a < b) ? a : b, from = into === a ? b : a;
      parent[from] = into; size[into] += size[from]; square[into] += square[from]; for (let c = 0; c < 3; c++) sum[c][into] += sum[c][from]; joined++;
    }
  }
  let labels = new Int32Array(n).fill(-1), count = 0;
  { const idOf = new Map(); for (let i = 0; i < n; i++) if (open(i)) { const a = find(i); let id = idOf.get(a); if (id === undefined) { id = count++; idOf.set(a, id); } labels[i] = id; } }

  // 2. regions into shapes: contrast first, then the smallest shape under the least area into its nearest neighbour
  const settle = () => {
    const area = new Float64Array(count), sums = Array.from({ length: 7 }, () => new Float64Array(count)), touch = Array.from({ length: count }, () => new Set());
    for (let i = 0; i < n; i++) {
      const a = labels[i]; if (a < 0) continue; area[a]++;
      for (let c = 0; c < 3; c++) { sums[c][a] += lin[c][i]; sums[3 + c][a] += lab[i * 3 + c]; sums[6][a] += lab[i * 3 + c] ** 2; }
      const x = i % w; for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]) if (j >= 0 && labels[j] >= 0 && labels[j] !== a) { touch[a].add(labels[j]); touch[labels[j]].add(a); }
    }
    const alive = new Uint8Array(count).fill(1), into = Int32Array.from({ length: count }, (_, a) => a);
    const far = (a, b) => Math.hypot(sums[3][a] / area[a] - sums[3][b] / area[b], sums[4][a] / area[a] - sums[4][b] / area[b], sums[5][a] / area[a] - sums[5][b] / area[b]);
    const slack = (a, b) => { const m = area[a] + area[b]; return (sums[6][a] + sums[6][b]) / m - ((sums[3][a] + sums[3][b]) ** 2 + (sums[4][a] + sums[4][b]) ** 2 + (sums[5][a] + sums[5][b]) ** 2) / (m * m); };
    const join = (a, b) => { // a into b
      alive[a] = 0; into[a] = b; area[b] += area[a]; for (let c = 0; c < 7; c++) sums[c][b] += sums[c][a];
      for (const t of touch[a]) { touch[t].delete(a); if (t !== b) { touch[t].add(b); touch[b].add(t); } }
      touch[a] = null;
    };
    for (;;) {
      let pa = -1, pb = -1, bd = contrast;
      for (let a = 0; a < count; a++) if (alive[a]) for (const b of touch[a]) if (b > a) { const d = far(a, b); if (d < bd && slack(a, b) <= spread) { bd = d; pa = a; pb = b; } }
      if (pa < 0) {
        let small = -1; for (let a = 0; a < count; a++) if (alive[a] && area[a] < leastCells && touch[a].size && (small < 0 || area[a] < area[small])) small = a;
        if (small < 0) break;
        pa = small; bd = Infinity; for (const b of touch[small]) { const d = far(small, b); if (d < bd || (d === bd && b < pb)) { bd = d; pb = b; } }
      }
      if (area[pa] > area[pb]) join(pb, pa); else join(pa, pb);
    }
    const root = a => { while (into[a] !== a) a = into[a]; return a; }, idOf = new Int32Array(count).fill(-1); let next = 0;
    for (let i = 0; i < n; i++) { if (labels[i] < 0) continue; const a = root(labels[i]); if (idOf[a] < 0) idOf[a] = next++; labels[i] = idOf[a]; }
    const stats = Array.from({ length: next }, () => null); for (let a = 0; a < count; a++) if (alive[a] && idOf[a] >= 0) stats[idOf[a]] = { area: area[a], mean: [0, 1, 2].map(c => encode(sums[c][a] / area[a])), lab: [sums[3][a] / area[a], sums[4][a] / area[a], sums[5][a] / area[a]] };
    count = next; return stats;
  };
  let stats = settle();

  // 3. a shape nowhere as wide as its brush is no wash: its cells go to the touching shapes nearest them in colour
  for (let pass = 0; pass < 2 && count > 1; pass++) {
    const D = new Float32Array(n), differs = (i, j) => labels[j] !== labels[i];
    for (let i = 0; i < n; i++) { const x = i % w; D[i] = labels[i] < 0 || (x && differs(i, i - 1)) || (x < w - 1 && differs(i, i + 1)) || (i >= w && differs(i, i - w)) || (i + w < n && differs(i, i + w)) ? 0 : 1e9; }
    for (let i = 0; i < n; i++) { if (!D[i]) continue; const x = i % w; let d = D[i]; if (x) d = Math.min(d, D[i - 1] + 1); if (i >= w) { d = Math.min(d, D[i - w] + 1); if (x) d = Math.min(d, D[i - w - 1] + Math.SQRT2); if (x < w - 1) d = Math.min(d, D[i - w + 1] + Math.SQRT2); } D[i] = d; }
    for (let i = n - 1; i >= 0; i--) { if (!D[i]) continue; const x = i % w; let d = D[i]; if (x < w - 1) d = Math.min(d, D[i + 1] + 1); if (i + w < n) { d = Math.min(d, D[i + w] + 1); if (x < w - 1) d = Math.min(d, D[i + w + 1] + Math.SQRT2); if (x) d = Math.min(d, D[i + w - 1] + Math.SQRT2); } D[i] = d; }
    const deep = new Float32Array(count); for (let i = 0; i < n; i++) if (labels[i] >= 0 && D[i] < 1e8 && D[i] + .5 > deep[labels[i]]) deep[labels[i]] = D[i] + .5;
    for (let a = 0; a < count; a++) if (!deep[a]) deep[a] = .5;
    const thin = Uint8Array.from(deep, d => (d * cellMm < LEAST_DEPTH * brushMm / 2 ? 1 : 0));
    if (!thin.some(Boolean) || thin.every(Boolean)) break;
    for (let moved = 1; moved;) {
      moved = 0; const next = [];
      for (let i = 0; i < n; i++) {
        if (labels[i] < 0 || !thin[labels[i]]) continue; const x = i % w; let best = -1, bd = Infinity;
        for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j < 0 || j >= n || labels[j] < 0 || thin[labels[j]]) continue; const q = stats[labels[j]].lab, d = (lab[i * 3] - q[0]) ** 2 + (lab[i * 3 + 1] - q[1]) ** 2 + (lab[i * 3 + 2] - q[2]) ** 2; if (d < bd || (d === bd && labels[j] < best)) { bd = d; best = labels[j]; } }
        if (best >= 0) next.push(i, best);
      }
      for (let q = 0; q < next.length; q += 2) { labels[next[q]] = next[q + 1]; moved++; }
    }
    // the shapes are numbered again and settled: a shape that took the cells of a thin one has a new mean
    { const idOf = new Map(); let next = 0; for (let i = 0; i < n; i++) if (labels[i] >= 0) { let id = idOf.get(labels[i]); if (id === undefined) { id = next++; idOf.set(labels[i], id); } labels[i] = id; } count = next; }
    stats = settle();
  }
  const shapes = stats.map((s, a) => ({ id: a + 1, area: s.area, areaMm2: s.area * cellMm * cellMm, mean: s.mean, lab: labOf(s.mean, 0, paperRGB), paper: isPaper(s.mean, paperRGB) }));
  for (let i = 0; i < n; i++) labels[i]++;
  return { labels, shapes, least };
}

/**
 * The lights that stay paper, decided before any wash.
 * A shape of the squinted picture is a light when it is the paper's colour, or when it is within LIGHT_WITHIN of the
 * picture's own lightest tone (the mean colour of its lightest fiftieth) and, taken with the lights it touches, at least LIGHT_CLEAR L* lighter than the shapes
 * around it. A light is at least the least reserve of `brushMm` in area and somewhere as wide as `thinMm`.
 * @returns {{mask: Uint8Array (1 on a reserved cell), lightest: number (L*), lights: number}}
 */
export function reservedLights({ rgb, w, h, paperRGB, cellMm, brushMm, thinMm = brushMm }) {
  const n = w * h, cut = washShapes({ rgb, w, h, paperRGB, cellMm, brushMm: thinMm, leastMm2: leastAreas(brushMm).reserveMm2, contrast: LIGHT_CONTRAST });
  const labs = Array.from({ length: n }, (_, i) => labOf(rgb, i, paperRGB)), level = labs.map(q => q[0]).sort((a, b) => a - b)[Math.min(n - 1, Math.floor(LIGHTEST_QUANTILE * n))];
  const tone = [0, 0, 0]; let top = 0; for (const q of labs) if (q[0] >= level) { top++; for (let c = 0; c < 3; c++) tone[c] += q[c]; }
  for (let c = 0; c < 3; c++) tone[c] /= top;
  const lightest = tone[0], candidate = cut.shapes.map(s => s.paper || Math.hypot(s.lab[0] - tone[0], s.lab[1] - tone[1], s.lab[2] - tone[2]) <= LIGHT_WITHIN), mask = new Uint8Array(n);
  // touching candidates are judged together against the shapes around them
  const group = new Int32Array(n).fill(-1), stack = new Int32Array(n); let lights = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (group[s0] >= 0 || !candidate[cut.labels[s0] - 1]) continue;
    let sp = 0, area = 0, L = 0, around = 0, rim = 0, paper = true; const cells = []; stack[sp++] = s0; group[s0] = s0;
    while (sp) {
      const i = stack[--sp], x = i % w, own = cut.shapes[cut.labels[i] - 1]; cells.push(i); area++; L += own.lab[0]; paper &&= own.paper;
      for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j < 0 || j >= n) continue; if (candidate[cut.labels[j] - 1]) { if (group[j] < 0) { group[j] = s0; stack[sp++] = j; } } else { around += cut.shapes[cut.labels[j] - 1].lab[0]; rim++; } }
    }
    if (!paper && !(rim && L / area - around / rim >= LIGHT_CLEAR)) continue;
    for (const i of cells) mask[i] = 1; lights++;
  }
  return { mask, lightest, lights };
}
