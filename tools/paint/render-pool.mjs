// The render pool (UNPAINT_RENDER=pool, render.mjs): a painting is painted on whichever machine is free, this Mac,
// a rented pod or the Mac mini, at the session's commit, and what it wrote comes back into the folder the session
// reads, as if it had been painted here. One painting a worker. Shared by every command on this Mac through one
// folder (the pool folder: claims, waiting jobs, live clients, the pods' list), so eight sessions in eight commands
// share the workers and none waits for this Mac's one GPU.
//
// The pool folder (UNPAINT_POOL_DIR, else work/render-pool of the main checkout):
//   clients/<pid>.json   a command that paints through the pool and how many sessions it runs (the pods follow it)
//   waiting/<id>.json    a painting waiting for a worker, oldest first
//   claims/<slot>.json   a worker's place taken (O_EXCL), with the claimer's pid; a dead claimer's claim is cleared
//   pods.json            the pods up, written by tools/cloud/render-pool-pods.py: name, ssh address, rate, trees
//   mini.json            {"host": "mini", "slots": 2} to use the Mac mini (absent: no mini)
//   jobs/<id>/           what a job sends: job.json, render-worker.mjs and stage-look.mjs
//   log.txt              one line a job: where, how long it waited, painted, copied, what it cost
//
// A painting is retried once when its worker fails (the machine or the link went, the painter was killed) and then
// fails loudly; a painter that ends by itself with an exit code is the painting's answer and is never retried. Nothing
// falls back to another size, plan or machine kind quietly: where a job ran is recorded with it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jobInputs, workerArgs, workerEnv, homePaths } from './render-ship.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The most pods the pool rents (UNPAINT_POOL_CAP). */
export const DEFAULT_CAP = 10;
/** This Mac takes a look from the pool while fewer than this many GPU paintings run on it (UNPAINT_POOL_LOCAL; queue.mjs DEFAULT_JOBS). */
export const DEFAULT_LOCAL = 2;
/** A pod with less than this left before it deletes itself takes no new job. */
const POD_MARGIN_S = 45 * 60;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** The pool folder: UNPAINT_POOL_DIR, else work/render-pool beside the main checkout's .git (one for all worktrees). */
export function poolDir(env, root) {
  if (env.UNPAINT_POOL_DIR) return path.resolve(env.UNPAINT_POOL_DIR);
  const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.join(path.dirname(common), 'work', 'render-pool');
}

/** A worker failed (not the painting): the job may be tried once more elsewhere. */
export class WorkerFailure extends Error {}
/** Both tries of a job failed on their workers: the painting was not painted, through no fault of its own. */
export class WorkersFailed extends Error {}

/** The pods daemon's heartbeat (pods.json `updated`) is fresh this many seconds. */
export const HEARTBEAT_S = 120;
/** A stale heartbeat whose daemon process is gone is waited for this long (it may be restarted) before a painting stops. */
export const DAEMON_GONE_GRACE_S = 15 * 60;
/**
 * The pods daemon as a painting waiting for a pod sees it: 'fresh' (its heartbeat is recent), 'busy' (the heartbeat
 * is stale but its process lives: it is busy, setting up a pod, and the painting waits), 'gone' (stale, or never
 * written, and no daemon process: waited for a while, then a plain failure), 'never' (no pods.json and no process).
 */
export function podsDaemon({ updated, nowS, processAlive }) {
  if (updated && nowS - updated < HEARTBEAT_S) return 'fresh';
  if (processAlive) return 'busy';
  return updated ? 'gone' : 'never';
}
/** Whether the pods daemon's process lives: the pid in pods.pid, alive, and its command the daemon's. */
export function daemonProcessAlive(dir, ps = pid => execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })) {
  let pid; try { pid = Number(fs.readFileSync(path.join(dir, 'pods.pid'), 'utf8').trim()); } catch { return false; }
  if (!(pid > 0) || !alive(pid)) return false;
  try { return /render-pool-pods/.test(ps(pid)); } catch { return false; }
}

// ---- places: claims, waiting, clients ---------------------------------------------------------------------------

/** Take `slot` for this process; false when it is held. A claim of a process that is gone is cleared first. */
/** The jobs the benchmark itself paints (cli.mjs: a session's looks, its final, a prepare). Any other kind (an
 * operator's replay or profile) goes after them: it takes a place only while no benchmark job waits, one at a time in
 * the whole pool. */
export const BENCHMARK_KINDS = new Set(['look', 'look stopped at a stage', 'painting']);
export function claim(dir, slot, info, isAlive = alive) {
  const f = path.join(dir, 'claims', `${slot}.json`); fs.mkdirSync(path.dirname(f), { recursive: true });
  const held = readJson(f); if (held && !isAlive(held.pid)) fs.rmSync(f, { force: true });
  if (!BENCHMARK_KINDS.has(info.kind)) {
    const w = path.join(dir, 'waiting'), waiting = (fs.existsSync(w) ? fs.readdirSync(w) : []).map(n => readJson(path.join(w, n))).filter(x => x && isAlive(x.pid));
    if (waiting.some(x => BENCHMARK_KINDS.has(x.kind)) || Object.values(claims(dir, isAlive)).some(c => !BENCHMARK_KINDS.has(c.kind))) return false;
  }
  try { fs.writeFileSync(f, JSON.stringify({ ...info, pid: info.pid ?? process.pid, since: Date.now() }), { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; }
}
/** The claim's painter is running on its worker (the mini counts it among its own painters from then on). */
export function markStarted(dir, slot) { const f = path.join(dir, 'claims', `${slot}.json`), c = readJson(f); if (c) writeJson(f, { ...c, started: Date.now() }); }
export const release = (dir, slot) => fs.rmSync(path.join(dir, 'claims', `${slot}.json`), { force: true });
/** The claims held now, by slot, the dead ones left out. */
export function claims(dir, isAlive = alive) {
  const d = path.join(dir, 'claims'), out = {};
  for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) { const c = n.endsWith('.json') && readJson(path.join(d, n)); if (c && isAlive(c.pid)) out[n.slice(0, -5)] = c; }
  return out;
}

/** How many live waiting jobs came before `id` (FIFO): a job takes a free place only when there are more free places than that. */
export function waitRank(dir, id, isAlive = alive) {
  const d = path.join(dir, 'waiting'); const mine = readJson(path.join(d, `${id}.json`)); if (!mine) return 0;
  const pods = k => POD_KINDS.has(k);   // a look and a painting wait for different places
  return (fs.existsSync(d) ? fs.readdirSync(d) : []).map(n => readJson(path.join(d, n))).filter(w => w && w.id !== id && pods(w.kind) === pods(mine.kind) && isAlive(w.pid) && (w.since < mine.since || (w.since === mine.since && w.id < id))).length;
}

/** Say that this process paints through the pool and runs `sessions` sessions; the pods follow the live total. Cleared at exit. */
export function registerClient(dir, { sessions, commit }) {
  const f = path.join(dir, 'clients', `${process.pid}.json`);
  writeJson(f, { pid: process.pid, sessions, commit, since: Date.now() });
  process.on('exit', () => fs.rmSync(f, { force: true }));
  return f;
}

// ---- workers ------------------------------------------------------------------------------------------------------

/** Kinds of job a pod takes: a full-size painting (a final, a subject's prepared Auto painting), unattended. A look
 * goes to this Mac or the mini: a pod paints a small look about three times slower than the mini and takes minutes to
 * rent, while a session waits on its look. */
export const POD_KINDS = new Set(['painting']);
/**
 * The places a job of `kind` could take now, best first: a look this Mac (no copy) then the mini's places; a painting
 * a pod (one painting a pod). A pod is a place only once it is ready, has a checkout of `commit` and has time left; `avoid` is a worker
 * that failed this job; `only`: the kinds allowed (UNPAINT_POOL_ONLY, for the operator). [{slot, worker: {kind, name, ...}}]
 */
export function places({ pods = [], mini = null, local = DEFAULT_LOCAL, commit, kind = 'look', avoid = null, only = null, now = Date.now() }) {
  const out = [];
  if (POD_KINDS.has(kind)) {
    for (const p of pods) if (p.ready && p.trees?.[commit.slice(0, 8)] && (p.limit ?? Infinity) * 1000 - now > POD_MARGIN_S * 1000) out.push({ slot: `pod-${p.name}`, worker: { kind: 'pod', name: p.name, host: p.ip, port: p.port, rate: p.rate, tree: p.trees[commit.slice(0, 8)], base: '/root/render-pool' } });
    return out.filter(p => p.worker.name !== avoid && (!only || only.includes(p.worker.kind)));
  }
  for (let k = 0; k < local; k++) out.push({ slot: `local-${k}`, worker: { kind: 'local', name: 'this Mac' } });
  if (mini) for (let k = 0; k < (mini.slots ?? 2); k++) out.push({ slot: `mini-${k}`, worker: { kind: 'mini', name: 'Mac mini', host: mini.host ?? 'mini', slots: mini.slots ?? 2 } });
  return out.filter(p => p.worker.name !== avoid && (!only || only.includes(p.worker.kind)));
}

/** What a pod's time cost for a job held `seconds`, in dollars (its hourly rate); 0 for the Macs. */
export const costOf = (worker, seconds) => (worker.kind === 'pod' ? +(((worker.rate ?? 0) * seconds) / 3600).toFixed(4) : 0);

const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=20', '-o', 'LogLevel=ERROR'];
/** The ssh words for a worker (a pod by address and key, the mini by its ssh name). */
export function sshWords(w, env = process.env) {
  if (w.kind === 'pod') return ['-p', String(w.port), '-i', env.UNPAINTING_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_ed25519'), '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', ...SSH_OPTS, `root@${w.host}`];
  return [...SSH_OPTS, w.host];
}

function sh(cmd, args, { input = null, timeout = 600000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '';
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(t); resolve({ code: -1, out, err: err + e.message }); });
    child.on('close', code => { clearTimeout(t); resolve({ code, out, err }); });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}

/**
 * A worker reached by ssh. The mini's ssh answers 0 whatever the command did, so every step prints a word and the
 * word is what is checked. The mini's shell is a login zsh (its node is on that PATH); a pod's is bash as root.
 */
export class Remote {
  constructor(worker, { run = sh, env = process.env } = {}) { this.w = worker; this.run = run; this.env = env; }
  async script(text, timeout = 120000) {
    const shell = this.w.kind === 'mini' ? 'zsh -l -s' : 'bash -s';
    const r = await this.run('ssh', [...sshWords(this.w, this.env), shell], { input: text, timeout });
    return { ...r, out: r.out ?? '' };
  }
  rsync(args, timeout = 1800000) { return this.run('rsync', ['-a', '-e', ['ssh', ...sshWords(this.w, this.env).slice(0, -1)].map(q).join(' '), ...args], { timeout }); }
  target(p) { return `${sshWords(this.w, this.env).at(-1)}:${p}`; }
}
const q = s => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

/** The mini's own environment for a painter: the trunk checkout's Python environments and the SAM checkpoint (mini-worker/NOTES.md). */
const miniOwn = home => ({ PAINTER_SEG_PYTHON: `${home}/work/unpainting-04-worker/.venv-seg/bin/python`, PAINTER_LINES_VENV: `${home}/work/unpainting-04-worker/.venv-lines`, PAINTER_SAM_CHECKPOINT: `${home}/.cache/sam/sam_vit_b_01ec64.pth` });

/**
 * The mini's checkout at `commit` (~/work/unpainting-c-<8>), made when it is not there: the commit pushed to the
 * mini's trunk checkout as mini/c-<8>, a detached worktree, npm ci. Throws WorkerFailure when it cannot be made.
 */
async function miniCheckout(remote, commit, repo) {
  const h8 = commit.slice(0, 8), d = `work/unpainting-c-${h8}`;
  const probe = async () => (await remote.script(`cd ~ && echo HOME=$HOME; git -C ~/${d} rev-parse HEAD 2>/dev/null; test -d ~/${d}/node_modules && echo MODULES\n`)).out;
  let said = await probe();
  if (!said.includes(commit) || !said.includes('MODULES')) {
    const p = await remote.run('git', ['-C', repo, 'push', '-f', `${remote.w.host}:work/unpainting-04-worker`, `${commit}:refs/heads/mini/c-${h8}`], { timeout: 900000 });
    if (p.code !== 0) throw new WorkerFailure(`could not send commit ${h8} to the mini: ${(p.err || '').trim().slice(-200)}`);
    await remote.script(`cd ~/work/unpainting-04-worker && (test -d ~/${d} || git worktree add -q --detach ~/${d} ${commit}) && cd ~/${d} && npm ci --no-audit --no-fund >/dev/null 2>&1; echo MADE\n`, 1800000);
    said = await probe();
    if (!said.includes(commit) || !said.includes('MODULES')) throw new WorkerFailure(`the mini has no usable checkout of ${h8} (${d})`);
  }
  return { home: /HOME=(\S+)/.exec(said)[1], tree: `${/HOME=(\S+)/.exec(said)[1]}/${d}` };
}

/** How many paintings the mini is painting now, by anyone, and the most it takes (its runner's `jobs` file). */
async function miniBusy(remote) {
  const r = await remote.script(`echo COUNT=$(pgrep -f '^node .*paint-plate' | wc -l | tr -d ' '); echo MOST=$(cat ~/jobs/unpainting-paint/l2-fix-in/jobs 2>/dev/null || echo 2)\n`, 30000);
  const n = /COUNT=(\d+)/.exec(r.out), m = /MOST=(\d+)/.exec(r.out);
  return n && m ? { running: Number(n[1]), most: Number(m[1]) } : null;
}

/**
 * One painting on an ssh worker: send the inputs (rsync: what the worker already has is not sent again) and the job,
 * start it detached, follow its log, bring back what it wrote. Resolves {done, stopped, seconds: {ship, paint, pull}};
 * throws WorkerFailure when the worker or the link fails.
 */
export async function paintRemote(job, worker, opts = {}) {
  const remote = opts.remote ?? new Remote(worker), at = {};
  try { return await paintRemoteSteps(job, worker, { ...opts, remote, at }); } catch (e) {
    // a job given up is stopped where it runs, so the worker is free again (its painter names the job folder)
    if (e instanceof WorkerFailure && at.J) await remote.script(`pkill -f ${q(at.J)}; echo STOPPED\n`, 30000).catch(() => null);
    throw e;
  }
}
async function paintRemoteSteps(job, worker, { remote, at, repo, onLine = () => {}, onStarted = () => {}, pollMs = 5000, lostAfterMs = 120000 }) {
  const t0 = Date.now();
  let home, tree;
  if (worker.kind === 'mini') ({ home, tree } = await miniCheckout(remote, job.commit, repo));
  else { home = '/root'; tree = worker.tree; }
  const base = worker.kind === 'mini' ? `${home}/jobs/render-pool` : worker.base, root = `${base}/fs`, J = `${base}/jobs/${job.id}`, out = `${J}/out`; at.J = J;
  const own = worker.kind === 'mini' ? miniOwn(home) : { XDG_RUNTIME_DIR: '/tmp' };
  const spec = { cwd: tree, args: workerArgs(job.command.args, { root, out }), env: workerEnv(job.command.env ?? {}, job.shellEnv ?? {}, { own, cache: `${base}/cache` }), until: job.until ?? null };
  // the job folder here: what is sent beside the inputs
  const local = path.join(job.poolDir, 'jobs', job.id); fs.mkdirSync(local, { recursive: true });
  writeJson(path.join(local, 'job.json'), spec);
  for (const f of ['render-worker.mjs', 'stage-look.mjs']) fs.copyFileSync(path.join(HERE, f), path.join(local, f));
  const list = path.join(local, 'inputs.txt'); fs.writeFileSync(list, job.inputs.map(f => f.slice(1)).join('\n') + '\n');
  const made = await remote.script(`mkdir -p ${q(root)} ${q(out)} && echo MADE\n`, 60000);
  if (!made.out.includes('MADE')) throw new WorkerFailure(`could not make the job folder on ${worker.name}: ${(made.err || made.out).trim().slice(-200)}`);
  const sent = await remote.rsync(['-r', '--relative', `--files-from=${list}`, '/', remote.target(root + '/')]);
  if (sent.code !== 0) throw new WorkerFailure(`could not send the inputs to ${worker.name}: ${(sent.err || '').trim().slice(-300)}`);
  const sentJob = await remote.rsync([local + '/', remote.target(J + '/')]);
  if (sentJob.code !== 0) throw new WorkerFailure(`could not send the job to ${worker.name}: ${(sentJob.err || '').trim().slice(-300)}`);
  const tShip = Date.now();
  const started = await remote.script(`cd ${q(J)} && (nohup node render-worker.mjs > worker.out 2>&1 < /dev/null & echo $! > pid) && sleep 1 && echo STARTED $(cat pid)\n`, 60000);
  if (!/STARTED \d+/.test(started.out)) throw new WorkerFailure(`the painter did not start on ${worker.name}: ${(started.err || started.out).trim().slice(-300)}`);
  onStarted();
  // follow it: the result file, whether its process lives, and the log from where it was read to
  let read = 0, lostSince = null, result = null, rest = '';
  const logOut = fs.createWriteStream(job.logFile);
  try {
    for (;;) {
      await sleep(pollMs);
      const r = await remote.script(`cd ${q(J)} 2>/dev/null || { echo NOJOB; exit 0; }; if [ -f result.json ]; then echo @@RESULT; cat result.json; echo; echo @@END; fi; kill -0 $(cat pid) 2>/dev/null && echo @@ALIVE; echo @@LOG; tail -c +${read + 1} painter.log 2>/dev/null\n`, 60000);
      if (r.out.includes('NOJOB')) throw new WorkerFailure(`the job's folder is gone from ${worker.name} (the machine was reset or removed)`);
      if (r.code !== 0 || !r.out.includes('@@LOG')) {
        lostSince ??= Date.now();
        if (Date.now() - lostSince > lostAfterMs) throw new WorkerFailure(`lost ${worker.name}: no answer for ${Math.round(lostAfterMs / 1000)} s (${(r.err || r.out).trim().slice(-200)})`);
        continue;
      }
      lostSince = null;
      const text = r.out.slice(r.out.indexOf('@@LOG') + 6);
      if (text) { logOut.write(homePaths(text, { root, out, localOut: job.out })); read += Buffer.byteLength(text); rest += text; const lines = rest.split('\n'); rest = lines.pop(); lines.forEach(onLine); }
      if (r.out.includes('@@RESULT')) { result = JSON.parse(r.out.slice(r.out.indexOf('@@RESULT') + 9, r.out.indexOf('@@END'))); break; }
      if (!r.out.includes('@@ALIVE')) {
        const why = await remote.script(`cat ${q(J)}/worker-error.txt ${q(J)}/worker.out 2>/dev/null | tail -5\n`, 30000);
        throw new WorkerFailure(`the painter on ${worker.name} ended without a result (killed, or the machine lost it)${why.out.trim() ? `: ${why.out.trim().slice(-300)}` : ''}`);
      }
    }
  } finally { if (rest) onLine(rest); await new Promise(r => logOut.end(r)); }
  const tPaint = Date.now();
  // a painter killed by a signal is a worker's failure, not the painting's answer
  if (result.done?.signal) throw new WorkerFailure(`the painter on ${worker.name} was stopped by ${result.done.signal}`);
  fs.mkdirSync(job.out, { recursive: true });
  const back = await remote.rsync([remote.target(out + '/'), job.out + '/']);
  if (back.code !== 0) throw new WorkerFailure(`could not bring the painting back from ${worker.name}: ${(back.err || '').trim().slice(-300)}`);
  if (result.stopped) {
    const sheet = `${job.pauseDir}-sheet.png`, b = await remote.rsync([remote.target(`${J}/${result.stopped.sheet}`), sheet]);
    if (b.code !== 0) throw new WorkerFailure(`could not bring the stopped sheet back from ${worker.name}`);
    result.stopped.sheet = sheet;
  }
  homeRecords(job.out, { root, out, localOut: job.out });
  await remote.script(`rm -rf ${q(J)}; echo GONE\n`, 60000);
  const tPull = Date.now();
  return { done: result.done, stopped: result.stopped, endedEarly: result.endedEarly ?? false, seconds: { ship: (tShip - t0) / 1000, paint: (tPaint - tShip) / 1000, pull: (tPull - tPaint) / 1000 } };
}

/** The painter's text records brought home name this Mac's paths again (json, txt and log files under 50 MB). */
export function homeRecords(dir, names) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    const f = path.join(e.parentPath ?? e.path, e.name);
    if (!e.isFile() || !/\.(json|txt|log|jsonl)$/.test(e.name) || fs.statSync(f).size > 50e6) continue;
    const t = fs.readFileSync(f, 'utf8'), u = homePaths(t, names); if (u !== t) fs.writeFileSync(f, u);
  }
}

// ---- one job ------------------------------------------------------------------------------------------------------

/**
 * Paint `command` through the pool. `job`: {command, cwd, logFile, onLine, until, pauseDir, out, commit, kind}.
 * `local(command, opts)`: how this Mac paints it (run.mjs runPainter, or the stage stop round it). Resolves
 * {done, stopped, endedEarly, render} where render is what the operator reads: worker, seconds waited, painted and
 * copied, cost, and each try. Throws after a second worker failure.
 */
export async function paintOnPool(job, { dir, env = process.env, local, gpuCount = () => 0, repo, remoteFor = w => new Remote(w), pollMs = 3000, daemonAlive = () => daemonProcessAlive(dir) }) {
  const asked = Date.now(), tries = [];
  const inputs = jobInputs(job.command.args, { see: f => { try { const s = fs.statSync(f); return s.isDirectory() ? 'dir' : s.isFile() ? 'file' : null; } catch { return null; } }, list: d => fs.readdirSync(d) });
  let avoid = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const id = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;
    const got = await takePlace({ dir, env, id, commit: job.commit, avoid, gpuCount, kind: job.kind, remoteFor, pollMs, daemonAlive, tick: job.tick ?? (() => {}) });
    const waited = (Date.now() - asked) / 1000, t = Date.now();
    try {
      let r;
      if (got.worker.kind === 'local') {
        const x = await local(job.command, { cwd: job.cwd, logFile: job.logFile, onLine: job.onLine });
        if (x.done?.signal) throw new WorkerFailure(`the painter on this Mac was stopped by ${x.done.signal}`);
        r = { ...x, seconds: { ship: 0, paint: (Date.now() - t) / 1000, pull: 0 } };
      } else r = await paintRemote({ ...job, id, inputs, poolDir: dir, shellEnv: env }, got.worker, { remote: remoteFor(got.worker), repo, onLine: job.onLine, onStarted: () => markStarted(dir, got.slot) });
      const held = (Date.now() - t) / 1000;
      tries.push({ worker: got.worker.name, kind: got.worker.kind, ok: true, seconds: Math.round(held) });
      const render = { mode: 'pool', worker: got.worker.name, workerKind: got.worker.kind, waitSeconds: Math.round(waited), paintSeconds: Math.round(r.seconds.paint), copySeconds: +(r.seconds.ship + r.seconds.pull).toFixed(1), sendSeconds: +r.seconds.ship.toFixed(1), returnSeconds: +r.seconds.pull.toFixed(1), heldSeconds: Math.round(held), costUSD: +tries.reduce((a, x) => a + (x.costUSD ?? 0), costOf(got.worker, held)).toFixed(4), tries, inputs: inputs.length };
      logLine(dir, `${new Date().toISOString()} ${job.kind ?? 'painting'} ${path.basename(job.out)} on ${got.worker.name}: waited ${render.waitSeconds} s, painted ${render.paintSeconds} s, copied ${render.copySeconds} s, $${render.costUSD}${attempt > 1 ? ', second try' : ''}`);
      return { done: r.done, stopped: r.stopped ?? null, endedEarly: r.endedEarly ?? false, render };
    } catch (e) {
      if (!(e instanceof WorkerFailure)) throw e;
      const held = (Date.now() - t) / 1000;
      tries.push({ worker: got.worker.name, kind: got.worker.kind, ok: false, why: e.message, seconds: Math.round(held), costUSD: costOf(got.worker, held) });
      logLine(dir, `${new Date().toISOString()} ${job.kind ?? 'painting'} ${path.basename(job.out)} FAILED on ${got.worker.name}: ${e.message}`);
      avoid = got.worker.name;
      if (fs.existsSync(job.out)) fs.rmSync(job.out, { recursive: true, force: true });
    } finally { release(dir, got.slot); }
  }
  throw new WorkersFailed(`render pool: the painting failed on two workers and is not painted anywhere else: ${tries.map(t => `${t.worker}: ${t.why}`).join('; ')}`);
}

const logLine = (dir, line) => { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'log.txt'), line + '\n'); };

/**
 * Wait for a free place (FIFO among the pool's waiting jobs) and claim it. {slot, worker}. tick(why) is called at each
 * look while it waits (final-wait.mjs: a line a minute, and the stop past the final's limit).
 */
async function takePlace({ dir, env, id, commit, avoid, gpuCount, kind, remoteFor, pollMs, daemonAlive, tick }) {
  const w = path.join(dir, 'waiting', `${id}.json`); writeJson(w, { id, pid: process.pid, since: Date.now(), commit, kind });
  const most = Number(env.UNPAINT_POOL_LOCAL ?? DEFAULT_LOCAL); let goneSince = null;
  try {
    for (;;) {
      const mini = readJson(path.join(dir, 'mini.json')), pods = readJson(path.join(dir, 'pods.json'))?.pods ?? [];
      // the second try goes to another worker when the pool has one, else to the same again
      const only = env.UNPAINT_POOL_ONLY ? env.UNPAINT_POOL_ONLY.split(',') : null, any = places({ pods, mini, local: most, commit, kind, only });
      // a painting waits for a pod, and a pod comes only from the pods daemon: a daemon whose process lives is waited for
      // however stale its heartbeat (it is busy setting up a pod); one that is gone is waited for a while, then a plain stop
      const podsAt = readJson(path.join(dir, 'pods.json'))?.updated, nowS = Date.now() / 1000;
      let why = 'every place is busy';
      if (POD_KINDS.has(kind)) {
        const state = podsDaemon({ updated: podsAt, nowS, processAlive: daemonAlive() }), said = `${path.join(dir, 'pods.json')} ${podsAt ? `last written ${Math.round(nowS - podsAt)} s ago` : 'is missing'}`;
        if (state === 'never') throw new Error(`render pool: a full-size painting is painted on a pod, and the pods daemon is not running (${said}, no daemon process); start it: python3 tools/cloud/render-pool-pods.py ${dir}`);
        if (state === 'gone') { goneSince ??= nowS; if (nowS - goneSince > DAEMON_GONE_GRACE_S) throw new Error(`render pool: a full-size painting is painted on a pod, and the pods daemon has stopped (${said}, no daemon process for ${Math.round((nowS - goneSince) / 60)} min); start it: python3 tools/cloud/render-pool-pods.py ${dir}`); why = `the pods daemon's process is gone (${said}); waiting ${Math.round(DAEMON_GONE_GRACE_S / 60)} min for it to be started again`; }
        else { goneSince = null; if (state === 'busy') why = `the pods daemon is busy (${said}; its process lives)`; else why = 'waiting for a pod'; }
      }
      const held = claims(dir), free = (any.some(p => p.worker.name !== avoid) ? any.filter(p => p.worker.name !== avoid) : any).filter(p => !held[p.slot]);
      // this Mac only while no other GPU painting runs on it; the mini only while its own runner leaves it room
      // (a claim of the mini whose painter has not started yet is not in its count of painters)
      const open = []; let onMini;
      for (const p of free) {
        if (p.worker.kind === 'local' && gpuCount() >= most) continue;
        if (p.worker.kind === 'mini') {
          onMini ??= await miniBusy(remoteFor(p.worker));
          const pending = Object.entries(held).filter(([s, c]) => s.startsWith('mini-') && !c.started).length;
          if (!onMini || onMini.running + pending >= Math.min(onMini.most, p.worker.slots)) continue;
        }
        open.push(p);
      }
      const rank = waitRank(dir, id);
      if (open.length > rank) for (const p of open) if (claim(dir, p.slot, { job: id, kind, worker: p.worker.name })) return p;
      tick(why);
      await sleep(pollMs + Math.random() * 1000);
    }
  } finally { fs.rmSync(w, { force: true }); }
}
