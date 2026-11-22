import test from 'node:test';
import assert from 'node:assert/strict';
import { formRead, formOfCells, FORM_READ } from './form-read.mjs';
import { planStudyWashes } from './study-washes.mjs';
import { brushCeilingMm } from './form-brush.mjs';
import { formBases } from './form-base.mjs';
import { namedForms } from './named-forms.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred', 'umber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
const W = 320, H = 200, at = i => [(i % W) / 2, ((i / W) | 0) / 2];
// a block-in, 160 x 100 mm: a FACE (form 1) on the left graded in six close skin steps, a COAT (form 2) on the right
// graded the same way in blue, and paper round them
function study() {
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const [x, y] = at(i); let c = [255, 255, 255];
    if (x >= 10 && x < 70 && y >= 10 && y < 90) { const k = Math.floor((y - 10) / 80 * 6); c = [232 - 7 * k, 190 - 9 * k, 160 - 9 * k]; }
    if (x >= 90 && x < 150 && y >= 10 && y < 90) { const k = Math.floor((y - 10) / 80 * 6); c = [120 - 7 * k, 150 - 9 * k, 200 - 9 * k]; }
    rgb.set(c, i * 3);
  }
  return rgb;
}
// a later study: the same, with a mid-dark mark (L* about 50) in the face and one in the coat, each 4 x 3 mm
function later() {
  const rgb = study();
  for (let i = 0; i < W * H; i++) { const [x, y] = at(i); if (y >= 40 && y < 43 && ((x >= 30 && x < 34) || (x >= 110 && x < 114))) rgb.set([125, 115, 118], i * 3); }
  return rgb;
}
const thingMasks = { width: W, height: H, ids: Uint8Array.from({ length: W * H }, (_, i) => { const [x, y] = at(i); return y >= 10 && y < 90 ? (x >= 10 && x < 70 ? 1 : x >= 90 && x < 150 ? 2 : 0) : 0; }), names: ['face', 'coat'], kinds: ['face', 'clothing'], parents: [null, null] };
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const plan = (first = {}, second = null) => quiet(() => planStudyWashes({ k: pigments.length, w: W, h: H, studies: [{ rgb: study(), file: 'one', minMm2: 20, ...first }, ...(second ? [{ rgb: later(), file: 'two', minMm2: 4, ...second }] : [])], paperRGB: PAPER, pigments, sheetWidthMm: 160, washBrushMm: 5, washKitMm: [38, 25.4, 17, 10, 5], thingMasks }));
const inForm = (p, name) => p.instructions.filter(q => (q.forms ?? []).some(f => f.name === name && f.share >= 0.6));
const key = p => JSON.stringify(p.instructions.map(q => [q.id, q.areaMm2, q.strokes.length, q.colour]));

test('per-form settings are checked against the run\'s named forms; none leaves the reading as it was', () => {
  const named = namedForms(thingMasks, 80, 50);
  const none = formRead(undefined, named, { first: true }); assert.equal(none.none, true); assert.equal(none.per(1, 'clusters', 16), 16); assert.deepEqual(none.ids('clusters'), []); assert.equal(none.any(['clusters']), false);
  const f = formRead({ 1: { clusters: 24, floor: 3 }, 2: { formbase: 0 } }, named, { first: true });
  assert.equal(f.per(1, 'clusters', 16), 24); assert.equal(f.per(2, 'clusters', 16), 16); assert.equal(f.per(0, 'floor', 6), 6); assert.deepEqual(f.ids('floor'), [1]); assert.equal(f.any(['join', 'formbase']), true); assert.equal(f.any(['join']), false);
  assert.throws(() => formRead({ 3: { clusters: 8 } }, named, { first: true }), /numbered 1 to 2/); assert.throws(() => formRead({ 1: { lay: 0 } }, named, { first: true }), /not a setting of a form for the block-in/);
  assert.throws(() => formRead({ 1: { clusters: 8 } }, named), /not a setting of a form for a later study \(floor, lay, largest, lightest\)/); assert.throws(() => formRead({ 1: { floor: 2 } }, null), /no named forms/);
  assert.equal(formOfCells([0, 1, 2], named), 0); assert.ok(FORM_READ.first.includes('formbrush'));
  const cells = []; for (let q = 0; q < 80 * 50; q++) if (named.ids[q] === 2) cells.push(q); assert.equal(formOfCells(cells.slice(0, 50), named), 2);
});

// the block-in shapes with a cell in a form
const shapesIn = (p, id) => { const seen = new Set(); for (let i = 0; i < W * H; i++) if (thingMasks.ids[i] === id) seen.add(p.regions.labels[i]); return seen.size; };

test('colours of its own: more shapes in the face, the coat as it was; a form\'s own floor and its own count of shapes', () => {
  const base = plan({ read: { clusters: 4 } }), more = plan({ read: { clusters: 4 }, forms: { 1: { clusters: 12, join: 2 } } });
  assert.equal(key(plan({ read: { clusters: 4 } })), key(base), 'the plan is the same from the same studies');
  assert.ok(shapesIn(more, 1) >= shapesIn(base, 1) + 4, `more shapes in the face (${shapesIn(more, 1)} against ${shapesIn(base, 1)})`);
  assert.equal(shapesIn(more, 2), shapesIn(base, 2), 'the coat is read as before'); assert.ok(inForm(more, 'face').length > inForm(base, 'face').length, 'and more washes in the face');
  assert.deepEqual(inForm(more, 'coat').map(q => [q.areaMm2, q.colour]), inForm(base, 'coat').map(q => [q.areaMm2, q.colour]), 'the coat\'s washes are the same');
  // the face held to two shapes; and with a floor larger than most of its shapes they join
  const two = plan({ read: { clusters: 4 }, forms: { 1: { clusters: 12, join: 2, shapes: 2 } } }), broad = plan({ read: { clusters: 4 }, forms: { 1: { clusters: 12, join: 2, floor: 1000 } } });
  assert.ok(shapesIn(two, 1) <= 3 && shapesIn(two, 1) < shapesIn(more, 1), `held to two (${shapesIn(two, 1)})`); assert.ok(shapesIn(broad, 1) < shapesIn(more, 1), `fewer under a larger floor (${shapesIn(broad, 1)} against ${shapesIn(more, 1)})`);
  assert.equal(shapesIn(two, 2), shapesIn(base, 2)); assert.equal(shapesIn(broad, 2), shapesIn(base, 2));
  assert.throws(() => plan({ forms: { 7: { clusters: 8 } } }), /numbered 1 to 2/);
});

test('a form\'s own widest brush and its own say on the base wash, whatever its kind', () => {
  const named = namedForms(thingMasks, 80, 50), face = [], coat = [], paper = [];
  for (let q = 0; q < 80 * 50; q++) (named.ids[q] === 1 ? face : named.ids[q] === 2 ? coat : paper).push(q);
  assert.equal(brushCeilingMm(face, named, 17), 17); assert.equal(brushCeilingMm(paper, named, 17), Infinity);
  const per = id => (id === 1 ? 5 : null);
  assert.equal(brushCeilingMm(face, named, 17, per), 5); assert.equal(brushCeilingMm(coat, named, 17, per), 17, 'the other form keeps the kinds\' rule'); assert.equal(brushCeilingMm([...face, ...coat], named, 17, per), 5, 'a wash over both takes the smaller');
  assert.equal(brushCeilingMm(coat, named, 17, id => (id === 2 ? 38 : null)), 38, 'a form may be given a wider brush than its kind takes');
  // the base wash: both forms are soft kinds; the face's own 0 takes its away, and with the rule off the coat's own 1 gives it one
  const shapes = [{ cells: face, lab: [80, 10, 10], paper: false }, { cells: coat, lab: [60, 0, -20], paper: false }], label = Int32Array.from({ length: 80 * 50 }, (_, q) => (named.ids[q] === 2 ? 1 : 0)), noPaper = new Uint8Array(80 * 50);
  assert.deepEqual(formBases(named, label, shapes, noPaper, 4).bases.map(b => b.name), ['face', 'coat']);
  assert.deepEqual(formBases(named, label, shapes, noPaper, 4, { per: id => (id === 1 ? 0 : null) }).bases.map(b => b.name), ['coat']);
  assert.deepEqual(formBases(named, label, shapes, noPaper, 4, { on: false, per: id => (id === 2 ? 1 : null) }).bases.map(b => b.name), ['coat']);
  const p = plan({ forms: { 1: { formbrush: 5, formbase: 0 } } });
  assert.ok(inForm(p, 'face').every(q => q.widestBrushMm <= 5), 'every wash in the face is laid with the 5 mm brush'); assert.ok(!p.instructions.some(q => /base wash of face/.test(q.thing))); assert.ok(p.instructions.some(q => /base wash of coat/.test(q.thing)));
});

test('how much of a later study is laid: everywhere, nowhere, or in the forms that ask for it', () => {
  // the touches of the later study, by the form each lies in (the face is the left half of the sheet)
  const where = p => p.summary.touchLog.map(t => (t.cx < 80 ? 'face' : 'coat')).sort();
  // the marks are lighter than the study's rule keeps (L* 40): none is laid; with lightest 60 the coat's is (skin takes
  // no touches); the face's too when the face asks for this study by name; in one form alone when only it asks
  assert.deepEqual(where(plan({}, {})), []);
  assert.deepEqual(where(plan({}, { read: { lightest: 60 } })), ['coat']);
  assert.deepEqual(where(plan({}, { read: { lightest: 60 }, forms: { 1: { lay: 1 } } })), ['coat', 'face']);
  assert.deepEqual(where(plan({}, { forms: { 1: { lightest: 60, lay: 1 } } })), ['face']);
  assert.deepEqual(where(plan({}, { read: { lightest: 60 }, forms: { 1: { lay: 1 }, 2: { lay: 0 } } })), ['face']);
  assert.deepEqual(where(plan({}, { read: { lightest: 60, lay: 0 }, forms: { 2: { lay: 1 } } })), ['coat']);
  const off = plan({}, { read: { lightest: 60, lay: 0 } }); assert.deepEqual(where(off), []); assert.equal(off.summary.layersOfStudy[1].lay, 0);
  // a mark of 12 mm2: kept under the form's own largest, left out when the form's floor is above it or its largest below it
  assert.deepEqual(where(plan({}, { read: { lightest: 60 }, forms: { 2: { floor: 30 } } })), []); assert.deepEqual(where(plan({}, { read: { lightest: 60 }, forms: { 2: { largest: 5 } } })), []);
  assert.deepEqual(where(plan({}, { read: { lightest: 60 }, forms: { 2: { floor: 1, largest: 100 } } })), ['coat']);
});
