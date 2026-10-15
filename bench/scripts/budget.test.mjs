import test from 'node:test';
import assert from 'node:assert/strict';
import { workEstimate, compareMeasured, tokenStop } from './budget.mjs';

test('same-roster estimates exceed 80 percent without counting roster reduction as a saving', () => {
  const e = workEstimate(Array.from({ length: 5 }, () => ({ width: 1200 })), 6);
  assert.equal(e.lite.paintings, 30); assert.equal(e.full.paintings, 90);
  assert.equal(e.lite.initialJudgeCalls + e.lite.progressionCalls, 150);
  assert.equal(e.full.initialJudgeCalls + e.full.progressionCalls, 1530);
  assert.ok(e.plannedReductions.cellTries > .93);
  assert.equal(e.measuredTimeOrCost, false);
});
test('unknown cost, missing measurements and incomplete runs never certify the saving', () => {
  const base = { models: ['m'], targets: ['t'], targetFingerprints: { t: 'sha' }, sourceCommit: 'abc123', round: 'V4', judgeVersion: 'J2', judgeRoute: 'together',
    scoreProtocol: 'native-v1', progressionProtocol: 'progression-v1-complete', progressionJudges: ['a', 'b'], rubric: 'r', strictVerdict: false,
    benchmarkProfile: 'full-v1', tries: 3, judgeProfile: 'J2-full', painterVersion: 'V099-dev', simVersion: '102', machine: 'mini', backend: 'cpu', complete: true,
    wallSeconds: 100, renderSeconds: 100, modelTokens: 100, costUSD: 10 };
  const lite = { ...base, benchmarkProfile: 'lite-v1', tries: 1, judgeProfile: 'J2-lite', wallSeconds: 10, renderSeconds: 10, modelTokens: 10, costUSD: 1 };
  assert.equal(compareMeasured(lite, base).achieved, true);
  const slowerRender = compareMeasured({ ...lite, renderSeconds: 50, modelTokens: 50 }, base);
  assert.equal(slowerRender.achieved, true, 'whole-suite time and cost are the objective; component timings are diagnostic');
  assert.equal(slowerRender.modelQuotaAchieved, false);
  assert.equal(compareMeasured({ ...lite, costUSD: null }, base).achieved, false);
  assert.equal(compareMeasured({ ...lite, complete: false }, base).comparable, false);
  assert.equal(compareMeasured({ ...lite, backend: 'gpu' }, base).comparable, false);
  assert.equal(compareMeasured(lite, { ...base, costUSD: 0 }).metrics.costUSD.reduction, null);
  assert.equal(compareMeasured(lite, lite).comparable, false, 'another lite run cannot masquerade as a full baseline');
  for (const field of ['judgeRoute', 'scoreProtocol', 'targetFingerprints', 'sourceCommit', 'tries']) {
    assert.equal(compareMeasured(lite, { ...base, [field]: null }).comparable, false, field);
  }
});
test('token watchdog stops at the observed cap without interpreting absent usage as zero', () => {
  assert.equal(tokenStop(null, 20), null);
  assert.equal(tokenStop(19, 20), null);
  assert.match(tokenStop(20, 20), /reached/);
});
