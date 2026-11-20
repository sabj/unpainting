import test from 'node:test';
import assert from 'node:assert/strict';
import { byImportance, lineImportance } from './line-importance.mjs';

const line = (x0, y, len, extra = {}) => ({ points: [{ x: x0, y }, { x: x0 + len, y }], ...extra });

test('within the budget nothing is dropped, and the order is kept', () => {
  const lines = [line(0, 0, 10), line(0, 5, 40), line(0, 9, 5)];
  const r = byImportance(lines, { pxMm: 1, budgetMm: 100 });
  assert.equal(r.lines, lines);
  assert.equal(r.stats.dropped, 0);
});

test('over the budget the firm and structural lines stay, in their own order, with no count cap', () => {
  const lines = [line(0, 0, 4, { weight: 1 }), line(0, 5, 60, { weight: 0.8, tier: 1 }), line(0, 9, 30, { weights: [0.9, 0.9] }), line(0, 12, 30, { weight: 0.2 }), line(0, 15, 6, { weight: 0.5 })];
  const r = byImportance(lines, { pxMm: 1, budgetMm: 90 });
  assert.deepEqual(r.lines.map(g => g.points[1].x), [60, 30]);
  assert.equal(r.stats.keptMm, 90);
  assert.equal(r.stats.dropped, 3);
  // many short lines are all kept when the budget allows: the budget is a length, not a count
  const many = Array.from({ length: 200 }, (_, k) => line(0, k, 2));
  assert.equal(byImportance(many, { pxMm: 1, budgetMm: 400 }).lines.length, 200);
});

test('a short firm opening outranks a long faint joint; length counts only up to 12 mm', () => {
  const arch = { points: [[0, 0], [6, 0]], weights: [0.9, 0.9, 0.9] }, joint = { points: [[0, 5], [40, 5]], weights: [0.4, 0.4] };
  assert.ok(lineImportance(arch, 1) > lineImportance(joint, 1));
  assert.deepEqual(byImportance([joint, arch], { pxMm: 1, budgetMm: 5 }).lines, [arch]);
  assert.equal(lineImportance(line(0, 0, 12, { weight: 1 }), 1), lineImportance(line(0, 0, 50, { weight: 1 }), 1));
  assert.ok(lineImportance(line(0, 0, 10, { tier: 1, weight: 0.5 }), 1) > lineImportance(line(0, 0, 10, { tier: 2, weight: 0.5 }), 1));
  assert.equal(lineImportance(line(0, 0, 10, { weight: 0.5 }), 0.5), 1.25);
});

test('a line the subject draws in pen outranks an edge only the model sees', () => {
  const edge = line(0, 0, 10, { weight: 0.7, edge: true }), pen = line(0, 5, 10, { weight: 0.7 });
  assert.equal(lineImportance(pen, 1, 1), 2 * lineImportance(edge, 1, 0));
  assert.deepEqual(byImportance([edge, pen], { pxMm: 1, budgetMm: 10, penOf: g => (g.edge ? 0 : 1) }).lines, [pen]);
});
