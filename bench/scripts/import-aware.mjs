#!/usr/bin/env node
// Import the V4 and V5 tries painted by the aware harness into runs/v4-pipeline and runs/v5-self-study.
//   node bench/scripts/import-aware.mjs <records dir> [--out bench/runs] [--allow-running]
// The records dir holds <model>/<v4|v5>/<subject>/a<n>/ per painting: status.json, score.json, progression.json,
// CHECKPOINTS.jsonl, plan/, plan-final/, feedback/ and render/ (painting.png, stages/, cheat-risk.json, aware/).
// One try in the repo is one model's paintings of every subject for one try number, as in run-format.md.
// Private subjects are never read: only the subjects in v4v5/subjects.json are imported (sf is south-france).
// A V4 try 1 that the harness linked to V5 try 1 is the same session and painting, imported from the V5 record.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { BENCH, RUNS, V2, RUN_SCHEMA, ROUNDS, readJson, writeJson, validateRun, loadModels, mean, round2, riskLevel, posix } from './lib.mjs';
import { thumb, writeStageStrip, STRIP_STAGES, STAGE_H } from './images.mjs';
import { loadSubjects, MODEL_MINUTES } from './pipeline/round45.mjs';
import { pngSize } from './pipeline/plan-args.mjs';

/** Version metadata for the imported V4 and V5 paintings. */
const IMPORTED_VERSIONS = { release: '0.1.0', painterVersion: 'V096', simVersion: '100', judgeVersion: 'J1', commit: null };
const SUBJECT_KEYS = { hills: 'hills', sf: 'south-france', sargent: 'sargent', mittens: 'mittens', trumbull: 'trumbull' };
const ROUND_DIRS = { v4: 'V4', v5: 'V5' };
const DONE = new Set(['scored', 'rendered', 'render-failed', 'plan-refused', 'linked']);
const RUBRIC = 'bench-v3-median5, 5 calls per judge model, median per model';
export const JUDGE_ROUTE_NOTE = 'Judge calls went to Together; later calls went through OpenRouter to zero-data-retention providers. judgeProviders in each painting\'s score and progression lists those calls.';
const PRIVATE_NAMES = (process.env.UNPAINTING_PRIVATE_SUBJECTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const LOCAL_PATH = /(?:file:\/\/)?\/(?:Users|home|private|tmp|opt)\/[^\s"'`)\]]*/g;
const MAX_IMAGE_BYTES = 60 * 1024;

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const src = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
if (!src) { console.error('usage: import-aware.mjs <records dir> [--out bench/runs] [--allow-running]'); process.exit(2); }
const SRC = path.resolve(src), OUT = path.resolve(opt('out', RUNS)), ALLOW_RUNNING = argv.includes('--allow-running');

const exists = f => fs.existsSync(f);
const readIf = f => (exists(f) ? readJson(f) : null);
const lines = f => (exists(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const minutesBetween = (a, b) => (a && b ? Math.max(0, (Date.parse(b.replace(/ P[DS]T$/, '')) - Date.parse(a.replace(/ P[DS]T$/, ''))) / 60000) : null);

/** Text published from a record: local paths replaced. */
function publicText(text, where) {
  if (PRIVATE_NAMES.some(name => text.toLowerCase().includes(name))) throw new Error(`${where} names a private subject; not imported`);
  return text.replace(LOCAL_PATH, '<local path>');
}

/** The attempt folder that holds a painting's records, following a V4 link to its V5 record. */
function attemptOf(model, round, subject, n) {
  const dir = path.join(SRC, model, round, subject, `a${n}`);
  const status = readIf(path.join(dir, 'status.json'));
  if (!status) return null;
  if (status.state !== 'linked') return { dir, status, linkedFrom: null };
  const target = path.join(SRC, model, status.linkedFrom.split('/')[0], subject, `a${n}`);
  return { dir: target, status: readJson(path.join(target, 'status.json')), linkedFrom: status.linkedAttempt ?? status.linkedFrom };
}

/** Judge calls that went through OpenRouter, from every `providers` record in a scorer output: {judge: {provider: calls}}. */
function judgeProviders(record) {
  const out = {};
  const walk = v => {
    if (!v || typeof v !== 'object') return;
    if (v.providers && typeof v.providers === 'object') {
      for (const [judge, byProvider] of Object.entries(v.providers)) {
        out[judge] ??= {};
        for (const [p, n] of Object.entries(byProvider)) out[judge][p] = (out[judge][p] || 0) + n;
      }
    }
    for (const [k, x] of Object.entries(v)) if (k !== 'providers') walk(x);
  };
  walk(record);
  return out;
}

const scoreEntry = s => s && s.composite != null ? {
  composite: s.composite, pm: s.composite_pm ?? null, complete: s.complete ?? null,
  visionOverall: s.breakdown?.vision_overall ?? null, classic: s.breakdown?.classic_mean ?? null,
  criteria: s.criteria ?? null, judgeScores: s.judges ?? {}, callsPerModel: s.calls_per_model ?? s.callsPerModel ?? null,
  judgeProviders: judgeProviders(s),
} : null;

const progressionEntry = p => p && p.available !== false && p.stages ? {
  stages: p.stages, earlyMean: p.earlyMean ?? null, mean: p.mean ?? null, humanOrderVotes: p.humanOrderVotes ?? 0,
  judgesN: p.judgesN ?? (p.panel || []).length, tells: p.tells ?? {}, tellsText: p.tellsText ?? {},
  judges: p.panel ?? [], judgeNotes: Object.fromEntries(Object.entries(p.notes || {}).map(([j, t]) => [j, publicText(t, 'progression note')])),
  judgeErrors: p.judgeErrors && Object.keys(p.judgeErrors).length ? p.judgeErrors : null, judgeProviders: judgeProviders(p),
} : null;

/** Tokens and estimated API-equivalent cost of one session, priced like the V1 to V3 records. */
function sessionUsage(model, status, prices) {
  const parts = Object.values(status.extra?.usage || {}).filter(u => u && Object.keys(u).length);
  if (!parts.length) return null;
  const sum = k => parts.reduce((a, u) => a + (u[k] || 0), 0);
  const usage = model.runner === 'codex'
    ? { input: sum('input_tokens') - sum('cached_input_tokens'), cachedInput: sum('cached_input_tokens'), output: sum('output_tokens') }
    : { input: sum('input_tokens'), cacheWrite1h: sum('cache_creation_input_tokens'), cacheWrite5m: 0, cacheRead: sum('cache_read_input_tokens'), output: sum('output_tokens') };
  return usage;
}
const addUsage = (a, b) => (!b ? a : !a ? { ...b } : Object.fromEntries(Object.keys(b).map(k => [k, (a[k] || 0) + b[k]])));
const priceOf = (usage, rates) => (usage && rates ? +Object.entries(usage).reduce((s, [k, n]) => s + n * rates[k] / 1e6, 0).toFixed(3) : null);

/** The plan folder for one painting: the plan as painted, PLAN.md, CHECKPOINTS.jsonl and, in V5, FEEDBACK.md and SELF-REVIEW.md. */
function writePlan(a, planOut) {
  fs.rmSync(planOut, { recursive: true, force: true });
  fs.mkdirSync(planOut, { recursive: true });
  const plan = ['plan-final', 'plan'].map(d => path.join(a.dir, d)).find(exists);
  const put = (name, text) => fs.writeFileSync(path.join(planOut, name), publicText(text, `${posix(path.relative(SRC, a.dir))}/${name}`));
  if (plan) {
    for (const f of fs.readdirSync(plan)) {
      const p = path.join(plan, f);
      if (!fs.statSync(p).isFile()) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (f.endsWith('-lines.json')) fs.writeFileSync(path.join(planOut, f + '.gz'), zlib.gzipSync(Buffer.from(publicText(text, f))));
      else put(f, text);
    }
  }
  if (exists(path.join(a.dir, 'CHECKPOINTS.jsonl'))) put('CHECKPOINTS.jsonl', fs.readFileSync(path.join(a.dir, 'CHECKPOINTS.jsonl'), 'utf8'));
  if (exists(path.join(a.dir, 'feedback', 'FEEDBACK.md'))) put('FEEDBACK.md', fs.readFileSync(path.join(a.dir, 'feedback', 'FEEDBACK.md'), 'utf8'));
  return {
    feedback: exists(path.join(planOut, 'FEEDBACK.md')) ? 'FEEDBACK.md' : null,
    selfReview: exists(path.join(planOut, 'SELF-REVIEW.md')) ? 'SELF-REVIEW.md' : null,
  };
}

/** WebP at most 300 px wide and under 60 KB. */
async function finalImage(png, dst) {
  await thumb(png, dst);
  for (let q = 70; fs.statSync(dst).size > MAX_IMAGE_BYTES && q >= 30; q -= 10) await sharp(png).resize({ width: 300 }).webp({ quality: q, effort: 6 }).toFile(dst);
}

/** The pipeline record of one painting, in the shape round45.mjs writes. */
function pipelineOf(a, crop, outcome, planFiles) {
  const ck = lines(path.join(a.dir, 'CHECKPOINTS.jsonl'));
  const count = k => ck.filter(r => r.kind === k).length;
  const ex = a.status.extra || {};
  const result = (() => { const r = path.join(a.dir, 'render'); const f = exists(r) && fs.readdirSync(r).find(n => /-result\.json$/.test(n) && !/segment/.test(n)); return f ? readJson(path.join(r, f)) : null; })();
  const segments = readIf(path.join(a.dir, 'render', 'aware', 'segments.json')) || [];
  const end = ck.findLast(r => r.kind === 'session-end');
  const modelMinutes = end?.modelMinutes ?? ck.at(-1)?.modelMinutes ?? null;
  const variant = ['plan-final', 'plan'].map(d => path.join(a.dir, d, 'variant.txt')).find(exists);
  const failures = (a.status.failures || []).map(f => (typeof f === 'string' ? { reason: publicText(f, 'failure') } : { ...f, reason: publicText(String(f.reason ?? ''), 'failure') }));
  const repairTurns = [];
  if (ex.exits?.repair != null) repairTurns.push(ex.renderRefusal ? 'painter refused' : 'plan refused');
  return {
    ...(a.status.extra?.cpuRerender ? { renderBackend: 'cpu', renderNote: 'rendered on CPU after the run' } : {}),
    outcome, paintedBy: count('start') ? 'the model' : ex.paintedBy ?? null,
    plan: `${crop}-plan`, tokens: variant ? fs.readFileSync(variant, 'utf8').trim() : null,
    layering: result?.layering ? { applied: result.layering.applied, skipped: result.layering.skipped } : null,
    starts: count('start'), looks: count('look'), revisions: count('revise'), revisionsRefused: count('revise-refused'),
    modelMinutes, cappedAtModelTime: modelMinutes != null && modelMinutes >= MODEL_MINUTES, sessionEnd: ex.sessionEnd ?? end?.why ?? null,
    turns: Object.entries(ex.exits || {}).map(([k, exit], i) => ({ k: i + 1, repair: k !== 'initial', exit })), repairTurns,
    optionCheck: result?.optionCheck ?? null, droppedPassages: null,
    paintExit: result?.paintExit ?? null, segments: segments.length || (result ? 1 : 0),
    failure: outcome === 'painted' ? null : { failures },
    renderRefusal: ex.renderRefusal ? publicText(ex.renderRefusal, 'render refusal') : null, renderRefusalReopened: ex.renderRefusalReopened ?? null,
    paintRestarts: ex.paintRestarts ?? 0, machineLost: count('machine-lost'),
    feedback: planFiles.feedback && `${crop}-plan/FEEDBACK.md`, selfReview: planFiles.selfReview && `${crop}-plan/SELF-REVIEW.md`,
    selfReviewModelMinute: null, feedbackNote: ex.feedbackNote ?? null,
    linkedFrom: a.linkedFrom ? `${a.linkedFrom.replace(/^\w+-v5-[\w-]+-a(\d+)$/, 'V5 try $1')}: the same session and painting` : null,
  };
}

/** One painting of one try: writes its files and returns {entry} or {unpainted}, plus its session numbers. */
async function importPainting({ a, crop, spec, tryDir }) {
  const state = a.status.state;
  const painting = path.join(a.dir, 'render', 'painting.png');
  const nativeScore = readIf(path.join(a.dir, 'score-native.json'));
  const score = nativeScore ?? readIf(path.join(a.dir, 'score.json'));
  const outcome = ['scored', 'rendered'].includes(state) && score?.composite != null && exists(painting) ? 'painted' : state === 'plan-refused' ? 'plan-refused' : 'render-failed';
  const planFiles = writePlan(a, path.join(tryDir, `${crop}-plan`));
  const pipeline = pipelineOf(a, crop, outcome, planFiles);
  const t = a.status.times || {};
  const session = { minutes: minutesBetween(t.plannerStart, t.plannerEnd), modelMinutes: pipeline.modelMinutes };
  if (outcome !== 'painted') return { unpainted: { pipeline }, session };
  await finalImage(painting, path.join(tryDir, `${crop}.webp`));
  const stageFiles = STRIP_STAGES.map(p => path.join(a.dir, 'render', 'stages', `stage-${String(p).padStart(3, '0')}.jpg`));
  const stages = stageFiles.every(exists)
    ? await writeStageStrip(await Promise.all(stageFiles.map(f => sharp(f).resize({ height: STAGE_H }).png().toBuffer())), path.join(tryDir, `${crop}-stages.webp`))
    : null;
  const risk = readIf(path.join(a.dir, 'render', 'cheat-risk.json'));
  const prog = readIf(path.join(a.dir, 'progression.json'));
  const segs = readIf(path.join(a.dir, 'render', 'aware', 'segments.json')) || [];
  const [tw, th] = pngSize(path.join(V2, 'targets', `${crop}.png`));
  return {
    session,
    entry: {
      seed: 0, sheet: { W: spec.width, H: Math.round(spec.width * th / tw), mmPerCell: +(spec.sheetmm / spec.width).toFixed(4) }, strokeLog: null,
      strokes: prog?.totalStrokes ?? risk?.strokes ?? null, strokesBasis: prog?.totalStrokes != null ? 'brush strokes plus pen lines' : 'brush strokes',
      minutes: segs.length ? round2(segs.reduce((s, x) => s + (x.seconds || 0), 0) / 60) : null,
      smallShare: risk?.smallShare ?? null, shortStrokes: null, dotStrokes: null, copyHF: null,
      images: { final: `${crop}.webp`, stages }, painterNote: a.status.extra?.cpuRerender ? 'rendered on CPU after the run' : null,
      score: { ...scoreEntry(score), ...(nativeScore ? { protocol: 'native', scoreInput: { w: tw, h: th, from: nativeScore.scoreInput?.sourceSize ?? nativeScore.scoreInput?.from, resize: "Lanczos to the target's native size" } } : {}) }, progression: progressionEntry(prog),
      cheatRisk: risk ? { score: risk.risk, level: risk.level, parts: risk.parts, hfCorr: risk.hfCorr ?? null, hfCeiling: risk.hfCeiling ?? null, flags: risk.flags ?? [], guardViolations: risk.guard?.violations ?? 0 } : null,
      pipeline,
    },
  };
}

/** The try's cheat-risk: the highest painting, from cheat-risk.json. */
function tryRisk(crops) {
  const rs = Object.entries(crops).filter(([, c]) => c.cheatRisk);
  if (!rs.length) return { risk: null, progressionRisk: null };
  const [k, top] = rs.sort((x, y) => y[1].cheatRisk.score - x[1].cheatRisk.score)[0];
  const prog = Math.max(...rs.map(([, c]) => c.cheatRisk.parts?.progression ?? 0));
  return {
    risk: { score: top.cheatRisk.score, level: top.cheatRisk.level, basis: `highest painting (${k}), from the painter's cheat-risk record`, parts: top.cheatRisk.parts },
    progressionRisk: { score: round2(prog), level: riskLevel(prog), basis: 'highest progression part of any painting' },
  };
}

async function importTry({ model, roundKey, n, subjects, prices }) {
  const round = ROUNDS.find(r => r.id === ROUND_DIRS[roundKey]);
  const attempts = Object.entries(SUBJECT_KEYS).map(([s, crop]) => ({ crop, a: attemptOf(model.key, roundKey, s, n) })).filter(x => x.a);
  if (!attempts.length) return null;
  const notRun = attempts.filter(x => x.a.status.state === 'not-run');
  const running = attempts.filter(x => !DONE.has(x.a.status.state) && x.a.status.state !== 'not-run');
  if (running.length && !ALLOW_RUNNING) throw new Error(`${model.key} ${roundKey} try ${n}: still ${running.map(x => `${x.crop} ${x.a.status.state}`).join(', ')}`);
  const tryDir = path.join(OUT, round.dir, model.key, String(n));
  fs.rmSync(tryDir, { recursive: true, force: true });
  fs.mkdirSync(tryDir, { recursive: true });
  const crops = {}, unpainted = {};
  let usage = null, wall = 0, modelMin = 0, guardViolations = 0;
  const settled = attempts.filter(x => DONE.has(x.a.status.state));
  for (const { crop, a } of settled) {
    const r = await importPainting({ a, crop, spec: subjects[crop], tryDir });
    if (r.entry) crops[crop] = r.entry; else unpainted[crop] = r.unpainted;
    usage = addUsage(usage, sessionUsage(model, a.status, prices));
    wall += r.session.minutes || 0; modelMin += r.session.modelMinutes || 0;
    guardViolations += r.entry?.cheatRisk?.guardViolations || 0;
  }
  const order = Object.values(SUBJECT_KEYS).filter(c => settled.some(x => x.crop === c) || notRun.some(x => x.crop === c));
  const scores = Object.values(crops).map(c => c.score?.composite).filter(v => v != null);
  const complete = scores.length === order.length;
  const judges = pick => [...new Set(Object.values(crops).flatMap(pick))].sort();
  const routed = Object.values(crops).some(c => Object.keys(c.score?.judgeProviders || {}).length || Object.keys(c.progression?.judgeProviders || {}).length);
  const dq = guardViolations > 0;
  const { risk, progressionRisk } = tryRisk(crops);
  const tokens = usage ? Object.values(usage).reduce((s, v) => s + v, 0) : null;
  const run = {
    schema: RUN_SCHEMA, benchmark: 'unpaint-bench', protocol: 'v2', round: round.id, ...IMPORTED_VERSIONS,
    painter: { key: model.key, name: model.name, id: model.id, effort: model.effort, runner: model.runner },
    planner: null,
    evaluators: {
      scoreJudges: judges(c => Object.keys(c.score?.judgeScores || {})), progressionJudges: judges(c => c.progression?.judges || []),
      providers: routed ? ['together', 'openrouter (zero data retention)'] : ['together'], note: routed ? JUDGE_ROUTE_NOTE : null,
    },
    try: n,
    settings: {
      mode: 'gentle', strokeBudget: null, minutesPerCrop: null, sessionCapMin: MODEL_MINUTES, modelMinutesCap: MODEL_MINUTES, lookBudget: null,
      selfView: 'gentle', targetGuard: 'gentle', crops: order, learnsBetweenTries: round.learning,
      paintWidth: Object.fromEntries(order.map(c => [c, subjects[c].width])), painter: 'tools/paint-plate.mjs', machine: 'cloud GPU (NVIDIA L40S)',
    },
    session: {
      minutes: round2(wall), modelMinutes: round2(modelMin), tokens, costUSD: null,
      estCostUSD: priceOf(usage, prices[model.id]), usage,
    },
    guard: { blockedImageReads: guardViolations, kitRejections: 0, auditHits: [] },
    crops, ...(Object.keys(unpainted).length ? { unpainted } : {}),
    score: {
      rubric: RUBRIC, status: scores.length ? 'scored' : 'unscored',
      composite: complete ? round2(mean(scores)) : null, partialComposite: !complete && scores.length ? round2(mean(scores)) : null,
      cropsScored: scores.length, complete,
    },
    cheat: {
      disqualified: dq, readTargetPixels: dq, reason: dq ? `${guardViolations} blocked target read(s) by the painter` : null,
      risk, progressionRisk, review: [risk?.level, progressionRisk?.level].includes('high') ? { status: 'flagged', finding: null } : null,
    },
    complete: Object.keys(crops).length === order.length,
    ...(running.length || notRun.length ? { notPainted: Object.fromEntries([
      ...notRun.map(x => [x.crop, publicText(x.a.status.extra?.note ?? 'not run', 'note')]),
      ...running.map(x => [x.crop, `still ${x.a.status.state} when imported`])]) } : {}),
  };
  const errs = validateRun(run);
  if (errs.length) throw new Error(`${posix(path.relative(BENCH, tryDir))}: ${errs.join('; ')}`);
  writeJson(path.join(tryDir, 'run.json'), run);
  return run;
}

const models = loadModels(), subjects = loadSubjects(), prices = readJson(path.join(BENCH, 'api-prices.json')).models;
const summary = [];
for (const model of models) for (const roundKey of Object.keys(ROUND_DIRS)) for (let n = 1; n <= 3; n++) {
  const run = await importTry({ model, roundKey, n, subjects, prices });
  if (run) summary.push(`${run.round} ${model.key} ${n}: ${Object.keys(run.crops).length} painted, ${Object.keys(run.unpainted || {}).length} not, ${run.score.composite ?? run.score.partialComposite ?? '–'}`);
}
console.log(summary.join('\n'));
console.log(`import-aware: ${summary.length} tries -> ${posix(path.relative(process.cwd(), OUT))}`);
