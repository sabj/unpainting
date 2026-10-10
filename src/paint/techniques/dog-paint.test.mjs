import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blotCentres, blotPath } from './dog-paint.mjs';

const lcg = seed => { let s = seed; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

test('blot centres lie inside the mask and keep their spacing', () => {
  const w = 60, h = 40, allow = new Uint8Array(w * h);
  for (let y = 5; y < 35; y++) for (let x = 10; x < 50; x++) allow[y * w + x] = 1;
  const cs = blotCentres(allow, w, h, 6, lcg(3));
  assert.ok(cs.length > 10);
  for (const c of cs) assert.equal(allow[c.i], 1);
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) assert.ok(Math.hypot(cs[a].x - cs[b].x, cs[a].y - cs[b].y) >= 6 - 1e-9);
});

test('blot centres are the same for the same seed', () => {
  const w = 30, h = 30, allow = new Uint8Array(w * h).fill(1);
  assert.deepEqual(blotCentres(allow, w, h, 4, lcg(9)), blotCentres(allow, w, h, 4, lcg(9)));
});

test('a blot path stays within its radius of the centre', () => {
  const rnd = lcg(5);
  for (let k = 0; k < 50; k++) {
    const pts = blotPath(100, 100, 8, rnd);
    assert.ok(pts.length >= 3);
    for (const p of pts) { assert.ok(Math.hypot(p.x - 100, p.y - 100) <= 8); assert.ok(p.r > 0 && p.r <= 8); }
  }
});

import { ringletLayout } from './dog-ringlets.mjs';

test('ringlets keep apart, carry crescents on the light side and colour into non-touching sets', () => {
  const w = 80, h = 80, allow = new Uint8Array(w * h), lit = new Uint8Array(w * h);
  for (let y = 10; y < 70; y++) for (let x = 10; x < 70; x++) allow[y * w + x] = 1;
  const { curls, crescent, sets } = ringletLayout(allow, lit, w, h, lcg(4), { r0: 5, shadowShare: 1 });
  assert.ok(curls.length > 10 && sets >= 2);
  for (let a = 0; a < curls.length; a++) for (let b = a + 1; b < curls.length; b++) {
    const d = Math.hypot(curls[a].x - curls[b].x, curls[a].y - curls[b].y);
    assert.ok(d >= 10 - 1e-9);
    if (d < 1.1 * (curls[a].r + curls[b].r)) assert.notEqual(curls[a].set, curls[b].set);
  }
  // with the light from above, crescent cells sit above their ringlet's centre
  let above = 0, below = 0;
  for (let i = 0; i < w * h; i++) if (crescent[i]) { const y = (i / w) | 0, x = i % w; const c = curls.reduce((m, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(m.x - x, m.y - y) ? q : m)); if (y < c.y) above++; else below++; }
  assert.ok(above > 5 * below);
});
