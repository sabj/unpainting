// Benchmark budgets, separate from painter recipes and judge versions.
export const CORE_MODELS = Object.freeze(['astra', 'sol', 'opus', 'sonnet', 'argon', 'gflash']);
const PROFILES = {
  lite: { id: 'lite-v1', tries: 1, width: 540, modelMinutes: 5, wallMinutes: 5, planOnly: true, repairTurns: 0,
    maxModelSteps: 24, maxToolOutputBytes: 12000, tokenWatchLimit: 200000, renderMinutes: 10, checkMinutes: 2, judgeVersion: 'J2', judgeProfile: 'lite', marks: 0 },
  full: { id: 'full-v1', tries: 3, width: null, modelMinutes: 85, wallMinutes: 300, planOnly: false, repairTurns: 1,
    maxModelSteps: null, maxToolOutputBytes: null, tokenWatchLimit: null, renderMinutes: 60, checkMinutes: 15, judgeVersion: 'J2', judgeProfile: 'full', marks: 1 },
};
for (const p of Object.values(PROFILES)) Object.freeze(p);

export function benchmarkProfile(name = 'lite') {
  if (!Object.hasOwn(PROFILES, name)) throw new Error(`unknown benchmark profile ${name}; use lite or full`);
  return PROFILES[name];
}

export function profileForRound(round, name) {
  const profile = benchmarkProfile(name ?? (round === 'V4' ? 'lite' : 'full'));
  if (profile.planOnly && round !== 'V4') throw new Error('lite is a V4 planning screen; use full for other rounds');
  return profile;
}

export function profileSubject(subject, profile, dryWidth = null) {
  return { ...subject, width: dryWidth ?? (profile.width ? Math.min(profile.width, subject.width) : subject.width),
    benchmarkProfile: profile.id, recordingMarks: profile.marks, planOnly: profile.planOnly,
    renderTimeoutMs: profile.renderMinutes * 60000, checkTimeoutMs: profile.checkMinutes * 60000 };
}

export function selectModels(models, selection = 'core') {
  const keys = selection === 'all' ? models.map(m => m.key) : selection.split(',').flatMap(k => k === 'core' ? CORE_MODELS : [k.trim()]);
  if (!keys.length || keys.some(k => !k)) throw new Error('choose core, all, or comma-separated model keys');
  return [...new Set(keys)].map(k => {
    const model = models.find(m => m.key === k);
    if (!model) throw new Error(`unknown model ${k}`);
    return model;
  });
}
