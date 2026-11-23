import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linesListing, checkLinesEdit, checkOwnLines, lineOutline, applyLinesEdit, writeLinesEdit, linesLine, LINES_EDIT_FORMAT } from './lines-edit.mjs';
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
  assert.deepEqual(l.counts.tagged, { ink: 3, drop: 2 }); assert.equal(l.linesAfterTheWashes, true); assert.equal(linesListing(vectors('pencil')).linesAfterTheWashes, true); assert.match(linesListing(vectors('pencil')).note, /a pencil drawing as prepared; the medium is yours to change .* any line may be drawn before the first wash .* with a stage of the washes .* or after the washes .* lines of your own/); assert.deepEqual(l.strokes[0].boxMm, [10, 5, 90, 5]); assert.deepEqual(l.sheet, { widthMm: 100, heightMm: 50 });
  assert.ok(!JSON.stringify(l).includes('outline":[['), 'no stroke geometry beyond its box');
});

test('rules in order, the later winning: lines dropped, moved after the washes and weighted; no stroke\'s shape changes', () => {
  const v = vectors(), got = applyLinesEdit(v, lines(), edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { form: 'face', lengthBelowMm: 10 }, do: 'after', weight: 1.5 }, { where: { ids: [2] }, weight: 0.5 }, { where: { ids: 4 }, do: 'before' }]), listing());
  assert.equal(got.order, 'both');
  assert.deepEqual(got.opening.vectors.strokes.map(s => [s.seq, s.dark]), [[1, 0.3], [2, 0.1], [4, 0.15]]); assert.deepEqual(got.closing.vectors.strokes.map(s => [s.seq, s.dark, s.darkAsDrawn]), [[5, 0.9, 0.6]]);
  assert.deepEqual(got.opening.vectors.strokes[0], { ...v.strokes[0], when: 'auto' }, 'an unweighted stroke is the record\'s own, with its time'); assert.deepEqual(got.opening.vectors.strokes.map(s => s.when), ['auto', 'auto', 'before']); assert.equal(got.closing.vectors.strokes[0].outline, v.strokes[4].outline); assert.equal(v.strokes[4].dark, 0.6);
  assert.deepEqual(got.opening.lines.lines.map(g => g.seq), [1, 2, 4]); assert.deepEqual(got.closing.lines.lines.map(g => g.seq), [5]);
  assert.deepEqual({ ...got.record, rules: got.record.rules.map(r => r.lines) }, { strokes: 5, auto: 2, before: 1, withStages: {}, after: 1, dropped: 1, lengthMm: { auto: 110, before: 30, withStages: 0, after: 4, dropped: 30 }, weighted: 2, darker: 1, paler: 1, rules: [2, 1, 1, 1] });
  assert.match(linesLine(got.record), /of the drawing's 5 lines 2 are drawn when the painter would draw them, 1 before the first wash, 1 after the washes, 1 not at all; 2 weighted \(1 darker, 1 paler\)/);
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

test('a rule that cannot be read is refused with the reason; a rule that may spoil the drawing is laid and warned of', () => {
  const l = listing(), bad = (r, re) => assert.throws(() => checkLinesEdit(edit([r]), l), re), warned = r => { const w = []; checkLinesEdit(edit([r]), l, w); return w.join(' | '); };
  bad({ where: { part: 'hatch' } }, /give "do" .* or "weight"/); bad({ where: { part: 'hatch' }, do: 'erase' }, /"do" is "auto" .*"before" .*"stage N"/); bad({ where: {}, weight: -1 }, /"weight" is a number above 0/);
  bad({ where: { colour: 'red' }, do: 'drop' }, /"colour" is not a condition/); bad({ where: { darkAbove: 'x' }, do: 'drop' }, /"darkAbove" is a number/);
  assert.throws(() => checkLinesEdit(edit([]), l), /leave "lines" out/); assert.throws(() => checkLinesEdit({ format: 'x', rules: [{}] }, l), /"format" is "lines-edit 1"/);
  // slips and bold choices: warned of, never refused
  assert.match(warned({ where: { ids: [99] }, do: 'drop' }), /there is no line 99/); assert.match(warned({ where: { form: 'nose' }, do: 'drop' }), /no line has form "nose" \(the drawing has: none, face\)/);
  assert.match(warned({ where: {}, weight: 9 }), /a weight of 9 is outside the usual 0.1 to 4; it is laid as you wrote it/);
  const none = applyLinesEdit(vectors(), lines(), edit([{ where: { darkAbove: 0.99 }, do: 'drop' }]), l); assert.match(none.warnings[0], /rule 1: no line matches its "where"; the rule changes nothing/); assert.equal(none.record.auto, 5);
  assert.equal(checkLinesEdit(edit(Array.from({ length: 500 }, () => ({ where: {}, weight: 1 }))), l).length, 500, 'no cap on the number of rules');
  // a pencil drawing's line after the washes: laid, in a file that says its closing lines hold pencil, with a warning
  const pencil = vectors('pencil'), pl = linesListing(pencil, { mask, forms });
  const after = applyLinesEdit(pencil, lines(), edit([{ where: { ids: [5] }, do: 'after' }]), pl);
  assert.equal(after.order, 'both'); assert.equal(after.laidAs, 'ink', 'pencil over the washes is laid by the painter\'s ink route, its strokes marked graphite'); assert.equal(after.closing.vectors.pencilAfterWashes, true); assert.equal(after.opening.vectors.pencilAfterWashes, undefined);
  assert.ok([...after.opening.vectors.strokes, ...after.closing.vectors.strokes].every(s => s.medium === 'graphite')); assert.match(after.warnings[0], /1 of the drawing's lines are drawn in pencil over the dry washes; pencil there sits grey on top/);
  const kept = applyLinesEdit(pencil, lines(), edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { ids: [5] }, weight: 1.5 }]), pl); assert.equal(kept.order, 'first'); assert.equal(kept.record.dropped, 2); assert.equal(kept.closing, null); assert.equal(kept.laidAs, 'pencil'); assert.deepEqual(kept.warnings, []);
});

test('the medium is the author\'s: a pencil drawing in pen, a pen drawing in pencil, or no drawing', () => {
  const pencil = vectors('pencil'), pl = linesListing(pencil, { mask, forms });
  // the pencil drawing's lines start as Auto lays them: its hatching (tagged drop) is left for the washes
  const asAuto = applyLinesEdit(pencil, lines(), null, pl, { medium: 'pen' });
  assert.deepEqual(asAuto.opening.vectors.strokes.map(s => s.seq), [1, 2, 5]); assert.equal(asAuto.record.dropped, 2); assert.equal(asAuto.warnings.length, 0); assert.equal(asAuto.opening.vectors.chosen, 'lines edit');
  const pen = applyLinesEdit(pencil, lines(), edit([{ where: { tagged: 'drop' }, do: 'before' }]), pl, { medium: 'pen' });
  assert.equal(pen.laidAs, 'ink'); assert.equal(pen.opening.vectors.medium, 'ink'); assert.equal(pen.opening.lines.medium, 'ink'); assert.ok(pen.opening.vectors.strokes.every(s => s.medium === 'ink')); assert.equal(pen.opening.vectors.strokes.length, 5);
  assert.match(pen.warnings[0], /the medium is pen on a drawing made in pencil: 2 of its lines are hatching, tone or texture/); assert.deepEqual(pen.record.medium, { chosen: 'pen', theDrawingIs: 'pencil', laidAs: 'ink' });
  assert.equal(pencil.strokes[0].medium, 'graphite', 'the record\'s drawing is not altered');
  const ink = vectors(); ink.strokes = ink.strokes.map(s => ({ ...s, medium: 'ink' }));
  const asPencil = applyLinesEdit(ink, lines(), null, linesListing(ink, { mask, forms }), { medium: 'pencil' });
  assert.equal(asPencil.laidAs, 'pencil'); assert.equal(asPencil.opening.vectors.medium, 'pencil'); assert.ok(asPencil.opening.vectors.strokes.every(s => s.medium === 'graphite'));
  const none = applyLinesEdit(ink, lines(), null, linesListing(ink, { mask, forms }), { medium: 'none' });
  assert.deepEqual([none.order, none.opening, none.closing, none.laidAs, none.record.dropped], ['none', null, null, null, 5]);
  assert.throws(() => applyLinesEdit(ink, lines(), null, listing(), { medium: 'charcoal' }), /"medium" is one of pencil, pen, none/); assert.throws(() => applyLinesEdit(ink, lines(), null, listing()), /neither lines nor a medium/);
});

test('lines of the author\'s own: points, pen or pencil, a width and a darkness, before or after the washes, laid by the painter\'s own layer', () => {
  const pencil = vectors('pencil'), pl = linesListing(pencil, { mask, forms });
  const own = [{ points: [[10, 40], [50, 40]], medium: 'pen', widthMm: 1, dark: 0.9, when: 'after' }, { points: [[10, 45], [30, 45], [30, 48]], medium: 'pencil', widthMm: 0.4, dark: 0.3 }];
  const got = applyLinesEdit(pencil, lines(), { format: LINES_EDIT_FORMAT, own }, pl);
  assert.equal(got.order, 'both'); assert.equal(got.laidAs, 'ink', 'a pen line on a pencil drawing: an ink file, the pencil strokes marked graphite');
  assert.deepEqual(got.opening.vectors.strokes.map(s => [s.seq, s.medium, s.part]), [[1, 'graphite', 'outline'], [2, 'graphite', 'inner'], [5, 'graphite', 'small'], [7, 'graphite', 'own']], 'the hatching tagged drop starts dropped on a pencil drawing');
  assert.deepEqual(got.closing.vectors.strokes.map(s => [s.seq, s.medium, s.dark, s.own]), [[6, 'ink', 0.9, true]]); assert.equal(got.closing.vectors.pencilAfterWashes, undefined);
  assert.deepEqual(got.record.own, { lines: 2, pen: 1, pencil: 1, before: 1, after: 1, lengthMm: 63 }); assert.match(linesLine(got.record), /2 lines of your own \(1 pen, 1 pencil; 1 under the washes, 1 over them\); the drawing is laid as a pen drawing/);
  // the painter's own layer lays it where it was put, as wide as asked
  const w = 100, h = 50, f = new Float32Array(w * h); layVectors(got.closing.vectors, f, w, h, 1, d => d);
  for (let x = 12; x < 48; x++) assert.ok(f[40 * w + x] > 0 || f[39 * w + x] > 0, `the pen line is laid at x ${x}`); assert.equal(f[20 * w + 30], 0); assert.equal(f[40 * w + 70], 0);
  assert.deepEqual(lineOutline([[0, 0], [10, 0]], 2), [[0, 1], [10, 1], [10, -1], [0, -1]]);
  // own lines alone, with no drawing: the medium is none and the author's lines are all there is
  const alone = applyLinesEdit(pencil, lines(), { format: LINES_EDIT_FORMAT, own: [own[1]] }, pl, { medium: 'none' });
  assert.deepEqual([alone.order, alone.laidAs, alone.opening.vectors.strokes.length, alone.record.dropped], ['first', 'pencil', 1, 5]);
  // what cannot be read is refused; what may spoil the drawing is drawn and warned of
  const sheet = { widthMm: 100, heightMm: 50 }, bad = (o, re) => assert.throws(() => checkOwnLines([o], sheet), re);
  bad({ points: [[1, 1]] }, /"points" is two or more points/); bad({ points: [[1, 1], ['a', 2]] }, /"points" is two or more points/); bad({ points: [[1, 1], [2, 2]], medium: 'crayon' }, /"medium" is "pen" or "pencil"/);
  bad({ points: [[1, 1], [2, 2]], when: 'during' }, /"when" is "before"/); bad({ points: [[1, 1], [2, 2]], widthMm: 0 }, /"widthMm" is the line's width/);
  const warnings = []; const laid = checkOwnLines([{ points: [[-5, -5], [-9, -9]], widthMm: 12, dark: 3, medium: 'pencil', when: 'after' }], sheet, warnings);
  assert.equal(laid[0].dark, 1); assert.equal(laid[0].widthMm, 12, 'laid as wide as written'); assert.equal(warnings.length, 4); assert.match(warnings.join(' '), /off the sheet.*wider than any pen or pencil.*past black.*pencil over the dry washes/);
  assert.equal(checkOwnLines(Array.from({ length: 3000 }, () => own[0]), sheet).length, 3000, 'no cap on the number of lines');
});

test('the choice is written as drawing stems of its own, with the run settings that paint them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-edit-test-'));
  try {
    const stem = path.join(dir, 'record'); fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify(vectors())); fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(lines()));
    const got = writeLinesEdit({ dir: path.join(dir, 'mine'), stem, edit: edit([{ where: { tagged: 'drop' }, do: 'drop' }, { where: { ids: [5] }, do: 'after' }]), listing: listing() });
    assert.deepEqual(got.sets, [['drawing', path.join(dir, 'mine', 'opening')], ['drawinglast', path.join(dir, 'mine', 'closing')], ['drawinglastmin', '0'], ['drawingorder', 'both'], ['inkfast', '1']], 'an ink drawing\'s chosen lines are laid over ink set first');
    assert.equal(JSON.parse(fs.readFileSync(`${got.opening}-vectors.json`, 'utf8')).strokes.length, 2); assert.equal(JSON.parse(fs.readFileSync(`${got.closing}-lines.json`, 'utf8')).lines.length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'mine', 'lines-edit.json'), 'utf8')).record.dropped, 2);
    const only = writeLinesEdit({ dir: path.join(dir, 'weights'), stem, edit: edit([{ where: {}, weight: 0.8 }]), listing: listing() });
    assert.deepEqual(only.sets, [['drawing', path.join(dir, 'weights', 'opening')], ['inkfast', '1']]); assert.equal(only.closing, null);
    fs.writeFileSync(`${stem}-vectors.json`, JSON.stringify(vectors('pencil')));
    assert.deepEqual(writeLinesEdit({ dir: path.join(dir, 'pencil'), stem, edit: edit([{ where: {}, weight: 0.8 }]), listing: linesListing(vectors('pencil')) }).sets, [['drawing', path.join(dir, 'pencil', 'opening')]], 'a pencil drawing needs none');
    // a changed medium names the run's medium, and a closing drawing alone still names the file the run's medium is read from
    const pen = writeLinesEdit({ dir: path.join(dir, 'pen'), stem, edit: null, listing: linesListing(vectors('pencil')), medium: 'pen' });
    assert.deepEqual(pen.sets, [['drawing', path.join(dir, 'pen', 'opening')], ['outlinemedium', 'ink'], ['inkfast', '1']]); assert.equal(JSON.parse(fs.readFileSync(`${pen.opening}-lines.json`, 'utf8')).medium, 'ink');
    const last = writeLinesEdit({ dir: path.join(dir, 'last'), stem, edit: { format: LINES_EDIT_FORMAT, own: [{ points: [[1, 1], [5, 5]], medium: 'pencil', when: 'after' }] }, listing: linesListing(vectors('pencil')), medium: 'none' });
    assert.deepEqual(last.sets, [['drawing', path.join(dir, 'last', 'closing')], ['drawinglast', path.join(dir, 'last', 'closing')], ['drawinglastmin', '0'], ['drawingorder', 'last'], ['outlinemedium', 'ink']]); assert.equal(JSON.parse(fs.readFileSync(`${last.closing}-vectors.json`, 'utf8')).pencilAfterWashes, true);
    assert.deepEqual(writeLinesEdit({ dir: path.join(dir, 'none'), stem, edit: null, listing: linesListing(vectors('pencil')), medium: 'none' }).sets, [['drawingorder', 'none']]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a line\'s time: Auto\'s unless chosen, before the first wash, with a stage of the washes, or after them', () => {
  const got = applyLinesEdit(vectors(), lines(), edit([{ where: { ids: [1] }, do: 'stage 2' }, { where: { ids: [2] }, do: 'before' }, { where: { ids: [5] }, do: 'after' }]), listing());
  assert.deepEqual(got.opening.vectors.strokes.map(s => [s.seq, s.when]), [[1, 'stage 2'], [2, 'before'], [3, 'auto'], [4, 'auto']]);
  assert.deepEqual(got.closing.vectors.strokes.map(s => [s.seq, s.when]), [[5, undefined]]);
  assert.deepEqual(got.record.withStages, { 'stage 2': 1 });
  assert.match(linesLine(got.record), /1 with stage 2/);
  const own = applyLinesEdit(vectors(), lines(), ({ format: LINES_EDIT_FORMAT, own: [{ points: [[1, 1], [9, 1]], when: 'stage 3' }] }), listing());
  assert.equal(own.opening.vectors.strokes.at(-1).when, 'stage 3');
  assert.throws(() => applyLinesEdit(vectors(), lines(), edit([{ where: {}, do: 'stage two' }]), listing()), /"stage N"/);
});
