// A touch too small for a wet bed (tiny-touch.mjs), from the two paintings it stopped (the fixture's `about` says what
// each case is under the lanes as they are laid now).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isTinyTouch, touchAreaMm2, predictedTouchMm2, tinyTouchRecord, tinyTouchLine, TOUCH_LEAST_MM2 } from './tiny-touch.mjs';
import { planScriptWashes } from './script-washes.mjs';
import { preparePassageBed } from '../techniques/passage-plan.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./tiny-touch.fixture.json', import.meta.url), 'utf8'));
const CELL = 0.26;
const quiet = f => { const log = console.log, lines = []; console.log = (...a) => lines.push(a.join(' ')); try { return { got: f(), lines }; } finally { console.log = log; } };
function plan(script, options = {}) {
  const pigments = script.palette.map(key => ({ ...boxPigment(BOX.find(p => p.key === key)), key }));
  const w = fixture.cells, h = Math.round(w * script.sheet.heightMm / script.sheet.widthMm);
  return quiet(() => planScriptWashes({ script, k: pigments.length, w, h, pigments, sheetWidthMm: script.sheet.widthMm, ...options }));
}

test('a few cells are a tiny touch; the least area is a setting in mm2; touching nothing is not one', () => {
  assert.ok(Math.abs(touchAreaMm2(6, CELL) - 0.4056) < 1e-9);
  assert.equal(isTinyTouch(6, CELL), true, 'the L2 failure: 6 cells, 0.41 mm2');
  assert.equal(isTinyTouch(7, CELL), true, 'the afternoon failure: 7 cells');
  assert.equal(isTinyTouch(18, CELL), false, '18 cells are 1.22 mm2: over the 1.2 mm2 default');
  assert.equal(isTinyTouch(18, CELL, 2), true); assert.equal(isTinyTouch(6, CELL, 0.3), false);
  assert.equal(isTinyTouch(0, CELL), false, 'a stroke on no paintable cell has its own record (empty footprint)');
  assert.equal(isTinyTouch(6, CELL, 0), false, 'a least area of 0 turns the rule off');
  assert.throws(() => isTinyTouch(6, 0), /millimetres a cell/); assert.throws(() => isTinyTouch(6, CELL, -1), /0 or more/);
  assert.ok(TOUCH_LEAST_MM2 > Math.PI * 0.6 ** 2 && TOUCH_LEAST_MM2 < 1.5, 'about the tip of a 1.2 mm rigger');
});

test('why the bed could not be made: four moist cells of six are under seven tenths, whatever is tried', () => {
  // the failing run's own numbers: every prewet left 4 of the 6 cells moist
  const paper = { cells: 6, waterMax: 0.118, waterP50: 0.042, moistShare: 4 / 6 };
  let wets = 0;
  assert.throws(() => preparePassageBed({ observe: () => paper, wet: () => { wets++; }, pickup: () => {}, maxActions: 16 }), /Technique preparation failed without a pixel correction/);
  assert.equal(wets, 16);
});

test('a stroke much shorter than its brush is wide touches only the tip; a stroke that lays the brush down is not tried', () => {
  const dab = len => ({ radiusMm: 6.5, points: [[100, 100, 0.37], [100 + len / 3, 100, 0.58], [100 + 2 * len / 3, 100, 0.63], [100 + len, 100, 0.37]] });
  assert.ok(predictedTouchMm2(dab(0.6), CELL) < 0.6, `a 13 mm round drawn 0.6 mm: ${predictedTouchMm2(dab(0.6), CELL)} mm2`);
  assert.ok(predictedTouchMm2(dab(3), CELL) > 3, `drawn 3 mm it lays down: ${predictedTouchMm2(dab(3), CELL)} mm2`);
  assert.ok(predictedTouchMm2(dab(0.6), CELL) < predictedTouchMm2(dab(1.5), CELL));
  assert.equal(predictedTouchMm2(dab(20), CELL), Infinity, 'longer than the brush is wide: not a touch');
  assert.equal(predictedTouchMm2({ radiusMm: 6.5, points: [[1, 1, 1]] }, CELL), Infinity);
});

for (const c of fixture.cases) {
  const id = c.script.passages[0].id;
  test(`${c.name}: the stroke that stopped the painting is told by the plan and given no wet bed`, () => {
    const { got, lines } = plan(c.script);
    const tiny = got.summary.tinyTouches ?? [];
    assert.ok(tiny.length >= 1, 'the plan lists its tiny touches');
    // the stroke too small for a wet bed that this passage has under the lanes as they are laid now (the fixture's
    // `stroke`; the strokes of the paintings that stopped are no longer made, see the fixture's `about`)
    const [sx, sy] = c.stroke.atMm;
    const hit = tiny.find(t => Math.hypot(t.atMm[0] - sx, t.atMm[1] - sy) < 2);
    assert.ok(hit, `the tiny stroke at ${sx}, ${sy} mm is among ${JSON.stringify(tiny.map(t => t.atMm))}`);
    assert.equal(hit.passage, id); assert.ok(hit.mm2 < TOUCH_LEAST_MM2 && hit.lengthMm < 1.5 && hit.brushMm >= 13, JSON.stringify(hit));
    assert.ok(lines.some(l => l.startsWith(`PAINTING SCRIPT, TINY TOUCH: passage ${id} `)), 'said in the log, in capitals');
    // no stroke left in a passage laid into its own wet bed is a tiny touch: they went with the small strokes, laid dry
    const wet = got.instructions.filter(q => q.move === 'wet on wet'), dry = got.instructions.filter(q => q.script.passage === `${id}-small`);
    assert.ok(wet.length >= 1 && dry.length === 1 && dry[0].move === 'wet on dry');
    for (const q of wet) for (const st of q.strokes) assert.ok(!(predictedTouchMm2(st, CELL) < TOUCH_LEAST_MM2), 'a tiny touch was left to be given a wet bed');
    assert.equal(dry[0].strokes.length, tiny.length); assert.deepEqual(got.summary.smallStrokesLaidDry, [{ passage: id, kind: 'wash', strokes: tiny.length }]);
    // nothing is dropped: every stroke placed is laid, in the bed or as a touch
    const all = plan(c.script, { touchLeastMm2: 0 }).got;
    assert.equal(all.summary.tinyTouches, undefined, 'with the least area at 0 the plan is as it was: no tiny touches, no key');
    assert.equal(all.instructions.reduce((a, q) => a + q.strokes.length, 0), got.instructions.reduce((a, q) => a + q.strokes.length, 0));
  });
}

test('the passage that stopped the L2 painting is now laid along each part\'s own length: no stroke too small for a wet bed, and none dropped', () => {
  // (flank3: four small slanting parts swept across at -29 degrees left a lane stub of 6 cells, which no wet bed could be
  // made for; each part is now a stroke or two along itself, script-marks.mjs sweeps)
  const c = fixture.alongItsLength, { got } = plan(c.script);
  assert.match(c.failed.error, /6 cells in its footprint/);
  assert.equal(got.summary.tinyTouches, undefined); assert.deepEqual(got.summary.smallStrokesLaidDry ?? [], []);
  assert.ok(got.instructions.length === 1 && got.instructions[0].move === 'wet on wet' && got.instructions[0].strokes.length >= 4);
  for (const st of got.instructions[0].strokes) assert.ok(!(predictedTouchMm2(st, CELL) < TOUCH_LEAST_MM2), 'a tiny touch among its strokes');
  // every part is still painted: a stroke starts in or beside each of the passage's four regions
  for (const R of c.script.passages[0].regions) { const cx = R.reduce((a, q) => a + q[0], 0) / R.length, cy = R.reduce((a, q) => a + q[1], 0) / R.length; assert.ok(got.instructions[0].strokes.some(st => st.points.some(q => Math.hypot(q[0] - cx, q[1] - cy) < 12)), `the part about ${cx.toFixed(0)}, ${cy.toFixed(0)} mm is laid`); }
});

test('a script with no tiny touch plans exactly as before: the same instructions, and no new key in its summary', () => {
  const script = { ...fixture.cases[0].script, passages: [{ id: 'wall', what: 'a broad wash', stage: 1, kind: 'wash', region: [[40, 40], [160, 40], [160, 120], [40, 120]], paint: { pigments: { ochre: 1 }, dilution: 'pale' }, brush: 'round20', paper: 'wet', handling: { direction: 0 } }] };
  const now = plan(script).got, off = plan(script, { touchLeastMm2: 0 }).got;
  assert.equal(now.summary.tinyTouches, undefined);
  assert.equal(JSON.stringify(now.instructions), JSON.stringify(off.instructions)); assert.equal(JSON.stringify(now.summary), JSON.stringify(off.summary));
});

test('the record names the passage, the cells and the mm2, and the log line says how it was laid', () => {
  const intent = { id: 'light/s2/m22/flank3', script: { passage: 'flank3' } };
  const points = [{ x: 896.9, y: 878.2, r: 25, p: 0.37 }, { x: 898.3, y: 879.4, r: 25, p: 0.37 }];
  const t = tinyTouchRecord({ intent, cells: 6, cellMm: CELL, points });
  assert.equal(t.passage, 'flank3'); assert.equal(t.cells, 6); assert.equal(t.mm2, 0.41); assert.equal(t.brushMm, 13); assert.equal(t.leastMm2, TOUCH_LEAST_MM2);
  assert.ok(Math.abs(t.atMm[0] - 233.4) < 0.2 && Math.abs(t.atMm[1] - 228.5) < 0.2, String(t.atMm));
  assert.match(tinyTouchLine(t), /^TINY TOUCH: passage flank3: a stroke 0\.48 mm long with a 13 mm brush touches 6 cells \(0\.41 mm2, under 1\.2 mm2\).*no wet bed$/);
});
