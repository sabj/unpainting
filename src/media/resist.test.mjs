// Masking fluid: paper sealed under a film, washed over, then rubbed off. A wash can flow across the reserved shape
// and the shape survives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, soak, step, dry, layersOf, applyResist, liftResist, DEFAULTS } from './sheet.mjs';

const W = 60, H = 40, N = W * H;
const PIG = [{ K: [0.4, 0.5, 0.6], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.3 }];
const fresh = () => createSheet(makePaper(W, H, { seed: 5 }), PIG);
const disc = (cx, cy, r) => { const m = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m[y * W + x] = 1; return m; };
/** Lay a loaded wash across the sheet and let it settle. The paint is put down over the whole band, as a brush
 *  would, and then flows: a mask sitting in the middle of it has to be flowed over, not painted around. */
const washAcross = sheet => {
  for (let y = 6; y < H - 6; y++) for (let x = 2; x < W - 2; x++) deposit(sheet, y * W + x, 0.35, [1.2]);
  for (let q = 0; q < 300; q++) step(sheet, DEFAULTS);
  dry(sheet, 20000, DEFAULTS, { levelMax: 600 });
};
const massIn = (sheet, mask) => {
  const L = layersOf(sheet);
  let sum = 0;
  for (let i = 0; i < N; i++) if (mask[i]) for (const layer of L) sum += layer[0][i];
  return sum;
};

test('a wash flows over a masked shape and leaves it clean', () => {
  const mask = disc(30, 20, 7);
  const bare = fresh(); washAcross(bare);
  const masked = fresh(); applyResist(masked, mask); washAcross(masked); liftResist(masked);
  const under = massIn(masked, mask), was = massIn(bare, mask);
  assert.ok(was > 1e-3, `the wash reaches there at all when nothing is masking it (${was.toFixed(4)})`);
  assert.ok(under < was * 0.05, `under the mask stays clean: ${under.toFixed(5)} against ${was.toFixed(4)}`);
});

test('the wash still arrives beyond the masked shape, having flowed past it', () => {
  const mask = disc(30, 20, 7);
  const beyond = new Uint8Array(N);
  for (let y = 14; y < 26; y++) for (let x = 42; x < 52; x++) beyond[y * W + x] = 1;
  const masked = fresh(); applyResist(masked, disc(30, 20, 7)); washAcross(masked); liftResist(masked);
  const bare = fresh(); washAcross(bare);
  const past = massIn(masked, beyond), open = massIn(bare, beyond);
  assert.ok(past > 0.3 * open, `the wash gets past the mask: ${past.toFixed(4)} against ${open.toFixed(4)} with nothing in the way`);
});

test('lifting the mask leaves what was under it, not bare paper by fiat', () => {
  const mask = disc(30, 20, 6);
  const sheet = fresh();
  // an underpainting first, then the mask, then a wash over the top
  for (let i = 0; i < N; i++) soak(sheet, i, 0.05, [0.3]);
  dry(sheet, 20000, DEFAULTS, { levelMax: 600 });
  const before = massIn(sheet, mask);
  applyResist(sheet, mask); washAcross(sheet); liftResist(sheet);
  const after = massIn(sheet, mask);
  assert.ok(before > 1e-4, `there is an underpainting to keep (${before.toFixed(4)})`);
  assert.ok(after > 0.8 * before, `the first wash survives under the mask: ${after.toFixed(4)} against ${before.toFixed(4)}`);
});
