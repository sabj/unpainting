import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, scorePython } from './preflight.mjs';

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
