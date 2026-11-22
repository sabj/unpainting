import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { planRows, planSummary, rowsTable, numbersText, beside } from './plan-data.mjs';

const plan = { summary: { shapes: 12, washes: 2, plannedStrokes: 9, stages: 2, washesByStage: [1, 1], paintedShare: 0.5712, layersOfStudy: [{ minMm2: 6, shapes: 12, washes: 2, strokes: 9 }] }, passes: [
  { id: 'light/s1/m5/first-wash', stage: 1, kind: 'first wash', thing: 'under-wash of study shape 3', colour: [235, 154, 93], areaMm2: 12292.5, widestBrushMm: 38, move: 'wet on dry',
    outline: [{ points: [[10.2, 20.7], [90.4, 20.7], [90.4, 70.1]] }], strokes: [{ points: [[10, 20, 1], [90, 70, 1]] }, { points: [[10, 30, 1], [90, 80, 1]] }], forms: [{ name: 'cat face', kind: 'face', share: 0.9194 }, { name: 'cat', kind: 'animal', share: 0.0018 }] },
  { id: 'shadow/s3/m9/glaze', stage: 3, kind: 'glaze', thing: 'a dark', colour: [60, 50, 40], areaMm2: 40, widestBrushMm: 4, move: 'wet on dry', strokes: [], forms: [] },
] };

test('a plan is read as rows of washes with a box and the forms covered, and no geometry', () => {
  const rows = planRows(plan);
  assert.deepEqual(rows[0], { n: 1, id: 'light/s1/m5/first-wash', stage: 1, kind: 'first wash', what: 'under-wash of study shape 3', rgb: [235, 154, 93], areaMm2: 12293, brushMm: 38, strokes: 2, move: 'wet on dry', boxMm: [10, 21, 90, 70], forms: [{ name: 'cat face', kind: 'face', share: 0.92 }] });
  assert.equal(rows[1].boxMm, null); assert.doesNotMatch(JSON.stringify(rows), /points|outline/);
  assert.deepEqual(planSummary(plan), { shapes: 12, passages: null, washes: 2, strokes: 9, stages: 2, washesByStage: [1, 1], widestBrushMm: 38, paintedShare: 0.57, studies: [{ leastMm2: 6, shapes: 12, washes: 2, strokes: 9 }], handTravel: { jumps: 1, medianMm: 89.4, worstMm: 89.4, worstIn: 'under-wash of study shape 3' } });
});

test('the table marks a wide brush in a face and a wash that lays nothing, and the numbers say both ways', () => {
  const t = rowsTable(planRows(plan));
  assert.match(t[0], /^1 \| stage 1 \| first wash \| brush 38 mm \| 2 strokes \| 12293 mm2 \| wet on dry \| rgb 235\/154\/93 \| box x 10-90, y 21-70 mm \| covers cat face 92% \| under-wash of study shape 3 \| !! BRUSH OVER 17 mm IN cat face$/);
  assert.match(t[1], /covers no named form \| a dark \| !! NOTHING LAID$/);
  const text = numbersText({ summary: planSummary(plan), table: t, formTable: ['cat face (face) | study: mean L* 70 | !! PALER THAN THE STUDY BY 9'] });
  assert.match(text, /12 shapes, 2 washes, 9 strokes, widest wash brush 38 mm, washes by stage 1\/1, 57% of the sheet painted/); assert.match(text, /a form paler than the study is as wrong as one darker/); assert.match(text, /PALER THAN THE STUDY BY 9/);
  assert.doesNotMatch(text, /score|judge/i);
});

test('pictures are set side by side at one height', async () => {
  const pic = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#888888' } }).png().toBuffer();
  const m = await sharp(await beside([await pic(100, 50), await pic(50, 50)], { height: 100, gap: 10 })).metadata();
  assert.deepEqual([m.width, m.height], [200 + 100 + 10, 100]);
});
