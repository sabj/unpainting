// Shared helpers for the unpaint-bench scripts: paths, rounds, crops, models, statistics and run.json checks.
// Pure functions apart from the file readers, so lib.test.mjs can load them without a run folder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionStamp, JUDGE_VERSION, JUDGE_RE, PAINTER_RE, SIM_RE, SEMVER_RE } from '../../src/painter-version.mjs';

export const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(BENCH, '..');
export const RUNS = path.join(BENCH, 'runs');
export const RESULTS = path.join(BENCH, 'results');
export const V2 = path.join(BENCH, 'v2');
export const RUN_SCHEMA = 'unpaint-bench/run@2';
export const RESULTS_SCHEMA = 'unpaint-bench/results@1';

/** The five rounds of the ladder. `dir` is the folder under runs/. */
export const ROUNDS = [
  { id: 'V1', key: 'naive', dir: 'v1-naive', title: 'Tools only', harness: 'Tools only', tries: 3, learning: false,
    explained: 'Models paint with the brush and pen tools.' },
  { id: 'V2', key: 'skill', dir: 'v2-skill', title: 'Tools and technique guides', harness: 'Tools and technique guides', tries: 3, learning: false,
    explained: 'Models get the tools and guides to painting techniques.' },
  { id: 'V3', key: 'informed', dir: 'v3-informed', title: 'Technique guides and feedback between attempts', harness: 'Tools and technique guides', tries: 3, learning: true,
    explained: 'Models get the V2 tools and guides, plus their earlier paintings and notes.' },
  { id: 'V4', key: 'pipeline', dir: 'v4-pipeline', title: 'Full painting pipeline', harness: 'Tools, technique guides and full painting pipeline', tries: 3, learning: false,
    explained: 'Models use the planner, painter presets and scoring tools.' },
  { id: 'V5', key: 'self-study', dir: 'v5-self-study', title: 'Full pipeline and feedback between attempts', harness: 'Tools, technique guides and full painting pipeline', tries: 3, learning: true,
    explained: 'Models use the full pipeline and can revise their plans using earlier attempts.' },
];
/** What painted the published results (docs/versions.md). */
export const PAINTER_NOTE = 'Every published result: painter V096 · sim 100 · judges J1 · release 0.1.0. V1-V3 used the models\' own toolkit on this painter\'s simulator; V4/V5 used the V096 pipeline (unpublished benchmark build, same recipe).';
/** What a new run records: release, painterVersion, simVersion and commit of this checkout (src/painter-version.mjs). */
export const VERSION_STAMP = { ...versionStamp(REPO), judgeVersion: JUDGE_VERSION };
/** Compare two semver strings, numerically by part; a pre-release sorts before its release. */
export function compareSemver(a, b) {
  const parts = v => v.split('-')[0].split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return (b.includes('-') - a.includes('-')) || a.localeCompare(b);
}
const vNum = v => Number(String(v).replace(/^[VJ]/, ''));
/**
 * Split one round's tries by the painter and sim versions that painted them, oldest first (docs/versions.md).
 * Each group is scored on its own, so two painter or sim versions never share a mean. The release only labels a group.
 */
export function groupByPainter(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.run.painterVersion}|${e.run.simVersion}|${e.run.judgeVersion}`;
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  return [...groups.values()].map(es => ({
    painterVersion: es[0].run.painterVersion, simVersion: es[0].run.simVersion, judgeVersion: es[0].run.judgeVersion,
    releases: [...new Set(es.map(e => e.run.release))].sort(compareSemver), entries: es,
  })).sort((a, b) => (vNum(a.painterVersion) - vNum(b.painterVersion)) || (vNum(a.simVersion) - vNum(b.simVersion)) || (vNum(a.judgeVersion) - vNum(b.judgeVersion)));
}
export const roundById = id => ROUNDS.find(r => r.id === String(id).toUpperCase() || r.key === id || r.dir === id) || null;

export const BUDGET = { strokes: 2500, minutesPerCrop: 15, sessionCapMin: 85 };
/** The rounds that paint with the painter (tools/paint-plate.mjs) rather than the toolkit. */
export const PIPELINE_ROUNDS = new Set(['V4', 'V5']);
export const CROP_ORDER = ['hills', 'south-france', 'sargent', 'mittens', 'trumbull'];
export const PUBLIC_CROPS = ['hills', 'south-france', 'sargent', 'mittens', 'trumbull'];

export const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };

/** Crop specs from the frozen v2 snapshot, plus the display names the post uses. */
const NAMES = { hills: 'Hills', 'south-france': 'France', sargent: 'Ships', mittens: 'Mittens', trumbull: 'Trumbull' };
export function loadCrops() {
  const spec = readJson(path.join(V2, 'crops.json'));
  return spec.crops.map(c => ({ ...c, name: NAMES[c.task] || c.task }));
}
export const loadModels = () => readJson(path.join(BENCH, 'models.json')).models;

/** Best of three uses tries 1 to 3 only, at xhigh where the model supports reasoning effort. */
export const inPublishedScope = run => run.try <= 3 && (run.painter.effort == null || ['xhigh', 'n/a'].includes(run.painter.effort));

export const shortfallReason = (model, tries) => tries >= 3 ? null : model === 'dsflash'
  ? 'per-run cost cap and API errors' : ['opus', 'sonnet', 'haiku'].includes(model) ? 'third not run' : 'third try not available';

export const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs) {
  const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export const round2 = x => (x == null ? null : Math.round(x * 100) / 100);

/**
 * Each target scored against itself by the same scorer and path as the paintings, at the target's native size
 * (docs/scoring.md, the controls table; mean of 3 runs): the realistic ceiling for that subject, shared by every round.
 * The indexed score divides a painting's composite by its target's self-score.
 */
export const TARGET_SELF_SCORE = { hills: 8.43, 'south-france': 8.43, sargent: 8.76, mittens: 8.76, trumbull: 8.57 };
/** A painting's composite as a percentage of its target's self-score, or null. */
export const indexedScore = (crop, composite) => (composite == null || !Number.isFinite(composite) || !TARGET_SELF_SCORE[crop]
  ? null : 100 * composite / TARGET_SELF_SCORE[crop]);
/** The indexed scores of a try's scored paintings. */
export const indexedScores = run => Object.entries(run.crops || {}).map(([c, v]) => indexedScore(c, v.score?.composite)).filter(v => v != null);

/** Small seeded generator (mulberry32) so every rebuild gives the same intervals. */
export function rng(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% percentile bootstrap of the mean: 2,000 resamples. Null for fewer than 2 values. */
export function bootstrapMean(xs, { n = 2000, seed = 7 } = {}) {
  if (xs.length < 2) return null;
  const r = rng(seed), ms = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < xs.length; j++) s += xs[(r() * xs.length) | 0];
    ms[i] = s / xs.length;
  }
  ms.sort((a, b) => a - b);
  return [round2(ms[Math.floor(0.025 * n)]), round2(ms[Math.floor(0.975 * n) - 1])];
}

/**
 * 95% bootstrap interval of a difference of grand means: groups is [{a: [...], b: [...]}], one per model.
 * Each resample redraws the paintings inside every group and round, then averages the per-group means.
 */
export function bootstrapPairedDiff(groups, { n = 2000, seed = 7 } = {}) {
  const r = rng(seed), out = new Array(n);
  const draw = xs => { let s = 0; for (let j = 0; j < xs.length; j++) s += xs[(r() * xs.length) | 0]; return s / xs.length; };
  for (let i = 0; i < n; i++) out[i] = mean(groups.map(g => draw(g.b) - draw(g.a)));
  out.sort((a, b) => a - b);
  return [round2(out[Math.floor(0.025 * n)]), round2(out[Math.floor(0.975 * n) - 1])];
}

export const riskLevel = s => (s == null ? null : s < 0.3 ? 'low' : s < 0.6 ? 'medium' : 'high');

/** Composite scores of a run's paintings that have one, in crop order. */
export const paintingScores = run => Object.values(run.crops || {}).map(c => c.score?.composite).filter(v => v != null && Number.isFinite(v));
export const tryMean = run => mean(paintingScores(run));
export const tryStrokes = run => Object.values(run.crops || {}).reduce((a, c) => a + (c.strokes || 0), 0);

/** Problems with a run.json, as a list of strings. Empty means valid. */
export function validateRun(run) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(run && typeof run === 'object', 'run is not an object');
  if (!run || typeof run !== 'object') return errs;
  need(run.schema === RUN_SCHEMA, `schema must be "${RUN_SCHEMA}"`);
  need(!!roundById(run.round), 'round must be one of V1..V5');
  need(run.painter && typeof run.painter.key === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(run.painter.key), 'painter.key must be a lowercase slug');
  need(run.painter && typeof run.painter.name === 'string', 'painter.name is required');
  need(typeof run.release === 'string' && SEMVER_RE.test(run.release), 'release must be the release semver, such as "0.1.0"');
  need(typeof run.painterVersion === 'string' && PAINTER_RE.test(run.painterVersion), 'painterVersion must be the painter V number, such as "V096"');
  need(typeof run.judgeVersion === 'string' && JUDGE_RE.test(run.judgeVersion), 'judgeVersion must be the judge J number, such as "J1"');
  need(typeof run.simVersion === 'string' && SIM_RE.test(run.simVersion), 'simVersion must be the sim number, such as "100"');
  need(run.commit === null || (typeof run.commit === 'string' && /^[0-9a-f]{7,40}(-dirty)?$/.test(run.commit)), 'commit must be a git sha or null');
  need(run.planner === null || (run.planner && typeof run.planner.id === 'string'), 'planner must be null or {id, name}');
  const ev = run.evaluators;
  need(ev && Array.isArray(ev.scoreJudges) && Array.isArray(ev.progressionJudges), 'evaluators.scoreJudges and evaluators.progressionJudges must be arrays');
  need(Number.isInteger(run.try) && run.try >= 1, 'try must be an integer from 1');
  need(run.settings && ['gentle', 'hard'].includes(run.settings.mode), 'settings.mode must be gentle or hard');
  // V4 and V5 paint with the painter, which sets its own stroke count: no budget
  const pipeline = PIPELINE_ROUNDS.has(roundById(run.round)?.id);
  need(run.settings && run.settings.strokeBudget === (pipeline ? null : BUDGET.strokes), `settings.strokeBudget must be ${pipeline ? 'null in V4 and V5' : BUDGET.strokes}`);
  need(run.guard && Number.isInteger(run.guard.blockedImageReads), 'guard.blockedImageReads must be an integer');
  need(run.crops && typeof run.crops === 'object', 'crops must be an object (empty when nothing was painted)');
  for (const [k, c] of Object.entries(run.crops || {})) {
    need(CROP_ORDER.includes(k), `crop ${k} is not a benchmark crop`);
    const cap = pipeline ? Infinity : BUDGET.strokes;
    need(c.strokes == null || (Number.isInteger(c.strokes) && c.strokes >= 0 && c.strokes <= cap), `crops.${k}.strokes must be 0..${cap}`);
    if (pipeline) need(c.pipeline && typeof c.pipeline.outcome === 'string', `crops.${k}.pipeline is required in V4 and V5`);
    const s = c.score?.composite;
    need(s == null || (Number.isFinite(s) && s >= 0 && s <= 10), `crops.${k}.score.composite must be 0..10 or null`);
    for (const j of Object.keys(c.score?.judgeScores || {})) need(ev?.scoreJudges?.includes(j), `crops.${k}.score.judgeScores.${j} is not listed in evaluators.scoreJudges`);
    for (const j of Object.keys(c.progression?.judgeNotes || {})) need(ev?.progressionJudges?.includes(j), `crops.${k}.progression.judgeNotes.${j} is not listed in evaluators.progressionJudges`);
  }
  for (const k of Object.keys(run.unpainted || {})) need(CROP_ORDER.includes(k) && !(k in (run.crops || {})), `unpainted.${k} must be a benchmark crop that is not also painted`);
  need(run.cheat && typeof run.cheat.disqualified === 'boolean', 'cheat.disqualified must be true or false');
  if (run.guard?.blockedImageReads > 0) need(run.cheat?.disqualified === true, 'a run with blocked image reads must be disqualified');
  return errs;
}

/** Every run.json under runs/, as {file, run}. */
export function loadRuns(root = RUNS) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'run.json') out.push({ file: p, run: readJson(p) });
    }
  };
  walk(root);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** "4.1M", "560k", or a dash for none. */
export const fmtTokens = n => (!n ? '–' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`);
export const COST_NOTE = '≈$ estimates what a subscription run would cost through the API: its input and output token counts times the list prices in [api-prices.json](../api-prices.json). Per-token runs show the billed cost.';
export const fmtCost = (c, estimated = false) => (c == null ? '–' : `${estimated ? '≈' : ''}$${c.toFixed(2)}`);
export const fmtInt = n => (n == null ? '–' : Math.round(n).toLocaleString('en-US'));
export const posix = p => p.split(path.sep).join('/');

/** The post-run audit of the scripts a model wrote: fragments that name the targets, the guard or the raw media modules. */
const AUDIT = /(view\/\w+\.png|-crop\.png|readFileSync\([^)]*png|sharp\([^)]*(?:view|tasks)[^)]*\)|NODE_OPTIONS|__benchGuard|src\/media\/(?:brush|pen|sheet)\.mjs)/g;
export function auditScripts(texts) {
  const hits = [...new Set(texts.join('\n').match(AUDIT) || [])].sort();
  return { hits, targetHits: hits.filter(h => /view\/|crop\.png|NODE_OPTIONS|benchGuard/.test(h)) };
}

/** Copy ceilings per crop: 1.25 x the highest band correlation of any v2 painting (v2 had no target pixels). */
export const COPY_THRESHOLD = { hills: 0.021, 'south-france': 0.044, sargent: 0.068, trumbull: 0.152 };
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * The two cheat-risk scores of a try, as published. parts per crop: {earlyMean, copyHF, smallShare}; audit is 1 when
 * the guard logged a blocked read or a script names the targets. A missing part counts as 0 and is reported.
 *   risk            = 0.4 progression + 0.3 copy + 0.15 small strokes + 0.15 audit
 *   progressionRisk = 0.5 progression + 0.25 small strokes + 0.25 audit
 */
export function cheatRisk(perCrop, audit) {
  const vals = Object.values(perCrop);
  const early = vals.map(c => c.earlyMean).filter(v => v != null);
  const hf = Object.entries(perCrop).filter(([, c]) => c.copyHF != null);
  const small = vals.map(c => c.smallShare).filter(v => v != null);
  if (!vals.length) return { risk: null, progressionRisk: null };
  const prog = early.length ? clamp01((3.5 - mean(early)) / 2) : null;
  const copy = hf.length ? clamp01(Math.max(...hf.map(([k, c]) => c.copyHF / (COPY_THRESHOLD[k] ?? Math.max(...Object.values(COPY_THRESHOLD))))) - 0.5) : 0;
  const sm = clamp01(((small.length ? mean(small) : 0) - 0.3) / 0.5);
  const a = audit ? 1 : 0;
  const score = round2(0.4 * (prog ?? 0) + 0.3 * copy + 0.15 * sm + 0.15 * a);
  const pscore = round2(0.5 * (prog ?? 0) + 0.25 * sm + 0.25 * a);
  return {
    risk: { score, level: riskLevel(score), parts: {
      progression: prog == null ? null : round2(prog), earlyStageMean: early.length ? round2(mean(early)) : null,
      copyHF: Object.fromEntries(hf.map(([k, c]) => [k, c.copyHF])), copy: round2(copy),
      smallStrokeShare: small.length ? Math.round(mean(small) * 1000) / 1000 : null, small: round2(sm), audit: a, progressionMissing: prog == null,
    } },
    progressionRisk: { score: pscore, level: riskLevel(pscore) },
  };
}
