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
// Plan time only: the paint step lays what is written here.
import { components } from '../../raster.js';
import { passage } from '../../crop/blockin.mjs';
import { deltaE2000 } from '../../eval/colour.mjs';
import { washShapes } from './wash-shapes.mjs';
import { outlineLoops, softLines, planWashStrokes } from './wash-strokes.mjs';
import { mixFor, strengthFor, choosePuddles, dilutionLadder, filmLab, MAX_STAGES, STAGE_DILUTION, DILUTIONS } from './puddles.mjs';
import { targetRegions } from './target-regions.mjs';
import { targetValueMap, estimatePaper } from './light-to-dark.mjs';

/** Two shapes whose mean colours are within this CIEDE2000 meet at a soft edge. */
export const SOFT_EDGE = 10;
/** A wash over this share of the sheet whose colour is cool (blue over red by 10 of 255) is laid as a sky is, in wide lanes. */
const SKY_SHARE = 0.015;

const phaseOf = stage => (stage === 1 ? 'light' : stage <= 3 ? 'mid' : 'shadow');

export function planFairWashes({ demand, k, density, w, h, rgb = null, paperRGB = null, pigments = [], sheetWidthMm = 280, washBrushMm, washKitMm = [washBrushMm], pointBrushMm = 0, hold = null, families = [], subject = null, shaped = true }) {
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  if (demand.length !== n * k || density.length !== n || k < 1) throw Error('target/demand grid mismatch');
  if (!rgb || pigments.length !== k) throw Error('the wash plan needs the subject colours and the pigments');
  if (!(washBrushMm > 0)) throw Error('the wash plan needs the smallest wash brush');
  // what the drawing and the records still read: the value map and the colour regions
  const paper = estimatePaper(rgb, w, h, density);
  const value = targetValueMap(paper ? Float32Array.from(density, v => Math.max(0, v - paper.density)) : density), region = targetRegions({ w, h, rgb, demand, k, density, families });
  // shapes, each shape's own mix, the puddles, and each shape's washes
  const { labels, shapes, least } = washShapes({ rgb, w, h, paperRGB: paperCol, cellMm, brushMm: washBrushMm });
  for (const s of shapes) s.amounts = s.paper ? new Array(k).fill(0) : mixFor(s.mean, pigments, paperCol);
  const chosen = choosePuddles(shapes, { pigments, paperRGB: paperCol });
  const puddles = chosen.puddles.map((p, q) => {
    const mine = shapes.filter((_, i) => chosen.assign[i] === q), ladder = dilutionLadder(p.mix, mine.map(s => strengthFor(p.mix, s.mean, pigments, paperCol)), pigments, paperCol);
    mine.forEach((s, j) => { s.puddle = q; s.steps = ladder.steps[j]; });
    return { mix: p.mix, dilutions: ladder.dilutions, strengths: ladder.strengths, lead: p.mix.indexOf(Math.max(...p.mix)), L: filmLab(p.mix.map(v => v * ladder.strengths[MAX_STAGES - 1]), pigments, paperCol)[0], area: mine.reduce((a, s) => a + s.area, 0) };
  });
  for (const s of shapes) { s.puddle ??= -1; s.steps ??= []; s.reserved = !s.steps.length; }
  // reserves, at shape scale: the shapes no wash covers, and paper a plan holds by name
  const protectedCells = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (shapes[labels[i] - 1].reserved || hold?.[i]) protectedCells[i] = 1;
  const softPair = new Map(), soft = (a, b) => {
    const key = a < b ? a * (shapes.length + 1) + b : b * (shapes.length + 1) + a; let v = softPair.get(key);
    if (v === undefined) { const A = shapes[a - 1], B = shapes[b - 1]; v = !A.reserved && !B.reserved && deltaE2000(A.lab, B.lab) < SOFT_EDGE; softPair.set(key, v); }
    return v;
  };
  const order = puddles.map((_, q) => q).sort((a, b) => puddles[b].L - puddles[a].L), layers = [], instructions = []; let strokeCount = 0, bare = 0;
  const stages = Math.max(0, ...shapes.map(s => (s.steps.length ? s.steps[s.steps.length - 1] + 1 : 0)));
  for (let stage = 1; stage <= Math.min(MAX_STAGES, stages); stage++) {
    const phase = phaseOf(stage);
    for (const q of order) {
      const P = puddles[q], washes = [];
      {
        const d = STAGE_DILUTION[stage - 1], mask = new Uint8Array(n); let any = 0;
        for (let i = 0; i < n; i++) { const s = shapes[labels[i] - 1]; if (s.puddle === q && !protectedCells[i] && s.steps.includes(stage - 1)) { mask[i] = 1; any = 1; } }
        if (!any) continue;
        const c = components(mask, w, h, 4), strength = P.strengths[stage - 1], cells = Array.from({ length: c.count + 1 }, () => []);
        for (let i = 0; i < n; i++) if (c.labels[i]) cells[c.labels[i]].push(i);
        for (let id = 1; id <= c.count; id++) {
          const list = cells[id], box = { x0: w, y0: h, x1: -1, y1: -1 }, members = new Set(), mean = [0, 0, 0];
          for (const i of list) { const x = i % w, y = (i / w) | 0; members.add(labels[i]); if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
          // the wash as the brush gets it: its outline in mm, the strokes that fill it, and the soft parts of its edge
          const outline = outlineLoops(c.labels, id, box, w, h, { cellMm, tolMm: washBrushMm / 4, soft: (i, j) => j >= 0 && !protectedCells[j] && soft(labels[i], labels[j]) });
          const laid = planWashStrokes(outline, { kitMm: washKitMm, pointMm: pointBrushMm }), softEdges = softLines(outline);
          let rim = 0; for (const l of outline) for (let v = 0; v < l.points.length; v++) { const A = l.points[v], B = l.points[(v + 1) % l.points.length]; rim += Math.hypot(B[0] - A[0], B[1] - A[1]); }
          strokeCount += laid.strokes.length; bare += laid.uncovered * list.length;
          for (const s of members) for (let ch = 0; ch < 3; ch++) mean[ch] += shapes[s - 1].mean[ch] * shapes[s - 1].area / list.length;
          const sh = passage(c.labels, id, box, strength, list.length, w), cool = list.length > n * SKY_SHARE && mean[2] > mean[0] + 10;
          sh.mix = P.mix.map(v => v * strength); sh.graded = null; sh._follow = true; sh.firstWash = phase === 'light'; sh._opening = 1;
          const key = `${phase}/s${stage}/u${q}/${DILUTIONS[d].name}/w${id}`;
          const touched = [...new Set(list.map(i => region.labels[i]))].map(i => region.regions[i - 1]);
          const intent = { id: key, phase, valueBand: stage, stage, puddle: q, dilution: DILUTIONS[d].name, shapes: [...members], regions: touched.map(r => r.id), crossesRegions: touched.length > 1,
            referenceCue: 'Whole wash shapes charged from one puddle at one dilution.', intendedResult: stage === 1 ? 'First wash of local colour over whole shapes.' : 'A further wash over the shapes that are darker.', cool,
            shaped, subject, move: 'wet on dry', paperBefore: 'fully dry; own same-passage wet overlap allowed', baseBefore: 'fully dry',
            brush: { kind: 'flat wash brushes of the kit, widest that fits first', contact: 'side/belly', width: 'each stroke names its brush' },
            resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 2 * list.length / Math.max(1, rim / cellMm), estimateMethod: 'twice area over outline length', mmPerCell: cellMm },
            layer: stage, break: null, load: { water: phase === 'shadow' ? .45 : .62, pigment: 'the puddle at a named dilution; calibrated delivery', reload: 'existing finite instrument route' },
            edges: { hardCells: [], softCells: [], policy: 'hard or soft by the boundary between two shapes; a damp brush run along the soft ones' },
            outline, strokes: laid.strokes, softEdges, uncoveredShare: +laid.uncovered.toFixed(4),
            protectedLights: ['shapes reserved whole'], failureSigns: 'Lost lights, bare slivers between washes, muddy overlaps.', stop: 'after stage' };
          sh._valuePlan = intent; washes.push(sh); instructions.push({ ...intent, area: list.length, plannedPigmentMass: strength * list.length });
        }
      }
      if (washes.length) { const area = washes.reduce((a, s) => a + s.area, 0); layers.push({ value: stage, pigment: P.lead, puddle: q, shapes: washes, mix: [...P.mix], amount: washes.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: phase === 'light' ? 'ground' : phase === 'shadow' ? 'dark' : 'mid', region: 0, shoot: true }, _valuePhase: phase }); }
    }
  }
  const areas = instructions.map(q => q.area * cellMm * cellMm).sort((a, b) => a - b), lc = components(protectedCells, w, h);
  const lightShapes = Array.from({ length: lc.count }, (_, j) => ({ id: j + 1, category: 'bare paper', reason: 'a wash shape reserved whole', toneAt: 'retain paper', cells: 0 })); for (const id of lc.labels) if (id) lightShapes[id - 1].cells++;
  const summary = { shapes: shapes.length, reserved: shapes.filter(s => s.reserved).length, puddles: puddles.length, puddleWorstDE: chosen.worst, washes: instructions.length, stages: Math.min(MAX_STAGES, stages), charges: new Set(instructions.map(q => q.puddle + '/' + q.dilution)).size,
    leastWashMm2: least.washMm2, leastReserveMm2: least.reserveMm2, meanWashMm2: areas.reduce((a, v) => a + v, 0) / Math.max(1, areas.length), medianWashMm2: areas.length ? areas[areas.length >> 1] : 0, smallestWashMm2: areas[0] ?? 0, plannedStrokes: strokeCount, uncoveredShare: bare / Math.max(1, instructions.reduce((a, q) => a + q.area, 0)) };
  console.log(`puddles: ${puddles.length} mixes for ${shapes.length - summary.reserved} painted shapes (${summary.reserved} reserved), every shape within ${chosen.worst.toFixed(1)} dE of its puddle in hue and chroma; ${summary.charges} charges in use`);
  puddles.forEach((p, q) => console.log(`  puddle ${q}: ${p.mix.map((v, j) => (v >= .02 ? `${(100 * v).toFixed(0)}% ${pigments[j].name ?? j}` : null)).filter(Boolean).join(' + ')}; ${p.dilutions.map(d => `${d.name} ${d.strength.toFixed(3)}`).join(', ')}; ${(100 * p.area / n).toFixed(1)}% of the sheet`));
  console.log(`washes: ${summary.washes} over ${summary.stages} stages; least wash ${least.washMm2.toFixed(1)} mm2, least reserve ${least.reserveMm2.toFixed(1)} mm2 (brush ${washBrushMm} mm); mean ${summary.meanWashMm2.toFixed(0)} mm2, median ${summary.medianWashMm2.toFixed(0)} mm2, smallest ${summary.smallestWashMm2.toFixed(1)} mm2; ${strokeCount} strokes planned inside their outlines, ${(100 * summary.uncoveredShare).toFixed(1)}% of the washed area out of every stroke's reach and left`);
  return { opticsReport: null, paper, style: null, layers, instructions, protectedCells, value, regions: region, omittedDemand: 0, lightShapes, summary,
    puddles: puddles.map(p => ({ mix: p.mix, dilutions: p.dilutions, areaShare: p.area / n })), shapeMeans: shapes.map(s => ({ id: s.id, areaMm2: s.areaMm2, mean: s.mean.map(v => +v.toFixed(1)), puddle: s.puddle, washes: s.steps.length })),
    geometry: 'Whole wash shapes cut from the squinted subject; every wash is touching shapes that take one puddle at one dilution in one stage.' };
}
