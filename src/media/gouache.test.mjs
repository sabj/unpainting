// White gouache laid last: it goes only where the source has a small light and the painting has lost it, it hides what
// it lies on rather than filtering it as a glaze does, it thins where the light is thinner than a cell, and a dry brush
// leaves the paper's hollows showing through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gouacheCover, dryCover, overlay } from './gouache.mjs';

test('white goes where the source has a light and the painting went over it, and nowhere else', () => {
  const share = Float32Array.from([1, 1, 0, 0.25, 1]);
  const painted = Float32Array.from([1.2, 0.05, 1.2, 1.2, 0.5]);
  const source = Float32Array.from([0.1, 0.02, 0.1, 0.4, 0.45]);
  const cover = gouacheCover(share, painted, source, 5, { margin: 0.08, full: 0.5 });
  assert.equal(cover[0], 1, 'a catchlight painted over is covered');
  assert.equal(cover[1], 0, 'a light the painting kept is left alone');
  assert.equal(cover[2], 0, 'no light in the source, no white');
  assert.equal(cover[3], 0.5, 'a whisker a quarter of a cell wide covers half the cell');
  assert.equal(cover[4], 0, 'a cell within the margin of its source is left alone');
});

test('a dry brush misses the hollows, never more than its opacity', () => {
  const cover = Float32Array.from([1, 1, 1, 0]);
  const height = Float32Array.from([0.9, 0.55, 0.1, 0.9]);
  const out = dryCover(cover, height, 4, { opacity: 0.9, dry: 0.5 });
  assert.ok(Math.abs(out[0] - 0.9) < 1e-6, `on a hill the stroke covers its opacity: ${out[0]}`);
  assert.ok(Math.abs(out[1] - 0.9) < 1e-6, 'and at the middle of the relief');
  assert.ok(out[2] < out[0] && out[2] >= 0.45 - 1e-6, `in a hollow it covers less: ${out[2].toFixed(2)}`);
  assert.equal(out[3], 0, 'no stroke, no white');
});

test('opaque white hides a dark wash it lies on', () => {
  const rgb = Buffer.from([40, 30, 20, 40, 30, 20]);
  const out = overlay(rgb, Float32Array.from([0.9, 0]), [250, 248, 240], 2);
  assert.ok(out[0] > 220 && out[1] > 215, `covered at 0.9 the cell reads white: ${out[0]}/${out[1]}/${out[2]}`);
  assert.deepEqual([...out.subarray(3)], [40, 30, 20], 'the cell with no white is as it was');
  assert.deepEqual([...rgb], [40, 30, 20, 40, 30, 20], 'the painting given is not changed');
});
