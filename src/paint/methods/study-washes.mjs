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
import { kmeans, roundMask } from './layered-washes.mjs';

/** The plan's grid cell (mm). */
const PLAN_MM = 0.5;
/** Colour clusters asked for, and clusters nearer than this (Lab) are one. */
const CLUSTERS = 14, CLUSTER_JOIN = 12;
/** A part smaller than this share of the sheet is a sliver and joins a neighbour. */
const SLIVER_SHARE = 0.004;
/** A small shape this much darker (L*) than the neighbour it would be merged into is kept. */
const KEEP_DARK = 25;
/** Bare paper: a shape at least this light (L*, against the SHEET's colour: on a toned sheet, buff is paper, and a study's
 * white, lighter than the sheet, is paper too) and no more chromatic than this. */
const PAPER_L = 91, PAPER_CHROMA = 7;
/** Outlines are rounded by a brush this wide (mm) and simplified to this tolerance (mm). */
const ROUND_MM = 2, TOL_MM = 0.8;
/** A wash nests on a neighbour at least this much lighter (L*) whose hue is this near (chromaticity over lightness, as a shadow keeps its hue). */
const NEST_LIGHTER = 4, NEST_HUE = 14;
/** ... when their shared border is at least this share of the darker shape's outline. */
const NEST_BORDER = 0.05;
/** Phases: a first wash at least this light; a dark under this L*; a dark is last only when smaller than this share of the sheet. */
const FIRST_L = 55, DARK_L = 40, DARK_SMALL = 0.04;
/** Charges: in a wash of at least this share of the sheet, at most this many, each a dab of a round this wide (mm) at this share of the wash's strength. */
const CHARGE_FROM = 0.03, CHARGE_MOST = 2, CHARGE_BRUSH_MM = 7, CHARGE_STRENGTH = 0.7;
/** A wash is graded top to bottom by this share either side of its mix (A9: every patch a little paler at one end). */
const GRADE = 0.12;
/** A wash is laid this far past its outline to meet its neighbours, never onto bare paper. */
const GROW_MM = 0.4;
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
function studyShapes(rgb, pw, ph, paperRGB, { sliverCells, most = 0 }) {
  const pn = pw * ph, L = new Float32Array(pn), A = new Float32Array(pn), B = new Float32Array(pn);
  for (let q = 0; q < pn; q++) { const [l, a, b] = labOf(rgb, q, paperRGB); L[q] = l; A[q] = a; B[q] = b; }
  // the colours, read off a fixed grid of about 8000 cells
  const step = Math.max(1, Math.round(Math.sqrt(pn / 8000))), rows = [];
  for (let y = 0; y < ph; y += step) for (let x = 0; x < pw; x += step) { const q = y * pw + x; rows.push(L[q], A[q], B[q]); }
  let centres = kmeans(Float32Array.from(rows), 3, CLUSTERS, 20);
  // (a pale tint is never joined to the paper: a cream sail is painted, the white round it is not)
  const paperish = c => c[0] >= PAPER_L && Math.hypot(c[1], c[2]) <= PAPER_CHROMA;
  for (let merged = true; merged;) { merged = false; for (let a = 0; a < centres.length && !merged; a++) for (let b = a + 1; b < centres.length && !merged; b++) if (paperish(centres[a]) === paperish(centres[b]) && Math.hypot(...centres[a].map((v, j) => v - centres[b][j])) < CLUSTER_JOIN) { centres[a] = centres[a].map((v, j) => (v + centres[b][j]) / 2); centres.splice(b, 1); merged = true; } }
  let lab = new Int32Array(pn);
  for (let q = 0; q < pn; q++) { let best = 0, bd = Infinity; centres.forEach((c, f) => { const d = (L[q] - c[0]) ** 2 + (A[q] - c[1]) ** 2 + (B[q] - c[2]) ** 2; if (d < bd) { bd = d; best = f; } }); lab[q] = best; }
  lab = majority(majority(lab, pw, ph), pw, ph);
  // connected parts, each with its cluster, size and borders
  const pc = parts(lab, pw, ph), n = pc.count, root = Int32Array.from({ length: n + 1 }, (_, i) => i), size = new Float64Array(n + 1), cluster = new Int32Array(n + 1);
  const border = Array.from({ length: n + 1 }, () => new Map());
  for (let q = 0; q < pn; q++) { const id = pc.labels[q]; size[id]++; cluster[id] = lab[q]; const x = q % pw;
    for (const j of [x < pw - 1 ? q + 1 : -1, q + pw < pn ? q + pw : -1]) { if (j < 0) continue; const o = pc.labels[j]; if (o !== id) { border[id].set(o, (border[id].get(o) ?? 0) + 1); border[o].set(id, (border[o].get(id) ?? 0) + 1); } } }
  // a small shape much darker than the one it would join is kept (darks carry the drawing: windows, a doorway), if it is
  // at least a sixth of the least size
  const keepDark = (i, into) => size[i] >= sliverCells / 6 && centres[cluster[into]][0] - centres[cluster[i]][0] >= KEEP_DARK;
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
      if (best > 0 && keepDark(i, best)) { kept.add(i); continue; }
      if (best > 0) { join(i, best); done = true; break; }
    }
    if (!done) break;
  }
  const ids = new Map(), label = new Int32Array(pn), shapes = [];
  for (let q = 0; q < pn; q++) { const r = find(pc.labels[q]); if (!ids.has(r)) { ids.set(r, shapes.length); const c = centres[cluster[r]]; shapes.push({ root: r, cells: [], lab: c, chroma: Math.hypot(c[1], c[2]), border: new Map(), rim: 0 }); } label[q] = ids.get(r); shapes[label[q]].cells.push(q); }
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
const BROKEN_HUE = [95, 170], BROKEN_LOST = 0.15, BROKEN_LEAST = 0.002, BROKEN_MOST = 0.08;
/** Foliage dabs: a round about this share of the sheet's width; dabs this many brush widths apart; the darker value's share of the dabs and its strength. */
const DAB_SHARE = 0.025, DAB_PITCH = 0.8, DAB_DARK_SHARE = 0.35, DAB_DARK = 1.6;
/** Dabs vary in size between these shares of the brush; they come in clusters this many cells across, this share of the clusters left out as paper. */
const DAB_SIZE = [0.55, 1.25], DAB_CLUSTER = 3, DAB_GAPS = 0.2;
/** Close values: a wash is laid against a neighbour still damp (one session, a soft edge) when their L* differ by no more than this. */
const CLOSE_L = 8;
/** Load along a wash: the brush starts loaded at this share over the mix and is thinned to this share under it before each recharge, every this many strokes. */
const LOAD_HIGH = 0.18, LOAD_EVERY = 3;
/** A later layer adds a shape where its study is at least this much darker (L*) than what is laid there, or this much more chromatic. */
const ADD_DARKER = 6, ADD_CHROMA = 8;
/** An accent layer (the third and after) adds only what is this much darker, at most this many shapes. */
const ACCENT_DARKER = 14, ACCENT_MOST = 24;
/** Glazes of one layer that do not touch are laid in one session (the sheet dried after it), at most this many. */
const SESSION_MOST = 10;
/** A glaze layer (FILE:MIN:glaze): a cell joins a glaze when the study is a little darker and this much cooler (b*) than what is laid; parts within this (mm) are one; at most this many glazes. */
const GLAZE_COOLER = 6, GLAZE_JOIN_MM = 4, GLAZE_MOST = 6;
/** A shadow glaze is moved this much cooler (b*) than the study's shadow colour (a cast shadow on a warm wall reads violet-grey). */
const SHADOW_COOL = 10;
/** The block-in (the first layer) has at most this many shapes. */
const FIRST_MOST = 16;

// `inkValue`: the subject's value map the pen's line choice reads, as with the other plan (the drawing is the painter's
// own as before); the washes never read it.
// `studies`: the stack, coarse to fine: [{rgb (w x h x 3), file, minMm2, mode}] (mode 'glaze': a few connected glazes
// from that study instead of every shape it adds). `flat`: every shape one flat fill of its own,
// butted, no nesting, charging, load, soft edges or dabs (for comparison only).
export function planStudyWashes({ k, w, h, studies, flat = false, density = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], subject = null, shaped = true, drawn = false, inkValue = null }) {
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
    const r = roundMask(m, pw, ph, rC(roundMm / 2)); if (avoid) for (let q = 0; q < pn; q++) if (avoid[q] && !m[q]) r[q] = 0;
    const c = components(r, pw, ph, 4), loops = []; for (let id = 1; id <= c.count; id++) loops.push(...loopsFor(c.labels, id));
    return loops;
  };

  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], polygons = [], byStage = [0, 0, 0, 0], perLayer = []; let strokeCount = 0, charges = 0, dabbed = 0, softJoins = 0;
  const STAGE = ['', 'first wash', 'charge', 'wash over', 'accent'];
  const underMix = cells => { const u = new Array(k).fill(0); for (const q of cells) for (let j = 0; j < k; j++) u[j] += laid[j][q] / cells.length; return u; };
  const cellsIn = loops => { const m = loopsMask(loops, pw, ph, mmX), out = []; for (let q = 0; q < pn; q++) if (m[q]) out.push(q); return out; };
  let keepOut = [];
  // a colour moved cooler at the same L*: b* toward blue by SHADOW_COOL, a* a little toward violet (Lab against the paper)
  const cooled = rgb => { const [L, a, b] = labOf(rgb, 0, paperCol); return labToRgb([L, a + SHADOW_COOL / 4, b - SHADOW_COOL], paperCol); };
  // A study's shapes and values are trusted more than its hues (an image model drifts a brown drawing to pink): the mix
  // is the palette's nearest to the study's colour (mixFor / mixOver: the painter's own pigments), its strength then set
  // so the film over what is laid reaches the study's VALUE (L*). The hue follows only as far as the palette allows.
  const valueMix = (colour, u) => {
    const fresh = u.every(v => v <= 1e-9), base = fresh ? mixFor(colour, pigments, paperCol) : mixOver(colour, u, pigments, paperCol);
    if (!(base.reduce((a, v) => a + v, 0) > 1e-9)) return base;
    const want = labOf(colour, 0, paperCol)[0], Lat = t => filmLab(u.map((v, j) => v + t * base[j]), pigments, paperCol)[0];
    let lo = 0.05, hi = 8; if (Lat(hi) > want) return base.map(v => v * hi); if (Lat(lo) < want) return base.map(v => v * lo);
    for (let it = 0; it < 11; it++) { const mid = Math.sqrt(lo * hi); if (Lat(mid) > want) lo = mid; else hi = mid; }
    return base.map(v => v * Math.sqrt(lo * hi));
  };
  // One wash: `colour` is what its own cells are to read as over what is laid there (or, with `amounts`, the mix itself).
  const wash = (stage, what, loops, colour, { strokes = null, amounts = null, own = null, move = 'wet on dry', grade = !flat, studyLayer = 1 } = {}) => {
    if (!loops.length) return null;
    const cells = cellsIn(loops); if (!cells.length) return null;
    const u = underMix(own?.length ? own : cells);
    const mix = amounts ?? valueMix(colour, u), strength = mix.reduce((a, v) => a + v, 0);
    if (!(strength > 1e-6)) return null;
    if (stage !== 2 && filmLab(u, pigments, paperCol)[0] - filmLab(u.map((v, j) => v + mix[j]), pigments, paperCol)[0] < VISIBLE_STEP) return null;
    const fill = strokes ? { strokes, brushMm: Math.max(...strokes.map(s => 2 * s.radiusMm)), depthMm: 0, uncovered: 0 } : laneFill(loops, { kitMm: washKitMm, growMm: GROW_MM, keepOut });
    if (!fill.strokes.length) return null;
    // the load along the wash: each load starts strong and is thinned before the next recharge, and the wash as a whole
    // grades a little from its first strokes (the top) to its last
    if (grade && !strokes && fill.strokes.length > 1) {
      const raw = fill.strokes.map((_, q) => (1 + GRADE * (1 - 2 * q / (fill.strokes.length - 1))) * (1 + LOAD_HIGH * (1 - 2 * (q % LOAD_EVERY) / Math.max(1, LOAD_EVERY - 1)))), mean = raw.reduce((a, v) => a + v, 0) / raw.length;
      fill.strokes.forEach((st, q) => { st.charge = +(raw[q] / mean).toFixed(3); });
    }
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
    const m = new Uint8Array(pn); for (const q of shape.cells) m[q] = 1; const o = roundMask(m, pw, ph, rC(2)); let kept = 0; for (const q of shape.cells) kept += o[q];
    return 1 - kept / c >= BROKEN_LOST;
  };
  // a hash of a grid point, 0..1, fixed to the sheet (no picture is read)
  const hash = (a, b, c = 0) => { let x = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const dabBrush = [...washKitMm].sort((a, b) => Math.abs(a - DAB_SHARE * sheetWidthMm) - Math.abs(b - DAB_SHARE * sheetWidthMm))[0], dr = dabBrush / 2;
  // loose dabs of a round over a mask, fixed to the sheet (a hash, no picture read): in clusters, some clusters left out
  // as gaps of paper; each dab its own size (DAB_SIZE times the brush), angle, length and place within its cell
  const dabsOver = (m, salt, keep = 1) => {
    const pitch = DAB_PITCH * dabBrush, strokes = [], cl = DAB_CLUSTER;
    for (let gy = 0; gy * pitch < ph * mmX; gy++) for (let gx = 0; gx * pitch < pw * mmX; gx++) {
      if (hash(Math.floor(gx / cl), Math.floor(gy / cl), salt + 5) < DAB_GAPS || hash(gx, gy, salt + 7) > keep) continue;
      const cx = (gx + 0.5 + 0.9 * (hash(gx, gy, salt) - 0.5)) * pitch, cy = (gy + 0.5 + 0.9 * (hash(gx, gy, salt + 1) - 0.5)) * pitch;
      const q = Math.min(ph - 1, Math.floor(cy / mmX)) * pw + Math.min(pw - 1, Math.floor(cx / mmX)); if (!m[q]) continue;
      const r = dr * (DAB_SIZE[0] + (DAB_SIZE[1] - DAB_SIZE[0]) * hash(gx, gy, salt + 4));
      const a = Math.PI * hash(gx, gy, salt + 2), len = r * (0.2 + 1.2 * hash(gx, gy, salt + 3)), ux = Math.cos(a) * len / 2, uy = Math.sin(a) * len / 2;
      strokes.push({ kind: 'sweep', radiusMm: +r.toFixed(3), points: [[cx - ux, cy - uy, .5], [cx, cy, 1], [cx + ux, cy + uy, .5]].map(p => p.map(v => +v.toFixed(3))) });
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
    const strokes = [{ kind: 'sweep', radiusMm: cb, points: [[cx - cb * .3, cy, .6], [cx, cy, 1], [cx + cb * .3, cy, .6]].map(p => p.map(v => +v.toFixed(3))) }];
    const disc = { points: Array.from({ length: 16 }, (_, t) => [cx + cb * 1.3 * Math.cos(t * Math.PI / 8), cy + cb * Math.sin(t * Math.PI / 8)]), soft: new Array(16).fill(true) };
    const own = mixFor(colour, pigments, paperCol), ot = own.reduce((a, v) => a + v, 0) || 1, amounts = own.map(v => v / ot * CHARGE_STRENGTH * washSh.amount);
    const ch = wash(2, what, [disc], colour, { strokes, amounts, move: 'wet on wet' }); if (ch) charges++;
    return ch;
  };
  // in a larger wash, a warmer and a cooler neighbour's mix dropped in while it is wet
  const lifeFor = (sh, cells, shapesOf, idx, exclude, what) => {
    if (flat || cells.length < CHARGE_FROM * pn) return [];
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
  const dabMass = (stage, what, m, loops, colour, own) => {
    const light = dabsOver(m, 11), sh = light.length ? wash(stage, `${what}, in loose dabs`, loops, colour, { strokes: light, own }) : null;
    if (!sh) return [];
    const dark = dabsOver(m, 29, DAB_DARK_SHARE), out = [sh];
    if (dark.length) { const d = wash(2, `${what}: darker dabs dropped in`, loops, colour, { strokes: dark, amounts: sh.mix.map(v => v * (DAB_DARK - 1)), move: 'wet on wet' }); if (d) out.push(d); }
    dabbed++;
    return out;
  };

  // --- layer 1: the block-in ---
  const L1 = studies[0], first = studyShapes(grids[0], pw, ph, paperCol, { sliverCells: Math.max(SLIVER_SHARE * pn, (L1.minMm2 ?? 0) / cellMm2), most: FIRST_MOST });
  const { label, shapes, clusters } = first;
  const parent = flat ? shapes.map(() => -1) : nestParents(shapes);
  const kids = shapes.map(() => []); parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const under = i => { const out = [i]; for (let q = 0; q < out.length; q++) out.push(...kids[out[q]]); return out; };
  const paperMask = Uint8Array.from(label, s => (shapes[s].paper ? 1 : 0));
  { const pr = roundMask(paperMask, pw, ph, rC(ROUND_MM / 2)), pc = components(pr, pw, ph, 4); for (let id = 1; id <= pc.count; id++) keepOut.push(...loopsFor(pc.labels, id)); }
  const outlineOf = i => { const m = new Uint8Array(pn); for (const s of under(i)) for (const q of shapes[s].cells) m[q] = 1; return { m, loops: maskLoops(m, ROUND_MM, paperMask) }; };
  const painted = shapes.map((s, i) => i).filter(i => !shapes[i].paper);
  const share = i => under(i).reduce((a, s) => a + shapes[s].cells.length, 0) / pn;
  const phaseOf = i => { const s = shapes[i]; if (s.lab[0] < DARK_L && share(i) < DARK_SMALL) return 3; return parent[i] < 0 && s.lab[0] >= FIRST_L ? 1 : 2; };
  const lightest = Math.max(-Infinity, ...painted.map(i => shapes[i].lab[0]));
  const opener = painted.filter(i => phaseOf(i) === 1 && shapes[i].lab[0] >= lightest - 8).sort((a, b) => share(b) - share(a))[0];
  const order = painted.sort((a, b) => (a === opener ? -1 : b === opener ? 1 : phaseOf(a) - phaseOf(b) || shapes[b].lab[0] - shapes[a].lab[0] || shapes[b].cells.length - shapes[a].cells.length));
  // the session open now: its stage, its shapes, the study shapes in it (a close-valued neighbour may join it while damp)
  let session = null;
  const close = () => { if (session) layer(session.stage, session.list); session = null; };
  const done = new Set();
  for (const i of order) {
    if (done.has(i)) continue;
    const s = shapes[i], phase = phaseOf(i), stage = phase === 1 ? 1 : phase === 3 ? 4 : parent[i] >= 0 ? 3 : 1;
    const { m, loops } = outlineOf(i); if (!loops.length) continue;
    const what = `study shape ${i}${parent[i] >= 0 ? ` over ${parent[i]}` : ''}${kids[i].length ? `, carried under ${kids[i].join(' ')}` : ''}`;
    // laid against a neighbour still damp, in the same session, when their values are close and it is not laid over it:
    // the 'beside damp' move (tools/painter/beside-damp.mjs) skips the dry gate and waits only for the neighbour's shine
    const soft = !flat && session && session.stage === stage && [...session.ids].some(o => parent[i] !== o && parent[o] !== i && (s.border.get(o) ?? 0) > 0 && Math.abs(shapes[o].lab[0] - s.lab[0]) <= CLOSE_L);
    if (!soft) close();
    const isBroken = broken(s);
    // a darker shape laid over a lighter one of its hue is a shadow: a transparent cool glaze, even in strength (no load
    // variation), at the study's value
    const shadow = !flat && parent[i] >= 0 && stage === 3, target = shadow ? cooled(s.colour) : s.colour;
    const made = isBroken ? dabMass(stage, what, m, loops, s.colour, s.cells) : [wash(stage, shadow ? `${what}: a cool shadow glaze` : what, loops, target, { own: s.cells, move: soft ? 'beside damp' : 'wet on dry', grade: !flat && !shadow })].filter(Boolean);
    if (!made.length) continue;
    if (soft) softJoins++;
    if (!session) session = { stage, list: [], ids: new Set() };
    session.list.push(...made); session.ids.add(i);
    // a broken mass's broken darker kids are dropped into it while it is wet
    if (isBroken) for (const c of kids[i]) if (broken(shapes[c])) { const cm = new Uint8Array(pn); for (const q of shapes[c].cells) cm[q] = 1; const cl = maskLoops(cm, ROUND_MM, paperMask); const d = wash(2, `study shape ${c} dropped into ${i} in dabs`, cl, shapes[c].colour, { strokes: dabsOver(cm, 47 + c), own: shapes[c].cells, move: 'wet on wet' }); if (d) { session.list.push(d); done.add(c); } }
    if (!isBroken) { const ex = new Set(under(i)); for (let a = parent[i]; a >= 0; a = parent[a]) ex.add(a); session.list.push(...lifeFor(made[0], s.cells, shapes, i, ex, what)); }
  }
  close();
  perLayer.push({ study: L1.file ?? null, minMm2: L1.minMm2 ?? null, shapes: shapes.length, washes: instructions.filter(q => q.stage !== 2).length, strokes: strokeCount, shift: shifts[0] });

  // what the plan has laid so far, as the study it follows reads: each cell the colour of the shape laid there last
  const refL = new Float32Array(pn), refC = new Float32Array(pn), refB = new Float32Array(pn);
  for (let q = 0; q < pn; q++) { const s = shapes[label[q]]; refL[q] = s.paper ? 100 : s.lab[0]; refC[q] = s.paper ? 0 : s.chroma; refB[q] = s.paper ? 0 : s.lab[2]; }

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
    // outlines smoothed in proportion to the least size (a larger least size, a looser outline)
    const roundMm = Math.min(8, Math.sqrt(minMm2) / 2);
    const got = studyShapes(grids[li], pw, ph, paperCol, { sliverCells: Math.max(4, minMm2 / cellMm2) });
    const adds = [];
    got.shapes.forEach((s, i) => {
      if (s.paper || s.cells.length * cellMm2 < minMm2) return;
      let L = 0, C = 0; for (const q of s.cells) { L += refL[q]; C += refC[q]; } L /= s.cells.length; C /= s.cells.length;
      const darker = L - s.lab[0], stronger = s.chroma - C;
      if (accent ? darker >= ACCENT_DARKER : darker >= ADD_DARKER || (stronger >= ADD_CHROMA && darker >= -2)) adds.push({ i, s, darker });
    });
    if (accent) { adds.sort((a, b) => b.darker - a.darker); adds.length = Math.min(adds.length, ACCENT_MOST); }
    // lighter glazes first, then darker; glazes that do not touch share a session
    adds.sort((a, b) => b.s.lab[0] - a.s.lab[0] || b.s.cells.length - a.s.cells.length);
    const stage = accent ? 4 : 3; let sess = [], sessIds = new Set();
    const flush = () => { if (sess.length) layer(stage, sess); sess = []; sessIds = new Set(); };
    for (const { i, s } of adds) {
      if (sessIds.size >= SESSION_MOST || [...sessIds].some(o => s.border.has(o))) flush();
      const m = new Uint8Array(pn); for (const q of s.cells) m[q] = 1;
      const loops = maskLoops(m, roundMm, paperMask); if (!loops.length) continue;
      const what = `${accent ? 'accent' : 'glaze'} from ${st.file ?? `study ${li + 1}`} shape ${i}`;
      const made = broken(s) ? dabMass(stage, what, m, loops, s.colour, s.cells) : [wash(stage, what, loops, s.colour, { own: s.cells, studyLayer: li + 1 })].filter(Boolean);
      if (!made.length) continue;
      if (!accent) made.push(...lifeFor(made[0], s.cells, got.shapes, i, new Set(), what));
      sess.push(...made); sessIds.add(i);
      for (const q of s.cells) { refL[q] = Math.min(refL[q], s.lab[0]); refC[q] = Math.max(refC[q], s.chroma); }
    }
    flush();
    perLayer.push({ study: st.file ?? null, minMm2, shapes: got.shapes.length, washes: instructions.filter(q => q.stage !== 2).length - before.washes, strokes: strokeCount - before.strokes, shift: shifts[li], accent });
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
    paintedShare: covered.reduce((a, v) => a + v, 0) / pn, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, drawn };
  console.log(`study washes: the wash plan is read from ${studies.length} block-in ${studies.length > 1 ? 'studies' : 'study'} (${studies.map(st => `${st.file ?? '?'}${st.minMm2 ? ` from ${st.minMm2} mm2` : ''}`).join(', ')}), not from the subject (the subject only registers the studies to the sheet${studies[0].registered ? `: ${studies[0].registered}` : ''} and scores the plate; the palette and the drawing are the painter's own as before)${flat ? '; FLAT: plain fills, for comparison' : ''}`);
  perLayer.forEach((pl, li) => console.log(`study washes, layer ${li + 1}${pl.accent ? ' (accents)' : pl.mode === 'glaze' ? ' (connected glazes)' : ''}: ${pl.study}, shapes from ${pl.minMm2 ?? '-'} mm2, registered by ${pl.shift.join(',')} cells: ${pl.washes} washes, ${pl.strokes} strokes`));
  console.log(`study washes: ${clusters} colours, ${shapes.length} block-in shapes (${summary.paperShapes} left as paper, ${(100 * reservedShare).toFixed(1)}% of the sheet); ${washes} washes (${byStage[0]} first, ${byStage[2]} over a lighter wash, ${byStage[3]} accents), ${nested} nested, ${softJoins} laid against a damp neighbour, ${dabbed} in dabs, ${charges} charges; ${strokeCount} strokes`);
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes, summary, mixes, polygons,
    geometry: 'Washes from a stack of block-in studies, coarse to fine: the block-in\'s flat shapes, each one mix, lightest and largest first, a darker shape of like hue laid over its lighter one (wash within wash), close values laid against each other damp, broken masses in dabs, the darkest small shapes last; each richer study adds only where it is darker or stronger than what is laid. Whites left as paper.' };
}
