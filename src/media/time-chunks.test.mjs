import test from 'node:test';
import assert from 'node:assert/strict';
import { timeChunks, STEP_CHUNK_DT, DRY_TAIL_CHUNK_DT, thinDryWarmup, rampedWaitSteps, fastLevelPlan, planStepAt } from './time-chunks.mjs';

test('an ordinary step is cut into chunks of at most 2, the fast dry tail into longer ones', () => {
  assert.equal(STEP_CHUNK_DT, 2);
  assert.equal(timeChunks(0.1), 1); assert.equal(timeChunks(2), 1); assert.equal(timeChunks(28), 14);
  assert.ok(DRY_TAIL_CHUNK_DT > STEP_CHUNK_DT);
  assert.equal(timeChunks(28, DRY_TAIL_CHUNK_DT), Math.ceil(28 / DRY_TAIL_CHUNK_DT));
  assert.ok(timeChunks(140, DRY_TAIL_CHUNK_DT) < timeChunks(140));
});

test('rampedWaitSteps and fastLevelPlan preserve exact physical durations with fewer steps', () => {
  const wait = rampedWaitSteps(60, 0.1);
  assert.deepEqual(wait, [{ steps: 5, dt: 0.1 }, { steps: 3, dt: 0.5 }, { steps: 4, dt: 1 }]);
  assert.ok(Math.abs(wait.reduce((s, p) => s + p.steps * p.dt, 0) - 6) < 1e-12);
  assert.deepEqual(rampedWaitSteps(10, 0.1), [{ steps: 10, dt: 0.1 }]);
  const plan = fastLevelPlan(0.1, 60, 140);
  assert.equal(plan.levelStep, 12);
  assert.equal(plan.levelMaxStep, 20);
  assert.equal(plan.postCheckEvery, 2);
  assert.equal(planStepAt(plan, 0).dt, 0.1);
  assert.equal(planStepAt(plan, 5).dt, 0.5);
  assert.equal(planStepAt(plan, 8).dt, 1);
  assert.equal(planStepAt(plan, 12).dt, 1);
  assert.equal(fastLevelPlan(0.1, 10, 90), null);
  assert.equal(fastLevelPlan(1, 60, 140), null);
});

test('a measured thin film keeps the minimum wait duration with a half-second step bound', () => {
  for (const dt of [.01, .1, .123, .49]) for (const remaining of [1, 13, 55]) {
    const p = thinDryWarmup(.025, .05, dt, remaining);
    assert.ok(p.steps >= 1 && p.dt <= .5);
    assert.ok(Math.abs(p.steps * p.dt - dt * remaining) < 1e-12);
  }
  for (const args of [[.051,.05,.1,55],[.025,0,.1,55],[.025,.05,.5,55],[.025,.05,.1,0]]) assert.equal(thinDryWarmup(...args),null);
});

test('only a sub-threshold trace doubles the kinetic tail split after its complete warmup', () => {
  for (const depth of [.001, .003, .004]) {
    const p = thinDryWarmup(depth, .05, .1, 55);
    assert.equal(p.tailChunkDt, 2 * DRY_TAIL_CHUNK_DT);
    assert.equal(timeChunks(2 * DRY_TAIL_CHUNK_DT, p.tailChunkDt), 1);
    assert.equal(p.steps * p.dt, 5.5);
  }
  for (const depth of [.004001, .025, .04, .05]) assert.equal(thinDryWarmup(depth, .05, .1, 55).tailChunkDt, DRY_TAIL_CHUNK_DT);
  assert.equal(thinDryWarmup(.003, .05, .1, 55, .002).tailChunkDt, DRY_TAIL_CHUNK_DT);
});
