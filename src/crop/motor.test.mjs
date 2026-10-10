import test from 'node:test';
import assert from 'node:assert/strict';
import { handOf, motorStroke, motorSignature, spacingVariation } from './motor.mjs';
const arc = (radius, sweep = Math.PI, n = 160, cx = 128, cy = 128) => Array.from({ length: n }, (_, i) => { const t = sweep * i / (n - 1); return { x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t), w: 2 }; });
const line = (x, y, X, Y, n = 80) => Array.from({ length: n }, (_, i) => ({ x: x + (X - x) * i / (n - 1), y: y + (Y - y) * i / (n - 1), w: 2 }));
const fit = (P, key) => { const x = P.map((_, i) => i), n = P.length, mx = x.reduce((a, b) => a + b) / n, my = P.reduce((a, p) => a + p[key], 0) / n; return P.reduce((a, p, i) => a + (i - mx) * (p[key] - my), 0) / x.reduce((a, i) => a + (i - mx) ** 2, 0); };

test('one hand is sampled once and its lean is shared by every stroke it draws', () => {
  const a = handOf(5), b = handOf(5), c = handOf(6);
  assert.deepEqual(a, b); assert.notEqual(a.down, c.down);
  assert.ok(a.speed > 0.2 && a.speed < 0.4 && a.anisotropy > 0.2);
  assert.deepEqual(motorStroke(line(10, 10, 90, 40), a, { seed: 3 }), motorStroke(line(10, 10, 90, 40), a, { seed: 3 }));
});

test('speed follows the cube root of the radius of curvature, as a hand does', () => {
  // a spiral spans two decades of radius; the slope of log speed on log radius should be about a third
  const spiral = Array.from({ length: 700 }, (_, i) => { const t = 1.2 + i * 0.02, r = 2.2 * t; return { x: 128 + r * Math.cos(t), y: 128 + r * Math.sin(t) }; });
  const drawn = motorStroke(spiral, handOf(2), { bellWeight: 0, tremor: 0, aimWeight: 0, spacing: 0.7 });
  const s = motorSignature([drawn]);
  assert.ok(Math.abs(s.speedSlope - 1 / 3) < 0.09, `slope ${s.speedSlope}`);
  assert.ok(s.samples > 200);
});

test('a reach is a bell of speed between two near rests, and a mark takes one to four of them', () => {
  const hand = handOf(3);
  const short = motorStroke(line(20, 20, 50, 20), hand, { tremor: 0 }), long = motorStroke(arc(70, Math.PI * 1.6), hand, { tremor: 0 });
  assert.equal(short.submovements, 1); assert.ok(long.submovements >= 2 && long.submovements <= 4);
  const v = short.points.map(p => p.v), mid = v[Math.floor(v.length / 2)];
  assert.ok(mid > v[2] * 1.8 && mid > v[v.length - 3] * 1.8, `bell ${v[2]} ${mid} ${v.at(-3)}`);
  assert.ok(short.points.at(-1).t > 0 && short.points.every((p, i, P) => i === 0 || p.t >= P[i - 1].t));
});

test('aim misses and the next reach takes most of it out, so the line never leaves the form', () => {
  const hand = handOf(9), P = line(10, 60, 200, 60, 200);
  const runs = Array.from({ length: 12 }, (_, seed) => motorStroke(P, hand, { tremor: 0, scale: 2, bellWeight: 0, seed }));
  const worst = runs.map(d => Math.max(...d.points.map(p => Math.abs(p.y - 60)))).sort((a, b) => a - b);
  assert.ok(worst[6] > 0.3, `a hand that never misses is a tracer: ${worst.join(' ')}`);
  assert.ok(worst.at(-1) < 2.5 * 2, `drift ${worst.at(-1)}`);
  assert.ok(runs.every(d => Math.abs(d.points.at(-1).y - 60) < Math.max(0.3, Math.max(...d.points.map(p => Math.abs(p.y - 60))) * 0.9)), 'the last reach aims at the end point');
  const fussy = Array.from({ length: 12 }, (_, seed) => motorStroke(P, hand, { tremor: 0, scale: 2, tolerance: 0.2, seed }));
  assert.ok(fussy.some(d => d.corrections >= 1) && fussy.every(d => d.corrections <= d.submovements));
});

test('pressure is heavier pulling towards the hand than pushing away, and holds its mean', () => {
  const hand = handOf(4, { down: 0, anisotropy: 0.4, gamma: 0 });
  const along = motorStroke(line(10, 60, 140, 60), hand, { tremor: 0, bellWeight: 0 }), against = motorStroke(line(140, 60, 10, 60), hand, { tremor: 0, bellWeight: 0 });
  const mean = D => D.points.reduce((a, p) => a + p.p, 0) / D.points.length;
  assert.ok(mean(along) > mean(against) * 1.3, `${mean(along)} vs ${mean(against)}`);
  const even = motorStroke(arc(40, Math.PI * 2, 300), handOf(4), { tremor: 0, closed: true }), avg = mean(even);
  assert.ok(Math.abs(avg - 0.5) < 0.12, `mean pressure ${avg}`);   // over a whole turn the lean cancels; the ends lift
  assert.ok(even.points.every(p => p.p > 0 && p.p < 2.4));
});

test('an open mark sweeps past the form at both ends, and lightly', () => {
  const P = line(40, 60, 160, 60, 120), drawn = motorStroke(P, handOf(6), { scale: 2 }).points;
  assert.ok(drawn[0].x < 40 - 1 && drawn.at(-1).x > 160 + 1, `${drawn[0].x} ${drawn.at(-1).x}`);
  assert.ok(drawn[0].x > 40 - 12 && drawn.at(-1).x < 160 + 12, 'a swing, not a second stroke');
  assert.ok(drawn[0].p < drawn[Math.floor(drawn.length / 2)].p && drawn.at(-1).p < drawn[Math.floor(drawn.length / 2)].p);
});

test('a closed loop is still closed after the hand has drawn it', () => {
  const loop = [...arc(30, Math.PI * 2, 200)]; loop[loop.length - 1] = { ...loop[0] };
  const drawn = motorStroke(loop, handOf(1), { closed: true });
  assert.deepEqual({ x: drawn.points.at(-1).x, y: drawn.points.at(-1).y }, { x: drawn.points[0].x, y: drawn.points[0].y });
});

test('evidence carried on the plan survives the hand', () => {
  const P = line(10, 10, 90, 10, 40).map((p, i) => ({ ...p, d: i / 39, w: 1 + i / 20 }));
  const drawn = motorStroke(P, handOf(8), { tremor: 0 });
  assert.ok(drawn.points.every(p => Number.isFinite(p.d) && p.d >= -0.01 && p.d <= 1.01));
  assert.ok(fit(drawn.points, 'd') > 0 && drawn.points.at(-1).d > 0.8 && drawn.points[0].d < 0.2);
});

test('short and empty marks are handled rather than thrown at', () => {
  assert.equal(motorStroke([], handOf(1)).points.length, 0);
  assert.equal(motorStroke([{ x: 1, y: 1 }], handOf(1)).points.length, 1);
  const tick = motorStroke([{ x: 1, y: 1 }, { x: 2, y: 1.4 }], handOf(1));
  assert.ok(tick.points.every(p => Number.isFinite(p.x + p.y + p.p)));
});

test('the signatures separate a drawn stroke from a traced one', () => {
  const path = Array.from({ length: 700 }, (_, i) => { const t = 1.2 + i * 0.02, r = 2.2 * t; return { x: 128 + r * Math.cos(t), y: 128 + r * Math.sin(t) }; }), hand = handOf(11);
  const drawn = motorStroke(path, hand, { scale: 2 });
  const traced = { points: path.map(p => ({ ...p, v: 1, p: 0.5, t: 0 })), submovements: 1 };
  const a = motorSignature([drawn], { scale: 2 }), b = motorSignature([traced], { scale: 2 });
  assert.ok(a.speedSlope > 0.1 && Math.abs(b.speedSlope) < 0.02);
  assert.ok(a.widthRatio > 1.8, `width swing ${a.widthRatio}`); assert.ok(Math.abs(b.widthRatio - 1) < 0.01);
  const gaps = [0, 3, 6.4, 9, 12.5, 15].map(y => ({ points: line(10, y, 40, y, 12) }));
  assert.ok(spacingVariation(gaps) > 0.05 && spacingVariation([]) === null);
});
