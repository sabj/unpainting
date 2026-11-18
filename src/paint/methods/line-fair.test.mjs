// Fairing: a kept line follows its ridge and is drawn as a clean primitive or one smooth curve, with no tremor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fairLine, fairLines, curvatureFlips, dropWandering } from './line-fair.mjs';

const PX = 0.26;                                       // mm per pixel of the line model's own grid
const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5; })();
const noisy = (f, n, amp) => Array.from({ length: n }, (_, k) => { const p = f(k / (n - 1)); return { x: p.x + amp * rnd() / PX, y: p.y + amp * rnd() / PX }; });
const dist = (P, f) => { let far = 0, sum = 0; for (const p of P.slice(4, -4)) { let best = Infinity; for (let t = 0; t <= 1; t += 0.001) { const q = f(t); best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)); } far = Math.max(far, best * PX); sum += best * PX; } return { far, mean: sum / (P.length - 8) }; };
const straight = t => ({ x: 20 + 160 * t, y: 40 + 30 * t });
const R = 60 / PX, arc = t => ({ x: 100 + R * Math.sin(t * 1.2), y: 200 - R * Math.cos(t * 1.2) });   // 60 mm radius, 72 degrees

test('a straight line with a quarter millimetre of tremor comes back straight, within a tenth of a millimetre of the true line', () => {
  const g = { points: noisy(straight, 150, 0.5) };
  assert.ok(curvatureFlips(g.points, PX) > 3, 'the fixture wobbles');
  const r = fairLine(g, { pxMm: PX });
  assert.equal(curvatureFlips(r.points, PX), 0);
  assert.ok(dist(r.points, straight).far < 0.1, JSON.stringify(dist(r.points, straight)));
  assert.equal(r.fair.kind, 'line');
});

test('a noisy arc comes back as the arc: radius within 5 per cent, within a tenth of a millimetre, one curvature sign', () => {
  const g = { points: noisy(arc, 170, 0.5) };
  const r = fairLine(g, { pxMm: PX });
  assert.equal(curvatureFlips(r.points, PX), 0);
  assert.ok(dist(r.points, arc).far < 0.12, JSON.stringify(dist(r.points, arc)));
  assert.equal(r.fair.kind, 'arc');
});

test('an organic curve that is no single arc comes back as one smooth curve, not a set of pieces', () => {
  const wave = t => ({ x: 20 + 200 * t, y: 100 + 14 * Math.sin(t * Math.PI * 1.6) });     // under one turn of an S, 52 mm long
  const g = { points: noisy(wave, 200, 0.5) };
  const r = fairLine(g, { pxMm: PX });
  assert.ok(curvatureFlips(r.points, PX) <= 1);
  assert.ok(dist(r.points, wave).far < 0.2, JSON.stringify(dist(r.points, wave)));
  assert.equal(r.fair.kind, 'smooth');
});

test('a corner stays a corner: both legs are straight and the corner point is not rounded off', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let st = seed * 7919; const r0 = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5;
    const leg1 = Array.from({ length: 80 }, (_, k) => ({ x: 20 + k, y: 100 })), leg2 = Array.from({ length: 80 }, (_, k) => ({ x: 100, y: 100 + k + 1 }));
    const g = { points: [...leg1, ...leg2].map(p => ({ x: p.x + 0.4 * r0() / PX, y: p.y + 0.4 * r0() / PX })) };
    const r = fairLine(g, { pxMm: PX });
    const near = r.points.reduce((b, p) => Math.min(b, Math.hypot(p.x - 100, p.y - 100)), Infinity) * PX;
    assert.ok(near < 0.2, `seed ${seed}: a point of the faired line lies at the corner: ${near}`);
    assert.ok(r.points.slice(4, -4).every(p => Math.abs(p.y - 100) < 0.3 / PX || Math.abs(p.x - 100) < 0.3 / PX), `seed ${seed}: no leg bows away from its edge`);
    assert.equal(r.fair.kind, 'poly');
  }
});

test('the ends stay within the tolerance of the trace, and a piece that fairing would move too far is left as it is', () => {
  const g = { points: noisy(straight, 150, 0.5) };
  const r = fairLine(g, { pxMm: PX });
  assert.ok(Math.hypot(r.points[0].x - g.points[0].x, r.points[0].y - g.points[0].y) * PX < 0.3);
  assert.ok(Math.hypot(r.points.at(-1).x - g.points.at(-1).x, r.points.at(-1).y - g.points.at(-1).y) * PX < 0.3);
  // a 1.5 mm scallop is shape, not tremor: moving it more than the ridge allows leaves it alone
  const scallop = { points: Array.from({ length: 120 }, (_, k) => ({ x: 20 + k, y: 50 + (k % 12 < 6 ? 4 : -4) })) };
  const s = fairLine(scallop, { pxMm: PX });
  assert.ok(s.fair.kept === 'original' || dist(s.points, t => ({ x: 20 + 119 * t, y: 50 })).far < 5);
});

test('widths and weights follow the line along its length', () => {
  const pts = noisy(straight, 100, 0.4).map((p, k) => ({ ...p, width: 1 + k / 99, weight: 0.2 + k / 99 }));
  const r = fairLine({ points: pts }, { pxMm: PX });
  assert.ok(r.points.every(p => Number.isFinite(p.width) && Number.isFinite(p.weight)));
  assert.ok(Math.abs(r.points[0].width - 1) < 0.05 && Math.abs(r.points.at(-1).width - 2) < 0.05);
  const mid = r.points[r.points.length >> 1];
  assert.ok(Math.abs(mid.width - 1.5) < 0.1);
});

test('a batch is faired line by line and counts what it did', () => {
  const lines = [{ points: noisy(straight, 150, 0.5) }, { points: noisy(arc, 170, 0.5) }, { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }];
  const r = fairLines(lines, { pxMm: PX });
  assert.equal(r.lines.length, 3);
  assert.deepEqual([r.stats.line, r.stats.arc, r.stats.smooth + r.stats.untouched], [1, 1, 1]);
});

test('a line that reverses its curvature twice or more is a wandering scribble and is left to the wash; one S, an arc and a face feature stay', () => {
  const worm = { points: Array.from({ length: 200 }, (_, k) => ({ x: 20 + k * 0.9, y: 100 + 7 * Math.sin(k / 199 * Math.PI * 6) })) };    // three waves, 47 mm long
  const oneS = { points: Array.from({ length: 200 }, (_, k) => ({ x: 20 + k * 0.9, y: 100 + 12 * Math.sin(k / 199 * Math.PI * 1.7) })) };
  const arc = { points: Array.from({ length: 160 }, (_, k) => ({ x: 100 + R * Math.sin(k / 159 * 1.2), y: 200 - R * Math.cos(k / 159 * 1.2) })) };
  const faired = fairLines([worm, oneS, arc], { pxMm: PX }).lines;
  const r = dropWandering(faired, { pxMm: PX });
  assert.equal(r.lines.length, 2);
  assert.equal(r.stats.dropped, 1);
  assert.ok(r.stats.droppedMm > 40);
  const f = dropWandering(faired, { pxMm: PX, isFeature: () => true });
  assert.equal(f.lines.length, 3, 'a face or hand feature keeps its line');
});
