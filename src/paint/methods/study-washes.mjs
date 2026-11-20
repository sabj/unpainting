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
// 4. In the larger washes, a neighbour's mix is dropped in while wet at one or two places (round dabs).
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
/** Bare paper: a shape at least this light (L*, against the paper) and no more chromatic than this. */
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
 * `rgb` is the study on that grid. Exported for its test.
 */
export function studyShapes(rgb, pw, ph, paperRGB, { sliverCells }) {
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
      if (best > 0) { join(i, best); changed = true; }
    }
    for (let i = 1; i <= n; i++) { if (find(i) !== i) continue; for (const [o] of [...border[i]]) { const oc = find(o); if (oc !== i && cluster[oc] === cluster[i] && find(i) === i) { join(oc, i); changed = true; } } }
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

/** Chromaticity over lightness: a shadow on a thing keeps it, darker and greyer in proportion. */
const tint = ([L, a, b]) => { const l = Math.max(20, L); return [60 * a / l, 60 * b / l]; };

/**
 * For each shape, the lighter shape of like hue it is laid over (its wash carried on under this one), or -1.
 * Exported for its test.
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

// `inkValue`: the subject's value map the pen's line choice reads, as with the other plan (the drawing is the painter's
// own as before); the washes never read it.
export function planStudyWashes({ k, w, h, study, density = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], subject = null, shaped = true, drawn = false, inkValue = null }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (!study?.rgb || study.rgb.length !== n * 3) throw Error('the study wash plan needs the study registered to the sheet (w x h x 3)');
  if (pigments.length !== k || k < 1) throw Error('the wash plan needs the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  const pw = Math.max(1, Math.round(sheetWidthMm / Math.max(PLAN_MM, cellMm))), ph = Math.max(1, Math.round(h * pw / w)), pn = pw * ph, mmX = sheetWidthMm / pw;
  const grid = toGrid(study.rgb, w, h, pw, ph);
  const { label, shapes, clusters } = studyShapes(grid, pw, ph, paperCol, { sliverCells: SLIVER_SHARE * pn });
  const parent = nestParents(shapes);
  const kids = shapes.map(() => []); parent.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
  const under = i => { const out = [i]; for (let q = 0; q < out.length; q++) out.push(...kids[out[q]]); return out; };
  const paperMask = Uint8Array.from(label, s => (shapes[s].paper ? 1 : 0)), rC = mm => Math.max(1, Math.round(mm / mmX));
  const paperRound = roundMask(paperMask, pw, ph, rC(ROUND_MM / 2)), keepOut = [];
  { const pc = components(paperRound, pw, ph, 4); for (let id = 1; id <= pc.count; id++) keepOut.push(...loopsFor(pc.labels, id)); }
  function loopsFor(labels, id) {
    let x0 = pw, y0 = ph, x1 = -1, y1 = -1;
    for (let q = 0; q < labels.length; q++) if (labels[q] === id) { const x = q % pw, y = (q / pw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? [] : outlineLoops(labels, id, { x0, y0, x1, y1 }, pw, ph, { cellMm: mmX, tolMm: TOL_MM });
  }
  // a wash's outline: the shape and every shape nested on it, rounded as a brush lays it
  const outlineOf = i => {
    const m = new Uint8Array(pn); for (const s of under(i)) for (const q of shapes[s].cells) m[q] = 1;
    const r = roundMask(m, pw, ph, rC(ROUND_MM / 2)); for (let q = 0; q < pn; q++) if (paperMask[q] && !m[q]) r[q] = 0;
    const c = components(r, pw, ph, 4), loops = []; for (let id = 1; id <= c.count; id++) loops.push(...loopsFor(c.labels, id));
    return loops;
  };
  // the order: phase (first washes, then nested and middle washes, then the darkest small shapes), lightest first in each;
  // the largest of the lightest shapes opens the painting (the sky or the biggest band)
  const painted = shapes.map((s, i) => i).filter(i => !shapes[i].paper);
  const share = i => under(i).reduce((a, s) => a + shapes[s].cells.length, 0) / pn;
  const phaseOf = i => { const s = shapes[i]; if (s.lab[0] < DARK_L && share(i) < DARK_SMALL) return 3; return parent[i] < 0 && s.lab[0] >= FIRST_L ? 1 : 2; };
  const lightest = Math.max(-Infinity, ...painted.map(i => shapes[i].lab[0]));
  const opener = painted.filter(i => phaseOf(i) === 1 && shapes[i].lab[0] >= lightest - 8).sort((a, b) => share(b) - share(a))[0];
  const order = painted.sort((a, b) => (a === opener ? -1 : b === opener ? 1 : phaseOf(a) - phaseOf(b) || shapes[b].lab[0] - shapes[a].lab[0] || shapes[b].cells.length - shapes[a].cells.length));

  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], polygons = [], byStage = [0, 0, 0, 0]; let strokeCount = 0;
  const STAGE = ['', 'first wash', 'charge', 'wash over', 'dark'];
  const underMix = cells => { const u = new Array(k).fill(0); for (const q of cells) for (let j = 0; j < k; j++) u[j] += laid[j][q] / cells.length; return u; };
  const cellsIn = loops => { const m = loopsMask(loops, pw, ph, mmX), out = []; for (let q = 0; q < pn; q++) if (m[q]) out.push(q); return out; };
  // One wash: `colour` is what its own shape is to read as over what is laid there (or, with `amounts`, the mix itself).
  const wash = (stage, what, loops, colour, { strokes = null, amounts = null, own = null, move = 'wet on dry' } = {}) => {
    if (!loops.length) return null;
    const cells = cellsIn(loops); if (!cells.length) return null;
    const u = underMix(own?.length ? own : cells);
    const mix = amounts ?? (u.every(v => v <= 1e-9) ? mixFor(colour, pigments, paperCol) : mixOver(colour, u, pigments, paperCol)), strength = mix.reduce((a, v) => a + v, 0);
    if (!(strength > 1e-6)) return null;
    if (stage !== 2 && filmLab(u, pigments, paperCol)[0] - filmLab(u.map((v, j) => v + mix[j]), pigments, paperCol)[0] < VISIBLE_STEP) return null;
    const fill = strokes ? { strokes, brushMm: Math.max(...strokes.map(s => 2 * s.radiusMm)), depthMm: 0, uncovered: 0 } : laneFill(loops, { kitMm: washKitMm, growMm: GROW_MM, keepOut });
    if (!fill.strokes.length) return null;
    // graded: the first strokes (the top of the wash) a little stronger, water added at each recharge
    if (!strokes && fill.strokes.length > 1) fill.strokes.forEach((st, q) => { st.charge = +(1 + GRADE * (1 - 2 * q / (fill.strokes.length - 1))).toFixed(3); });
    for (const q of cells) for (let j = 0; j < k; j++) laid[j][q] += mix[j];
    const sm = loopsMask(loops, w, h, cellMm), ids = new Uint8Array(n), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
    for (let i = 0; i < n; i++) if (sm[i]) { ids[i] = 1; area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    if (!area) return null;
    const mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage });
    const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...mix]; sh.graded = null; sh._follow = true; sh.firstWash = stage <= 2; sh._opening = 1; sh.dryAfter = stage !== 2;
    const areaMm2 = cells.length * mmX * mmX, phase = stage <= 2 ? 'light' : stage === 3 ? 'mid' : 'shadow';
    let rim = 0; for (const l of loops) for (let v = 0; v < l.points.length; v++) { const P = l.points[v], Q = l.points[(v + 1) % l.points.length]; rim += Math.hypot(Q[0] - P[0], Q[1] - P[1]); }
    strokeCount += fill.strokes.length;
    const wet = move === 'wet on wet';
    const intent = { id: `${phase}/s${stage}/m${mixId}/${STAGE[stage].replace(' ', '-')}`, phase, colour: colour.map(Math.round), valueBand: stage, stage, mixId, thing: what, kind: STAGE[stage], areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: false,
      referenceCue: ['', 'A flat shape of the block-in study, its wash carried on under the darker shapes of like hue on it.', 'A neighbour\'s mix dropped into the wet wash.', 'A darker shape of the study laid over the dry wash under it.', 'One of the study\'s darkest small shapes, last.'][stage],
      intendedResult: ['', 'The study\'s flat colour, pale and connected.', 'The wash varied while wet, blended by the water.', 'The study\'s darker shape over its lighter one.', 'The darkest accents.'][stage], cool: stage === 1 && colour[2] > colour[0] + 10,
      shaped, subject, move, paperBefore: wet ? 'wet: the wash just laid' : 'fully dry; own same-passage wet overlap allowed', baseBefore: wet ? 'wet' : 'fully dry',
      brush: { kind: 'the smallest wash brush of the kit that lays the shape in a few lanes along its long axis, a smaller one in what they leave', contact: 'side/belly', width: 'each stroke names its brush', widthMm: fill.brushMm },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: wet ? .88 : .62, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: wet ? 'soft: dropped into a wet wash' : 'hard: the edge is where the strokes end' },
      outline: loops, strokes: fill.strokes, softEdges: [], depthMm: +(fill.depthMm ?? 0).toFixed(1), uncoveredShare: +(fill.uncovered ?? 0).toFixed(4), widestBrushMm: fill.brushMm,
      protectedLights: ['the study\'s white shapes, left as paper'], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the shape' };
    sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind: STAGE[stage], colour, loops });
    byStage[stage - 1]++;
    return sh;
  };
  const VALUE = [0, 1, 1, 3, 5];
  const layer = (stage, list) => { if (!list.length) return; const area = list.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0); for (const s of list) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; }); const t = mix.reduce((a, v) => a + v, 0) || 1; layers.push({ value: VALUE[stage], pigment: mix.indexOf(Math.max(...mix)), mixId: list[0]._valuePlan.mixId, shapes: list, mix: mix.map(v => v / t), amount: list.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: stage <= 2 ? 'ground' : stage === 3 ? 'mid' : 'dark', region: 0, shoot: true }, _valuePhase: list[0]._valuePlan.phase }); };

  const cb = CHARGE_BRUSH_MM / 2; let charges = 0;
  for (const i of order) {
    const s = shapes[i], phase = phaseOf(i), stage = phase === 1 ? 1 : phase === 3 ? 4 : parent[i] >= 0 ? 3 : 1;
    const loops = outlineOf(i); if (!loops.length) continue;
    const sh = wash(stage, `study shape ${i}${parent[i] >= 0 ? ` over ${parent[i]}` : ''}${kids[i].length ? `, carried under ${kids[i].join(' ')}` : ''}`, loops, s.colour, { own: s.cells });
    if (!sh) continue;
    const session = [sh];
    // a little life: in a larger wash, a neighbour's mix dropped in while wet, near where that neighbour lies
    if (share(i) >= CHARGE_FROM) {
      const mine = new Uint8Array(pn); for (const q of s.cells) mine[q] = 1;
      const inside = []; { const r = rC(cb + 1); for (const q of s.cells) { const x = q % pw, y = (q / pw) | 0; let ok = true; for (let d = -r; d <= r && ok; d += Math.max(1, r >> 1)) for (const [xx, yy] of [[x + d, y - r], [x + d, y + r], [x - r, y + d], [x + r, y + d]]) if (xx < 0 || yy < 0 || xx >= pw || yy >= ph || !mine[yy * pw + xx]) { ok = false; break; } if (ok) inside.push(q); } }
      // (not a shape nested in it or one it is nested in: those are its own washes)
      const desc = new Set(under(i)); for (let a = parent[i]; a >= 0; a = parent[a]) desc.add(a);
      const near = [...s.border].filter(([o]) => !shapes[o].paper && !desc.has(o)).sort((a, b) => b[1] - a[1]), picked = [];
      for (const [o] of near) {
        if (picked.length >= CHARGE_MOST || !inside.length) break;
        // the interior point nearest the neighbour
        const theirs = shapes[o].cells; let best = -1, bd = Infinity;
        for (let t = 0; t < inside.length; t += Math.max(1, inside.length >> 9)) { const q = inside[t], x = q % pw, y = (q / pw) | 0; for (let u = 0; u < theirs.length; u += Math.max(1, theirs.length >> 7)) { const p = theirs[u], d = (p % pw - x) ** 2 + (((p / pw) | 0) - y) ** 2; if (d < bd) { bd = d; best = q; } } }
        if (best < 0 || picked.some(p => Math.hypot(p % pw - best % pw, ((p / pw) | 0) - ((best / pw) | 0)) * mmX < 6 * cb)) continue;
        picked.push(best);
        const cx = (best % pw + .5) * mmX, cy = (((best / pw) | 0) + .5) * mmX;
        const strokes = [{ kind: 'sweep', radiusMm: cb, points: [[cx - cb * .3, cy, .6], [cx, cy, 1], [cx + cb * .3, cy, .6]].map(p => p.map(v => +v.toFixed(3))) }];
        const disc = { points: Array.from({ length: 16 }, (_, t) => [cx + cb * 1.3 * Math.cos(t * Math.PI / 8), cy + cb * Math.sin(t * Math.PI / 8)]), soft: new Array(16).fill(true) };
        const own = mixFor(shapes[o].colour, pigments, paperCol), ot = own.reduce((a, v) => a + v, 0) || 1, amounts = own.map(v => v / ot * CHARGE_STRENGTH * sh.amount);
        const ch = wash(2, `charge of shape ${o}'s mix in shape ${i}`, [disc], shapes[o].colour, { strokes, amounts, move: 'wet on wet' });
        if (ch) { session.push(ch); charges++; }
      }
    }
    layer(stage, session);
  }

  const lightsOnSheet = keepOut.length ? loopsMask(keepOut, w, h, cellMm) : new Uint8Array(n), lc = components(lightsOnSheet, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a white shape of the study, left as paper', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const reservedShare = paperMask.reduce((a, v) => a + v, 0) / pn, areas = instructions.filter(q => q.stage !== 2).map(q => q.areaMm2).sort((a, b) => a - b);
  const covered = new Uint8Array(pn); for (let q = 0; q < pn; q++) for (let j = 0; j < k; j++) if (laid[j][q] > 0) { covered[q] = 1; break; }
  const nested = order.filter(i => parent[i] >= 0).length;
  // the regions record (value-region-check.json): the study's shapes, on the sheet's cells
  const sheetLabels = new Int32Array(n); for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) sheetLabels[y * w + x] = label[py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0)] + 1; }
  const regions = { source: 'block-in study', labels: sheetLabels, regions: shapes.map((s, i) => ({ id: i + 1, colour: s.colour, paper: s.paper, parent: parent[i] >= 0 ? parent[i] + 1 : null, share: +(s.cells.length / pn).toFixed(4) })) };
  const summary = { source: 'study', file: study.file ?? null, clusters, shapes: shapes.length, paperShapes: shapes.filter(s => s.paper).length, nested, stages: byStage.filter(Boolean).length, washesByStage: byStage, mixes: mixes.length, washes: instructions.length, charges, planCellMm: mmX, reservedShare,
    paintedShare: covered.reduce((a, v) => a + v, 0) / pn, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, drawn };
  console.log(`study washes: the wash plan is read from the block-in study ${study.file ?? ''}, not from the subject (the subject only registers the study to the sheet${study.registered ? `: ${study.registered}` : ''} and scores the plate; the palette and the drawing are the painter's own as before)`);
  console.log(`study washes: ${clusters} colours, ${shapes.length} shapes (${summary.paperShapes} left as paper, ${(100 * reservedShare).toFixed(1)}% of the sheet); ${summary.washes - charges} washes (${byStage[0]} first, ${byStage[2]} over a lighter wash, ${byStage[3]} darks last), ${nested} nested on a lighter wash, ${charges} charges; ${strokeCount} strokes, widest brush ${Math.max(0, ...instructions.map(q => q.widestBrushMm)).toFixed(1)} mm`);
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes, summary, mixes, polygons,
    geometry: 'Washes from a block-in study: its flat shapes, each one mix; lightest and largest first, a darker shape of like hue laid over its lighter one (wash within wash), the darkest small shapes last; lanes along each shape\'s long axis; whites left as paper.' };
}
