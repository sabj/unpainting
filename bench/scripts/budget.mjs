// Work estimates are not speed or dollar measurements. Unknown costs stay unknown.
import { benchmarkProfile, profileSubject } from './profiles.mjs';

export function workEstimate(subjects, modelCount = 6) {
  if (!subjects.length || !Number.isInteger(modelCount) || modelCount < 1) throw new Error('need subjects and a positive model count');
  const profile = name => {
    const p = benchmarkProfile(name), paintings = modelCount * subjects.length * p.tries;
    const cells = subjects.reduce((s, v) => s + profileSubject(v, p).width ** 2 * (v.aspect ?? 1), 0);
    return { paintings, initialJudgeCalls: paintings * (p.judgeProfile === 'lite' ? 3 : 15),
      progressionCalls: paintings * 2, cellTries: cells * p.tries * modelCount, modelMinutesCap: paintings * p.modelMinutes };
  };
  const lite = profile('lite'), full = profile('full');
  return { basis: 'same models and targets; one lite V4 try versus three full V4 tries; before retries', lite, full,
    plannedReductions: { judgingCalls: 1 - (lite.initialJudgeCalls + lite.progressionCalls) / (full.initialJudgeCalls + full.progressionCalls),
      cellTries: 1 - lite.cellTries / full.cellTries, modelTimeAllocation: 1 - lite.modelMinutesCap / full.modelMinutesCap },
    measuredTimeOrCost: false };
}

export function reduction(current, baseline) {
  return Number.isFinite(current) && current >= 0 && Number.isFinite(baseline) && baseline > 0 ? 1 - current / baseline : null;
}

export function compareMeasured(lite, full) {
  const fields = ['models', 'targets', 'targetFingerprints', 'painterVersion', 'simVersion', 'sourceCommit', 'machine', 'backend',
    'round', 'judgeVersion', 'judgeRoute', 'scoreProtocol', 'progressionProtocol', 'progressionJudges', 'rubric', 'strictVerdict'];
  const differences = fields.filter(k => lite[k] == null || full[k] == null || JSON.stringify(lite[k]) !== JSON.stringify(full[k]));
  for (const [side, value, expected] of [['lite', lite, { benchmarkProfile: 'lite-v1', tries: 1, judgeProfile: 'J2-lite' }],
    ['full', full, { benchmarkProfile: 'full-v1', tries: 3, judgeProfile: 'J2-full' }]]) {
    for (const [k, v] of Object.entries(expected)) if (value[k] !== v) differences.push(`${side}.${k}`);
  }
  if (lite.round !== 'V4' || full.round !== 'V4') differences.push('round must be V4');
  const eligible = !differences.length && lite.complete === true && full.complete === true;
  const metrics = Object.fromEntries(['wallSeconds', 'renderSeconds', 'modelTokens', 'costUSD'].map(k => {
    const r = eligible ? reduction(lite[k], full[k]) : null;
    return [k, { reduction: r, atLeast80PercentLess: r == null ? null : r >= 0.8 }];
  }));
  return { comparable: eligible, differences, metrics,
    achieved: eligible && metrics.wallSeconds.atLeast80PercentLess === true && metrics.costUSD.atLeast80PercentLess === true,
    modelQuotaAchieved: metrics.modelTokens.atLeast80PercentLess };
}

export function tokenStop(tokens, limit) {
  return Number.isFinite(tokens) && Number.isFinite(limit) && tokens >= limit ? `observed model tokens reached ${limit}` : null;
}
