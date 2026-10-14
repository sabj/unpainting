// Subject-aware wash regions (--subjectwash 1). The subject regions come from SAM (the segments, segment-prep.mjs);
// each is cut into its own colour and value clusters. Clusters next to each other join one wash group where colour and
// value continue smoothly across their boundary, so a wash crosses a subject boundary only where the picture does;
// a shadow glaze crosses where value continues, and runs across clusters freely inside one subject. Each subject
// reserves its own lights: its lightest planes, well under its own middle value. General rules only: no subject ids,
// names or hand regions.
//
// The field is read by the value plan (light-to-dark.mjs: wash and shadow groups, form value, region lights), the
// legacy ladder (blockin.mjs: passes cut at wash groups, region lights held after the first value), --segwash
// (segment-washes.mjs: one mop puddle per wash group) and the passages (ctx.subjects).
//
// Options (paint-plate.mjs reads the flags):
//   --subjectk 4          at most this many colour and value clusters in one subject
//   --subjectsplit 7      two clusters stay apart only when their centres are this far apart (Delta E 76)
//   --subjectedge 6       a boundary is smooth where the median colour step across it is under this (Delta E 76)
//   --subjectmean 10      ... and the two sides, each read within 3 cells of the boundary, differ by less than this
//   --subjectvalue 8      a shadow glaze crosses between subjects where the sides' lightness differs by less (L*)
//   --subjectchroma 10    inside a subject, clusters whose mean a*b* differ by less are one local colour, one wash
//   --subjectlights 0.12  each subject reserves this share of its lightest cells (0: none) ...
//   --subjectlightgap 6   ... when they are at least this much lighter (L*) than the subject's median
import { labPlanes } from '../../eval/colour.mjs';
import { closeLocal, components, removeSmall } from '../../raster.js';
import { splitByPuddle } from '../../crop/palettewide.mjs';
import { describeRegions } from './target-regions.mjs';

export const SUBJECT_DEFAULTS = Object.freeze({ k: 4, split: 7, edge: 6, mean: 10, value: 8, chroma: 10, lights: 0.12, lightGap: 6, minLen: 8, side: 3 });
// a chain of joins stops where two groups' mean colours differ by more than this times the side test
const DRIFT = 1.5;
// a domain this light and this grey is bare paper (L*, chroma)
const PAPER_L = 94, PAPER_C = 6;
// at most this many cells a subject's cluster centres are fitted on
const FIT_SAMPLE = 12000;

/** Box mean of a field over a (2r+1) square, clipped at the sheet's edge. */
function boxMean(src, w, h, r) {
  const n = w * h, row = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let x = -r; x < w + r; x++) { const a = x + r, b = x - r - 1; if (a >= 0 && a < w) { s += src[y * w + a]; c++; } if (b >= 0 && b < w) { s -= src[y * w + b]; c--; } if (x >= 0 && x < w) row[y * w + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h + r; y++) { const a = y + r, b = y - r - 1; if (a >= 0 && a < h) { s += row[a * w + x]; c++; } if (b >= 0 && b < h) { s -= row[b * w + x]; c--; } if (y >= 0 && y < h) out[y * w + x] = s / c; } }
  return out;
}

/** A field smoothed inside each label only: no value leaks across a subject's boundary. */
export function confinedMean(values, labels, w, h, r) {
  const n = w * h, out = new Float32Array(n), ids = [...new Set(labels)];
  for (const id of ids) {
    const m = Float32Array.from(labels, l => (l === id ? 1 : 0)), vm = Float32Array.from(values, (v, i) => v * m[i]);
    const sm = boxMean(m, w, h, r), sv = boxMean(vm, w, h, r);
    for (let i = 0; i < n; i++) if (labels[i] === id) out[i] = sv[i] / Math.max(1e-9, sm[i]);
  }
  return out;
}

/** Deterministic k-means on 3-channel points, seeded at lightness quantiles, so clusters are first of value. */
function clusterCells(cells, F, k) {
  const step = Math.max(1, Math.ceil(cells.length / FIT_SAMPLE)), sample = cells.filter((_, q) => q % step === 0);
  const byL = [...sample].sort((a, b) => F[0][a] - F[0][b]);
  let centres = Array.from({ length: k }, (_, c) => { const i = byL[Math.floor((c + 0.5) / k * (byL.length - 1))]; return [F[0][i], F[1][i], F[2][i]]; });
  const nearest = i => { let best = 0, bd = Infinity; for (let c = 0; c < centres.length; c++) { const d = (F[0][i] - centres[c][0]) ** 2 + (F[1][i] - centres[c][1]) ** 2 + (F[2][i] - centres[c][2]) ** 2; if (d < bd) { bd = d; best = c; } } return best; };
  for (let it = 0; it < 12; it++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const i of sample) { const s = sum[nearest(i)]; s[0] += F[0][i]; s[1] += F[1][i]; s[2] += F[2][i]; s[3]++; }
    centres = centres.map((c, q) => (sum[q][3] ? [sum[q][0] / sum[q][3], sum[q][1] / sum[q][3], sum[q][2] / sum[q][3]] : c));
  }
  const label = Int32Array.from(cells, nearest), counts = new Int32Array(k);
  for (const l of label) counts[l]++;
  return { label, centres, counts };
}

/** The most clusters (up to kMax) whose centres all stand `split` apart and each hold `minCells`; else one. */
function chooseClusters(cells, F, { kMax, split, minCells }) {
  for (let k = Math.min(kMax, Math.floor(cells.length / Math.max(1, minCells))); k >= 2; k--) {
    const r = clusterCells(cells, F, k);
    if ([...r.counts].some(c => c < minCells)) continue;
    let apart = true;
    for (let a = 0; a < k && apart; a++) for (let b = a + 1; b < k; b++) if (Math.hypot(...r.centres[a].map((v, c) => v - r.centres[b][c])) < split) { apart = false; break; }
    if (apart) return r;
  }
  return { label: new Int32Array(cells.length), centres: [[0, 0, 0]], counts: Int32Array.of(cells.length) };
}

/**
 * SAM's boundaries settled onto the picture's own edges. A cell within `reach` of another subject goes to the subject
 * whose nearby cells (within reach + 2) it matches best in colour, when that is `gain` Delta E closer than its own.
 * SAM draws a boundary at its working size and the map is smoothed at a brush width; a wash edge belongs on the edge
 * a painter sees. Two rounds, each read from the labels before it.
 */
export function snapToEdges(subject, F, w, h, { reach = 2, gain = 3, rounds = 2 } = {}) {
  const n = w * h, R = reach + 2;
  let cur = subject, moved = 0;
  for (let round = 0; round < rounds; round++) {
    const next = Uint16Array.from(cur);
    for (let i = 0; i < n; i++) {
      const x0 = i % w, y0 = (i - x0) / w, own = cur[i];
      let edge = false;
      for (let y = Math.max(0, y0 - reach); y <= Math.min(h - 1, y0 + reach) && !edge; y++) for (let x = Math.max(0, x0 - reach); x <= Math.min(w - 1, x0 + reach); x++) if (cur[y * w + x] !== own) { edge = true; break; }
      if (!edge) continue;
      const sums = new Map();
      for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(w - 1, x0 + R); x++) {
        const j = y * w + x; if (j === i) continue;
        const q = sums.get(cur[j]) ?? [0, 0, 0, 0]; q[0] += F[0][j]; q[1] += F[1][j]; q[2] += F[2][j]; q[3]++; sums.set(cur[j], q);
      }
      const dist = q => Math.hypot(F[0][i] - q[0] / q[3], F[1][i] - q[1] / q[3], F[2][i] - q[2] / q[3]);
      const mine = sums.has(own) ? dist(sums.get(own)) : Infinity;
      let best = own, bd = mine;
      for (const [s2, q] of sums) if (s2 !== own) { const d = dist(q); if (d < bd) { bd = d; best = s2; } }
      if (best !== own && mine - bd > gain) { next[i] = best; moved++; }
    }
    cur = next;
  }
  return { subject: cur, moved };
}

/** Each subject cut into its clusters: one domain id per cell (1-based), and each domain's subject. */
function clusterSubjects(subject, F, w, h, { kMax, split, minShape }) {
  const n = w * h, domain = new Int32Array(n), subjectOf = [0], cellsOf = new Map();
  for (let i = 0; i < n; i++) { const s = subject[i]; if (!cellsOf.has(s)) cellsOf.set(s, []); cellsOf.get(s).push(i); }
  for (const [s, cells] of [...cellsOf].sort((a, b) => a[0] - b[0])) {
    const minCells = Math.max(minShape, Math.round(0.04 * cells.length));
    const r = chooseClusters(cells, F, { kMax, split, minCells });
    // pieces of one cluster under minShape go to the subject's neighbouring cluster they touch most (splitByPuddle)
    const inSubject = Uint8Array.from({ length: n }, (_, i) => (subject[i] === s ? 1 : 0)), lab = new Int32Array(n);
    cells.forEach((i, q) => { lab[i] = r.label[q] + 1; });
    const parts = splitByPuddle(components(inSubject, w, h).labels, lab, w, h, minShape);
    // a part is the cluster most of its cells belong to; a cluster's separate parts stay one domain
    const votes = new Map();
    for (const i of cells) { const key = `${parts.labels[i]},${lab[i]}`; votes.set(key, (votes.get(key) ?? 0) + 1); }
    const clusterOfPart = new Map(), best = new Map();
    for (const [key, c] of votes) { const [p, l] = key.split(',').map(Number); if (c > (best.get(p) ?? 0)) { best.set(p, c); clusterOfPart.set(p, l); } }
    const base = subjectOf.length, kept = [...new Set(clusterOfPart.values())].sort((a, b) => a - b), idOf = new Map(kept.map((c, q) => [c, base + q]));
    for (const i of cells) domain[i] = idOf.get(clusterOfPart.get(parts.labels[i]));
    for (let q = 0; q < kept.length; q++) subjectOf.push(s);
  }
  return { domain, subjectOf };
}

/** Mean colour of each boundary cell's own domain within r cells: what a side of a boundary looks like. */
function sideMeans(domain, F, w, h, r, boundary) {
  const out = new Map();
  for (const i of boundary) {
    const x0 = i % w, y0 = (i - x0) / w, d = domain[i]; let s0 = 0, s1 = 0, s2 = 0, c = 0;
    for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const j = y * w + x; if (domain[j] !== d) continue; s0 += F[0][j]; s1 += F[1][j]; s2 += F[2][j]; c++;
    }
    out.set(i, [s0 / c, s1 / c, s2 / c]);
  }
  return out;
}

/** Per touching pair of domains: boundary length, median colour and lightness steps, and the two sides' means. */
function boundaryStats(domain, F, w, h, side) {
  const n = w * h, pairs = new Map(), boundary = new Set();
  const visit = (i, j) => { const a = domain[i], b = domain[j]; if (a === b) return; boundary.add(i); boundary.add(j); const key = a < b ? `${a},${b}` : `${b},${a}`; if (!pairs.has(key)) pairs.set(key, { a: Math.min(a, b), b: Math.max(a, b), cells: [] }); pairs.get(key).cells.push(a < b ? [i, j] : [j, i]); };
  for (let i = 0; i < n; i++) { const x = i % w; if (x < w - 1) visit(i, i + 1); if (i + w < n) visit(i, i + w); }
  const means = sideMeans(domain, F, w, h, side, boundary), med = v => { const s = Float32Array.from(v).sort(); return s[s.length >> 1]; };
  return [...pairs.values()].map(p => {
    const step = p.cells.map(([i, j]) => Math.hypot(F[0][i] - F[0][j], F[1][i] - F[1][j], F[2][i] - F[2][j]));
    const stepL = p.cells.map(([i, j]) => Math.abs(F[0][i] - F[0][j]));
    const sideA = [0, 0, 0], sideB = [0, 0, 0];
    for (const [i, j] of p.cells) { const ma = means.get(i), mb = means.get(j); for (let c = 0; c < 3; c++) { sideA[c] += ma[c]; sideB[c] += mb[c]; } }
    const len = p.cells.length, gap = Math.hypot(...sideA.map((v, c) => (v - sideB[c]) / len));
    return { a: p.a, b: p.b, length: len, edge: med(step), edgeL: med(stepL), gap, gapL: Math.abs(sideA[0] - sideB[0]) / len };
  });
}

/** Union-find over domains that keeps each group's area-weighted mean Lab, so a chain of joins cannot drift. */
function groups(means) {
  const parent = Int32Array.from(means, (_, i) => i), mean = means.map(m => ({ ...m }));
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const gap = (a, b) => { const p = mean[find(a)], q = mean[find(b)]; return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b); };
  const gapL = (a, b) => Math.abs(mean[find(a)].L - mean[find(b)].L);
  const gapAB = (a, b) => { const p = mean[find(a)], q = mean[find(b)]; return Math.hypot(p.a - q.a, p.b - q.b); };
  const join = (a, b) => {
    const ra = find(a), rb = find(b); if (ra === rb) return false;
    const p = mean[ra], q = mean[rb], area = p.area + q.area, mix = k => (p[k] * p.area + q[k] * q.area) / Math.max(1, area);
    mean[rb] = { area, L: mix('L'), a: mix('a'), b: mix('b') }; parent[ra] = rb; return true;
  };
  return { find, join, gap, gapL, gapAB };
}

/** Each domain's area and mean Lab. */
function domainMeans(domain, F, count) {
  const m = Array.from({ length: count }, () => ({ area: 0, L: 0, a: 0, b: 0 }));
  for (let i = 0; i < domain.length; i++) { const q = m[domain[i]]; q.area++; q.L += F[0][i]; q.a += F[1][i]; q.b += F[2][i]; }
  return m.map(q => (q.area ? { area: q.area, L: q.L / q.area, a: q.a / q.area, b: q.b / q.area } : q));
}

/**
 * Wash and shadow groups from the boundary statistics. Inside a subject, touching clusters of one local colour (hue
 * and chroma within --subjectchroma) join whatever their values: the subject's first wash runs over all of it, and
 * its value is built by the later layers, which follow its form. Across subjects two groups join only where colour and
 * value both continue smoothly over the boundary, smoothest boundary first, and only while the groups' mean colours
 * (mean lightness, for shadows) stay within DRIFT times the side test, so a chain of near matches cannot carry a wash
 * on to a very different colour. A shadow glaze runs over its whole subject. Bare-paper domains never join: an
 * unpainted light is not a bridge between two subjects.
 */
function joinGroups(stats, subjectOf, means, o) {
  const wash = groups(means), shadow = groups(means), count = { wash: 0, shadow: 0, bounds: 0 };
  const paper = d => means[d].L >= PAPER_L && Math.hypot(means[d].a, means[d].b) <= PAPER_C;
  const smooth = (p, f) => p.length >= o.minLen && p.edge <= o.edge * f && p.gap <= o.mean * f;
  const level = p => p.length >= o.minLen && p.edgeL <= o.edge && p.gapL <= o.value;
  for (const p of stats) {
    if (subjectOf[p.a] !== subjectOf[p.b]) { count.bounds++; continue; }
    shadow.join(p.a, p.b);
  }
  const inside = stats.filter(p => subjectOf[p.a] === subjectOf[p.b] && p.length >= o.minLen && !paper(p.a) && !paper(p.b)).sort((p, q) => wash.gapAB(p.a, p.b) - wash.gapAB(q.a, q.b));
  for (const p of inside) if (wash.gapAB(p.a, p.b) <= o.chroma) wash.join(p.a, p.b);
  const across = stats.filter(p => subjectOf[p.a] !== subjectOf[p.b] && !paper(p.a) && !paper(p.b)).sort((p, q) => p.edge - q.edge);
  for (const p of across) {
    if (smooth(p, 1) && wash.gap(p.a, p.b) <= o.mean * DRIFT && wash.join(p.a, p.b)) count.wash++;
    if (level(p) && shadow.gapL(p.a, p.b) <= o.value * DRIFT && shadow.join(p.a, p.b)) count.shadow++;
  }
  // a wash group is one shadow group's part: what one wash crosses, its glaze may cross too
  for (const p of stats) if (wash.find(p.a) === wash.find(p.b)) shadow.join(p.a, p.b);
  return { wash, shadow, count };
}

/** Group ids (1..G) per cell from a domain field and a union-find over domains. */
function groupField(domain, find) {
  const ids = new Map(), out = new Uint16Array(domain.length);
  for (let i = 0; i < domain.length; i++) { const r = find(domain[i]); if (!ids.has(r)) ids.set(r, ids.size + 1); out[i] = ids.get(r); }
  return { field: out, ids: [...ids.values()] };
}

/** Each subject's own lights: its lightest share, at least `gap` L* over its median, cleaned to shapes. */
function subjectLights(subject, Lform, w, h, { share, gap, minShape, protectedCells }) {
  const n = w * h, out = new Uint8Array(n);
  if (!(share > 0)) return out;
  const bySubject = new Map();
  for (let i = 0; i < n; i++) { if (protectedCells?.[i]) continue; const s = subject[i]; if (!bySubject.has(s)) bySubject.set(s, []); bySubject.get(s).push(Lform[i]); }
  const cut = new Map();
  for (const [s, v] of bySubject) { if (v.length < 4 * minShape) continue; v.sort((a, b) => b - a); cut.set(s, Math.max(v[Math.floor(share * (v.length - 1))], v[v.length >> 1] + gap)); }
  for (let i = 0; i < n; i++) if (!protectedCells?.[i] && cut.has(subject[i]) && Lform[i] >= cut.get(subject[i])) out[i] = 1;
  return removeSmall(closeLocal(out, w, h, 1), w, h, minShape);
}

/**
 * The subject-aware field. seg: loadSegments' result at w x h; px: the target's RGB at the plan's size.
 * Returns { labels, regions, source } in targetRegions' shape (labels are the domains: subject x cluster), plus
 * subject (per cell), wash and shadow (group per cell) with their ids, lights (per-subject reserves) and summary.
 */
export function subjectField({ seg, px, w, h, families = [], minShape, options = {}, protectedCells = null }) {
  const o = { ...SUBJECT_DEFAULTS, ...options }, n = w * h;
  if (seg.width !== w || seg.height !== h) throw new Error(`subject field: segments are ${seg.width}x${seg.height}, the plan ${w}x${h}`);
  const lab = labPlanes(px, n, [255, 255, 255]), F = [boxMean(lab.L, w, h, 1), boxMean(lab.a, w, h, 1), boxMean(lab.b, w, h, 1)];
  const snapped = snapToEdges(Uint16Array.from(seg.labels), F, w, h), subject = snapped.subject;
  const { domain, subjectOf } = clusterSubjects(subject, F, w, h, { kMax: o.k, split: o.split, minShape });
  const stats = boundaryStats(domain, F, w, h, o.side);
  const { wash, shadow, count } = joinGroups(stats, subjectOf, domainMeans(domain, F, subjectOf.length), o);
  const W = groupField(domain, wash.find), S = groupField(domain, shadow.find);
  const lights = subjectLights(subject, confinedMean(lab.L, subject, w, h, 2), w, h, { share: o.lights, gap: o.lightGap, minShape, protectedCells });
  const labels = Uint16Array.from(domain), regions = describeRegions(labels, subjectOf.length - 1, families, w, h, d => `subject-${subjectOf[d]}-cluster-${d}`);
  let lit = 0; for (let i = 0; i < n; i++) lit += lights[i];
  const table = groupTable(W.field, subject, F, n);
  const summary = { subjects: new Set(subject).size, clusters: subjectOf.length - 1, washGroups: W.ids.length, shadowGroups: S.ids.length,
    subjectBoundaries: count.bounds, washCrossings: count.wash, shadowCrossings: count.shadow, lightShare: lit / n, snapped: snapped.moved / n, groups: table };
  return { labels, regions, source: 'SAM subject regions cut into colour and value clusters; washes cross where colour and value continue',
    subject, subjectOf, wash: W.field, washIds: W.ids, shadow: S.field, shadowIds: S.ids, lights, summary };
}

/** Each wash group's share of the sheet, mean Lab and the SAM subjects it covers (share of the group in each). */
function groupTable(wash, subject, F, n) {
  const g = new Map();
  for (let i = 0; i < n; i++) {
    if (!g.has(wash[i])) g.set(wash[i], { cells: 0, L: 0, a: 0, b: 0, subjects: new Map() });
    const q = g.get(wash[i]); q.cells++; q.L += F[0][i]; q.a += F[1][i]; q.b += F[2][i]; q.subjects.set(subject[i], (q.subjects.get(subject[i]) ?? 0) + 1);
  }
  return [...g].sort((p, q) => q[1].cells - p[1].cells).map(([id, q]) => ({ id, share: +(q.cells / n).toFixed(4),
    lab: [q.L, q.a, q.b].map(v => +(v / q.cells).toFixed(1)),
    subjects: Object.fromEntries([...q.subjects].sort((p, r) => r[1] - p[1]).map(([s, c]) => [`r${s}`, +(c / q.cells).toFixed(3)])) }));
}

/** Connected pieces of a mask that stay inside one group each (small slivers fold into a neighbour). */
export function componentsBy(mask, groups, w, h, small = 1) {
  return splitByPuddle(components(mask, w, h).labels, groups, w, h, small);
}

/** One line for the log. */
export function describeField(f) {
  const s = f.summary;
  return `subject washes: ${s.subjects} SAM regions (${(100 * s.snapped).toFixed(1)}% of cells moved onto the picture's edges) cut into ${s.clusters} colour and value clusters, ${s.washGroups} wash groups; washes cross ${s.washCrossings} of ${s.subjectBoundaries} subject boundaries where colour and value continue, shadow glazes ${s.shadowCrossings}; ${(100 * s.lightShare).toFixed(1)}% of the sheet reserved as subject lights`;
}
