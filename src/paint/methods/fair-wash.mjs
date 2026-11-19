// The wash plan: a watercolour is layers, not a partition. Lights first, then three stages, each from its own squint.
//
// Reserved lights. Before any wash the plan finds the shapes that stay paper (wash-shapes.mjs reservedLights): shapes
// near the picture's own lightest tone that are clearly lighter than what is around them. The first wash goes round them.
// Stage 1, the first wash. Its shapes are the things of the picture: the segments the run found in the subject (a
// hull, a sail, the water), or, without segments, the shapes of a hard squint cut by contrast. A thing is cut only where
// it holds two things to a painter: a light side and a shadow side, or two hue families (its mean colour is much duller
// than its cells, which is how a wash goes to mud). It is cut into three parts at most. Two things that touch join only
// when they are one hue and value. Each shape is one wash of its own mix: the paints whose film returns the colour of the shape's
// lights (its lighter half, as one colour), so the first wash is clean and nothing lighter inside the shape is lost. It
// is laid a little past its outline so that neighbours meet, with the widest brush that fits it. After it no unreserved
// paper shows.
// Stage 2 and stage 3. The subject is squinted (about 2 mm, then 1 mm) and cut by contrast inside each first-wash
// shape, each stage with its own least wash. A shape is washed only if it must be darker, by a visible step, than what the plan has laid
// under it so far. Its mix is solved for the shape as a whole over what is under it (puddles.mjs mixOver): the paints
// and the strength that bring the film under the shape to the shape's colour (stage 2: to its lights; the last stage:
// to its mean). These washes lie over the first wash;
// they need not tile. A reserved light is washed over only by a shape that is plainly a dark.
//
// A mix belongs to one shape. There is no limit on how many mixes a picture has and no shape is moved to another
// shape's mix. Everything is decided once a shape, from the shape's mean colour at its stage's squint and from the
// plan's own record of what it has laid: nothing is fitted to the cells a wash covers and no pigment is laid alone. A
// wash reaches the paint step as an outline in millimetres and the strokes that fill it (wash-strokes.mjs); the brush is
// not clipped to a mask. A boundary between two shapes is soft when their mean colours are within SOFT_EDGE of each
// other and hard otherwise, and a soft boundary is made by running a damp brush along it.
// The plan is made on its own grid, a third of the smallest wash brush on a side, so it is set in millimetres: a sheet
// with finer cells gets the same shapes, mixes, outlines and strokes.
// Plan time only: the paint step lays what is written here.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { deltaE2000, labOf } from '../../eval/colour.mjs';
import { washShapes, reservedLights } from './wash-shapes.mjs';
import { outlineLoops, softLines, planWashStrokes } from './wash-strokes.mjs';
import { mixFor, mixOver, filmLab } from './puddles.mjs';
import { targetRegions } from './target-regions.mjs';
import { targetValueMap, estimatePaper } from './light-to-dark.mjs';

/** Two shapes whose mean colours are within this CIEDE2000 meet at a soft edge. */
const SOFT_EDGE = 10;
/** A wash over this share of the sheet whose colour is cool (blue over red by 10 of 255) is laid as a sky is, in wide lanes. */
const SKY_SHARE = 0.015;
/** The plan's grid: this many plan cells across the smallest wash brush. */
const PLAN_CELLS_PER_BRUSH = 3;
/** An outline is simplified to half the smallest wash brush's radius, and never to less than this many plan cells. */
const OUTLINE_PLAN_CELLS = 1.25;
/** A first wash is laid when it darkens the paper by this much L*; a shape paler than that is left as paper. */
const VISIBLE_STEP = 2;
/** A later wash is laid only where the shape must be this much darker (L*) than what is under it. */
const VISIBLE_DARKER = 6;
/** A later shape this much darker (L*) than the picture's lightest tone is a dark: it may be laid over a reserved light. */
const DARK_ON_LIGHT = 30;
/** The lights are found on this squint (mm), with the least reserve of this brush (mm). */
const LIGHTS = Object.freeze({ squintMm: 2, brushMm: 7 });
/**
 * The stages: how hard the subject is squinted (mm), the brush whose least wash the stage's shapes keep (mm) and the
 * least contrast between two of its shapes. The first wash is a few large shapes; the darker things inside them come
 * back in the later stages.
 */
const STAGES = Object.freeze([{ squintMm: 2, shapeBrushMm: 7, contrast: 16 }, { squintMm: 2, shapeBrushMm: 7, contrast: 10 }, { squintMm: 1, shapeBrushMm: 3, contrast: 10 }]);
/** A thing is cut into this many parts at most. */
const MOST_PARTS = 3;
/** A thing has a light side and a shadow side when its two halves by colour are this far apart (Lab) and the smaller is this share of it. */
const TWO_SIDES = Object.freeze({ apart: 16, share: 0.15 });
/** A thing spans hues when its mean colour has under this share of the chroma its cells typically have (their median), and that is at least `chroma`. */
const SPANS_HUES = Object.freeze({ share: 0.6, chroma: 6 });
/** Two things that touch are one shape when their mean colours are within this (Lab distance). */
const SAME_THING = 6;

/**
 * The cells of one thing sorted into two by colour: two means along `dims` of Lab, begun from the two sides of the mean
 * on the dimension that varies most. Returns the side (0 or 1) of each cell and how far apart the two means are.
 */
function twoSides(cells, lab, dims) {
  const mean = dims.map(d => cells.reduce((a, i) => a + lab[i * 3 + d], 0) / cells.length), spread = dims.map((d, q) => cells.reduce((a, i) => a + (lab[i * 3 + d] - mean[q]) ** 2, 0));
  const widest = spread.indexOf(Math.max(...spread)); let side = Uint8Array.from(cells, i => (lab[i * 3 + dims[widest]] > mean[widest] ? 1 : 0)), centres = null;
  for (let it = 0; it < 8; it++) {
    const sum = [dims.map(() => 0), dims.map(() => 0)], count = [0, 0];
    cells.forEach((i, q) => { count[side[q]]++; dims.forEach((d, c) => { sum[side[q]][c] += lab[i * 3 + d]; }); });
    if (!count[0] || !count[1]) return null;
    centres = sum.map((v, q) => v.map(x => x / count[q]));
    side = Uint8Array.from(cells, i => { let a = 0, b = 0; dims.forEach((d, c) => { a += (lab[i * 3 + d] - centres[0][c]) ** 2; b += (lab[i * 3 + d] - centres[1][c]) ** 2; }); return b < a ? 1 : 0; });
  }
  const size = [0, 0]; for (const v of side) size[v]++;
  return { side, apart: Math.hypot(...centres[0].map((v, c) => v - centres[1][c])), least: Math.min(size[0], size[1]) / cells.length };
}
/**
 * One thing's parts: lists of its cells, three at most. A part is cut in two by hue when it spans hues, else by colour
 * when it has a light side and a shadow side; the largest part that needs it is cut first.
 */
function partsOf(cells, lab) {
  const parts = [cells];
  const cut = part => {
    if (part.length < 8) return null;
    const mean = [0, 0, 0], chroma = []; for (const i of part) { for (let c = 0; c < 3; c++) mean[c] += lab[i * 3 + c] / part.length; chroma.push(Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2])); }
    const typical = chroma.sort((a, b) => a - b)[part.length >> 1];
    if (typical >= SPANS_HUES.chroma && Math.hypot(mean[1], mean[2]) < SPANS_HUES.share * typical) { const hue = twoSides(part, lab, [1, 2]); if (hue) return hue.side; }
    const sides = twoSides(part, lab, [0, 1, 2]);
    return sides && sides.apart >= TWO_SIDES.apart && sides.least >= TWO_SIDES.share ? sides.side : null;
  };
  for (let done = false; !done && parts.length < MOST_PARTS;) {
    done = true;
    for (const q of parts.map((_, q) => q).sort((a, b) => parts[b].length - parts[a].length)) { const side = cut(parts[q]); if (!side) continue; const part = parts[q]; parts.splice(q, 1, part.filter((_, c) => !side[c]), part.filter((_, c) => side[c])); done = false; break; }
  }
  return parts;
}

/** The subject on the plan's grid, as light (three planes, 0..1). */
function lightOnPlanGrid(rgb, w, h, pw, ph) {
  const sum = [0, 1, 2].map(() => new Float32Array(pw * ph)), count = new Float32Array(pw * ph);
  for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) { const q = py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0), i = y * w + x; count[q]++; for (let c = 0; c < 3; c++) sum[c][q] += (rgb[i * 3 + c] / 255) ** 2.2; } }
  for (let q = 0; q < pw * ph; q++) for (let c = 0; c < 3; c++) sum[c][q] /= Math.max(1, count[q]);
  return sum;
}
function boxMean(src, w, h, r) {
  const n = w * h, row = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let x = -r; x < w + r; x++) { const a = x + r, b = x - r - 1; if (a >= 0 && a < w) { s += src[y * w + a]; c++; } if (b >= 0 && b < w) { s -= src[y * w + b]; c--; } if (x >= 0 && x < w) row[y * w + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h + r; y++) { const a = y + r, b = y - r - 1; if (a >= 0 && a < h) { s += row[a * w + x]; c++; } if (b >= 0 && b < h) { s -= row[b * w + x]; c--; } if (y >= 0 && y < h) out[y * w + x] = s / c; } }
  return out;
}
/** The squint: the light blurred over about `mm` (a box mean twice), as sRGB bytes. */
function squint(light, pw, ph, planMm, mm) {
  const r = Math.round(mm / planMm / 2), out = new Uint8ClampedArray(pw * ph * 3);
  light.forEach((plane, c) => { const f = r > 0 ? boxMean(boxMean(plane, pw, ph, r), pw, ph, r) : plane; for (let q = 0; q < pw * ph; q++) out[q * 3 + c] = 255 * f[q] ** (1 / 2.2); });
  return out;
}

export function planFairWashes({ demand, k, density, w, h, rgb = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], pointBrushMm = 0, hold = null, families = [], subject = null, shaped = true, segments = null }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (demand.length !== n * k || density.length !== n || k < 1) throw Error('target/demand grid mismatch');
  if (!rgb || pigments.length !== k) throw Error('the wash plan needs the subject colours and the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  // what the drawing and the records still read: the value map and the colour regions
  const paper = estimatePaper(rgb, w, h, density);
  const value = targetValueMap(paper ? Float32Array.from(density, v => Math.max(0, v - paper.density)) : density), region = targetRegions({ w, h, rgb, demand, k, density, families });
  // the plan's own grid, in mm
  const pw = Math.min(w, Math.max(1, Math.round(sheetWidthMm / (washBrushMm / PLAN_CELLS_PER_BRUSH)))), ph = pw === w ? h : Math.max(1, Math.round(h * pw / w)), pn = pw * ph, planMm = sheetWidthMm / pw;
  const planOf = Int32Array.from({ length: n }, (_, i) => Math.min(ph - 1, ((((i / w) | 0) + .5) * ph / h) | 0) * pw + Math.min(pw - 1, ((i % w + .5) * pw / w) | 0));
  const light = lightOnPlanGrid(rgb, w, h, pw, ph), tolMm = Math.max(washBrushMm / 4, OUTLINE_PLAN_CELLS * planMm);
  // the lights that stay paper, and their outline: the first wash is laid up to it and not onto it
  const lights = reservedLights({ rgb: squint(light, pw, ph, planMm, LIGHTS.squintMm), w: pw, h: ph, paperRGB: paperCol, cellMm: planMm, brushMm: LIGHTS.brushMm, thinMm: washBrushMm });
  const planReserved = lights.mask, reservedAtFirst = planReserved.reduce((a, v) => a + v, 0);
  const keepOut = reservedAtFirst ? outlineLoops(planReserved, 1, { x0: 0, y0: 0, x1: pw - 1, y1: ph - 1 }, pw, ph, { cellMm: planMm, tolMm }) : null;
  // the plan's own record of what it has laid, per plan cell and pigment
  const laid = Array.from({ length: k }, () => new Float32Array(pn));
  const mixes = [], layers = [], instructions = [], byStage = []; let strokeCount = 0, firstBare = 0, firstArea = 0, widest = 0;
  // one shape's washes: the touching plan cells of `mask`, each charged with the shape's mix
  const layWashes = (stage, amounts, mask, cut, grow) => {
    const strength = amounts.reduce((a, v) => a + v, 0), mixId = mixes.length, phase = stage === 1 ? 'light' : 'mid', c = components(mask, pw, ph, 4), washes = [];
    mixes.push({ mix: amounts.map(v => v / strength), strength, stage });
    const ids = new Int32Array(n), cells = Array.from({ length: c.count + 1 }, () => []), boxes = Array.from({ length: c.count + 1 }, () => ({ x0: pw, y0: ph, x1: -1, y1: -1 })), area = new Float64Array(c.count + 1), mean = Array.from({ length: c.count + 1 }, () => [0, 0, 0]);
    for (let i = 0; i < pn; i++) { const id = c.labels[i]; if (!id) continue; const x = i % pw, y = (i / pw) | 0, b = boxes[id]; area[id]++; for (let ch = 0; ch < 3; ch++) mean[id][ch] += cut.shapes[cut.labels[i] - 1].mean[ch]; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; for (let j = 0; j < k; j++) laid[j][i] += amounts[j]; }
    for (let i = 0; i < n; i++) { const id = c.labels[planOf[i]]; if (id && !hold?.[i]) { ids[i] = id; cells[id].push(i); } }
    for (let id = 1; id <= c.count; id++) {
      const list = cells[id]; if (!list.length) continue;
      const box = { x0: w, y0: h, x1: -1, y1: -1 }; for (const i of list) { const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
      // the wash as the brush gets it: its outline in mm, the strokes that fill it, and the soft parts of its edge
      const soft = (i, j) => { if (j < 0 || planReserved[j] || !cut.labels[j] || !cut.labels[i]) return false; const A = cut.shapes[cut.labels[i] - 1], B = cut.shapes[cut.labels[j] - 1]; return A !== B && deltaE2000(A.lab, B.lab) < SOFT_EDGE; };
      const outline = outlineLoops(c.labels, id, boxes[id], pw, ph, { cellMm: planMm, tolMm, soft }), laidOut = planWashStrokes(outline, { kitMm: washKitMm, pointMm: pointBrushMm, growMm: grow, keepOut: stage === 1 ? keepOut : null }), softEdges = softLines(outline);
      if (!laidOut.strokes.length) continue;
      let rim = 0; for (const l of outline) for (let v = 0; v < l.points.length; v++) { const A = l.points[v], B = l.points[(v + 1) % l.points.length]; rim += Math.hypot(B[0] - A[0], B[1] - A[1]); }
      const areaMm2 = area[id] * planMm * planMm, m = mean[id].map(v => v / area[id]), used = Math.max(...laidOut.strokes.map(st => 2 * st.radiusMm)); strokeCount += laidOut.strokes.length; if (used > widest) widest = used;
      if (stage === 1) { firstBare += laidOut.uncovered * area[id]; firstArea += area[id]; }
      const sh = passage(ids, id, box, strength, list.length, w); sh.mix = [...amounts]; sh.graded = null; sh._follow = true; sh.firstWash = stage === 1; sh._opening = 1;
      const touched = [...new Set(list.map(i => region.labels[i]))].map(i => region.regions[i - 1]);
      const intent = { id: `${phase}/s${stage}/m${mixId}/w${id}`, phase, valueBand: stage, stage, mixId, areaMm2: +areaMm2.toFixed(1), regions: touched.map(r => r.id), crossesRegions: touched.length > 1,
        referenceCue: 'A whole wash shape charged with one mix, judged for the shape.', intendedResult: stage === 1 ? 'First wash: a shape of the hard squint in its own colour.' : 'A wash over a shape that must be darker than what is under it.', cool: areaMm2 > SKY_SHARE * pn * planMm * planMm && m[2] > m[0] + 10,
        shaped, subject, move: 'wet on dry', paperBefore: 'fully dry; own same-passage wet overlap allowed', baseBefore: 'fully dry',
        brush: { kind: 'the widest wash brush of the kit that fits the wash, then the smaller ones where it is narrow', contact: 'side/belly', width: 'each stroke names its brush', widthMm: laidOut.brushMm },
        resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
        layer: stage, break: null, load: { water: .62, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
        edges: { hardCells: [], softCells: [], policy: 'hard or soft by the boundary between two shapes; a damp brush run along the soft ones' },
        outline, strokes: laidOut.strokes, softEdges, depthMm: +laidOut.depthMm.toFixed(1), uncoveredShare: +laidOut.uncovered.toFixed(4),
        protectedLights: ['shapes reserved whole'], failureSigns: 'Lost lights, bare slivers between washes, muddy overlaps.', stop: 'after stage' };
      sh._valuePlan = intent; washes.push(sh); instructions.push({ ...intent, area: list.length, plannedPigmentMass: strength * list.length });
    }
    if (!washes.length) return;
    const total = washes.reduce((a, s) => a + s.area, 0); byStage[stage - 1] = (byStage[stage - 1] ?? 0) + washes.length;
    layers.push({ value: stage, pigment: amounts.indexOf(Math.max(...amounts)), mixId, shapes: washes, mix: amounts.map(v => v / strength), amount: strength, area: total, _order: { phase: stage === 1 ? 'ground' : 'mid', region: 0, shoot: true }, _valuePhase: stage === 1 ? 'light' : 'mid' });
  };
  const cuts = [], paperL = filmLab(new Array(k).fill(0), pigments, paperCol)[0]; let things = null;
  // A shape's lights: the mean colour of its lighter half, as the last stage's squint sees it. One colour for the shape.
  const fine = squint(light, pw, ph, planMm, STAGES[STAGES.length - 1].squintMm), fineL = Float32Array.from({ length: pn }, (_, i) => labOf(fine, i, paperCol)[0]);
  const lightsOf = cells => {
    const middle = cells.map(i => fineL[i]).sort((a, b) => a - b)[cells.length >> 1], sum = [0, 0, 0]; let count = 0;
    for (const i of cells) if (fineL[i] >= middle) { count++; for (let c = 0; c < 3; c++) sum[c] += (fine[i * 3 + c] / 255) ** 2.2; }
    return sum.map(v => 255 * (v / count) ** (1 / 2.2));
  };
  STAGES.forEach((S, s) => {
    const stage = s + 1, seen = squint(light, pw, ph, planMm, S.squintMm), shared = { rgb: seen, w: pw, h: ph, paperRGB: paperCol, cellMm: planMm, brushMm: S.shapeBrushMm };
    let cut;
    if (stage === 1) {
      // the things: the run's segments, or the shapes of the squint; each cut into its parts, and each part's touching cells one shape
      const thing = segments ? Int32Array.from({ length: pn }, (_, q) => segments[(Math.min(h - 1, (((q / pw) | 0) + .5) * h / ph) | 0) * w + (Math.min(w - 1, ((q % pw) + .5) * w / pw) | 0)]) : washShapes({ ...shared, contrast: S.contrast, barrier: planReserved }).labels;
      const lab = new Float32Array(pn * 3), byThing = new Map(), part = new Int32Array(pn).fill(-1); let next = 0;
      for (let i = 0; i < pn; i++) { const q = labOf(seen, i, paperCol); lab[i * 3] = q[0]; lab[i * 3 + 1] = q[1]; lab[i * 3 + 2] = q[2]; if (!planReserved[i]) { const l = byThing.get(thing[i]); if (l) l.push(i); else byThing.set(thing[i], [i]); } }
      for (const cells of byThing.values()) for (const list of partsOf(cells, lab)) { for (const i of list) part[i] = next; next++; }
      const start = new Int32Array(pn).fill(-1), stack = new Int32Array(pn); let pieces = 0;
      for (let s0 = 0; s0 < pn; s0++) { if (part[s0] < 0 || start[s0] >= 0) continue; let sp = 0; stack[sp++] = s0; start[s0] = pieces; while (sp) { const i = stack[--sp], x = i % pw; for (const j of [x ? i - 1 : -1, x < pw - 1 ? i + 1 : -1, i - pw, i + pw]) if (j >= 0 && j < pn && start[j] < 0 && part[j] === part[i]) { start[j] = pieces; stack[sp++] = j; } } pieces++; }
      cut = washShapes({ ...shared, contrast: SAME_THING, start }); things = cut.labels;
    } else cut = washShapes({ ...shared, contrast: S.contrast, zone: things });
    cuts.push(cut.shapes.length);
    // the largest shape first; each shape's mix is judged from its colour and from what the plan has laid under it
    const order = cut.shapes.map((_, a) => a).sort((a, b) => cut.shapes[b].area - cut.shapes[a].area || a - b);
    const cellsOf = cut.shapes.map(() => []); for (let i = 0; i < pn; i++) if (cut.labels[i]) cellsOf[cut.labels[i] - 1].push(i);
    for (const a of order) {
      const sh = cut.shapes[a], dark = stage > 1 && sh.lab[0] <= lights.lightest - DARK_ON_LIGHT, mine = cellsOf[a].filter(i => dark || !planReserved[i]);
      if (!mine.length || sh.paper) continue;
      const under = new Array(k).fill(0); for (const i of mine) for (let j = 0; j < k; j++) under[j] += laid[j][i] / mine.length;
      // every stage but the last lays a shape no darker than its lights, so the lighter things inside it are still there
      // for the stages after; the last lays the shape's own colour
      const colour = stage < STAGES.length ? lightsOf(mine) : sh.mean;
      const amounts = stage === 1 ? mixFor(colour, pigments, paperCol) : mixOver(colour, under, pigments, paperCol);
      if (!(amounts.reduce((p, v) => p + v, 0) > 1e-6)) continue;
      const before = stage === 1 ? paperL : filmLab(under, pigments, paperCol)[0], after = filmLab(under.map((v, j) => v + amounts[j]), pigments, paperCol)[0];
      if (before - after < (stage === 1 ? VISIBLE_STEP : VISIBLE_DARKER)) continue;
      const mask = new Uint8Array(pn); for (const i of mine) { mask[i] = 1; if (planReserved[i]) planReserved[i] = 0; }
      layWashes(stage, amounts, mask, cut, stage === 1 ? tolMm + washBrushMm / 2 : tolMm / 2);
    }
  });
  const protectedCells = new Uint8Array(n); for (let i = 0; i < n; i++) if (planReserved[planOf[i]] || hold?.[i]) protectedCells[i] = 1;
  let open = 0, reserved = 0; for (let i = 0; i < pn; i++) { if (planReserved[i]) reserved++; else if (!(laid.some(f => f[i] > 0))) open++; }
  const areas = instructions.map(q => q.areaMm2).sort((a, b) => a - b), lc = components(protectedCells, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a light reserved whole', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const summary = { stages: byStage.length, washesByStage: Array.from(byStage, v => v ?? 0), shapesCutByStage: cuts, mixes: mixes.length, washes: instructions.length, planCellMm: planMm, reservedShare: reserved / pn, lights: lights.lights, lightestTone: lights.lightest, widestBrushMm: widest,
    firstWashCover: 1 - (open + firstBare) / Math.max(1, pn - reserved), meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount };
  console.log(`mixes: ${mixes.length}, one a shape; ${lights.lights} lights reserved (${(100 * summary.reservedShare).toFixed(1)}% of the sheet; the lightest tone is L* ${lights.lightest.toFixed(0)})`);
  mixes.forEach((p, q) => console.log(`  mix ${q} (stage ${p.stage}): ${p.mix.map((v, j) => (v >= .02 ? `${(100 * v).toFixed(0)}% ${pigments[j].name ?? j}` : null)).filter(Boolean).join(' + ')}; strength ${p.strength.toFixed(3)}`));
  console.log(`washes: ${summary.washes} over ${summary.stages} stages (${summary.washesByStage.join(', ')}); widest brush ${widest.toFixed(1)} mm; least wash ${(4 * Math.PI * (washBrushMm / 2) ** 2).toFixed(1)} mm2 in the last stage (planned on ${planMm.toFixed(2)} mm); the first wash covers ${(100 * summary.firstWashCover).toFixed(1)}% of the unreserved sheet; mean ${summary.meanWashMm2.toFixed(0)} mm2, median ${summary.medianWashMm2.toFixed(0)} mm2; ${strokeCount} strokes planned`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary, mixes,
    geometry: 'Lights reserved, then three stages, each from its own squint: a first wash over each shape in its own mix, then washes only where a shape must be darker than what is under it. Every wash is an outline and strokes in mm.' };
}
