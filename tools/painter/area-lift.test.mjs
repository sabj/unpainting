// Scrap test: lifting from damp paint (lights.mode lift). A one-area plan lays a wet on wet wash and names a light to
// lift; the painter (soften-lift-run.mjs softenAndLift) waits for the shine to go off the light, then lifts it with a
// thirsty clean brush. Lifted while still glossy, the wet wash flows back and the light keeps its paint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS, step } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke, thirsty } from '../../src/media/brush.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { layPassage, dryFully, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { measurePaper } from '../../src/paint/methods/wetdry.mjs';
import { validateAreaDocument, rasterAreaPlan } from './semantic-areas.mjs';
import { softenAndLift } from './soften-lift-run.mjs';
import { layIntoWetBed } from './wet-bed-wait.mjs';

const W = 64, H = 64, O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 }, sienna = boxPigment(BOX.find(q => q.key === 'sienna'));
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pass = { id: 'wash', order: 0, dependsOn: [], valueRange: [1, 9], move: 'wet on wet', edges: { kind: 'soft', overlap: true }, lights: { mode: 'lift', reason: 'the lit cheek is lifted soft from the damp wash', polygon: box(22 / 64, 22 / 64, 40 / 64, 36 / 64) }, brush: { widthMm: 6, kind: 'round', contact: 'belly', orientation: 'sweep', pressure: [.5, .9, .5] }, load: { water: .88, pigmentScale: 1, waterQuantityMm3: 120, capacityMm3: 160, minRemainingFraction: .15, reload: 'before-stroke', rinse: 'fresh-brush-per-gesture', blot: 'none', concentrationSource: 'solver-calibrated' }, wetness: { required: 'moist', neighborCells: 2 }, stop: { after: 'pass', reason: 'look' } };
const doc = { version: 1, coordinateSpace: 'normalized-target', target: { path: 't.png', sha256: 'a', width: W, height: H }, areas: [{ id: 'face', parent: null, intent: 'face', referenceCue: 'face', geometry: { polygon: box(0, 0, 1, 1), anchors: [] }, drawingRole: 'none', passes: [pass] }] };

function paint(wait) {
  const plan = rasterAreaPlan(validateAreaDocument(doc, { targetSHA: 'a', imageSHA: 'a', sourceWidth: W, sourceHeight: H }), W, H);
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
  const wash = Uint8Array.from({ length: W * H }, (_, i) => (i % W >= 8 && i % W < 56 && ((i / W) | 0) >= 8 && ((i / W) | 0) < 56 ? 1 : 0));
  layPassage(sheet, wash, [1], { w: W, h: H, T: TECHNIQUES['wet on wet'], maxRadius: 6, seed: 3, O });
  const did = softenAndLift({ pass, plan, mask: wash, W, H, mmPerCell: 0.5, K: 1, dip, thirsty, upright: true,
    newBrush: r => createBrush({ radius: r, capacity: 60, splay: 0 }), stroke: (b, path, o) => stroke(b, sheet, path, o), waitDamp: wait(sheet) });
  dryFully(sheet, O);
  const t = thickness(sheet)[0], light = plan.masks[0].map((_, i) => (i % W >= 22 && i % W < 40 && ((i / W) | 0) >= 22 && ((i / W) | 0) < 36 ? 1 : 0));
  let li = 0, ln = 0, bo = 0, bn = 0;
  for (let i = 0; i < W * H; i++) if (light[i]) { li += t[i]; ln++; } else if (wash[i]) { bo += t[i]; bn++; }
  return { did, light: li / ln / (bo / bn) };
}
const damp = sheet => light => { const cells = [...light.keys()].filter(i => light[i]), observe = () => measurePaper(sheet, cells); return layIntoWetBed({ paper: observe(), observe, step: o => step(sheet, o), O }); };
const glossy = () => () => ({ wetWaits: 0 });

test('a light lifted from damp paint is lighter than one lifted while the wash is glossy', () => {
  const d = paint(damp), g = paint(glossy);
  assert.ok(d.did.liftStrokes > 0 && d.did.liftWait.wetWaits > 0, `waited ${d.did.liftWait.wetWaits} steps, ${d.did.liftStrokes} lift strokes`);
  assert.ok(d.light < g.light, `light against body: damp ${d.light.toFixed(3)}, glossy ${g.light.toFixed(3)}`);
});

test('the painter must wait for the shine before lifting', () => {
  assert.throws(() => paint(() => undefined), /wait for the shine/);
});
