import test from 'node:test';
import assert from 'node:assert/strict';
import { shapesData, longAxis, namesShapes, resolveNumbered } from './study-shapes.mjs';

const plan = { passes: [
  { thing: 'study shape 3', studyLayer: 0, stage: 1, kind: 'wash', colour: [200.4, 150, 98], areaMm2: 800.2, outline: [{ points: [[10, 10], [50, 10], [50, 30], [10, 30]] }], forms: [{ name: 'cat face', share: 0.8 }, { name: 'ear', share: 0.01 }] },
  { thing: 'study shape 9 over 3', studyLayer: 1, stage: 3, kind: 'wash over', colour: [90, 60, 40], areaMm2: 60, outline: [{ points: [[20, 15], [30, 15], [30, 20]] }, { points: [[1, 1], [2, 2]] }] },
  { thing: 'a touch', studyLayer: 2, stage: 4, kind: 'touch', areaMm2: 2 }] };
const data = shapesData(plan, { widthMm: 100, heightMm: 60 });

test('the plan\'s washes as shapes a model can select: number, study, outline in millimetres, colour, area, forms', () => {
  assert.equal(data.format, 'study-shapes 1'); assert.equal(data.shapes.length, 3);
  assert.deepEqual(data.shapes[0], { n: 1, study: 1, stage: 1, kind: 'wash', what: 'study shape 3', colour: [200, 150, 98], areaMm2: 800, boxMm: [10, 10, 50, 30], forms: [{ name: 'cat face', share: 0.8 }], polygons: [[[10, 10], [50, 10], [50, 30], [10, 30]]] });
  assert.equal(data.shapes[1].polygons.length, 1, 'a loop of two points is no polygon'); assert.deepEqual(data.shapes[2].polygons, []); assert.equal(data.shapes[2].boxMm, null);
  assert.deepEqual(longAxis(data.shapes[0].polygons), [[10, 20], [50, 20]]);
});

test('a script that names shapes by number is turned into millimetres before the painter sees it; a number that is not there is refused', () => {
  const script = { format: 'painting-script 2', passages: [{ id: 'base', kind: 'wash', shapes: [1], reserve: 2 }, { id: 'dark', kind: 'strokes', region: [[0, 0], [5, 0], [5, 5]], shapes: [2], strokes: [{ along: 1, brush: 'r7' }, { points: [[1, 1], [2, 2]] }] }], lights: [{ shapes: [2] }, { region: [[0, 0], [1, 0], [1, 1]] }] };
  assert.equal(namesShapes(script), true); assert.equal(namesShapes({ passages: [{ id: 'a', region: [[0, 0], [1, 0], [1, 1]] }] }), false);
  const got = resolveNumbered(script, data);
  assert.deepEqual(got.passages[0], { id: 'base', kind: 'wash', regions: [[[10, 10], [50, 10], [50, 30], [10, 30]]], reserveRegions: [[[20, 15], [30, 15], [30, 20]]] });
  assert.deepEqual(got.passages[1].regions, [[[0, 0], [5, 0], [5, 5]], [[20, 15], [30, 15], [30, 20]]]); assert.equal(got.passages[1].region, undefined);
  assert.deepEqual(got.passages[1].strokes, [{ brush: 'r7', points: [[10, 20, 0.6], [50, 20, 0.6]] }, { points: [[1, 1], [2, 2]] }]);
  assert.deepEqual(got.lights.map(l => l.region), [[[20, 15], [30, 15], [30, 20]], [[0, 0], [1, 0], [1, 1]]]); assert.equal(namesShapes(got), false); assert.equal(script.passages[0].shapes[0], 1, 'the script given is not altered');
  assert.throws(() => resolveNumbered({ passages: [{ id: 'x', shapes: [77] }] }, data), /passage x: there is no shape 77 in resources\/shapes\.json \(1 to 3\)/);
  assert.throws(() => resolveNumbered({ passages: [{ id: 'y', shapes: [3] }] }, data), /shape 3 has no outline to use/);
});
