// A wash's lanes as the script asks (path, pressure list, named mark) and laid with the form (wash-form.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handOf, sweeps } from './script-marks.mjs';
import { laneFill } from './sweep-fill.mjs';
import { passageStrokes } from './script-washes.mjs';
import { midline, formAxis, cellsBend } from './wash-form.mjs';
import { organicOutline } from './wash-edge.mjs';

const field = [[10, 10], [150, 10], [150, 100], [10, 100]];
// an arch: 80 mm across its outer edge, its band about 10 mm thick
const arch = (() => { const P = []; for (let k = 0; k <= 40; k++) { const a = Math.PI * (0.15 + 0.7 * k / 40); P.push([100 + 80 * Math.cos(a), 110 - 80 * Math.sin(a)]); } for (let k = 40; k >= 0; k--) { const a = Math.PI * (0.15 + 0.7 * k / 40); P.push([100 + 70 * Math.cos(a), 112 - 70 * Math.sin(a)]); } return P; })();
// a lane's heading (degrees, -90..90) over its first and last thirds
const heading = (a, b) => { const d = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; return ((d + 270) % 180) - 90; };
const pathLen = P => P.slice(1).reduce((s, q, k) => s + Math.hypot(q[0] - P[k][0], q[1] - P[k][1]), 0);
// the strokes' lanes: a stroke is cut where it turns back on itself along x
const lanesOf = strokes => strokes.flatMap(st => { const out = []; let cur = [st.points[0]], way = 0; for (let k = 1; k < st.points.length; k++) { const w = Math.sign(st.points[k][0] - st.points[k - 1][0]); if (way && w && w !== way) { out.push(cur); cur = [st.points[k - 1]]; way = 0; } else if (w) way = w; cur.push(st.points[k]); } out.push(cur); return out; }).filter(l => l.length >= 6 && pathLen(l) > 30);
// how far a lane's middle stands off the line between its ends (signed, mm)
const sag = l => { const a = l[0], b = l.at(-1), m = l[l.length >> 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); return ((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])) / len; };

test('a path bends every lane of a wash the same way, so they nest; straight leaves the lanes as they were', () => {
  const straight = lanesOf(sweeps([field], { widthMm: 10, deg: 0, rng: handOf('a'), hand: 0 }));
  const curved = lanesOf(sweeps([field], { widthMm: 10, deg: 0, path: 'curved', rng: handOf('a'), hand: 0 }));
  // every lane bends, all to the same side of the sheet (a lane's sag is signed by the way it is drawn)
  const sags = curved.filter(l => pathLen(l) > 100).map(l => Math.sign(l.at(-1)[0] - l[0][0]) * sag(l));
  assert.ok(sags.length >= 6 && sags.filter(s => Math.abs(s) > 6).length >= 0.8 * sags.length, `each lane bends: ${sags.map(s => s.toFixed(1)).join(' ')} mm`);
  assert.equal(new Set(sags.map(Math.sign)).size, 1, 'the same way');
  const median = v => [...v].sort((a, b) => a - b)[v.length >> 1];
  assert.ok(median(straight.filter(l => pathLen(l) > 100).map(l => Math.abs(sag(l)))) < 0.5 && median(sags.map(Math.abs)) > 8);
  // an s-curve turns each lane one way then the other
  const s = lanesOf(sweeps([field], { widthMm: 10, deg: 0, path: 's-curve', rng: handOf('a'), hand: 0 })).filter(l => pathLen(l) > 100)[2];
  const q1 = s[Math.round(s.length / 4)], q3 = s[Math.round(3 * s.length / 4)], mid = (s[0][1] + s.at(-1)[1]) / 2;
  assert.ok((q1[1] - mid) * (q3[1] - mid) < 0 && Math.abs(q1[1] - q3[1]) > 8, `s-curve: ${q1[1].toFixed(1)} then ${q3[1].toFixed(1)} about ${mid.toFixed(1)}`);
  // the bent lanes still lap: the wash covers its field
  const W = sweeps([field], { widthMm: 10, deg: 0, path: 'curved', rng: handOf('a') }), cov = coverage(W, field);
  assert.ok(cov > 0.97, `covered ${cov.toFixed(3)}`);
});

test('a pressure list varies each lane\'s width along it; without one the lanes keep one pressure', () => {
  const st = sweeps([field], { widthMm: 10, deg: 0, pressure: [0.3, 1, 0.3], rng: handOf('b'), hand: 0 });
  const l = lanesOf(st).filter(q => pathLen(q) > 100);
  for (const q of l) {
    const mid = q[q.length >> 1][2], ends = Math.max(q[Math.round(q.length * 0.15)][2], q[Math.round(q.length * 0.85)][2]);
    assert.ok(mid > ends + 0.15, `a lane presses in its middle (${mid}) more than near its ends (${ends})`);
  }
  // never so light that the lanes part: lapped where they are lightest
  assert.ok(coverage(st, field) > 0.97);
  const flat = lanesOf(sweeps([field], { widthMm: 10, deg: 0, pressure: 0.8, rng: handOf('b'), hand: 0 })).filter(q => pathLen(q) > 100);
  for (const q of flat) { const inner = q.slice(Math.round(q.length * 0.25), Math.round(q.length * 0.75)).map(p => p[2]); assert.ok(Math.max(...inner) - Math.min(...inner) < 0.1); }
});

test('with the form, the lanes follow a curving region\'s own axis; a level wash crosses it', () => {
  const ends = l => { const n = l.length, a = l.slice(0, Math.round(n / 3)), b = l.slice(Math.round(2 * n / 3)); return [heading(a[0], a.at(-1)), heading(b[0], b.at(-1))]; };
  const form = sweeps([arch], { widthMm: 5, deg: 'form', rng: handOf('c') });
  // the longest lanes turn with the arch: up its left side, down its right
  const long = lanesOf(form).sort((p, q) => pathLen(q) - pathLen(p)).slice(0, 3);
  for (const l of long) { const [h0, h1] = ends(l); assert.ok(Math.abs(h0 - h1) > 50, `a lane turns ${h0.toFixed(0)} to ${h1.toFixed(0)} degrees`); }
  assert.ok(pathLen(long[0]) > 120, `the lanes run along the arch: ${pathLen(long[0]).toFixed(0)} mm`);
  // a level wash's lanes are short and level across the arch's sides
  const level = lanesOf(sweeps([arch], { widthMm: 5, deg: 0, rng: handOf('c') }));
  assert.ok(Math.max(...level.map(pathLen)) < Math.max(...lanesOf(form).map(pathLen)) * 0.8);
  assert.ok(coverage(form, arch) > 0.9, `covered ${coverage(form, arch).toFixed(3)}`);
  // the middle line of the arch rises and falls; of a rectangle it is flat
  const m = midline(arch, formAxis(arch), 5), u = [m.u0, (m.u0 + m.u1) / 2, m.u1];
  assert.ok(Math.abs(m.o(u[1]) - m.o(u[0])) > 20, 'the arch\'s middle line bends');
  const f = midline(field, formAxis(field), 5); assert.ok(Math.abs(f.o(f.u0) - f.o((f.u0 + f.u1) / 2)) < 0.01);
  // where the shape narrows the lanes narrow: an arch tapering to points
  const horn = []; for (let k = 0; k <= 30; k++) { const t = k / 30, a = Math.PI * (0.15 + 0.7 * t); horn.push([100 + 80 * Math.cos(a), 110 - 80 * Math.sin(a)]); }
  for (let k = 30; k >= 0; k--) { const t = k / 30, a = Math.PI * (0.15 + 0.7 * t), w = 2 + 14 * Math.sin(Math.PI * t); horn.push([100 + (80 - w) * Math.cos(a), 110 - (80 - w) * Math.sin(a)]); }
  const pts = sweeps([horn], { widthMm: 10, deg: 'form', rng: handOf('d') }).flatMap(s => s.points);
  const near = (x0, x1) => { const q = pts.filter(p => p[0] > x0 && p[0] < x1); return q.reduce((s, p) => s + p[2], 0) / q.length; };
  assert.ok(near(85, 115) > near(25, 40) + 0.1, `pressed wider in the thick middle (${near(85, 115).toFixed(2)}) than toward a point (${near(25, 40).toFixed(2)})`);
});

test('a named mark is each lane\'s character: its own stroke, the mark\'s rise and fall and speed', () => {
  const p = { id: 'w', kind: 'wash', region: field, paint: { pigments: { ochre: 1 } }, handling: { mark: 'taper', direction: 0 } };
  const st = passageStrokes(p, { b: { widthMm: 10 } }, 0);
  assert.ok(st.length >= 6 && st.every(s => s.mark === 'taper' && s.points.every(q => Number.isFinite(q[3]))));
  for (const s of st) { const P = s.points, top = Math.max(...P.map(q => q[2])); assert.ok(P[0][2] < 0.3 * top && P.at(-1)[2] < 0.3 * top, 'a taper lands and lifts on the point'); }
  // a flat's mark is laid with its blade
  const flat = passageStrokes({ ...p, handling: { mark: 'sweep', direction: 0 } }, { b: { widthMm: 10 } }, 0);
  assert.ok(flat.every(s => s.flat === true && s.angle === 90));
  // written pressures win over the mark, as for strokes
  const own = passageStrokes({ ...p, handling: { mark: 'taper', direction: 0, pressure: [0.6, 0.9, 0.6] } }, { b: { widthMm: 10 } }, 0);
  assert.ok(own.every(s => !s.mark));
});

test('a plain numeric direction lays the lanes it always did (over the wash\'s organic edge, wash-edge.mjs); none or "form" lays them with the form', () => {
  const p = { id: 'w', kind: 'wash', region: arch, paint: { pigments: { ochre: 1 } }, handling: { direction: 0 } };
  const level = passageStrokes(p, { b: { widthMm: 5 } }, 0), again = sweeps([organicOutline(arch, { seed: '0/w/0', wetness: 'plain' })], { widthMm: 5, deg: 0, pressure: 0.7, rng: handOf('0/w'), hand: 1 });
  assert.deepEqual(level, again);
  const none = passageStrokes({ ...p, handling: {} }, { b: { widthMm: 5 } }, 0), form = passageStrokes({ ...p, handling: { direction: 'form' } }, { b: { widthMm: 5 } }, 0);
  assert.deepEqual(none, form);
  assert.notDeepEqual(none, level);
});

test('Auto lays a curving part along its middle line, a straight one as before', () => {
  const r = laneFill([{ points: arch }], { kitMm: [3, 5, 8], spine: false });
  assert.ok(r.uncovered < 0.03, `uncovered ${r.uncovered.toFixed(3)}`);
  // the headings the lanes are laid at, by length: along the arch they range widely; straight lanes would keep one
  const spreadOf = strokes => { const segs = strokes.flatMap(s => s.points.slice(1).map((q, k) => ({ h: heading(s.points[k], q), w: Math.hypot(q[0] - s.points[k][0], q[1] - s.points[k][1]) }))).sort((a, b) => a.h - b.h), W = segs.reduce((t, q) => t + q.w, 0); let acc = 0; const at = f => { acc = 0; for (const q of segs) { acc += q.w; if (acc >= f * W) return q.h; } return segs.at(-1).h; }; return at(0.9) - at(0.1); };
  assert.ok(spreadOf(r.strokes) > 60, `the lanes turn with the arch: headings over ${spreadOf(r.strokes).toFixed(0)} degrees`);
  // a rectangle's middle line is straight: no bend, its lanes level
  const cells = []; for (let x = 10.25; x < 150; x += 0.5) for (let y = 10.25; y < 100; y += 0.5) cells.push([x, y]);
  assert.equal(cellsBend(cells, 1, 0, 0, 1, 0.5, 30).bent, false);
});

/** The share of a polygon's area (sampled every mm) that the strokes' discs cover. */
function coverage(strokes, P) {
  const inside = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const discs = []; for (const s of strokes) for (let k = 0; k < s.points.length; k++) { const a = s.points[k], b = s.points[k + 1] ?? a, n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5)); for (let j = 0; j < n; j++) { const t = j / n; discs.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, s.radiusMm * (0.25 + 0.75 * (a[2] + (b[2] - a[2]) * t))]); } }
  let n = 0, c = 0; const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) if (inside(x, y)) { n++; if (discs.some(([dx, dy, r]) => (dx - x) ** 2 + (dy - y) ** 2 <= r * r)) c++; }
  return c / n;
}
