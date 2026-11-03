import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { recordMarks } from './brush.mjs';
import { createPen, dipPen, penStroke } from './pen.mjs';

const pigment = { K: [1, .5, .2], S: [.1, .1, .1], rho: .1, omega: .2, gamma: .1 };
test('pen tape ends at starvation, retaining interpolated width and refill gesture identity', () => {
  const tape = recordMarks(true);
  try {
    const sheet = createSheet(makePaper(50, 20), [pigment]); sheet._tape = true;
    const pen = createPen(); dipPen(pen, [1]);
    const path = [{x:5,y:10,p:.2,v:1,nw:1}, {x:25,y:10,p:.8,v:2,nw:3}, {x:40,y:10}];
    penStroke(pen, sheet, path, {spacing: 1, between: n => { if (n === 3) {pen.ink = 0; pen.drop = 0;} }});
    const mark = tape.find(m => m.k === 'P');
    assert.equal(mark.points.at(-1).x, 8);
    assert.equal(mark.points.at(-1).nw, 1.3);
    assert.equal(mark.d.at(-1)[0], 80);
    assert.equal(mark.d.at(-1)[5], 130);
    assert.equal(mark.points.length, 2);
    dipPen(pen, [1]);
    penStroke(pen, sheet, path, {spacing: 1, refillBelow: .5, refill: p => dipPen(p, [1]), between: n => { if (n === 3 || n === 6) pen.ink = 0; }});
    const split = tape.filter(m => m.k === 'P').slice(1);
    assert.equal(split.length, 3);
    assert.equal(new Set(split.map(m => m.gestureId)).size, 1);
    assert.notEqual(split[0].gestureId, mark.gestureId);
    assert.deepEqual(split[0].points.at(-1), split[1].points[0]);
  } finally { recordMarks(false); }
});
