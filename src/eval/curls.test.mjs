// Known answers for the curly-fur measure: a flat dark blob, the same blob built from lit ringlets with hooked edges,
// and the blob combed into straight light stripes, so curl is told from texture of any kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { curlyFur, darkMass, perimeter, elongation, strokeLike } from './curls.mjs';
import { gaussian } from '../keyframes/density.mjs';

const W = 140, H = 140, N = W * H, SAND = 200, BLACK = 25, LIT = 95;
const inBlob = (x, y) => Math.hypot(x - 70, y - 70) < 48;

const flat = () => { const L = new Float32Array(N).fill(SAND); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBlob(x, y)) L[y * W + x] = BLACK; return L; };

// ringlets: on a grid of curls 9 cells apart, the upper half of a ring of radius 3 is lit, as sky light catches the top of
// each lock; along the edge, hooks of dark reach out two to four cells and bays of sand cut in
const curly = () => {
  const L = flat();
  for (let cy = 26; cy < 116; cy += 9) for (let cx = 26 + ((cy / 9) % 2) * 4; cx < 116; cx += 9) {
    for (let a = -Math.PI; a <= 0; a += 0.05) {
      const x = Math.round(cx + 3 * Math.cos(a)), y = Math.round(cy + 3 * Math.sin(a));
      if (inBlob(x, y) && Math.hypot(x - 70, y - 70) < 45) L[y * W + x] = LIT;
    }
  }
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * 2 * Math.PI, bend = k % 2 ? 1 : -1;
    for (let t = 0; t < 7; t++) {
      const r = 46 + t * 0.6, b = a + bend * t * 0.08;
      const x = Math.round(70 + r * Math.cos(b)), y = Math.round(70 + r * Math.sin(b));
      if (x >= 0 && y >= 0 && x < W && y < H) L[y * W + x] = BLACK;
    }
    const ba = a + Math.PI / 40, bx = Math.round(70 + 45 * Math.cos(ba)), by = Math.round(70 + 45 * Math.sin(ba));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) L[(by + dy) * W + bx + dx] = SAND;
  }
  return L;
};

// straight light stripes 9 cells apart, drawn smooth across so the raster's steps are not read as curl
const combed = () => {
  const L = flat();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBlob(x, y) && Math.hypot(x - 70, y - 70) < 45) {
    const across = (y + 0.3 * x) / Math.hypot(1, 0.3);
    L[y * W + x] = BLACK + (LIT - BLACK) * Math.pow(Math.max(0, Math.cos((2 * Math.PI * across) / 9)), 6);
  }
  return L;
};

test('the dark mass is the blob, whole, with its lit curls inside it', () => {
  const { area } = darkMass(curly(), W, H, gaussian);
  const disc = Math.PI * 48 * 48;
  assert.ok(area > 0.9 * disc && area < 1.15 * disc, `area ${area} against ${disc.toFixed(0)}`);
});

test('a flat dark blob has no lights, no texture and a smooth edge', () => {
  const m = curlyFur(flat(), W, H, gaussian);
  assert.ok(m.lit < 0.005, `lit ${m.lit}`);
  assert.ok(m.texture < 0.004, `texture ${m.texture}`);
  assert.ok(m.rough < 1.1, `rough ${m.rough}`);
  assert.ok(m.fringe < 0.3, `fringe ${m.fringe}`);
});

test('ringlets read as lit arcs, curved level lines and a broken edge', () => {
  const m = curlyFur(curly(), W, H, gaussian);
  assert.ok(m.lit > 0.05, `lit ${m.lit}`);
  assert.ok(m.lift > 0.15, `lift ${m.lift}`);
  assert.ok(m.arcs > 0.5, `arcs ${m.arcs}`);
  assert.ok(m.texture > 0.02, `texture ${m.texture}`);
  assert.ok(m.curvature > 0.15, `curvature ${m.curvature}`);
  assert.ok(m.rough > 1.25, `rough ${m.rough}`);
  assert.ok(m.spacing > 2 && m.spacing < 6, `spacing ${m.spacing}`);
});

test('combed straight hair is textured and lit but coherent and hardly curved', () => {
  const c = curlyFur(combed(), W, H, gaussian), r = curlyFur(curly(), W, H, gaussian);
  assert.ok(c.lit > 0.05, `lit ${c.lit}`);
  assert.ok(c.coherence > r.coherence + 0.2, `coherence combed ${c.coherence.toFixed(2)} curly ${r.coherence.toFixed(2)}`);
  assert.ok(c.curvature < r.curvature / 2, `curvature combed ${c.curvature.toFixed(2)} curly ${r.curvature.toFixed(2)}`);
});

test('perimeter, elongation, and an arc is a stroke where a speck is not', () => {
  const M = new Uint8Array(100); for (let y = 2; y < 5; y++) for (let x = 2; x < 8; x++) M[y * 10 + x] = 1;
  assert.equal(perimeter(M, 10, 10), 18);
  const row = [0, 1, 2, 3, 4, 5, 6, 7].map(x => 30 + x);
  assert.ok(elongation(row, 10) > 5);
  assert.ok(Math.abs(elongation([0, 1, 10, 11], 10) - 1) < 1e-9);
  const ring = new Set(); for (let a = -Math.PI; a <= 0; a += 0.05) ring.add((10 + Math.round(3 * Math.sin(a))) * 20 + 10 + Math.round(3 * Math.cos(a)));
  assert.ok(strokeLike([...ring], 20), 'the lit half of a ring is a stroke');
  const disc = []; for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) disc.push((10 + y) * 20 + 10 + x);
  assert.ok(!strokeLike(disc, 20), 'a disc is a spot');
  assert.ok(!strokeLike([0, 1, 20, 21], 20), 'a 2 by 2 speck is a spot');
});
