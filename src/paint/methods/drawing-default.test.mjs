import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRule, strokesToLay } from './drawing-default.mjs';

// eight strokes, each fitted to its own line (line = seq); lines 4 and 8 are the drawing's most important
const strokes = [{ seq: 1, line: 1, drop: true, part: 'hatch', dark: 0.5 }, { seq: 2, line: 2, dark: 0.35 }, { seq: 3, line: 3, drop: false, dark: 0.2 },
  { seq: 4, line: 4, drop: true, part: 'tone', dark: 0.9 }, { seq: 5, line: 5, drop: true, part: 'outline', dark: 0.9 }, { seq: 6, line: 6, drop: true, part: 'inner', phase: 'layin', dark: 0.3 },
  { seq: 7, line: 7, drop: true, part: 'inner', phase: 'growth', dark: 1 }, { seq: 8, line: 8, drop: true, part: 'texture', phase: 'texture', dark: 1 }];
const lines = { lines: [1, 2, 3, 4, 5, 6, 7, 8].map(seq => ({ seq, contribution: [4, 8].includes(seq) ? 50 : seq })) };

test('on a pencil lay-in Auto lays the lines that place the forms and leaves the hatching, tone and texture for the brush', () => {
  const r = strokesToLay({ medium: 'pencil', strokes }, lines);
  assert.deepEqual(r.strokes.map(s => s.seq), [2, 3, 5, 6, 7, 8], 'contour, lay-in, inner contour of the growth, and texture of a most important line');
  assert.deepEqual(r.left.map(s => s.seq), [1, 4], 'hatching, and tone even of an important line');
  assert.match(r.rule, /pencil lay-in/);
});

test('the strokes kept from drop are laid at the lay-in\'s darkness, those of the most important lines up to twice it', () => {
  const R = autoRule({ medium: 'pencil', strokes }, lines);
  assert.equal(R.level, 0.35);
  const r = strokesToLay({ medium: 'pencil', strokes }, lines);
  assert.deepEqual(r.strokes.map(s => s.dark), [0.35, 0.2, 0.35, 0.3, 0.35, 0.7]);
  assert.equal(r.strokes[2].darkAsDrawn, 0.9);
});

test('without the lines\' importance the rule is by tags alone, and says so', () => {
  const r = strokesToLay({ medium: 'pencil', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [2, 3, 5, 6, 7]);
  assert.match(r.rule, /gives no importance/);
});

test('on a pen drawing every line is laid as drawn: there the lines carry the modelling', () => {
  const r = strokesToLay({ medium: 'ink', strokes }, lines);
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.left.length, 0);
  assert.equal(r.strokes[3].dark, 0.9);
});

test('an author\'s chosen lines are laid exactly, tags or not', () => {
  const r = strokesToLay({ medium: 'pencil', chosen: 'lines edit', strokes }, lines);
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.strokes[3].dark, 0.9);
});

test('a stroke in a named feature of a face (an eye, the lips) is kept, though short and tagged texture', () => {
  // a 10 x 10 mm sheet, its form map 10 x 10: the right half is 'left eye' (id 2, kind eye), the rest 'face' (id 1)
  const ids = Uint8Array.from({ length: 100 }, (_, i) => (i % 10 >= 5 ? 2 : 1));
  const forms = { width: 10, height: 10, ids, list: [{ id: 1, name: 'face', kind: 'face' }, { id: 2, name: 'left eye', kind: 'eye' }] };
  const at = (seq, x, part = 'texture') => ({ seq, line: seq, drop: true, part, phase: 'texture', dark: 0.9, path: [[x, 5], [x + 1, 5]] });
  const doc = { medium: 'pencil', sheetMm: 10, heightMm: 10, strokes: [{ seq: 1, line: 1, dark: 0.3 }, at(2, 7), at(3, 2), at(4, 7, 'tone')] };
  const r = strokesToLay(doc, null, forms);
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 4], 'the eye\'s texture and tone strokes, not the face\'s');
  assert.equal(r.strokes[1].dark, 0.6);
  assert.match(r.rule, /features \(left eye\)/);
  const lips = { ...forms, list: [{ id: 1, name: 'face', kind: 'face' }, { id: 2, name: 'lips', kind: 'other' }] };
  assert.deepEqual(strokesToLay(doc, null, lips).strokes.map(s => s.seq), [1, 2, 4], 'named lips are a feature');
});
