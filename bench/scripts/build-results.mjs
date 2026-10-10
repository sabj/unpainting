#!/usr/bin/env node
// Build results/results.json from every runs/<round>/<model>/<try>/run.json.
//   node bench/scripts/build-results.mjs [--runs bench/runs] [--out bench/results/results.json] [--include-unscored]
// One entry per round and model: mean ± 95% CI over all paintings with scores in its tries, the best try, and medians
// per try for strokes, minutes, tokens and cost. Disqualified tries are left out. Tries without scores (dry runs, or
// runs still waiting for scores) are listed under `unscored` and never enter a mean. Each round's tries are grouped by
// the painter and sim versions that painted them, one entry per group labelled with its release, so two versions
// never share a mean (docs/versions.md).
import path from 'node:path';
import {
  RUNS, RESULTS, RESULTS_SCHEMA, ROUNDS, BUDGET, CROP_ORDER, PUBLIC_CROPS, loadRuns, loadCrops, writeJson, validateRun,
  mean, median, round2, bootstrapMean, paintingScores, tryMean, tryStrokes, roundById, posix, BENCH,
  inPublishedScope, shortfallReason, TARGET_SELF_SCORE, indexedScore, indexedScores, PAINTER_NOTE, groupByPainter, compareSemver,
} from './lib.mjs';
import { findingsData } from './findings-data.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const runsDir = path.resolve(opt('runs', RUNS));
const out = path.resolve(opt('out', path.join(RESULTS, 'results.json')));

const all = loadRuns(runsDir).filter(e => inPublishedScope(e.run));
const bad = all.map(({ file, run }) => ({ file, errs: validateRun(run) })).filter(x => x.errs.length);
if (bad.length) {
  for (const b of bad) console.error(`${posix(path.relative(BENCH, b.file))}: ${b.errs.join('; ')}`);
  process.exit(1);
}

const rel = file => posix(path.relative(BENCH, path.dirname(file)));
const isScored = run => run.score?.status === 'scored';
const crops = loadCrops();
const ORDER = ['low', 'medium', 'high'];
/** The higher of the two cheat-risk levels a run carries (either one high flags it for review). */
const worstLevel = r => [r.cheat.risk?.level, r.cheat.progressionRisk?.level].filter(Boolean).sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0] ?? null;

const tryIndexed = run => mean(indexedScores(run));
/** Best try: the most crops with scores, then the highest indexed mean, then the lowest try number. */
function bestTry(entries) {
  return [...entries].sort((a, b) => (paintingScores(b.run).length - paintingScores(a.run).length)
    || ((tryIndexed(b.run) ?? -1) - (tryIndexed(a.run) ?? -1)) || (a.run.try - b.run.try))[0] || null;
}

function modelEntry(entries) {
  const runs = entries.map(e => e.run);
  const m = runs[0].painter;
  const eligible = entries.filter(e => !e.run.cheat.disqualified && paintingScores(e.run).length);
  const scores = eligible.flatMap(e => paintingScores(e.run));
  const indexed = eligible.flatMap(e => indexedScores(e.run));
  const best = bestTry(eligible);
  const perCrop = {};
  for (const c of CROP_ORDER) {
    const xs = eligible.map(e => ({ e, s: e.run.crops[c]?.score?.composite })).filter(x => x.s != null);
    if (!xs.length) continue;
    const top = [...xs].sort((a, b) => b.s - a.s || a.e.run.try - b.e.run.try)[0];
    perCrop[c] = {
      mean: round2(mean(xs.map(x => x.s))), indexed: round2(indexedScore(c, mean(xs.map(x => x.s)))), n: xs.length,
      best: { try: top.e.run.try, score: top.s, indexed: round2(indexedScore(c, top.s)), image: `${rel(top.e.file)}/${top.e.run.crops[c].images?.final}`, stages: top.e.run.crops[c].images?.stages ? `${rel(top.e.file)}/${top.e.run.crops[c].images.stages}` : null },
    };
  }
  const pub = eligible.flatMap(e => PUBLIC_CROPS.map(c => e.run.crops[c]?.score?.composite).filter(v => v != null));
  const levels = runs.map(worstLevel);
  return {
    model: m.key, name: m.name, id: m.id, effort: m.effort,
    tries: runs.length, scoredTries: eligible.length, paintings: scores.length,
    indexed: { mean: round2(mean(indexed)), ci95: bootstrapMean(indexed), n: indexed.length },
    mean: round2(mean(scores)), ci95: bootstrapMean(scores),
    fewerTriesReason: shortfallReason(m.key, runs.length),
    best: best ? { try: best.run.try, score: round2(tryMean(best.run)), indexed: round2(tryIndexed(best.run)), crops: paintingScores(best.run).length, path: rel(best.file) } : null,
    perTry: {
      strokes: median(runs.map(tryStrokes).filter(Boolean)),
      minutes: round2(median(runs.map(r => r.session?.minutes))),
      tokens: median(runs.map(r => r.session?.tokens).filter(Boolean)),
      costUSD: round2(median(runs.map(r => r.session?.costUSD))),
      estCostUSD: round2(median(runs.map(r => r.session?.estCostUSD))),
    },
    publicCrops: { mean: round2(mean(pub)), ci95: bootstrapMean(pub), n: pub.length },
    perCrop,
    cheat: {
      disqualified: runs.filter(r => r.cheat.disqualified).length,
      riskLevels: levels,
      high: levels.filter(l => l === 'high').length,
      flagged: runs.filter(r => r.cheat.review?.status === 'flagged').length,
      cleared: runs.filter(r => r.cheat.review?.status === 'cleared').length,
    },
    tryList: runs.map(r => ({ try: r.try, mean: round2(tryMean(r)), indexed: round2(tryIndexed(r)), crops: paintingScores(r).length, complete: r.complete, risk: worstLevel(r), path: rel(entries.find(e => e.run === r).file) })),
  };
}

/** Why a model has no scored painting of a crop, from its run records: one short reason per crop. */
function missingCrops(entries, m, cropKeys) {
  const out = {};
  for (const c of cropKeys.filter(k => !m.perCrop[k])) {
    const runs = entries.map(e => e.run).filter(r => r.crops[c]);
    out[c] = !runs.length ? 'no painting'
      : runs.every(r => r.cheat.disqualified) ? 'disqualified'
        : runs.every(r => !r.crops[c].images?.final) ? 'render failed' : 'not scored';
  }
  return out;
}

const scored = all.filter(({ run }) => isScored(run));
const unscored = all.filter(({ run }) => !isScored(run)).map(({ file, run }) => ({ path: rel(file), round: run.round, model: run.painter.key, try: run.try, status: run.score?.status ?? 'unscored' }));

/** One results entry: a round's scored tries from one painter and sim version (empty while the round runs). */
function roundEntry(r, inRound, group, label) {
  const byModel = new Map();
  for (const e of inRound) byModel.set(e.run.painter.key, [...(byModel.get(e.run.painter.key) || []), e]);
  const models = [...byModel.values()].map(es => modelEntry(es.sort((a, b) => a.run.try - b.run.try)))
    .sort((a, b) => ((b.indexed.mean ?? -1) - (a.indexed.mean ?? -1)) || a.model.localeCompare(b.model));
  const cropKeys = CROP_ORDER.filter(c => inRound.some(e => e.run.crops[c]));
  for (const m of models) m.missing = missingCrops(byModel.get(m.model), m, cropKeys);
  return {
    id: r.id, label, key: r.key, dir: r.dir, title: r.title,
    painterVersion: group?.painterVersion ?? null, simVersion: group?.simVersion ?? null, judgeVersion: group?.judgeVersion ?? null, releases: group?.releases ?? [], harness: r.harness, plannedTries: r.tries, learnsBetweenTries: r.learning, explained: r.explained,
    status: inRound.length ? 'published' : 'running', crops: cropKeys, models,
  };
}

const rounds = ROUNDS.flatMap(r => {
  const groups = groupByPainter(scored.filter(({ run }) => roundById(run.round)?.id === r.id));
  if (!groups.length) return [roundEntry(r, [], null, r.id)];
  return groups.map(g => roundEntry(r, g.entries, g, groups.length > 1 ? `${r.id} (painter ${g.painterVersion} · sim ${g.simVersion} · judges ${g.judgeVersion})` : r.id));
});
const releases = [...new Set(scored.map(({ run }) => run.release))].sort(compareSemver);
const versions = groupByPainter(scored).map(({ painterVersion, simVersion, judgeVersion, releases: rs }) => ({ painterVersion, simVersion, judgeVersion, releases: rs }));

const results = {
  schema: RESULTS_SCHEMA,
  benchmark: 'unpaint-bench',
  protocol: 'v2',
  builtFrom: 'runs/*/*/*/run.json by scripts/build-results.mjs',
  painter: { versions, releases, tags: releases.map(v => `v${v}`), note: PAINTER_NOTE },
  budget: BUDGET,
  scoring: {
    tries: 'Best of 3: only tries 1–3; xhigh where reasoning effort is supported',
    composite: 'mean of the vision-judge overall and the classic-metrics mean, 0 to 10',
    indexed: 'composite as a percentage of the target scored against itself (crops[].selfScore); models rank by the mean indexed score, with its own bootstrap interval',

    visionPanel: ['moonshotai/Kimi-K3', 'zai-org/GLM-5.3-Flash', 'Qwen/Qwen3.5-9B'],
    callsPerJudge: 5,
    perJudge: 'median of its valid calls',
    ci: '95% percentile bootstrap (2,000 resamples, seed 7) of the mean over all scored paintings of a model in a round',
    advisory: 'Treat small differences as noise.',
    judgeProviders: 'V1 to V3 judges ran on Together. In V4 and V5, later judge calls went through OpenRouter to zero-data-retention providers; each painting lists them under judgeProviders.',
  },
  roundCompare: (() => {
    const v = findingsData(runsDir).v1v2;
    return {
      method: v.method, models: v.models, excluded: v.excluded,
      naiveMean: v.v1, skillMean: v.v2, diff: v.diff, ci95: v.ci,
      perModel: Object.fromEntries(v.perModel.map(p => [p.name, { naive: p.v1, skill: p.v2, diff: p.diff, nNaive: p.nNaive, nSkill: p.nSkill }])),
    };
  })(),
  crops: crops.map(c => ({ key: c.task, name: c.name, selfScore: TARGET_SELF_SCORE[c.task] ?? null, w: c.width, h: c.height, style: c.style, distributed: c.distributed, file: c.file ? `v2/${c.file}` : null })),
  rounds,
  unscored,
};
writeJson(out, results);
console.log(`results: ${scored.length} scored tries, ${unscored.length} unscored, ${rounds.filter(r => r.status === 'published').length} rounds published -> ${posix(path.relative(process.cwd(), out))}`);
