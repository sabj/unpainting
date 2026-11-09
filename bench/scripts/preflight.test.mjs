import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, scorePython, verifyComparisonRun, verifyTearsheetContract } from './preflight.mjs';
import { parseRerenderArgs, discoverStoredPlans, runRerender, rerenderGate } from './rerender.mjs';
import { resolvePlan } from './pipeline/plan-args.mjs';

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
test('verifyComparisonRun and verifyTearsheetContract reject CPU fallbacks, missing/300px widths, non-SAM segments, duplicate playback stages, and incomplete model/stage sets', () => {
  const files = {
    '/ok/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/ok/segments.json': JSON.stringify({ backend: 'sam', status: 'ok' }),
    '/ok/stages/stage-010.jpg': 's10',
    '/ok/stages/stage-025.jpg': 's25',
    '/ok/stages/stage-050.jpg': 's50',
    '/ok/stages/stage-075.jpg': 's75',
    '/ok/stages/stage-100.jpg': 's100',
    '/cpu/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'cpu', fallback: true }, width: 1200 }),
    '/thumb/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 300 }),
    '/nowidth/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false } }),
    '/noseg/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/noseg/segments.json': JSON.stringify({ mode: 'off' }),
    '/kmeans/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/kmeans/segments.json': JSON.stringify({ backend: 'kmeans' }),
    '/missingseg/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/dupstage/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/dupstage/stages/stage-010.jpg': 's10',
    '/dupstage/stages/stage-025.jpg': 's25',
    '/dupstage/stages/stage-050.jpg': 's50',
    '/dupstage/stages/stage-075.jpg': 's50',
    '/dupstage/stages/stage-100.jpg': 's100',
    '/enlarged/run-card.json': JSON.stringify({ gpuBackend: { backend: 'gpu' }, dimensions: { sourceWidth: 300, paintWidth: 1200, enlargement: 4 } }),
  };
  const io = { exists: p => p in files, readFile: p => files[p], readBytes: p => Buffer.from(files[p]) };
  assert.equal(verifyComparisonRun('/ok', { ...io, requireSegments: true, requireStages: true }).ok, true);
  assert.throws(() => verifyComparisonRun('/cpu', io), /GPU hardware is required/);
  assert.throws(() => verifyComparisonRun('/thumb', io), /300px crop thumbnails/);
  assert.throws(() => verifyComparisonRun('/nowidth', io), /rendered at width 0px/);
  assert.throws(() => verifyComparisonRun('/noseg', { ...io, requireSegments: true }), /--segments off/);
  assert.throws(() => verifyComparisonRun('/kmeans', { ...io, requireSegments: true }), /--segments kmeans/);
  assert.throws(() => verifyComparisonRun('/missingseg', { ...io, requireSegments: true }), /missing segmentation evidence/);
  assert.throws(() => verifyComparisonRun('/dupstage', { ...io, requireStages: true }), /duplicate consecutive playback stages/);
  assert.throws(() => verifyComparisonRun('/cpu', { ...io, requireGpu: false, requireStages: true }), /missing progressive stage images/);
  assert.throws(() => verifyComparisonRun('/enlarged', { ...io, minSourceWidth: 1000 }), /300px source target/);
  assert.throws(() => verifyComparisonRun('/ok', { ...io, minSourceWidth: 300 }), /0px source target/);
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
test('the rerender source gate admits every published target', () => {
  for (const [spec, sourceWidth] of [[1224, 300], [1224, 306], [1216, 304], [1200, 300]]) {
    assert.ok(sourceWidth >= rerenderGate({ width: spec }).minSourceWidth, `${sourceWidth}px source at ${spec}px`);
  }
  assert.ok(rerenderGate({ width: 1224 }).minSourceWidth > 200, 'a thumbnail-sized source still fails');
});
