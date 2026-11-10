// Which judge scores a try. A benchmark profile names a judge profile (lite, standard, full) that only J2 has; a run
// that chose J1 (--judge J1) keeps that name in its budget, so it applies only when the judge is J2. An explicit
// --profile with J1 is still an error.
export function scoreJudge(run, { judge: judgeOpt, profile: profileOpt } = {}) {
  const judge = judgeOpt ?? run.settings?.budget?.judgeVersion ?? run.judgeVersion ?? 'J1';
  if (!['J1', 'J2'].includes(judge)) throw Error('--judge must be J1 or J2');
  const profile = profileOpt ?? (judge === 'J2' ? run.settings?.budget?.judgeProfile : undefined);
  if (profile && (judge !== 'J2' || !['lite', 'standard', 'full'].includes(profile))) throw Error('--profile lite|standard|full requires J2');
  return { judge, profile };
}
