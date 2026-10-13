import test from 'node:test';
import assert from 'node:assert/strict';
import { gaussian } from '../../keyframes/density.mjs';
import { edgeEvidence } from './line-evidence.mjs';
import { checkSketch } from './sketch-check.mjs';

const W = 160, H = 120, MM = 152.4 / 540;
// a dark box (x 40..120, y 30..90) on white paper
const box = (() => {
  const rgb = new Uint8Array(W * H * 3).fill(245);
  for (let y = 30; y < 90; y++) for (let x = 40; x < 120; x++) rgb.set([70, 60, 50], 3 * (y * W + x));
  return rgb;
})();
const ev = edgeEvidence(box, W, H);
const seg = (x0, y0, x1, y1, n = 20) => ({ points: Array.from({ length: n + 1 }, (_, k) => ({ x: x0 + (x1 - x0) * k / n, y: y0 + (y1 - y0) * k / n })) });
const outline = (dx = 0, dy = 0) => [seg(40 + dx, 30 + dy, 120 + dx, 30 + dy), seg(120 + dx, 30 + dy, 120 + dx, 90 + dy), seg(120 + dx, 90 + dy, 40 + dx, 90 + dy), seg(40 + dx, 90 + dy, 40 + dx, 30 + dy)];

test('a sketch on the target\'s edges is accepted and an invented line in empty paper is dropped', () => {
  const invented = seg(50, 108, 110, 108);
  const r = checkSketch([...outline(), invented], ev, { mmPerCell: MM, blur: gaussian });
  assert.equal(r.accepted, true, r.why.join('; '));
  assert.equal(r.stats.inventedLines, 1);
  assert.equal(r.lines.length, 4);
});

test('a sketch that is mostly invented is rejected with its reason', () => {
  const lines = [seg(5, 5, 150, 10), seg(10, 100, 150, 112), seg(140, 5, 150, 110), outline()[0]];
  const r = checkSketch(lines, ev, { mmPerCell: MM, blur: gaussian });
  assert.equal(r.accepted, false);
  assert.ok(r.why.some(s => /no edge in the target/.test(s)));
});

test('a sketch drawn a little off the target is snapped onto its edges', () => {
  const r = checkSketch(outline(3, -2), ev, { mmPerCell: MM, blur: gaussian });
  assert.equal(r.accepted, true, r.why.join('; '));
  const d = r.lines.flatMap(g => g.points.map(q => ev.dist[Math.round(q.y) * W + Math.round(q.x)])).sort((a, b) => a - b);
  assert.ok(d[Math.floor(d.length / 2)] <= 1, `median ${d[Math.floor(d.length / 2)]} cells off an edge`);
  assert.ok(d.at(-1) <= 4, `worst ${d.at(-1)} cells off an edge, at a corner`);
});

test('a short unmatched mark over a dark area is kept as hatching', () => {
  const hatch = seg(60, 50, 64, 54, 4);
  const r = checkSketch([...outline(), hatch], ev, { mmPerCell: MM, blur: gaussian, dark: Float32Array.from({ length: W * H }, (_, i) => (box[3 * i] < 128 ? 0.8 : 0)) });
  assert.equal(r.stats.hatchLines, 1);
  assert.ok(r.lines.some(g => g.role === 'hatch'));
});
