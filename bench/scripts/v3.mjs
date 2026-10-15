// V3: one session per target, in attempts. Each attempt paints a fresh sheet with the V2 toolkit and skills; the
// session is resumed between attempts, so the model keeps its context, notes, scripts and earlier attempts, and sees
// its last painting next to the target (compare.png). It may end early by writing bench/DONE. Attempt n of every
// target makes try n.
//   npm run bench:run -- --round v3 --model <key> [--tries 3] [--crops hills,sargent]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { BENCH, RUN_SCHEMA, VERSION_STAMP, V2, BUDGET, readJson, writeJson, validateRun, posix, loadCrops, auditScripts } from './lib.mjs';
import { turnCommand, codexThread, agyConversation, usage } from './runners.mjs';
import { thumb, stageStrip } from './images.mjs';
import { makeWorktree, keepScripts, runTurn, minutes } from './pipeline/harness.mjs';

const V3 = path.join(BENCH, 'v3');
const ATTEMPT_MIN = 32;   // each attempt is stopped after 32 minutes of wall time (the brief says 30)

const fill = (t, vals) => Object.entries(vals).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), t);

function seed({ ws, crop, spec, view, tries, dry }) {
  const b = path.join(ws, 'bench');
  for (const d of ['tasks', 'attempts', 'out']) fs.mkdirSync(path.join(b, d), { recursive: true });
  fs.copyFileSync(path.join(V2, 'kit', 'kit.mjs'), path.join(b, 'kit.mjs'));
  fs.copyFileSync(path.join(V2, 'kit', 'guard.mjs'), path.join(b, 'guard.mjs'));
  for (const c of loadCrops()) if (c.distributed) fs.copyFileSync(path.join(V2, c.coarseFile), path.join(b, 'tasks', `${c.task}-coarse.json`));
  fs.cpSync(path.join(V2, 'skill', 'skills'), path.join(b, 'skills'), { recursive: true });
  const p = readJson(path.join(V3, 'prompts.json'));
  fs.writeFileSync(path.join(b, 'BRIEF.md'), fill(fs.readFileSync(path.join(V3, 'BRIEF.md'), 'utf8'), {
    CROP: crop, SIZE: `${spec.width} x ${spec.height}`, STYLE: spec.style, TARGET: view,
    ATTEMPTS: fill(tries === 2 ? p.attemptsExact : p.attemptsUpTo, { TRIES: tries }),
  }));
  if (dry) {
    fs.copyFileSync(path.join(BENCH, 'scripts', 'dry-painter.mjs'), path.join(b, 'paint.mjs'));
    fs.writeFileSync(path.join(b, 'dry-v3.mjs'), "// dry run: the scripted painter, with the attempt's one-line change note\n"
      + "import fs from 'node:fs';\nconst [crop, n] = process.argv.slice(2);\n"
      + "if (+n > 1) fs.writeFileSync(`bench/attempts/a${n}-changed.txt`, `dry run: attempt ${n} repeats the scripted washes to test the harness`);\n"
      + "process.argv = [process.argv[0], 'bench/paint.mjs', crop];\nawait import('./paint.mjs');\n");
  }
}

/** One attempt's outputs into bench/attempts/a<n>/ (the model sees them) and the raw folder. */
async function collect({ ws, crop, n, raw, view, turn }) {
  const b = path.join(ws, 'bench'), out = path.join(b, 'out', crop), dst = path.join(b, 'attempts', `a${n}`);
  fs.rmSync(dst, { recursive: true, force: true }); fs.mkdirSync(dst, { recursive: true });
  if (fs.existsSync(out)) fs.cpSync(out, dst, { recursive: true });
  for (const f of fs.readdirSync(b)) if (f.endsWith('.mjs') && !['kit.mjs', 'guard.mjs'].includes(f)) fs.copyFileSync(path.join(b, f), path.join(dst, f));
  const final = path.join(dst, 'final.png');
  if (!fs.existsSync(final) && fs.existsSync(path.join(dst, 'frames'))) { const fr = fs.readdirSync(path.join(dst, 'frames')).filter(f => f.endsWith('.png')).sort(); if (fr.length) fs.copyFileSync(path.join(dst, 'frames', fr.at(-1)), final); }
  if (fs.existsSync(final)) {
    const h = (await sharp(view).metadata()).height;
    const a = await sharp(view).resize({ height: h }).png().toBuffer(), bb = await sharp(final).resize({ height: h }).png().toBuffer();
    const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(bb).metadata()]);
    await sharp({ create: { width: ma.width + mb.width + 6, height: h, channels: 3, background: '#ffffff' } }).composite([{ input: a, left: 0, top: 0 }, { input: bb, left: ma.width + 6, top: 0 }]).png().toFile(path.join(dst, 'compare.png'));
  }
  const cf = path.join(b, 'attempts', `a${n}-changed.txt`);
  const changed = fs.existsSync(cf) ? (fs.readFileSync(cf, 'utf8').trim().split('\n')[0] || '').slice(0, 400) : '';
  let stats = null; try { stats = readJson(path.join(dst, 'stats.json')); } catch { /* no stats: the attempt did not finish */ }
  const keep = path.join(raw, `a${n}`);
  fs.rmSync(keep, { recursive: true, force: true }); fs.cpSync(dst, keep, { recursive: true });
  return { n, final: fs.existsSync(final), finished: fs.existsSync(path.join(out, 'stats.json')), stats,
    min: minutes(turn.seconds), killed: turn.killed, exit: turn.code, changed: changed || null };
}

/** One target's session: attempts 1..tries, resumed between attempts. */
async function session({ model, crop, spec, tries, rawTry, dry }) {
  const raw = path.join(rawTry, crop), view = path.join(raw, 'view', `${crop}.png`);
  fs.rmSync(raw, { recursive: true, force: true }); fs.mkdirSync(path.dirname(view), { recursive: true });
  fs.copyFileSync(path.join(V2, spec.file), view);
  const { ws, cleanup } = makeWorktree();
  const p = readJson(path.join(V3, 'prompts.json'));
  const attempts = [], res = { crop, attempts, tokens: 0, costUSD: 0, done: null };
  const sessionId = ['claude', 'muse'].includes(model.runner) ? crypto.randomUUID() : null;
  let thread = null;
  try {
    seed({ ws, crop, spec, view, tries, dry });
    let prompt = p.first, image = view;
    for (let n = 1; n <= tries; n++) {
      fs.rmSync(path.join(ws, 'bench', 'DONE'), { force: true });
      fs.rmSync(path.join(ws, 'bench', 'out', crop), { recursive: true, force: true });
      const events = path.join(raw, `events-a${n}.jsonl`), stderr = path.join(raw, `stderr-a${n}.log`);
      const env = { BENCH_SEED: '1', BENCH_VIOLATIONS: path.join(raw, `a${n}-violations.jsonl`), PYTHONPATH: path.join(V2, 'kit', 'py'), BENCH_PYGUARD: path.join(V2, 'kit', 'py') };
      const c = dry ? { cmd: process.execPath, args: ['bench/dry-v3.mjs', crop, String(n)] }
        : turnCommand(model, { ws, raw, text: prompt, images: image ? [image] : [], sessionId: sessionId ?? thread, resume: n > 1 && model.runner !== 'together', turn: n,
          briefFile: path.join(ws, 'bench', 'BRIEF.md'), crops: [crop], logFile: events, minutes: ATTEMPT_MIN - 2 });
      console.error(`bench:run: ${model.name}, V3, ${crop}, attempt ${n} of up to ${tries}${dry ? ' (dry run)' : ''}`);
      const turn = await runTurn(c, { cwd: ws, env, events, stderr, capMs: ATTEMPT_MIN * 60000 });
      if (model.runner === 'codex' && !thread) thread = codexThread(events);
      if (model.runner === 'agy' && !thread) thread = agyConversation(events);
      const u = dry ? { tokens: null, costUSD: null } : usage(model.runner, events);
      res.tokens += u.tokens || 0; res.costUSD += u.costUSD || 0;
      if (n > 1 && fs.existsSync(path.join(ws, 'bench', 'DONE'))) { res.done = { before: n, reason: fs.readFileSync(path.join(ws, 'bench', 'DONE'), 'utf8').trim().slice(0, 400), min: minutes(turn.seconds) }; break; }
      const a = await collect({ ws, crop, n, raw, view, turn });
      a.tokens = u.tokens; a.violations = fs.existsSync(env.BENCH_VIOLATIONS) ? fs.readFileSync(env.BENCH_VIOLATIONS, 'utf8').split('\n').filter(Boolean).length : 0;
      a.rejections = 0;
      attempts.push(a);
      if (!dry && !sessionId && !thread && model.runner !== 'together') { console.error('bench:run: no session id; the session cannot be resumed, so it stops here'); break; }
      prompt = fill(p.next, { PREV: n, N: n + 1, OF: tries === 2 ? tries : `up to ${tries}`, STROKES: a.stats?.strokes ?? 'no', MIN: a.min }) + (tries === 2 ? '' : p.done);
      // Attach the comparison when supported; otherwise the runner opens it from disk.
      image = ['codex', 'muse', 'agy'].includes(model.runner) ? path.join(ws, 'bench', 'attempts', `a${n}`, 'compare.png') : model.runner === 'together' ? view : null;
      if (image && !fs.existsSync(image)) image = null;
    }
  } finally {
    keepScripts(ws, path.join(raw, 'scripts'), /^bench\/(out|tasks|attempts|skills)\/|^bench\/(BRIEF\.md|kit\.mjs|guard\.mjs|paint\.mjs|dry-v3\.mjs)$|^node_modules$/);
    cleanup();
  }
  writeJson(path.join(raw, 'result.json'), res);
  return res;
}

/** Run V3 for one model and write try folders 1..tries. */
export async function runV3({ round, model, tries, crops, dry, outRoot, force }) {
  const specs = Object.fromEntries(loadCrops().map(c => [c.task, c]));
  for (let n = 1; n <= tries; n++) {
    const f = path.join(outRoot, round.dir, model.key, String(n), 'run.json');
    if (fs.existsSync(f) && !force) throw new Error(`${path.dirname(f)} already has a run.json; pass --force to replace it`);
  }
  const rawRoot = path.join(BENCH, 'work', 'raw', dry ? 'dry-run' : '', round.dir, model.key);
  const results = [];
  for (const crop of crops) results.push(await session({ model, crop, spec: specs[crop], tries, rawTry: rawRoot, dry }));
  for (let n = 1; n <= tries; n++) {
    const tryDir = path.join(outRoot, round.dir, model.key, String(n));
    fs.rmSync(tryDir, { recursive: true, force: true }); fs.mkdirSync(tryDir, { recursive: true });
    const cropsOut = {}, notes = {};
    let min = 0, tokens = 0, violations = 0, killed = false;
    const texts = [];
    for (const r of results) {
      const a = r.attempts.find(x => x.n === n);
      if (!a) { notes[r.crop] = r.done && r.done.before <= n ? `the model declared the painting done before attempt ${r.done.before}: ${r.done.reason}` : 'no attempt'; continue; }
      min += a.min; tokens += a.tokens || 0; violations += a.violations; killed ||= a.killed;
      const dir = path.join(rawRoot, r.crop, `a${n}`);
      for (const f of fs.readdirSync(dir)) if (/\.(mjs|js|cjs|py|sh)$/.test(f)) texts.push(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!a.final) continue;
      const s = a.stats || {};
      await thumb(path.join(dir, 'final.png'), path.join(tryDir, `${r.crop}.webp`));
      const stages = await stageStrip(path.join(dir, 'frames'), path.join(tryDir, `${r.crop}-stages.webp`));
      const logged = fs.existsSync(path.join(dir, 'strokes.jsonl.gz'));
      if (logged) fs.copyFileSync(path.join(dir, 'strokes.jsonl.gz'), path.join(tryDir, `${r.crop}-strokes.jsonl.gz`));
      cropsOut[r.crop] = {
        seed: s.seed ?? null, sheet: s.sheet ?? null, strokeLog: logged ? `${r.crop}-strokes.jsonl.gz` : null,
        strokes: s.strokes ?? null, minutes: s.seconds != null ? Math.round(s.seconds / 6) / 10 : null, smallShare: s.smallShare ?? null,
        shortStrokes: s.shortStrokes ?? null, dotStrokes: s.dotStrokes ?? null, copyHF: null, images: { final: `${r.crop}.webp`, stages },
        painterNote: n > 1 ? a.changed : null, score: null, progression: null, attempt: { n, minutes: a.min, killedAtCap: a.killed, exitCode: a.exit },
      };
    }
    const { hits, targetHits } = auditScripts(texts);
    const dq = violations > 0 || targetHits.length > 0;
    const run = {
      schema: RUN_SCHEMA, benchmark: 'unpaint-bench', protocol: 'v2', round: round.id, ...VERSION_STAMP,
      painter: { key: model.key, name: model.name, id: model.id, effort: model.effort, runner: model.runner },
      planner: null, evaluators: { scoreJudges: [], progressionJudges: [] }, try: n,
      settings: { mode: 'gentle', strokeBudget: BUDGET.strokes, minutesPerCrop: 30, sessionCapMin: ATTEMPT_MIN, lookBudget: null, crops, learnsBetweenTries: true, attemptsPerSession: tries },
      session: { minutes: +min.toFixed(1), tokens: tokens || null, costUSD: null, exitCode: null, killedAtCap: killed },
      guard: { blockedImageReads: violations, kitRejections: 0, auditHits: hits },
      crops: cropsOut, ...(Object.keys(notes).length ? { notPainted: notes } : {}),
      score: { status: dry ? 'dry-run' : 'unscored', composite: null, complete: false },
      cheat: { disqualified: dq, readTargetPixels: dq, reason: dq ? (violations ? `${violations} blocked target read(s) at paint time` : `scripts refer to the target files: ${targetHits.join(', ')}`) : null, risk: null, progressionRisk: null, review: null },
      complete: Object.keys(cropsOut).length === crops.length,
      raw: posix(path.relative(BENCH, path.join(rawRoot, `try-${n}`))),
    };
    // the scorer reads <raw>/out/<crop>/final.png and frames/: point it at each target's attempt n
    const rawTry = path.join(rawRoot, `try-${n}`, 'out');
    fs.rmSync(path.join(rawRoot, `try-${n}`), { recursive: true, force: true });
    for (const c of Object.keys(cropsOut)) { fs.mkdirSync(rawTry, { recursive: true }); fs.symlinkSync(path.join(rawRoot, c, `a${n}`), path.join(rawTry, c)); }
    const errs = validateRun(run);
    if (errs.length) throw new Error(`run.json failed its own checks: ${errs.join('; ')}`);
    writeJson(path.join(tryDir, 'run.json'), run);
    console.log(`bench:run: wrote ${posix(path.relative(process.cwd(), tryDir))}/run.json: ${Object.keys(cropsOut).length} of ${crops.length} paintings, ${run.session.minutes} min`);
  }
}
