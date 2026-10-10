// Walking only the window a passage lives in gives chooseTechnique's own numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTechnique, softEdgeShare, toothShowing } from './technique.mjs';

test('the windowed technique measures equal the whole-sheet ones', () => {
  let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const w = 120, h = 90;
  for (let t = 0; t < 12; t++) {
    const D = Float32Array.from({ length: w * h }, () => rnd() * (t % 2 ? 0.1 : 0.8)), mask = new Uint8Array(w * h);
    const cx = 10 + rnd() * 100, cy = 10 + rnd() * 70, r = 3 + rnd() * 25; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) < r * (0.8 + 0.4 * rnd())) { mask[y * w + x] = 1; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const win = x1 < 0 ? { x0: 0, y0: 0, x1: -1, y1: -1 } : { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 };
    assert.deepEqual(chooseTechnique(D, mask, w, h, { win }), chooseTechnique(D, mask, w, h));
    assert.equal(softEdgeShare(D, mask, w, h, { win }), softEdgeShare(D, mask, w, h));
    assert.deepEqual(toothShowing(D, mask, w, h, { win }), toothShowing(D, mask, w, h));
  }
});
