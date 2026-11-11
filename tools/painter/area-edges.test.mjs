// Scrap test: edges decided one by one (tools/painter/area-edges.mjs). A two-area plan is validated and rastered;
// its soft edge is laid as the painter lays it (a clean damp brush along the plan's boundary while the wash is wet),
// its hard edge is a dry boundary, and its lost edge needs one wet session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke, thirsty } from '../../src/media/brush.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { layPassage, dryFully, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { validateAreaDocument, rasterAreaPlan } from './semantic-areas.mjs';
import { softEdgeCells, hardEdgeDue, areaAdjacency } from './area-edges.mjs';
import { softenEdge } from './soften-lift-run.mjs';
import { SOFTEN_WATER } from '../../src/paint/techniques/soften-lift.mjs';

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pass = (id, order, extra = {}) => ({ id, order, dependsOn: [], valueRange: [1, 9], move: 'wet on dry', edges: { kind: 'hard', overlap: true }, lights: { mode: 'paint-owned', reason: 'painted' }, brush: { widthMm: 4, kind: 'round', contact: 'belly', orientation: 'sweep', pressure: [.25, .8, .25] }, load: { water: .62, pigmentScale: 1, waterQuantityMm3: 120, capacityMm3: 160, minRemainingFraction: .15, reload: 'before-stroke', rinse: 'fresh-brush-per-gesture', blot: 'none', concentrationSource: 'solver-calibrated' }, wetness: { required: 'dry', neighborCells: 2 }, stop: { after: 'pass', reason: 'look' }, ...extra });
const area = (id, poly, p) => ({ id, parent: null, intent: id, referenceCue: id, geometry: { polygon: poly, anchors: [] }, drawingRole: 'none', passes: [p] });
const W = 64, H = 48, binding = { targetSHA: 'a', imageSHA: 'a', sourceWidth: W, sourceHeight: H };
const doc = (kind, sessions = false) => ({ version: 1, coordinateSpace: 'normalized-target', target: { path: 't.png', sha256: 'a', width: W, height: H },
  areas: [area('cheek', box(0, 0, .5, 1), pass('wash', 0, sessions ? { session: { id: 'face', reason: 'one wet go' } } : {})), area('shadow', box(.5, 0, 1, 1), pass('wash', 1, sessions ? { session: { id: 'face', reason: 'one wet go' } } : {}))],
  edges: [{ areas: ['cheek', 'shadow'], kind, reason: 'the cheek turns into shadow' }] });
const plan = d => rasterAreaPlan(validateAreaDocument(d, binding), W, H);

test('the edges list names every shared boundary once, each kind with the wet session it needs', () => {
  assert.equal(plan(doc('soft')).edgesByArea.get('cheek')[0].kind, 'soft');
  assert.equal(plan(doc('lost', true)).edgesByArea.get('shadow')[0].other, 'cheek');
  assert.throws(() => plan(doc('lost')), /wet session/);
  assert.throws(() => plan(doc('hard', true)), /share a wet session/);
  const none = doc('soft'); none.edges = [];
  assert.throws(() => plan(none), /no edge named: cheek\|shadow/);
  const apart = doc('soft'); apart.areas[1].geometry.polygon = box(.6, 0, 1, 1); apart.allowedUnassigned = [{ polygon: box(.5, 0, .6, 1), reason: 'gap' }];
  assert.throws(() => plan(apart), /share no boundary: cheek\|shadow/);
  const twice = doc('soft'); twice.edges.push({ areas: ['shadow', 'cheek'], kind: 'hard', reason: 'again' });
  assert.throws(() => plan(twice), /named twice/);
  const dryOnly = doc('soft'); for (const a of dryOnly.areas) a.passes[0].move = 'dry brush';
  assert.throws(() => plan(dryOnly), /wet pass to soften/);
  const silent = doc('soft'); delete silent.edges; assert.throws(() => plan(silent), /names no edges, but these areas share boundaries: cheek\|shadow/);
  assert.deepEqual([...areaAdjacency(plan(doc('soft')).owner, W, H).keys()], ['0|1']);
});

test('a hard edge is dry before the neighbour is painted', () => {
  const p = plan(doc('hard'));
  assert.equal(hardEdgeDue(p, 'shadow', new Set(['cheek'])), true);
  assert.equal(hardEdgeDue(p, 'shadow', new Set()), false);
  assert.equal(hardEdgeDue(plan(doc('soft')), 'shadow', new Set(['cheek'])), false);
});

test('a soft edge: the damp brush along the plan boundary carries the wet wash out into the next area', () => {
  const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 }, sienna = boxPigment(BOX.find(q => q.key === 'sienna'));
  const p = plan(doc('soft')), cheek = Uint8Array.from(p.owner, v => (v === 0 ? 1 : 0)), r = 4;
  const near = softEdgeCells(p, 'cheek', r + 1);
  assert.ok(near && near.where.some((v, i) => v && i % W >= 28 && i % W < 36) && !near.where.some((v, i) => v && i % W < 26), 'cells along the shared boundary only');
  const lay = soft => {
    const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
    layPassage(sheet, cheek, [1], { w: W, h: H, T: TECHNIQUES['wet on dry'], maxRadius: 6, seed: 3, O, settle: 0, pad: 0 });
    if (soft) softenEdge({ mask: cheek, where: near.where, W, H, r, upright: true, stroke: (b, path, o) => stroke(b, sheet, path, o), damp: () => { const b = createBrush({ radius: r, capacity: 60, splay: 0 }); dip(b, { water: 1, conc: [0] }); return thirsty(b, { water: SOFTEN_WATER }); } });
    dryFully(sheet, O);
    // the wash body, and the paint two to four cells past the boundary, in the next area
    const t = thickness(sheet)[0], col = x => { let a = 0; for (let y = 8; y < 40; y++) a += t[y * W + x]; return a / 32; };
    return { body: (col(24) + col(27)) / 2, past: (col(33) + col(34) + col(35)) / 3 };
  };
  const hard = lay(false), soft = lay(true);
  // soft: the wash fades out past the boundary (still a quarter of its body there); hard: it stops at the boundary
  assert.ok(soft.past > soft.body / 4, `soft: ${soft.past.toFixed(3)} past the boundary, body ${soft.body.toFixed(3)}`);
  assert.ok(hard.past < hard.body / 20, `hard: ${hard.past.toFixed(3)} past the boundary, body ${hard.body.toFixed(3)}`);
});

test('one edge can differ along its length: a soft stretch on a hard boundary is softened there only', () => {
  const d = doc('hard');
  d.edges.push({ areas: ['cheek', 'shadow'], kind: 'soft', reason: 'the cheek turns softly into shadow above the jaw', stretch: box(.4, 0, .6, .5) });
  const p = plan(d), near = softEdgeCells(p, 'cheek', 2);
  const rows = y => near.where.slice(y * W, (y + 1) * W).some(v => v);
  assert.ok(rows(5) && rows(20), 'softened along the upper stretch');
  assert.ok(!rows(30) && !rows(44), 'the lower boundary stays hard');
  assert.equal(hardEdgeDue(p, 'shadow', new Set(['cheek'])), true, 'the hard rest still waits for dry');
  const only = doc('soft'); only.edges[0].stretch = box(.4, 0, .6, .5);
  assert.throws(() => plan(only), /one entry without a stretch for the rest/);
});
