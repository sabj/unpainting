import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoDraws, strokesToLay } from './drawing-default.mjs';

const strokes = [{ seq: 1, drop: true, part: 'hatch' }, { seq: 2 }, { seq: 3, drop: false }, { seq: 4, drop: true, part: 'tone' }, { seq: 5, drop: true, part: 'outline' }, { seq: 6, drop: true, part: 'inner', phase: 'layin' }];

test('on a pencil lay-in Auto lays the lay-in and contour lines and leaves the ones tagged drop for the brush', () => {
  const r = strokesToLay({ medium: 'pencil', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [2, 3, 5, 6], 'a contour or a lay-in stroke is laid though tagged drop');
  assert.deepEqual(r.left.map(s => s.seq), [1, 4]);
  assert.match(r.rule, /pencil lay-in/);
  assert.equal(autoDraws({ drop: true }, 'graphite'), false);
});

test('on a pen drawing every line is laid, the dropped-tagged ones too: they carry the modelling', () => {
  const r = strokesToLay({ medium: 'ink', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6]);
  assert.equal(r.left.length, 0);
});

test('an author\'s chosen lines are laid exactly, tags or not', () => {
  const r = strokesToLay({ medium: 'pencil', chosen: 'lines edit', strokes });
  assert.deepEqual(r.strokes.map(s => s.seq), [1, 2, 3, 4, 5, 6]);
});
