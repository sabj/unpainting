import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTools, linesPictureDoc, allLinesDoc } from './session-tools.mjs';
import { linesListing } from './lines-edit.mjs';

// a 20 x 10 pixel map on a 100 x 50 mm sheet: the face (1) is the left half, an eye (2) a patch in it
const mask = { ids: Uint8Array.from({ length: 200 }, (_, i) => { const x = i % 20, y = (i / 20) | 0; return x >= 4 && x < 6 && y >= 4 && y < 6 ? 2 : x < 10 ? 1 : 0; }), width: 20, height: 10 };
const things = [{ thing: 'face', kind: 'face' }, { thing: 'eye', kind: 'eye', parentId: 1 }], forms = [{ id: 1, name: 'face', kind: 'face' }, { id: 2, name: 'eye', kind: 'eye' }];
const stroke = (seq, x, y, more = {}) => ({ seq, line: seq, part: 'outline', phase: 'growth', object: 0, dark: 0.3, path: [[x, y], [x + 4, y], [x + 8, y]], widths: [0.3], outline: [[[x, y - 0.1], [x + 8, y - 0.1], [x + 8, y + 0.1], [x, y + 0.1]]], medium: 'ink', ...more });
const vectors = { medium: 'ink', sheetMm: 100, heightMm: 50, strokes: [stroke(1, 10, 10), stroke(2, 20, 22), stroke(3, 60, 30, { drop: true }), stroke(4, 70, 40)] };
const base = { vectors, mask, things, forms, sheet: { widthMm: 100, heightMm: 50 }, studies: 3, listing: linesListing(vectors, { mask, forms }) };

test('a choice\'s tools are checked together: the forms first, then the lines and the per-form settings against them', () => {
  const tools = { forms: 'f.json', lines: 'l.json',
    formsEdit: { format: 'forms-edit 1', edits: [{ split: 'no named form', polygon: [[50, 0], [100, 0], [100, 50], [50, 50]], name: 'wall', kind: 'building' }, { rename: 'eye', to: 'left eye' }] },
    linesEdit: { format: 'lines-edit 1', rules: [{ where: { form: 'wall' }, do: 'after', weight: 2 }, { where: { tagged: 'drop' }, do: 'drop' }] },
    perForm: [['left eye', [[3, 'lay', 1], [3, 'lightest', 70]]], ['wall', [[1, 'shapes', 4]]]] };
  const got = resolveTools(tools, base);
  assert.deepEqual(got.formsNow.map(f => [f.id, f.name, f.kind]), [[1, 'face', 'face'], [2, 'left eye', 'eye'], [3, 'wall', 'building']]);
  assert.deepEqual(got.listing.strokes.map(s => s.form), ['face', 'left eye', 'wall', 'wall'], 'the lines are named for the forms as edited');
  assert.equal(got.lines.order, 'both'); assert.deepEqual([got.record.lines.auto, got.record.lines.before, got.record.lines.after, got.record.lines.dropped, got.record.lines.darker], [2, 0, 1, 1, 1]); assert.equal(got.record.lines.file, 'l.json');
  assert.deepEqual(got.sets, [['form2.study3.lay', '1'], ['form2.study3.lightest', '70'], ['form3.study1.shapes', '4']], 'a form is named to the planner by its number among the forms as edited');
  assert.deepEqual(got.record.perForm[2], { form: 'wall', id: 3, study: 1, setting: 'shapes', value: 4 }); assert.equal(got.record.forms.split, 1); assert.deepEqual(got.record.forms.now.map(f => f.name), ['face', 'left eye', 'wall']);
  assert.match(got.said, /^Your forms: 3 named forms \(2 given\): 1 cut out, 1 renamed\. Your drawing: of the drawing's 4 lines 2 are drawn when the painter would draw them, 0 before the first wash, 1 after the washes, 1 not at all; 1 weighted \(1 darker, 0 paler\)\. Per form: 3 settings in 2 forms \(left eye, wall\)\.$/);
  // nothing given is altered
  assert.equal(base.things[1].thing, 'eye'); assert.equal(vectors.strokes.length, 4); assert.equal(mask.ids[199], 0);
});

test('a tool that cannot work on this run is refused with the reason', () => {
  const lines = { linesEdit: { format: 'lines-edit 1', rules: [{ where: { form: 'wall' }, do: 'drop' }] } };
  // a rule that names a form no line has is a slip the author may make: it is warned of, and the rest is laid
  assert.deepEqual(resolveTools(lines, base).warnings.map(w => w.slice(0, 40)), ['lines edit, rule 1: no line has form "wa', 'lines edit, rule 1: no line matches its ']);
  assert.throws(() => resolveTools({ perForm: [['nose', [[1, 'clusters', 8]]]] }, base), /there is no form "nose" \(the forms: face, eye\)/);
  assert.throws(() => resolveTools({ perForm: [['eye', [[4, 'lay', 1]]]] }, base), /the subject has 3 studies/);
  assert.throws(() => resolveTools({ formsEdit: { format: 'forms-edit 1', edits: [{ rename: 'eye', to: 'x' }] } }, { ...base, mask: null, things: null, forms: [] }), /this subject has no named forms to edit/);
  assert.throws(() => resolveTools({ perForm: [['eye', [[1, 'clusters', 8]]]] }, { ...base, forms: [] }), /this subject has no named forms/);
  assert.throws(() => resolveTools(lines, { ...base, vectors: null, listing: null }), /no vector strokes to choose from/);
});

test('the pictures of the lines: every line as laid today, and a choice with its closing lines as ink', () => {
  assert.ok(allLinesDoc(vectors).strokes.every(s => s.drop === false)); assert.equal(vectors.strokes[2].drop, true);
  const doc = linesPictureDoc(vectors, [vectors.strokes[0]], [vectors.strokes[3]]);
  assert.deepEqual(doc.strokes.map(s => [s.seq, s.medium, s.dark]), [[1, 'graphite', 0.3], [4, 'ink', 1]]);
});

test('a medium alone, and lines of the author\'s own, are tools of a choice: checked, said, and warned of', () => {
  const pen = resolveTools({ medium: 'pen' }, base);
  assert.equal(pen.lines.laidAs, 'ink'); assert.match(pen.said, /the drawing is laid as a pen drawing .*\(you chose "pen"/); assert.equal(pen.record.lines.medium.chosen, 'pen');
  const own = resolveTools({ medium: 'none', linesEdit: { format: 'lines-edit 1', own: [{ points: [[1, 1], [9, 9]], medium: 'pencil', when: 'after' }] }, warnings: ['a warning of the choice itself'] }, base);
  assert.equal(own.lines.order, 'last'); assert.deepEqual(own.record.lines.own, { lines: 1, pen: 0, pencil: 1, before: 0, after: 1, lengthMm: 11 });
  assert.equal(own.warnings[0], 'a warning of the choice itself'); assert.ok(own.warnings.some(w => /pencil over the dry washes/.test(w)));
});
