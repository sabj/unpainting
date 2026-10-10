import test from 'node:test';
import assert from 'node:assert/strict';
import { measureMarks, classifyMark, markInstrument, textureBundles, markScores } from './marks.mjs';
import { classifyInkPaths, inkFilterCounts, inkFilterOverlay } from './inkfilter.mjs';

const w = 128, h = 128, field = fn => Float32Array.from({ length: w * h }, (_, i) => fn(i % w, Math.floor(i / w)));
const line = (x, a = 16, b = 112) => ({ points: Array.from({ length: b - a + 1 }, (_, j) => ({ x, y: a + j })), length: b - a });
test('soft broad tapering marks use a brush; sharp weighted ink and narrow lines use a nib', () => {
  for (const scale of [1, 2]) {
    const soft = field((x, y) => 0.8 * Math.exp(-(((x - 64) / (scale * (1.5 + 3 * y / h))) ** 2)));
    const brush = markInstrument(line(64), measureMarks(soft, w, h, { scale }));
    assert.equal(brush.instrument, 'brush'); assert.ok(brush.evidence.widthVariation > 1.35);
    const sharp = field((x, y) => Math.abs(x - 64) < scale * (1 + 3 * y / h) ? 0.8 : 0);
    assert.equal(markInstrument(line(64), measureMarks(sharp, w, h, { scale })).instrument, 'nib');
    const narrow = field(x => 0.8 * Math.exp(-(((x - 64) / (0.7 * scale)) ** 2)));
    assert.equal(markInstrument(line(64), measureMarks(narrow, w, h, { scale })).instrument, 'nib');
  }
});
test('a narrow line remains a contour at different contrasts and sampling scales', () => {
  for (const ink of [0.12, 0.6, 1.2]) {
    const D = field(x => ink * Math.exp(-(((x - 64) / 1.4) ** 2)));
    assert.equal(classifyMark(line(64), measureMarks(D, w, h)).type, 'contour');
  }
  const D = field(x => 0.6 * Math.exp(-(((x - 64) / 2.8) ** 2)));
  assert.equal(classifyMark(line(64), measureMarks(D, w, h, { scale: 2 })).type, 'contour');
});
test('a varying nib width with a pixel-sized edge ramp does not become a wet brush', () => {
  for (const scale of [1, 2]) {
    const D = field((x, y) => 0.8 * Math.exp(-(((x - 64) / (scale * (0.9 + 0.8 * y / h))) ** 2)));
    assert.equal(markInstrument(line(64), measureMarks(D, w, h, { scale })).instrument, 'nib');
  }
});
test('a tone boundary and a broad smooth stain are washes, not pen contours', () => {
  for (const fn of [x => 0.7 / (1 + Math.exp(-(x - 64) / 2)), x => 0.5 * Math.exp(-(((x - 64) / 16) ** 2))]) {
    assert.equal(classifyMark(line(64), measureMarks(field(fn), w, h)).type, 'wash');
  }
});
test('neighbouring contours do not make a tonal region and a displaced centreline survives', () => {
  const D = field(x => 0.7 * Math.exp(-(((x - 62) / 1.5) ** 2)) + 0.5 * Math.exp(-(((x - 69) / 1.5) ** 2)));
  assert.equal(classifyMark(line(63), measureMarks(D, w, h)).type, 'contour');
});
test('parallel short marks within tone are texture, with a shared direction', () => {
  const D = field((x, y) => 0.25 + 0.3 * Math.exp(-((Math.sin((x - 32) * Math.PI / 7) / 0.3) ** 2)) * Math.exp(-(((y - 64) / 12) ** 8)));
  const M = measureMarks(D, w, h), marks = [32, 39, 46, 53, 60, 67, 74].map(x => ({ ...line(x, 55, 73), ...classifyMark(line(x, 55, 73), M) }));
  assert.ok(marks.every(s => s.type === 'texture'));
  const bundles = textureBundles(marks, M);
  assert.ok(bundles.length > 0);
  assert.ok(bundles.every(b => b.length >= 5 && b.length <= 15));
});
test('broken fine tone is dry brush and only near-paper endpoint lights are reserved', () => {
  const D = field((x, y) => 0.3 + 0.12 * Math.sin(x * 2.1) * Math.sin(y * 1.7));
  const M = measureMarks(D, w, h);
  assert.equal(classifyMark(line(64, 55, 73), M).type, 'dry');
  assert.equal(M.reserve[64 * w + 64], 0);
  const light = measureMarks(new Float32Array(w * h), w, h);
  assert.equal(light.reserve[64 * w + 64], 1);
  assert.equal(classifyMark(line(64), light).type, 'wash');
});
test('measurements penalise missing strokes and painting across a reserved light', () => {
  const D = field(x => 0.6 * Math.exp(-(((x - 64) / 1.4) ** 2))), blank = new Float32Array(w * h);
  const same = markScores(D, D, w, h), missing = markScores(blank, D, w, h), covered = markScores(field(() => 0.2), blank, w, h);
  assert.equal(same.contour.precision, 1); assert.equal(same.contour.recall, 1);
  assert.equal(missing.contour.recall, 0); assert.ok(covered.lightError > 0.19);
});
test('sparse texture is not inflated into invented bundles', () => {
  const M = measureMarks(field(() => 0.2), w, h);
  assert.deepEqual(textureBundles([line(40), line(80)], M), []);
});
test('paper grain beside one dark accent does not count as repeated fur', () => {
  const D = field((x, y) => 0.25 + 0.12 * Math.exp(-(((x - 64) / 1.4) ** 2)) + 0.01 * Math.sin(x * 2) * Math.sin(y));
  assert.equal(classifyMark(line(64, 55, 73), measureMarks(D, w, h)).type, 'contour');
});
test('the ink filter draws a contour and leaves a patch of texture undrawn', () => {
  const contour = field(x => 0.6 * Math.exp(-(((x - 64) / 1.4) ** 2)));
  const texture = field((x, y) => 0.25 + 0.3 * Math.exp(-((Math.sin((x - 32) * Math.PI / 7) / 0.3) ** 2)) * Math.exp(-(((y - 64) / 12) ** 8)));
  assert.deepEqual(classifyInkPaths([line(64)], contour, w, h).map(e => [e.type, e.kept]), [['contour', true]]);
  const patch = [32, 39, 46].map(x => line(x, 55, 73)), verdict = classifyInkPaths(patch, texture, w, h);
  assert.ok(verdict.every(e => e.type === 'texture' && !e.kept));
  assert.deepEqual(inkFilterCounts(verdict), { total: 3, kept: 0, contour: 0, accent: 0, wash: 0, dry: 0, texture: 3 });
  const rgb = inkFilterOverlay(texture, w, h, verdict.map((e, i) => ({ ...e, points: patch[i].points })));
  let red = 0;
  for (let i = 0; i < w * h; i++) if (rgb[3 * i] === 214 && rgb[3 * i + 1] === 40) red++;
  assert.ok(red > 3 * (73 - 55));
});
