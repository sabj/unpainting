import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOOK_UNITS, LEAST_LOOK_COST, readLookAsk, regionBox, lookCost, costLine, scriptInRegion } from './look-cost.mjs';

const rows = [...Array(3).fill({ stage: 1 }), ...Array(5).fill({ stage: 3 }), ...Array(2).fill({ stage: 4 })];
test('a look costs rendering: 1 for the whole plan on the whole sheet, a stage\'s share of the washes when stopped, a region\'s share of the sheet', () => {
  assert.equal(DEFAULT_LOOK_UNITS, 5);
  assert.deepEqual(lookCost(rows), { cost: 1, washShare: 1, regionShare: null, washes: 10, of: 10, stages: [{ stage: 1, cost: 0.3 }, { stage: 3, cost: 0.8 }, { stage: 4, cost: 1 }] });
  assert.equal(lookCost(rows, { until: 1 }).cost, 0.3); assert.equal(lookCost(rows, { until: 2 }).cost, 0.3, 'a stage the plan has no washes in adds nothing'); assert.equal(lookCost(rows, { until: 3 }).cost, 0.8); assert.equal(lookCost(rows, { until: 9 }).cost, 1);
  assert.equal(lookCost(rows, { regionShare: 0.25 }).cost, 0.25); assert.equal(lookCost(rows, { until: 1, regionShare: 0.5 }).cost, 0.15);
  assert.equal(lookCost(rows, { regionShare: 0.001 }).cost, LEAST_LOOK_COST, 'no look is free: the sheet is set up and dried');
  assert.equal(lookCost([], {}).cost, 1);
  assert.equal(costLine(rows, 4.2), ' A look of this plan costs 1 of your 4.2 units left; stopped early it costs less (--until 1: 0.3, --until 3: 0.8); a look of a region of your own script costs the share of its passages that touch the region.');
});

test('what a look is asked of is read from its words; a region is a box in millimetres or a named form', () => {
  assert.deepEqual(readLookAsk([]), { until: null, region: null }); assert.deepEqual(readLookAsk(['--until', '3']), { until: 3, region: null });
  assert.deepEqual(readLookAsk(['--until', '2', '--region', '10,20,110,90']), { until: 2, region: [10, 20, 110, 90] }); assert.deepEqual(readLookAsk(['--region', 'cat', 'face']), { until: null, region: 'cat face' });
  assert.throws(() => readLookAsk(['--until', 'soon']), /--until: the number of a stage/); assert.throws(() => readLookAsk(['--fast']), /"--fast" is not understood/); assert.throws(() => readLookAsk(['--region']), /a box in millimetres/);
  const sheet = { widthMm: 200, heightMm: 100 }, forms = [{ name: 'cat face', boxMm: [50, 0, 150, 50] }];
  assert.deepEqual(regionBox([150, 80, 50, -20], { sheet }), { box: [50, 0, 150, 80], name: null, share: 0.4 }); assert.deepEqual(regionBox('cat face', { sheet, forms }), { box: [50, 0, 150, 50], name: 'cat face', share: 0.25 });
  assert.equal(regionBox(null, { sheet }), null); assert.throws(() => regionBox('dog', { sheet, forms }), /there is no form "dog" with a box \(the forms: cat face\)/); assert.throws(() => regionBox([300, 0, 400, 50], { sheet }), /off the sheet/);
});

test('a region look of a script paints the passages that touch the box, and what they are laid into', () => {
  const script = { palette: ['ochre'], passages: [{ id: 'sky', region: [[0, 0], [200, 0], [200, 40], [0, 40]] }, { id: 'face', region: [[60, 50], [100, 50], [100, 90], [60, 90]] }, { id: 'cheek', into: 'face', strokes: [{ points: [[70, 60], [80, 70]] }] }, { id: 'far', strokes: [{ points: [[180, 90], [190, 95]] }] }, { id: 'eye', into: 'ground', strokes: [{ at: [75, 65] }] }, { id: 'ground', region: [[0, 95], [50, 95], [50, 100]] }] };
  const got = scriptInRegion(script, [65, 55, 90, 80]);
  assert.deepEqual(got.script.passages.map(p => p.id), ['face', 'cheek', 'eye', 'ground'], 'in the script\'s own order; the wash a kept passage is dropped into is kept'); assert.deepEqual([got.kept, got.of], [4, 6]); assert.equal(script.passages.length, 6); assert.deepEqual(got.script.palette, ['ochre']);
});

test('rendering by the work done: brush sweeps and dryings, against one full automatic look; quoted from the plan, charged from the painter', async () => {
  const { planWork, paintedWork, workUnits, sweepsInLog, dryingsOf, workCostLine } = await import('./look-cost.mjs');
  const passes = [{ stage: 1, layer: 1, strokes: 40 }, { stage: 1, layer: 1, strokes: 20 }, { stage: 2, layer: 2, strokes: 30 }, { stage: 3, layer: 3, strokes: 7 }];
  assert.deepEqual(planWork(passes), { sweeps: 97, dryings: 3 }); assert.deepEqual(planWork(passes, { until: 1 }), { sweeps: 60, dryings: 1 }); assert.equal(dryingsOf([]), 0);
  assert.equal(workUnits(planWork(passes), 100), 1, 'the automatic plan against itself is exactly one unit'); assert.equal(workUnits(planWork(passes, { until: 1 }), 100), 0.61); assert.equal(workUnits({ sweeps: 0, dryings: 1 }, 100), LEAST_LOOK_COST);
  assert.equal(workUnits(planWork(passes), 100, 0.5), 0.5, 'a region quote is its share of the passages');
  assert.deepEqual(paintedWork({ sweeps: 55, passes, passesDone: 2 }), { sweeps: 55, dryings: 1 }); assert.deepEqual(paintedWork({ sweeps: 97, passes }), { sweeps: 97, dryings: 3 });
  assert.throws(() => paintedWork({ sweeps: null, passes }), /did not report how many brush sweeps/); assert.throws(() => workUnits({ sweeps: 1, dryings: 0 }, 0), /no rendering unit: prepare it again/);
  assert.equal(sweepsInLog('x\n952 brush sweeps, 144 frames, 1221 s\n'), 952); assert.equal(sweepsInLog('nothing'), null);
  assert.match(workCostLine(passes, { plan: 100 }, 4), /^ A look of this plan is quoted at 1 of your 4 units left; stopped early less \(--until 1: 0\.61, --until 2: 0\.92\)/);
});
