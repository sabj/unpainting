import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, scorePython, verifyComparisonRun, verifyTearsheetContract } from './preflight.mjs';
import { parseRerenderArgs, discoverStoredPlans, runRerender, rerenderGate } from './rerender.mjs';
import { resolvePlan, pngSize } from './pipeline/plan-args.mjs';

test('scorer interpreter prefers CLI, then environment, then PATH', () => {
  assert.equal(scorePython('cli', {BENCH_SCORE_PYTHON: 'env'}), 'cli');
  assert.equal(scorePython(null, {BENCH_SCORE_PYTHON: 'env'}), 'env');
  assert.equal(scorePython(null, {}), 'python3');
});
test('preflight rejects missing environments and failed dependencies before launch', () => {
  const calls = [], options = {root: '.', state: {git: true, dirty: false}, env: {PAINTER_SEG_PYTHON: 'seg', PAINTER_SAM_CHECKPOINT: 'sam', BENCH_SCORE_PYTHON: 'score'}, exists: () => true,
    run: (exe, args) => { calls.push([exe, args]); return {status: 0}; }};
  preflight(options);
  assert.deepEqual(calls.map(c => c[0]), ['seg', 'score']);
  for (const patch of [{state: {git: true, dirty: true}}, {env: {}}, {exists: () => false}, {run: () => ({status: 1, stderr: 'missing module'})}]) assert.throws(() => preflight({...options, ...patch}));
});
test('verifyComparisonRun and verifyTearsheetContract reject CPU fallbacks, enlarged or unrecorded sources, non-SAM segments, duplicate playback stages, and incomplete model/stage sets', () => {
  // a plate at source scale: a 300 px target painted 300 cells wide
  const card = (dimensions = { sourceWidth: 300, sourceHeight: 263, paintWidth: 300, paintHeight: 263, enlargement: 1, sheetWidth: 300, sourceScale: 1, sourceScaleAllowed: 1 }) => JSON.stringify({ gpuBackend: { backend: 'gpu', fallback: false }, dimensions });
  const gpu = JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 300 });
  const files = {
    '/ok/run-card.json': card(),
    '/ok/paint-speed-summary.json': gpu,
    '/ok/segments.json': JSON.stringify({ backend: 'sam', status: 'ok' }),
    '/ok/stages/stage-010.jpg': 's10',
    '/ok/stages/stage-025.jpg': 's25',
    '/ok/stages/stage-050.jpg': 's50',
    '/ok/stages/stage-075.jpg': 's75',
    '/ok/stages/stage-100.jpg': 's100',
    '/cpu/run-card.json': card(),
    '/cpu/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'cpu', fallback: true }, width: 300 }),
    '/nowidth/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false } }),
    '/nosource/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/noseg/run-card.json': card(),
    '/noseg/segments.json': JSON.stringify({ mode: 'off' }),
    '/kmeans/run-card.json': card(),
    '/kmeans/segments.json': JSON.stringify({ backend: 'kmeans' }),
    '/missingseg/paint-speed-summary.json': gpu,
    '/missingseg/run-card.json': JSON.stringify({ dimensions: JSON.parse(card()).dimensions }),
    '/dupstage/run-card.json': card(),
    '/dupstage/stages/stage-010.jpg': 's10',
    '/dupstage/stages/stage-025.jpg': 's25',
    '/dupstage/stages/stage-050.jpg': 's50',
    '/dupstage/stages/stage-075.jpg': 's50',
    '/dupstage/stages/stage-100.jpg': 's100',
    // the old benchmark width: a 300 px target painted 1200 cells wide, as a card of the time recorded it
    '/enlarged/run-card.json': card({ sourceWidth: 300, paintWidth: 1200, enlargement: 4 }),
    // a run that stated --sourcescale 2 and painted twice its source
    '/twice/run-card.json': card({ sourceWidth: 300, paintWidth: 600, enlargement: 2, sheetWidth: 600, sourceScale: 2, sourceScaleAllowed: 2 }),
    // pens on a fine sheet (--inkres 4): the output is four times the sheet, which is at source scale
    '/inkres/run-card.json': card({ sourceWidth: 300, paintWidth: 1200, enlargement: 4, sheetWidth: 300, sourceScale: 1, sourceScaleAllowed: 1 }),
    // painted smaller than its source
    '/small/run-card.json': card({ sourceWidth: 1600, paintWidth: 1200, enlargement: 0.75, sheetWidth: 1200, sourceScale: 0.75, sourceScaleAllowed: 1 }),
  };
  const io = { exists: p => p in files, readFile: p => files[p], readBytes: p => Buffer.from(files[p]) };
  const ok = verifyComparisonRun('/ok', { ...io, requireSegments: true, requireStages: true, width: 300 });
  assert.deepEqual([ok.ok, ok.width, ok.sourceWidth, ok.sourceScale], [true, 300, 300, 1]);
  assert.throws(() => verifyComparisonRun('/cpu', io), /GPU hardware is required/);
  // source scale: both widths recorded, the sheet no wider than the source, and exactly the subject's width when one is given
  assert.throws(() => verifyComparisonRun('/enlarged', io), /painted 1200 cells wide from a 300 px source, 4 cells for each source pixel \(at most 1\); the render width never exceeds the source width/);
  assert.throws(() => verifyComparisonRun('/nowidth', io), /records no render width/);
  assert.throws(() => verifyComparisonRun('/nosource', io), /records no source width/);
  assert.throws(() => verifyComparisonRun('/twice', io), /2 cells for each source pixel \(at most 1\)/);
  assert.equal(verifyComparisonRun('/twice', { ...io, maxSourceScale: 2 }).sourceScale, 2);
  assert.equal(verifyComparisonRun('/inkres', io).width, 300, 'the pens\' fine sheet widens the output, not the sheet');
  assert.equal(verifyComparisonRun('/small', io).sourceScale, 0.75);
  assert.throws(() => verifyComparisonRun('/small', { ...io, width: 1600 }), /painted 1200 cells wide, not the 1600 its subject specifies/);
  assert.throws(() => verifyComparisonRun('/ok', { ...io, width: 1200 }), /painted 300 cells wide, not the 1200 its subject specifies/);
  assert.throws(() => verifyComparisonRun('/noseg', { ...io, requireSegments: true }), /--segments off/);
  assert.throws(() => verifyComparisonRun('/kmeans', { ...io, requireSegments: true }), /--segments kmeans/);
  assert.throws(() => verifyComparisonRun('/missingseg', { ...io, requireSegments: true }), /missing segmentation evidence/);
  assert.throws(() => verifyComparisonRun('/dupstage', { ...io, requireStages: true }), /duplicate consecutive playback stages/);
  assert.throws(() => verifyComparisonRun('/cpu', { ...io, requireGpu: false, requireStages: true }), /missing progressive stage images/);
  assert.equal(verifyTearsheetContract({ models: ['argon', 'astra', 'opus'], stages: ['10%', '25%', '50%', '75%', '100%'] }).ok, true);
  assert.throws(() => verifyTearsheetContract({ models: ['opus'], stages: ['100%'] }), /missing required model families/);
  assert.throws(() => verifyTearsheetContract({ models: ['argon', 'astra', 'opus'], stages: ['100%'] }), /progressive stages required/);
});
test('rerender discovers all 60 stored V4 plans with gzipped line files and enforces --gpu on and comparison gates', async () => {
  assert.throws(() => parseRerenderArgs(['--gpu', 'off']), /rerender requires --gpu on/);
  const jobs = discoverStoredPlans();
  assert.equal(jobs.length, 60);
  for (const job of jobs) {
    const plan = resolvePlan({ spec: job.spec, planDir: job.planDir, variant: job.variant, target: job.target, out: '/tmp/out', compile: true, gpu: 'on' });
    const strictLooks = resolvePlan({ spec: { ...job.spec, noTargetLooks: true }, planDir: job.planDir, variant: job.variant, target: job.target, out: '/tmp/out', compile: true, gpu: 'on' });
    const noLookIndex = strictLooks.args.lastIndexOf('--notargetlooks');
    assert.deepEqual(strictLooks.args.slice(noLookIndex, noLookIndex + 2), ['--notargetlooks', '1']);
    const missingLineErr = plan.problems.find(p => p.includes('is missing or not valid JSON'));
    assert.equal(missingLineErr, undefined, `${job.model}/${job.tryNum}/${job.subject}: ${missingLineErr}`);
  }
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'rerender-test-'));
  try {
    const res = await runRerender(
      ['--models', 'opus', '--tries', '3', '--subjects', 'hills', '--out', tmpOut, '--compile'],
      {
        run: (exe, args) => {
          const outIdx = args.indexOf('--out');
          if (outIdx >= 0) {
            const jobOut = args[outIdx + 1];
            fs.mkdirSync(jobOut, { recursive: true });
            fs.writeFileSync(path.join(jobOut, 'value-plan.json'), '{}');
          }
          return { status: 0, stdout: 'ok', stderr: '' };
        },
      }
    );
    assert.equal(res.ok, true);
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0].painted, true);
    assert.equal(res.results[0].ok, true);
    await assert.rejects(
      () => runRerender(['--models', 'opus', '--tries', '3', '--subjects', 'hills', '--out', tmpOut], { doctor: () => ({ ok: false, failures: ['SAM checkpoint missing'] }) }),
      /doctor --strict failed before rerender/
    );
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});
test('the comparison gate has no size floor: it admits every target in bench/v2/targets at its subject width and refuses each one enlarged', () => {
  const subjects = JSON.parse(fs.readFileSync(new URL('../v4v5/subjects.json', import.meta.url), 'utf8')).subjects;
  const dir = new URL('../v2/targets/', import.meta.url);
  const targets = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  assert.ok(targets.includes('h34a.png') && targets.includes('h36a.png'), 'the 300 px Yale crops are among the targets');
  for (const file of targets) {
    const id = file.slice(0, -4), spec = subjects[id], [sourceWidth, sourceHeight] = pngSize(new URL(file, dir));
    assert.ok(spec, `${id} has a subject`);
    const run = paintWidth => { const card = JSON.stringify({ gpuBackend: { backend: 'gpu', fallback: false }, dimensions: { sourceWidth, sourceHeight, paintWidth, sheetWidth: paintWidth } }); return { exists: p => p === '/r/run-card.json', readFile: () => card }; };
    assert.equal(verifyComparisonRun('/r', { ...run(spec.width), ...rerenderGate(spec) }).sourceScale, 1, `${id}: ${sourceWidth} px painted ${spec.width} wide`);
    assert.throws(() => verifyComparisonRun('/r', { ...run(4 * sourceWidth), ...rerenderGate({ width: 4 * sourceWidth }) }), /the render width never exceeds the source width/, `${id} at four times its width`);
  }
  // a smaller source is no reason to refuse: a thumbnail painted at its own width passes, and fails only when enlarged
  const tiny = w => { const card = JSON.stringify({ gpuBackend: { backend: 'gpu' }, dimensions: { sourceWidth: 120, paintWidth: w, sheetWidth: w } }); return { exists: p => p === '/t/run-card.json', readFile: () => card }; };
  assert.equal(verifyComparisonRun('/t', tiny(120)).ok, true);
  assert.throws(() => verifyComparisonRun('/t', tiny(300)), /2\.5 cells for each source pixel/);
});
