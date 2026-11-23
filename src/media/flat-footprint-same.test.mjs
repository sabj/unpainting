import test from 'node:test';
import assert from 'node:assert/strict';
import { footprint } from './tuft-section.mjs';

// the flat footprint before it passed over far sub-points and called hypot only at corners
function reference(g, w, X0, Y0, X1, Y1) {
  const { pts, S, rad, bx, by, thick } = g, nx = -by, ny = bx, sub = [], out = new Map();
  const box = (u, v, a, b, rc) => { const qx = Math.abs(u) - a + rc, qy = Math.abs(v) - b + rc; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc; };
  for (let j = 0; j + 1 < S; j++) {
    const ax = pts[2 * j], ay = pts[2 * j + 1], ex = pts[2 * j + 2] - ax, ey = pts[2 * j + 3] - ay, m = Math.max(1, Math.ceil(Math.hypot(ex, ey) / Math.max(0.35, 0.7 * thick)));
    for (let q = 0; q < m; q++) { const t = q / m; sub.push(ax + ex * t, ay + ey * t, rad[j] + (rad[j + 1] - rad[j]) * t); }
  }
  sub.push(pts[2 * S - 2], pts[2 * S - 1], rad[S - 1]);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    let best = Infinity, across = 0;
    for (let q = 0; q < sub.length; q += 3) {
      const dx = x + 0.5 - sub[q], dy = y + 0.5 - sub[q + 1], a = sub[q + 2], u = dx * bx + dy * by, v = dx * nx + dy * ny, d = box(u, v, a, thick, Math.min(thick, a));
      if (d < best) { best = d; across = a > 1e-6 ? Math.max(-1, Math.min(1, u / a)) : 0; }
    }
    out.set(y * w + x, [best, across]);
  }
  return out;
}

test('the flat footprint visits every cell with the same distance and place across as before, bit for bit', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 40; t++) {
    const S = 2 + Math.floor(rnd() * 6), pts = [], rad = [], ang = rnd() * Math.PI;
    let x = 20 + rnd() * 20, y = 20 + rnd() * 20;
    for (let j = 0; j < S; j++) { pts.push(x, y); rad.push(0.5 + rnd() * 6); x += (rnd() - 0.5) * 6; y += (rnd() - 0.5) * 6; }
    const g = { pts, S, rad, flat: true, bx: Math.cos(ang), by: Math.sin(ang), thick: 0.2 + rnd() * 2 };
    const got = new Map(), box = footprint(g, 64, 64, 2, (i, d, across) => got.set(i, [d, across]));
    const want = reference(g, 64, ...box);
    assert.equal(got.size, want.size);
    for (const [i, v] of want) assert.deepEqual(got.get(i), v, `cell ${i} of shape ${t}`);
  }
});

test('with a cut, the footprint visits exactly the cells within it, with the same distance and place across', () => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 120; t++) {
    // flats with one blade length (as the brush lays them) and with tapering ones, along and across the blade; rounds
    const flat = t % 3 !== 2, S = 6, pts = [], rad = [], ang = rnd() * Math.PI, a0 = 1 + rnd() * 30, st = rnd() * 6, ca = t % 2 ? ang + Math.PI / 2 : rnd() * 6;
    let x = 90 + rnd() * 20, y = 90 + rnd() * 20;
    for (let j = 0; j < S; j++) { pts.push(x, y); rad.push(t % 4 === 0 ? 0.5 + rnd() * 30 : a0); x += st * Math.cos(ca); y += st * Math.sin(ca); }
    const g = { pts, S, rad, flat, bx: Math.cos(ang), by: Math.sin(ang), thick: Math.max(0.5, 0.12 * a0) }, cut = 0.5 + rnd() * 4;
    const all = new Map(), within = new Map();
    footprint({ ...g }, 200, 200, 3, (i, d, across) => { if (d <= cut) all.set(i, [d, across]); });
    footprint({ ...g }, 200, 200, 3, (i, d, across) => { if (d <= cut) within.set(i, [d, across]); }, cut);
    assert.equal(within.size, all.size, `shape ${t}`);
    for (const [i, v] of all) assert.deepEqual(within.get(i), v, `cell ${i} of shape ${t}`);
  }
});
