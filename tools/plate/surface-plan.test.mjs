// Surface marks are chosen by what a region is: coats and stone get marks along their form, in their darks, and nothing else does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceMarksFor, BRUSH_MM } from './surface-plan.mjs';

const w = 300, h = 200;
// region 1 (left half): a coat of dark with fine stripes at about 30 degrees; region 2 (right half): a dark wall with level courses
function scene() {
  const SRC = new Float32Array(w * h), labelMap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; labelMap[i] = x < 150 ? 1 : 2;
    const stripe = 0.25 * Math.sin((x * Math.sin(Math.PI / 6) - y * Math.cos(Math.PI / 6)) * 1.1);   // ridges that run along 30 degrees
    const course = 0.25 * Math.sin(y * 1.1);                                                       // courses: level
    SRC[i] = 1.2 + (x < 150 ? stripe : course);
  }
  for (let y = 0; y < 40; y++) for (let x = 0; x < 150; x++) SRC[y * w + x] = 0.05;                // a light in the coat
  return { SRC, labelMap };
}
const MM = 100;

test('a coat gets coat marks along its stripes, none in its lights; a wall gets level masonry', () => {
  const { SRC, labelMap } = scene();
  const { groups, coatMask } = surfaceMarksFor({ labelMap, kinds: { 1: 'short-coat', 2: 'masonry' }, labels: { 1: 'fur_short', 2: 'dressed_stone' }, SRC, w, h, sheetMm: MM });
  const coat = groups.find(g => g.id === 1), wall = groups.find(g => g.id === 2);
  assert.ok(coat.paths.length > 20 && wall.paths.length > 5, `${coat.paths.length} coat marks, ${wall.paths.length} blocks`);
  for (const p of coat.paths) for (const q of p) assert.ok(q.y >= 38, 'nothing in the light at the top of the coat');
  // a flick lies along the stripes: 30 degrees, within 25
  const angs = coat.paths.map(p => Math.atan2(p.at(-1).y - p[0].y, p.at(-1).x - p[0].x)).map(a => Math.abs(((a * 180 / Math.PI) % 180 + 180) % 180 - 30));
  const near = angs.filter(a => a < 25 || a > 155).length;
  assert.ok(near / angs.length > 0.6, `${near} of ${angs.length} flicks follow the stripes`);
  assert.ok(Math.abs(wall.courseAngleDeg) < 12, `courses are level: ${wall.courseAngleDeg}`);
  assert.equal(coatMask[100 * w + 50], 1, 'the coat is marked as a coat');
  assert.equal(coatMask[100 * w + 250], 0, 'a wall is not a coat');
  assert.equal(wall.brushMm, BRUSH_MM.masonry);
});

test('regions with no kind get nothing, and the same run gives the same marks', () => {
  const { SRC, labelMap } = scene();
  const none = surfaceMarksFor({ labelMap, kinds: {}, labels: {}, SRC, w, h, sheetMm: MM });
  assert.equal(none.groups.length, 0);
  const a = surfaceMarksFor({ labelMap, kinds: { 1: 'curly-coat' }, labels: { 1: 'fur_curly' }, SRC, w, h, sheetMm: MM }), b = surfaceMarksFor({ labelMap, kinds: { 1: 'curly-coat' }, labels: { 1: 'fur_curly' }, SRC, w, h, sheetMm: MM });
  assert.deepEqual(a.groups[0].paths[0], b.groups[0].paths[0]);
});

test('marks are denser where the source is darker', () => {
  const { SRC, labelMap } = scene();
  for (let y = 0; y < h; y++) for (let x = 0; x < 75; x++) SRC[y * w + x] = Math.max(SRC[y * w + x], 1.6); // the left quarter very dark
  const { groups } = surfaceMarksFor({ labelMap, kinds: { 1: 'long-hair' }, labels: { 1: 'hair_long' }, SRC, w, h, sheetMm: MM });
  const dark = groups[0].paths.filter(p => p[0].x < 75).length, mid = groups[0].paths.filter(p => p[0].x >= 75).length;
  assert.ok(dark / 75 > mid / 75, `${dark} marks in the darkest quarter against ${mid} in the other three`);
});

test('a ceiling is kept by thinning evenly', () => {
  const { SRC, labelMap } = scene();
  const { groups } = surfaceMarksFor({ labelMap, kinds: { 1: 'short-coat' }, labels: { 1: 'fur_short' }, SRC, w, h, sheetMm: MM, ceiling: 10 });
  assert.ok(groups[0].paths.length <= 10);
});
