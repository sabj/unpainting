import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linesListing, checkLinesEdit, applyLinesEdit, writeLinesEdit, linesLine, LINES_EDIT_FORMAT } from './lines-edit.mjs';
import { layVectors } from '../../src/paint/methods/ink-vectors.mjs';

// a drawing on a 100 x 50 mm sheet: an outline along the top, an inner line, two strokes of hatching the maker would
// drop, and a short dark accent; the left half of the sheet is the form "face"
const stroke = (seq, part, y, x0, x1, dark, more = {}) => ({ seq, line: seq, part, phase: part === 'hatch' ? 'texture' : 'growth', object: seq < 3 ? 0 : 1, dark, path: [[x0, y], [(x0 + x1) / 2, y], [x1, y]], widths: [0.3, 0.3, 0.3],
  outline: [[[x0, y - 0.15], [x1, y - 0.15], [x1, y + 0.15], [x0, y + 0.15]]], medium: 'graphite', ...more });
const vectors = (medium = 'ink') => ({ source: 'test', medium: medium === 'ink' ? 'ink' : 'pencil', sheetMm: 100, heightMm: 50, fills: 'marked', strokes: [stroke(1, 'outline', 5, 10, 90, 0.3), stroke(2, 'inner', 15, 10, 40, 0.2), stroke(3, 'hatch', 25, 60, 90, 0.15, { drop: true }), stroke(4, 'hatch', 30, 60, 90, 0.15, { drop: true }), stroke(5, 'small', 40, 20, 24, 0.6)].map(s => ({ ...s, medium: medium === 'ink' ? 'ink' : 'graphite' })) });
const lines = () => ({ medium: 'pencil', lines: [1, 2, 3, 4, 5].map(seq => ({ seq, points: [[0, 0], [1, 1]] })) });
const mask = { ids: Uint8Array.from({ length: 20 * 10 }, (_, i) => (i % 20 < 10 ? 1 : 0)), width: 20, height: 10 }, forms = [{ id: 1, name: 'face' }];
const listing = () => linesListing(vectors(), { mask, forms }), edit = rules => ({ format: LINES_EDIT_FORMAT, rules });

test('every stroke is listed with what an author chooses by: its part, tag, darkness, length, width and form', () => {
  const l = listing();
  assert.deepEqual(l.strokes.map(s => [s.id, s.part, s.tagged, s.dark, s.lengthMm, s.widthMm, s.form]), [[1, 'outline', 'ink', 0.3, 80, 0.3, 'none'], [2, 'inner', 'ink', 0.2, 30, 0.3, 'face'], [3, 'hatch', 'drop', 0.15, 30, 0.3, 'none'], [4, 'hatch', 'drop', 0.15, 30, 0.3, 'none'], [5, 'small', 'ink', 0.6, 4, 0.3, 'face']]);
  assert.deepEqual(l.counts.tagged, { ink: 3, drop: 2 }); assert.equal(l.linesAfterTheWashes, true); assert.equal(linesListing(vectors('pencil')).linesAfterTheWashes, false); assert.match(linesListing(vectors('pencil')).note, /pencil before the washes only/); assert.deepEqual(l.strokes[0].boxMm, [10, 5, 90, 5]); assert.deepEqual(l.sheet, { widthMm: 100, heightMm: 50 });
  assert.ok(!JSON.stringify(l).includes('outline":[['), 'no stroke geometry beyond its box');
});

test('rules in order, the later winning: lines dropped, moved after the washes and weighted; no stroke\'s shape changes', () => {
  const v = vectors(), got = applyLinesEdit(v, lines(), edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { form: 'face', lengthBelowMm: 10 }, do: 'after', weight: 1.5 }, { where: { ids: [2] }, weight: 0.5 }, { where: { ids: 4 }, do: 'before' }]), listing());
  assert.equal(got.order, 'both');
  assert.deepEqual(got.opening.vectors.strokes.map(s => [s.seq, s.dark]), [[1, 0.3], [2, 0.1], [4, 0.15]]); assert.deepEqual(got.closing.vectors.strokes.map(s => [s.seq, s.dark, s.darkAsDrawn]), [[5, 0.9, 0.6]]);
  assert.equal(got.opening.vectors.strokes[0], v.strokes[0], 'an unweighted stroke is the record\'s own'); assert.equal(got.closing.vectors.strokes[0].outline, v.strokes[4].outline); assert.equal(v.strokes[4].dark, 0.6);
  assert.deepEqual(got.opening.lines.lines.map(g => g.seq), [1, 2, 4]); assert.deepEqual(got.closing.lines.lines.map(g => g.seq), [5]);
  assert.deepEqual({ ...got.record, rules: got.record.rules.map(r => r.lines) }, { strokes: 5, before: 3, after: 1, dropped: 1, lengthMm: { before: 140, after: 4, dropped: 30 }, weighted: 2, darker: 1, paler: 1, rules: [2, 1, 1, 1] });
  assert.match(linesLine(got.record), /of the drawing's 5 lines 3 are drawn before the washes, 1 after them, 1 not at all; 2 weighted \(1 darker, 1 paler\)/);
  // weight never takes a line past black; all after is "last", all dropped is "none"
  assert.equal(applyLinesEdit(vectors(), lines(), edit([{ where: { ids: [5] }, weight: 4 }]), listing()).opening.vectors.strokes[4].dark, 1);
  assert.equal(applyLinesEdit(vectors(), lines(), edit([{ where: {}, do: 'after' }]), listing()).order, 'last'); assert.equal(applyLinesEdit(vectors(), lines(), edit([{ where: {}, do: 'drop' }]), listing()).order, 'none');
});

test('what is laid: the painter\'s own layer lays the chosen strokes and nothing of the dropped ones', () => {
  const got = applyLinesEdit(vectors(), lines(), edit([{ where: { part: 'hatch' }, do: 'drop' }]), listing()), w = 100, h = 50;
  const lay = doc => { const f = new Float32Array(w * h); return { ...layVectors(doc, f, w, h, 1, d => d), f }; };
  const all = lay(vectors()), mine = lay(got.opening.vectors);
  assert.equal(all.strokes, 5); assert.equal(mine.strokes, 3); assert.ok(mine.cells < all.cells);
  for (let x = 60; x < 90; x++) { assert.ok(all.f[25 * w + x] > 0); assert.equal(mine.f[25 * w + x], 0); }
  for (let x = 12; x < 88; x++) assert.equal(mine.f[5 * w + x], all.f[5 * w + x], 'a kept line is laid as it was');
});

test('a rule that is wrong is refused with the reason', () => {
  const l = listing(), bad = (r, re) => assert.throws(() => checkLinesEdit(edit([r]), l), re);
  bad({ where: { ids: [99] }, do: 'drop' }, /there is no line 99/); bad({ where: { form: 'nose' }, do: 'drop' }, /no line has form "nose" \(the drawing has: none, face\)/);
  bad({ where: { part: 'hatch' } }, /give "do" .* or "weight"/); bad({ where: { part: 'hatch' }, do: 'erase' }, /"do" is "before"/); bad({ where: {}, weight: 9 }, /a factor from 0.1 to 4/);
  bad({ where: { colour: 'red' }, do: 'drop' }, /"colour" is not a condition/); bad({ where: { darkAbove: 'x' }, do: 'drop' }, /"darkAbove" is a number/);
  assert.throws(() => applyLinesEdit(vectors(), lines(), edit([{ where: { darkAbove: 0.99 }, do: 'drop' }]), l), /rule 1: no line matches/);
  assert.throws(() => checkLinesEdit(edit([]), l), /leave "lines" out/); assert.throws(() => checkLinesEdit({ format: 'x', rules: [{}] }, l), /"format" is "lines-edit 1"/);
  // an ink drawing's pencil lay-in cannot be a closing line: the closing pen lays ink only
  const ink = vectors(); for (const i of [1, 2, 3, 4]) ink.strokes[i] = { ...ink.strokes[i], medium: 'graphite' };
  assert.throws(() => applyLinesEdit(ink, lines(), edit([{ where: {}, do: 'after' }]), linesListing(ink, { mask, forms })), /4 of the lines you draw after the washes are the pencil lay-in of an ink drawing/);
  assert.equal(applyLinesEdit(ink, lines(), edit([{ where: { tagged: 'ink' }, do: 'after' }]), linesListing(ink, { mask, forms })).order, 'both');
  // a pencil drawing is laid before the washes only: "after" is refused with the reason, never dropped in silence; dropping and weighting it are taken
  const pencil = vectors('pencil'), pl = linesListing(pencil, { mask, forms });
  assert.throws(() => applyLinesEdit(pencil, lines(), edit([{ where: { ids: [5] }, do: 'after' }]), pl), /1 lines are to be drawn after the washes, but this drawing is pencil\. The painter lays a pencil drawing before the washes only/);
  const kept = applyLinesEdit(pencil, lines(), edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { ids: [5] }, weight: 1.5 }]), pl); assert.equal(kept.order, 'first'); assert.equal(kept.record.dropped, 2); assert.equal(kept.closing, null);
});

test('the choice is written as drawing stems of its own, with the run settings that paint them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-edit-test-'));
  try {
    const stem = path.join(dir, 'record'); fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify(vectors())); fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(lines()));
    const got = writeLinesEdit({ dir: path.join(dir, 'mine'), stem, edit: edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { ids: [5] }, do: 'after' }]), listing: listing() });
    assert.deepEqual(got.sets, [['drawing', path.join(dir, 'mine', 'opening')], ['drawinglast', path.join(dir, 'mine', 'closing')], ['drawinglastmin', '0'], ['drawingorder', 'both']]);
    assert.equal(JSON.parse(fs.readFileSync(`${got.opening}-vectors.json`, 'utf8')).strokes.length, 2); assert.equal(JSON.parse(fs.readFileSync(`${got.closing}-lines.json`, 'utf8')).lines.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'mine', 'lines-edit.json'), 'utf8')).record.dropped, 2);
    const only = writeLinesEdit({ dir: path.join(dir, 'weights'), stem, edit: edit([{ where: {}, weight: 0.8 }]), listing: listing() });
    assert.deepEqual(only.sets, [['drawing', path.join(dir, 'weights', 'opening')]]); assert.equal(only.closing, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
