import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, washClaims, scheduleLines, groupPhases } from './drawing-phases.mjs';

// a 40 x 30 cell sheet; a wash is a box of cells
const W = 40, H = 30;
const boxWash = (x0, y0, x1, y1) => ({ test: i => { const x = i % W, y = (i / W) | 0; return x >= x0 && x <= x1 && y >= y0 && y <= y1; }, box: { x0, y0, x1, y1 } });
const hline = (y, x0 = 5, x1 = 35) => ({ points: Array.from({ length: 11 }, (_, k) => [x0 + (x1 - x0) * k / 10, y]) });

test('a line along a wash\'s border is on its edge; one well inside is inside; one away from it is neither', () => {
  const wash = boxWash(0, 10, 39, 20), [edge, inside, away] = washClaims(wash.test, wash.box, W, H, [hline(10), hline(15), hline(27)], 2);
  assert.deepEqual(edge, { edge: true, inside: true });
  assert.deepEqual(inside, { edge: false, inside: true });
  assert.deepEqual(away, { edge: false, inside: false });
});

test('the sheet\'s own border is not a wash edge', () => {
  const wash = boxWash(0, 0, 39, 29), [c] = washClaims(wash.test, wash.box, W, H, [hline(0, 0, 39)], 2);
  assert.deepEqual(c, { edge: false, inside: true });
});

const claimsOf = (list, ...strokes) => washClaims(list.test, list.box, W, H, strokes, 2);
// three washes: a first pale wash over everything, a later one over the middle band, a last accent at the bottom
function plan(lines, { midDry = true } = {}) {
  const walls = [boxWash(0, 0, 39, 29), boxWash(0, 10, 39, 20), boxWash(30, 24, 36, 28)];
  return [{ stage: 1, dry: true }, { stage: 3, dry: midDry }, { stage: 4, dry: true }].map((q, k) => ({ ...q, claims: claimsOf(walls[k], ...lines) }));
}

test('Auto, pencil: lay-in first, a later wash\'s edge and inside before that wash, placing lines first, detail with the last stage', () => {
  const lines = [
    { seq: 1, phase: 'layin', ...hline(15) },            // the lay-in: first, wherever it lies
    { seq: 2, part: 'outline', ...hline(10) },           // the middle wash's border: before it
    { seq: 3, part: 'small', ...hline(15) },             // inside the middle wash: before it
    { seq: 4, part: 'outline', ...hline(5) },            // only the first wash over it, a placing line: first
    { seq: 5, part: 'texture', ...hline(5) },            // detail no later wash claims: with the last stage
  ];
  const r = scheduleLines(lines, plan(lines));
  assert.deepEqual(r.at, [-1, 1, 1, -1, 2], r.why.join(' / '));
  const g = groupPhases(lines, r.at);
  assert.deepEqual(g.opening.map(s => s.seq), [1, 4]);
  assert.deepEqual(g.phases.map(p => [p.at, p.strokes.map(s => s.seq)]), [[1, [2, 3]], [2, [5]]]);
});

test('a line is never drawn into a wet bed: due before a wash laid wet, it goes down at the last dry paper before it', () => {
  const lines = [{ seq: 2, part: 'outline', ...hline(10) }];
  assert.deepEqual(scheduleLines(lines, plan(lines, { midDry: false })).at, [-1]);
});

test('a pen drawing is inked whole before the washes', () => {
  const lines = [{ seq: 2, part: 'outline', ...hline(10) }, { seq: 5, part: 'texture', ...hline(5) }];
  assert.deepEqual(scheduleLines(lines, plan(lines), { penLed: true }).at, [-1, -1]);
});

test('an author\'s timing: before, stage N (its first wash over the line, else its first wash), a missing stage told', () => {
  const lines = [{ seq: 1, part: 'outline', when: 'stage 3', ...hline(27) }, { seq: 2, part: 'outline', when: 'before', ...hline(15) },
    { seq: 3, part: 'small', when: 'stage 4', ...hline(26, 30, 36) }, { seq: 4, part: 'small', when: 'stage 2', ...hline(15) }, { seq: 5, phase: 'layin', when: 'stage 9', ...hline(15) }];
  const r = scheduleLines(lines, plan(lines), { penLed: true });
  assert.deepEqual(r.at, [1, -1, 2, 1, 3]);
  assert.equal(r.warnings.length, 2);
  assert.throws(() => parseWhen('later'), /"before", "stage N" or "auto"/);
  assert.deepEqual(parseWhen(undefined), { auto: true });
});
