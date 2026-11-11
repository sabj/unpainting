// The tracer's line rules (bench/v4v5/tools/trace-lines.mjs): a pen follows the line it is on, its line carries no
// pixel staircase, it lifts where the line turns back, it joins only where one piece continues another, and it goes on
// contours, not inside dark masses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { walkChains, simplify, splitAtTurns, joinPieces, hasLightSide } from '../v4v5/tools/trace-lines.mjs';

test('a pixel staircase along a straight line is one straight segment', () => {
  const P = []; for (let k = 0; k < 30; k++) P.push([k, Math.floor(k / 3)]);
  const s = simplify(P, 1);
  assert.equal(s.length, 2, JSON.stringify(s));
});

test('at a crossing the walk goes straight on, not round the corner', () => {
  const W = 41, H = 41, M = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) M[20 * W + x] = 1;   // horizontal
  for (let y = 0; y < H; y++) M[y * W + 20] = 1;   // vertical
  const chains = walkChains(M, W, H);
  const longest = Math.max(...chains.map(c => c.length));
  const c = chains.find(q => q.length === longest), a = c[0], b = c.at(-1);
  assert.ok(longest >= 38, `longest chain ${longest}`);
  assert.ok(a % W === b % W || ((a / W) | 0) === ((b / W) | 0), 'the longest chain is one straight line through the crossing');
});

test('a zigzag is several strokes: the pen lifts where its line turns back', () => {
  const P = [[0, 0], [10, 0], [2, 3], [12, 3], [4, 6]];
  assert.equal(splitAtTurns(P).length, 4);
  assert.equal(splitAtTurns([[0, 0], [10, 0], [18, 4], [24, 10]]).length, 1, 'a curve that keeps on going is one stroke');
});

test('pieces join where one continues the other across the tracer\'s gap, not at a corner', () => {
  const a = [[0, 0], [20, 0]], b = [[23, 0], [40, 0]], c = [[20, 3], [20, 20]];
  assert.equal(joinPieces([a, b], { gap: 4 }).length, 1);
  assert.equal(joinPieces([a, c], { gap: 4 }).length, 2);
  assert.equal(joinPieces([a, [[30, 0], [40, 0]]], { gap: 4 }).length, 2, 'a gap wider than the tracer\'s reach is the artist\'s');
});

test('a line between two dark masses has no light side; a contour against paper has', () => {
  const W = 60, H = 40, lum = new Float32Array(W * H).fill(0.95);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) lum[y * W + x] = 0.3;     // dark mass, top left
  for (let y = 20; y < 40; y++) for (let x = 0; x < 30; x++) lum[y * W + x] = 0.25;   // dark mass, bottom left
  const at = (x, y) => lum[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  assert.equal(hasLightSide([[2, 20], [26, 20]], at, 0.5), false, 'inside the dark mass');
  assert.equal(hasLightSide([[30, 2], [30, 38]], at, 0.5), true, 'the mass\'s contour against paper');
});

test('trace-ink draws a long line crossed by others as long lines, not fragments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  const lines = ['<path d="M 10 100 C 80 60 160 140 290 100" stroke="#111" stroke-width="2" fill="none"/>'];
  for (let k = 0; k < 6; k++) lines.push(`<path d="M ${40 + k * 40} 40 L ${50 + k * 40} 170" stroke="#111" stroke-width="2" fill="none"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#f6f2ea"/>${lines.join('')}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(dir, 't.png'));
  execFileSync('node', [new URL('../v4v5/tools/trace-ink.mjs', import.meta.url).pathname, path.join(dir, 't.png'), path.join(dir, 'o.json')], { stdio: 'pipe' });
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'o.json')));
  const longest = Math.max(...d.lines.map(l => l.length));
  assert.ok(longest >= 200, `longest traced line ${longest.toFixed(0)} px of a 290 px stroke`);
  assert.ok(d.lines.length <= 14, `${d.lines.length} lines for 7 strokes`);
  fs.rmSync(dir, { recursive: true, force: true });
});
