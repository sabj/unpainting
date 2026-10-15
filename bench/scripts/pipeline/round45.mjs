// V4 and V5: the model writes a plan, recipe tokens and painter settings in a clean worktree, then paints it with the
// painter (tools/paint-plate.mjs) on this machine, stopping where it likes to look at its own sheet and revise what is
// not painted yet. One target per session, one session per try. V5 tries after the first get FEEDBACK.md on the
// previous try of the same target and write SELF-REVIEW.md before they read it.
//
// Per try: run.json and, per painted target, <crop>.webp, <crop>-stages.webp and <crop>-plan/ (the plan as painted at
// the end, PLAN.md, CHECKPOINTS.jsonl, and in V5 FEEDBACK.md and SELF-REVIEW.md). Raw outputs go to bench/work/raw/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { BENCH, REPO, RUN_SCHEMA, VERSION_STAMP, V2, readJson, writeJson, validateRun, posix } from '../lib.mjs';
import { turnCommand, codexThread, agyConversation, usage, peekUsage } from '../runners.mjs';
import { thumb, stageStrip } from '../images.mjs';
import { makeWorktree, keepScripts, runTurn, minutes } from './harness.mjs';
import { PaintSession, planSnapshot, variantIn } from './session.mjs';
import { checkPlan } from './check.mjs';
import { pngSize } from './plan-args.mjs';
import { writeFeedback } from './feedback.mjs';

import { benchmarkProfile, profileSubject } from '../profiles.mjs';
import { tokenStop } from '../budget.mjs';

const V45 = path.join(BENCH, 'v4v5');
const PIPE = path.join(BENCH, 'scripts', 'pipeline');
const REPAIR_MINUTES = 60;   // wall-clock safety limits of a session and of a repair turn
const PROMPT = 'Read bench/TASK.md and do the task: prepare your plan, then paint it with bench/paint.sh, looking at it as you like.';
const LITE_PROMPT = 'Read bench/TASK.md, prepare the plan deliverables and stop. This is planning only: do not run checks or the painter; the harness does both after your process exits.';
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const STAGE_PCT = [10, 25, 50, 75, 100];
const SEEDED = /^bench\/(TASK\.md|frozen\.json|TOKENS\.md|PAINT\.md|check\.(sh|mjs)|plan-args\.mjs|paint\.(sh|mjs)|dry-planner\.mjs|skills\/|example\/|tools\/|paint-io\/|looks\/|feedback\/|check-out\/|plan\/target\.png)|^node_modules$/;

export const loadSubjects = () => readJson(path.join(V45, 'subjects.json')).subjects;

// What the brief says about unread settings and dropped passages: kept as notes, or failures under --strict-verdict.
const VERDICT_TEXT = {
  notes: { UNREAD_OPTION: 'is recorded against your plan in the result', AFTER_PAINTING: 'Recorded against your plan after painting (the painting still counts): passages that end up with\nno brush path, a setting nobody read.' },
  strict: { UNREAD_OPTION: 'fails the painting', AFTER_PAINTING: 'Also failed after painting (no score): passages that end\nup with no brush path, a setting nobody read.' },
};

/** The brief for one try: TASK.md with the round's rules and, in V5 after try 1, the feedback section. */
export function renderTask({ round, n, tries, spec, strictVerdict = false, profile = null }) {
  const bf = f => fs.readFileSync(path.join(V45, f), 'utf8').trim();
  const v5 = round.id === 'V5';
  let rules = !v5 ? bf('round-V4.md').replace('Each of the three V4 tries', `Each of the ${WORDS[tries] ?? tries} V4 tries`)
    : n === 1 ? bf('round-V5-first.md').replace('try 1 of 3', `try 1 of ${tries}`) : bf('round-V5-next.md').replace('{TRY}', String(n)).replace(` of 3:`, ` of ${tries}:`);
  const feedback = v5 && n > 1 ? bf('feedback-section.md').replace('{PREV}', String(n - 1)) : '';
  const vals = { ...VERDICT_TEXT[strictVerdict ? 'strict' : 'notes'], SUBJECT_NAME: spec.name, ROUND: round.id, TRY: String(n), TRIES: String(tries), TASK_STYLE: spec.taskStyle, WIDTH: String(spec.width), SHEETMM: String(+spec.sheetmm.toFixed(2)) };
  let t = fs.readFileSync(path.join(V45, 'TASK.md'), 'utf8').replace('{ROUND_RULES}', rules).replace('{FEEDBACK}', feedback);
  for (const [k, v] of Object.entries(vals)) t = t.replaceAll(`{${k}}`, v);
  if (profile?.planOnly) {
    t = t.replace(/You are preparing[\s\S]*?## The task/, `Prepare one painting plan, then stop. This is the lite planning screen: at most ${profile.modelMinutes} minutes. The harness checks and renders after your process exits. Do not start the painter, run checks or wait for images.\n\n## The task`);
    t = t.replace(/## Before you paint[\s\S]*/, '## Deliver and stop\n\nSave bench/plan/config.json, bench/variant.txt and bench/PLAN.md, plus any drawing files and extra-args.json you choose. The harness makes one admission check and one render; there are no repair turns or model reviews. The target, physical size, painter and guards remain fixed.\n');
  }
  return t;
}

/** The model's worktree: the brief, the target, the check and paint commands, the skills, the tools and the example. */
function seed({ ws, crop, spec, round, n, tries, dry, strictVerdict, profile }) {
  const b = path.join(ws, 'bench');
  for (const d of ['plan', 'paint-io', 'looks', 'tools']) fs.mkdirSync(path.join(b, d), { recursive: true });
  fs.copyFileSync(path.join(V2, 'targets', `${crop}.png`), path.join(b, 'plan', 'target.png'));
  writeJson(path.join(b, 'frozen.json'), { subject: crop, ...spec, targetPixels: pngSize(path.join(b, 'plan', 'target.png')) });
  fs.writeFileSync(path.join(b, 'TASK.md'), renderTask({ round, n, tries, spec, strictVerdict, profile }));
  for (const f of ['check.sh', 'TOKENS.md', 'paint.sh', 'paint.mjs', 'PAINT.md']) fs.copyFileSync(path.join(V45, f), path.join(b, f));
  for (const f of ['check.mjs', 'plan-args.mjs']) fs.copyFileSync(path.join(PIPE, f), path.join(b, f));
  if (profile?.planOnly) {
    fs.writeFileSync(path.join(b, 'check.mjs'), "console.error('Lite: admission runs once, after the model exits. Save your plan and stop.'); process.exitCode = 2;\n");
    fs.writeFileSync(path.join(b, 'PAINT.md'), 'Lite planning only. Save the deliverables listed in TASK.md, then stop. The harness runs the check and painter after your process exits. No looking, waiting or repairs.\n');
  }
  for (const f of fs.readdirSync(path.join(V45, 'tools'))) fs.copyFileSync(path.join(V45, 'tools', f), path.join(b, 'tools', f));
  fs.cpSync(path.join(V45, 'example'), path.join(b, 'example'), { recursive: true });
  fs.cpSync(path.join(V2, 'skill', 'skills'), path.join(b, 'skills'), { recursive: true });
  if (dry && profile?.planOnly) {
    fs.writeFileSync(path.join(b, 'dry-planner.mjs'), `import fs from 'node:fs';
fs.writeFileSync('bench/plan/config.json',JSON.stringify({subject:'dry',name:'Dry lite plan',styleSelection:{style:'ink-and-wash',reason:'offline fixture'},families:[],reserves:[]}));
fs.writeFileSync('bench/variant.txt','region_w13_lay2_noslane');
fs.writeFileSync('bench/PLAN.md','One fixed offline plan. No model calls, checks or self-review.');
`);
  } else if (dry) fs.copyFileSync(path.join(PIPE, 'dry-planner.mjs'), path.join(b, 'dry-planner.mjs'));
}

/** Copy a file, gzipping drawing paths (they can be large). */
function keepPlanFile(src, destDir) {
  const name = path.basename(src);
  if (name.endsWith('-lines.json')) fs.writeFileSync(path.join(destDir, name + '.gz'), zlib.gzipSync(fs.readFileSync(src)));
  else fs.copyFileSync(src, path.join(destDir, name));
}

/** Previous V5 try of this target, from its run.json: {n, outcome, entry, raw, out}. */
function previousTry({ outRoot, round, model, n, crop }) {
  const f = path.join(outRoot, round.dir, model.key, String(n - 1), 'run.json');
  if (!fs.existsSync(f)) throw new Error(`V5 try ${n} needs try ${n - 1} first (${f})`);
  const run = readJson(f), entry = run.crops[crop] ?? run.unpainted?.[crop] ?? {};
  const outcome = run.crops[crop] ? (entry.score?.composite != null ? 'scored' : run.score.status === 'dry-run' ? 'dry-run' : 'unscored') : entry.pipeline?.outcome ?? 'no-plan';
  const raw = path.join(BENCH, run.raw);
  return { n: n - 1, outcome, entry, raw: path.join(raw, crop), out: path.join(raw, 'out', crop) };
}

/** One try of one target: the model's session, its repair turns, the painting and the record. */
async function paintTarget({ model, round, n, tries, crop, spec, rawTry, prev, dry, gpu, log, strictVerdict, profile }) {
  const raw = path.join(rawTry, crop);
  fs.mkdirSync(raw, { recursive: true });
  const target = path.join(V2, 'targets', `${crop}.png`);
  const { ws, cleanup } = makeWorktree();
  const record = { turns: [], repairTurns: [], tokens: 0, costUSD: 0, wallSeconds: 0, usageComplete: true, costComplete: true, budgetStopped: false };
  const targetStarted = Date.now();
  let session = null;
  try {
    seed({ ws, crop, spec, round, n, tries, dry, strictVerdict, profile });
    let feedbackFiles = null;
    if (prev) feedbackFiles = await writeFeedback({ dest: path.join(ws, 'bench', 'feedback'), prev, prevRaw: prev.raw, prevOut: prev.out, target });
    session = new PaintSession({ repo: REPO, ws, raw, spec, target, modelMinutes: profile.modelMinutes, gpu, log, planOnly: profile.planOnly });
    const sessionId = ['claude', 'muse'].includes(model.runner) ? crypto.randomUUID() : null;
    let thread = null, selfReviewAt = null;
    const selfReview = path.join(ws, 'bench', 'SELF-REVIEW.md');
    const turn = async (text, repair) => {
      const k = record.turns.length + 1, events = path.join(raw, `events-${k}.jsonl`), stderr = path.join(raw, `stderr-${k}.log`);
      const c = dry ? { cmd: process.execPath, args: ['bench/dry-planner.mjs', repair ? 'repair' : 'start'] }
        : turnCommand(model, { ws, raw, text, sessionId: sessionId ?? thread, resume: repair && model.runner !== 'together', turn: k, briefFile: path.join(ws, 'bench', 'TASK.md'), logFile: events, minutes: repair ? REPAIR_MINUTES : profile.wallMinutes, done: 'any', budget: profile });
      let finT = null;
      const r = await runTurn(c, {
        cwd: ws, events, stderr, capMs: (repair ? REPAIR_MINUTES : profile.wallMinutes) * 60000, killGraceMs: profile.planOnly ? 1000 : 20000, cleanupGroup: profile.planOnly,
        tick: ({ stop }) => {
          session.tick();
          if (profile.planOnly && session.planReady) session.end('lite plan delivered');
          if (!dry && profile.tokenWatchLimit && !session.ended) {
            const observed = peekUsage(model.runner, events);
            const why = tokenStop(observed.tokens, profile.tokenWatchLimit);
            if (why) { session.capped = true; session.end(why); }
          }
          if (selfReviewAt === null && fs.existsSync(selfReview)) selfReviewAt = +(session.modelS() / 60).toFixed(2);
          if (!session.ended && session.overTime()) { session.end(`${profile.modelMinutes} minutes of your own time are up`); session.capped = true; }
          if (!session.ended && session.paintingOver()) { finT ??= Date.now(); if (Date.now() - finT > (dry ? 2000 : 300000)) session.end('the painting finished five minutes ago'); } else finT = null;
          if (session.ended) stop(session.ended);
        },
      });
      if (model.runner === 'codex' && !thread) thread = codexThread(events);
      if (model.runner === 'agy' && !thread) thread = agyConversation(events);
      const u = dry ? { tokens: null, costUSD: null } : usage(model.runner, events);
      // Interrupted requests may not have emitted usage. Their reported counts are lower bounds, never totals.
      const cleanExit = r.code === 0 && !r.killed;
      record.usageComplete &&= cleanExit && u.tokens != null; record.costComplete &&= cleanExit && u.costUSD != null;
      record.budgetStopped ||= r.killed;
      record.tokens += u.tokens || 0; record.costUSD += u.costUSD || 0; record.wallSeconds += r.seconds;
      record.turns.push({ k, repair, exit: r.code, seconds: Math.round(r.seconds), stoppedBy: r.reason });
      if (profile.planOnly) {
        session.capped ||= r.killed && !session.planReady; session.end(r.reason ?? 'planning process exited');
        session.endedModelS = record.wallSeconds; // actual CLI exit, excluding descendant cleanup and later rendering
      }
      await session.settle();
      return r;
    };
    await turn(profile.planOnly ? LITE_PROMPT : PROMPT, false);
    let outcome = null, paintedBy = null, refusal = null;
    const repairAllowed = () => !session.capped && record.repairTurns.length < profile.repairTurns;
    const repair = async (why, msg) => { record.repairTurns.push(why); await turn(msg, true); };
    const harnessCheck = async () => {
      const dir = path.join(raw, 'checks', 'final'); fs.rmSync(dir, { recursive: true, force: true });
      const snap = planSnapshot(ws, path.join(dir, 'plan'));
      const chk = await checkPlan({ repo: REPO, spec, planDir: snap, variant: variantIn(snap), target, work: path.join(dir, 'work'), timeoutMs: spec.checkTimeoutMs ?? 900000 });
      writeJson(path.join(dir, 'check.json'), { ok: chk.ok, failures: chk.failures, layering: chk.layering, palette: chk.palette });
      return { chk, snap };
    };
    // The session ended without a painting: check the plan files as they are and paint them without stops. One repair
    // turn (the same session) is given for a missing or refused plan while the model has time.
    const finalize = async () => {
      if (!fs.existsSync(path.join(ws, 'bench', 'plan', 'config.json')) && repairAllowed()) {
        await repair('no plan', 'The harness check refused your preparation: no plan was written (bench/plan/config.json is missing), so nothing can be painted.\n'
          + 'Write every deliverable listed under "What you deliver" in bench/TASK.md, run `bash bench/check.sh` yourself until it ends with ADMITTED, then stop.');
        if (session.started) return;
      }
      if (!fs.existsSync(path.join(ws, 'bench', 'plan', 'config.json'))) { outcome = 'no-plan'; refusal = ['the session ended without writing bench/plan/config.json']; return; }
      let { chk, snap } = await harnessCheck();
      if (!chk.ok && repairAllowed()) {
        await repair('plan refused', `The harness check refused your preparation:\n${chk.refusal.join('\n')}\nFix only what is needed, run \`bash bench/check.sh\` yourself until it prints ok, then stop. (Or start the painting yourself with \`bash bench/paint.sh start\`.)`);
        if (session.started) return;
        ({ chk, snap } = await harnessCheck());
      }
      if (!chk.ok) { outcome = 'plan-refused'; refusal = chk.refusal; return; }
      session.planHash = null;
      session.beginPainting(snap, chk, 'end');
      paintedBy = 'harness (no painting started in the session): no stops';
    };
    if (!session.started) await finalize();
    if (session.started) {
      paintedBy ??= 'the model';
      session.end(session.ended ?? 'the session ended');
      await session.finish();
      // the painter refused the plan at full size after the session: one chance to fix it (a repair turn)
      const p = session.painting;
      if (p.state === 'failed' && p.planningRefused && session.restarts < 1 && repairAllowed()) {
        session.reopen();
        await repair('painter refused', `The painter refused your plan when it was painted at full size: ${p.planningRefused}\nNothing was painted. This is your one chance to fix the plan: change what is needed, run \`bash bench/check.sh\` yourself until it ends with ADMITTED, then start and watch the painting with \`bash bench/paint.sh start\` as before.`);
        if (!session.started) {
          const { chk, snap } = await harnessCheck();
          if (chk.ok) { session.restarts = Math.max(session.restarts, 1); session.beginPainting(snap, chk, 'end'); paintedBy = 'harness after the repair turn: no stops'; }
          else { outcome = 'plan-refused'; refusal = chk.refusal; }
        }
        if (session.started) { session.end(session.ended ?? 'the session ended'); await session.finish(); }
      }
    }
    record.totalSeconds = (Date.now() - targetStarted) / 1000;
    return await collect({ crop, spec, raw, rawTry, ws, session, record, outcome, paintedBy, refusal, feedbackFiles, selfReviewAt, strictVerdict });
  } finally {
    if (session?.painting) session.painting.kill();
    keepScripts(ws, path.join(raw, 'scripts'), SEEDED);
    for (const f of ['PLAN.md', 'SELF-REVIEW.md', 'variant.txt']) if (fs.existsSync(path.join(ws, 'bench', f))) fs.copyFileSync(path.join(ws, 'bench', f), path.join(raw, f));
    if (fs.existsSync(path.join(ws, 'bench', 'feedback'))) fs.cpSync(path.join(ws, 'bench', 'feedback'), path.join(raw, 'feedback'), { recursive: true });
    cleanup();
  }
}

/**
 * The painting's outputs for the scorer and the try folder, and its record. A finished painting with only notes (unread
 * settings, dropped passages) is painted and collected; strictVerdict makes those notes fail it.
 */
export async function collect({ crop, spec, raw, rawTry, ws, session, record, outcome, paintedBy, refusal, feedbackFiles, selfReviewAt, strictVerdict = false }) {
  const p = session.painting, v = p && ['done', 'failed'].includes(p.state) ? p.verdict({ strict: strictVerdict }) : null;
  if (p) {
    const last = p.segments.at(-1);
    fs.rmSync(path.join(raw, 'plan-final'), { recursive: true, force: true });
    fs.cpSync(last.planDir, path.join(raw, 'plan-final'), { recursive: true });
    if (!outcome) outcome = v.exit === 0 ? 'painted' : p.planningRefused ? 'plan-refused' : 'render-failed';
  }
  const stopsRows = fs.existsSync(session.ckpt) ? fs.readFileSync(session.ckpt, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const count = k => stopsRows.filter(r => r.kind === k).length;
  const text = p ? fs.readFileSync(p.segments.at(-1).log, 'utf8') : '';
  const statsFile = p && path.join(p.out, 'stroke-stats.json');
  const strokeStats = statsFile && fs.existsSync(statsFile) ? readJson(statsFile) : null;
  const strokes = Number([...text.matchAll(/^marks: (\d+) strokes/gm)].at(-1)?.[1] ?? strokeStats?.counts?.paint ?? NaN);
  const guard = p && fs.existsSync(path.join(p.out, 'target-guard.json')) ? readJson(path.join(p.out, 'target-guard.json')) : null;
  const backendFile = p && path.join(p.out, 'backend.json');
  const backend = backendFile && fs.existsSync(backendFile) ? readJson(backendFile) : null;
  const pipeline = {
    renderBackend: backend?.backend ?? backend?.renderBackend ?? null,
    outcome, paintedBy, tokens: variantIn(p ? p.segments.at(-1).planDir : path.join(ws, 'bench')),
    starts: count('start'), looks: count('look'), revisions: count('revise'), revisionsRefused: count('revise-refused'),
    modelMinutes: +(session.modelS() / 60).toFixed(1), cappedAtModelTime: Boolean(session.capped), sessionEnd: session.ended,
    repairTurns: record.repairTurns, turns: record.turns, layering: v?.layering ? { applied: v.layering.applied, skipped: v.layering.skipped } : null,
    optionCheck: v?.optionCheck ?? null, notes: v?.notes ?? [], strictVerdict, droppedPassages: v ? Number([...text.matchAll(/(\d+) passages yielded no brush path/g)].at(-1)?.[1] ?? 0) : null,
    paintExit: p ? p.segments.at(-1).exit : null, segments: p ? p.segments.length : 0,
    warnings: v?.warnings?.length ? v.warnings : undefined,
    failure: outcome === 'painted' ? null : { failures: v?.failures?.length ? v.failures : (refusal ?? []).map(reason => ({ reason })) },
    feedback: feedbackFiles ? 'FEEDBACK.md' : null, selfReview: fs.existsSync(path.join(raw, 'SELF-REVIEW.md')) || fs.existsSync(path.join(ws, 'bench', 'SELF-REVIEW.md')) ? 'SELF-REVIEW.md' : null,
    selfReviewModelMinute: selfReviewAt,
    modelSessionSeconds: record.wallSeconds, elapsedSeconds: record.totalSeconds ?? null,
    renderSeconds: p ? p.segments.reduce((a, s) => a + (s.seconds || 0), 0) : 0,
    usageComplete: record.usageComplete ?? false, costComplete: record.costComplete ?? false, budgetStopped: record.budgetStopped ?? false,
  };
  const painted = outcome === 'painted' && fs.existsSync(path.join(p.out, 'painting.png'));
  const out = path.join(rawTry, 'out', crop), frames = path.join(out, 'frames');
  if (painted) {
    fs.mkdirSync(frames, { recursive: true });
    fs.copyFileSync(path.join(p.out, 'painting.png'), path.join(out, 'final.png'));
    for (const pct of STAGE_PCT) {
      const jpg = path.join(p.out, 'stages', `stage-${String(pct).padStart(3, '0')}.jpg`);
      if (fs.existsSync(jpg)) await sharp(jpg).png().toFile(path.join(frames, `stage-${pct}.png`));
    }
  }
  return {
    painted, pipeline, guardViolations: guard?.violations ?? 0,
    painterMinutes: p ? minutes(p.segments.reduce((a, s) => a + (s.seconds || 0), 0)) : null,
    strokes: Number.isFinite(strokes) ? strokes : null, record, out, raw, crop, spec,
  };
}

/** Write a try folder's files for one target and return its crops entry. */
export async function tryEntry({ tryDir, r }) {
  const { crop, spec } = r, planOut = path.join(tryDir, `${crop}-plan`);
  fs.rmSync(planOut, { recursive: true, force: true }); fs.mkdirSync(planOut, { recursive: true });
  const src = fs.existsSync(path.join(r.raw, 'plan-final')) ? path.join(r.raw, 'plan-final') : null;
  if (src) for (const f of fs.readdirSync(src)) keepPlanFile(path.join(src, f), planOut);
  for (const f of ['PLAN.md', 'SELF-REVIEW.md', 'CHECKPOINTS.jsonl']) if (fs.existsSync(path.join(r.raw, f))) fs.copyFileSync(path.join(r.raw, f), path.join(planOut, f));
  if (fs.existsSync(path.join(r.raw, 'feedback', 'FEEDBACK.md'))) fs.copyFileSync(path.join(r.raw, 'feedback', 'FEEDBACK.md'), path.join(planOut, 'FEEDBACK.md'));
  const pipeline = { ...r.pipeline, plan: `${crop}-plan`, feedback: r.pipeline.feedback && `${crop}-plan/FEEDBACK.md`, selfReview: r.pipeline.selfReview && `${crop}-plan/SELF-REVIEW.md` };
  if (!r.painted) return { unpainted: { pipeline } };
  await thumb(path.join(r.out, 'final.png'), path.join(tryDir, `${crop}.webp`));
  const stages = await stageStrip(path.join(r.out, 'frames'), path.join(tryDir, `${crop}-stages.webp`));
  const [tw, th] = pngSize(path.join(V2, 'targets', `${crop}.png`));
  return {
    entry: {
      seed: 0, sheet: { W: spec.width, H: Math.round(spec.width * th / tw), mmPerCell: +(spec.sheetmm / spec.width).toFixed(4) }, strokeLog: null, strokes: r.strokes, minutes: r.painterMinutes,
      smallShare: null, shortStrokes: null, dotStrokes: null, copyHF: null, images: { final: `${crop}.webp`, stages }, painterNote: null, score: null, progression: null, pipeline,
    },
  };
}

/** Run V4 or V5 for one model: tries 1..tries over the targets, in order (V5 tries learn from the one before). */
export async function runPipeline({ round, model, tries, crops, dry, outRoot, force, gpu = 'auto', dryWidth = 96, fromTry = 1, strictVerdict = false, profile = benchmarkProfile('full') }) {
  const subjects = loadSubjects();
  if (profile.planOnly && (round.id !== 'V4' || tries !== 1 || fromTry !== 1)) throw new Error('lite requires V4 try 1 only; use full for repeated trials');
  const log = msg => console.error(`bench:run: ${msg}`);
  for (let n = fromTry; n <= tries; n++) {
    const tryDir = path.join(outRoot, round.dir, model.key, String(n));
    if (fs.existsSync(path.join(tryDir, 'run.json')) && !force) throw new Error(`${tryDir} already has a run.json; pass --force to replace it`);
    const rawTry = path.join(BENCH, 'work', 'raw', dry ? 'dry-run' : '', profile.id, crypto.createHash('sha256').update(path.resolve(outRoot)).digest('hex').slice(0, 12), round.dir, model.key, String(n));
    // A run of some targets clears only theirs, so runs of different targets of one try can share its raw folder
    if (crops.length < Object.keys(subjects).length) for (const c of crops) for (const d of [c, path.join('out', c)]) fs.rmSync(path.join(rawTry, d), { recursive: true, force: true });
    else fs.rmSync(rawTry, { recursive: true, force: true });
    fs.mkdirSync(rawTry, { recursive: true });
    fs.rmSync(tryDir, { recursive: true, force: true }); fs.mkdirSync(tryDir, { recursive: true });
    const cropsOut = {}, unpainted = {}, t0 = Date.now();
    let tokens = 0, cost = 0, wall = 0, modelMin = 0, renderSeconds = 0, usageComplete = true, costComplete = true, budgetStopped = false, guardViolations = 0;
    for (const crop of crops) {
      const spec = profileSubject(subjects[crop], profile, dry ? dryWidth : null);
      const prev = round.learning && n > 1 ? previousTry({ outRoot, round, model, n, crop }) : null;
      log(`${model.name}, ${round.id}, try ${n} of ${tries}, ${crop}${dry ? ' (dry run)' : ''}`);
      let r, e;
      try {
        r = await paintTarget({ model, round, n, tries, crop, spec, rawTry, prev, dry, gpu, log, strictVerdict, profile });
        e = await tryEntry({ tryDir, r });
      }
      catch (error) {
        usageComplete = false; costComplete = false;
        unpainted[crop] = { pipeline: { outcome: 'harness-error', failure: { failures: [{ reason: error.message }] } } };
        log(`${crop}: harness-error: ${error.message}`);
        continue;
      }
      if (e.entry) cropsOut[crop] = e.entry; else unpainted[crop] = e.unpainted;
      renderSeconds += r.pipeline.renderSeconds; usageComplete &&= r.record.usageComplete; costComplete &&= r.record.costComplete; budgetStopped ||= r.record.budgetStopped;
      tokens += r.record.tokens; cost += r.record.costUSD; wall += r.record.wallSeconds; modelMin += r.pipeline.modelMinutes; guardViolations += r.guardViolations;
      log(`${crop}: ${r.pipeline.outcome}, ${r.pipeline.looks} looks, ${r.pipeline.revisions} revisions, ${r.pipeline.modelMinutes} model minutes`);
    }
    const dq = guardViolations > 0;
    const run = {
      schema: RUN_SCHEMA, benchmark: 'unpaint-bench', protocol: 'v2', round: round.id, ...VERSION_STAMP, judgeVersion: profile.judgeVersion,
      painter: { key: model.key, name: model.name, id: model.id, effort: model.effort, runner: model.runner },
      planner: null, evaluators: { scoreJudges: [], progressionJudges: [] }, try: n,
      settings: { mode: 'gentle', strokeBudget: null, minutesPerCrop: null, sessionCapMin: profile.modelMinutes, modelMinutesCap: profile.modelMinutes, lookBudget: profile.planOnly ? 0 : null, selfView: profile.planOnly ? 'none' : 'gentle', targetGuard: 'gentle',
        crops, learnsBetweenTries: round.learning, strictVerdict, benchmarkProfile: profile.id, budget: profile, judgeProfile: `J2-${profile.judgeProfile}`, judgeRoute: process.env.JUDGE_ROUTE || 'together', scoreProtocol: 'native-v1', paintWidth: Object.fromEntries(crops.map(c => [c, profileSubject(subjects[c], profile, dry ? dryWidth : null).width])), painter: 'tools/paint-plate.mjs', machine: 'local' },
      session: { minutes: minutes(wall), modelMinutes: +modelMin.toFixed(1), tokens: usageComplete ? tokens : null, observedTokens: tokens || null, usageComplete, costUSD: costComplete && !dry ? +cost.toFixed(6) : null, modelSessionSeconds: wall, elapsedSeconds: (Date.now() - t0) / 1000, renderSeconds, exitCode: null, killedAtCap: budgetStopped },
      guard: { blockedImageReads: guardViolations, kitRejections: 0, auditHits: [] },
      crops: cropsOut, ...(Object.keys(unpainted).length ? { unpainted } : {}),
      score: { status: dry ? 'dry-run' : 'unscored', composite: null, complete: false },
      cheat: { disqualified: dq, readTargetPixels: dq, reason: dq ? `${guardViolations} blocked target read(s) by the painter` : null, risk: null, progressionRisk: null, review: null },
      complete: Object.keys(cropsOut).length === crops.length,
      raw: posix(path.relative(BENCH, rawTry)),
    };
    const errs = validateRun(run);
    if (errs.length) throw new Error(`run.json failed its own checks: ${errs.join('; ')}`);
    writeJson(path.join(tryDir, 'run.json'), run);
    if (!run.complete) process.exitCode = 1;
    log(`wrote ${posix(path.relative(process.cwd(), tryDir))}/run.json: ${Object.keys(cropsOut).length} of ${crops.length} paintings, ${minutes((Date.now() - t0) / 1000)} min`);
    // V5: the next try's feedback needs this try's judges
    if (round.learning && n < tries) {
      log(`scoring try ${n} for the next try's feedback`);
      execFileSync(process.execPath, [path.join(BENCH, 'scripts', 'score.mjs'), tryDir, ...(dry ? ['--dry-run'] : [])], { stdio: 'inherit' });
    }
  }
}
