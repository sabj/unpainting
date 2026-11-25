import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { realSizeOf, realSizeLine } from './real-size.mjs';
import { standardSheet } from './sheet-rule.mjs';

const turner = { id: 'turner-esseillon', source: { px: [3451, 2363] } };

test('the line says the original\'s size beside the sheet\'s, height x width, and nothing when none is recorded', () => {
  const sheet = standardSheet(turner.source.px);
  assert.equal(realSizeLine(realSizeOf(turner), sheet), 'The original is 19.7 x 28 cm; your sheet is 27 x 39.4 cm (height x width).');
  assert.equal(realSizeLine(realSizeOf({ id: 'mittens-closeup', source: { px: [1086, 1448] } }), standardSheet([1086, 1448])), 'The original is a generated picture with no size of its own (nominally 30.5 x 23 cm); your sheet is 37.6 x 28.2 cm (height x width).');
  assert.equal(realSizeLine(realSizeOf({ id: 'manet-morisot-fan-crop', source: { px: [2100, 1767] } }), standardSheet([2100, 1767])), 'The original, of which this picture is a part, is 20.9 x 16.8 cm; your sheet is 29.9 x 35.5 cm (height x width).');
  assert.equal(realSizeOf({ id: 'not-listed', source: { px: [10, 10] } }), null); assert.equal(realSizeLine(null, sheet), '');
  assert.throws(() => realSizeLine(realSizeOf(turner), {}), /sheet's width and height/);
});

test('the record\'s own size is read first; a size that is not the picture\'s shape stops the run', () => {
  assert.deepEqual(realSizeOf({ ...turner, realSize: { heightCm: 20, widthCm: 29 } }), { heightCm: 20, widthCm: 29, nominal: false, part: false });
  assert.throws(() => realSizeOf({ ...turner, realSize: { heightCm: 28, widthCm: 19.7 } }), /not the shape of the picture.*swapped/);
  assert.throws(() => realSizeOf({ ...turner, realSize: { heightCm: 28 } }), /heightCm and widthCm/);
  assert.equal(realSizeOf({ ...turner, realSize: { heightCm: 28, widthCm: 38, nominal: true } }).nominal, true, 'a nominal size is not held to the shape');
});

test('the real size never sizes the sheet', () => {
  const src = fs.readFileSync(new URL('./sheet-rule.mjs', import.meta.url), 'utf8') + fs.readFileSync(new URL('./subjects.mjs', import.meta.url), 'utf8').replace(/realSize: realSizeOf\(rec\)/, '');
  assert.doesNotMatch(src.replace(/import \{ realSizeOf \}.*\n/, ''), /realSize|real-size/, 'neither the sheet rule nor the subject\'s sheet reads it');
  const a = standardSheet(turner.source.px); assert.deepEqual([a.cells, a.rows], [1515, 1037]);
});

test('every listed size is whole and plain', () => {
  const { sizes } = JSON.parse(fs.readFileSync(new URL('../../bench/real-sizes.json', import.meta.url), 'utf8'));
  for (const [id, r] of Object.entries(sizes)) { assert.ok(r.heightCm > 5 && r.heightCm < 100 && r.widthCm > 5 && r.widthCm < 100, id); assert.deepEqual(Object.keys(r).filter(k => !['heightCm', 'widthCm', 'nominal', 'part', 'sheet'].includes(k)), [], id); }
});

test('a museum sheet size of another shape than the file is told as the museum\'s figure, and a crop as a part', () => {
  // Morisot, Avenue du Bois: the Met gives "sheet: 20 x 28 cm"; the file is 3193 x 2943 px, nearly square
  const morisot = { id: 'morisot-avenue-du-bois', source: { px: [3193, 2943] } }, size = realSizeOf(morisot);
  assert.deepEqual(size, { heightCm: 20, widthCm: 28, nominal: false, part: false, sheet: true });
  assert.match(realSizeLine(size, standardSheet([3193, 2943])), /^The museum gives the original's sheet as 20 x 28 cm, which is not the shape of the picture you are given; your sheet is /);
  assert.throws(() => realSizeOf({ ...morisot, realSize: { heightCm: 20, widthCm: 28 } }), /not the shape of the picture.*"sheet": true/s, 'unmarked, the mismatch still stops');
  assert.throws(() => realSizeOf({ id: 'x', source: { px: [1400, 1000] }, realSize: { heightCm: 20, widthCm: 28, sheet: true } }), /drop the mark/);
  // Manet's crop: the whole sheet's size, said as such, never a throw
  assert.equal(realSizeOf({ id: 'manet-morisot-fan-crop', source: { px: [2100, 1767] } }).part, true);
});
