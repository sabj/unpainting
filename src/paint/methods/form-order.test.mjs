import test from 'node:test';
import assert from 'node:assert/strict';
import { formOrder, CONSTRUCTION, STRUCTURE, DETAIL, SHADING, TEXTURE, ACCENT } from './form-order.mjs';

// a synthetic drawing of two houses side by side, drawn the way the current fit orders them: each house finished, its
// window bars and hatching too, before the next is begun
const line = (a, b, n = 8) => Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
// a line's shape: a thin strip along it
const box = P => { const a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [(-(b[1] - a[1]) / L) * 0.15, ((b[0] - a[0]) / L) * 0.15]; return [[[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]]; };
function house(x0, lineId) {
  const S = [], add = (path, extra = {}) => S.push({ line: lineId++, path, widths: path.map(() => 0.3), outline: box(path), dark: 1, drawn: 'path', ...extra });
  add(line([x0, 120], [x0 + 60, 120])); add(line([x0 + 60, 120], [x0 + 60, 60])); add(line([x0 + 60, 60], [x0, 60])); add(line([x0, 60], [x0, 120])); // walls: construction
  add(line([x0, 60], [x0 + 30, 35])); add(line([x0 + 30, 35], [x0 + 60, 60])); // roof
  add(line([x0 + 10, 80], [x0 + 22, 80])); add(line([x0 + 10, 95], [x0 + 22, 95])); // window sill and head: structure
  add(line([x0 + 14, 82], [x0 + 14, 86], 3)); add(line([x0 + 18, 82], [x0 + 18, 86], 3)); add(line([x0 + 40, 100], [x0 + 43, 100], 3)); // bars, a mark: detail
  for (let k = 0; k < 6; k++) add(line([x0 + 35 + k * 1.2, 70], [x0 + 36 + k * 1.2, 76], 3)); // hatching: texture
  add([[x0 + 30, 105], [x0 + 32, 105]], { piece: 'tone', soft: 0.5, outline: [[[x0 + 26, 102], [x0 + 36, 102], [x0 + 36, 110], [x0 + 26, 110]]] }); // tone
  add([[x0 + 50, 112], [x0 + 51, 112]], { fill: true, outline: [[[x0 + 50, 111.5], [x0 + 51, 111.5], [x0 + 51, 112.5], [x0 + 50, 112.5]]] }); // a small black touch: an accent
  add([[x0 + 5, 110], [x0 + 9, 110]], { piece: 'tone', soft: 0.5, dark: 0.2, outline: [[[x0 + 3, 108], [x0 + 11, 108], [x0 + 11, 114], [x0 + 3, 114]]] }); // a pale shadow: light shading
  return S;
}
const strokes = [...house(20, 0), ...house(150, 100)].map((s, seq) => ({ ...s, seq }));
const doc = { sheetMm: 280, heightMm: 187, strokes };

test('every construction stroke is played before any detail or texture, and structure before detail', () => {
  const { strokes: out } = formOrder(doc);
  const at = pass => out.filter(s => s.pass === pass).map(s => s.play);
  assert.ok(at(CONSTRUCTION).length >= 12, 'both houses walls and roofs are construction');
  assert.ok(Math.max(...at(CONSTRUCTION)) < Math.min(...at(STRUCTURE)));
  assert.ok(Math.max(...at(STRUCTURE)) < Math.min(...at(DETAIL)));
  assert.ok(Math.max(...at(DETAIL)) < Math.min(...at(TEXTURE)));
  // soft grey tone is not shaded over the sheet in patches: a house's pale shadow is brushed in with its texture, after its lines
  assert.equal(at(SHADING).length, 0);
  for (const x0 of [20, 150]) { const mine = out.filter(s => s.path[0][0] >= x0 && s.path[0][0] < x0 + 70), pale = mine.find(s => s.piece === 'tone' && s.dark < 0.5); assert.equal(pale.pass, TEXTURE); assert.ok(mine.filter(s => s.pass < TEXTURE).every(s => s.play < pale.play)); }
  // the small darkest touches last
  assert.equal(at(ACCENT).length, 2);
  assert.ok(Math.max(...at(TEXTURE)) < Math.min(...at(ACCENT)));
  // both houses are placed before either is developed: the first quarter of the replay touches both
  const early = out.filter(s => s.pass === CONSTRUCTION).map(s => s.path[0][0]);
  assert.ok(early.some(x => x < 100) && early.some(x => x > 140));
  // the hatching and the tone are texture
  assert.ok(out.filter(s => s.piece === 'tone').every(s => s.pass >= SHADING));
  assert.equal(out.filter(s => s.pass === TEXTURE && s.piece !== 'tone').length, 12);
});

test('only the playing order changes: same strokes, same seq and outlines, a play index for each', () => {
  const { strokes: out } = formOrder(doc);
  assert.equal(out.length, strokes.length);
  // play rises through the replay; pieces of one pass share it
  assert.ok(out.every((s, k) => k === 0 || s.play >= out[k - 1].play));
  assert.equal(new Set(out.map(s => s.play)).size, out.length);
  const bySeq = new Map(strokes.map(s => [s.seq, s]));
  for (const s of out) { const o = bySeq.get(s.seq); assert.deepEqual(s.outline, o.outline); assert.equal(s.path.length, o.path.length); }
  // the input is not changed
  assert.equal(strokes.some(s => 'play' in s), false);
});

test('inside a pass the hand finishes one form before the next', () => {
  // the things say where each house is: construction of the left house is done before the right one's begins
  const things = [{ kind: 'building', box: [15, 30, 85, 125] }, { kind: 'building', box: [145, 30, 215, 125] }];
  const { strokes: out } = formOrder(doc, { things });
  const side = out.filter(s => s.pass === CONSTRUCTION).map(s => (s.path[0][0] < 100 ? 'L' : 'R')).join('').replace(/(.)\1+/g, '$1');
  assert.equal(side.length, 2, side);
});

test('a hand laid on the fit keeps its order inside the played order: first try before its firm line, pulls together and in turn', async () => {
  const { carryOrder } = await import('./form-order.mjs');
  const { strokes: ordered } = formOrder(doc);
  // the hand cuts the left house's long wall (line 0) into a first try and two pulls, numbered inside the line's place
  const wall = strokes.find(s => s.line === 0), P = wall.path;
  const hand = strokes.filter(s => s.line !== 0).concat([
    { ...wall, seq: wall.seq + 0.1, path: P.slice(0, 5), try: true, pull: 0 },
    { ...wall, seq: wall.seq + 0.4, path: P.slice(0, 6), pull: 0 },
    { ...wall, seq: wall.seq + 0.7, path: P.slice(5), pull: 1 },
    { ...wall, line: undefined, seq: 999, path: P.slice(2, 4), shade: 0, part: 'shading', piece: 'hatch' },
  ]);
  const carried = carryOrder({ ...doc, strokes: hand }, ordered).strokes;
  // the hand's shading keeps no play (it is played after the lines, by its passes)
  assert.equal(carried.find(s => s.shade != null).play, undefined);
  const out = carried.filter(s => s.shade == null).sort((a, b) => a.play - b.play || a.seq - b.seq);
  const k = out.findIndex(s => s.line === 0);
  assert.deepEqual(out.slice(k, k + 3).map(s => [s.line, s.try ?? false, s.pull]), [[0, true, 0], [0, false, 0], [0, false, 1]]);
  assert.ok(out.slice(k, k + 3).every(s => s.pass === CONSTRUCTION));
  assert.ok(out.every(s => Number.isInteger(s.play)));
});

test('an ink drawing of a black mass with no outline gets a light pencil lay-in round it, drawn first', () => {
  // a dog's coat: 400 small black blots, no line round it
  const sq = (x, y) => [[[x, y], [x + 1.8, y], [x + 1.8, y + 1.8], [x, y + 1.8]]];
  const blots = []; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) blots.push({ seq: blots.length, line: blots.length, fill: true, dark: 1, path: [[100 + 2 * i, 60 + 2 * j], [101 + 2 * i, 60 + 2 * j]], outline: sq(100 + 2 * i, 60 + 2 * j) });
  const ink = { sheetMm: 280, heightMm: 187, medium: 'ink', strokes: blots };
  const { strokes: out } = formOrder(ink, { things: [{ kind: 'animal', box: [95, 55, 145, 105] }] });
  const lay = out.filter(s => s.piece === 'layin');
  assert.ok(lay.length >= 3, `lay-in strokes: ${lay.length}`);
  assert.ok(lay.every(s => s.medium === 'graphite' && s.pass === CONSTRUCTION && s.seq < 0 && s.dark <= 0.15 && s.press.length === s.path.length));
  // played before any blot, laid before any ink; the blots themselves untouched
  assert.ok(Math.max(...lay.map(s => s.play)) < Math.min(...out.filter(s => s.fill).map(s => s.play)));
  assert.equal(out.filter(s => s.fill).length, 400);
  // a pencil drawing gets none
  assert.equal(formOrder({ ...ink, medium: 'pencil' }, { things: [{ kind: 'animal', box: [95, 55, 145, 105] }] }).strokes.filter(s => s.piece === 'layin').length, 0);
});
