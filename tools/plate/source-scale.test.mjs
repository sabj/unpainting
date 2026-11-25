import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceScale, checkSourceScale, sourceScaleRecord, SOURCE_SCALE_DEFAULT } from './source-scale.mjs';

test('a sheet at or under the source width passes: one cell a pixel at most by default', () => {
  assert.equal(SOURCE_SCALE_DEFAULT, 1);
  for (const width of [96, 299, 300]) {
    const r = checkSourceScale({ sourceWidth: 300, sourceHeight: 263, width });
    assert.equal(r.ok, true);
    assert.equal(r.sheetWidth, width);
    assert.equal(r.allowed, 1);
  }
  assert.equal(sourceScale({ sourceWidth: 300, width: 300 }).sourceScale, 1);
});

test('a sheet wider than the source stops the run, naming the source width, the requested width and the setting', () => {
  assert.throws(() => checkSourceScale({ image: 'bench/v2/targets/trumbull.png', sourceWidth: 300, sourceHeight: 263, width: 1200 }), e => {
    assert.match(e.message, /bench\/v2\/targets\/trumbull\.png is 300 px wide/);
    assert.match(e.message, /--width 1200 asks for a sheet 1200 cells wide, 4 cells for each source pixel/);
    assert.match(e.message, /does not paint from an enlarged source/);
    assert.match(e.message, /--width 300 or less/);
    assert.match(e.message, /--sourcescale 4\.$/);
    return true;
  });
  // one cell over is over
  assert.throws(() => checkSourceScale({ sourceWidth: 300, width: 301 }), /--sourcescale 1\.01\.$/);
});

test('the default width is named as the default, so a run that typed no width knows which number to change', () => {
  assert.throws(() => checkSourceScale({ sourceWidth: 300, width: 700, widthGiven: false }), /--width 700 \(the default\) asks for a sheet 700 cells wide, 2\.333 cells/);
});

test('--scale counts: the sheet is --width times --scale cells across', () => {
  assert.equal(checkSourceScale({ sourceWidth: 600, width: 300, scale: 2 }).sheetWidth, 600);
  assert.throws(() => checkSourceScale({ sourceWidth: 300, width: 300, scale: 2 }), e => {
    assert.match(e.message, /--width 300 at --scale 2 asks for a sheet 600 cells wide, 2 cells for each source pixel/);
    assert.match(e.message, /--width 150 or less/);
    return true;
  });
});

test('a run that states its enlargement paints up to it and no further', () => {
  const r = checkSourceScale({ sourceWidth: 306, sourceHeight: 242, width: 1224, allowed: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.sourceScale, 4);
  assert.deepEqual(sourceScaleRecord(r), { sourceWidth: 306, sourceHeight: 242, sheetWidth: 1224, sourceScale: 4, sourceScaleAllowed: 4 });
  assert.throws(() => checkSourceScale({ sourceWidth: 306, width: 1225, allowed: 4 }), /--sourcescale 4: at most 4 cells a pixel.*--width 1224 or less.*--sourcescale 4\.01\.$/);
  // a tiny synthetic fixture enlarged on purpose states its scale
  assert.equal(checkSourceScale({ sourceWidth: 8, width: 48, allowed: 6 }).sourceScale, 6);
});

test('the setting is a number of 1 or more; the sizes are numbers above 0', () => {
  for (const allowed of [0, 0.5, -1, NaN, Infinity]) assert.throws(() => sourceScale({ sourceWidth: 300, width: 300, allowed }), /--sourcescale: .* 1 or more/);
  assert.throws(() => sourceScale({ sourceWidth: 0, width: 300 }), /source's width in pixels/);
  assert.throws(() => sourceScale({ sourceWidth: undefined, width: 300 }), /source's width in pixels/);
  assert.throws(() => sourceScale({ sourceWidth: 300, width: NaN }), /--width/);
  assert.throws(() => sourceScale({ sourceWidth: 300, width: 300, scale: 0 }), /--scale/);
});

test('the run card records the source, the sheet against it and what the run allowed', () => {
  assert.deepEqual(sourceScaleRecord(sourceScale({ sourceWidth: 1600, sourceHeight: 1246, width: 1200 })),
    { sourceWidth: 1600, sourceHeight: 1246, sheetWidth: 1200, sourceScale: 0.75, sourceScaleAllowed: 1 });
});
