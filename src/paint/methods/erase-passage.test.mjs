import test from 'node:test';
import assert from 'node:assert/strict';
import { checkErase, eraseStrokes, eraserTakes, eraseSaid, layErase } from './erase-passage.mjs';
import { planScriptWashes } from './script-washes.mjs';
import { planStudyWashes } from './study-washes.mjs';
import { planListing, applyPlanEdit } from './plan-edit.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { makePaper } from '../../media/paper.mjs';
import { createSheet } from '../../media/sheet.mjs';
import { makePencil, gradePigment, layPencil } from '../../media/kit-graphite.mjs';
import { planSummary, planRows } from '../../../tools/paint/plan-data.mjs';
import { arrowsSvg } from '../../../tools/paint/work-sheets.mjs';

const quiet = f => { const log = console.log, said = []; console.log = (...a) => said.push(a.join(' ')); try { return { got: f(), said }; } finally { console.log = log; } };
const rub = { id: 'e1', what: 'the doubled ear line', stage: 1, kind: 'erase', widthMm: 3, strokes: [{ points: [[20, 20, 1], [50, 20, 1]] }] };

test('an erase passage is checked plainly, and its strokes are its own or lanes over its region', () => {
  assert.throws(() => checkErase({ ...rub, widthMm: 40 }, 'e1'), /eraser's width, 0.5 to 10 mm/);
  assert.throws(() => checkErase({ ...rub, paint: { pigments: { ochre: 1 } } }, 'e1'), /lays no paint/);
  assert.throws(() => checkErase({ ...rub, paper: 'wet' }, 'e1'), /needs dry paper/);
  assert.throws(() => checkErase({ ...rub, strokes: [] }, 'e1'), /needs its strokes .* or a region/);
  assert.throws(() => checkErase({ ...rub, strokes: [{ points: [[1, 1, 2], [3, 3, 1]] }] }, 'e1'), /pressure 0 to 1/);
  assert.doesNotThrow(() => checkErase(rub, 'e1'));
  const own = eraseStrokes(rub, 1); assert.equal(own.length, 1); assert.equal(own[0].radiusMm, 1.5); assert.equal(own[0].kind, 'rub');
  const lanes = eraseStrokes({ id: 'e2', kind: 'erase', widthMm: 4, region: [[10, 10], [40, 10], [40, 30], [10, 30]], handling: { pressure: 0.6 } }, 1);
  assert.ok(lanes.length >= 4, `${lanes.length} lanes over a 20 mm tall region`);
  assert.ok(lanes.every(s => s.points.every(q => q[2] === 0.6)), 'lanes rub at the passage pressure');
});

test('what an eraser takes is the kit eraser\'s: most from bare paper, about a fifth under a pale wash, a twentieth under a medium one', () => {
  const t = eraserTakes(1);
  assert.equal(t.bare, 0.85); assert.ok(t.underPale > 0.15 && t.underPale < 0.25, `${t.underPale}`); assert.ok(t.underMedium > 0.03 && t.underMedium < 0.06, `${t.underMedium}`); assert.equal(t.paint, 0.02);
  assert.ok(eraserTakes(0.3).bare < 0.3);
});

const keys = ['ochre', 'ultramarine'], pigments = keys.map(key => ({ ...boxPigment(BOX.find(p => p.key === key)), key }));
const wash = { id: 'p1', what: 'ground', stage: 1, kind: 'wash', region: [[10, 10], [70, 10], [70, 50], [10, 50]], paint: { pigments: { ochre: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } };
const script = passages => ({ format: 'painting-script 2', author: 'test', sheet: { widthMm: 80, heightMm: 60 }, palette: keys, brushes: { mop: { shape: 'round', widthMm: 12 } }, passages });

test('a script places an erase anywhere in its order: its own pass, its strokes in the plan, what it will do told, a wet wait warned', () => {
  const { got, said } = quiet(() => planScriptWashes({ script: script([rub, wash, { ...rub, id: 'e2', stage: 2, wait: 'none' }]), k: 2, w: 160, h: 120, pigments, sheetWidthMm: 80 }));
  assert.deepEqual(got.layers.map(l => (l._erase ? `erase ${l._erase.id}` : 'paint')), ['erase e1', 'paint', 'erase e2']);
  const q = got.instructions.filter(x => x.kind === 'erase');
  assert.equal(q.length, 2); assert.equal(q[0].erase.overPaintShare, 0); assert.equal(q[1].erase.overPaintShare, 1, 'the second rub passes over the wash');
  assert.ok(q.every(x => x.strokes.length && x.script.passage), 'its strokes are in the plan, for the arrows and the counts');
  assert.equal(got.summary.washes, 1); assert.equal(got.summary.erases, 2);
  assert.equal(got.summary.plannedStrokes, got.instructions.reduce((a, x) => a + x.strokes.length, 0), 'eraser strokes are counted strokes');
  assert.equal(q[0].erase.warning, null); assert.match(q[1].erase.warning, /WARNING, erase e2: it follows a passage laid wet with wait "none"/);
  assert.ok(said.some(l => /WARNING, erase e2/.test(l)));
  const text = eraseSaid(got.instructions);
  assert.match(text, /e1 \(1 stroke, 3 mm eraser, pressure 1\) takes off about 85% of the pencil where it passes bare paper, about 19% under a pale dried wash, 4% under a medium one and less under a dark one, and 2% of the paint/);
  assert.match(text, /100% of its path lies on paint planned before it/);
  const s = planSummary({ passes: got.instructions, summary: got.summary });
  assert.deepEqual([s.erases.passages, s.erases.strokes], [2, 2]); assert.equal(s.erases.said, text);
  assert.equal(planSummary({ passes: got.instructions.filter(x => x.kind !== 'erase'), summary: {} }).erases, undefined, 'a plan without an erase says nothing of one');
  // the arrows sheet and the plan's rows read value-plan.json's passes: the eraser strokes are there in their place
  assert.equal(arrowsSvg({ passes: got.instructions }, { widthMm: 80, heightMm: 60, width: 400 }).strokes, got.instructions.reduce((a, x) => a + x.strokes.length, 0));
  assert.deepEqual(planRows({ passes: got.instructions }).map(r => r.kind), ['erase', 'wash', 'erase']);
});

test('an edited plan takes an erase of its own between the planner\'s washes; the planner\'s own plan has none', () => {
  const PAPER = [252, 251, 248], pg = ['hansa', 'ultramarine', 'cadred', 'umber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
  const W = 160, H = 100, rgb = new Uint8ClampedArray(W * H * 3).fill(250);
  for (let y = 20; y < 80; y++) for (let x = 20; x < 140; x++) { const i = 3 * (y * W + x); rgb[i] = 150; rgb[i + 1] = 110; rgb[i + 2] = 80; }
  const ctx = { w: W, h: H, k: pg.length, pigments: pg, paperRGB: PAPER, sheetWidthMm: 160, kitMm: [38, 25.4, 7, 5], mono: { mono: false } };
  const { got: plan } = quiet(() => planStudyWashes({ k: pg.length, w: W, h: H, studies: [{ rgb, file: 'test' }], paperRGB: PAPER, pigments: pg, sheetWidthMm: 160, washBrushMm: 5, washKitMm: ctx.kitMm }));
  assert.ok(!plan.layers.some(l => l._erase) && !plan.instructions.some(q => q.kind === 'erase'));
  const listing = planListing(plan, ctx), [first, ...rest] = listing.washes.map(x => ({ wash: x.wash, session: x.session }));
  const edit = { ...listing, washes: [{ own: { ...rub, strokes: [{ points: [[30, 30, 1], [120, 30, 1]] }] } }, first, { own: { ...rub, id: 'e2', stage: 3, wait: 'none' } }, ...rest] };
  const { got } = quiet(() => applyPlanEdit(plan, edit, ctx));
  const order = got.plan.layers.map(l => (l._erase ? l._erase.id : 'w'));
  assert.equal(order[0], 'e1'); assert.equal(order[2], 'e2'); assert.equal(got.plan.layers.length, plan.layers.length + 2);
  const q = got.plan.instructions; assert.equal(q[0].kind, 'erase'); assert.equal(q.filter(x => x.kind === 'erase').length, 2); assert.equal(got.plan.summary.erases, 2);
  assert.equal(got.record.added, 2);
  assert.match(got.record.notes.join('\n'), /WARNING, erase e2/, 'e2 follows a wash with no wait: the edit is told');
  assert.throws(() => applyPlanEdit(plan, { ...edit, washes: [{ own: { ...rub, widthMm: 30 } }, first, ...rest] }, ctx), /eraser's width/);
});

const paint = { K: [0.3, 0.3, 0.1], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.25 };
const sheetOf = () => createSheet(makePaper(80, 40, { seed: 3, scale: 1, toothScale: 0.2 }), [paint, gradePigment('HB')]);
const sum = (a, y0, y1) => { let s = 0; for (let i = y0 * 80; i < y1 * 80; i++) s += a[i]; return s; };
const drawn = s => { const hb = makePencil({ grade: 'HB' }, 0.25); for (const y of [8, 28]) layPencil(s, hb, 1, [{ x: 5, y, p: 1 }, { x: 75, y, p: 1 }], { graphite: [1] }); };

test('the paint step rubs with the kit eraser: bare paper gives up most, pencil under a dried wash little; wet where it passes stops it', () => {
  const s = sheetOf(); drawn(s);
  const over = s.pigments.map(() => new Float32Array(s.n)); for (let i = 20 * 80; i < 40 * 80; i++) over[0][i] = 0.3; s.layers.push(over);
  const e = { id: 'e1', widthMm: 5, strokes: [{ points: [[5, 8, 1], [75, 8, 1]] }, { points: [[5, 28, 1], [75, 28, 1]] }] }, seen = [];
  const r = layErase(s, e, { cellMm: 1, graphite: [1], onStroke: x => seen.push(x.stroke) });
  assert.deepEqual(seen, [1, 2]);
  assert.ok(r[0].graphiteShare > 0.7, `bare ${r[0].graphiteShare}`); assert.ok(r[1].graphiteShare < r[0].graphiteShare / 3, `under ${r[1].graphiteShare}`);
  assert.ok(r[1].paintLifted > 0 && r[1].paintLifted < 0.02 * sum(over[0], 0, 40));
  const wet = sheetOf(); drawn(wet); const had = sum(wet.D[1], 0, 40);
  wet.W[30 * 80 + 40] = 0.2; wet.M[30 * 80 + 40] = 1;
  assert.doesNotThrow(() => layErase(wet, { ...e, strokes: [e.strokes[0]] }, { cellMm: 1, graphite: [1] }), 'wet away from its path: it rubs');
  const left = sum(wet.D[1], 0, 40); assert.ok(left < had);
  assert.throws(() => layErase(wet, { ...e, strokes: [e.strokes[1]] }, { cellMm: 1, graphite: [1] }), /erase e1, stroke 1: the sheet is wet where the eraser passes \(1 cells hold water\).*The painting stops here/);
  assert.equal(sum(wet.D[1], 0, 40), left, 'nothing rubbed');
  assert.throws(() => layErase(sheetOf(), e, { cellMm: 1, graphite: [] }), /no pencil on the sheet/);
});
