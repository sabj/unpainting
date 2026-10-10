import test from 'node:test';
import assert from 'node:assert/strict';
import { pencilBatches, penEndPosition, eraseFactor, passOf } from './pencil-stage.mjs';
import { retimePositions } from '../film-timeline.mjs';

const stroke = rank => ({ rank, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] });

test('big shapes go first and light, the features restate them, the detail comes last', () => {
  const s = [stroke(3), stroke(1), stroke(2), stroke(4), stroke(1), stroke(0)];
  const b = pencilBatches(s, { frames: [2, 2, 1], first: 0.4 });
  assert.deepEqual(b.map(x => x.pass), [0, 0, 1, 1, 2]);
  assert.ok(b.filter(x => x.pass === 0).every(x => x.parts.every(q => q.gain === 0.4)));
  const restated = b.filter(x => x.pass === 1).flatMap(x => x.parts.filter(q => Math.abs(q.gain - 0.6) < 1e-9)).flatMap(q => q.strokes);
  assert.equal(restated.length, 3);
  assert.equal(passOf(stroke(0)), 2);
  // every stroke drawn once at full pressure in all
  const total = new Map(); for (const x of b) for (const q of x.parts) for (const g of q.strokes) total.set(g, (total.get(g) ?? 0) + q.gain);
  assert.equal(total.size, s.length);
  for (const v of total.values()) assert.ok(Math.abs(v - 1) < 1e-9);
});

test('the drawing is complete where the line share reaches 90% of the drawing stage', () => {
  const e = penEndPosition([{ position: 0, share: 0 }, { position: 0.1, share: 0.0127 }, { position: 0.25, share: 0.0872 }]);
  assert.ok(Math.abs(e - (0.1 + 0.15 * (0.9 * 0.0872 - 0.0127) / (0.0872 - 0.0127))) < 1e-9);
  assert.equal(penEndPosition([{ position: 0, share: 0 }, { position: 0.08, share: 0.07 }, { position: 0.12, share: 0.0759 }]) < 0.08, true);
});

test('the pen end is a breakpoint of the re-timing and the washes cannot start before it', () => {
  const runM = { washStart: 6, washHalf: 10, darkHalf: 14, late: 16, inkStart: 18 };
  const tM = { washStart: 0.15, washHalf: 0.4, darkHalf: 0.6, late: 0.8, inkStart: 0.9 };
  const p = retimePositions(21, runM, tM, { run: 4, target: 0.23 });
  assert.ok(Math.abs(p[4] - 0.23) < 1e-9);
  assert.ok(p[6] >= 0.23);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1]);
  assert.deepEqual(retimePositions(21, runM, tM), retimePositions(21, runM, tM, null));
});

test('the eraser keeps the finish\'s lines, lifts bare paper most and painted paper less', () => {
  const f = eraseFactor(Uint8Array.from([1, 0, 0, 0]), Float32Array.from([0, 0, 0.04, 0.5]), { bare: 0.8, under: 0.4, clean: 0.08 });
  assert.deepEqual(Array.from(f, v => +v.toFixed(3)), [1, 0.2, 0.4, 0.6]);
});
