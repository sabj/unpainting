import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unusedPlanKeys } from './plan-keys.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('keys nothing reads are reported at every level, notes are not', () => {
  const plan = {
    subject: 'x', rationale: 'why', sheet: { widthMm: 152.4, seed: 0, targetGuard: 'strict', dpi: 300 },
    families: [{ id: 'a', bounds: [0, 0, 1, 1], referenceCue: 'fur', looseness: 1 }, { id: 'b', looseness: 2 }],
    reserves: [{ bounds: [0, 0, .1, .1], reason: 'glint', id: 'r1' }],
    styleSelection: { style: 'ink-and-wash', reason: 'pen', regions: { a: { style: 'atmospheric-wet', reason: 'sky', mood: 1 } } },
    drawing: { source: 'source-ink', authored: [], ink: { color: 'black' }, stages: { prep: { amount: .3, frames: [1, 2, 3] }, finishInk: { hatch: { budget: 9, angle: 4 } } } },
    order: { subjects: [{ id: 'cat', families: ['a'], reason: 'first' }], strength: .5 },
  };
  assert.deepEqual(unusedPlanKeys(plan, { pipeline: true }), ['sheet.dpi', 'families[].looseness', 'reserves[].id', 'styleSelection.regions.a.mood',
    'drawing.authored', 'drawing.stages.finishInk.hatch.angle']);
});

test('washes and order count as unused without the combined recipe that reads them', () => {
  const plan = { subject: 'x', washes: { paints: ['hansa'] }, order: { strength: .5 }, subjectOrder: [{ id: 'rest' }] };
  assert.deepEqual(unusedPlanKeys(plan, { pipeline: false }), ['washes', 'order']);
  assert.deepEqual(unusedPlanKeys(plan, { pipeline: true }), []);
});

test('the Mittens colour5 deep-accent keys the painter never read are caught', () => {
  const washes = { colour: 'layered', paints: ['sienna', 'hansa', 'paynes'], darkGain: 2, deepAccent: { max: 120, relative: 30, minCells: 6 } };
  assert.deepEqual(unusedPlanKeys({ subject: 'mittens', washes }, { pipeline: true }), ['washes.deepAccent.relative', 'washes.deepAccent.minCells']);
});

test('every drawing key drawingFlags reads counts as read, including linework', async () => {
  const { drawingFlags } = await import('./drawing-plan.mjs');
  const drawing = { medium: 'ink', inkColor: 'black', ink: { waterproof: true }, linework: 'auto', source: 'source-ink', amount: 0.5,
    lines: 'contours', maxLines: 40, weight: 0.5, closingLines: 0.5, resolution: 1, map: 'lines.png', mapSmoothing: 1 };
  assert(drawingFlags(drawing).includes('--linework'));
  assert.deepEqual(unusedPlanKeys({ subject: 'x', drawing }, { pipeline: true }), []);
  assert.deepEqual(unusedPlanKeys({ subject: 'x', drawing: { linework: 'auto' } }, { pipeline: false }), []);
});

test('the bundled value plans use only keys the painter reads', () => {
  const dir = path.join(root, 'examples/plans');
  const plans = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))])
    .filter(([, p]) => !p.commands && !p.parts); // stroke plans (tools/run-plan.mjs) and the subject-regions spec are other formats
  assert(plans.some(([f]) => f === 'trumbull-values.json'));
  for (const [f, p] of plans) assert.deepEqual(unusedPlanKeys(p, { pipeline: true }), [], f);
  const bench = JSON.parse(fs.readFileSync(path.join(root, 'bench/v4v5/example/plan/config.json'), 'utf8'));
  assert.deepEqual(unusedPlanKeys(bench, { pipeline: false }), [], 'bench/v4v5/example/plan/config.json (--recipe none)');
});

test('the painter exits 3 on a plan key it never reads, unless --allowunusedplan 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-keys-'));
  try {
    const plan = path.join(dir, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify({ subject: 'x', families: [{ id: 'a', bounds: [0, 0, 1, 1], looseness: 1 }] }));
    const run = (out, extra = []) => spawnSync(process.execPath, ['tools/paint-plate.mjs', '--image', 'examples/targets/trumbull.jpg', '--width', '48',
      // segmentation is not under test: off keeps the run free of the SAM python and checkpoint (src/crop/segment-prep.mjs)
      '--mode', 'fast', '--video', '0', '--gpu', 'off', '--segments', 'off', '--valueplan', plan, '--valuepreviewonly', '1', '--allowdirty', '1', '--out', path.join(dir, out), ...extra],
    { cwd: root, encoding: 'utf8', timeout: 120000 });
    const strict = run('strict');
    assert.equal(strict.status, 3, strict.stderr);
    assert.match(strict.stdout, /UNUSED PLAN KEYS .*families\[\]\.looseness/);
    assert.equal(fs.readFileSync(path.join(dir, 'strict', 'unused-plan-keys.txt'), 'utf8'), 'families[].looseness\n');
    const allowed = run('allowed', ['--allowunusedplan', '1']);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /UNUSED PLAN KEYS/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
