// The numbers behind results/FINDINGS.md, computed from runs/. Shared by build-findings.mjs and lib.test.mjs.
import { loadRuns, RUNS, mean, median, round2, bootstrapMean, bootstrapPairedDiff, paintingScores, tryStrokes, inPublishedScope } from './lib.mjs';

const scoresOn = (runs, cropKeys) => runs.flatMap(r => (cropKeys || Object.keys(r.crops)).map(c => r.crops[c]?.score?.composite).filter(v => v != null));

export function findingsData(root = RUNS) {
  const all = loadRuns(root).map(x => x.run).filter(inPublishedScope);
  // Published comparisons use the original version group only.
  const runs = all.filter(r => r.painterVersion === 'V096' && r.simVersion === '100' && r.judgeVersion === 'J1').filter(r => r.score?.status === 'scored' && !r.cheat.disqualified);
  const of = (round, model) => runs.filter(r => r.round === round && r.painter.key === model).sort((a, b) => a.try - b.try);
  const models = round => [...new Set(runs.filter(r => r.round === round).map(r => r.painter.key))].sort();
  const name = key => runs.find(r => r.painter.key === key)?.painter.name ?? key;

  // V1 against V2: pair model means over all paintings with scores in tries 1 to 3, weighting models equally.
  const both = models('V1').filter(m => scoresOn(of('V1', m)).length >= 5 && scoresOn(of('V2', m)).length >= 5);
  const matched = both.map(m => ({
    model: m, name: name(m),
    a: scoresOn(of('V1', m)), b: scoresOn(of('V2', m)),
  }));
  const v1v2 = {
    method: 'Paired by model. Each model scores the mean of all its scored paintings in a round; the difference is skill minus naive per model, averaged with each model weighted equally. 95% CI: percentile bootstrap over models (10,000 resamples). Models need at least 5 scored paintings in both rounds.',
    models: matched.map(g => g.name),
    excluded: models('V1').filter(m => !both.includes(m)).map(name),
    v1: round2(mean(matched.map(g => mean(g.a)))), v2: round2(mean(matched.map(g => mean(g.b)))),
    diff: round2(mean(matched.map(g => mean(g.b) - mean(g.a)))),
    ci: bootstrapMean(matched.map(g => mean(g.b) - mean(g.a)), { n: 10000 }),
    perModel: matched.map(g => ({ name: g.name, v1: round2(mean(g.a)), v2: round2(mean(g.b)), diff: round2(mean(g.b) - mean(g.a)), nNaive: g.a.length, nSkill: g.b.length }))
      .sort((x, y) => y.diff - x.diff),
  };

  // V3 against V2 on the crops V3 painted, and V3's first trial against its later ones.
  const v3crops = ['hills', 'south-france', 'sargent'];
  const v3 = models('V3').map(m => {
    const tries = of('V3', m);
    const v2 = scoresOn(of('V2', m), v3crops), v3s = scoresOn(tries, v3crops);
    const first = tries.find(r => r.try === 1), later = tries.filter(r => r.try > 1);
    return {
      name: name(m), v2: round2(mean(v2)), v3: round2(mean(v3s)), diff: round2(mean(v3s) - mean(v2)),
      ci: bootstrapPairedDiff([{ a: v2, b: v3s }]), v2n: v2.length, v3n: v3s.length,
      first: round2(mean(paintingScores(first))), later: round2(mean(later.flatMap(paintingScores))),
      last: round2(mean(paintingScores(tries.at(-1)))), trials: tries.map(r => round2(mean(paintingScores(r)))),
      minutes: round2(median(tries.map(r => r.session.minutes))), tokens: median(tries.map(r => r.session.tokens).filter(Boolean)),
    };
  }).sort((a, b) => b.diff - a.diff);

  // Low stroke counts: trials whose median stroke total over all crops is under 1,000.
  const low = [];
  for (const round of ['V1', 'V2', 'V3']) for (const m of models(round)) {
    const tries = runs.filter(r => r.round === round && r.painter.key === m);
    const strokes = median(tries.map(tryStrokes).filter(Boolean));
    if (strokes == null || strokes >= 1000) continue;
    const perCrop = tries.flatMap(r => Object.values(r.crops).map(c => c.strokes)).filter(v => v != null);
    low.push({
      round, name: name(m), tries: tries.length, strokesPerTrial: strokes, strokesPerPainting: median(perCrop),
      paintings: tries.map(r => Object.keys(r.crops).length), cropsPerTry: tries[0].settings.crops.length,
      minutes: tries.map(r => r.session.minutes), costs: tries.map(r => ({
        value: r.session.costUSD ?? r.session.estCostUSD, estimated: r.session.costUSD == null && r.session.estCostUSD != null,
      })),
      kitRejections: tries.map(r => r.guard.kitRejections ?? null),
      otherRound: round === 'V3' ? null : { round: round === 'V1' ? 'V2' : 'V1', strokesPerTrial: median(runs.filter(r => r.round === (round === 'V1' ? 'V2' : 'V1') && r.painter.key === m).map(tryStrokes).filter(Boolean)), minutes: median(runs.filter(r => r.round === (round === 'V1' ? 'V2' : 'V1') && r.painter.key === m).map(r => r.session.minutes)) },
      medianMinutes: median(tries.map(r => r.session.minutes)),
    });
  }

  // V4 and V5: each model's V4 mean over all scored paintings, and its V5 mean per try (V5 tries learn from the one before).
  const scoresOf = rs => rs.flatMap(r => paintingScores(r));
  const pipeline = [...new Set([...models('V4'), ...models('V5')])].map(m => {
    const v4 = of('V4', m), v5 = of('V5', m), v4s = scoresOf(v4), v5s = scoresOf(v5);
    const unpainted = rs => rs.reduce((a, r) => a + Object.keys(r.unpainted || {}).length, 0);
    return {
      name: name(m), v4: round2(mean(v4s)), v4ci: bootstrapMean(v4s), v4n: v4s.length, v5: round2(mean(v5s)), v5ci: bootstrapMean(v5s), v5n: v5s.length,
      v5tries: [1, 2, 3].map(n => round2(mean(paintingScores(v5.find(r => r.try === n) || {})))),
      unpainted: unpainted(v4) + unpainted(v5),
      notRun: [...v4, ...v5].flatMap(r => Object.keys(r.notPainted || {}).map(c => `${r.round} try ${r.try}, ${c}`)),
      routed: [...v4, ...v5].filter(r => (r.evaluators.providers || []).length > 1).map(r => `${r.round} try ${r.try}`),
    };
  }).sort((a, b) => (b.v4 ?? -1) - (a.v4 ?? -1));

  // Cheat-risk and guard totals.
  const guard = {
    tries: all.length,
    blocked: all.reduce((a, r) => a + (r.guard.blockedImageReads || 0), 0),
    disqualified: all.filter(r => r.cheat.disqualified).length,
    high: all.filter(r => [r.cheat.risk?.level, r.cheat.progressionRisk?.level].includes('high'))
      .map(r => ({ round: r.round, name: r.painter.name, try: r.try, review: r.cheat.review?.status ?? null })),
  };
  return { v1v2, v3, pipeline, low, guard };
}
