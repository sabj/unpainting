// Scrap test: the paper is not a shape (area-paper.mjs). A page area toned first (pass.tone), a figure inside it from
// the value ladder, and two blemishes the planner ignores: a foxing spot and a ruled border line. The page is laid as
// one even wash, the blemishes add no paint of their own, and the figure keeps its ladder paint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { layPassage, dryFully, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { validateAreaDocument, rasterAreaPlan, compileAreaLayers } from './semantic-areas.mjs';

const W = 64, H = 64, O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const palette = ['rawsienna', 'sepia'].map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const base = { dependsOn: [], edges: { kind: 'soft', overlap: false }, lights: { mode: 'paint-owned', reason: 'painted' }, brush: { widthMm: 8, kind: 'flat', contact: 'belly', orientation: 'sweep', pressure: [.6, .9, .6] }, load: { water: .62, pigmentScale: 1, waterQuantityMm3: 120, capacityMm3: 160, minRemainingFraction: .15, reload: 'before-stroke', rinse: 'fresh-brush-per-gesture', blot: 'none', concentrationSource: 'solver-calibrated' }, wetness: { required: 'dry', neighborCells: 2 }, stop: { after: 'pass', reason: 'look' }, move: 'wet on dry' };
const doc = (extra = {}) => ({ version: 1, coordinateSpace: 'normalized-target', target: { path: 't.png', sha256: 'a', width: W, height: H },
  areas: [
    { id: 'page', parent: null, intent: 'old toned paper', referenceCue: 'warm cream sheet', geometry: { polygon: box(0, 0, 1, 1), anchors: [] }, drawingRole: 'none', passes: [{ ...base, id: 'tone', order: 0, tone: { paint: { rawsienna: 1 }, amount: .05, reason: 'the drawing sits on a warm page: tone it first' } }, { ...base, id: 'marks', order: 2, valueRange: [1, 9] }] },
    { id: 'figure', parent: 'page', intent: 'the figure', referenceCue: 'sepia figure', geometry: { polygon: box(.4, .3, .7, .8), anchors: [] }, drawingRole: 'none', passes: [{ ...base, id: 'wash', order: 1, valueRange: [1, 9] }] }],
  edges: [{ areas: ['page', 'figure'], kind: 'soft', reason: 'the figure melts into the toned page' }],
  ignore: [{ polygon: box(.1, .1, .2, .2), reason: 'foxing on the old page, not part of the drawing' }, { polygon: box(0, .94, 1, 1), reason: 'the sheet border' }], ...extra });
const plan = d => rasterAreaPlan(validateAreaDocument(d, { targetSHA: 'a', imageSHA: 'a', sourceWidth: W, sourceHeight: H }), W, H);
const cellsIn = (x0, y0, x1, y1) => Uint8Array.from({ length: W * H }, (_, i) => (i % W >= x0 && i % W < x1 && ((i / W) | 0) >= y0 && ((i / W) | 0) < y1 ? 1 : 0));
// what the value ladder reads off such a page: the figure, a foxing speck and a border line, all as sepia demand
const ladder = () => [{ value: 2, pigment: 1, shapes: [cellsIn(26, 20, 44, 51), cellsIn(7, 7, 12, 12), cellsIn(0, 61, 64, 64)].map(m => ({ mask: m, amount: .3, mix: [0, .3], area: m.reduce((a, b) => a + b, 0) })) }];

test('a toned page is one wash over the whole sheet; ignored blemishes carry no paint; the figure keeps its own', () => {
  const p = plan(doc()), c = compileAreaLayers(p, ladder(), palette, { mmPerCell: 1, brushKit: [25, 7, 4, 3, 1.2] });
  const byKey = k => c.layers.filter(l => l._semantic.key === k).flatMap(l => l.shapes);
  const [tone] = byKey('page/tone');
  assert.equal(c.diagnostics.ignoredDemandCells, 25 + 192);
  assert.equal(byKey('page/marks').length, 0, 'the blemishes give the page no marks pass');
  assert.deepEqual(tone.mix, [.05, 0]);
  assert.ok(tone.area > .6 * W * H, `the tone covers the page area: ${tone.area} cells`);
  const fig = byKey('figure/wash'), figPaint = fig.reduce((a, x) => a + x.mix[1] * x.area, 0);
  assert.ok(fig.length >= 1 && Math.abs(figPaint - .3 * 18 * 31) < 1e-9, `the figure keeps all its paint: ${figPaint}`);
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), palette);
  for (const l of c.layers) for (const sh of l.shapes) { layPassage(sheet, sh.mask, sh.mix.map(v => 2.2 * v), { w: W, h: H, T: TECHNIQUES['wet on dry'], maxRadius: 6, seed: 3, O }); dryFully(sheet, O); }
  const t = thickness(sheet), mean = (k, m) => { let s = 0, n = 0; for (let i = 0; i < W * H; i++) if (m[i]) { s += t[k][i]; n++; } return s / n; };
  const open = cellsIn(12, 30, 22, 40), fox = cellsIn(7, 7, 12, 12), figure = cellsIn(30, 26, 40, 46);
  assert.ok(mean(0, open) > .01, `the open page is toned: ${mean(0, open).toFixed(4)}`);
  assert.ok(mean(1, fox) < .02 * mean(1, figure), `no sepia speck where the foxing was: ${mean(1, fox).toFixed(4)} vs figure ${mean(1, figure).toFixed(4)}`);
});

test('the validator: a tone is a wash with no value range and a reason; ignore needs polygons and reasons', () => {
  const bad = (f, re) => { const d = doc(); f(d); assert.throws(() => plan(d), re); };
  bad(d => { d.areas[0].passes[0].valueRange = [1, 9]; }, /no valueRange/);
  bad(d => { d.areas[0].passes[0].move = 'dry brush'; d.areas[0].passes[0].wetness.required = 'dry'; }, /a tone is a wash/);
  bad(d => { d.areas[0].passes[0].tone.amount = 0; }, /amount/);
  bad(d => { delete d.areas[0].passes[0].tone.reason; }, /reason/);
  bad(d => { d.ignore[0].reason = ''; }, /ignore.reason/);
  bad(d => { d.ignore = {}; }, /ignore must be a list/);
});
