import test from 'node:test';
import assert from 'node:assert/strict';
import { planStudyWashes } from './study-washes.mjs';
import { planListing, checkPlanEdit, applyPlanEdit, planFingerprint, editLine, PLAN_EDIT_FORMAT, NEAREST_WITHIN_L } from './plan-edit.mjs';
import { filmLab } from './puddles.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const PAPER = [252, 251, 248], pigments = ['hansa', 'ultramarine', 'cadred', 'umber'].map(key => boxPigment(BOX.find(p => p.key === key) ?? BOX[0]));
const W = 320, H = 200, KIT = [38, 25.4, 7, 5], ctx = { w: W, h: H, k: pigments.length, pigments, paperRGB: PAPER, sheetWidthMm: 160, kitMm: KIT, mono: { mono: false, note: 'not a monochrome subject' } };
// a block-in study, 160 x 100 mm: a tan wall, a darker cast shadow on it, a dark blue door, a red box beside the wall
function study() {
  const rgb = new Uint8ClampedArray(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const x = (i % W) / 2, y = ((i / W) | 0) / 2; let c = [255, 255, 255];
    if (x >= 20 && x < 120 && y >= 15 && y < 90) {
      c = [225, 200, 160];
      if (x - 30 > (y - 25) * 0.5 && x - 30 < (y - 25) * 0.5 + 25 && y >= 25 && y < 75) c = [170, 145, 110];
      if (x >= 95 && x < 110 && y >= 55 && y < 90) c = [45, 55, 75];
    }
    if (x >= 121 && x < 150 && y >= 40 && y < 90) c = [200, 90, 70];
    rgb.set(c, i * 3);
  }
  return rgb;
}
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const auto = () => quiet(() => planStudyWashes({ k: pigments.length, w: W, h: H, studies: [{ rgb: study(), file: 'test' }], paperRGB: PAPER, pigments, sheetWidthMm: 160, washBrushMm: 5, washKitMm: KIT }));
const plan = auto(), listing = planListing(plan, ctx), copy = () => JSON.parse(JSON.stringify(listing));
const shapes = p => p.layers.flatMap(l => l.shapes), apply = edit => quiet(() => applyPlanEdit(plan, edit, ctx));

test('the plan is written out wash by wash in painting order, numbered as value-plan.json numbers them', () => {
  assert.equal(listing.format, PLAN_EDIT_FORMAT); assert.equal(listing.of, planFingerprint(plan)); assert.equal(listing.of, planFingerprint(auto()), 'the same studies give the same plan');
  assert.equal(listing.washes.length, shapes(plan).length); assert.ok(listing.washes.length >= 5);
  assert.deepEqual(listing.sheet, { widthMm: 160, heightMm: 100 }); assert.deepEqual(listing.brushesMm, [38, 25.4, 7, 5]);
  listing.washes.forEach((x, i) => {
    const sh = shapes(plan)[i], q = plan.instructions[x.wash - 1];
    assert.equal(q.id, sh._valuePlan.id); assert.deepEqual(x.colour, q.colour); assert.equal(x.lay, q.move); assert.equal(x.brushMm, q.widestBrushMm); assert.equal(x.strength, 1); assert.equal(x.direction, null);
    assert.equal(x.about.strokes, q.strokes.length); assert.ok(x.about.what && x.about.boxMm.length === 4);
  });
  assert.ok(!JSON.stringify(listing).includes('"points"'), 'no outline or stroke geometry: the plan\'s picture is a look');
});

test('round trip: the plan written out and read back unchanged is the plan itself', () => {
  const { plan: back, record } = apply(copy());
  assert.equal(back, plan, 'the same object: nothing is rebuilt');
  assert.equal(record.unchanged, true); assert.equal(record.untouched, listing.washes.length); assert.equal(record.untouchedShare, 1);
  assert.match(editLine(record), /unchanged/);
  // the "about" notes are not read back
  const e = copy(); for (const x of e.washes) x.about = 'whatever'; assert.equal(apply(e).plan, plan);
});

test('a wash that is not touched is the planner\'s own object; a changed one keeps its cells', () => {
  const e = copy(), at = e.washes.findIndex(x => x.about.laidIn === 'lanes' && x.about.stage === 1); e.washes[at].strength = 0.5;
  const { plan: p, record } = apply(e), a = shapes(plan), b = shapes(p);
  assert.equal(record.changed, 1); assert.equal(record.untouched, a.length - 1); assert.deepEqual(record.fields, { strength: 1 }); assert.equal(record.unchanged, false);
  b.forEach((sh, i) => { if (i !== at) assert.equal(sh, a[i]); });
  assert.notEqual(b[at], a[at]); assert.equal(b[at].ids, a[at].ids); assert.equal(b[at]._valuePlan.strokes, a[at]._valuePlan.strokes);
  b[at].mix.forEach((v, j) => assert.ok(Math.abs(v - 0.5 * a[at].mix[j]) < 1e-9)); assert.ok(Math.abs(b[at].amount - 0.5 * a[at].amount) < 1e-9);
  assert.deepEqual(b[at]._valuePlan.edited, { of: [e.washes[at].wash], changed: ['strength'] });
  assert.equal(a[at].mix.reduce((s, v) => s + v, 0), a[at].amount, 'the planner\'s wash is not altered');
  // layers that hold no changed wash are the planner's own layers; the instructions follow the washes
  p.layers.forEach((l, i) => { if (!l.shapes.includes(b[at])) assert.equal(l, plan.layers[i]); });
  assert.deepEqual(p.instructions.map(q => q.id), b.map(sh => sh._valuePlan.id)); assert.equal(p.summary.edit, record); assert.equal(p.summary.plannedStrokes, plan.summary.plannedStrokes);
});

test('a colour asked for is mixed over what is under the wash, to that colour\'s value', () => {
  const e = copy(), at = e.washes.findIndex(x => x.about.stage === 1 && x.about.laidIn === 'lanes'); e.washes[at].colour = [150, 130, 100];
  const { plan: p, record } = apply(e), sh = shapes(p)[at];
  assert.deepEqual(record.fields, { colour: 1 }); assert.deepEqual(sh._valuePlan.colour, [150, 130, 100]);
  const want = filmLab(shapes(plan)[at].mix, pigments, PAPER)[0], got = filmLab(sh.mix, pigments, PAPER)[0];
  assert.ok(got < want - 5, `darker than the planner's (${got} against ${want})`);
  // a colour no darker than what lies under it lays nothing: refused with the reason
  const e2 = copy(), last = e2.washes.length - 1; e2.washes[last].colour = [250, 250, 248];
  assert.throws(() => apply(e2), /wash \d+: the colour asked for, \[250, 250, 248\] \(L\* 100\), is \d+ L\* lighter than what is already laid under it there \(L\* \d+: wash \d+ over \d+% of it.*Accepted here: a colour of L\* \d+ or darker \(yours at that value is \[\d+, \d+, \d+\]\); or leave this wash out/);
});

test('every fault of an edit is reported at once, each with its wash and what would be accepted', () => {
  // three washes asked far lighter than what is under them, one of them also given a brush: one answer names all three
  const e = copy(), over = e.washes.map((x, i) => i).filter(i => e.washes[i].about.stage === 3).slice(-3); assert.equal(over.length, 3);
  for (const i of over) e.washes[i].colour = [250, 250, 248];
  let err; try { apply(e); } catch (x) { err = x; }
  assert.equal(err.planEditFaults.length, 3); assert.match(err.message, /^plan edit: 3 things to correct, every one listed here; correct them all, then plan again\.\n- wash /);
  for (const i of over) assert.match(err.message, new RegExp(`\\n- wash ${e.washes[i].wash}: the colour asked for.*Accepted here: a colour of L\\* \\d+ or darker`));
  // the form of the file likewise: every bad entry in one answer
  const f = copy(); f.washes[0].lay = 'in a hurry'; f.washes[1].strength = 99; f.washes[2].brushMm = 9; f.washes.push({ wash: 999 }); f.nearestWithin = 400;
  let bad; try { checkPlanEdit(f, listing); } catch (x) { bad = x; }
  assert.equal(bad.planEditFaults.length, 5); assert.match(bad.message, /5 things to correct/);
  for (const re of [/"nearestWithin" is a number of L\*/, /wash \d+: "lay" is one of/, /"strength" is a factor from 0.05 to 4/, /"brushMm" 9 is not a brush of the kit \(38, 25.4, 7, 5 mm\)/, /there is no wash 999/]) assert.match(bad.message, re);
  assert.doesNotMatch(bad.message, /- plan edit, /, 'each line begins with its wash');
});

test('a colour a little lighter than what is under it is laid as the nearest that can be, with a note; the tolerance is the edit\'s own', () => {
  const e = copy(), at = e.washes.map((x, i) => i).filter(i => e.washes[i].about.stage === 3).at(-1), was = shapes(plan)[at];
  // what the place reads as under this wash: every wash before it over its cells
  const under = new Array(pigments.length).fill(0); let cells = 0; for (let i = 0; i < W * H; i++) if (was.mask[i]) cells++;
  for (const sh of shapes(plan).slice(0, at)) for (let i = 0; i < W * H; i++) if (was.mask[i] && sh.mask[i]) sh.mix.forEach((v, j) => { under[j] += v / cells; });
  const Lu = filmLab(under, pigments, PAPER)[0], grey = L => { const v = Math.round(255 * (L <= 8 ? L / 903.3 : ((L + 16) / 116) ** 3) ** (1 / 2.2)); return [v, v, v]; };
  e.washes[at].colour = grey(Lu + 4);
  const { plan: p, record } = apply(e), sh = shapes(p)[at];
  assert.equal(record.nearest, 1); assert.match(record.notes[0], /^wash \d+: the colour asked for \(L\* \d+\) is no darker than what is laid under it \(L\* \d+\); laid as the nearest that can be, a faint wash of your colour/);
  const strength = sh.mix.reduce((a, v) => a + v, 0); assert.ok(strength > 0 && strength < was.mix.reduce((a, v) => a + v, 0), 'a faint wash, not none and not the planner\'s');
  const after = filmLab(under.map((v, j) => v + sh.mix[j]), pigments, PAPER)[0]; assert.ok(after <= Lu && after > Lu - 6, `the place is a little darker than it was (${after.toFixed(1)} against ${Lu.toFixed(1)})`);
  // with no tolerance the same colour is refused; a colour far lighter is refused whatever the default
  assert.throws(() => apply({ ...e, nearestWithin: 0 }), /is [345]\.\d L\* lighter than what is already laid under it/);
  const far = copy(); far.washes[at].colour = grey(Lu + 20); assert.throws(() => apply(far), /is (19|2[0-2]) L\* lighter .*\(A colour up to 8 L\* lighter is laid as the nearest that can be\.\)/);
  assert.equal(apply({ ...far, nearestWithin: 25 }).record.nearest, 1); assert.equal(listing.nearestWithin, NEAREST_WITHIN_L);
});

test('a brush too wide for the wash, and strokes too small for water, are laid the nearest way with a note', () => {
  const e = copy(), small = e.washes.map((x, i) => i).filter(i => e.washes[i].about.laidIn === 'lanes').sort((a, b) => e.washes[a].about.areaMm2 - e.washes[b].about.areaMm2)[0];
  e.washes[small].lay = 'wet on wet'; e.washes[small].brushMm = 5;
  const { plan: p, record } = apply(e), q = shapes(p)[small]._valuePlan;
  if (q.move === 'wet on dry') assert.ok(record.notes.some(n => /too small to be laid into water; it is laid on the dry sheet/.test(n))); else assert.equal(q.move, 'wet on wet');
  assert.ok(q.strokes.length > 0);
});

test('brush and direction: the wash is laid again over the same cells; touches cannot be re-laid', () => {
  const e = copy(), at = e.washes.findIndex(x => x.about.laidIn === 'lanes' && x.about.areaMm2 > 1000); e.washes[at].brushMm = 7; e.washes[at].direction = 90;
  const { plan: p } = apply(e), a = shapes(plan)[at], b = shapes(p)[at];
  assert.equal(b.ids, a.ids); assert.deepEqual(b.mix, a.mix); assert.notEqual(b._valuePlan.strokes, a._valuePlan.strokes);
  assert.ok(b._valuePlan.strokes.every(st => st.radiusMm === 3.5)); assert.equal(b._valuePlan.widestBrushMm, 7);
  // the lanes run top to bottom: each stroke is taller than wide
  const tall = b._valuePlan.strokes.filter(st => { const xs = st.points.map(q => q[0]), ys = st.points.map(q => q[1]); return Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs); });
  assert.ok(tall.length >= 0.8 * b._valuePlan.strokes.length);
  const e2 = copy(); e2.washes[at].brushMm = 9; assert.throws(() => apply(e2), /not a brush of the kit/);
  const t = { ...listing, washes: listing.washes.map((x, i) => (i ? x : { ...x, about: { ...x.about, laidIn: 'touches' } })) }, e3 = JSON.parse(JSON.stringify(t)); e3.washes[0].direction = 10;
  assert.throws(() => checkPlanEdit(e3, t), /laid in touches/);
});

test('lay: a wash may go into clean water; beside damp needs its neighbour in the same session', () => {
  const e = copy(), at = e.washes.findIndex(x => x.lay === 'wet on dry' && x.about.areaMm2 > 1000); e.washes[at].lay = 'wet on wet';
  const q = shapes(apply(e).plan)[at]._valuePlan;
  assert.equal(q.move, 'wet on wet'); assert.equal(q.load.water, 0.88); assert.match(q.edges.policy, /soft/); assert.equal(q.baseBefore, 'wet');
  const e2 = copy(); e2.washes[1].lay = 'beside damp'; e2.washes[1].session = 'x'; assert.throws(() => apply(e2), /needs the entry just before it in the same "session"/);
  const e3 = copy(); e3.washes[1].lay = 'beside damp'; e3.washes[1].session = e3.washes[0].session;
  const p3 = apply(e3).plan; assert.equal(p3.layers[0].shapes.length, plan.layers[0].shapes.length + 1); assert.equal(p3.layers[0].shapes.at(-1)._valuePlan.move, 'beside damp');
  const e4 = copy(); e4.washes[0].lay = 'in a hurry'; assert.throws(() => apply(e4), /"lay" is one of/);
});

test('washes left out, moved and merged are counted; the merged wash holds the members\' cells and paint', () => {
  const e = copy(), n = e.washes.length, lanes = e.washes.map((x, i) => i).filter(i => e.washes[i].about.laidIn === 'lanes');
  const [a, b] = lanes.slice(-2), A = e.washes[a].wash, B = e.washes[b].wash, first = e.washes[0];
  e.washes[a] = { merge: [A, B] }; e.washes.splice(b, 1);     // two merged into one
  e.washes.splice(0, 1); e.washes.splice(1, 0, first);        // the first wash moved after the second
  const dropped = e.washes.splice(2, 1)[0];                   // one left out
  const { plan: p, record } = apply(e);
  assert.equal(record.merged, 1); assert.equal(record.mergedFrom, 2); assert.equal(record.dropped, 1); assert.equal(record.moved, 1); assert.equal(record.added, 0);
  assert.equal(record.untouched, n - 4); assert.equal(record.untouchedShare, +((n - 4) / n).toFixed(4)); assert.match(editLine(record), /2 merged into 1, 1 left out/);
  const all = shapes(p), was = shapes(plan), m = all.find(sh => sh._valuePlan.edited?.changed[0] === 'merged');
  assert.equal(all.length, n - 2); assert.ok(!all.includes(was[listing.washes.findIndex(x => x.wash === dropped.wash)]));
  const sa = was[a], sb = was[b]; let both = 0, lost = 0; for (let i = 0; i < W * H; i++) { const own = sa.mask[i] || sb.mask[i]; if (own) { both++; if (!m.mask[i]) lost++; } }
  assert.equal(lost, 0, 'every cell of the members is in the merged wash'); assert.ok(m.area >= both);
  const mass = sh => sh.mix.reduce((s, v) => s + v, 0) * sh.area; assert.ok(Math.abs(mass(m) - mass(sa) - mass(sb)) < 1e-6 * mass(m), 'the same paint');
  assert.ok(m._valuePlan.strokes.length > 0); assert.match(m._valuePlan.thing, /merged into one/);
  const twice = copy(); twice.washes.push({ wash: twice.washes[0].wash }); assert.throws(() => apply(twice), /named twice/);
  const none = copy(); none.washes.push({ wash: 999 }); assert.throws(() => apply(none), /there is no wash 999/);
});

test('a passage of the author\'s own is laid where it stands in the order, mixed to its colour over what is under it', () => {
  const e = copy(), own = { own: { id: 'mine', what: 'a dark bar', kind: 'wash', stage: 3, region: [[30, 20], [110, 20], [110, 30], [30, 30]], brushMm: 7, colour: [90, 80, 70], handling: { direction: 0 } }, lay: 'wet on wet' };
  e.washes.push(own);
  const { plan: p, record } = apply(e), all = shapes(p), sh = all.at(-1);
  assert.equal(record.added, 1); assert.equal(record.untouched, listing.washes.length); assert.equal(record.unchanged, false);
  all.slice(0, -1).forEach((s, i) => assert.equal(s, shapes(plan)[i]));
  assert.equal(sh._valuePlan.move, 'wet on wet'); assert.deepEqual(sh._valuePlan.colour, [90, 80, 70]); assert.ok(sh._valuePlan.strokes.length >= 1 && sh.area > 0);
  assert.equal(p.mixes[sh._valuePlan.mixId].stage, 3); assert.equal(p.instructions.at(-1).id, sh._valuePlan.id);
  const bad = c => { const x = copy(); x.washes.push({ own: { ...own.own, ...c } }); return () => apply(x); };
  assert.throws(bad({ colour: undefined }), /"colour" is \[red, green, blue\]/); assert.throws(bad({ kind: 'strokes', brushMm: undefined }), /names its "brushMm"/);
  assert.throws(bad({ region: undefined }), /needs a region/); assert.throws(bad({ charges: [{ at: [[1, 1]] }] }), /charges are not read/);
});

test('an edit of another plan, or of no plan, is refused', () => {
  const e = copy(); e.of = 'someotherplan0000'; assert.throws(() => apply(e), /"of" must stay as it was/);
  assert.throws(() => apply({ ...copy(), format: 'x' }), /"format" must stay/); assert.throws(() => apply({ ...copy(), washes: [] }), /an empty plan paints nothing/);
  assert.throws(() => apply([]), /one JSON object/); assert.throws(() => apply({ ...copy(), washes: [{ wash: 1, merge: [1, 2] }] }), /one of "wash"/);
});
