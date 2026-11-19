// The wash plan: a few puddles, and whole shapes washed from them in at most five stages, light to dark.
//
// The plan studies the subject as a whole and decides everything once a shape (wash-shapes.mjs): which puddle the shape
// takes (puddles.mjs), and which of the stages wash it. A stage lays each puddle at one dilution, and touching shapes
// that take the same puddle in a stage are one wash. A wash's charge is the puddle's at a named
// dilution: nothing is fitted to the cells a wash covers and no pigment is laid alone. A wash reaches the paint step as
// an outline in millimetres and the strokes that fill it (wash-strokes.mjs); the brush is not clipped to a mask. A
// boundary between two shapes is soft when their mean colours are within SOFT_EDGE of each other and hard otherwise; a
// boundary with reserved paper is hard. A soft boundary is made by running a damp brush along it. A shape whose colour is the paper's, or that no visible wash
// would darken, is reserved whole.
// The plan is made on its own grid, a third of the smallest wash brush on a side, so it is set in millimetres: a sheet
// with finer cells gets the same shapes, puddles, outlines and strokes. After the puddles are chosen, touching shapes
// that take the same puddle to the same value step are one shape.
// Plan time only: the paint step lays what is written here.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { deltaE2000, labOf } from '../../eval/colour.mjs';
import { washShapes } from './wash-shapes.mjs';
import { outlineLoops, softLines, planWashStrokes } from './wash-strokes.mjs';
import { mixFor, strengthFor, choosePuddles, dilutionLadder, filmLab, MAX_STAGES, STAGE_DILUTION, DILUTIONS } from './puddles.mjs';
import { targetRegions } from './target-regions.mjs';
import { targetValueMap, estimatePaper } from './light-to-dark.mjs';

/** Two shapes whose mean colours are within this CIEDE2000 meet at a soft edge. */
const SOFT_EDGE = 10;
/** A wash over this share of the sheet whose colour is cool (blue over red by 10 of 255) is laid as a sky is, in wide lanes. */
const SKY_SHARE = 0.015;

/** The plan's grid: this many plan cells across the smallest wash brush. */
const PLAN_CELLS_PER_BRUSH = 3;

const phaseOf = stage => (stage === 1 ? 'light' : stage <= 3 ? 'mid' : 'shadow');

/** The subject averaged onto the plan's grid (light averaged as light). */
function onPlanGrid(rgb, w, h, pw, ph) {
  if (pw === w && ph === h) return rgb;
  const sum = new Float64Array(pw * ph * 3), count = new Float64Array(pw * ph), out = new Uint8ClampedArray(pw * ph * 3);
  for (let y = 0; y < h; y++) { const py = Math.min(ph - 1, ((y + .5) * ph / h) | 0); for (let x = 0; x < w; x++) { const q = py * pw + Math.min(pw - 1, ((x + .5) * pw / w) | 0), i = y * w + x; count[q]++; for (let c = 0; c < 3; c++) sum[q * 3 + c] += (rgb[i * 3 + c] / 255) ** 2.2; } }
  for (let q = 0; q < pw * ph; q++) for (let c = 0; c < 3; c++) out[q * 3 + c] = 255 * (sum[q * 3 + c] / Math.max(1, count[q])) ** (1 / 2.2);
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
  // shapes, each shape's own mix, the puddles, and each shape's value step
  const cut = washShapes({ rgb: onPlanGrid(rgb, w, h, pw, ph), w: pw, h: ph, paperRGB: paperCol, cellMm: planMm, brushMm: washBrushMm }), least = cut.least;
  let labels = cut.labels, shapes = cut.shapes;
  for (const s of shapes) s.amounts = s.paper ? new Array(k).fill(0) : mixFor(s.mean, pigments, paperCol);
  const chosen = choosePuddles(shapes, { pigments, paperRGB: paperCol });
  const puddles = chosen.puddles.map((p, q) => {
    const mine = shapes.filter((_, i) => chosen.assign[i] === q), ladder = dilutionLadder(p.mix, mine.map(s => strengthFor(p.mix, s.mean, pigments, paperCol)), pigments, paperCol);
    mine.forEach((s, j) => { s.puddle = q; s.steps = ladder.steps[j]; });
    return { mix: p.mix, dilutions: ladder.dilutions, strengths: ladder.strengths, lead: p.mix.indexOf(Math.max(...p.mix)), L: filmLab(p.mix.map(v => v * ladder.strengths[MAX_STAGES - 1]), pigments, paperCol)[0], area: mine.reduce((a, s) => a + s.area, 0) };
  });
  for (const s of shapes) { s.puddle ??= -1; s.steps ??= []; s.reserved = !s.steps.length; }
  // touching shapes that take one puddle to one value step are one shape (reserved shapes that touch are one too)
  const cutCount = shapes.length;
  {
    const parent = shapes.map((_, q) => q), find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const same = (a, b) => shapes[a].puddle === shapes[b].puddle && shapes[a].steps.length === shapes[b].steps.length;
    for (let i = 0; i < pn; i++) { const a = labels[i] - 1, x = i % pw; for (const j of [x < pw - 1 ? i + 1 : -1, i + pw < pn ? i + pw : -1]) if (j >= 0 && labels[j] - 1 !== a) { const ra = find(a), rb = find(labels[j] - 1); if (ra !== rb && same(ra, rb)) parent[Math.max(ra, rb)] = Math.min(ra, rb); } }
    const idOf = new Int32Array(shapes.length), merged = [];
    shapes.forEach((s, q) => { const r = find(q); if (!idOf[r]) { merged.push({ ...shapes[r], id: merged.length + 1, area: 0, areaMm2: 0, light: [0, 0, 0] }); idOf[r] = merged.length; } const m = merged[idOf[r] - 1]; m.area += s.area; m.areaMm2 += s.areaMm2; for (let c = 0; c < 3; c++) m.light[c] += s.area * (s.mean[c] / 255) ** 2.2; idOf[q] = idOf[r]; });
    for (const m of merged) { m.mean = m.light.map(v => 255 * (v / m.area) ** (1 / 2.2)); m.lab = labOf(m.mean, 0, paperCol); delete m.light; }
    labels = Int32Array.from(labels, v => idOf[v - 1]); shapes = merged;
  }
  // reserves, at shape scale: the shapes no wash covers, and paper a plan holds by name
  const protectedCells = new Uint8Array(n), planReserved = Uint8Array.from(labels, v => (shapes[v - 1].reserved ? 1 : 0));
  for (let i = 0; i < n; i++) if (planReserved[planOf[i]] || hold?.[i]) protectedCells[i] = 1;
  const softPair = new Map(), soft = (a, b) => {
    const key = a < b ? a * (shapes.length + 1) + b : b * (shapes.length + 1) + a; let v = softPair.get(key);
    if (v === undefined) { const A = shapes[a - 1], B = shapes[b - 1]; v = !A.reserved && !B.reserved && deltaE2000(A.lab, B.lab) < SOFT_EDGE; softPair.set(key, v); }
    return v;
  };
  const order = puddles.map((_, q) => q).sort((a, b) => puddles[b].L - puddles[a].L), layers = [], instructions = []; let strokeCount = 0, bare = 0, planArea = 0;
  const stages = Math.max(0, ...shapes.map(s => s.steps.length));
  for (let stage = 1; stage <= Math.min(MAX_STAGES, stages); stage++) {
    const phase = phaseOf(stage), d = STAGE_DILUTION[stage - 1];
    for (const q of order) {
      const P = puddles[q], washes = [], mask = new Uint8Array(pn); let any = 0;
      for (let i = 0; i < pn; i++) { const s = shapes[labels[i] - 1]; if (s.puddle === q && s.steps.length >= stage) { mask[i] = 1; any = 1; } }
      if (!any) continue;
      // washes are found on the plan's grid; the sheet's cells keep only a record of which wash lies over them
      const c = components(mask, pw, ph, 4), strength = P.strengths[stage - 1], ids = new Int32Array(n), cells = Array.from({ length: c.count + 1 }, () => []), boxes = Array.from({ length: c.count + 1 }, () => ({ x0: pw, y0: ph, x1: -1, y1: -1 })), members = Array.from({ length: c.count + 1 }, () => new Set());
      for (let i = 0; i < pn; i++) { const id = c.labels[i]; if (!id) continue; const x = i % pw, y = (i / pw) | 0, b = boxes[id]; members[id].add(labels[i]); if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
      for (let i = 0; i < n; i++) { const id = c.labels[planOf[i]]; if (id && !protectedCells[i]) { ids[i] = id; cells[id].push(i); } }
      for (let id = 1; id <= c.count; id++) {
        const list = cells[id]; if (!list.length) continue;
        const box = { x0: w, y0: h, x1: -1, y1: -1 }, mean = [0, 0, 0]; let area = 0;
        for (const i of list) { const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
        for (const s of members[id]) area += shapes[s - 1].area;
        for (const s of members[id]) for (let ch = 0; ch < 3; ch++) mean[ch] += shapes[s - 1].mean[ch] * shapes[s - 1].area / area;
        // the wash as the brush gets it: its outline in mm, the strokes that fill it, and the soft parts of its edge
        const outline = outlineLoops(c.labels, id, boxes[id], pw, ph, { cellMm: planMm, tolMm: washBrushMm / 4, soft: (i, j) => j >= 0 && !planReserved[j] && soft(labels[i], labels[j]) });
        const laid = planWashStrokes(outline, { kitMm: washKitMm, pointMm: pointBrushMm }), softEdges = softLines(outline);
        let rim = 0; for (const l of outline) for (let v = 0; v < l.points.length; v++) { const A = l.points[v], B = l.points[(v + 1) % l.points.length]; rim += Math.hypot(B[0] - A[0], B[1] - A[1]); }
        strokeCount += laid.strokes.length; bare += laid.uncovered * area; planArea += area;
        const sh = passage(ids, id, box, strength, list.length, w), areaMm2 = area * planMm * planMm, cool = areaMm2 > SKY_SHARE * pn * planMm * planMm && mean[2] > mean[0] + 10;
        sh.mix = P.mix.map(v => v * strength); sh.graded = null; sh._follow = true; sh.firstWash = phase === 'light'; sh._opening = 1;
        const key = `${phase}/s${stage}/u${q}/${DILUTIONS[d].name}/w${id}`;
        const touched = [...new Set(list.map(i => region.labels[i]))].map(i => region.regions[i - 1]);
        const intent = { id: key, phase, valueBand: stage, stage, puddle: q, dilution: DILUTIONS[d].name, shapes: [...members[id]], areaMm2: +areaMm2.toFixed(1), regions: touched.map(r => r.id), crossesRegions: touched.length > 1,
          referenceCue: 'Whole wash shapes charged from one puddle at one dilution.', intendedResult: stage === 1 ? 'First wash of local colour over whole shapes.' : 'A further wash over the shapes that are darker.', cool,
          shaped, subject, move: 'wet on dry', paperBefore: 'fully dry; own same-passage wet overlap allowed', baseBefore: 'fully dry',
          brush: { kind: 'one flat wash brush of the kit, chosen from the size of the wash', contact: 'side/belly', width: 'each stroke names its brush', widthMm: laid.brushMm },
          resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * areaMm2 / Math.max(1e-6, rim) / cellMm, estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
          layer: stage, break: null, load: { water: phase === 'shadow' ? .45 : .62, pigment: 'the puddle at a named dilution; calibrated delivery', reload: 'existing finite instrument route' },
          edges: { hardCells: [], softCells: [], policy: 'hard or soft by the boundary between two shapes; a damp brush run along the soft ones' },
          outline, strokes: laid.strokes, softEdges, uncoveredShare: +laid.uncovered.toFixed(4),
          protectedLights: ['shapes reserved whole'], failureSigns: 'Lost lights, bare slivers between washes, muddy overlaps.', stop: 'after stage' };
        sh._valuePlan = intent; washes.push(sh); instructions.push({ ...intent, area: list.length, plannedPigmentMass: strength * list.length });
      }
      if (washes.length) { const area = washes.reduce((a, s) => a + s.area, 0); layers.push({ value: stage, pigment: P.lead, puddle: q, shapes: washes, mix: [...P.mix], amount: washes.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: phase === 'light' ? 'ground' : phase === 'shadow' ? 'dark' : 'mid', region: 0, shoot: true }, _valuePhase: phase }); }
    }
  }
  const areas = instructions.map(q => q.areaMm2).sort((a, b) => a - b), lc = components(protectedCells, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a wash shape reserved whole', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const summary = { shapesCut: cutCount, shapes: shapes.length, reserved: shapes.filter(s => s.reserved).length, puddles: puddles.length, puddleWorstDE: chosen.worst, washes: instructions.length, stages: Math.min(MAX_STAGES, stages), charges: new Set(instructions.map(q => q.puddle + '/' + q.dilution)).size, planCellMm: planMm,
    leastWashMm2: least.washMm2, leastReserveMm2: least.reserveMm2, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, uncoveredShare: bare / Math.max(1, planArea) };
  console.log(`puddles: ${puddles.length} mixes for ${shapes.length - summary.reserved} painted shapes (${summary.reserved} reserved; ${cutCount} shapes cut, ${shapes.length} after joining those of one puddle and value step), every shape within ${chosen.worst.toFixed(1)} dE of its puddle in hue and chroma; ${summary.charges} charges in use`);
  puddles.forEach((p, q) => console.log(`  puddle ${q}: ${p.mix.map((v, j) => (v >= .02 ? `${(100 * v).toFixed(0)}% ${pigments[j].name ?? j}` : null)).filter(Boolean).join(' + ')}; ${p.dilutions.map(d => `${d.name} ${d.strength.toFixed(3)}`).join(', ')}; ${(100 * p.area / pn).toFixed(1)}% of the sheet`));
  console.log(`washes: ${summary.washes} over ${summary.stages} stages; least wash ${least.washMm2.toFixed(1)} mm2, least reserve ${least.reserveMm2.toFixed(1)} mm2 (brush ${washBrushMm} mm, planned on ${planMm.toFixed(2)} mm); mean ${summary.meanWashMm2.toFixed(0)} mm2, median ${summary.medianWashMm2.toFixed(0)} mm2, smallest ${summary.smallestWashMm2.toFixed(1)} mm2; ${strokeCount} strokes planned inside their outlines, ${(100 * summary.uncoveredShare).toFixed(1)}% of the washed area out of every stroke's reach and left`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary,
    puddles: puddles.map(p => ({ mix: p.mix, dilutions: p.dilutions, areaShare: p.area / pn })), shapeMeans: shapes.map(s => ({ id: s.id, areaMm2: s.areaMm2, mean: s.mean.map(v => +v.toFixed(1)), puddle: s.puddle, washes: s.steps.length })),
    geometry: 'Whole wash shapes cut from the squinted subject on a grid set in mm; every wash is touching shapes that take one puddle in one stage, given to the brush as an outline and strokes in mm.' };
}
