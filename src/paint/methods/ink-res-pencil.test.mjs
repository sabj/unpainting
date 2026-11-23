// The pencil on the pen's fine sheet (rc3): drawn at the pen's resolution, carried into the painting's sheet, lifted by
// the eraser on both, and a sheet without pencil composed exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness } from '../../media/sheet.mjs';
import { makeInkRes } from './ink-res.mjs';
import { layVectors, inkForDarkness } from './ink-vectors.mjs';
import { renderLayers } from '../../media/km.mjs';
import { drawingInkResArgs } from './ink-recipe.mjs';

const ink = { name: 'sepia ink', K: [0.4, 0.48, 0.62], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0 };
const graphite = { name: 'graphite HB', K: [0.22, 0.22, 0.23], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 60, gamma: 0 };
const paint = { name: 'raw sienna', K: [0.06, 0.26, 0.48], S: [0.05, 0.05, 0.05], rho: 0.06, omega: 0.5, gamma: 0.55 };
const W = 40, H = 30, MM = 0.26;
const sum = a => a.reduce((s, v) => s + v, 0);
const darkOf = pig => t => { const c = renderLayers([[Float32Array.of(t)]], [pig], Buffer.alloc(3, 255), 1, 1); return 1 - (c[0] + c[1] + c[2]) / 765; };
// a fine diagonal line 0.12 mm wide, finer than a painting cell (0.26 mm), as a vector stroke outline in mm
const stroke = (x0, y0, x1, y1, wMm = 0.12, dark = 0.5) => { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * wMm / 2, ny = dx / L * wMm / 2;
  return { seq: 0, dark, outline: [[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]] }; };
const doc = { strokes: [stroke(1, 1.3, 9.5, 6.1)] };

/** A pencil-only sheet (the graphite is the drawing's one channel) or ink with pencil beside it. */
function sheetWith(pigments, { inkAt, graphiteAt = null, N = 2 }) {
  const main = createSheet(makePaper(W, H, { seed: 4 }), pigments);
  return { main, R: makeInkRes({ N, W2: W, H2: H, paperOpts: { seed: 4 }, pigments, main, inkAt, graphiteAt }) };
}
const layPencil = (R, c, d = doc) => { const k = R.channel(c), pig = R.fine.pigments[k]; const q = layVectors(d, R.fine.D[k], R.width, R.height, MM * W / R.width, inkForDarkness(darkOf(pig))); R.changed(); R.carry(); return q; };

test('a pencil drawing is drawn on the fine sheet and carried whole into the painting\'s graphite', () => {
  const { main, R } = sheetWith([paint, graphite], { inkAt: 1, graphiteAt: 1 });
  assert.deepEqual(R.channels, [1]);
  layPencil(R, 1);
  const lo = sum(thickness(main)[1]), hi = sum(thickness(R.fine)[0]) / 4;
  assert.ok(lo > 0 && Math.abs(lo - hi) / hi < 1e-5, `${lo} against ${hi}`);
  assert.equal(sum(thickness(main)[0]), 0, 'no paint moved');
});

test('beside ink the pencil has its own fine channel; each is carried to its own channel of the painting', () => {
  const { main, R } = sheetWith([paint, ink, graphite], { inkAt: 1, graphiteAt: 2 });
  assert.deepEqual(R.channels, [1, 2]);
  layPencil(R, 2);
  assert.ok(sum(thickness(main)[2]) > 0);
  assert.equal(sum(thickness(main)[1]), 0, 'pencil laid none of the ink');
  assert.throws(() => R.channel(0), /not drawn on it/);
  assert.throws(() => makeInkRes({ N: 2, W2: W, H2: H, paperOpts: {}, pigments: [paint, ink, graphite], main, inkAt: 1, graphiteAt: 0 }), /not the pencil's graphite/);
});

test('an ink drawing with no pencil composes exactly as before the pencil channel existed', () => {
  const pen = { strokes: [stroke(2, 2, 9, 7, 0.2, 0.8)] };
  const one = sheetWith([paint, ink], { inkAt: 1 }), two = sheetWith([paint, ink, graphite], { inkAt: 1, graphiteAt: 2 });
  for (const { R } of [one, two]) layPencil(R, 1, pen);
  const lo = Buffer.alloc(W * H * 3, 200);
  assert.deepEqual(two.R.compose(lo), one.R.compose(lo));
  assert.deepEqual(two.R.nativeInk().pixels, one.R.nativeInk().pixels);
});

test('the eraser\'s lift on the painting\'s graphite is taken on the fine sheet too, so the composed line goes', () => {
  const { main, R } = sheetWith([paint, graphite], { inkAt: 1, graphiteAt: 1 });
  layPencil(R, 1);
  const lo0 = Buffer.alloc(W * H * 3, 250), drawn = R.compose(lo0);
  const before = thickness(main)[1].slice();
  // rub out the left half wholly, halve the right
  for (const a of [main.D[1], main.G[1], main.P[1]]) for (let i = 0; i < a.length; i++) a[i] *= (i % W) < W / 2 ? 0 : 0.5;
  const after = thickness(main)[1].slice();
  assert.ok(R.erased(1, before, after) > 0);
  // the fine sheet holds what the painting holds, cell by cell
  const fine = thickness(R.fine)[0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += fine[(2 * y + dy) * R.width + 2 * x + dx];
    assert.ok(Math.abs(s / 4 - after[y * W + x]) < 1e-5 * Math.max(1, after[y * W + x]));
  }
  // where wholly erased the composed picture is the painting's own render, unmodulated
  const out = R.compose(lo0);
  for (let y = 0; y < R.height; y++) for (let x = 0; x < R.width / 2 - 2; x++) assert.equal(out[(y * R.width + x) * 3], 250);
  assert.ok(sum(out) > sum(drawn), 'lighter after the rub');
  // nothing new to carry: the rub is not undone by the next carry
  R.carry(); assert.deepEqual(thickness(main)[1], after);
  assert.throws(() => R.erased(1, before.subarray(1), after), /before and after/);
});

test('a fine pencil line is continuous on the fine sheet where the painting\'s own cells break it', () => {
  // the darkness along the line, at the drawing's own resolution; the share of steps paler than half the median
  const along = (R, field, w, mm) => { const v = []; for (let t = 0.05; t <= 0.95; t += 0.01) { const x = (1 + 8.5 * t) / mm, y = (1.3 + 4.8 * t) / mm; v.push(field[Math.round(y) * w + Math.round(x)] ?? 0); }
    const m = [...v].sort((a, b) => a - b)[v.length >> 1]; return { breaks: v.filter(d => d < 0.5 * m).length / v.length, cv: Math.sqrt(v.reduce((s, d) => s + (d - m) ** 2, 0) / v.length) / m }; };
  const coarse = new Float32Array(W * H); layVectors(doc, coarse, W, H, MM, inkForDarkness(darkOf(graphite)));
  const { R } = sheetWith([paint, graphite], { inkAt: 1, graphiteAt: 1, N: 4 }); layPencil(R, 1);
  const c = along(null, coarse, W, MM), f = along(R, R.fine.D[0], R.width, MM / 4);
  assert.ok(f.cv < c.cv, `fine cv ${f.cv.toFixed(2)} against coarse ${c.cv.toFixed(2)}`);
  assert.equal(f.breaks, 0);
});

test('a drawing from a file, pencil or pen, is put on the fine sheet at the pen\'s resolution, unless told or already fine', () => {
  assert.deepEqual(drawingInkResArgs(['--width', '1086', '--drawingfile', 'd']), ['--inkres', '2']);
  assert.deepEqual(drawingInkResArgs(['--width', '540', '--drawinglast', 'd']), ['--inkres', '4']);
  assert.deepEqual(drawingInkResArgs(['--width', '1462', '--drawingfile', 'd']), [], 'already at the pen\'s fineness');
  assert.deepEqual(drawingInkResArgs(['--width', '1086', '--drawingfile', 'd', '--inkres', '1']), []);
  assert.deepEqual(drawingInkResArgs(['--width', '1086', '--drawingfile', 'd', '--drawing', 'none']), []);
  assert.deepEqual(drawingInkResArgs(['--width', '1086']), []);
});
