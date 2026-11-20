import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStrokes, orderStats, pullDirection, turningPerMm, joinContinuations, findObjects, structureWeight, growthWeight } from './stroke-order.mjs';

const seg = (x0, y0, x1, y1, n = 10) => Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
const box = (x0, y0, x1, y1) => [seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0)];
const zig = (x, y, n, a = 0.4) => Array.from({ length: n }, (_, k) => [x + k * 0.5, y + (k % 2 ? a : -a)]);

test('turning: a straight line does not turn, a zigzag turns a lot, a big arc a little', () => {
  assert.equal(turningPerMm(seg(0, 0, 50, 0)), 0);
  assert.ok(turningPerMm(zig(0, 0, 20)) > 60);
  const arc = Array.from({ length: 61 }, (_, k) => [50 * Math.cos(Math.PI * k / 60), -50 * Math.sin(Math.PI * k / 60)]);
  assert.ok(Math.abs(turningPerMm(arc) - 180 / (50 * Math.PI)) < 0.2);
});

test('pull direction: downward for steep strokes, left to right otherwise', () => {
  assert.deepEqual(pullDirection(seg(0, 10, 0, 0))[0], [0, 0]);
  assert.equal(pullDirection(seg(10, 0, 0, 1))[0][0], 0);
});

test('a line that runs on through a junction is one stroke; a corner is not joined', () => {
  const r = joinContinuations([seg(0, 0, 10, 0), seg(20, 0, 10.3, 0), seg(10, 0, 10, 10)]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.find(s => s.parts.length === 2).parts.sort(), [0, 1]);
});

test('objects: a window face inside a wall face is its child', () => {
  const S = [...box(10, 10, 90, 60), ...box(30, 20, 45, 40)];
  const { objects } = findObjects(S, 100, 70, { closeMm: 0.75 });
  // the sheet itself (closed by its edge), the wall in it, the window in the wall; areas less the lines' thickness
  assert.equal(objects.length, 3);
  const [sheet, wall, win] = [...objects].sort((a, b) => b.area - a.area);
  assert.ok(Math.abs(wall.area - 80 * 50) < 0.1 * 4000 && Math.abs(win.area - 15 * 20) < 0.25 * 300);
  assert.equal(sheet.parent, null); assert.equal(wall.parent, sheet.id); assert.equal(win.parent, wall.id);
});

test('order: the whole structure first from the main mass, then object by object, then fine detail, texture and small things last', () => {
  // a wall with two windows (one with a bar), a scribble against the wall's edge, a far small mark
  const S = [...box(10, 10, 90, 60), ...box(20, 20, 35, 40), seg(27.5, 20, 27.5, 40), ...box(60, 20, 75, 40), zig(10.5, 50, 12), seg(96, 66, 97, 66.5)];
  const r = orderStrokes(S, 100, 70), st = orderStats(r, 100, 70);
  assert.equal(r.reduce((n, x) => n + x.parts.length, 0), S.length, 'every stroke once');
  const at = i => r.findIndex(x => x.parts.includes(i));
  // pass 1 sketches the whole composition (every long line: the wall's and the windows' outlines), from the wall's
  // longest line; the bar (a division) and the rest come after; passes never go back
  assert.ok([0, 2].includes(r[0].parts[0]), 'the main mass\'s longest line first');
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8]) assert.equal(r[at(k)].pass, 1);
  assert.ok(r.every((x, k) => !k || x.pass >= r[k - 1].pass));
  assert.deepEqual([r.at(-1).parts[0], r.at(-1).role], [14, 'small'], 'the small isolated mark last');
  assert.deepEqual([r.at(-2).parts[0], r.at(-2).role, r.at(-2).pass], [13, 'texture', 3], 'texture in the last pass');
  assert.ok(r.find(x => x.parts.includes(8)).role === 'inner', 'the bar divides the window: one object, the bar inside it');
  assert.ok(st.innerBeforeOutline <= 1, 'only a long division (pass 1) may come before its frame is closed');
  for (const x of r) { const a = x.points[0], b = x.points.at(-1); assert.ok(Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) ? b[1] >= a[1] : b[0] >= a[0]); }
});

test('hatching: parallel strokes side by side are one run, laid together, pulled one way, across the run', () => {
  const H = Array.from({ length: 6 }, (_, k) => (k % 2 ? seg(50 + k, 30, 46 + k, 34) : seg(46 + k, 34, 50 + k, 30)));
  const S = [...box(10, 10, 90, 60), ...H, seg(20, 50, 22, 50.3)];
  const r = orderStrokes(S, 100, 70), hs = r.filter(x => x.role === 'hatch');
  assert.equal(hs.length, 6);
  const at = r.findIndex(x => x.role === 'hatch');
  assert.ok(r.slice(at, at + 6).every(x => x.role === 'hatch'), 'one run, no other stroke between');
  const dirs = hs.map(x => Math.sign(x.points.at(-1)[1] - x.points[0][1]));
  assert.ok(dirs.every(d => d === dirs[0]), 'all pulled one way');
  const xs = r.slice(at, at + 6).map(x => x.points[0][0]);
  assert.ok(xs.every((x, k) => !k || x > xs[k - 1]) || xs.every((x, k) => !k || x < xs[k - 1]), 'swept across');
});

test('ink amount: inside a painted mass none lays nothing, forms only the long strokes along its edge, full everything', () => {
  const mass = (x, y) => x >= 50 && x <= 90 && y >= 10 && y <= 60;
  const S = [seg(50.2, 15, 50.2, 55), seg(60, 20, 62, 22), seg(65, 30, 80, 30), seg(10, 30, 40, 30)];
  const n = ink => orderStrokes(S, 100, 70, { ink, masses: mass }).flatMap(x => x.parts).sort();
  assert.deepEqual(n('full'), [0, 1, 2, 3]);
  assert.deepEqual(n('forms'), [0, 3]);
  assert.deepEqual(n('none'), [3]);
});

test('structure weight: the big structure firm and wide, fine detail light, the foreground heavier', () => {
  const at = (pass, role, y) => structureWeight({ pass, role, points: [[0, y], [10, y]] }, 100);
  assert.ok(at(1, 'inner', 50).weight > at(2, 'outline', 50).weight && at(2, 'outline', 50).weight > at(2, 'inner', 50).weight && at(2, 'inner', 50).weight > at(3, 'texture', 50).weight);
  assert.ok(at(1, 'inner', 50).widthScale > at(3, 'fine', 50).widthScale);
  assert.ok(at(2, 'inner', 90).weight > at(2, 'inner', 10).weight);
});

test('below full: diagonal hatching is left to the paint; joints across flat wall are thinned, kept by openings', () => {
  const diag = Array.from({ length: 5 }, (_, k) => seg(60 + 2 * k, 10, 64 + 2 * k, 14));
  const joints = Array.from({ length: 9 }, (_, k) => seg(10 + 4 * k, 30, 13 + 4 * k, 30));
  const S = [...box(20, 40, 30, 55), ...diag, ...joints, seg(22, 52, 25, 52)];
  // the joints here stand in a row; bridged they would be one course line, so the thinning is tested without bridging
  const kept = ink => new Set(orderStrokes(S, 100, 70, { ink, bridgeMm: 0 }).flatMap(x => x.parts));
  const full = kept('full'), forms = kept('forms');
  assert.ok([4, 5, 6, 7, 8].every(i => full.has(i)) && [4, 5, 6, 7, 8].every(i => !forms.has(i)), 'diagonal runs dropped');
  const j = [9, 10, 11, 12, 13, 14, 15, 16, 17].filter(i => forms.has(i)).length;
  assert.ok(j >= 2 && j <= 4, `about one joint in three across the wall, kept ${j}`);
  assert.ok(forms.has(18), 'a joint by an opening stays');
});

test('growth order: a few light lay-in lines, outlines before their divisions, detail after growth, emphasis last and heaviest', () => {
  const S = [...box(10, 10, 90, 60), ...box(20, 20, 35, 40), seg(27.5, 20, 27.5, 40), ...box(60, 20, 75, 40), seg(62, 30, 64, 30), zig(40, 50, 12)];
  const r = orderStrokes(S, 100, 70, { mode: 'growth', layIn: 3, emphasisShare: 0.1 });
  const ph = r.map(x => x.phase), order = ['layin', 'growth', 'detail', 'texture', 'emphasis'];
  assert.ok(ph.every((p, k) => !k || order.indexOf(p) >= order.indexOf(ph[k - 1])), 'phases in order');
  assert.equal(ph.filter(p => p === 'layin').length, 3);
  assert.ok(ph.at(-1) === 'emphasis');
  assert.ok(growthWeight({ phase: 'layin' }).weight < growthWeight({ phase: 'growth' }).weight && growthWeight({ phase: 'growth' }).weight < growthWeight({ phase: 'emphasis' }).weight);
  const g = r.filter(x => x.phase === 'growth'), bar = g.findIndex(x => x.parts.includes(8));
  for (const k of [4, 5, 6, 7]) { const i = g.findIndex(x => x.parts.includes(k)); if (i >= 0 && g[i].role === 'outline') assert.ok(i < bar); }
});

test('hatching: none drops runs, sparse keeps every second line of a run by a form edge, drawn keeps all', () => {
  const run = Array.from({ length: 6 }, (_, k) => seg(30.5 + 2 * k, 13.5, 30.5 + 2 * k, 19));
  const S = [...box(10, 10, 90, 60), ...run];
  const n = hatching => orderStrokes(S, 100, 70, { hatching }).filter(x => x.role === 'hatch').length;
  assert.deepEqual([n('none'), n('sparse'), n('drawn')], [0, 3, 6]);
});

test('stroke budget: only the most important strokes, containers and outlines first', () => {
  const S = [...box(10, 10, 90, 60), ...box(20, 20, 35, 40), seg(27.5, 20, 27.5, 40), zig(40, 50, 12), seg(60, 30, 62, 30)];
  const r = orderStrokes(S, 100, 70, { mode: 'growth', budget: 4, layIn: 0, emphasisShare: 0 });
  assert.deepEqual(r.flatMap(x => x.parts).sort((a, b) => a - b), [0, 1, 2, 3]);
});

test('growth weight builds: lay-in faint, structure at an ordinary visible weight when drawn (main lines firmer), accents heavy', () => {
  const at = (phase, width, major = false) => width * growthWeight({ phase, major }, 1, { width, mid: 1 }).widthScale;
  assert.ok(Math.abs(at('growth', 2.5) - at('growth', 0.3)) < 1e-9, 'structure at one ordinary width whatever the drawing');
  assert.ok(at('growth', 1, true) > at('growth', 1) && at('growth', 1) >= 1, 'main lines a little firmer, none hairline');
  assert.ok(at('layin', 1) < at('detail', 1) && at('detail', 2) <= 1 && at('texture', 0.5) === 0.5);
  assert.ok(at('emphasis', 2.5) > 2.5 && at('emphasis', 1) > at('growth', 1, true));
  const w = (phase, major) => growthWeight({ phase, major }, 0.5, { width: 1, mid: 1 }).weight;
  assert.ok(w('layin') < w('growth') && w('growth') < w('growth', true) && w('growth', true) <= w('emphasis'));
});

test('growth: loose ticks wait for the texture phase; a dashed line is one stroke', () => {
  const S = [...box(10, 10, 90, 60), seg(20, 30, 23, 30), seg(40, 45, 41, 48), seg(50, 52, 60, 52), seg(62, 52, 75, 52.2)];
  const r = orderStrokes(S, 100, 70, { mode: 'growth', layIn: 2, emphasisShare: 0 });
  for (const k of [4, 5]) assert.equal(r.find(x => x.parts.includes(k)).phase, 'texture');
  assert.ok(r.find(x => x.parts.includes(6)).parts.includes(7), 'the dashes are bridged');
  assert.equal(r.bridges, 1);
});
