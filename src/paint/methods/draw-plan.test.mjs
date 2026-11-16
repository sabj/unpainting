import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDrawPlan, edgeShare, polyLength, MAX_PATH_POINTS } from './draw-plan.mjs';

const SHA = 'a'.repeat(64);
const plan = (over = {}) => ({
  version: 1, target: { sha256: SHA, width: 300, height: 200 }, sheet: { widthMm: 280, heightMm: 280 * 200 / 300 }, reachMm: 4,
  medium: 'ink', reason: 'the subject is a pen drawing', leftToWash: [{ what: 'the dark coat', why: 'a dark mass: the wash states it' }],
  lines: [{ id: 'eye', what: 'left eye upper lid', role: 'landmark', follows: 'line', stage: 'opening', weight: 'medium', path: [[100, 80], [110, 76], [120, 80]] }],
  ...over,
});

test('a well-formed plan passes and fills closed', () => {
  const p = validateDrawPlan(plan(), { sheetMm: 280, targetW: 300, targetH: 200, targetSHA256: SHA });
  assert.equal(p.lines[0].closed, false);
});

test('every fault is named at once', () => {
  const bad = plan({ version: 2, reachMm: 30, medium: 'graphite', reason: '', leftToWash: null,
    lines: [{ id: 'a', what: '', role: 'outline', follows: 'shadow', stage: 'middle', weight: 'bold', path: [[1, 1]] }, { id: 'a', what: 'x', role: 'accent', follows: 'edge', stage: 'closing', weight: 'light', path: [[10, 10], [20, 20]] }] });
  const msg = (() => { try { validateDrawPlan(bad); } catch (e) { return e.message; } })();
  for (const want of ['.follows', 'version', 'reachMm', 'medium', 'reason', 'leftToWash', '.what', '.role', '.stage', '.weight', '.path', 'used twice']) assert.match(msg, new RegExp(want.replace('.', '\\.')), want);
});

test('the plan is bound to the target and the sheet', () => {
  assert.throws(() => validateDrawPlan(plan(), { targetSHA256: 'b'.repeat(64) }), /not the image being painted/);
  assert.throws(() => validateDrawPlan(plan(), { sheetMm: 300 }), /not the sheet being painted/);
  assert.throws(() => validateDrawPlan(plan(), { targetW: 301, targetH: 200 }), /target is 300 x 200/);
  assert.throws(() => validateDrawPlan(plan({ sheet: { widthMm: 280, heightMm: 100 } })), /heightMm/);
});

test('a path is a few points on the sheet, not a trace', () => {
  const many = Array.from({ length: MAX_PATH_POINTS + 1 }, (_, k) => [50 + k, 60]);
  assert.throws(() => validateDrawPlan(plan({ lines: [{ id: 'x', what: 'x', role: 'contour', follows: 'line', stage: 'opening', weight: 'light', path: many }] })), /not a trace/);
  assert.throws(() => validateDrawPlan(plan({ lines: [{ id: 'x', what: 'x', role: 'contour', follows: 'line', stage: 'opening', weight: 'light', path: [[50, 60], [300, 60]] }] })), /on the 280/);
  assert.throws(() => validateDrawPlan(plan({ lines: [{ id: 'x', what: 'x', role: 'contour', follows: 'line', stage: 'opening', weight: 'light', closed: true, path: [[50, 60], [60, 60]] }] })), /3 or more/);
});

test('the sheet edge is never a subject line', () => {
  const border = [[1, 1], [279, 1]];
  assert.throws(() => validateDrawPlan(plan({ lines: [{ id: 'b', what: 'top border', role: 'contour', follows: 'line', stage: 'opening', weight: 'heavy', path: border }] })), /sheet's edge is never/);
  assert.ok(edgeShare(border, 280, 186, 4) > 0.99);
  assert.equal(edgeShare([[100, 100], [150, 100]], 280, 186, 4), 0);
  assert.equal(polyLength([[0, 0], [3, 4]]), 5);
});
