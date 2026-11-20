import test from 'node:test';
import assert from 'node:assert/strict';
import { MARK_KINDS, makeMark, markFor, shapeGeometry, strokeData } from './index.mjs';
import { profile, movesPath } from './hand.mjs';

const at = { x: 50, y: 50, length: 24, width: 4, angle: 0.3, seed: 3 };
test('every kind makes plan strokes in mm with pressure and speed at every point', () => {
  for (const k of Object.keys(MARK_KINDS)) {
    const strokes = makeMark(k, at);
    assert.ok(strokes.length >= 1, k);
    for (const st of strokes) {
      assert.equal(st.kind, 'sweep'); assert.ok(st.radiusMm > 0, k); assert.ok(st.points.length >= 3, k);
      for (const q of st.points) { assert.equal(q.length, 5); assert.ok(q.every(Number.isFinite), k); assert.ok(q[2] > 0 && q[2] <= 1.2 && q[3] > 0, k); assert.equal(q[4], 1); }
      // near where it was asked for
      const xs = st.points.map(q => q[0]); assert.ok(Math.min(...xs) > 0 && Math.max(...xs) < 110, k);
    }
  }
  assert.throws(() => makeMark('smear', at)); assert.throws(() => makeMark('taper', { ...at, width: 0 }));
});
test('a mark is the same for a seed and differs between seeds', () => {
  assert.deepEqual(makeMark('swell', at), makeMark('swell', at));
  assert.notDeepEqual(makeMark('swell', at)[0].points, makeMark('swell', { ...at, seed: 4 })[0].points);
});
test('within one stroke the pressure rises and falls and the path turns: constant and straight only for a sweep', () => {
  const d = k => strokeData(makeMark(k, at)[0]);
  for (const k of ['taper', 's-stroke', 'bar', 'hook', 'contour', 'line']) assert.ok(d(k).peaks >= 2, `${k} peaks ${d(k).peaks}`);
  assert.ok(d('swell').peaks >= 3);
  for (const k of ['comma', 's-stroke', 'hook', 'contour', 'ribbon', 'ring']) assert.ok(d(k).turningDeg > 60, `${k} turns ${d(k).turningDeg}`);
  assert.ok(d('ring').turningDeg > 270 && d('scumble').turningDeg > 500);
  assert.ok(d('sweep').wideToNarrow < 1.3 && d('sweep').turningDeg < 20);
  // the ends: a taper lands and lifts on the point, a belly-first stroke lands pressed and lifts on the point
  const t = makeMark('taper', at)[0].points, r = makeMark('reverse', at)[0].points;
  assert.ok(t[0][2] < 0.15 && t.at(-1)[2] < 0.1 && r[0][2] > 0.5 && r.at(-1)[2] < 0.1);
  // a grass blade: a slow landing, fast through its body, and eased off over its last fifth so the tail is laid
  // (BRUSH-GAPS 5); a dry drag stays fast to its end
  const g = makeMark('grass', at)[0].points, mid = Math.max(...g.map(q => q[3]));
  assert.ok(mid > 2.5 * g[0][3] && g.at(-1)[3] <= 25 && mid > 2 * g.at(-1)[3]);
  assert.ok(makeMark('drag', at)[0].points.at(-1)[3] > 150);
});
test('a flat held at a fixed angle names it; a line is the point barely pressed; dry marks carry little water', () => {
  const rb = makeMark('ribbon', at)[0]; assert.equal(rb.flat, true); assert.equal(rb.held, 'fixed');
  const e = makeMark('edge', at)[0]; assert.equal(e.flat, true); assert.equal(e.angle, 0);
  const l = makeMark('line', { ...at, width: 0.4 })[0]; assert.ok(Math.max(...l.points.map(q => q[2])) < 0.3 && l.radiusMm >= 0.75);
  assert.ok(makeMark('drag', at)[0].water < 0.5 && makeMark('drag', { ...at, load: 0.5 })[0].water < makeMark('drag', at)[0].water);
});
test('compound gestures: a branch forks from its own joints, a leaf group fans from one point, hatch touches lie side by side', () => {
  const b = makeMark('branch', at); assert.equal(b.length, 3);
  for (const tw of b.slice(1)) assert.ok(b[0].points.some(q => Math.hypot(q[0] - tw.points[0][0], q[1] - tw.points[0][1]) < 1), 'a twig starts on the branch');
  assert.ok(b[1].radiusMm < b[0].radiusMm);
  const lg = makeMark('leaf-group', at); assert.equal(lg.length, 3);
  for (const s of lg) assert.ok(Math.hypot(s.points[0][0] - lg[0].points[0][0], s.points[0][1] - lg[0].points[0][1]) < 2);
  assert.ok(makeMark('hatch', at).length >= 3);
});
test('profile eases between knots; moves turn the path by their turns', () => {
  assert.equal(profile([[0, 0], [1, 1]], 0.5), 0.5); assert.equal(profile([[0.2, 3], [1, 1]], 0), 3);
  const p = movesPath([{ len: 1, turn: Math.PI / 2 }], 10, 0.1, 0, 0), a = p.at(-1), b = p.at(-2);
  assert.ok(Math.abs(Math.atan2(a[1] - b[1], a[0] - b[0]) - Math.PI / 2) < 0.05);
});

const gw = 200, cellMm = 0.25;
const cellsWhere = f => { const out = []; for (let y = 0; y < 200; y++) for (let x = 0; x < gw; x++) if (f((x + 0.5) * cellMm, (y + 0.5) * cellMm)) out.push(y * gw + x); return out; };
test('chooser: a long narrow tapering shape is ONE belly-first stroke along its axis, landing at the wide end', () => {
  // a 30 mm wedge along x, 4 mm wide at x 5, coming to a point at x 35
  const g = shapeGeometry(cellsWhere((x, y) => x > 5 && x < 35 && Math.abs(y - 20) < 2 * (35 - x) / 30), gw, cellMm);
  assert.ok(g.taper > 0.3 && Math.abs(g.angle) < 0.1);
  const m = markFor(g); assert.equal(m.name, 'reverse'); assert.equal(m.strokes.length, 1);
  const P = m.strokes[0].points; assert.ok(P[0][0] < 15 && P.at(-1)[0] > 25, 'from the wide end to the point');
  // the same shape pointing the other way still lands on its wide end
  const h = markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 35 && Math.abs(y - 20) < 2 * (x - 5) / 30), gw, cellMm));
  assert.equal(h.name, 'reverse'); assert.ok(h.strokes[0].points[0][0] > 25);
});
test('chooser: a speck is a dot, an even streak a taper, a hair a line, an S an S, grass flicked up, a small blob a touch, a big patch several strokes', () => {
  assert.equal(markFor(shapeGeometry(cellsWhere((x, y) => Math.hypot(x - 10, y - 10) < 0.6), gw, cellMm)).name, 'dot');
  const streak = markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 30 && Math.abs(y - 20) < 1.5 * Math.sin(Math.PI * (x - 5) / 25) + 0.2), gw, cellMm));
  assert.ok(['taper', 'swell', 'leaf'].includes(streak.name) && streak.strokes.length === 1, streak.name);
  assert.equal(markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 40 && Math.abs(y - 20) < 0.3), gw, cellMm)).name, 'line');
  const s = markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 45 && Math.abs(y - 25 - 5 * Math.sin(2 * Math.PI * (x - 5) / 40)) < 1.5), gw, cellMm));
  assert.equal(s.name, 's-stroke');
  const gr = markFor(shapeGeometry(cellsWhere((x, y) => y > 10 && y < 30 && Math.abs(x - 20) < 1.2 * (y - 10) / 20), gw, cellMm), { what: 'grass' });
  assert.equal(gr.name, 'grass'); assert.ok(gr.strokes[0].points[0][1] > gr.strokes[0].points.at(-1)[1], 'from the root up');
  assert.equal(markFor(shapeGeometry(cellsWhere((x, y) => Math.hypot(x - 10, (y - 10) * 1.3) < 2.5), gw, cellMm)).name, 'touch');
  const big = markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 40 && y > 5 && y < 30), gw, cellMm));
  assert.equal(big.name, 'sweep'); assert.ok(big.strokes.length >= 2);
  const fol = markFor(shapeGeometry(cellsWhere((x, y) => x > 5 && x < 30 && y > 5 && y < 20), gw, cellMm), { what: 'foliage' });
  assert.ok(fol.strokes.length > 5);
});
