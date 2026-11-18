// The final lights are laid only where the painting lost them, root end first, and the record says what was laid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { strokesToLay, rootFirst, MARGIN_OD } from './gouache-finish.mjs';

const w = 20, h = 10;
const stroke = (x0, x1, y, lightOd) => ({ kind: 'strand', curve: [[x0, y], [(x0 + x1) / 2, y], [x1, y]], lightOd });

test('a stroke goes where the washes covered the light, and not where they kept it', () => {
  const painted = new Float32Array(w * h).fill(1.2);
  for (let x = 0; x < w; x++) painted[7 * w + x] = 0.2; // the washes left paper here
  const { lay, kept } = strokesToLay([stroke(2, 12, 3, 0.3), stroke(2, 12, 7, 0.3)], painted, w, h);
  assert.equal(lay.length, 1); assert.equal(kept.length, 1);
  assert.ok(lay[0].paintedOd - lay[0].lightOd >= MARGIN_OD);
});

test('a stroke the washes darkened only a little is left alone', () => {
  const painted = new Float32Array(w * h).fill(0.4);
  assert.equal(strokesToLay([stroke(2, 12, 3, 0.3)], painted, w, h).lay.length, 0);
});

test('hairs start at the body of the cluster and lift outwards', () => {
  const out = rootFirst([stroke(2, 6, 1, 0), { ...stroke(8, 4, 2, 0) }, stroke(14, 18, 3, 0)]);
  const cx = (out[0].curve[1][0] + out[1].curve[1][0] + out[2].curve[1][0]) / 3;
  for (const s of out) assert.ok(Math.abs(s.curve[0][0] - cx) <= Math.abs(s.curve.at(-1)[0] - cx), 'the root end is the one nearer the cluster');
});

test('a glint is left as it is', () => {
  const g = { kind: 'glint', curve: [[3, 3], [4, 3]], lightOd: 0.05 };
  assert.deepEqual(rootFirst([g])[0].curve, g.curve);
});
