import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoDraws, strokesToLay, layInDark } from './drawing-default.mjs';

const strokes = [{ seq: 1, drop: true, part: 'hatch', dark: 0.5 }, { seq: 2, dark: 0.35 }, { seq: 3, drop: false, dark: 0.2 }, { seq: 4, drop: true, part: 'tone', dark: 0.9 }, { seq: 5, drop: true, part: 'outline', dark: 0.9 }, { seq: 6, drop: true, part: 'inner', phase: 'layin', dark: 0.3 }, { seq: 7, drop: true, part: 'inner', phase: 'growth', dark: 1 }, { seq: 8, drop: true, part: 'inner', phase: 'texture', dark: 1 }];

test('on a pencil lay-in Auto lays the lay-in and contour lines and leaves the ones tagged drop for the brush', () => {
  const r = strokesToLay({ medium: 'pencil', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [2, 3, 5, 6, 7], 'a contour, a lay-in stroke or an inner contour of the growth is laid though tagged drop');
  assert.deepEqual(r.left.map(s => s.seq), [1, 4, 8]);
  assert.equal(layInDark({ strokes }), 0.35);
  assert.deepEqual(r.strokes.map(s => s.dark), [0.35, 0.2, 0.35, 0.3, 0.35], 'kept at most as dark as the drawing\'s own lay-in lines');
  assert.equal(r.strokes[2].darkAsDrawn, 0.9);
  assert.match(r.rule, /pencil lay-in/);
  assert.equal(autoDraws({ drop: true }, 'graphite'), false);
});

test('on a pen drawing every line is laid, the dropped-tagged ones too: they carry the modelling', () => {
  const r = strokesToLay({ medium: 'ink', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.left.length, 0);
  assert.equal(r.strokes[3].dark, 0.9, 'a pen drawing as drawn');
});

test('an author\'s chosen lines are laid exactly, tags or not', () => {
  const r = strokesToLay({ medium: 'pencil', chosen: 'lines edit', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.strokes[3].dark, 0.9);
});
