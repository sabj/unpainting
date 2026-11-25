import test from 'node:test';
import assert from 'node:assert/strict';
import { handTravel, travelLine } from './hand-travel.mjs';
import { planSummary } from './plan-data.mjs';

const stroke = (x0, y0, x1, y1) => ({ points: [[x0, y0, 0.5], [(x0 + x1) / 2, (y0 + y1) / 2, 0.9], [x1, y1, 0.2]] });

test('the hand\'s jumps are from one stroke\'s end to the next one\'s start, within a passage only', () => {
  // a wash laid neighbour after neighbour (10 mm steps), and one whose order jumps across the sheet
  const tidy = { thing: 'p1: sky', strokes: [stroke(0, 0, 100, 0), stroke(100, 10, 0, 10), stroke(0, 20, 100, 20)] };
  const jumpy = { script: { passage: 'face' }, strokes: [stroke(0, 0, 0, 50), stroke(120, 0, 120, 50), stroke(10, 0, 10, 50)] };
  assert.deepEqual(handTravel([tidy]), { jumps: 2, medianMm: 10, worstMm: 10, worstIn: 'p1: sky' });
  const t = handTravel([tidy, jumpy, { thing: 'one stroke', strokes: [stroke(500, 500, 600, 600)] }]);
  assert.equal(t.jumps, 4);
  assert.equal(t.worstIn, 'face');
  assert.ok(Math.abs(t.worstMm - Math.hypot(120, 50)) < 0.1 && t.medianMm > 10);
  assert.equal(handTravel([{ strokes: [stroke(0, 0, 1, 1)] }]), null);
  assert.equal(handTravel([]), null);
});

test('the free compile check carries it in the plan\'s summary and says it in one sentence', () => {
  const s = planSummary({ summary: { washes: 1, plannedStrokes: 3 }, passes: [{ thing: 'face', widestBrushMm: 17, strokes: [stroke(0, 0, 0, 50), stroke(120, 0, 120, 50), stroke(10, 0, 10, 50)] }] });
  assert.deepEqual(s.handTravel, { jumps: 2, medianMm: 130, worstMm: 130, worstIn: 'face' });
  assert.match(travelLine(s.handTravel), /^ Between consecutive strokes of one passage the hand jumps 130 mm \(median\) and 130 mm at worst \(in face\); the replay is watched/);
  assert.equal(travelLine(null), '');
  assert.equal(planSummary({ summary: {}, passes: [] }).handTravel, null);
});
