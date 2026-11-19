// The wash plan: a watercolour is layers, not a partition. Three stages, each from its own squint at the subject.
//
// Stage 1, the first wash. The subject is squinted hard (blurred about 4 mm) and sorted into at most six hue families
// by the puddle rule (puddles.mjs). Each family's whole area is one wash of its puddle at the family's palest strength,
// laid a little past its outline so that neighbours meet. Shapes whose colour is the paper's are reserved whole. After
// it no unreserved paper shows.
// Stage 2 and stage 3. The subject is squinted less (about 2 mm, then 1 mm) and cut into shapes again, each stage with
// its own least wash. A shape is washed only if it must be darker, by a visible step, than what the plan has laid
// under it so far. Its paint is what its colour needs less what is under it; the stage's shapes share a few puddles
// mixed for those remainders, each puddle at up to three strengths, and a shape takes its puddle's nearest strength.
// These washes lie over the first wash; they need not tile.
//
// Everything is decided once a shape, from the shape's mean colour and from the plan's own record of what it has laid:
// nothing is fitted to the cells a wash covers and no pigment is laid alone. A wash reaches the paint step as an
// outline in millimetres and the strokes that fill it (wash-strokes.mjs); the brush is not clipped to a mask. A boundary
// between two shapes is soft when their mean colours are within SOFT_EDGE of each other and hard otherwise, and a soft
// boundary is made by running a damp brush along it.
// The plan is made on its own grid, a third of the smallest wash brush on a side, so it is set in millimetres: a sheet
// with finer cells gets the same shapes, puddles, outlines and strokes.
// Plan time only: the paint step lays what is written here.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { deltaE2000 } from '../../eval/colour.mjs';
import { washShapes } from './wash-shapes.mjs';
import { outlineLoops, softLines, planWashStrokes } from './wash-strokes.mjs';
import { mixFor, strengthFor, choosePuddles, dilutionLadder, filmLab, DILUTIONS } from './puddles.mjs';
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
/** A later wash is laid only where the shape must be this much darker (L*) than what is under it. */
export const VISIBLE_DARKER = 8;
/**
 * The stages: how hard the subject is squinted (mm), the brush whose least wash the stage's shapes keep (mm), and the
 * most puddles the stage may mix. Twenty-five puddles at most over the sheet.
 */
export const STAGES = Object.freeze([{ squintMm: 4, shapeBrushMm: 7, puddles: 6 }, { squintMm: 2, shapeBrushMm: 7, puddles: 9 }, { squintMm: 1, shapeBrushMm: 3, puddles: 10 }]);

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

export function planFairWashes({ demand, k, density, w, h, rgb = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], pointBrushMm = 0, hold = null, families = [], subject = null, shaped = true }) {
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
  // the plan's own record of what it has laid, per plan cell and pigment
  const laid = Array.from({ length: k }, () => new Float32Array(pn)), planReserved = new Uint8Array(pn), protectedCells = new Uint8Array(n);
  const puddles = [], layers = [], instructions = [], byStage = []; let strokeCount = 0, firstBare = 0, firstArea = 0;
  // one wash: touching plan cells of `mask`, charged `mix * strength`
  const layWashes = (stage, puddle, level, mask, cut, grow) => {
    const P = puddles[puddle], strength = P.strengths[level], phase = stage === 1 ? 'light' : 'mid', c = components(mask, pw, ph, 4), washes = [];
    const ids = new Int32Array(n), cells = Array.from({ length: c.count + 1 }, () => []), boxes = Array.from({ length: c.count + 1 }, () => ({ x0: pw, y0: ph, x1: -1, y1: -1 })), area = new Float64Array(c.count + 1), mean = Array.from({ length: c.count + 1 }, () => [0, 0, 0]);
    for (let i = 0; i < pn; i++) { const id = c.labels[i]; if (!id) continue; const x = i % pw, y = (i / pw) | 0, b = boxes[id]; area[id]++; for (let ch = 0; ch < 3; ch++) mean[id][ch] += cut.shapes[cut.labels[i] - 1].mean[ch]; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; for (let j = 0; j < k; j++) laid[j][i] += P.mix[j] * strength; }
    for (let i = 0; i < n; i++) { const id = c.labels[planOf[i]]; if (id && !protectedCells[i]) { ids[i] = id; cells[id].push(i); } }
    for (let id = 1; id <= c.count; id++) {
      const list = cells[id]; if (!list.length) continue;
      const box = { x0: w, y0: h, x1: -1, y1: -1 }; for (const i of list) { const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
      // the wash as the brush gets it: its outline in mm, the strokes that fill it, and the soft parts of its edge
      const soft = (i, j) => { if (j < 0 || planReserved[j]) return false; const A = cut.shapes[cut.labels[i] - 1], B = cut.shapes[cut.labels[j] - 1]; return A !== B && deltaE2000(A.lab, B.lab) < SOFT_EDGE; };
      const outline = outlineLoops(c.labels, id, boxes[id], pw, ph, { cellMm: planMm, tolMm, soft }), laidOut = planWashStrokes(outline, { kitMm: washKitMm, pointMm: pointBrushMm, growMm: grow }), softEdges = softLines(outline);
      let rim = 0; for (const l of outline) for (let v = 0; v < l.points.length; v++) { const A = l.points[v], B = l.points[(v + 1) % l.points.length]; rim += Math.hypot(B[0] - A[0], B[1] - A[1]); }
      const areaMm2 = area[id] * planMm * planMm, m = mean[id].map(v => v / area[id]); strokeCount += laidOut.strokes.length;
      if (stage === 1) { firstBare += laidOut.uncovered * area[id]; firstArea += area[id]; }
      const sh = passage(ids, id, box, strength, list.length, w); sh.mix = P.mix.map(v => v * strength); sh.graded = null; sh._follow = true; sh.firstWash = stage === 1; sh._opening = 1;
      const touched = [...new Set(list.map(i => region.labels[i]))].map(i => region.regions[i - 1]);
      const intent = { id: `${phase}/s${stage}/u${puddle}/${P.dilutions[level].name}/w${id}`, phase, valueBand: stage, stage, puddle, dilution: P.dilutions[level].name, areaMm2: +areaMm2.toFixed(1), regions: touched.map(r => r.id), crossesRegions: touched.length > 1,
        referenceCue: 'Whole wash shapes charged from one puddle at one strength.', intendedResult: stage === 1 ? 'First wash: a hue family\'s whole area at its palest.' : 'A wash over a shape that must be darker than what is under it.', cool: areaMm2 > SKY_SHARE * pn * planMm * planMm && m[2] > m[0] + 10,
        shaped, subject, move: 'wet on dry', paperBefore: 'fully dry; own same-passage wet overlap allowed', baseBefore: 'fully dry',
        brush: { kind: 'one flat wash brush of the kit, chosen from the size of the wash', contact: 'side/belly', width: 'each stroke names its brush', widthMm: laidOut.brushMm },
        resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
        layer: stage, break: null, load: { water: .62, pigment: 'the puddle at a named strength; calibrated delivery', reload: 'existing finite instrument route' },
        edges: { hardCells: [], softCells: [], policy: 'hard or soft by the boundary between two shapes; a damp brush run along the soft ones' },
        outline, strokes: laidOut.strokes, softEdges, uncoveredShare: +laidOut.uncovered.toFixed(4),
        protectedLights: ['shapes reserved whole'], failureSigns: 'Lost lights, bare slivers between washes, muddy overlaps.', stop: 'after stage' };
      sh._valuePlan = intent; washes.push(sh); instructions.push({ ...intent, area: list.length, plannedPigmentMass: strength * list.length });
    }
    return washes;
  };
  const pushLayer = (stage, puddle, washes) => { if (!washes.length) return; const P = puddles[puddle], area = washes.reduce((a, s) => a + s.area, 0); byStage[stage - 1] = (byStage[stage - 1] ?? 0) + washes.length;
    layers.push({ value: stage, pigment: P.mix.indexOf(Math.max(...P.mix)), puddle, shapes: washes, mix: [...P.mix], amount: washes.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: stage === 1 ? 'ground' : 'mid', region: 0, shoot: true }, _valuePhase: stage === 1 ? 'light' : 'mid' }); };
  const names = l => DILUTIONS[Math.min(l, DILUTIONS.length - 1)].name, cuts = [];
  STAGES.forEach((S, s) => {
    const stage = s + 1, cut = washShapes({ rgb: squint(light, pw, ph, planMm, S.squintMm), w: pw, h: ph, paperRGB: paperCol, cellMm: planMm, brushMm: S.shapeBrushMm }); cuts.push(cut.shapes.length);
    const first = puddles.length;
    if (stage === 1) {
      // hue families: each family's whole area, one wash at the strength its palest shape needs
      for (const sh of cut.shapes) sh.amounts = sh.paper ? new Array(k).fill(0) : mixFor(sh.mean, pigments, paperCol);
      const chosen = choosePuddles(cut.shapes, { pigments, paperRGB: paperCol, max: S.puddles });
      chosen.puddles.forEach((p, q) => { const needs = cut.shapes.filter((_, i) => chosen.assign[i] === q).map(sh => strengthFor(p.mix, sh.mean, pigments, paperCol)).filter(v => v > 0); puddles.push({ mix: p.mix, strengths: [Math.min(...needs)], dilutions: [{ name: names(0), strength: Math.min(...needs) }], stage }); });
      const family = cut.shapes.map((_, i) => chosen.assign[i]);
      for (let i = 0; i < pn; i++) if (family[cut.labels[i] - 1] < 0) planReserved[i] = 1;
      for (let i = 0; i < n; i++) if (planReserved[planOf[i]] || hold?.[i]) protectedCells[i] = 1;
      chosen.puddles.forEach((_, q) => { const mask = Uint8Array.from(cut.labels, v => (family[v - 1] === q ? 1 : 0)); pushLayer(stage, first + q, layWashes(stage, first + q, 0, mask, cut, tolMm + washBrushMm / 2)); });
      return;
    }
    // later stages: the shapes that must be darker than what is under them, and the paint each still needs
    const under = cut.shapes.map(() => new Float64Array(k)), want = [];
    for (let i = 0; i < pn; i++) { const a = cut.labels[i] - 1; for (let j = 0; j < k; j++) under[a][j] += laid[j][i] / cut.shapes[a].area; }
    cut.shapes.forEach((sh, a) => {
      if (sh.paper) return; let held = 0; for (let i = 0; i < pn && !held; i++) if (cut.labels[i] - 1 === a && planReserved[i]) held = 1;
      const own = mixFor(sh.mean, pigments, paperCol), rest = own.map((v, j) => Math.max(0, v - under[a][j]));
      if (filmLab(Array.from(under[a]), pigments, paperCol)[0] - sh.lab[0] >= VISIBLE_DARKER && rest.some(v => v > 1e-6)) want.push({ a, amounts: rest, area: sh.area });
    });
    if (!want.length) return;
    const chosen = choosePuddles(want, { pigments, paperRGB: paperCol, max: S.puddles });
    chosen.puddles.forEach((p, q) => {
      const mine = want.filter((_, i) => chosen.assign[i] === q), ladder = dilutionLadder(p.mix, mine.map(v => v.amounts.reduce((a, x) => a + x, 0)), pigments, paperCol);
      puddles.push({ mix: p.mix, strengths: ladder.levels, dilutions: ladder.levels.map((strength, l) => ({ name: names(l), strength })), stage });
      ladder.levels.forEach((_, level) => { const take = new Set(mine.filter((_, i) => ladder.steps[i].length === level + 1).map(v => v.a)); if (!take.size) return; const mask = Uint8Array.from(cut.labels, (v, i) => (take.has(v - 1) && !planReserved[i] ? 1 : 0)); pushLayer(stage, first + q, layWashes(stage, first + q, level, mask, cut, tolMm / 2)); });
    });
  });
  let open = 0, reserved = 0; for (let i = 0; i < pn; i++) { if (planReserved[i]) reserved++; else if (!(laid.some(f => f[i] > 0))) open++; }
  const areas = instructions.map(q => q.areaMm2).sort((a, b) => a - b), lc = components(protectedCells, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a wash shape reserved whole', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const summary = { stages: byStage.length, washesByStage: byStage, shapesCutByStage: cuts, puddles: puddles.length, charges: puddles.reduce((a, p) => a + p.strengths.length, 0), washes: instructions.length, planCellMm: planMm, reservedShare: reserved / pn,
    firstWashCover: 1 - (open + firstBare) / Math.max(1, pn - reserved), meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount };
  console.log(`puddles: ${puddles.length} mixes, ${summary.charges} charges; ${puddles.filter(p => p.stage === 1).length} hue families for the first wash`);
  puddles.forEach((p, q) => console.log(`  puddle ${q} (stage ${p.stage}): ${p.mix.map((v, j) => (v >= .02 ? `${(100 * v).toFixed(0)}% ${pigments[j].name ?? j}` : null)).filter(Boolean).join(' + ')}; ${p.dilutions.map(d => `${d.name} ${d.strength.toFixed(3)}`).join(', ')}`));
  console.log(`washes: ${summary.washes} over ${summary.stages} stages (${byStage.join(', ')}); least wash ${(4 * Math.PI * (washBrushMm / 2) ** 2).toFixed(1)} mm2 in the last stage (planned on ${planMm.toFixed(2)} mm); the first wash covers ${(100 * summary.firstWashCover).toFixed(1)}% of the unreserved sheet (${(100 * summary.reservedShare).toFixed(1)}% reserved); mean ${summary.meanWashMm2.toFixed(0)} mm2, median ${summary.medianWashMm2.toFixed(0)} mm2; ${strokeCount} strokes planned`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary,
    puddles: puddles.map(p => ({ mix: p.mix, dilutions: p.dilutions, stage: p.stage })),
    geometry: 'Three stages, each from its own squint: a first wash over each hue family, then washes only where a shape must be darker than what is under it. Every wash is an outline and strokes in mm.' };
}
