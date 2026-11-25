import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { makePencil, widthAt, gradePigment, layPencil, rubOut, wetCells, checkPath, checkEraser } from './kit-graphite.mjs';

const paint = { K: [0.3, 0.3, 0.1], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.25 }, waterproof = { ...paint, omega: 60 };
// pigments: 0 paint, 1 waterproof ink, 2 graphite HB, 3 graphite 2B
const fresh = () => createSheet(makePaper(60, 40, { seed: 3, scale: 1, toothScale: 0.2 }), [paint, waterproof, gradePigment('HB'), gradePigment('2B')]);
const G = [2, 3], line = (y, p) => [{ x: 5, y, p }, { x: 55, y, p }];
const sum = (a, y0, y1) => { let s = 0; for (let i = y0 * 60; i < y1 * 60; i++) s += a[i]; return s; };

test('a soft grade is wider and darker than a hard one, and pressure widens and darkens the line', () => {
  const hb = makePencil({ grade: 'HB' }, 0.259), b2 = makePencil({ grade: '2B' }, 0.259);
  assert.ok(b2.width > hb.width && b2.amount > hb.amount && gradePigment('2B').K[0] > gradePigment('HB').K[0]);
  assert.ok(widthAt(hb, 0.2) < widthAt(hb, 1));
  assert.throws(() => makePencil({ grade: '9H' }, 0.259), /grade must be one of HB, 2B/);
  assert.throws(() => makePencil({ width: 40 }, 0.259), /width/);
  const s = fresh();
  layPencil(s, hb, 2, line(8, 0.3), { graphite: G }); layPencil(s, hb, 2, line(18, 1), { graphite: G }); layPencil(s, b2, 3, line(28, 1), { graphite: G });
  assert.ok(sum(s.D[2], 4, 12) < 0.5 * sum(s.D[2], 14, 22), 'light pressure lays less');
  assert.ok(sum(s.D[3], 24, 32) > sum(s.D[2], 14, 22), '2B lays more than HB');
  assert.equal(sum(s.D[0], 0, 40), 0, 'graphite only');
  assert.throws(() => layPencil(s, hb, 2, [{ x: 1, y: 1, p: 1 }, { x: 4, y: 1, p: 2 }], { graphite: G }), /pressure p must be 0 to 1/);
});

test('the eraser takes graphite off bare paper, much less of graphite under paint laid after it, and no waterproof ink', () => {
  const s = fresh(), hb = makePencil({ grade: 'HB' }, 0.259);
  // a waterproof ink line and a dried wash of paint at rows 20 to 39, laid before the pencil on rows 25 to 30
  const before = s.pigments.map(() => new Float32Array(s.n)); for (let i = 20 * 60; i < s.n; i++) { before[0][i] = 0.1; before[1][i] = 0.2; } s.layers.push(before);
  layPencil(s, hb, 2, line(5, 1), { graphite: G }); layPencil(s, hb, 2, line(15, 1), { graphite: G }); layPencil(s, hb, 2, line(28, 1), { graphite: G });
  // then a dried wash over the pencil at rows 10 to 19
  const after = s.pigments.map(() => new Float32Array(s.n)); for (let i = 10 * 60; i < 20 * 60; i++) after[0][i] = 0.3; s.layers.push(after);
  const g = (y0, y1) => sum(s.D[2], y0, y1), g0 = [g(0, 10), g(10, 20), g(20, 30)], ink0 = sum(s.layers[0][1], 0, 40), paint0 = sum(s.layers[0][0], 20, 40);
  const bare = rubOut(s, line(5, 1), { width: 8, graphite: G }).graphiteShare;
  const under = rubOut(s, line(15, 1), { width: 8, graphite: G }).graphiteShare;
  const overPaint = rubOut(s, line(28, 1), { width: 8, graphite: G }).graphiteShare;
  assert.ok(bare > 0.7, `bare ${bare}`); assert.ok(under < bare / 3, `under ${under}`); assert.ok(overPaint > 0.7, `pencil on top of dry paint rubs off: ${overPaint}`);
  assert.ok(g(0, 10) < 0.3 * g0[0] && g(10, 20) > 0.7 * g0[1]);
  assert.equal(sum(s.layers[0][1], 0, 40), ink0, 'waterproof ink untouched');
  const lost = 1 - sum(s.layers[0][0], 20, 40) / paint0; assert.ok(lost > 0 && lost < 0.02, `a trace of paint: ${lost}`);
  const light = fresh(); layPencil(light, hb, 2, line(5, 1), { graphite: G });
  assert.ok(rubOut(light, line(5, 0.2), { width: 8, graphite: G }).graphiteShare < 0.5 * bare, 'light pressure lifts less');
});

test('the eraser refuses a wet sheet and rubs nothing', () => {
  const s = fresh(), hb = makePencil({ grade: 'HB' }, 0.259); layPencil(s, hb, 2, line(5, 1), { graphite: G });
  s.W[100] = 0.1; s.M[100] = 1; const had = sum(s.D[2], 0, 40);
  assert.equal(wetCells(s), 1);
  assert.throws(() => checkEraser(s, 8), /wet/); assert.throws(() => checkEraser(fresh(), 0.5), /eraser width must be 1 to 120 cells/);
  assert.throws(() => checkPath([{ x: 1, y: 1, p: 1 }], 'an eraser stroke'), /an eraser stroke needs a path of at least 2 points/);
  assert.throws(() => rubOut(s, line(5, 1), { width: 8, graphite: G }), /the sheet is wet \(1 cells hold water\)/);
  assert.equal(sum(s.D[2], 0, 40), had);
});
