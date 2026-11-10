import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreJudge } from './score-judge.mjs';

const run = (judgeVersion, judgeProfile) => ({ judgeVersion, settings: { budget: { judgeVersion, judgeProfile } } });

test('a J2 run scores with its profile\'s judge profile', () => {
  assert.deepEqual(scoreJudge(run('J2', 'full')), { judge: 'J2', profile: 'full' });
  assert.deepEqual(scoreJudge(run('J2', 'lite')), { judge: 'J2', profile: 'lite' });
});

test('a full-profile run that chose J1 scores with J1 and no J2 judge profile (V5 feedback between tries)', () => {
  assert.deepEqual(scoreJudge(run('J1', 'full')), { judge: 'J1', profile: undefined });
});

test('an old run with no budget scores with J1', () => {
  assert.deepEqual(scoreJudge({ settings: {} }), { judge: 'J1', profile: undefined });
});

test('explicit options win, and an explicit J2 profile with J1 is still refused', () => {
  assert.deepEqual(scoreJudge(run('J1', 'full'), { judge: 'J2' }), { judge: 'J2', profile: 'full' });
  assert.deepEqual(scoreJudge(run('J2', 'full'), { profile: 'standard' }), { judge: 'J2', profile: 'standard' });
  assert.throws(() => scoreJudge(run('J1', 'full'), { profile: 'full' }), /requires J2/);
  assert.throws(() => scoreJudge(run('J1', 'full'), { judge: 'J3' }), /J1 or J2/);
});
