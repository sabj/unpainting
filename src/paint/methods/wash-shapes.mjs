// Wash shapes: the areas of a picture a painter would wash in one go.
//
// The subject's colours are sorted into a few families, each cell takes the family most common under the smallest wash
// brush around it (the squint), and each connected run of one family is a shape. A shape under the least area joins the neighbour nearest it in colour,
// smallest first, until every shape is one the brush can lay; touching shapes the eye cannot tell apart are then joined. The least areas are stated in mm2 and come from the brush:
//
//   least wash    LEAST_WASH_TOUCHES touches of the brush (a shape smaller than that is a stroke, not a wash)
//   least reserve one touch of the brush (the least paper a wash can go round)
//
// The shapes partition the sheet. Everything the plan decides after this is decided once a shape, from the shape's mean
// colour. Plan time only.
import { kmeans } from '../../crop/palettewide.mjs';
import { labOf } from '../../eval/colour.mjs';
import { footprintMm2 } from './brush-footprint.mjs';

/** A wash is at least this many touches of the brush that lays it. */
export const LEAST_WASH_TOUCHES = 4;
/** Colour families the squinted subject is sorted into before its connected runs are taken (as the touch-up shapes are). */
const FAMILIES = 24;
/** A shape whose mean colour is within this of the paper, per channel, is paper: the tolerance the paper rule uses. */
const PAPER_TOLERANCE = [9, 9, 12];
/** Two colour families are kept apart only when their centres are at least this far apart (Lab distance). */
const FAMILY_APART = 5;
/** Touching shapes whose mean colours are within this (Lab distance; about what the eye can tell apart) are one shape. */
const SAME_COLOUR = 2.3;

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

function boxMean(src, w, h, r) {
  const n = w * h, row = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let x = -r; x < w + r; x++) { const a = x + r, b = x - r - 1; if (a >= 0 && a < w) { s += src[y * w + a]; c++; } if (b >= 0 && b < w) { s -= src[y * w + b]; c--; } if (x >= 0 && x < w) row[y * w + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h + r; y++) { const a = y + r, b = y - r - 1; if (a >= 0 && a < h) { s += row[a * w + x]; c++; } if (b >= 0 && b < h) { s -= row[b * w + x]; c--; } if (y >= 0 && y < h) out[y * w + x] = s / c; } }
  return out;
}

/**
 * The sheet cut into wash shapes.
 * @param rgb the subject, sRGB bytes (n * 3). @param cellMm one cell in mm. @param brushMm the smallest wash brush's belly.
 * @returns {{labels: Int32Array, shapes: Array<{id:number, area:number, areaMm2:number, mean:number[], lab:number[], paper:boolean}>,
 *   least: {washMm2:number, reserveMm2:number}}} labels are 1..shapes.length; `mean` is the shape's mean colour, averaged
 *   as light and given as sRGB 0..255.
 */
export function washShapes({ rgb, w, h, paperRGB, cellMm, brushMm, families = FAMILIES }) {
  const n = w * h;
  if (!rgb || rgb.length !== n * 3) throw new Error('wash shapes need the subject colours');
  if (!(cellMm > 0) || !(brushMm > 0)) throw new Error('wash shapes need a positive cell size and brush width');
  const least = leastAreas(brushMm), cell2 = cellMm * cellMm;
  // the subject as light
  const lin = [0, 1, 2].map(c => { const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = LIN[rgb[i * 3 + c]]; return f; });
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const q = labOf(rgb, i, paperRGB); lab[i * 3] = q[0]; lab[i * 3 + 1] = q[1]; lab[i * 3 + 2] = q[2]; }
  // colour families: k-means on a sample spread over the sheet, then every cell to its nearest family
  const stride = Math.max(1, Math.ceil(n / 40000)), m = Math.ceil(n / stride), P = new Float32Array(m * 3);
  for (let q = 0; q < m; q++) { const i = Math.min(n - 1, q * stride); P[q * 3] = lab[i * 3]; P[q * 3 + 1] = lab[i * 3 + 1]; P[q * 3 + 2] = lab[i * 3 + 2]; }
  const km = kmeans(P, m, 3, families), share = new Float64Array(km.centres.length), centres = [];
  for (const c of km.labels) share[c]++;
  // families too close to tell apart are one family, the commoner first: a flat field with grain is not sorted by its grain
  for (const c of km.centres.map((_, q) => q).sort((a, b) => share[b] - share[a] || a - b)) { const C = km.centres[c]; if (share[c] && !centres.some(K => Math.hypot(C[0] - K[0], C[1] - K[1], C[2] - K[2]) < FAMILY_APART)) centres.push(C); }
  const own = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let best = 0, bd = Infinity; for (let c = 0; c < centres.length; c++) { const d = (lab[i * 3] - centres[c][0]) ** 2 + (lab[i * 3 + 1] - centres[c][1]) ** 2 + (lab[i * 3 + 2] - centres[c][2]) ** 2; if (d < bd) { bd = d; best = c; } } own[i] = best; }
  // the squint: a cell takes the family most of the cells under the brush around it belong to. A vote keeps an edge
  // where it is and makes no in-between colour along it, as a blur would.
  const r = Math.max(1, Math.round(brushMm / 2 / cellMm)), fam = new Uint8Array(n), top = new Float32Array(n), ind = new Float32Array(n);
  for (let c = 0; c < centres.length; c++) {
    let any = 0; for (let i = 0; i < n; i++) { ind[i] = own[i] === c ? 1 : 0; any |= ind[i]; }
    if (!any) continue;
    const share = boxMean(ind, w, h, r);
    for (let i = 0; i < n; i++) if (share[i] > top[i]) { top[i] = share[i]; fam[i] = c; }
  }
  // connected runs of one family (edge neighbours)
  const run = new Int32Array(n).fill(-1), stack = new Int32Array(n); let count = 0;
  for (let s = 0; s < n; s++) {
    if (run[s] >= 0) continue;
    let sp = 0; stack[sp++] = s; run[s] = count;
    while (sp) { const i = stack[--sp], x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && run[j] < 0 && fam[j] === fam[i]) { run[j] = count; stack[sp++] = j; } }
    count++;
  }
  // each run's area and sums (the subject's own light, not the squint), and the runs it touches
  const area = new Float64Array(count), sum = Array.from({ length: 6 }, () => new Float64Array(count)), touch = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < n; i++) {
    const a = run[i]; area[a]++;
    for (let c = 0; c < 3; c++) { sum[c][a] += lin[c][i]; sum[3 + c][a] += lab[i * 3 + c]; }
    const x = i % w; for (const j of [x < w - 1 ? i + 1 : -1, i + w < n ? i + w : -1]) if (j >= 0 && run[j] !== a) { touch[a].add(run[j]); touch[run[j]].add(a); }
  }
  const meanOf = a => [0, 1, 2].map(c => encode(sum[c][a] / area[a])), labMean = a => [sum[3][a] / area[a], sum[4][a] / area[a], sum[5][a] / area[a]];
  const floorOf = a => (isPaper(meanOf(a), paperRGB) ? least.reserveMm2 : least.washMm2) / cell2;
  // smallest first, a run under its least area joins the touching run nearest it in colour
  const parent = Int32Array.from({ length: count }, (_, a) => a), find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const heap = []; // [area, run], a binary heap on area then run id; stale entries are skipped when popped
  const less = (p, q) => p[0] < q[0] || (p[0] === q[0] && p[1] < q[1]);
  const push = e => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r2 = l + 1; let s = i; if (l < heap.length && less(heap[l], heap[s])) s = l; if (r2 < heap.length && less(heap[r2], heap[s])) s = r2; if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; } } return top; };
  const join = (a, into) => {
    parent[a] = into; area[into] += area[a]; for (let c = 0; c < 6; c++) sum[c][into] += sum[c][a];
    for (const b of touch[a]) { touch[b].delete(a); if (b !== into) { touch[b].add(into); touch[into].add(b); } }
    touch[a] = null; push([area[into], into]);
  };
  for (let a = 0; a < count; a++) push([area[a], a]);
  while (heap.length) {
    const [was, a] = pop();
    if (parent[a] !== a || area[a] !== was || area[a] >= floorOf(a) || !touch[a].size) continue;
    const own = labMean(a); let into = -1, bd = Infinity;
    for (const b of touch[a]) { const q = labMean(b), d = (own[0] - q[0]) ** 2 + (own[1] - q[1]) ** 2 + (own[2] - q[2]) ** 2; if (d < bd || (d === bd && b < into)) { bd = d; into = b; } }
    join(a, into);
  }
  // touching shapes the eye cannot tell apart are one shape: grain inside a field must not cut it up
  for (let a = 0; a < count; a++) if (parent[a] === a) push([area[a], a]);
  while (heap.length) {
    const [was, a] = pop();
    if (parent[a] !== a || area[a] !== was || !touch[a].size) continue;
    const own = labMean(a); let into = -1, bd = SAME_COLOUR * SAME_COLOUR;
    for (const b of touch[a]) { const q = labMean(b), d = (own[0] - q[0]) ** 2 + (own[1] - q[1]) ** 2 + (own[2] - q[2]) ** 2; if (d < bd || (d === bd && into >= 0 && b < into)) { bd = d; into = b; } }
    if (into < 0) continue;
    join(a, into);
  }
  const idOf = new Int32Array(count), shapes = [], labels = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const a = find(run[i]);
    if (!idOf[a]) { const mean = meanOf(a); shapes.push({ id: shapes.length + 1, area: area[a], areaMm2: area[a] * cell2, mean, lab: labOf(mean, 0, paperRGB), paper: isPaper(mean, paperRGB) }); idOf[a] = shapes.length; }
    labels[i] = idOf[a];
  }
  return { labels, shapes, least };
}
