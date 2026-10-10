import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { makeInkRes } from './ink-res.mjs';

const ink = { K: [1.2, 1.3, 1.4], S: [0.02, 0.02, 0.02], rho: 0.02, omega: 5.5, gamma: 0.15 };
const W = 60, H = 20;
const setup = () => { const main = createSheet(makePaper(W, H, { seed: 2 }), [ink]); return { main, R: makeInkRes({ N: 3, W2: W, H2: H, paperOpts: { seed: 2 }, pigments: [ink], main }) }; };
const line = { points: Array.from({ length: 50 }, (_, k) => ({ x: 5 + k, y: 10, s: 0.8 })) };

test('the ink drawn at 3x is carried down whole onto the painting\'s sheet', () => {
  const { main, R } = setup();
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const lo = thickness(main)[0].reduce((a, v) => a + v, 0);
  const hi = thickness(R.fine)[0].reduce((a, v) => a + v, 0) / 9;
  assert.ok(lo > 0);
  assert.ok(Math.abs(lo - hi) / hi < 1e-4, `${lo} against ${hi}`);
});

test('a fine line drawn into a damp wash spreads wider than on dry paper', () => {
  const spread = wetHalf => {
    const { main, R } = setup();
    if (wetHalf) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; main.M[i] = 1; main.ever[i] = 1; main.W[i] = 0.5; main.s[i] = main.paper.capacity[i]; }
    R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
    const T = thickness(R.fine)[0];
    let cells = 0; for (const v of T) if (v > 1e-3) cells++;
    return cells;
  };
  assert.ok(spread(true) > spread(false), 'wet spreads further');
});

test('compose is N times the size and darker on the line than beside it', () => {
  const { main, R } = setup();
  R.draw([line], new Float32Array(W * H).fill(1), W, H, { ink: [10], peak: 1 });
  const out = R.compose(Buffer.alloc(W * H * 3, 230));
  assert.equal(out.length, W * H * 27);
  const at = (x, y) => out[(y * R.width + x) * 3];
  assert.ok(at(90, 31) < at(90, 45));
});
