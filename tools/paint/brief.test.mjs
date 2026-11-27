// The brief (BRIEF.md, brief.mjs): every placeholder filled, the same text at every level outside the marked level
// block (the painting tips one labelled block in it), and its one example passage a passage the parser takes, with every option it shows reaching the painter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { briefFor, levelBlock, levelData, withoutLevel, briefRecord, BRIEF_FILE, BRIEF_VERSION } from './brief.mjs';
import { checkAuthored } from './author.mjs';
import { resolveNumbered } from './study-shapes.mjs';
import { passageStrokes } from '../../src/paint/methods/script-washes.mjs';
import { BOX } from '../../src/crop/box.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const brushes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/paint/brushes.json'), 'utf8')).brushes, sheet = { widthMm: 200, heightMm: 150 };
const pic = (name, label) => ({ name, label, what: 'what it is.', px: [1200, 900], pxPerMm: 5.6 });
const brief = (given, data = '') => briefFor({ sheet, brushes, paints: BOX, paintsMost: 14, looksMost: 3, wallMinutes: 60, given, data });

test('the brief: every placeholder filled, the same outside the level block at every level, versioned and hashed', () => {
  const l1 = brief(levelBlock({ level: 'L1', pictures: [pic('source.jpg', 'SUBJECT')], notes: ['Nothing else is given.'] }));
  const l2 = brief(levelBlock({ level: 'L2', pictures: [pic('source.jpg', 'SUBJECT'), pic('traced-shapes.jpg', 'TRACED SHAPES')], data: ['the named forms'], forms: true }), levelData([{ title: 'The named forms', text: '- 1. cat (animal)' }]));
  const l4 = brief(levelBlock({ level: 'L4', pictures: [pic('inputs/source.png', 'SUBJECT')], files: [{ name: 'resources/shapes.json', what: 'the traced shapes' }], session: { steps: 1000, reverts: 20, showCost: 0.05, seen: ['auto-result/auto-painting.png'] } }));
  for (const b of [l1, l2, l4]) { assert.doesNotMatch(b.text, /SHEET_W|KIT_LIST|LEVEL_GIVEN|LEVEL_DATA|PAINT_LIST|WALL_LINE|LOOKS_MOST/); assert.equal(b.version, BRIEF_VERSION); assert.match(b.sha256, /^[a-f0-9]{64}$/); }
  assert.equal(withoutLevel(l1.text), withoutLevel(l2.text)); assert.equal(withoutLevel(l1.text), withoutLevel(l4.text));
  assert.equal(l1.templateSha256, l4.templateSha256); assert.notEqual(l1.sha256, l2.sha256);
  assert.match(l2.text, /2\. `traced-shapes\.jpg`, TRACED SHAPES: what it is\. 1200 x 900 px, 5\.6 px per mm\./); assert.match(l2.text, /## Level data[\s\S]*1\. cat \(animal\)/);
  assert.match(l4.text, /an open session/); assert.match(l4.text, /seen\.md/); assert.match(l1.text, /`sienna`: burnt sienna/); assert.match(l1.text, /60 minutes on the clock for the whole try/); assert.match(l1.text, /Unless a passage says otherwise, it is laid on dry paper after everything before it has dried/);
  assert.ok(briefRecord(l1).words > 1000);
  // no advice of method in the text every level shares
  // the painting tips are one labelled block, the same at every level; no advice of method outside it
  const tips = t => /<!-- PAINTING TIPS -->[\s\S]*?<!-- END PAINTING TIPS -->/.exec(t)[0];
  assert.equal(tips(l1.text), tips(l4.text)); assert.match(tips(l1.text), /## Painting tips/); assert.ok(l1.text.indexOf('## Painting tips') > l1.text.indexOf('## Budget and rules') && l1.text.indexOf('## Painting tips') < l1.text.indexOf('## Appendix A'));
  assert.doesNotMatch(withoutLevel(l1.text).replace(tips(l1.text), ''), /usually|advice|tends to|good painters|what has worked|is for the few|read(s)? (well|badly)/i);
});

test('the example passages are passages the parser takes: flooded mop wet-in-wet + damp into, and shaped dry strokes', () => {
  const text = fs.readFileSync(BRIEF_FILE, 'utf8');
  const blocks = [...text.slice(text.indexOf('## Two example passages')).matchAll(/```json\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]));
  assert.ok(blocks.length >= 2, 'two JSON examples in BRIEF.md');
  // Example 1: 38mm flooded mop wet-in-wet + damp into drop
  const mopScript = { format: 'painting-script 2', sheet: { widthMm: 280, heightMm: 180 }, palette: ['cerulean', 'ultramarine', 'rose', 'sienna'], brushes: { mop: { shape: 'round', widthMm: 38 }, flat: { shape: 'flat', widthMm: 25.4 } }, passages: blocks[0] };
  const checkedMop = checkAuthored(mopScript, { sheetWidthMm: 280 }).script;
  assert.equal(checkedMop.passages.length, 2);
  assert.equal(checkedMop.passages[0].paper, 'wet'); assert.equal(checkedMop.passages[1].into, 'p01'); assert.equal(checkedMop.passages[1].wait, 'damp');
  assert.ok(passageStrokes(checkedMop.passages[0], checkedMop.brushes, 1).length > 0);
  // Example 2: shaped strokes
  const example = blocks[1];
  const script = { format: 'painting-script 2', sheet, palette: ['ultramarine', 'sienna'], brushes: { r10: { shape: 'round', widthMm: 10 }, r4: { shape: 'round', widthMm: 3 } }, passages: [example] };
  const shapes = { shapes: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, polygons: [[[100, 60], [110, 60], [112, 120], [102, 120]]] })) };
  assert.throws(() => checkAuthored(script, { sheetWidthMm: 200 }), /name study shapes by number/, 'without traced shapes `along` is refused');
  const resolved = resolveNumbered(script, shapes), checked = checkAuthored(resolved, { sheetWidthMm: 200 }).script, p = checked.passages[0];
  const st = passageStrokes(p, checked.brushes, 1);
  // the six-point curve kept as written, its pressure rising and falling and its speeds; the placed stroke laid as a comma of the 3 mm brush; the axis stroke with the 3 mm brush
  assert.equal(st[0].points.length, 6); assert.ok(st[0].points[2][2] > 0.8 && st[0].points[5][2] < 0.1); assert.equal(st[0].points[1][3] > 0, true); assert.equal(st[0].radiusMm, 5);
  assert.ok(st.length >= 3); assert.ok(st.slice(1).every(q => q.radiusMm <= 1.6 + 1e-9 || q.points.every(pt => pt.length >= 3)));
  assert.equal(st.at(-1).radiusMm, 1.5); assert.ok(st.at(-1).points.length >= 2);
});
