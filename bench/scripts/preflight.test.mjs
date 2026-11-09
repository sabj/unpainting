import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, scorePython, verifyComparisonRun, verifyTearsheetContract } from './preflight.mjs';
import { parseRerenderArgs, discoverStoredPlans } from './rerender.mjs';

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
test('verifyComparisonRun and verifyTearsheetContract reject CPU fallbacks, 300px thumbnails, --segments off, and incomplete model/stage sets', () => {
  const files = {
    '/ok/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/ok/segments.json': JSON.stringify({ mode: 'sam', status: 'ok' }),
    '/cpu/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'cpu', fallback: true }, width: 1200 }),
    '/thumb/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 300 }),
    '/noseg/paint-speed-summary.json': JSON.stringify({ backend: { backend: 'gpu', fallback: false }, width: 1200 }),
    '/noseg/segments.json': JSON.stringify({ mode: 'off' }),
    '/enlarged/run-card.json': JSON.stringify({ gpuBackend: { backend: 'gpu' }, dimensions: { sourceWidth: 300, paintWidth: 1200, enlargement: 4 } }),
  };
  const io = { exists: p => p in files, readFile: p => files[p] };
  assert.equal(verifyComparisonRun('/ok', { ...io, requireSegments: true }).ok, true);
  assert.throws(() => verifyComparisonRun('/cpu', io), /GPU hardware is required/);
  assert.throws(() => verifyComparisonRun('/thumb', io), /300px crop thumbnails/);
  assert.throws(() => verifyComparisonRun('/noseg', { ...io, requireSegments: true }), /--segments off/);
  assert.throws(() => verifyComparisonRun('/enlarged', { ...io, minSourceWidth: 1000 }), /300px source target/);
  assert.equal(verifyTearsheetContract({ models: ['argon', 'astra', 'opus'], stages: ['10%', '25%', '50%', '75%', '100%'] }).ok, true);
  assert.throws(() => verifyTearsheetContract({ models: ['opus'], stages: ['100%'] }), /missing required model families/);
  assert.throws(() => verifyTearsheetContract({ models: ['argon', 'astra', 'opus'], stages: ['100%'] }), /progressive stages required/);
});
test('rerender discovers stored V4 plans and enforces --gpu on', () => {
  assert.throws(() => parseRerenderArgs(['--gpu', 'off']), /rerender requires --gpu on/);
  const jobs = discoverStoredPlans({ round: 'v4-pipeline', models: ['argon', 'astra', 'opus'], tries: [1, 2, 3] });
  assert.equal(jobs.length, 45);
});
