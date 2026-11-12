// Scrap test: colour and value changed inside the wet wash (area-washes.mjs, area-charge-run.mjs). A one-area plan
// with a graded, a variegated and a charged pass is compiled as the painter compiles it; the loads are then laid on
// scrap the way tools/plate/paint.mjs lays them (each load dipped at the plane or mix where it lies), and the charge is
// laid by the painter's own chargeWetPass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { dip, stroke } from '../../src/media/brush.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { dryFully, layPassage, passagePaths, brushFor, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { measurePaper } from '../../src/paint/methods/wetdry.mjs';
import { planeAt } from '../../src/paint/methods/graded-demand.mjs';
import { brushedWashPaths } from '../../src/media/wash.mjs';
import { validateAreaDocument, rasterAreaPlan, compileAreaLayers } from './semantic-areas.mjs';
import { variegatedCharge, chargeMix } from './area-washes.mjs';
import { chargeWetPass } from './area-charge-run.mjs';

const W = 64, H = 64, O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const palette = ['ochre', 'ultramarine', 'rose'].map(k => ({ ...boxPigment(BOX.find(p => p.key === k)), key: k }));
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pass = extra => ({ id: 'sky', order: 0, dependsOn: [], valueRange: [1, 9], move: 'wet on dry', edges: { kind: 'soft', overlap: true }, lights: { mode: 'paint-owned', reason: 'painted' }, brush: { widthMm: 4, kind: 'flat', contact: 'belly', orientation: 'sweep', pressure: [.6, .9, .6] }, load: { water: .62, pigmentScale: 1, waterQuantityMm3: 120, capacityMm3: 160, minRemainingFraction: .15, reload: 'before-stroke', rinse: 'fresh-brush-per-gesture', blot: 'none', concentrationSource: 'solver-calibrated' }, wetness: { required: 'dry', neighborCells: 2 }, stop: { after: 'pass', reason: 'look' }, ...extra });
const doc = extra => ({ version: 1, coordinateSpace: 'normalized-target', target: { path: 't.png', sha256: 'a', width: W, height: H }, areas: [{ id: 'sky', parent: null, intent: 'sky', referenceCue: 'sky', geometry: { polygon: box(0, 0, 1, 1), anchors: [] }, drawingRole: 'none', passes: [pass(extra)] }] });
const plan = d => rasterAreaPlan(validateAreaDocument(d, { targetSHA: 'a', imageSHA: 'a', sourceWidth: W, sourceHeight: H }), W, H);
const square = Uint8Array.from({ length: W * H }, (_, i) => (i % W >= 8 && i % W < 56 && ((i / W) | 0) >= 8 && ((i / W) | 0) < 56 ? 1 : 0));
const shape = mix => ({ mask: Uint8Array.from(square), amount: mix.reduce((a, b) => a + b, 0), mix, area: 48 * 48 });
const compiled = (extra, mix) => compileAreaLayers(plan(doc(extra)), [{ value: 1, pigment: 0, shapes: [shape(mix)] }], palette, { mmPerCell: 10 }).layers[0].shapes[0];
const fresh = () => createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), palette);
const r = 3, T = TECHNIQUES['wet on dry'], brush = () => brushFor(r, T, 7);
// the pass's lanes, laid across the wash direction as the painter lays them (paint.mjs brushedWashPaths at the shape's
// _washAngle), each dipped for itself at the plane or mix where it lies, as paint.mjs dips each load
const layLanes = (sheet, conc, angle) => { brushedWashPaths(square, W, H, { maxRadius: 6, seed: 3, walk: false, ...(angle != null ? { angle } : {}) }).forEach((lane, k) => { const b = brushFor(Math.max(1, ...lane.map(p => p.r)), T, 31 + k); dip(b, { water: T.water, conc: conc(lane) }); stroke(b, sheet, lane, { upright: 'sweep' }); }); };
const rows = (t, y0, y1) => { let a = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = 12; x < 52; x++) { a += t[y * W + x]; c++; } return a / c; };

test('a graded wash: the plan direction and strengths become each shape\'s plane, mean one, and the dried wash fades along it', () => {
  const sh = compiled({ wash: { kind: 'graded', direction: [0, 1], strength: [1, .25], reason: 'sky pales to the horizon' } }, [.3, 0, 0]);
  let mean = 0, c = 0; for (let i = 0; i < W * H; i++) if (square[i]) { mean += planeAt(sh._plane, i % W + .5, (i / W | 0) + .5); c++; }
  assert.ok(Math.abs(mean / c - 1) < 1e-6, `mean ${mean / c}`);
  assert.ok(planeAt(sh._plane, 30, 10) > 2 * planeAt(sh._plane, 30, 54));
  assert.ok(Math.abs(Math.abs(sh._washAngle) - Math.PI / 2) < 1e-9, 'a downward wash is laid in level lanes');
  const graded = fresh(), flat = fresh();
  layLanes(graded, lane => sh.mix.map(v => 2.2 * v * lane.reduce((a, q) => a + planeAt(sh._plane, q.x, q.y), 0) / lane.length), sh._washAngle);
  layLanes(flat, () => sh.mix.map(v => 2.2 * v), sh._washAngle);
  dryFully(graded, O); dryFully(flat, O);
  const g = thickness(graded)[0], f = thickness(flat)[0];
  assert.ok(rows(g, 10, 20) > 1.5 * rows(g, 44, 54), `graded top ${rows(g, 10, 20).toFixed(3)} bottom ${rows(g, 44, 54).toFixed(3)}`);
  assert.ok(rows(f, 10, 20) < 1.25 * rows(f, 44, 54), `flat top ${rows(f, 10, 20).toFixed(3)} bottom ${rows(f, 44, 54).toFixed(3)}`);
});

test('a variegated wash turns from the pass colour to the second colour along its direction, the same pigment throughout', () => {
  const sh = compiled({ wash: { kind: 'variegated', direction: [0, 1], paint: { rose: 1 }, reason: 'ochre field warms to rose below' } }, [.3, 0, 0]);
  assert.deepEqual(sh._variegate.mix.map(v => +v.toFixed(6)), [0, 0, .3]);
  const sheet = fresh();
  layLanes(sheet, lane => variegatedCharge(sh.mix, sh._variegate.mix, sh._variegate.span, lane, 1).map(v => 2.2 * v), sh._washAngle);
  dryFully(sheet, O);
  const t = thickness(sheet), ochre = t[0], rose = t[2];
  assert.ok(rows(ochre, 10, 20) > 2 * rows(ochre, 44, 54) && rows(rose, 44, 54) > 2 * rows(rose, 10, 20), `ochre ${rows(ochre, 10, 20).toFixed(3)}->${rows(ochre, 44, 54).toFixed(3)}, rose ${rows(rose, 10, 20).toFixed(3)}->${rows(rose, 44, 54).toFixed(3)}`);
  assert.ok(rows(ochre, 30, 34) > 0.05 * rows(ochre, 10, 20) && rows(rose, 30, 34) > 0.05 * rows(rose, 44, 54), 'the middle holds both');
});

test('a charge drops a second colour into the wet wash; once the wash has dried it is not laid', () => {
  const p = plan(doc({ charge: { paint: { ultramarine: 1 }, strength: 1, water: .5, reason: 'cool shadow dropped into the warm wash', polygon: box(.4, .4, .8, .8) } })).passes.get('sky/sky').pass;
  const run = dried => {
    const sheet = fresh();
    layPassage(sheet, square, [.3 * 2.2, 0, 0], { w: W, h: H, T, maxRadius: 6, seed: 3, O, settle: 0 });
    if (dried) dryFully(sheet, O);
    const did = chargeWetPass({ pass: p, plan: plan(doc({})), mask: square, W, H, r, mix: chargeMix(p, palette, .3, 'sky/sky'), strength: 2.2, newBrush: brush, dip: (b, o) => dip(b, { ...o, water: p.charge.water }), stroke: (b, path, o) => stroke(b, sheet, path, { ...o, upright: true }), observe: cells => measurePaper(sheet, cells), as: () => {}, restore: () => {} });
    dryFully(sheet, O);
    const blue = thickness(sheet)[1]; let inside = 0, outside = 0;
    for (let y = 30; y < 48; y++) for (let x = 30; x < 48; x++) inside += blue[y * W + x];
    for (let y = 10; y < 20; y++) for (let x = 10; x < 28; x++) outside += blue[y * W + x];
    return { did, inside, outside };
  };
  const wet = run(false), dry = run(true);
  assert.ok(wet.did.laid > 0 && wet.inside > 10 * wet.outside, JSON.stringify(wet));
  assert.ok(dry.did.laid === 0 && dry.did.skippedDry === dry.did.lanes && dry.inside === 0, JSON.stringify(dry.did));
});

test('the validator: wash and charge only on wet passes, with reasons, no brush wetter than the wash, known pigments', () => {
  const bad = (extra, re) => assert.throws(() => plan(doc(extra)), re);
  bad({ wash: { kind: 'graded', direction: [0, 0], strength: [1, .5], reason: 'x' } }, /direction/);
  bad({ wash: { kind: 'graded', direction: [0, 1], strength: [1, 1], reason: 'x' } }, /strength/);
  bad({ wash: { kind: 'swirl', direction: [0, 1], reason: 'x' } }, /graded or variegated/);
  bad({ wash: { kind: 'variegated', direction: [0, 1], paint: {}, reason: 'x' } }, /paint/);
  bad({ move: 'dry brush', wash: { kind: 'graded', direction: [0, 1], strength: [1, .5], reason: 'x' } }, /wet on wet or wet on dry/);
  bad({ charge: { paint: { rose: 1 }, strength: 1, water: .9, reason: 'x' } }, /wetter than the wash/);
  bad({ charge: { paint: { rose: 1 }, strength: 1, water: .5 } }, /reason/);
  bad({ charge: { paint: { rose: 1 }, strength: 1, water: .5, reason: 'x', drip: 1 } }, /unknown field drip/);
  assert.throws(() => compiled({ wash: { kind: 'variegated', direction: [0, 1], paint: { viridian: 1 }, reason: 'x' } }, [.3, 0, 0]), /not on this run's palette/);
  // a picked palette names its pans; the box key is found by name
  const named = compileAreaLayers(plan(doc({ wash: { kind: 'variegated', direction: [0, 1], paint: { rose: 1 }, reason: 'x' } })), [{ value: 1, pigment: 0, shapes: [shape([.3, 0, 0])] }], palette.map(({ key, ...p }) => p), { mmPerCell: 10 }).layers[0].shapes[0];
  assert.deepEqual(named._variegate.mix.map(v => +v.toFixed(6)), [0, 0, .3]);
});

test('a pass is one closed wash: gaps narrower than its brush are filled, reserved lights stay paper, the paint is unchanged', () => {
  const d = doc({ lights: { mode: 'paper', reason: 'a reserved light', polygon: box(.4, .4, .5, .5) } });
  // stripes two cells wide with two-cell gaps, as the value ladder leaves them; a 4 mm brush at 1 mm a cell spans the gaps
  const stripes = Uint8Array.from({ length: W * H }, (_, i) => (square[i] && (i % W) % 4 < 2 ? 1 : 0)), area = stripes.reduce((a, b) => a + b, 0);
  const sh = compileAreaLayers(plan(d), [{ value: 1, pigment: 0, shapes: [{ mask: stripes, amount: .3, mix: [.3, 0, 0], area }] }], palette, { mmPerCell: 1 }).layers[0].shapes[0];
  const m = sh.mask; let inside = 0, light = 0;
  for (let y = 10; y < 54; y++) for (let x = 10; x < 54; x++) inside += m[y * W + x];
  for (let y = 26; y < 32; y++) for (let x = 26; x < 32; x++) light += m[y * W + x];
  assert.ok(inside > .9 * 44 * 44 - 36, `closed: ${inside} of ${44 * 44}`);
  assert.equal(light, 0, 'the reserved light is left out');
  // the reserved light's own cells carry no paint into any pass (they are paper); every other cell's paint is kept
  let kept = 0; for (let i = 0; i < W * H; i++) if (stripes[i] && !(i % W >= 26 && i % W < 32 && ((i / W) | 0) >= 26 && ((i / W) | 0) < 32)) kept++;
  assert.ok(Math.abs(sh.mix[0] * sh.area - .3 * kept) < 1e-9, `same paint, spread over the closed shape: ${sh.mix[0] * sh.area} vs ${.3 * kept}`);
  assert.throws(() => compileAreaLayers(plan(doc({})), [{ value: 1, pigment: 0, shapes: [shape([.3, 0, 0])] }], palette), /mmPerCell/);
});

test('a wash outline is the brush\'s: spurs narrower than the brush are opened away with their paint kept; a shape too thin for its brush is left out, counted', () => {
  // a square with one-cell spurs sticking out of it, as a ladder band leaves its pixels
  const ragged = Uint8Array.from(square); for (let y = 10; y < 56; y += 12) for (let x = 56; x < 60; x++) ragged[y * W + x] = 1;
  const area = ragged.reduce((a, b) => a + b, 0);
  const sh = compileAreaLayers(plan(doc({})), [{ value: 1, pigment: 0, shapes: [{ mask: ragged, amount: .3, mix: [.3, 0, 0], area }] }], palette, { mmPerCell: 1 }).layers[0].shapes[0];
  let spur = 0; for (let y = 10; y < 56; y += 12) spur += sh.mask[y * W + 59];
  assert.equal(spur, 0, 'the spur tips are gone (a brush leaves only a fillet at the root)');
  assert.ok(Math.abs(sh.mix[0] * sh.area - .3 * area) < 1e-9, 'and their paint stays in the wash');
  const line = Uint8Array.from({ length: W * H }, (_, i) => ((i / W) | 0) === 30 && i % W > 8 && i % W < 56 ? 1 : 0);
  const thin = compileAreaLayers(plan(doc({})), [{ value: 1, pigment: 0, shapes: [{ mask: line, amount: .3, mix: [.3, 0, 0], area: 47 }] }], palette, { mmPerCell: 1 });
  assert.equal(thin.layers.length, 0, 'a line narrower than the brush is left out');
  assert.deepEqual(thin.diagnostics.narrowerThanBrush.map(x => [x.pass, x.cells]), [['sky/sky', 47]]);
});
