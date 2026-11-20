// The wash plan read from a painter's block-in study (an image of the subject simplified into a couple of dozen flat
// shapes of clean colour, lights left as paper), not from the subject. The subject is not read here at all; the caller
// uses it only to register the study to the sheet and to score the plate afterwards.
//
// 1. Shapes: the study's colours clustered in Lab, each cluster's connected parts a shape; a part under SLIVER_SHARE of
//    the sheet joins the neighbour it borders most, until none is left. A near-white shape is bare paper. Each shape has
//    ONE colour (its cluster's), and so one mix from the palette.
// 2. Order, as a painter works (books/RULES.md A1, A2, A11): lightest and largest first. A darker shape lying on or
//    beside a lighter one of like hue is a second, smaller wash over that one once it is dry: the lighter wash is
//    carried on under it (wash within wash) instead of the two being butted. The darkest small shapes come last.
// 3. Every shape is laid in lanes along its long axis (sweep-fill.mjs laneFill), or in one pull down its spine.
// 4. In the larger washes, a warmer and a cooler neighbour's mix are dropped in while wet (round dabs); the load varies
//    along a wash (loaded, thinned, recharged); close values are laid against each other damp (soft edges); a broken
//    mass (foliage) is laid in loose dabs of a round, its own value first, a darker one dropped in.
// 5. A stack of studies, coarse to fine: each richer study adds only what is darker or stronger than what the studies
//    before it laid (watercolour only darkens), shapes above its own least size; from the third on, only accents.
// Plan time only.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { labOf } from '../../eval/colour.mjs';
import { outlineLoops, loopsMask } from './wash-strokes.mjs';
import { laneFill } from './sweep-fill.mjs';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { kmeans, roundMask, dilate } from './study-shapes.mjs';
import { monoAt } from './mono-mix.mjs';
import { touchesFrom } from './touch-layer.mjs';
import { shapeGeometry, markFor } from '../marks/index.mjs';

/** The plan's grid cell (mm). */
const PLAN_MM = 0.25;
/** Colour clusters asked for, and clusters nearer than this (Lab) are one. Coarse, so a faint (3 L*) change in the study cannot move a
 * cell between clusters: at 14 and 12 the planted 3.4 mm pattern reached the plate through the study (copied +0.11 against a null of
 * 0.07); at 8 and 18 it does not (-0.03 against 0.08), and the Yale study keeps its windows, arch, gate, foliage and cast shadows. */
const CLUSTERS = 16, CLUSTER_JOIN = 10;
/** The planted-pattern copy test of this reading (19-20 Nov 2026; no drawing; copied with the spread of the same measure
 * against patterns not planted, and stable against two studies of the clean piece that differ only in seed): */
const COPY_TEST = 'copy test of this reading, laid as at 02db12b0 (under-washes, joined shadows, cut darks), 20 Nov 2026: mini 1 (RunPod studies) flat copied -0.00/-0.06 at 1.8/3.4 mm (null max 0.08/0.08), d1 +0.02/-0.05 (0.10/0.08), d2 +0.03/-0.04 (0.05/0.08), stable 0.85 to 0.90 against a seed floor of 0.47 to 0.52; mini 2 (local studies) flat -0.05/-0.02 (0.07/0.16), d1 -0.04/+0.02 (0.13/0.14), d2 -0.04/+0.02 (0.13/0.14), stable 0.61 to 0.73 against a seed floor of 0.65 to 0.74; every copy within its null; no copy above +0.03';
/** Two regions each over this share of the sheet are never merged into one (a roof and its wall stay two shapes). */
const BIG = 0.02;
/** A part smaller than this share of the sheet is a sliver and joins a neighbour. */
const SLIVER_SHARE = 0.0008;
/** A small shape this much darker (L*) than the neighbour it would be merged into is kept. */
const KEEP_DARK = 25;
/** ... or this far from it in hue and chroma (a*b*, at least this chromatic itself): a warm accent in a pale wall. */
const KEEP_HUE = 15;
/** Bare paper: a shape at least this light (L*, against the SHEET's colour: on a toned sheet, buff is paper, and a study's
 * white, lighter than the sheet, is paper too) and no more chromatic than this. */
const PAPER_L = 91, PAPER_CHROMA = 7;
/** Outlines are rounded by a brush this wide (mm) and simplified to this tolerance (mm). */
const ROUND_MM = 1, TOL_MM = 0.4;
/** A wash nests on a neighbour at least this much lighter (L*) whose hue is this near (chromaticity over lightness, as a shadow keeps its hue). */
const NEST_LIGHTER = 4, NEST_HUE = 14;
/** ... when their shared border is at least this share of the darker shape's outline. */
const NEST_BORDER = 0.05;
/** Phases: a first wash at least this light; a dark under this L*; a dark is last only when smaller than this share of the sheet. */
const FIRST_L = 55, DARK_L = 40, DARK_SMALL = 0.04;
/** Charges: in a wash of at least this share of the sheet, at most this many, each a dab of a round this wide (mm) at this share of the wash's strength. */
const CHARGE_FROM = 0.03, CHARGE_MOST = 2, CHARGE_BRUSH_MM = 7, CHARGE_STRENGTH = 0.7;
/** A wash is graded top to bottom by this share either side of its mix (A9: every patch a little paler at one end). */
const GRADE = 0.22;
/** A wash is laid this far past its outline to meet its neighbours, never onto bare paper. */
const GROW_MM = 0.4;
/** A touch dropped into a wet wash covers at least this many sheet cells (a stroke's own footprint). */
const WET_LEAST_CELLS = 40;
/** A wash is laid only when it darkens what is under it by this much L*. */
const VISIBLE_STEP = 2;

/** Mean linear light of the w x h sRGB image on a pw x ph grid. */
function toGrid(rgb, w, h, pw, ph) {
  const pn = pw * ph, lin = [0, 1, 2].map(() => new Float32Array(pn)), cnt = new Float32Array(pn);
  for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) { const q = py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0), i = y * w + x; cnt[q]++; for (let c = 0; c < 3; c++) lin[c][q] += (rgb[i * 3 + c] / 255) ** 2.2; } }
  const out = new Uint8ClampedArray(pn * 3);
  for (let q = 0; q < pn; q++) for (let c = 0; c < 3; c++) out[q * 3 + c] = Math.round(255 * (lin[c][q] / Math.max(1, cnt[q])) ** (1 / 2.2));
  return out;
}

/** Each cell's label replaced by the commonest label of its 3 x 3 neighbourhood (the anti-aliased rims of the study's shapes go). */
function majority(lab, w, h) {
  const out = Int32Array.from(lab), votes = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    votes.clear(); let best = lab[y * w + x], bv = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue; const v = lab[yy * w + xx], c = (votes.get(v) ?? 0) + 1; votes.set(v, c); if (c > bv) { bv = c; best = v; } }
    if (bv >= 5) out[y * w + x] = best;
  }
  return out;
}

/** The 4-connected parts of a label map: {labels (1-based), count}. */
function parts(lab, w, h) {
  const out = new Int32Array(lab.length), stack = new Int32Array(lab.length); let count = 0;
  for (let s0 = 0; s0 < lab.length; s0++) {
    if (out[s0]) continue;
    count++; let sp = 0; stack[sp++] = s0; out[s0] = count;
    while (sp) { const i = stack[--sp], x = i % w; for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < lab.length && !out[j] && lab[j] === lab[s0]) { out[j] = count; stack[sp++] = j; } }
  }
  return { labels: out, count };
}

/**
 * The study's flat shapes on a pw x ph grid: {label (0-based shape per cell), shapes: [{cells, colour (sRGB), lab, paper, border: Map(shape -> shared edges), rim}]}.
 * `rgb` is the study on that grid.
 */
function studyShapes(rgb, pw, ph, paperRGB, { sliverCells, most = 0, clusters: K = CLUSTERS, join: J = CLUSTER_JOIN, keep: KD = KEEP_DARK, hue: HK = KEEP_HUE }) {
  const pn = pw * ph, L = new Float32Array(pn), A = new Float32Array(pn), B = new Float32Array(pn);
  for (let q = 0; q < pn; q++) { const [l, a, b] = labOf(rgb, q, paperRGB); L[q] = l; A[q] = a; B[q] = b; }
  // the colours, read off a fixed grid of about 8000 cells
  const step = Math.max(1, Math.round(Math.sqrt(pn / 8000))), rows = [];
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) { const q = y * pw + x; rows.push(L[q], A[q], B[q]); }
  let centres = kmeans(Float32Array.from(rows), 3, K, 20);
  // (a pale tint is never joined to the paper: a cream sail is painted, the white round it is not)
  const paperish = c => c[0] >= PAPER_L && Math.hypot(c[1], c[2]) <= PAPER_CHROMA;
  for (let merged = true; merged;) { merged = false; for (let a = 0; a < centres.length && !merged; a++) for (let b = a + 1; b < centres.length && !merged; b++) if (paperish(centres[a]) === paperish(centres[b]) && Math.hypot(...centres[a].map((v, j) => v - centres[b][j])) < J) { centres[a] = centres[a].map((v, j) => (v + centres[b][j]) / 2); centres.splice(b, 1); merged = true; } }
  let lab = new Int32Array(pn);
  for (let q = 0; q < pn; q++) { let best = 0, bd = Infinity; centres.forEach((c, f) => { const d = (L[q] - c[0]) ** 2 + (A[q] - c[1]) ** 2 + (B[q] - c[2]) ** 2; if (d < bd) { bd = d; best = f; } }); lab[q] = best; }
  // a small region whose HUE differs strongly from its cluster's (a warm niche in a pale wall) gets a cluster of its own,
  // though its value is close: the coarse clusters would swallow it. Hue, not lightness: a faint neutral pattern changes
  // lightness only and cannot open one.
  if (HK > 0) {
    const off = Uint8Array.from({ length: pn }, (_, q) => { const c = centres[lab[q]]; return Math.hypot(A[q] - c[1], B[q] - c[2]) >= HK && Math.hypot(A[q], B[q]) >= HK ? 1 : 0; });
    const oc = components(off, pw, ph, 4), cnt = new Int32Array(oc.count + 1); for (const id of oc.labels) if (id) cnt[id]++;
    const newId = new Int32Array(oc.count + 1).fill(-1);
    for (let id = 1; id <= oc.count; id++) if (cnt[id] >= sliverCells / 6) { let l = 0, a = 0, b = 0; for (let q = 0; q < pn; q++) if (oc.labels[q] === id) { l += L[q]; a += A[q]; b += B[q]; } newId[id] = centres.length; centres.push([l / cnt[id], a / cnt[id], b / cnt[id]]); }
    for (let q = 0; q < pn; q++) { const id = oc.labels[q]; if (id && newId[id] >= 0) lab[q] = newId[id]; }
  }
  lab = majority(majority(lab, pw, ph), pw, ph);
  // connected parts, each with its cluster, size and borders
  const pc = parts(lab, pw, ph), n = pc.count, root = Int32Array.from({ length: n + 1 }, (_, i) => i), size = new Float64Array(n + 1), cluster = new Int32Array(n + 1);
  const border = Array.from({ length: n + 1 }, () => new Map());
  for (let q = 0; q < pn; q++) { const id = pc.labels[q]; size[id]++; cluster[id] = lab[q]; const x = q % pw;
    for (const j of [x < pw - 1 ? q + 1 : -1, q + pw < pn ? q + pw : -1]) { if (j < 0) continue; const o = pc.labels[j]; if (o !== id) { border[id].set(o, (border[id].get(o) ?? 0) + 1); border[o].set(id, (border[o].get(id) ?? 0) + 1); } } }
  // a small shape much darker than the one it would join, or of a strongly different hue, is kept (darks carry the drawing: windows, a doorway), if it is
  // at least a sixth of the least size
  const keepDark = (i, into) => size[i] >= sliverCells / 6 && (centres[cluster[into]][0] - centres[cluster[i]][0] >= KD || (HK > 0 && Math.hypot(centres[cluster[into]][1] - centres[cluster[i]][1], centres[cluster[into]][2] - centres[cluster[i]][2]) >= HK));
  const find = i => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  const join = (small, big) => {
    root[small] = big; size[big] += size[small];
    for (const [o, c] of border[small]) { if (o === big) { border[big].delete(small); continue; } border[big].set(o, (border[big].get(o) ?? 0) + c); border[o].delete(small); border[o].set(big, (border[o].get(big) ?? 0) + c); }
    border[small] = new Map();
  };
  // slivers join the neighbour they border most, smallest first, until none is left; then touching parts of one colour are one
  for (let changed = true; changed;) {
    changed = false;
    const live = []; for (let i = 1; i <= n; i++) if (find(i) === i && size[i] < sliverCells && border[i].size) live.push(i);
    live.sort((a, b) => size[a] - size[b]);
    for (const i of live) {
      if (find(i) !== i || size[i] >= sliverCells) continue;
      let best = -1, bv = -1; for (const [o, c] of border[i]) { const oc = find(o); if (oc !== i && c > bv) { bv = c; best = oc; } }
      if (best > 0 && keepDark(i, best)) continue;
      if (best > 0) { join(i, best); changed = true; }
    }
    for (let i = 1; i <= n; i++) { if (find(i) !== i) continue; for (const [o] of [...border[i]]) { const oc = find(o); if (oc !== i && cluster[oc] === cluster[i] && find(i) === i) { join(oc, i); changed = true; } } }
  }
  const big = i => size[i] >= BIG * pn;
  // at most `most` shapes: the smallest joins the neighbour nearest it in colour, until that many are left
  // (the kept darks do not count against `most`)
  const kept = new Set();
  if (most) for (;;) {
    const live = []; for (let i = 1; i <= n; i++) if (find(i) === i) live.push(i);
    if (live.filter(i => !kept.has(i)).length <= most) break;
    live.sort((a, b) => size[a] - size[b]);
    let done = false;
    for (const i of live) {
      let best = -1, bd = Infinity; const ci = centres[cluster[i]];
      // (the paper is never merged, nor merged into: it is not painted)
      if (paperish(ci)) continue;
      for (const [o] of border[i]) { const oc = find(o); if (oc === i || paperish(centres[cluster[oc]])) continue; const d = Math.hypot(...ci.map((v, j) => v - centres[cluster[oc]][j])); if (d < bd) { bd = d; best = oc; } }
      if (best > 0 && (keepDark(i, best) || (big(i) && big(best)))) { kept.add(i); continue; }
      if (best > 0) { join(i, best); done = true; break; }
    }
    if (!done) break;
  }
  const ids = new Map(), label = new Int32Array(pn), shapes = [];
  for (let q = 0; q < pn; q++) { const r = find(pc.labels[q]); if (!ids.has(r)) { ids.set(r, shapes.length); const c = centres[cluster[r]]; shapes.push({ root: r, cluster: cluster[r], cells: [], lab: c, chroma: Math.hypot(c[1], c[2]), border: new Map(), rim: 0 }); } label[q] = ids.get(r); shapes[label[q]].cells.push(q); }
  for (let q = 0; q < pn; q++) { const s = label[q], x = q % pw, y = (q / pw) | 0;
    for (const [xx, yy] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (xx < 0 || yy < 0 || xx >= pw || yy >= ph) { shapes[s].rim++; continue; } const o = label[yy * pw + xx]; if (o !== s) { shapes[s].rim++; shapes[s].border.set(o, (shapes[s].border.get(o) ?? 0) + 1); } } }
  for (const s of shapes) {
    // the shape's own colour: the median sRGB of its cluster's cells in it (one flat colour, as the study laid it)
    const own = s.cells.filter(q => lab[q] === cluster[s.root]), use = own.length ? own : s.cells;
    s.colour = [0, 1, 2].map(c => { const v = use.map(q => rgb[q * 3 + c]).sort((a, b) => a - b); return v[v.length >> 1]; });
    s.lab = labOf(s.colour, 0, paperRGB); s.chroma = Math.hypot(s.lab[1], s.lab[2]);
    s.paper = s.lab[0] >= PAPER_L && s.chroma <= PAPER_CHROMA;
  }
  return { label, shapes, clusters: centres.length };
}

/** sRGB of a Lab colour whose white is the paper (the inverse of labOf). */
function labToRgb([L, a, b], paperRGB) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, inv = t => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const M = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]], W = M.map(r => r[0] + r[1] + r[2]);
  const X = inv(fx) * W[0], Y = inv(fy) * W[1], Z = inv(fz) * W[2];
  const Mi = [[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560], [0.0556434, -0.2040259, 1.0572252]];
  const toLin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, toS = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return Mi.map((r, c) => Math.round(Math.max(0, Math.min(255, toS(Math.max(0, (r[0] * X + r[1] * Y + r[2] * Z) * toLin(paperRGB[c])))))));
}

/** Chromaticity over lightness: a shadow on a thing keeps it, darker and greyer in proportion. */
const tint = ([L, a, b]) => { const l = Math.max(20, L); return [60 * a / l, 60 * b / l]; };

/**
 * For each shape, the lighter shape of like hue it is laid over (its wash carried on under this one), or -1.
 *
 */
export function nestParents(shapes) {
  return shapes.map((s, i) => {
    if (s.paper) return -1;
    let best = -1, bv = 0; const ts = tint(s.lab);
    for (const [o, c] of s.border) {
      const t = shapes[o]; if (t.paper || t.lab[0] < s.lab[0] + NEST_LIGHTER || c < NEST_BORDER * s.rim) continue;
      const tt = tint(t.lab), near = Math.hypot(ts[0] - tt[0], ts[1] - tt[1]) <= NEST_HUE || (s.chroma < 6 && t.chroma < 6);
      if (near && c > bv) { bv = c; best = o; }
    }
    return best === i ? -1 : best;
  });
}

/** L* of a w x h sRGB grid, against the paper. */
const lightOf = (rgb, pn, paperRGB) => Float32Array.from({ length: pn }, (_, q) => labOf(rgb, q, paperRGB)[0]);

/**
 * The shift (cells) that best lays study `b` on study `a` (both pw x ph sRGB grids): the smallest mean L* difference
 * over shifts up to `most` cells each way, read on a grid four times coarser and refined at full size.
 */
function registerShift(a, b, pw, ph, paperRGB, most) {
  const pn = pw * ph, La = lightOf(a, pn, paperRGB), Lb = lightOf(b, pn, paperRGB);
  const cost = (dx, dy, step) => { let s = 0, c = 0; for (let y = Math.max(0, dy); y < Math.min(ph, ph + dy); y += step) for (let x = Math.max(0, dx); x < Math.min(pw, pw + dx); x += step) { s += Math.abs(La[y * pw + x] - Lb[(y - dy) * pw + x - dx]); c++; } return c ? s / c : Infinity; };
  let best = [0, 0], bc = cost(0, 0, 4);
  for (let dy = -most; dy <= most; dy += 2) for (let dx = -most; dx <= most; dx += 2) { const c = cost(dx, dy, 4); if (c < bc - 1e-9) { bc = c; best = [dx, dy]; } }
  const [cx, cy] = best; bc = cost(cx, cy, 1);
  for (let dy = cy - 2; dy <= cy + 2; dy++) for (let dx = cx - 2; dx <= cx + 2; dx++) { const c = cost(dx, dy, 1); if (c < bc - 1e-9) { bc = c; best = [dx, dy]; } }
  return best;
}
/** A pw x ph sRGB grid moved by (dx, dy) cells, its edges repeated. */
function shifted(rgb, pw, ph, [dx, dy]) {
  if (!dx && !dy) return rgb;
  const out = new Uint8ClampedArray(rgb.length);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const sx = Math.min(pw - 1, Math.max(0, x - dx)), sy = Math.min(ph - 1, Math.max(0, y - dy)); for (let c = 0; c < 3; c++) out[(y * pw + x) * 3 + c] = rgb[(sy * pw + sx) * 3 + c]; }
  return out;
}

/** A broken mass (laid in dabs): a green between these hues (degrees, Lab), or a shape that loses this share of itself when rounded; between these shares of the sheet. */
const BROKEN_HUE = [95, 170], BROKEN_LOST = 0.15, BROKEN_THIN = 0.6, BROKEN_LONG = 3, BROKEN_LEAST = 0.002, BROKEN_MOST = 0.3;
/** Foliage dabs: a round about this share of the sheet's width; dabs this many brush widths apart; the darker value's share of the dabs and its strength. */
const DAB_SHARE = 0.025, DAB_PITCH = 0.6, DAB_DARK_SHARE = 0.35, DAB_DARK = 1.6;
/** Dabs vary in size between these shares of the brush and in length between these shares of their width; they come in clusters
 * this many cells across, the dabs of a cluster turned alike (within DAB_TURN radians), this share of the clusters left out as paper. */
const DAB_SIZE = [0.55, 1.25], DAB_LONG = [2.6, 3.8], DAB_CLUSTER = 3, DAB_TURN = 0.45, DAB_GAPS = 0.12;
/** A dab is a leaf stroke, pressed and lifted: this many points along it, pressed as sin(pi u) to this power. The round
 * lands on its point and opens to its belly only over the tuft it draws down (about 2.8 radii at full pressure,
 * src/media/tuft-section.mjs), so a dab travels DAB_LONG radii: a three-point touch no longer than the brush was wide
 * never opened, and foliage dried as pale dashes over paper. */
const LEAF_POINTS = 9, LEAF_PRESS = 0.6;
/** A darker value is dropped into a dabbed mass of at least this area (mm2). */
const DARK_DABS_FROM = 100;
/** Close values: a wash is laid against a neighbour still damp (one session, a soft edge) when their L* differ by no more than this. */
const CLOSE_L = 8;
/** Load along a wash: the brush starts loaded at this share over the mix and is thinned to this share under it before each recharge, every this many strokes. */
const LOAD_HIGH = 0.25, LOAD_EVERY = 3;
/** A later layer adds a shape where its study is at least this much darker (L*) than what is laid there, or this much more chromatic. */
const ADD_DARKER = 6;
/** Glazes of one layer that do not touch are laid in one session (the sheet dried after it), at most this many. */
const SESSION_MOST = 10;
/** A glaze layer (FILE:MIN:glaze): a cell joins a glaze when the study is a little darker and this much cooler (b*) than what is laid; parts within this (mm) are one; at most this many glazes. */
const GLAZE_COOLER = 6, GLAZE_JOIN_MM = 4, GLAZE_MOST = 6;
/** A shadow glaze is moved this much cooler (b*) than the study's shadow colour (a cast shadow on a warm wall reads violet-grey). */
const SHADOW_COOL = 6;
/** A light shape at least this share of the sheet, with what nests on it, is a family laid first as one under-wash. */
const FAMILY_LEAST = 0.03;
/** A shape whose outline runs at least this share along one family's shapes lies inside it: the under-wash runs under it. */
const ABSORB_BORDER = 0.5;
/** A white shape of the study at least this big (mm2) is a true light, left as paper; a smaller one is washed over. */
const LIGHT_LEAST_MM2 = 40;
/** A lighter wash runs this far (mm) under a darker neighbour. */
const UNDER_MM = 2;
/** Edge strokes: the outline resampled every EDGE_STEP_MM, pulls at most EDGE_PULL_MM long, pressed at EDGE_PRESS. */
const EDGE_STEP_MM = 0.5, EDGE_PULL_MM = 60, EDGE_PRESS = 0.55;
/** A dark shape (L* under DARK_L) is laid with brushes no wider than this (mm), its outline cut first, rounded by at most DARK_ROUND_MM. */
const DARK_KIT_MM = 7, DARK_ROUND_MM = 1;
/** Every cast-shadow glaze over one family is mixed in one proportion, the largest's, at this share of the strength its study
 * value asks (a glaze that lets the lit wall show through). */
const SHADOW_CHARGE = 0.9;
/** ... one proportion for each band of this many degrees of hue (the path's blue-grey is not the wall's violet shadow). */
const SHADOW_HUE_BAND = 40;
/** The under-wash is laid this much lighter than its family's colour (a share of the colour's depth below the paper): the lit
 * stone between the shadows stays nearly paper; the shadows and darker shapes over it carry the contrast. */
const UNDER_LIGHT = 0.25;
/** Its outer edge on the bare paper is carried round first with the brush of this width (mm), lighter in load. */
const OUTER_EDGE_MM = 7, OUTER_EDGE_CHARGE = 0.7;
/** Any wash runs this far (mm) over a painted neighbour's edge. */
const OVER_MM = 1;
/** Shapes of one cluster this near (mm) are one wash. */
const JOIN_MM = 2;
/** Near-monochrome value steps: a wash whose study lightness spans at least this (L*, 10th to 90th percentile) is laid in
 * steps: first at the lightness of this quantile, then the cells at or under these quantiles over it, each part at least
 * MONO_STEP_LEAST mm2. */
/** A sheet darker than this (L* against white) is toned. */
const TONED_L = 95;
const MONO_STEP_L = 8, MONO_FIRST = 0.7, MONO_CUTS = [0.4, 0.12], MONO_STEP_LEAST = 25;
/** Touches are laid with rounds of these widths (mm): the smallest a pointed round's touch, the largest a big round's stroke. */
const TOUCH_KIT = [0.8, 1.4, 2.4, 4, 6.5, 10];
/** Reserved lights from the finest study: at least this light (L*) and no more chromatic than this, in parts of at least this (mm2). */
const RESERVE_L = 90, RESERVE_C = 12, RESERVE_LEAST_MM2 = 2;
/** A family shape is dropped into its wet under-wash when its value is within this (L*) of the family's and its hue at least
 * this far off (a*b*), and it is at least this big (mm2); with rounds of these widths (mm). */
const CHARGE_CLOSE_L = 16, CHARGE_HUE = 4, CHARGE_LEAST_MM2 = 6, CHARGE_KIT = [2, 3.5, 6, 10, 14];
/** The block-in (the first layer) has at most this many shapes. */
const FIRST_MOST = 48;
/** Washes err light: a wash (not a dark) aims this share of the way from the study's value to the paper's. The study is a
 * poster of the subject, flatter and denser than its washes; in watercolour the paper carries the light. */
const ERR_LIGHT = 0;
/** A window's glass wash is laid this much lighter (L*) than the study's dark, when the finest study's panes go over it. */
const GLASS_LIFT = 8;
/** Glazes: one for each GLAZE_STEP_L (L*) a shadow or dark is below what is laid, at most four; glaze k covers the cells
 * at or under this quantile of the finest study's lightness in the shape; parts under GLAZE_LEAST_MM2 are left. */
const GLAZE_STEP_L = 10, GLAZE_STEPS = [1, 0.65, 0.4, 0.22], GLAZE_LEAST_MM2 = 6;
/** A dark (a window's glass) is glazed whole more times before its glazes shrink. */
const GLAZE_STEPS_DARK = [1, 1, 0.85, 0.6];
/** Every wash of at least this size (mm2) has its outline cut first with a round of at most CUT_BRUSH_MM, so its silhouette is clean. */
const CUT_FROM_MM2 = 30, CUT_BRUSH_MM = 5;

// `inkValue`: the subject's value map the pen's line choice reads, as with the other plan (the drawing is the painter's
// own as before); the washes never read it.
// `studies`: the stack, coarse to fine: [{rgb (w x h x 3), file, minMm2, mode}] (mode 'glaze': a few connected glazes
// from that study instead of every shape it adds). `flat`: every shape one flat fill of its own,
// butted, no nesting, charging, load, soft edges or dabs (for comparison only).
export function planStudyWashes({ k, w, h, studies, flat = false, density = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], subject = null, shaped = true, drawn = false, inkValue = null, mono = null }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (!studies?.length || studies.some(st => !st?.rgb || st.rgb.length !== n * 3)) throw Error('the study wash plan needs its studies registered to the sheet (w x h x 3)');
  if (pigments.length !== k || k < 1) throw Error('the wash plan needs the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  const pw = Math.max(1, Math.round(sheetWidthMm / Math.max(PLAN_MM, cellMm))), ph = Math.max(1, Math.round(h * pw / w)), pn = pw * ph, mmX = sheetWidthMm / pw, cellMm2 = mmX * mmX;
  const rC = mm => Math.max(1, Math.round(mm / mmX));
  const grids = studies.map(st => toGrid(st.rgb, w, h, pw, ph));
  // the studies drift a little: each is registered to the first by a shift of at most 2% of the sheet
  const shifts = grids.map((g, i) => (i ? registerShift(grids[0], g, pw, ph, paperCol, Math.max(2, Math.round(0.02 * pw))) : [0, 0]));
  grids.forEach((g, i) => { grids[i] = shifted(g, pw, ph, shifts[i]); });

  function loopsFor(labels, id) {
    let x0 = pw, y0 = ph, x1 = -1, y1 = -1;
    for (let q = 0; q < labels.length; q++) if (labels[q] === id) { const x = q % pw, y = (q / pw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? [] : outlineLoops(labels, id, { x0, y0, x1, y1 }, pw, ph, { cellMm: mmX, tolMm: TOL_MM });
  }
  const maskLoops = (m, roundMm, avoid = null) => {
    const r = roundMask(m, pw, ph, rC(roundMm / 2)); for (let q = 0; q < pn; q++) if ((avoid?.[q] && !m[q]) || reserve[q]) r[q] = 0;
    const c = components(r, pw, ph, 4), loops = []; for (let id = 1; id <= c.count; id++) loops.push(...loopsFor(c.labels, id));
    return loops;
  };
  // the plan cells a list of strokes covers: each point a disc of the tuft's width at its pressure
  const footprint = strokes => {
    const m = new Uint8Array(pn);
    for (const st of strokes) for (const q of st.points) {
      const r = st.radiusMm * (q[4] ?? 1) * Math.min(1, q[2] ?? 1) ** 0.85 / mmX, cx = q[0] / mmX, cy = q[1] / mmX;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(ph - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(pw - 1, Math.ceil(cx + r)); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r + 0.25) m[y * pw + x] = 1;
    }
    return m;
  };
  // the same, one list of loops for each connected part (a part is laid on its own, along its own long axis)
  // (rounding closes gaps and notches but never takes away the shape's own cells: opened, a 2 mm mast falls into beads)
  const partLoops = (m, roundMm, avoid = null) => {
    const r = roundMask(m, pw, ph, rC(roundMm / 2)); for (let q = 0; q < pn; q++) { if (m[q]) r[q] = 1; else if (avoid?.[q]) r[q] = 0; if (reserve[q]) r[q] = 0; }
    const c = components(r, pw, ph, 4), out = []; for (let id = 1; id <= c.count; id++) { const l = loopsFor(c.labels, id); if (l.length) out.push(l); }
    return out;
  };
  // each part filled in lanes (or one pull down its spine) of a brush sized to that part, the parts top down
  const fillParts = (parts, growMm, kitMm = washKitMm) => {
    const top = l => Math.min(...l.flatMap(o => o.points.map(p => p[1]))), fills = [...parts].sort((a, b) => top(a) - top(b)).map(l => laneFill(l, { kitMm, growMm, keepOut, spine: kitMm === washKitMm }));
    const area = fills.reduce((a, f) => a + f.areaMm2, 0) || 1;
    return { strokes: fills.flatMap(f => f.strokes), brushMm: Math.max(0, ...fills.map(f => f.brushMm)), depthMm: Math.max(0, ...fills.map(f => f.depthMm)), uncovered: fills.reduce((a, f) => a + f.uncovered * f.areaMm2, 0) / area };
  };

  // Strokes along a wash's outline, a brush's half-width inside it (a painter cuts the edge of a dark shape, or carries a
  // wash's outer edge round, before filling): each loop resampled every EDGE_STEP_MM, set in along its own inward normal,
  // in pulls of at most EDGE_PULL_MM landing and lifting on the tip. With `where` (a test on a plan cell just outside the
  // outline), only the stretches whose outside passes it.
  const edgeStrokes = (loops, brushMm, { pressure = EDGE_PRESS, where = null } = {}) => {
    const r = brushMm / 2, hr = r * (0.25 + 0.75 * pressure), inMask = loopsMask(loops, pw, ph, mmX), out = [];
    const cellAt = (x, y) => { const gx = Math.floor(x / mmX), gy = Math.floor(y / mmX); return gx < 0 || gy < 0 || gx >= pw || gy >= ph ? -1 : gy * pw + gx; };
    const inside = (x, y) => { const q = cellAt(x, y); return q >= 0 && inMask[q] === 1; };
    for (const l of loops) {
      const P = l.points, pts = [];
      for (let v = 0; v < P.length; v++) { const A = P[v], B = P[(v + 1) % P.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(len / EDGE_STEP_MM)); for (let t = 0; t < n; t++) pts.push([A[0] + (B[0] - A[0]) * t / n, A[1] + (B[1] - A[1]) * t / n]); }
      if (pts.length < 4) continue;
      const set = pts.map((p, v) => {
        const a = pts[(v - 2 + pts.length) % pts.length], b = pts[(v + 2) % pts.length], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;
        const sgn = inside(p[0] + nx * 0.6, p[1] + ny * 0.6) ? 1 : inside(p[0] - nx * 0.6, p[1] - ny * 0.6) ? -1 : 0;
        if (!sgn) return null;
        const ok = !where || where(cellAt(p[0] - sgn * nx * 1.2, p[1] - sgn * ny * 1.2));
        const q = [p[0] + sgn * nx * hr, p[1] + sgn * ny * hr];
        return ok && inside(q[0], q[1]) ? q : null;
      });
      // runs of usable points, a closed loop's run carried round its start
      let runs = [], cur = [];
      for (const q of set) { if (q) cur.push(q); else if (cur.length) { runs.push(cur); cur = []; } }
      if (cur.length) { if (runs.length && set[0]) runs[0] = [...cur, ...runs[0]]; else runs.push(cur); }
      for (const run of runs) {
        let len = 0; for (let v = 1; v < run.length; v++) len += Math.hypot(run[v][0] - run[v - 1][0], run[v][1] - run[v - 1][1]);
        if (len < 2 * r) continue;
        const pieces = Math.max(1, Math.ceil(len / EDGE_PULL_MM)), per = Math.ceil(run.length / pieces);
        for (let k0 = 0; k0 < run.length - 1; k0 += per) {
          const seg = run.slice(k0, Math.min(run.length, k0 + per + 1)); if (seg.length < 2) continue;
          const every = Math.max(1, Math.round(r / EDGE_STEP_MM / 2)), keep = seg.filter((_, v) => v % every === 0 || v === seg.length - 1);
          out.push({ kind: 'sweep', radiusMm: +r.toFixed(3), points: keep.map((q, v) => [+q[0].toFixed(3), +q[1].toFixed(3), +(v === 0 || v === keep.length - 1 ? Math.min(pressure, 0.4) : pressure).toFixed(3)]) });
        }
      }
    }
    return out;
  };

  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], polygons = [], byStage = [0, 0, 0, 0], perLayer = []; let strokeCount = 0, charges = 0, dabbed = 0, softJoins = 0, glazes = 0;
  const stagesAt = [];
  const STAGE = ['', 'first wash', 'charge', 'wash over', 'accent'];
  const underMix = cells => { const u = new Array(k).fill(0); for (const q of cells) for (let j = 0; j < k; j++) u[j] += laid[j][q] / cells.length; return u; };
  const cellsIn = loops => { const m = loopsMask(loops, pw, ph, mmX), out = []; for (let q = 0; q < pn; q++) if (m[q]) out.push(q); return out; };
  let keepOut = [];
  const reserve = new Uint8Array(pn);
  // a colour moved cooler at the same L*: b* toward blue by SHADOW_COOL, a* a little toward violet (Lab against the paper)
  const cooled = rgb => { const [L, a, b] = labOf(rgb, 0, paperCol); return labToRgb([L, a, b - SHADOW_COOL], paperCol); };
  // A study's shapes and values are trusted more than its hues (an image model drifts a brown drawing to pink): the mix
  // is the palette's nearest to the study's colour (mixFor / mixOver: the painter's own pigments), its strength then set
  // so the film over what is laid reaches the study's VALUE (L*). The hue follows only as far as the palette allows.
  // A near-monochrome subject (mono-mix.mjs) is mixed from its own one or two paints in the proportion it has at that
  // value, whatever hue the study drifted to; only the strength comes from the study.
  const MONO = mono?.mono ? mono : null;
  // On a toned sheet the study (an image on white) is a picture of the subject's values from white down, and its white is
  // the sheet (the paper rule: bare paper is the toned sheet). So a wash's value is read against the study's own white and
  // laid as that much darker than the sheet. Read against the sheet instead, every value of the study lighter than the
  // buff is lost and the rest come out a few L* deep.
  const valueRef = labOf(paperCol, 0, [255, 255, 255])[0] < TONED_L ? [255, 255, 255] : paperCol;
  const valueMix = (colour, u, given = null) => {
    const fresh = u.every(v => v <= 1e-9), sL = labOf(colour, 0, valueRef)[0], want = sL >= DARK_L ? sL + (100 - sL) * ERR_LIGHT : sL;
    const base = given ?? MONO ? given ?? monoAt(MONO, want) : fresh ? mixFor(colour, pigments, paperCol) : mixOver(colour, u, pigments, paperCol);
    if (!(base.reduce((a, v) => a + v, 0) > 1e-9)) return base;
    const Lat = t => filmLab(u.map((v, j) => v + t * base[j]), pigments, paperCol)[0];
    let lo = MONO ? 0.01 : 0.05, hi = MONO ? 32 : 8; if (Lat(hi) > want) return base.map(v => v * hi); if (Lat(lo) < want) return base.map(v => v * lo);
    for (let it = 0; it < 11; it++) { const mid = Math.sqrt(lo * hi); if (Lat(mid) > want) lo = mid; else hi = mid; }
    return base.map(v => v * Math.sqrt(lo * hi));
  };
  // One wash: `colour` is what its own cells are to read as over what is laid there (or, with `amounts`, the mix itself).
  const wash = (stage, what, loops, colour, { strokes = null, amounts = null, own = null, move = 'wet on dry', grade = !flat, studyLayer = 1, parts = null, growMm = GROW_MM, kit = washKitMm, edge = null, edgeCharge = 1, base = null, scale = 1, onMix = null } = {}) => {
    if (!loops.length) return null;
    const cells = cellsIn(loops); if (!cells.length) return null;
    const u = underMix(own?.length ? own : cells);
    const mix = (amounts ?? valueMix(colour, u, base)).map(v => v * scale), strength = mix.reduce((a, v) => a + v, 0);
    if (!(strength > 1e-6)) return null;
    if (stage !== 2) { const a0 = filmLab(u, pigments, paperCol), a1 = filmLab(u.map((v, j) => v + mix[j]), pigments, paperCol); if (Math.hypot(a0[0] - a1[0], 0.5 * (a0[1] - a1[1]), 0.5 * (a0[2] - a1[2])) < VISIBLE_STEP) return null; }
    const fill = strokes ? { strokes, brushMm: Math.max(...strokes.map(s => 2 * s.radiusMm)), depthMm: 0, uncovered: 0 } : parts ? fillParts(parts, growMm, kit) : laneFill(loops, { kitMm: kit, growMm, keepOut });
    // the edge strokes go first: the outline cut, then the fill inside it
    if (edge?.length) fill.strokes = [...edge.map(st => ({ ...st, edge: true })), ...fill.strokes];
    onMix?.(mix);
    if (!fill.strokes.length) return null;
    // a touch dropped into a wet wash needs a few sheet cells to lay its own wet bed on: on a coarse sheet a 7 mm dab is a
    // handful of cells whose bed cannot be judged (the paint step's wet-bed check), so it is left out
    if (move === 'wet on wet') { fill.strokes = fill.strokes.filter(st => Math.PI * st.radiusMm ** 2 / (cellMm * cellMm) >= WET_LEAST_CELLS); if (!fill.strokes.length) return null; }
    // the load along the wash: each load starts strong and is thinned before the next recharge, and the wash as a whole
    // grades a little from its first strokes (the top) to its last
    if (grade && !strokes && fill.strokes.length > 1) {
      const raw = fill.strokes.map((_, q) => (1 + GRADE * (1 - 2 * q / (fill.strokes.length - 1))) * (1 + LOAD_HIGH * (1 - 2 * (q % LOAD_EVERY) / Math.max(1, LOAD_EVERY - 1)))), mean = raw.reduce((a, v) => a + v, 0) / raw.length;
      fill.strokes.forEach((st, q) => { st.charge = +(raw[q] / mean).toFixed(3); });
    }
    for (const st of fill.strokes) if (st.edge) { if (edgeCharge !== 1) st.charge = +((st.charge ?? 1) * edgeCharge).toFixed(3); delete st.edge; }
    for (const q of cells) for (let j = 0; j < k; j++) laid[j][q] += mix[j];
    const sm = loopsMask(loops, w, h, cellMm), ids = new Uint8Array(n), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
    for (let i = 0; i < n; i++) if (sm[i]) { ids[i] = 1; area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    if (!area) return null;
    const mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage });
    const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...mix]; sh.graded = null; sh._follow = true; sh.firstWash = stage <= 2; sh._opening = 1; sh.dryAfter = true;
    const areaMm2 = cells.length * cellMm2, phase = stage <= 2 ? 'light' : stage === 3 ? 'mid' : 'shadow';
    let rim = 0; for (const l of loops) for (let v = 0; v < l.points.length; v++) { const P = l.points[v], Q = l.points[(v + 1) % l.points.length]; rim += Math.hypot(Q[0] - P[0], Q[1] - P[1]); }
    strokeCount += fill.strokes.length;
    const wet = move !== 'wet on dry';
    const intent = { id: `${phase}/s${stage}/m${mixId}/${STAGE[stage].replace(' ', '-')}`, phase, colour: colour.map(Math.round), valueBand: stage, stage, mixId, thing: what, kind: STAGE[stage], studyLayer, areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: false,
      referenceCue: ['', 'A shape of the block-in study, its wash carried on under the darker shapes of like hue on it.', 'Dropped into the wet wash: a neighbour\'s mix, or a darker dab.', 'What a richer study adds: a darker or stronger shape laid over the dry washes.', 'One of the richer study\'s darkest small shapes, last.'][stage],
      intendedResult: ['', 'The study\'s flat colour, pale and connected.', 'The wash varied while wet, blended by the water.', 'The darker shape over the lighter, in-between values where they overlap.', 'The darkest accents.'][stage], cool: stage === 1 && colour[2] > colour[0] + 10,
      shaped, subject, move, paperBefore: wet ? 'wet: the wash or its neighbour just laid' : 'fully dry; own same-passage wet overlap allowed', baseBefore: wet ? 'wet' : 'fully dry',
      brush: { kind: strokes ? 'a round, in touches' : 'the smallest wash brush of the kit that lays the shape in a few lanes along its long axis, a smaller one in what they leave', contact: 'side/belly', width: 'each stroke names its brush', widthMm: fill.brushMm },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: wet ? .88 : .62, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: move === 'wet on wet' ? 'soft: dropped into a wet wash' : move === 'beside damp' ? 'soft: laid against a neighbour still damp' : 'hard: the edge is where the strokes end' },
      outline: loops, strokes: fill.strokes, softEdges: [], depthMm: +(fill.depthMm ?? 0).toFixed(1), uncoveredShare: +(fill.uncovered ?? 0).toFixed(4), widestBrushMm: fill.brushMm,
      protectedLights: ['the study\'s white shapes, left as paper'], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the shape' };
    sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind: STAGE[stage], colour, loops });
    byStage[stage - 1]++;
    return sh;
  };
  const VALUE = [0, 1, 1, 3, 5];
  const layer = (stage, list) => { if (!list.length) return; const area = list.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0); for (const s of list) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; }); const t = mix.reduce((a, v) => a + v, 0) || 1; layers.push({ value: VALUE[stage], pigment: mix.indexOf(Math.max(...mix)), mixId: list[0]._valuePlan.mixId, shapes: list, mix: mix.map(v => v / t), amount: list.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: stage <= 2 ? 'ground' : stage === 3 ? 'mid' : 'dark', region: 0, shoot: true }, _valuePhase: list[0]._valuePlan.phase }); };

  // a broken mass, laid in dabs: foliage (a green: hue between BROKEN_HUE degrees, some chroma), or a ragged shape (one
  // that loses BROKEN_LOST of itself when rounded by a 4 mm brush); never one larger than BROKEN_MOST of the sheet
  const broken = shape => {
    const c = shape.cells.length; if (flat || c < BROKEN_LEAST * pn || c > BROKEN_MOST * pn) return false;
    const hue = (Math.atan2(shape.lab[2], shape.lab[1]) * 180 / Math.PI + 360) % 360;
    if (shape.chroma >= 8 && hue >= BROKEN_HUE[0] && hue <= BROKEN_HUE[1]) return true;
    // (nor is a long shape, a mast or a spar: it is laid in a pull along its length)
    let mx = 0, my = 0; for (const q of shape.cells) { mx += q % pw; my += (q / pw) | 0; } mx /= c; my /= c;
    let sa = 0, sb = 0, sc = 0; for (const q of shape.cells) { const dx = q % pw - mx, dy = ((q / pw) | 0) - my; sa += dx * dx; sb += dx * dy; sc += dy * dy; }
    const mean = (sa + sc) / 2, dd = Math.sqrt(((sa - sc) / 2) ** 2 + sb * sb); if (Math.sqrt((mean + dd) / Math.max(1e-9, mean - dd)) >= BROKEN_LONG) return false;
    const m = new Uint8Array(pn); for (const q of shape.cells) m[q] = 1; const o = roundMask(m, pw, ph, rC(2)); let kept = 0; for (const q of shape.cells) kept += o[q];
    // (a shape that loses most of itself is not broken but thin: a mast, a rope, a frame, laid in a pull along its length)
    return 1 - kept / c >= BROKEN_LOST && 1 - kept / c < BROKEN_THIN;
  };
  // a hash of a grid point, 0..1, fixed to the sheet (no picture is read)
  const hash = (a, b, c = 0) => { let x = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const dabBrush = [...washKitMm].sort((a, b) => Math.abs(a - DAB_SHARE * sheetWidthMm) - Math.abs(b - DAB_SHARE * sheetWidthMm))[0], dr = dabBrush / 2;
  // loose dabs of a round over a mask, fixed to the sheet (a hash, no picture read): overlapping, in clusters whose dabs
  // lie alike, some clusters left out as gaps of paper; each dab its own size (DAB_SIZE times the brush), length and place
  // within its cell, a leaf stroke pressed and lifted. With keep < 1, whole clusters are kept (the darker dabs come in clumps).
  const dabsOver = (m, salt, keep = 1) => {
    const pitch = DAB_PITCH * dabBrush, strokes = [], cl = DAB_CLUSTER;
    for (let gy = 0; gy * pitch < ph * mmX; gy++) for (let gx = 0; gx * pitch < pw * mmX; gx++) {
      const kx = Math.floor(gx / cl), ky = Math.floor(gy / cl);
      if (hash(kx, ky, salt + 5) < DAB_GAPS || (keep < 1 && (hash(kx, ky, salt + 7) > 1.4 * keep || hash(gx, gy, salt + 8) > 0.75))) continue;
      const cx = (gx + 0.5 + 0.9 * (hash(gx, gy, salt) - 0.5)) * pitch, cy = (gy + 0.5 + 0.9 * (hash(gx, gy, salt + 1) - 0.5)) * pitch;
      if (cx < dr || cy < dr || cx > pw * mmX - dr || cy > ph * mmX - dr) continue;
      const q = Math.min(ph - 1, Math.floor(cy / mmX)) * pw + Math.min(pw - 1, Math.floor(cx / mmX)); if (!m[q]) continue;
      const r = dr * (DAB_SIZE[0] + (DAB_SIZE[1] - DAB_SIZE[0]) * hash(gx, gy, salt + 4));
      const a = Math.PI * hash(kx, ky, salt + 2) + DAB_TURN * (2 * hash(gx, gy, salt + 2) - 1), len = r * (DAB_LONG[0] + (DAB_LONG[1] - DAB_LONG[0]) * hash(gx, gy, salt + 3)), ux = Math.cos(a) * len / 2, uy = Math.sin(a) * len / 2;
      strokes.push({ kind: 'sweep', mark: 'leaf', radiusMm: +r.toFixed(3), points: Array.from({ length: LEAF_POINTS }, (_, j) => { const u = j / (LEAF_POINTS - 1); return [cx + (2 * u - 1) * ux, cy + (2 * u - 1) * uy, Math.max(0.05, Math.sin(Math.PI * u) ** LEAF_PRESS)]; }).map(p => p.map(v => +v.toFixed(3))) });
    }
    return strokes;
  };
  // a neighbour's mix dropped into a wet wash: a round dab at the interior point nearest `at` (mm)
  const cb = CHARGE_BRUSH_MM / 2;
  const chargeAt = (inside, at, colour, washSh, what) => {
    let best = -1, bd = Infinity;
    for (const q of inside) { const d = ((q % pw + .5) * mmX - at[0]) ** 2 + ((((q / pw) | 0) + .5) * mmX - at[1]) ** 2; if (d < bd) { bd = d; best = q; } }
    if (best < 0) return null;
    const cx = (best % pw + .5) * mmX, cy = (((best / pw) | 0) + .5) * mmX;
    const strokes = [{ kind: 'sweep', mark: 'touch', radiusMm: cb, points: [[cx - cb * .3, cy, .6], [cx, cy, 1], [cx + cb * .3, cy, .6]].map(p => p.map(v => +v.toFixed(3))) }];
    const disc = { points: Array.from({ length: 16 }, (_, t) => [cx + cb * 1.3 * Math.cos(t * Math.PI / 8), cy + cb * Math.sin(t * Math.PI / 8)]), soft: new Array(16).fill(true) };
    const own = mixFor(colour, pigments, paperCol), ot = own.reduce((a, v) => a + v, 0) || 1, amounts = own.map(v => v / ot * CHARGE_STRENGTH * washSh.amount);
    const ch = wash(2, what, [disc], colour, { strokes, amounts, move: 'wet on wet' }); if (ch) charges++;
    return ch;
  };
  // in a larger wash, a warmer and a cooler neighbour's mix dropped in while it is wet
  const lifeFor = (sh, cells, shapesOf, idx, exclude, what) => {
    if (flat || MONO || cells.length < CHARGE_FROM * pn) return [];
    const mine = new Uint8Array(pn); for (const q of cells) mine[q] = 1;
    const r = rC(cb + 1), inside = [];
    for (const q of cells) { const x = q % pw, y = (q / pw) | 0; let ok = true; for (let d = -r; d <= r && ok; d += Math.max(1, r >> 1)) for (const [xx, yy] of [[x + d, y - r], [x + d, y + r], [x - r, y + d], [x + r, y + d]]) if (xx < 0 || yy < 0 || xx >= pw || yy >= ph || !mine[yy * pw + xx]) { ok = false; break; } if (ok) inside.push(q); }
    if (!inside.length) return [];
    const s = shapesOf[idx], warmth = lab => lab[1] + lab[2], own = warmth(s.lab);
    const cands = [...s.border].map(([o]) => o).filter(o => !shapesOf[o].paper && !exclude.has(o) && Math.abs(shapesOf[o].lab[0] - s.lab[0]) <= 30 && shapesOf[o].chroma >= 6);
    const warm = cands.filter(o => warmth(shapesOf[o].lab) > own + 3).sort((a, b) => warmth(shapesOf[b].lab) - warmth(shapesOf[a].lab))[0];
    const cool = cands.filter(o => warmth(shapesOf[o].lab) < own - 3).sort((a, b) => warmth(shapesOf[a].lab) - warmth(shapesOf[b].lab))[0];
    // the places come from the shape's own geometry, not from where its study is darker: a third of the way in from
    // each end of its long axis (which end takes the warmer mix is the shape's own: the upper or left one)
    let mx = 0, my = 0; for (const q of cells) { mx += q % pw + .5; my += ((q / pw) | 0) + .5; } mx /= cells.length; my /= cells.length;
    let a = 0, b = 0, c = 0; for (const q of cells) { const dx = q % pw + .5 - mx, dy = ((q / pw) | 0) + .5 - my; a += dx * dx; b += dx * dy; c += dy * dy; }
    const th = 0.5 * Math.atan2(2 * b, a - c); let ux = Math.cos(th), uy = Math.sin(th); if (uy < 0 || (Math.abs(uy) < 1e-6 && ux < 0)) { ux = -ux; uy = -uy; }
    let lo = Infinity, hi = -Infinity; for (const q of cells) { const t = (q % pw + .5 - mx) * ux + (((q / pw) | 0) + .5 - my) * uy; if (t < lo) lo = t; if (t > hi) hi = t; }
    const end = t => [(mx + ux * t) * mmX, (my + uy * t) * mmX], places = [end(lo + (hi - lo) / 3), end(hi - (hi - lo) / 3)];
    const out = [];
    [warm, cool].forEach((o, j) => { if (o == null || out.length >= CHARGE_MOST) return; const ch = chargeAt(inside, places[j], shapesOf[o].colour, sh, `${what}: a ${o === warm ? 'warmer' : 'cooler'} neighbour's mix dropped in`); if (ch) out.push(ch); });
    return out;
  };
  // a broken mass laid as dabs: its own value first, then a darker value dropped into it while wet
  const dabMass = (stage, what, m0, loops, colour, own) => {
    // dabs only where the wash's outline is (a dab outside it has no footprint in the passage)
    const lm = loopsMask(loops, pw, ph, mmX), m = Uint8Array.from(m0, (v, q) => (v && lm[q] ? 1 : 0));
    const light = dabsOver(m, 11), sh = light.length ? wash(stage, `${what}, in loose dabs`, loops, colour, { strokes: light, own }) : null;
    if (!sh) return [];
    const dark = dabsOver(m, 29, DAB_DARK_SHARE), out = [sh];
    // (a darker value only in a mass big enough to hold a few dabs of it, away from the sheet's edge)
    if (dark.length >= 3 && own.length * cellMm2 >= DARK_DABS_FROM) { const d = wash(2, `${what}: darker dabs dropped in`, loops, colour, { strokes: dark, amounts: sh.mix.map(v => v * (DAB_DARK - 1)), move: 'wet on wet' }); if (d) out.push(d); }
    dabbed++;
    return out;
  };

  // Value steps of a near-monochrome subject (books/RULES.md A1, A2): the coarse clusters hold a brown drawing in two or
  // three colours, so within a wash the study's own lightness sets two or three strengths, laid as nested washes: the
  // first at the lighter tone, then the darker parts over it once it is dry, then the darkest. {firstL, steps: [{cells, L}]}
  const studyL = Float32Array.from({ length: pn }, (_, q) => labOf(grids[0], q, valueRef)[0]);
  const monoSteps = (own, minMm2) => {
    if (!MONO || flat || !own.length) return null;
    const Ls = own.map(q => studyL[q]).sort((a, b) => a - b), at = f => Ls[Math.min(Ls.length - 1, Math.floor(f * Ls.length))];
    if (at(0.9) - at(0.1) < MONO_STEP_L) return null;
    const steps = [];
    for (const f of MONO_CUTS) {
      const cut = at(f), cells = own.filter(q => studyL[q] <= cut); if (cells.length * cellMm2 < minMm2) continue;
      const v = cells.map(q => studyL[q]).sort((a, b) => a - b); steps.push({ cells, L: v[v.length >> 1] });
    }
    return steps.length ? { firstL: at(MONO_FIRST), steps } : null;
  };
  const withL = (colour, L) => { const [, a, b] = labOf(colour, 0, valueRef); return labToRgb([L, a, b], valueRef); };
  const deferredSteps = [];
  const stepsAfter = (what, own, colour, studyLayer = 1) => { const st = monoSteps(own, MONO_STEP_LEAST); if (!st) return colour; st.steps.forEach((x, k) => deferredSteps.push({ k, what: `${what}: value step ${k + 2}`, cells: x.cells, colour: withL(colour, x.L), studyLayer })); return withL(colour, st.firstL); };

  // --- layer 1: the block-in ---
  const L1 = studies[0], R1 = L1.read ?? {}, first = studyShapes(grids[0], pw, ph, paperCol, { sliverCells: Math.max(SLIVER_SHARE * pn, (L1.minMm2 ?? 0) / cellMm2), most: FIRST_MOST, ...R1 });
  const { label, shapes, clusters } = first;
  const parent = flat ? shapes.map(() => -1) : nestParents(shapes);
  const kids = shapes.map(() => []); parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const under = i => { const out = [i]; for (let q = 0; q < out.length; q++) out.push(...kids[out[q]]); return out; };
  // the true lights: the study's paper shapes at least LIGHT_LEAST_MM2; a smaller white is washed over with what is round it
  const isLight = i => shapes[i].paper && shapes[i].cells.length * cellMm2 >= LIGHT_LEAST_MM2;
  const paperMask = Uint8Array.from(label, s => (isLight(s) ? 1 : 0));
  // the small lights of the finest study (sunlit stone, dapples on the path, gaps in foliage): reserved from the start,
  // as paper no wash crosses, where the study is near paper in parts of at least RESERVE_LEAST_MM2
  if (!flat && studies.length > 1) {
    const g = grids[grids.length - 1], lm = new Uint8Array(pn);
    for (let q = 0; q < pn; q++) { const [l, a, b] = labOf(g, q, valueRef); if (l >= RESERVE_L && Math.hypot(a, b) <= RESERVE_C) lm[q] = 1; }
    const c = components(lm, pw, ph, 4), cnt = new Int32Array(c.count + 1); for (const id of c.labels) if (id) cnt[id]++;
    for (let q = 0; q < pn; q++) { const id = c.labels[q]; if (id && cnt[id] * cellMm2 >= RESERVE_LEAST_MM2) { reserve[q] = 1; paperMask[q] = 1; } }
  }
  { const pr = roundMask(paperMask, pw, ph, rC(ROUND_MM / 2)), pc = components(pr, pw, ph, 4); for (let id = 1; id <= pc.count; id++) keepOut.push(...loopsFor(pc.labels, id)); }
  const roundFirst = R1.round != null ? 2 * R1.round : ROUND_MM;   // @round is a radius (mm); ROUND_MM a brush width
  const painted = shapes.map((s, i) => i).filter(i => !shapes[i].paper);
  const isDark = i => !flat && shapes[i].lab[0] < DARK_L && !broken(shapes[i]);
  const share = i => under(i).reduce((a, s) => a + shapes[s].cells.length, 0) / pn;
  // Families (books/RULES.md A3, A14): a large light shape and what nests on it is one family. Its first wash is ONE
  // connected under-wash over the whole family and over every shape lying mostly inside it (windows, a gate, foliage on the
  // wall, a small white), reserving only the true lights; the other shapes go over it. Lightest family first.
  const fam = new Int32Array(shapes.length).fill(-1);
  const roots = flat ? [] : painted.filter(i => parent[i] < 0 && shapes[i].lab[0] >= FIRST_L && share(i) >= FAMILY_LEAST).sort((a, b) => shapes[b].lab[0] - shapes[a].lab[0] || share(b) - share(a));
  for (const r of roots) for (const q of under(r)) if (fam[q] < 0) fam[q] = r;
  for (let changed = true, it = 0; changed && it < 8; it++) {
    changed = false;
    shapes.forEach((s, i) => {
      if (fam[i] >= 0 || isLight(i)) return;
      const by = new Map(); for (const [o, c] of s.border) if (fam[o] >= 0) by.set(fam[o], (by.get(fam[o]) ?? 0) + c);
      let best = -1, bv = 0; for (const [f, c] of by) if (c > bv) { bv = c; best = f; }
      if (best >= 0 && bv >= ABSORB_BORDER * s.rim) { for (const q of s.paper ? [i] : under(i)) if (fam[q] < 0) fam[q] = best; changed = true; }
    });
  }
  // a shape's outline: it and the darker shapes nested on it (its wash carried under them), rounded, off the true lights
  // With `runUnder` (the wash's L*), it runs UNDER_MM on under the darker shapes beside it that are laid later, and OVER_MM
  // over any other painted neighbour (a thin rim of the study between two shapes is covered from both sides), so
  // neighbouring washes overlap instead of meeting at a hairline.
  const outlineOf = (list, roundMm = roundFirst, runUnder = null) => {
    const m = new Uint8Array(pn); for (const i of list) for (const s of under(i)) for (const q of shapes[s].cells) m[q] = 1;
    const own = Uint8Array.from(m);
    if (runUnder != null && !flat) {
      const g = dilate(own, pw, ph, rC(UNDER_MM)), o = dilate(own, pw, ph, Math.max(1, rC(OVER_MM)));
      // (over a neighbour's edge only where nothing is laid yet: over a wash already down there is no seam to close, and a
      // glaze run over the lit wall between two shadow streaks closes the streak's light)
      const bare = q => { for (let j = 0; j < k; j++) if (laid[j][q] > 0) return false; return true; };
      for (let q = 0; q < pn; q++) if (g[q] && !own[q] && !paperMask[q] && !shapes[label[q]].paper && ((o[q] && bare(q)) || (!done.has(label[q]) && shapes[label[q]].lab[0] < runUnder - NEST_LIGHTER))) m[q] = 1;
    }
    return { m: own, parts: partLoops(m, roundMm, paperMask) };
  };
  const phaseOf = i => { const s = shapes[i]; if (s.lab[0] < DARK_L && share(i) < DARK_SMALL) return 3; return parent[i] < 0 && fam[i] < 0 && s.lab[0] >= FIRST_L ? 1 : 2; };
  // the session open now: its stage, its shapes, the study shapes in it (a close-valued neighbour may join it while damp)
  let session = null;
  const close = () => { if (session) layer(session.stage, session.list); session = null; };
  const done = new Set(roots), leftDark = new Set(), glassLab = new Map(), glazeSteps = [];
  const fineL = Float32Array.from({ length: pn }, (_, q) => labOf(grids[grids.length - 1], q, valueRef)[0]);
  const laidL = new Map();
  // the under-washes: each family's cells, run on under any darker neighbour by UNDER_MM (the lighter wash under the
  // darker's edge, so the two never meet at a hairline), never onto a true light or a lighter family's ground
  for (const r of roots) {
    const s = shapes[r], m = new Uint8Array(pn); for (let q = 0; q < pn; q++) if (fam[label[q]] === r) m[q] = 1;
    const grow = dilate(m, pw, ph, rC(UNDER_MM));
    for (let q = 0; q < pn; q++) if (grow[q] && !m[q] && !paperMask[q] && !shapes[label[q]].paper && shapes[label[q]].lab[0] < s.lab[0] && !(fam[label[q]] >= 0 && laidL.has(fam[label[q]]))) m[q] = 1;
    const parts = partLoops(m, roundFirst, paperMask); if (!parts.length) continue;
    const members = shapes.map((_, i) => i).filter(i => fam[i] === r);
    const what = `under-wash of study shape ${r}, the family ${members.join(' ')}`;
    close();
    const loopsU = parts.flat(), Lr = labOf(s.colour, 0, valueRef)[0], under0 = MONO ? s.colour : withL(s.colour, Lr + (100 - Lr) * UNDER_LIGHT);
    const outer = flat ? null : edgeStrokes(loopsU, Math.min(OUTER_EDGE_MM, Math.max(...washKitMm)), { where: q => q < 0 || paperMask[q] === 1 || shapes[label[q]].paper });
    const made = wash(1, what, loopsU, stepsAfter(what, members.flatMap(i => shapes[i].paper ? [] : shapes[i].cells), under0), { own: s.cells, parts, edge: outer, edgeCharge: OUTER_EDGE_CHARGE });
    if (!made) continue;
    laidL.set(r, s.lab[0]);
    session = { stage: 1, list: [made], ids: new Set([r]) };
    session.list.push(...lifeFor(made, s.cells, shapes, r, new Set(under(r)), what));
    // the family's shapes of another hue but a close value are dropped into the wet under-wash where they sit, each as
    // marks of the brush shaped to it (src/paint/marks): they mingle with it, their edges lost; darker ones are glazed later on
    // the dry wash, their edges found
    if (!flat && !MONO) for (const m of members) {
      const t = shapes[m]; if (m === r || t.paper || isDark(m) || done.has(m)) continue;
      const dl = s.lab[0] - t.lab[0], dh = Math.hypot(t.lab[1] - s.lab[1], t.lab[2] - s.lab[2]);
      if (dl > CHARGE_CLOSE_L || dl < -CHARGE_CLOSE_L || dh < CHARGE_HUE) continue;
      const g = shapeGeometry(t.cells, pw, mmX); if (g.areaMm2 < CHARGE_LEAST_MM2) continue;
      const mk = markFor(g, { what: broken(t) ? 'foliage' : '', kit: CHARGE_KIT, seed: 131 + m });
      const strokes = mk.strokes.filter(st => Math.PI * st.radiusMm ** 2 / (cellMm * cellMm) >= WET_LEAST_CELLS); if (!strokes.length) continue;
      const cl = maskLoops(footprint(strokes), 0.5); if (!cl.length) continue;
      const ch = wash(2, `study shape ${m} dropped into the wet under-wash of ${r} (${mk.strokes.length} ${mk.name})`, cl, t.colour, { strokes, own: t.cells, move: 'wet on wet', grade: false });
      if (ch) { session.list.push(ch); done.add(m); charges++; }
    }
    close();
  }
  // a dark shape carries the drawing (a window, the gate): its outline cut with a small brush, then filled with small brushes
  const darkKit = washKitMm.filter(v => v <= DARK_KIT_MM).length ? washKitMm.filter(v => v <= DARK_KIT_MM) : [Math.min(...washKitMm)];
  const shadowBase = new Map();
  // the rest, lightest first: shapes of one cluster within JOIN_MM of each other are one wash (a band of cast shadow
  // broken by the study into pieces is laid as one), each connected part laid along its own length
  const rest = painted.filter(i => !done.has(i));
  const groupOf = new Map();
  if (!flat) {
    const byCluster = new Map(); for (const i of rest) { if (isDark(i)) continue; const key = `${shapes[i].cluster}|${phaseOf(i)}|${broken(shapes[i]) ? 1 : 0}`; if (!byCluster.has(key)) byCluster.set(key, []); byCluster.get(key).push(i); }
    for (const list of byCluster.values()) {
      if (list.length < 2) continue;
      const m = new Uint8Array(pn); for (const i of list) for (const q of shapes[i].cells) m[q] = 1;
      const c = components(dilate(m, pw, ph, Math.max(1, rC(JOIN_MM / 2))), pw, ph, 4), by = new Map();
      for (const i of list) { const id = c.labels[shapes[i].cells[0]]; if (!by.has(id)) by.set(id, []); by.get(id).push(i); }
      for (const g of by.values()) if (g.length > 1) for (const i of g) groupOf.set(i, g);
    }
  }
  const order = rest.sort((a, b) => phaseOf(a) - phaseOf(b) || shapes[b].lab[0] - shapes[a].lab[0] || shapes[b].cells.length - shapes[a].cells.length);
  for (const i of order) {
    if (done.has(i)) continue;
    const group = (groupOf.get(i) ?? [i]).filter(j => !done.has(j)); for (const j of group) done.add(j);
    const s = shapes[i], own = group.flatMap(j => shapes[j].cells), phase = phaseOf(i);
    const over = parent[i] >= 0 || fam[i] >= 0, stage = phase === 1 ? 1 : phase === 3 ? 3 : over ? 3 : 1;
    // a dark shape (a window, a doorway) is a wash of dark paint cut to its silhouette; when a finer study follows it is
    // laid a little lighter than the study's dark (the value of a window's bars), and the finest study's darks go over it
    // as touches (the panes), leaving the bars at the wash's value
    const glass = isDark(i) && studies.length > 1 && !MONO; if (glass) for (const j of group) leftDark.add(j);
    const dark = isDark(i), { m, parts } = outlineOf(group, dark ? Math.min(roundFirst, DARK_ROUND_MM) : roundFirst, dark ? null : s.lab[0]); if (!parts.length) continue;
    const loops = parts.flat();
    const what = `study shape ${group.join(' ')}${parent[i] >= 0 ? ` over ${parent[i]}` : fam[i] >= 0 ? ` over the under-wash of ${fam[i]}` : ''}${kids[i].length ? `, carried under ${kids[i].join(' ')}` : ''}`;
    // laid against a neighbour still damp, in the same session, when their values are close and it is not laid over it:
    // the 'beside damp' move (tools/painter/beside-damp.mjs) skips the dry gate and waits only for the neighbour's shine
    const soft = !flat && session && session.stage === stage && [...session.ids].some(o => parent[i] !== o && parent[o] !== i && (s.border.get(o) ?? 0) > 0 && Math.abs(shapes[o].lab[0] - s.lab[0]) <= CLOSE_L);
    if (!soft) close();
    const isBroken = broken(s);
    // a darker shape laid over a lighter one of its hue is a shadow: a transparent cool glaze, even in strength (no load
    // variation), at the study's value
    const shadow = !flat && !MONO && parent[i] >= 0 && stage === 3 && !isDark(i), target = glass ? withL(s.colour, labOf(s.colour, 0, valueRef)[0] + GLASS_LIFT) : isBroken ? s.colour : stepsAfter(what, own, shadow ? cooled(s.colour) : s.colour);
    if (glass) for (const j of group) glassLab.set(j, labOf(target, 0, paperCol));
    const famKey = fam[i] >= 0 ? fam[i] : (() => { let a = i; while (parent[a] >= 0) a = parent[a]; return a; })();
    const hueBand = Math.round(((Math.atan2(labOf(target, 0, paperCol)[2], labOf(target, 0, paperCol)[1]) * 180 / Math.PI + 360) % 360) / SHADOW_HUE_BAND), shadowKey = `${famKey}|${hueBand}`;
    const glaze = shadow ? { base: shadowBase.get(shadowKey) ?? null, scale: SHADOW_CHARGE, onMix: mix => { if (!shadowBase.has(shadowKey)) { const t = mix.reduce((a, v) => a + v, 0) || 1; shadowBase.set(shadowKey, mix.map(v => v / t)); } } } : {};
    // (the fill keeps inside the cut edge, overlapping it by a little: laid over it, the edge was a dark rim round a paler middle)
    const cutKit = dark ? darkKit : washKitMm, cut = !flat && !isBroken && (dark || own.length * cellMm2 >= CUT_FROM_MM2);
    const cutOpts = (loops, parts) => { const eb = dark ? Math.min(...darkKit) : Math.min(CUT_BRUSH_MM, Math.max(...washKitMm)), band = 2 * (eb / 2) * (0.25 + 0.75 * EDGE_PRESS) - 1.4; const inner = new Uint8Array(pn), lm = loopsMask(loops, pw, ph, mmX), er = Math.max(0, rC(band)); const outside = dilate(Uint8Array.from(lm, v => 1 - v), pw, ph, er); for (let q = 0; q < pn; q++) inner[q] = lm[q] && !outside[q] ? 1 : 0; const ip = partLoops(inner, 0.5); return { kit: cutKit, edge: edgeStrokes(loops, eb), parts: ip.length ? ip : parts }; };
    const darkOpts = cut ? cutOpts(loops, parts) : {};
    // a shadow or a dark is built by glazes, never one strong coat: two to four pale glazes, each over the last once it
    // is dry, each a little smaller (the parts of the shape that the finest study shows darker), laid after every
    // first wash so the painter works elsewhere while each dries
    if (!flat && !MONO && !isBroken && (shadow || dark)) {
      const u0 = underMix(own), Lu = filmLab(u0, pigments, paperCol)[0], Lt = labOf(target, 0, valueRef)[0], K = Math.max(1, Math.min(GLAZE_STEPS.length, Math.ceil((Lu - Lt) / GLAZE_STEP_L)));
      const fl = own.map(q => fineL[q]).sort((a, b) => a - b), at = f => fl[Math.min(fl.length - 1, Math.floor(f * fl.length))];
      for (let k = 0; k < K; k++) {
        const cut = k ? at((dark ? GLAZE_STEPS_DARK : GLAZE_STEPS)[k]) : Infinity, cells = own.filter(q => fineL[q] <= cut); if (cells.length * cellMm2 < GLAZE_LEAST_MM2) break;
        const gm = new Uint8Array(pn); for (const q of cells) gm[q] = 1;
        const gp = k ? partLoops(gm, roundFirst, paperMask).filter(l => cellsIn(l).length * cellMm2 >= GLAZE_LEAST_MM2) : parts; if (!gp.length) break;
        const gl = gp.flat(), colour = withL(target, Lu - (Lu - Lt) * (k + 1) / K);
        glazeSteps.push({ k, K, loops: gl, parts: gp, colour, cells, what: `${shadow ? `${what}: a cool shadow` : what}, glaze ${k + 1} of ${K}`, cut: cutOpts(gl, gp), shapes: new Set(group) });
      }
      continue;
    }
    const made = isBroken ? dabMass(stage, what, m, loops, s.colour, own) : [wash(stage, shadow ? `${what}: a cool shadow glaze` : what, loops, target, { own, parts, move: soft ? 'beside damp' : 'wet on dry', grade: !flat && !shadow, ...glaze, ...darkOpts })].filter(Boolean);
    if (!made.length) continue;
    if (soft) softJoins++;
    if (!session) session = { stage, list: [], ids: new Set() };
    session.list.push(...made); for (const j of group) session.ids.add(j);
    // a broken mass's broken darker kids are dropped into it while it is wet
    if (isBroken) for (const c of kids[i]) if (broken(shapes[c]) && !done.has(c)) { const cm = new Uint8Array(pn); for (const q of shapes[c].cells) cm[q] = 1; const cl = maskLoops(cm, ROUND_MM, paperMask); const clm = loopsMask(cl, pw, ph, mmX); for (let q = 0; q < pn; q++) cm[q] &= clm[q]; const kd = dabsOver(cm, 47 + c); const d = kd.length >= 3 && shapes[c].cells.length * cellMm2 >= DARK_DABS_FROM ? wash(2, `study shape ${c} dropped into ${i} in dabs`, cl, shapes[c].colour, { strokes: kd, own: shapes[c].cells, move: 'wet on wet' }) : null; if (d) { session.list.push(d); done.add(c); } }
    if (!isBroken && group.length === 1) { const ex = new Set(under(i)); for (let a = parent[i]; a >= 0; a = parent[a]) ex.add(a); if (fam[i] >= 0) ex.add(fam[i]); session.list.push(...lifeFor(made[0], s.cells, shapes, i, ex, what)); }
  }
  close();
  stagesAt.push({ stage: 'the first washes and the block-in shapes', layers: layers.length });
  // the glazes, step by step: every first glaze, the sheet dried, every second, and so on; glazes of one step that do not
  // touch share a session
  for (let k = 0; k < GLAZE_STEPS.length; k++) {
    let sess = [], mask = new Uint8Array(pn);
    for (const g of glazeSteps.filter(x => x.k === k)) {
      const gm = new Uint8Array(pn); for (const q of g.cells) gm[q] = 1; const near = dilate(gm, pw, ph, rC(1));
      if (near.some((v, q) => v && mask[q])) { if (sess.length) layer(3, sess); sess = []; mask = new Uint8Array(pn); }
      const sh = wash(3, g.what, g.loops, g.colour, { own: g.cells, parts: g.parts, grade: false, ...g.cut });
      if (sh) { sess.push(sh); for (const q of g.cells) mask[q] = 1; glazes++; }
    }
    if (sess.length) layer(3, sess);
    if (glazeSteps.some(x => x.k === k)) stagesAt.push({ stage: `glaze ${k + 1}`, layers: layers.length });
  }
  // the darks left (windows, a doorway) are painted now, in the block-in, from the finest study: its darks inside them as
  // touches, so the panes are laid and the bars and frames between them stay light
  const darkTouched = new Map();
  if (leftDark.size) {
    const g = grids[grids.length - 1], inDark = new Uint8Array(pn); for (let q = 0; q < pn; q++) if (leftDark.has(label[q])) inDark[q] = 1;
    const near = dilate(inDark, pw, ph, rC(0.6)), keep = Uint8Array.from(near, (v, q) => (v && !paperMask[q] ? 0 : 1));
    const base = { L: new Float32Array(pn), A: new Float32Array(pn), B: new Float32Array(pn) };
    for (let q = 0; q < pn; q++) { const i = label[q], t = leftDark.has(i) ? (parent[i] >= 0 ? shapes[parent[i]] : fam[i] >= 0 ? shapes[fam[i]] : null) : shapes[i]; const lab = glassLab.get(i) ?? (t && !t.paper ? t.lab : [100, 0, 0]); base.L[q] = lab[0]; base.A[q] = lab[1]; base.B[q] = lab[2]; }
    const groups = touchesFrom({ grid: g, ref: base, paper: keep, pw, ph, mmX, paperRGB: paperCol, minMm2: 0.8, kit: TOUCH_KIT, salt: 97 }).filter(gr => gr.lab[0] < base.L[gr.cells[0]] - 2);
    const sess = [];
    for (const [j, gr] of groups.entries()) {
      const strokesOf = gr.touches.flatMap(t => t.strokes), loops = maskLoops(footprint(strokesOf), 0.5); if (!loops.length) continue;
      const sh = wash(3, `the darks of study shapes ${[...leftDark].join(' ')} from the finest study, colour ${j + 1}: ${gr.touches.length} touches`, loops, gr.colour, { strokes: strokesOf.map(x => ({ ...x })), own: gr.cells, grade: false });
      if (!sh) continue; sess.push(sh); for (const q of gr.cells) darkTouched.set(q, gr.lab);
    }
    if (sess.length) layer(3, sess);
    stagesAt.push({ stage: 'the darks\' panes', layers: layers.length });
  }
  // the value steps, over the dry first washes: every second strength, then every third, lightest first
  for (const k of [0, 1]) {
    const list = deferredSteps.filter(x => x.k === k).sort((a, b) => labOf(b.colour, 0, paperCol)[0] - labOf(a.colour, 0, paperCol)[0]), sess = [];
    for (const x of list) {
      const m = new Uint8Array(pn); for (const q of x.cells) m[q] = 1;
      const parts = partLoops(m, 2 * ROUND_MM, paperMask).filter(l => cellsIn(l).length * cellMm2 >= MONO_STEP_LEAST); if (!parts.length) continue;
      const sh = wash(3, x.what, parts.flat(), x.colour, { own: x.cells, parts, grade: true, studyLayer: x.studyLayer }); if (sh) sess.push(sh);
    }
    if (sess.length) layer(3, sess);
  }
  perLayer.push({ study: L1.file ?? null, minMm2: L1.minMm2 ?? null, shapes: shapes.length, washes: instructions.filter(q => q.stage !== 2).length, strokes: strokeCount, shift: shifts[0] });

  // what the plan has laid so far, as the study it follows reads: each cell the colour of the shape laid there last
  const refL = new Float32Array(pn), refC = new Float32Array(pn), refA = new Float32Array(pn), refB = new Float32Array(pn);
  for (let q = 0; q < pn; q++) { const f = fam[label[q]], s = (shapes[label[q]].paper || leftDark.has(label[q])) && f >= 0 ? shapes[f] : leftDark.has(label[q]) && parent[label[q]] >= 0 ? shapes[parent[label[q]]] : shapes[label[q]]; refL[q] = s.paper ? 100 : s.lab[0]; refC[q] = s.paper ? 0 : s.chroma; refA[q] = s.paper ? 0 : s.lab[1]; refB[q] = s.paper ? 0 : s.lab[2]; }

  for (const [q, lab] of darkTouched) { refL[q] = lab[0]; refA[q] = lab[1]; refB[q] = lab[2]; refC[q] = Math.hypot(lab[1], lab[2]); }
  // --- later layers: what each richer study adds over the one before ---
  for (let li = 1; li < studies.length; li++) {
    const st = studies[li], minMm2 = st.minMm2 ?? 25, accent = li >= 2, before = { washes: instructions.filter(q => q.stage !== 2).length, strokes: strokeCount };
    if (st.mode === 'glaze') {
      // one glaze per connected dark-and-cool region of the richer study: where it is darker than what is laid, or a
      // little darker and cooler; parts within GLAZE_JOIN_MM joined, smaller than the least size dropped, the largest
      // GLAZE_MOST kept, each one mix (the study's median colour over it), its outline smoothed; the rest of the study ignored
      const g = grids[li], m = new Uint8Array(pn);
      for (let q = 0; q < pn; q++) { if (paperMask[q]) continue; const [l, , b] = labOf(g, q, paperCol), dl = refL[q] - l; if (dl >= ADD_DARKER || (dl >= 2 && refB[q] - b >= GLAZE_COOLER)) m[q] = 1; }
      const joined = roundMask(m, pw, ph, rC(GLAZE_JOIN_MM / 2)); for (let q = 0; q < pn; q++) if (paperMask[q]) joined[q] = 0;
      const pc = components(joined, pw, ph, 4), parts = [];
      for (let id = 1; id <= pc.count; id++) { const cells = []; for (let q = 0; q < pn; q++) if (pc.labels[q] === id) cells.push(q); if (cells.length * cellMm2 >= minMm2) parts.push(cells); }
      parts.sort((a, b) => b.length - a.length); parts.length = Math.min(parts.length, GLAZE_MOST);
      const sess = [];
      parts.forEach((cells, j) => {
        const pm = new Uint8Array(pn); for (const q of cells) pm[q] = 1;
        const loops = maskLoops(pm, 2 * ROUND_MM, paperMask); if (!loops.length) return;
        // its colour: the study's median over the cells that are darker or cooler (not over the gaps the joining closed)
        const dark = cells.filter(q => m[q]), colour = [0, 1, 2].map(c => { const v = dark.map(q => g[q * 3 + c]).sort((a, b) => a - b); return v[v.length >> 1]; }), lab = labOf(colour, 0, paperCol);
        const sh = wash(3, `glaze ${j + 1}: a connected dark-and-cool region of ${st.file ?? `study ${li + 1}`}`, loops, colour, { own: dark, studyLayer: li + 1 });
        if (!sh) return; sess.push(sh);
        for (const q of cells) { refL[q] = Math.min(refL[q], lab[0]); refB[q] = Math.min(refB[q], lab[2]); }
      });
      if (sess.length) layer(3, sess);
      perLayer.push({ study: st.file ?? null, minMm2, mode: 'glaze', shapes: parts.length, washes: instructions.filter(q => q.stage !== 2).length - before.washes, strokes: strokeCount - before.strokes, shift: shifts[li], accent: false });
      continue;
    }
    // touches: each small shape the richer study adds, one mark of the brush chosen by its shape (touch-layer.mjs);
    // touches of one colour are one mix, mixed for what they add over what is laid there; groups that do not touch
    // share a session
    // (the darks of the block-in were laid from the finest study already)
    const keepFor = leftDark.size ? Uint8Array.from(paperMask, (v, q) => (v || leftDark.has(label[q]) ? 1 : 0)) : paperMask;
    const groups = touchesFrom({ grid: grids[li], ref: { L: refL, A: refA, B: refB }, paper: keepFor, pw, ph, mmX, paperRGB: paperCol, minMm2, kit: TOUCH_KIT, salt: li });
    const stage = 4; let sess = [], sessMask = new Uint8Array(pn), touches = 0;
    const flush = () => { if (sess.length) layer(stage, sess); sess = []; sessMask = new Uint8Array(pn); };
    for (const [j, gr] of groups.entries()) {
      const m = new Uint8Array(pn); for (const q of gr.cells) m[q] = 1;
      const near = dilate(m, pw, ph, rC(1.5)); if (sess.length >= SESSION_MOST || gr.cells.some(q => sessMask[q]) || near.some((v, q) => v && sessMask[q])) flush();
      // the passage is where its marks lay paint (their footprints), not the study's cells: charged for the cells, marks that
      // reach past them were spread thin over the extra paper and dried pale
      const strokesOf = gr.touches.flatMap(t => t.strokes), foot = footprint(strokesOf);
      const loops = maskLoops(foot, 0.5); if (!loops.length) continue;
      const names = {}; for (const t of gr.touches) names[t.name] = (names[t.name] ?? 0) + 1;
      const what = `${accent ? 'accents' : 'touches'} from ${st.file ?? `study ${li + 1}`}, colour ${j + 1}: ${Object.entries(names).map(([k, v]) => `${v} ${k}`).join(', ')}`;
      const strokes = strokesOf.map(x => ({ ...x }));
      const sh = wash(stage, what, loops, gr.colour, { strokes, own: gr.cells, studyLayer: li + 1, grade: false });
      if (!sh) continue;
      sh._valuePlan.touchMarks = gr.touches.map(t => ({ name: t.name, what: t.what, cells: t.cells.length }));
      sess.push(sh); touches += gr.touches.length; for (const q of gr.cells) sessMask[q] = 1;
      for (const q of gr.cells) { refL[q] = Math.min(refL[q], gr.lab[0]); refC[q] = Math.max(refC[q], Math.hypot(gr.lab[1], gr.lab[2])); refA[q] = gr.lab[1]; refB[q] = gr.lab[2]; }
    }
    flush();
    stagesAt.push({ stage: `touches from ${st.file ?? `study ${li + 1}`}`, layers: layers.length });
    perLayer.push({ study: st.file ?? null, minMm2, shapes: touches, washes: instructions.filter(q => q.stage !== 2).length - before.washes, strokes: strokeCount - before.strokes, shift: shifts[li], accent });
  }

  const lightsOnSheet = keepOut.length ? loopsMask(keepOut, w, h, cellMm) : new Uint8Array(n), lc = components(lightsOnSheet, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a white shape of the study, left as paper', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const reservedShare = paperMask.reduce((a, v) => a + v, 0) / pn, areas = instructions.filter(q => q.stage !== 2).map(q => q.areaMm2).sort((a, b) => a - b);
  const covered = new Uint8Array(pn); for (let q = 0; q < pn; q++) for (let j = 0; j < k; j++) if (laid[j][q] > 0) { covered[q] = 1; break; }
  const nested = order.filter(i => parent[i] >= 0).length;
  const sheetLabels = new Int32Array(n); for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) sheetLabels[y * w + x] = label[py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0)] + 1; }
  const regions = { source: 'block-in study', labels: sheetLabels, regions: shapes.map((s, i) => ({ id: i + 1, colour: s.colour, paper: s.paper, parent: parent[i] >= 0 ? parent[i] + 1 : null, share: +(s.cells.length / pn).toFixed(4) })) };
  const washes = instructions.filter(q => q.stage !== 2).length;
  const summary = { source: 'study', flat, files: studies.map(st => st.file ?? null), layersOfStudy: perLayer, clusters, shapes: shapes.length, paperShapes: shapes.filter(s => s.paper).length, nested, softJoins, dabbed, stages: byStage.filter(Boolean).length, washesByStage: byStage, mixes: mixes.length, washes, charges, planCellMm: mmX, reservedShare,
    paintedShare: covered.reduce((a, v) => a + v, 0) / pn, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, drawn, stagesAt };
  console.log(`study washes: the wash plan is read from ${studies.length} block-in ${studies.length > 1 ? 'studies' : 'study'} (${studies.map(st => `${st.file ?? '?'}${st.minMm2 ? ` from ${st.minMm2} mm2` : ''}`).join(', ')}), not from the subject (the subject only registers the studies to the sheet${studies[0].registered ? `: ${studies[0].registered}` : ''} and scores the plate; the palette and the drawing are the painter's own as before)${flat ? '; FLAT: plain fills, for comparison' : ''}`);
  perLayer.forEach((pl, li) => console.log(`study washes, layer ${li + 1}${pl.accent ? ' (accents)' : pl.mode === 'glaze' ? ' (connected glazes)' : ''}: ${pl.study}, shapes from ${pl.minMm2 ?? '-'} mm2, registered by ${pl.shift.join(',')} cells: ${pl.washes} washes, ${pl.strokes} strokes`));
  console.log(`study washes: study maker by file name: ${studies.map(st => (/local|seed\d/.test(st.file ?? '') ? 'local image model (mflux)' : 'not named (the RunPod studies carry no tag)')).filter((v, i, a) => a.indexOf(v) === i).join(' and ')}`);
  console.log(`study washes: ${COPY_TEST}`);
  console.log(`study washes: ${clusters} colours, ${shapes.length} block-in shapes (${summary.paperShapes} left as paper, ${(100 * reservedShare).toFixed(1)}% of the sheet); ${washes} washes (${byStage[0]} first, ${byStage[2]} over a lighter wash, ${byStage[3]} accents), ${nested} nested, ${softJoins} laid against a damp neighbour, ${dabbed} in dabs, ${charges} charges, ${glazes} glazes; ${strokeCount} strokes`);
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes, summary, mixes, polygons,
    geometry: 'Washes from a stack of block-in studies, coarse to fine: the block-in\'s flat shapes, each one mix, lightest and largest first, a darker shape of like hue laid over its lighter one (wash within wash), close values laid against each other damp, broken masses in dabs, the darkest small shapes last; each richer study adds only where it is darker or stronger than what is laid. Whites left as paper.' };
}
