import test from 'node:test';
import assert from 'node:assert/strict';
import { planScriptWashes, checkScript, passageStrokes, footprint, hexRgb, upgradeScript } from './script-washes.mjs';
import { handOf, inside, placesIn, sweeps, scattered, chordAt, lines, pressureAt, handled } from './script-marks.mjs';
import { cropScript, clipPolygon } from '../../../tools/painter/script-crop.mjs';
import { resolveScript } from '../../../tools/painter/script-resolve.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const keys = ['ochre', 'ultramarine', 'sapgreen', 'umber'];
const pigments = keys.map(key => ({ ...boxPigment(BOX.find(p => p.key === key)), key }));
const brushes = { mop: { shape: 'round', widthMm: 12 }, r8: { shape: 'round', widthMm: 6 }, rig: { shape: 'round', widthMm: 1 } };
const square = [[10, 10], [60, 10], [60, 50], [10, 50]];
const script = (passages, more = {}) => ({ format: 'painting-script 2', subject: 't', author: 'test', sheet: { widthMm: 80, heightMm: 60 }, palette: keys, brushes, passages, ...more });
const wall = { id: 'p1', what: 'wall', stage: 1, kind: 'wash', region: square, paint: { pigments: { ochre: 1 }, dilution: 'pale' }, brush: 'mop', paper: 'dry', handling: { direction: 0 } };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const plan = s => quiet(() => planScriptWashes({ script: s, k: pigments.length, w: 160, h: 120, pigments, sheetWidthMm: 80 }));

test('a script is checked: marks, moves, brushes and paints must be ones the painter has', () => {
  assert.throws(() => checkScript(script([{ ...wall, kind: 'stamp' }]), { keys, sheetWidthMm: 80 }), /kind stamp/);
  assert.throws(() => checkScript(script([{ ...wall, paint: { pigments: { cadred: 1 } } }]), { keys, sheetWidthMm: 80 }), /cadred is not in the painter's box/);
  assert.throws(() => checkScript(script([{ ...wall, brush: 'x' }]), { keys, sheetWidthMm: 80 }), /brush x/);
  assert.throws(() => checkScript(script([wall]), { keys, sheetWidthMm: 100 }), /sheet 80 mm wide/);
  assert.equal(checkScript(script([wall]), { keys, sheetWidthMm: 80 }).length, 1);
});

test('a sweep lays lanes over the whole region top down, whole strokes that run a little past its edge, and is the same for the same seed', () => {
  const s = sweeps([square], { widthMm: 12, deg: 0, rng: handOf('a') });
  assert.ok(s.length >= 2 && s.length <= 6, `${s.length} loads`);
  const ys = s.map(st => st.points[0][1]); assert.ok(ys[0] < ys.at(-1), 'top lane first');
  const pts = s.flatMap(st => st.points);
  assert.ok(pts.some(p => p[0] < 10 || p[0] > 60), 'a lane may overrun the region: it is not clipped');
  assert.ok(Math.min(...pts.map(p => p[1])) < 16 && Math.max(...pts.map(p => p[1])) > 44, 'lanes span the region');
  assert.deepEqual(sweeps([square], { widthMm: 12, deg: 0, rng: handOf('a') }), s);
  // a light inside the region is worked round: no lane point lands deep inside it
  const light = [[30, 25], [40, 25], [40, 35], [30, 35]], sl = sweeps([square], { widthMm: 4, deg: 0, lights: [light], rng: handOf('a') });
  assert.ok(!sl.flatMap(st => st.points).some(([x, y]) => x > 32 && x < 38 && y > 27 && y < 33));
});

test('touches: about the asked count, inside the region and out of its lights, never on a grid; pressure and direction as handled', () => {
  const rng = handOf('b'), light = [[10, 10], [30, 10], [30, 30], [10, 30]], places = placesIn([square], 20, rng, { lights: [light] });
  assert.ok(Math.abs(places.length - 20) <= 2, `${places.length}`);
  assert.ok(places.every(([x, y]) => inside([square], x, y) && !inside([light], x, y)));
  const low = placesIn([square], 60, handOf('e'), { denser: 'bottom' }); assert.ok(low.filter(([, y]) => y > 30).length > low.filter(([, y]) => y < 30).length, 'denser at the bottom');
  assert.deepEqual(chordAt([square], 20, 30, 0), [-10, 40]);
  const t = scattered([square], { widthMm: 6, deg: 90, n: 10, lengthMm: 100, pressure: [0.1, 1, 0.1], rng: handOf('c') });
  for (const st of t) { const ys = st.points.map(p => p[1]); assert.ok(Math.max(...ys) - Math.min(...ys) <= 40 * 1.3, 'a long streak is shortened to the region'); }
  const p = t[0].points.map(q => q[2]); assert.ok(p[0] < Math.max(...p) && p.at(-1) < Math.max(...p), 'pressed in the middle, light at the ends');
  assert.ok(Math.abs(pressureAt([0, 1], 0.5) - 0.5) < 1e-9);
  const flick = handled(0, 0, { deg: 0, len: 20, r: 1, path: 'flick', rng: handOf('f') }), ys = flick.points.map(q => q[1]);
  assert.ok(Math.abs(ys.at(-1) - ys[0]) > 1, 'a flick turns at its end');
  assert.equal(lines([[[0, 0], [10, 0]], [[5, 5]]], { widthMm: 1, rng: handOf('d') }).length, 1);
});

test('the plan: one wash a passage, its charges in its wet session, a passage into the one before it joins that session', () => {
  const p = plan(script([
    { ...wall, charges: [{ pigments: { umber: 1 }, dilution: 'medium', at: [[30, 30]], brush: 'r8' }] },
    { id: 'p2', what: 'tree', stage: 2, kind: 'touches', region: [[40, 20], [70, 20], [70, 55], [40, 55]], paint: { pigments: { sapgreen: 1 }, swatch: '#a0b070' }, brush: 'r8', paper: 'wet', into: 'p1', count: 12, handling: { pressure: [0.2, 1, 0.1] } },
    { id: 'p3', what: 'shadow', stage: 3, kind: 'strokes', region: square, paint: { pigments: { ultramarine: 2, umber: 1 }, dilution: 'pale' }, brush: 'r8', paper: 'dry', count: 8, handling: { direction: 55, lengthMm: 20 } },
    { id: 'p4', what: 'branch', stage: 5, kind: 'lines', paths: [[[50, 50], [55, 30]]], paint: { pigments: { umber: 1 }, dilution: 'strong' }, brush: 'rig', paper: 'dry' },
    { id: 'p5', what: 'two strokes written out', stage: 5, kind: 'strokes', brush: 'r8', paint: { pigments: { umber: 1 }, dilution: 'strong' }, strokes: [{ points: [[5, 5, 0.2], [10, 8, 0.9], [15, 6, 0.1]] }, { from: [20, 20], direction: 45, lengthMm: 10, pressure: [0.3, 1, 0.2], path: 'curved' }] },
  ]));
  assert.equal(p.layers.length, 4);
  assert.deepEqual(p.layers[0]._script, ['p1', 'p2']);
  assert.equal(p.layers[3].shapes[0]._valuePlan.strokes.length, 2);
  const [w1, c1, t1] = p.layers[0].shapes.map(s => s._valuePlan);
  assert.equal(w1.move, 'wet on dry'); assert.equal(c1.move, 'wet on wet'); assert.equal(t1.move, 'wet on wet');
  assert.equal(p.layers[1].shapes[0]._valuePlan.phase, 'shadow');
  assert.equal(plan(script([{ ...wall, edges: 'lost' }])).layers[0].shapes[0]._valuePlan.move, 'wet on wet', 'a lost edge is laid into a damp bed');
  assert.equal(p.summary.charges, 1);
  // the strength follows the dilution: a strong mix carries more paint than a pale one
  assert.ok(p.mixes.at(-1).strength > p.mixes[0].strength);
  // every wash has strokes and a footprint, and nothing is clipped (the strokes are the plan's own)
  for (const l of p.layers) for (const s of l.shapes) { assert.ok(s._valuePlan.strokes.length > 0); assert.ok(s.area > 0); }
});

test('a passage says how far the sheet dries before it: dry (a new sitting), damp or none (straight on, one session)', () => {
  const p = plan(script([wall, { ...wall, id: 'p2', paper: undefined, wait: 'damp' }, { ...wall, id: 'p3', wait: 'none' }, { ...wall, id: 'p4' }]));
  assert.deepEqual(p.layers.map(l => l._script), [['p1', 'p2', 'p3'], ['p4']]);
  assert.equal(p.layers[0].shapes[1]._valuePlan.move, 'beside damp');
});

test('a passage into one that is not just before it is laid on its own', () => {
  const p = plan(script([wall, { ...wall, id: 'p2' }, { ...wall, id: 'p3', paper: 'damp', into: 'p1' }]));
  assert.equal(p.layers.length, 3);
});

test('a script cut to a window keeps what falls inside, moved to the window, with its touches scaled', () => {
  assert.deepEqual(clipPolygon(square, 0, 0, 30, 30).length, 4);
  const s = cropScript(script([wall, { ...wall, id: 'p2', kind: 'touches', brush: 'r8', count: 20 }, { ...wall, id: 'far', region: [[70, 52], [79, 52], [79, 59], [70, 59]] }]), 35, 10, 40, 40);
  assert.deepEqual(s.passages.map(p => p.id), ['p1', 'p2']);
  assert.equal(s.sheet.widthMm, 40);
  assert.equal(s.passages[1].count, 10);
  assert.ok(s.passages[0].regions[0].every(([x, y]) => x >= 0 && x <= 40 && y >= 0 && y <= 40));
});

test('helpers: a swatch colour, and the footprint of a stroke', () => {
  assert.deepEqual(hexRgb('#ff8000'), [255, 128, 0]);
  assert.equal(hexRgb('nope'), null);
  const m = footprint([{ radiusMm: 2, points: [[10, 10, 1], [20, 10, 1]] }], 60, 40, 0.5);
  assert.ok(m[20 * 60 + 30] === 1 && m[0] === 0);
  assert.ok(passageStrokes({ ...wall, id: 'z' }, brushes).length > 0);
  // a wash with no brush named gets one sized to it: about a third of its width
  assert.equal(passageStrokes({ ...wall, id: 'y', brush: undefined }, brushes)[0].radiusMm, 6);
  const old = upgradeScript({ format: 'painting-script 1', passages: [{ id: 'a', mark: 'dab', move: 'wet into wet', strokes: 4, pressure: 'firm' }] });
  assert.equal(old.passages[0].kind, 'touches'); assert.equal(old.passages[0].paper, 'wet'); assert.equal(old.passages[0].count, 4);
});

test('shapes of a study named by number become the passage\'s regions, its reserves and a stroke along a shape', () => {
  const shapes = { study: 's', shapes: [{ id: 1, outline: square, centre: [35, 30], axisDeg: 90, lengthMm: 40 }, { id: 2, outline: [[30, 25], [40, 25], [40, 35], [30, 35]], centre: [35, 30], axisDeg: 0, lengthMm: 10 }] };
  const r = resolveScript(script([{ ...wall, region: undefined, shapes: [1], reserve: [2] }, { id: 's', stage: 3, kind: 'strokes', brush: 'r8', paint: { pigments: { umber: 1 } }, strokes: [{ along: 1, pressure: [0.2, 1, 0.1] }] }], { lights: [{ what: 'w', shapes: [2] }] }), shapes);
  assert.deepEqual(r.passages[0].regions, [square]); assert.equal(r.passages[0].reserveRegions.length, 1); assert.equal(r.lights[0].region.length, 4);
  assert.deepEqual(r.passages[1].strokes[0].from, [35, 10]); assert.equal(r.passages[1].strokes[0].direction, 90);
  assert.throws(() => resolveScript(script([{ ...wall, shapes: [9] }]), shapes), /shape 9/);
  assert.throws(() => resolveScript(script([{ ...wall, paint: { pigments: { rose: 1 } } }]), shapes), /rose, which is not in the script's palette/);
  // a passage's own reserve is worked round by its lanes
  const st = passageStrokes({ ...r.passages[0], brush: 'r8' }, brushes).flatMap(q => q.points);
  assert.ok(!st.some(([x, y]) => x > 32 && x < 38 && y > 27 && y < 33));
});

test('a named mark sets the handling the script leaves out', () => {
  const st = passageStrokes({ id: 'm', kind: 'touches', brush: 'r8', region: square, count: 6, handling: { mark: 'leaf' } }, brushes);
  assert.equal(st.length, 6); assert.ok(st.every(q => q.points[0][2] < 0.3 && Math.max(...q.points.map(v => v[2])) > 0.8));
  assert.equal(plan(script([{ ...wall, handling: { mark: 'drag' } }])).layers[0].shapes[0]._valuePlan.move, 'dry on dry');
});


test('a stroke off the sheet is reported with its passage; a wet stroke too small for a bed is laid on dry paper, never dropped', () => {
  const lines = [], log = console.log; console.log = (...a) => lines.push(a.join(' '));
  let p;
  try {
    p = planScriptWashes({ script: script([
      { id: 'off', what: 'off the sheet', stage: 2, kind: 'strokes', brush: 'r8', paper: 'dry', paint: { pigments: { umber: 1 }, dilution: 'medium' }, strokes: [{ points: [[200, 200, 0.8], [210, 200, 0.8]] }, { points: [[20, 20, 0.8], [30, 20, 0.8]] }] },
      { id: 'wet', what: 'wet touches', stage: 2, kind: 'strokes', brush: 'rig', paper: 'wet', paint: { pigments: { umber: 1 }, dilution: 'medium' }, strokes: [{ brush: 'r8', points: [[20, 40, 0.2], [20.5, 40, 0.2]] }, { points: [[30, 40, 1], [70, 40, 1], [70, 42, 1], [30, 42, 1]] }] },
      { id: 'gone', what: 'wholly off', stage: 2, kind: 'strokes', brush: 'r8', paper: 'dry', paint: { pigments: { umber: 1 }, dilution: 'medium' }, strokes: [{ points: [[300, 200, 0.8], [310, 200, 0.8]] }] },
    ]), k: pigments.length, w: 160, h: 120, pigments, sheetWidthMm: 80 });
  } finally { console.log = log; }
  assert.ok(lines.some(l => /STROKE NOT LAID: passage off/.test(l)), 'the off-sheet stroke is reported');
  assert.ok(lines.some(l => /NOTHING LAID: passage gone/.test(l)), 'a passage with nothing to touch is reported');
  assert.ok(lines.some(l => /passage wet .*laid on the paper as it is/.test(l)), 'the small wet stroke is reported');
  assert.equal(p.summary.strokesNotLaid.length, 2);
  assert.deepEqual(p.summary.smallStrokesLaidDry, [{ passage: 'wet', kind: 'strokes', strokes: 1 }]);
  const small = p.instructions.find(q => q.script.passage === 'wet-small'), main = p.instructions.find(q => q.script.passage === 'wet');
  assert.equal(small.move, 'wet on dry'); assert.equal(small.strokes.length, 1);
  assert.equal(main.move, 'wet on wet'); assert.equal(main.strokes.length, 1);
  assert.ok(!p.instructions.some(q => q.script.passage === 'gone'));
});
