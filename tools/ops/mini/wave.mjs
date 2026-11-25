// The unattended run on the Mac mini: the waves of waves.json, each session one fresh, independent command
// of the bench checkout (the same command tools/paint/run-benchmark.mjs gives it), at most `concurrency` at work at
// once. A session whose final waits for or paints on a pod is not counted as at work: it only waits.
//   node tools/ops/mini/wave.mjs plan <wave>     the sessions of a wave, and what each needs prepared; starts nothing
//   node tools/ops/mini/wave.mjs run             the waves named in <base>/GO, in order (go.sh writes it); launchd runs this
// Rules: a session idle `idleMinutes` (nothing written, and not waiting for a render) is ended and logged, never
// retried. A wave starts no more sessions once its model cost (ended sessions' usage.json model.costUSD, estimates
// included; a running one reckoned at its model's average) reaches its cap. No session starts while the disk has less
// than `diskFloorGB` free. Stop everything: touch <base>/STOP (stop.sh).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1) + '\n'); fs.renameSync(f + '.tmp', f); };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function loadConfig(home = HOME) {
  const c = readJson(path.join(HERE, 'config.json')), w = readJson(path.join(HERE, 'waves.json'));
  const at = p => path.join(home, p);
  return { ...c, waves: w.waves, perSessionUSD: w.perSessionUSD, paths: { bench: at(c.bench), ops: at(c.ops), base: at(c.base), subjects: at(c.subjects), keys: at(c.keys), sshKey: at(c.sshKey), python: at(c.python), linesVenv: at(c.linesVenv), sam: at(c.samCheckpoint), pool: path.join(at(c.base), 'pool'), runs: path.join(at(c.base), 'runs'), state: path.join(at(c.base), 'state') } };
}

// ---- pure rules (tested in wave.test.mjs) ---------------------------------------------------------------------------

/** The sessions of a wave in the order they start: level by level, picture by picture, the models in turn. */
export function orderSessions({ models, pictures, levels }) {
  const out = [];
  for (const level of levels) for (const subject of pictures(level)) for (const author of models) out.push({ author, subject, level, folder: `${author}-${subject}-${level}` });
  return out;
}

/** A wave's model cost so far: what ended sessions cost (their estimate when one reported none) and running ones at their model's average. */
export function waveCost(sessions, prior) {
  const ended = sessions.filter(s => s.status !== 'running' && s.status !== 'pending' && s.started), byModel = {};
  for (const s of ended) if (s.costUSD != null) (byModel[s.author] ??= []).push(s.costUSD);
  const avg = m => (byModel[m]?.length ? byModel[m].reduce((a, b) => a + b, 0) / byModel[m].length : prior[m] ?? 1);
  let spent = 0, reckoned = 0;
  for (const s of sessions) {
    if (!s.started) continue;
    if (s.status === 'running') reckoned += avg(s.author);
    else spent += s.costUSD ?? (s.status === 'done' ? avg(s.author) : 0);
  }
  return { spent: +spent.toFixed(2), reckoned: +reckoned.toFixed(2), total: +(spent + reckoned).toFixed(2), next: m => avg(m) };
}

/** Whether a session may start now: room under the concurrency, the disk above its floor, the wave's cost under its cap. */
export function mayStart({ atWork, concurrency, freeGB, diskFloorGB, cost, capUSD, author }) {
  if (atWork >= concurrency) return { ok: false, why: `${atWork} sessions at work (at most ${concurrency})` };
  if (freeGB < diskFloorGB) return { ok: false, why: `disk: ${freeGB.toFixed(0)} GB free, below the floor of ${diskFloorGB} GB` };
  if (cost.total + cost.next(author) > capUSD) return { ok: false, why: `cap: $${cost.total.toFixed(2)} of $${capUSD} spent or reckoned`, capped: true };
  return { ok: true };
}

/** Idle: nothing written for `idleMinutes` and not waiting for, or holding, a render place. */
export const isIdle = ({ lastWriteMs, nowMs, idleMinutes, rendering }) => !rendering && nowMs - lastWriteMs > idleMinutes * 60000;

// ---- the machine -----------------------------------------------------------------------------------------------------

/** The newest write in a session's folder (three levels down, at most 4000 entries) and its log. */
export function lastWrite(folder) {
  let t = 0, n = 0;
  const see = f => { try { t = Math.max(t, fs.statSync(f).mtimeMs); } catch {} };
  see(`${folder}.log`);
  const walk = (d, depth) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    see(d);
    for (const e of es) { if (++n > 4000) return; const f = path.join(d, e.name); if (e.isDirectory()) { if (depth < 3) walk(f, depth + 1); } else see(f); }
  };
  walk(folder, 0);
  return t;
}

/** Whether a session's log ends on a line saying it waits (for this mini's GPU, a place, a pod): it is not idle then. */
export function saysWaiting(logFile) {
  try {
    const fd = fs.openSync(logFile, 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 600), b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, size - n); fs.closeSync(fd);
    return /\bwaiting\b[^\n]*$/.test(b.toString('utf8').trimEnd());
  } catch { return false; }
}

/** The pids that wait for, or hold, a render place in the pool, by kind. */
export function poolUse(pool) {
  const out = { rendering: new Set(), final: new Set() };
  for (const sub of ['waiting', 'claims']) {
    const d = path.join(pool, sub);
    for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) {
      const j = readJson(path.join(d, n)); if (!j?.pid) continue;
      out.rendering.add(j.pid); if (j.kind === 'painting') out.final.add(j.pid);
    }
  }
  return out;
}

const freeGB = dir => { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize / 1e9; } catch { return 0; } };
const log = (cfg, line) => { const l = `${new Date().toISOString().slice(0, 19)} ${line}`; console.log(l); fs.mkdirSync(cfg.paths.state, { recursive: true }); fs.appendFileSync(path.join(cfg.paths.state, 'events.log'), l + '\n'); };

/** The environment of every session and prepare: the pool on this mini (its places) and the pods, the mini's inputs. */
export function sessionEnv(cfg, wave, env = process.env) {
  const keep = Object.fromEntries(Object.entries(env).filter(([k]) => !/^CLAUDE|^ANTHROPIC|^OPENROUTER|^RUNPOD/.test(k)));
  const own = { UNPAINT_SUBJECTS: cfg.paths.subjects, PAINTER_SEG_PYTHON: cfg.paths.python, PAINTER_LINES_VENV: cfg.paths.linesVenv, PAINTER_SAM_CHECKPOINT: cfg.paths.sam, UNPAINTING_SSH_KEY: cfg.paths.sshKey };
  if (wave.render === 'local') return { ...keep, ...own };
  return { ...keep, ...own, UNPAINT_RENDER: 'pool', UNPAINT_POOL_DIR: cfg.paths.pool, UNPAINT_POOL_ONLY: 'local,pod', UNPAINT_POOL_LOCAL: String(cfg.lookPlaces), UNPAINT_POOL_CAP: String(cfg.pods.cap) };
}

async function benchModules(cfg) {
  const m = p => import(pathToFileURL(path.join(cfg.paths.bench, 'tools', 'paint', p)).href);
  return { rb: await m('run-benchmark.mjs'), sets: await m('run-sets.mjs'), prep: await m('prepared.mjs') };
}

/** The pictures of a wave at a level: a run set's, or the list; an optional picture only when the subject list has it. */
function wavePictures(cfg, wave, mods) {
  const reg = readJson(cfg.paths.subjects)?.subjects ?? [], known = new Set(reg.map(s => s.id));
  const listed = level => (typeof wave.pictures === 'string' ? mods.sets.picturesAt(wave.pictures, level).map(p => p.id) : wave.pictures);
  const optional = (wave.optional ?? []).filter(id => known.has(id));
  return { pictures: level => [...listed(level), ...optional], missing: (wave.optional ?? []).filter(id => !known.has(id)) };
}

/** What a picture needs prepared for a wave at this commit, and whether it is there. */
function preparedState(cfg, mods, subject, commit, needsPainting) {
  const folder = path.join(path.dirname(cfg.paths.subjects), 'prepared', mods.prep.preparedKey({ id: subject, commit }));
  const plan = fs.existsSync(path.join(folder, 'plan', 'value-plan.json')) && readJson(path.join(folder, 'prepared.json'))?.unit;
  const painting = fs.existsSync(path.join(folder, 'painting', 'run.json')) && fs.existsSync(path.join(folder, 'sheets'));
  return { folder, plan: Boolean(plan), painting, ready: Boolean(plan) && (!needsPainting || painting) };
}

export async function planWave(cfg, name, commit) {
  const wave = cfg.waves[name]; if (!wave) throw new Error(`no wave "${name}" in waves.json`);
  const mods = await benchModules(cfg), { pictures, missing } = wavePictures(cfg, wave, mods);
  const sessions = orderSessions({ models: wave.models, pictures, levels: wave.levels }).map(s => {
    const level = s.level, args = mods.rb.planRuns({ models: [s.author], levels: [level], pictures: () => [s.subject] })[0].args;
    return { ...s, wave: name, args, needsPainting: ['L3', 'L4'].includes(level) };
  });
  return { wave, sessions, missing, mods };
}

// ---- prepare ---------------------------------------------------------------------------------------------------------

/**
 * Whether a picture is prepared for a session (its plan; for L3 and L4 Auto's painting too): 'ready', 'running' or
 * 'failed'. What is missing is started, one command at a time a picture: the plan first (on this mini), then Auto's
 * painting (a final like the sessions', on the pods). A prepare that failed is not tried again.
 */
function prepared(cfg, st, mods, commit, subject, needsPainting, env) {
  const step = (painting) => {
    const key = `${subject}:${painting ? 'painting' : 'plan'}`, p = st.prepare[key] ??= { status: 'pending' };
    const have = preparedState(cfg, mods, subject, commit, painting);
    if (have.ready) { p.status = 'ready'; return p.status; }
    if (p.status === 'running' && alive(p.pid)) return 'running';
    if (p.status === 'running') { p.status = 'failed'; p.why = `the prepare command ended without ${painting ? "Auto's painting" : 'the plan'} (log ${p.log})`; log(cfg, `prepare ${key}: FAILED, ${p.why}`); }
    if (p.status === 'failed' || p.status === 'stopped') return 'failed';
    // two plans at a time on this mini (each a CPU planner and a look); Auto's paintings only wait for pods
    if (!painting && Object.entries(st.prepare).filter(([k, x]) => k.endsWith(':plan') && x.status === 'running' && alive(x.pid)).length >= 2) return 'running';
    const level = painting ? 'L4' : 'L2', logf = path.join(cfg.paths.state, 'prepare', `${subject}-${level}.log`); fs.mkdirSync(path.dirname(logf), { recursive: true });
    const fd = fs.openSync(logf, 'a');
    const child = spawn(process.execPath, [path.join(cfg.paths.bench, 'tools', 'paint', 'cli.mjs'), subject, 'prepare', '--level', level], { cwd: cfg.paths.bench, env, detached: true, stdio: ['ignore', fd, fd] });
    child.unref();
    Object.assign(p, { status: 'running', pid: child.pid, level, log: logf, started: Date.now() });
    log(cfg, `prepare ${key} started (pid ${child.pid}, log ${logf})`);
    return 'running';
  };
  const plan = step(false);
  return plan !== 'ready' || !needsPainting ? plan : step(true);
}

// ---- run -------------------------------------------------------------------------------------------------------------

function sessionEnded(cfg, s) {
  const folder = path.join(cfg.paths.runs, s.folder), run = readJson(path.join(folder, 'run.json')), usage = readJson(path.join(folder, 'usage.json'));
  s.costUSD = usage?.model?.costUSD ?? null; s.costEstimated = Boolean(usage?.model?.estimate);
  s.ended = Date.now();
  if (s.status === 'running') s.status = run && !run.failure && fs.existsSync(path.join(folder, 'plate', 'painting.png')) ? 'done' : run?.failure ? 'failed' : 'ended without a record';
  if (run?.failure) s.why = String(run.failure.message ?? run.failure).slice(0, 300);
}

function killGroup(pid) { for (const sig of ['SIGTERM']) { try { process.kill(-pid, sig); } catch { try { process.kill(pid, sig); } catch {} } } setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch {} }, 30000).unref(); }

function ensureHelper(cfg, st, name, cmd, args, env) {
  const h = st.helpers[name];
  if (h && alive(h.pid)) return;
  const logf = path.join(HOME, 'Library', 'Logs', `${name}.log`), fd = fs.openSync(logf, 'a');
  const child = spawn(cmd, args, { cwd: cfg.paths.ops, env, detached: true, stdio: ['ignore', fd, fd] }); child.unref();
  st.helpers[name] = { pid: child.pid, started: Date.now(), log: logf };
  log(cfg, `${h ? 'restarted' : 'started'} ${name} (pid ${child.pid}, log ${logf})`);
}

export async function run(cfg, { once = false } = {}) {
  const git = (...a) => execFileSync('git', ['-C', cfg.paths.bench, ...a], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  if (git('status', '--porcelain')) throw new Error(`${cfg.paths.bench} has uncommitted changes: the pool paints committed code only`);
  const goFile = path.join(cfg.paths.base, 'GO'), names = fs.existsSync(goFile) ? fs.readFileSync(goFile, 'utf8').split(/\s+/).filter(Boolean) : [];
  if (!names.length) throw new Error(`nothing to run: ${goFile} names no wave (go.sh writes it)`);
  const stFile = path.join(cfg.paths.state, 'run.json');
  const st = readJson(stFile) ?? { started: Date.now(), commit, waves: {}, prepare: {}, helpers: {} };
  st.prepare ??= {}; st.helpers ??= {}; st.pid = process.pid; st.commit = commit; st.order = names; st.finished = null;
  fs.writeFileSync(path.join(cfg.paths.state, 'runner.pid'), String(process.pid));
  const plans = {};
  for (const n of names) {
    const p = await planWave(cfg, n, commit); plans[n] = p;
    const w = st.waves[n] ??= { name: n, capUSD: p.wave.capUSD, sessions: {}, missing: p.missing, capped: false };
    for (const s of p.sessions) w.sessions[s.folder] ??= { ...s, args: undefined, status: 'pending' };
    if (p.missing.length) log(cfg, `wave ${n}: not in the subject list yet, so not run: ${p.missing.join(', ')}`);
  }
  log(cfg, `runner started (pid ${process.pid}) at commit ${commit.slice(0, 8)}: waves ${names.join(', ')}`);
  const keysDir = cfg.paths.keys, anyPods = names.some(n => plans[n].wave.render !== 'local');
  for (;;) {
    const now = Date.now();
    if (fs.existsSync(path.join(cfg.paths.base, 'STOP'))) {
      for (const w of Object.values(st.waves)) for (const s of Object.values(w.sessions)) if (s.status === 'running' && alive(s.pid)) { killGroup(s.pid); s.status = 'stopped'; s.why = 'stopped by stop.sh'; }
      for (const p of Object.values(st.prepare)) if (p.status === 'running' && alive(p.pid)) { killGroup(p.pid); p.status = 'stopped'; }
      fs.mkdirSync(cfg.paths.pool, { recursive: true }); fs.writeFileSync(path.join(cfg.paths.pool, 'STOP-PODS'), '');
      st.finished = now; st.stoppedBy = 'STOP'; writeJson(stFile, st); log(cfg, 'STOP: every session ended, the pods daemon told to delete every pod'); return st;
    }
    // helpers: the pods daemon (finals on pods) and the scoring loop
    if (anyPods) ensureHelper(cfg, st, 'unpaint-pods', path.join(cfg.paths.python), [path.join(HERE, 'pods-batched.py'), cfg.paths.pool], { PATH: process.env.PATH, HOME, UNPAINTING_ENV_FILE: path.join(keysDir, 'runpod.env'), UNPAINTING_SSH_KEY: cfg.paths.sshKey });
    ensureHelper(cfg, st, 'unpaint-score', '/bin/zsh', [path.join(HERE, 'score-loop.sh')], { PATH: process.env.PATH, HOME });
    const use = poolUse(cfg.paths.pool);
    let atWork = 0;
    for (const w of Object.values(st.waves)) for (const s of Object.values(w.sessions)) {
      if (s.status !== 'running') continue;
      if (!alive(s.pid)) { sessionEnded(cfg, s); log(cfg, `${s.folder}: ${s.status}${s.costUSD != null ? `, model $${s.costUSD}` : ''}`); continue; }
      const folder = path.join(cfg.paths.runs, s.folder), rendering = use.rendering.has(s.pid) || saysWaiting(`${folder}.log`);
      s.lastWrite = Math.max(lastWrite(folder), s.started); s.waitingFinal = use.final.has(s.pid);
      if (isIdle({ lastWriteMs: s.lastWrite, nowMs: now, idleMinutes: cfg.idleMinutes, rendering })) {
        killGroup(s.pid); s.status = 'idle-ended'; s.ended = now; s.why = `nothing written for ${cfg.idleMinutes} min and not waiting for a render: ended, not retried`;
        log(cfg, `${s.folder}: IDLE, ended (${s.why})`); continue;
      }
      if (!s.waitingFinal) atWork++;
    }
    // prepare and start, wave by wave: a wave starts once the one before has nothing left to start
    let earlierOpen = false;
    for (const n of names) {
      const w = st.waves[n], p = plans[n], env = sessionEnv(cfg, p.wave);
      const pending = Object.values(w.sessions).filter(s => s.status === 'pending' || s.status === 'waiting for prepare');
      if (!pending.length || w.capped) continue;
      if (earlierOpen) break;
      earlierOpen = true;
      const cost = waveCost(Object.values(w.sessions), cfg.perSessionUSD); w.cost = cost.total;
      for (const s of pending) {
        const prep = prepared(cfg, st, p.mods, commit, s.subject, s.needsPainting, env);
        if (prep === 'failed') { s.status = 'not run'; s.why = `its picture could not be prepared (logs in ${path.join(cfg.paths.state, 'prepare')})`; log(cfg, `${s.folder}: not run, ${s.why}`); continue; }
        if (prep !== 'ready') { s.status = 'waiting for prepare'; continue; }
        const ok = mayStart({ atWork, concurrency: cfg.concurrency, freeGB: freeGB(cfg.paths.base), diskFloorGB: p.wave.diskFloorGB ?? cfg.diskFloorGB, cost: waveCost(Object.values(w.sessions), cfg.perSessionUSD), capUSD: w.capUSD, author: s.author });
        if (!ok.ok) {
          w.held = ok.why;
          if (ok.capped) { w.capped = true; for (const x of Object.values(w.sessions)) if (x.status === 'pending' || x.status === 'waiting for prepare') { x.status = 'not run'; x.why = ok.why; } log(cfg, `wave ${n}: ${ok.why}; it starts no more sessions`); }
          break;
        }
        w.held = null;
        const folder = path.join(cfg.paths.runs, s.folder);
        if (fs.existsSync(folder)) { s.status = 'not run'; s.why = 'its folder exists already (not started again)'; continue; }
        fs.mkdirSync(cfg.paths.runs, { recursive: true });
        const fd = fs.openSync(`${folder}.log`, 'a'), args = p.sessions.find(x => x.folder === s.folder).args;
        const child = spawn(process.execPath, [path.join(cfg.paths.bench, 'tools', 'paint', 'cli.mjs'), ...args, '--out', folder], { cwd: cfg.paths.bench, env, detached: true, stdio: ['ignore', fd, fd] });
        child.unref();
        Object.assign(s, { status: 'running', pid: child.pid, started: now, command: `npm run paint -- ${args.join(' ')} --out ${folder}` });
        atWork++; log(cfg, `${s.folder}: started (pid ${child.pid}); ${atWork} at work`);
      }
      if (Object.values(w.sessions).some(s => s.status === 'pending' || s.status === 'waiting for prepare')) earlierOpen = true;
    }
    for (const w of Object.values(st.waves)) w.cost = waveCost(Object.values(w.sessions), cfg.perSessionUSD).total;
    const all = Object.values(st.waves).flatMap(w => Object.values(w.sessions));
    // run-benchmark.mjs's own record of the sessions started, so `node tools/paint/run-benchmark.mjs manifest <runs>` works as for its --start
    const started = all.filter(s => s.started);
    if (started.length) writeJson(path.join(cfg.paths.runs, 'launch.json'), { started: new Date(st.started).toISOString(), commit, set: 'waves ' + names.join(', '), launcher: 'tools/ops/mini/wave.mjs (run-benchmark.mjs planRuns, started at most ' + cfg.concurrency + ' at work)', pool: 'local,pod', runs: started.map(s => ({ author: s.author, subject: s.subject, level: s.level, folder: s.folder, command: s.command })) });
    st.updated = now; st.counts = all.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] ?? 0) + 1 }), {});
    const live = all.some(s => ['running', 'pending', 'waiting for prepare'].includes(s.status));
    if (!live) { st.finished = now; writeJson(stFile, st); log(cfg, `every wave ended: ${JSON.stringify(st.counts)}`); if (anyPods) fs.writeFileSync(path.join(cfg.paths.pool, 'STOP-PODS'), ''); return st; }
    writeJson(stFile, st);
    if (once) return st;
    await sleep(30000);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, arg] = process.argv.slice(2), cfg = loadConfig();
  try {
    if (cmd === 'plan') {
      const commit = execFileSync('git', ['-C', cfg.paths.bench, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), p = await planWave(cfg, arg, commit);
      console.log(`wave ${arg}: ${p.sessions.length} sessions at commit ${commit.slice(0, 8)}, cap $${p.wave.capUSD}; starts nothing`);
      for (const s of p.sessions) { const pr = preparedState(cfg, p.mods, s.subject, commit, s.needsPainting); console.log(`  ${s.folder}  prepared: ${pr.ready ? 'yes' : pr.plan ? "plan only (Auto's painting to make)" : 'no'}`); }
      if (p.missing.length) console.log(`not in the subject list yet (not run): ${p.missing.join(', ')}`);
    } else if (cmd === 'run') await run(cfg);
    else { console.error('usage: wave.mjs plan <wave> | run'); process.exit(2); }
  } catch (e) { console.error(`wave: ${e.message}`); process.exit(1); }
}
