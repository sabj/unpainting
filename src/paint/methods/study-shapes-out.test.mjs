import test from 'node:test';
import assert from 'node:assert/strict';
import { studyShapesDoc } from './study-shapes-out.mjs';

test('the block-in\'s shapes are written out as the planner read them: number, outline in millimetres, colour, area, paper, nesting, named forms', () => {
  // a 6 x 4 grid of 2 mm cells: shape 0 the ground, shape 1 a 2 x 2 block inside it, shape 2 the right column (paper)
  const pw = 6, ph = 4, label = Int32Array.from({ length: pw * ph }, (_, q) => { const x = q % pw, y = (q / pw) | 0; return x === 5 ? 2 : x >= 1 && x <= 2 && y >= 1 && y <= 2 ? 1 : 0; });
  const named = { ids: Uint8Array.from({ length: pw * ph }, (_, q) => (q % pw < 3 ? 1 : 0)), forms: [{ id: 1, name: 'cat face', kind: 'face' }] };
  const doc = studyShapesDoc({ pw, ph, cellMm: 2, label, named, shapes: [{ colour: [200.2, 150, 100], cells: 16, paper: false, light: false, parent: -1 }, { colour: [90, 60, 40], cells: 4, paper: false, light: false, parent: 0 }, { colour: [250, 250, 248], cells: 4, paper: true, light: true, parent: -1 }] });
  assert.equal(doc.format, 'study-shapes 2'); assert.deepEqual(doc.sheet, { widthMm: 12, heightMm: 8, cellMm: 2 }); assert.equal(doc.shapes.length, 3);
  const [ground, block, paper] = doc.shapes;
  assert.deepEqual([block.n, block.colour, block.areaMm2, block.paper, block.inside, block.boxMm], [2, [90, 60, 40], 16, false, 1, [2, 2, 6, 6]]); assert.deepEqual(block.forms, [{ name: 'cat face', share: 1 }]);
  assert.equal(block.polygons.length, 1); const flat = block.polygons[0].flat(); assert.deepEqual([Math.min(...flat), Math.max(...flat)], [2, 6], 'its outline runs round the block, in millimetres (the planner\'s own outline, corners eased)'); assert.ok(block.polygons[0].length >= 8);
  assert.equal(ground.polygons.length, 2, 'the ground\'s outline has the block as a hole'); assert.deepEqual(ground.forms, [{ name: 'cat face', share: 0.5 }]); assert.equal(ground.inside, null);
  assert.deepEqual([paper.paper, paper.boxMm, paper.forms], [true, [10, 0, 12, 8], []]);
  assert.equal(studyShapesDoc({ pw, ph, cellMm: 2, label, named: null, shapes: doc.shapes.map(() => ({ colour: [1, 2, 3], cells: 4, parent: -1 })) }).shapes[0].forms.length, 0);
});
