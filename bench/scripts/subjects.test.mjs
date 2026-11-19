// The V4 and V5 subjects are painted at source scale: no subject is wider in cells than its target is in pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V2, readJson } from './lib.mjs';
import { loadSubjects } from './pipeline/round45.mjs';
import { benchmarkProfile, profileSubject } from './profiles.mjs';
import { resolvePlan, pngSize, optionMap } from './pipeline/plan-args.mjs';
import { checkSourceScale } from '../../tools/plate/source-scale.mjs';

const CROPS = readJson(path.join(V2, 'crops.json'));
const SUBJECTS = loadSubjects();
const TARGETS = fs.readdirSync(path.join(V2, 'targets')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();

test('every subject is its crop at one cell a pixel: the crop\'s own width on a sheet of that width at 0.259 mm a cell', () => {
  assert.equal(CROPS.mmPerCell, 0.259);
  assert.deepEqual(Object.keys(SUBJECTS).sort(), CROPS.crops.map(c => c.task).sort());
  for (const crop of CROPS.crops) {
    const s = SUBJECTS[crop.task];
    assert.equal(s.width, crop.width, `${crop.task}: painted ${s.width} cells wide from a ${crop.width} px crop`);
    assert.equal(s.sheetmm, +(crop.width * CROPS.mmPerCell).toFixed(3), `${crop.task}: sheet width`);
    assert.ok(Math.abs(s.sheetmm / s.width - CROPS.mmPerCell) < 1e-6, `${crop.task}: ${s.sheetmm / s.width} mm a cell`);
  }
});

test('the painter accepts every target in bench/v2/targets at its subject\'s width, in both profiles, and refuses it enlarged', () => {
  assert.ok(TARGETS.length >= 7 && ['h34a', 'h36a'].every(t => TARGETS.includes(t)), 'the 300 px Yale crops are among the targets');
  for (const task of TARGETS) {
    const [sourceWidth, sourceHeight] = pngSize(path.join(V2, 'targets', `${task}.png`));
    assert.equal(sourceWidth, CROPS.crops.find(c => c.task === task).width, `${task}: crops.json states the file's width`);
    for (const name of ['lite', 'full']) {
      const spec = profileSubject(SUBJECTS[task], benchmarkProfile(name));
      const r = checkSourceScale({ image: `${task}.png`, sourceWidth, sourceHeight, width: spec.width });
      assert.equal(r.sourceScale, 1, `${task} in ${name}: ${r.sourceScale} cells a pixel`);
    }
    // the widths the subjects had until 0.3.3 stop the painter
    assert.throws(() => checkSourceScale({ image: `${task}.png`, sourceWidth, sourceHeight, width: 1200 }), /does not paint from an enlarged source/);
  }
});

test('the harness hands the painter the subject\'s own width and sheet, and no setting that accepts enlargement', () => {
  for (const task of TARGETS) {
    const target = path.join(V2, 'targets', `${task}.png`);
    const o = optionMap(resolvePlan({ spec: SUBJECTS[task], planDir: '/missing-plan', variant: 'region_w13', target, out: '/out' }).args);
    assert.equal(Number(o.get('width')), pngSize(target)[0], task);
    assert.equal(o.get('scale'), '1', task);
    assert.equal(Number(o.get('sheetmm')), SUBJECTS[task].sheetmm, task);
    assert.ok(!o.has('sourcescale'), task);
  }
});
