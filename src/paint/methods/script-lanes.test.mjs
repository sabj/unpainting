// A wash's lanes as a hand lays them (script-marks.mjs sweeps, LANE_HAND).
import test from 'node:test';
import assert from 'node:assert/strict';
import { handOf, sweeps, LANE_HAND } from './script-marks.mjs';
import { planScriptWashes } from './script-washes.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const field = [[10, 10], [150, 10], [150, 100], [10, 100]];
// the lanes of the strokes (a stroke is two to four lanes laid back and forth): a lane is a run of points going one way
// along the lanes (`along`: 0 for level lanes, 1 for upright ones); the short step across to the next lane ends it
const lanesOf = (strokes, along = 0) => strokes.flatMap(st => {
  const out = []; let cur = [st.points[0]], way = 0;
  for (let k = 1; k < st.points.length; k++) { const d = st.points[k][along] - st.points[k - 1][along], w = Math.abs(d) > 1 ? Math.sign(d) : 0, step = Math.abs(st.points[k][1 - along] - st.points[k - 1][1 - along]); if (w === 0 || step > 1.5 || (way && w !== way)) { out.push(cur); cur = []; way = 0; } else way = w; cur.push(st.points[k]); }
  out.push(cur); return out;
}).filter(l => l.length >= 3 && Math.hypot(l.at(-1)[0] - l[0][0], l.at(-1)[1] - l[0][1]) > 30);
const heading = l => { const d = Math.atan2(l.at(-1)[1] - l[0][1], l.at(-1)[0] - l[0][0]) * 180 / Math.PI; return ((d + 270) % 180) - 90; };
// how far a lane's middle stands off the straight line between its ends (mm)
const bulge = l => { const a = l[0], b = l.at(-1), m = l[l.length >> 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); return Math.abs((b[0] - a[0]) * (m[1] - a[1]) - (b[1] - a[1]) * (m[0] - a[0])) / len; };
const spread = v => Math.max(...v) - Math.min(...v);

test('with no hand the lanes are a ruler\'s: straight, parallel, at one lap', () => {
  const l = lanesOf(sweeps([field], { widthMm: 10, deg: 0, rng: handOf('a'), hand: 0 }));
  assert.ok(l.length >= 8, `${l.length} lanes`);
  assert.ok(spread(l.map(heading)) < 0.01 && Math.max(...l.map(bulge)) < 0.01);
  const ys = l.map(q => q[1][1]).sort((a, b) => a - b), gaps = ys.slice(1).map((y, k) => y - ys[k]).slice(0, -1);
  assert.ok(spread(gaps) < 0.05, `the lap is even: ${gaps.map(g => g.toFixed(2)).join(' ')}`);
});

test('a hand\'s lanes turn across the wash, bow, and lap unevenly, and always lap', () => {
  const W = 10, pressure = 0.8, laid = W * (0.25 + 0.75 * pressure), turns = [], bows = [];
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const l = lanesOf(sweeps([field], { widthMm: W, deg: 0, pressure, rng: handOf(seed) }));
    turns.push(spread(l.map(heading))); bows.push(Math.max(...l.map(bulge)));
    // each lane overlaps the one before by at least a quarter of the width the brush lays (never bars with paper between)
    const ys = l.map(q => q[q.length >> 1][1]).sort((a, b) => a - b), gaps = ys.slice(1).map((y, k) => y - ys[k]);
    assert.ok(Math.max(...gaps) <= laid * (1 - LANE_HAND.lap[0]) + 0.5 * W * 0.25, `seed ${seed}: widest step ${Math.max(...gaps).toFixed(1)} mm of ${laid} laid`);
    assert.ok(spread(gaps.slice(0, -1)) > 0.5, `seed ${seed}: the lap varies (${gaps.map(g => g.toFixed(1)).join(' ')})`);
  }
  assert.ok(Math.max(...turns) > 5 && turns.filter(t => t > 3).length >= 4, `the lanes turn: ${turns.map(t => t.toFixed(1)).join(' ')} degrees`);
  assert.ok(Math.max(...bows) > 3 && bows.every(b => b > 0.4), `the lanes bow: ${bows.map(b => b.toFixed(1)).join(' ')} mm`);
});

test('two seeds are two hands: the same wash is laid visibly differently; the same seed lays it the same', () => {
  const lay = seed => sweeps([field], { widthMm: 10, deg: 0, rng: handOf(seed) });
  assert.deepEqual(lay('0/p1'), lay('0/p1'));
  const a = lanesOf(lay('0/p1')), b = lanesOf(lay('1/p1'));
  // the lanes of one seed lie millimetres from the other's: mean distance between lane middles, lane for lane
  const n = Math.min(a.length, b.length); let off = 0; for (let k = 0; k < n; k++) off += Math.hypot(a[k][a[k].length >> 1][0] - b[k][b[k].length >> 1][0], a[k][a[k].length >> 1][1] - b[k][b[k].length >> 1][1]) / n;
  assert.ok(off > 2 || a.length !== b.length, `lane middles ${off.toFixed(1)} mm apart`);
  assert.ok(Math.abs(heading(a[0]) - heading(a.at(-1)) - (heading(b[0]) - heading(b.at(-1)))) > 1, 'they turn differently');
});

test('a part too short for lanes across it is laid along its own length: a band of shadow is strokes along the band, not a row of dashes', () => {
  // a band 60 mm long and 7 mm thick, slanting; the passage's direction is straight down, across it
  const band = [[20, 20], [80, 40], [78, 47], [18, 27]];
  const s = sweeps([band], { widthMm: 5, deg: 90, rng: handOf('a') });
  const long = s.map(st => st.points.slice(1).map((p, k) => Math.hypot(p[0] - st.points[k][0], p[1] - st.points[k][1])).reduce((x, y) => x + y, 0));
  assert.ok(s.length <= 3 && Math.max(...long) > 45, `${s.length} strokes, the longest ${Math.max(...long).toFixed(0)} mm`);
  // a ruler keeps the passage's direction only where the lanes are long enough: the same band at hand 0 is still laid along itself
  assert.ok(sweeps([band], { widthMm: 5, deg: 90, rng: handOf('a'), hand: 0 }).length <= 3);
  // upright lanes are laid from the left to the right, whatever the seed
  for (const seed of ['a', 'b', 'c', 'd']) { const up = sweeps([[[10, 10], [120, 10], [120, 100], [10, 100]]], { widthMm: 8, deg: 90, rng: handOf(seed) }); assert.ok(up[0].points[0][0] < 40 && up.at(-1).points[0][0] > 90, `seed ${seed}: from ${up[0].points[0][0]} to ${up.at(-1).points[0][0]}`); }
  // a region long enough along the direction keeps it
  const tall = lanesOf(sweeps([[[10, 10], [40, 10], [40, 100], [10, 100]]], { widthMm: 5, deg: 90, rng: handOf('a'), hand: 0 }), 1);
  assert.ok(tall.length >= 4 && tall.every(l => Math.abs(Math.abs(heading(l)) - 90) < 1));
});

test('the load: full after a dip, thinner until the next, about the mix on average; the seed and the amount reach a script\'s washes', () => {
  const s = sweeps([field], { widthMm: 6, deg: 0, rng: handOf('a') }), c = s.map(st => st.charge);
  assert.ok(Math.abs(c.reduce((a, v) => a + v, 0) / c.length - 1) < 0.08, `mean charge ${(c.reduce((a, v) => a + v, 0) / c.length).toFixed(3)}`);
  assert.ok(Math.max(...c) > 1.05 && Math.min(...c) < 0.95);
  const keys = ['ochre', 'ultramarine'], pigments = keys.map(key => ({ ...boxPigment(BOX.find(p => p.key === key)), key }));
  const script = { format: 'painting-script 2', subject: 't', author: 'test', sheet: { widthMm: 160, heightMm: 110 }, palette: keys, brushes: { mop: { shape: 'round', widthMm: 12 } },
    passages: [{ id: 'p1', what: 'sky', stage: 1, kind: 'wash', region: field, paint: { pigments: { ultramarine: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } }] };
  const plan = (seed, hand) => { const log = console.log; console.log = () => {}; try { return planScriptWashes({ script, k: 2, w: 320, h: 220, pigments, sheetWidthMm: 160, seed, hand }).instructions[0].strokes; } finally { console.log = log; } };
  { const log = console.log; console.log = () => {}; try { const ins = planScriptWashes({ script, k: 2, w: 320, h: 220, pigments, sheetWidthMm: 160 }).instructions[0]; assert.ok([0.5, 0.6].includes(ins.laneLap), `the plan carries the wash's lap: ${ins.laneLap}`); } finally { console.log = log; } }
  assert.deepEqual(plan(0, 1), plan(0, 1));
  assert.notDeepEqual(plan(0, 1), plan(1, 1));
  assert.ok(spread(lanesOf(plan(0, 0)).map(heading)) < 0.01 && spread(lanesOf(plan(0, 1)).map(heading)) > 0.5);
});

test('a wash\'s lanes state how far they lap, in tenths of the brush, and the plan and the technique carry it to the swatch', async () => {
  const W = 10, s = sweeps([field], { widthMm: W, deg: 0, pressure: 0.7, rng: handOf('a') });
  // laid 7.75 mm wide at this pressure and lapped by 30 to 55% of that: the lanes are about 4.5 mm apart, 0.55 of the brush lapped
  assert.ok(s.every(st => st.lap === s[0].lap) && [0.5, 0.6].includes(s[0].lap), `${s[0].lap}`);
  assert.equal(sweeps([field], { widthMm: W, deg: 0, pressure: 0.7, rng: handOf('a'), hand: 0 })[0].lap, 0.6);
  // one lane has no lap to state
  assert.equal(sweeps([[[10, 10], [80, 10], [80, 14], [10, 14]]], { widthMm: W, deg: 0, rng: handOf('a') })[0].lap, undefined);
  const { valueTechnique } = await import('./value-shared.mjs'), { instrumentKey } = await import('./instrument-cal.mjs');
  const T = valueTechnique({ move: 'wet on wet', load: { water: 0.88 }, laneLap: 0.6 }), plain = valueTechnique({ move: 'wet on wet', load: { water: 0.88 } });
  assert.equal(T.lap, 0.6); assert.equal(plain.lap, undefined);
  assert.match(instrumentKey(T), /\|lap 0\.60$/); assert.doesNotMatch(instrumentKey(plain), /lap/);
  assert.notEqual(instrumentKey(T), instrumentKey({ ...T, lap: 0.5 }));
});
