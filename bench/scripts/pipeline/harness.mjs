// Shared pieces of the V3, V4 and V5 runners: a clean worktree for each session, launching one model turn with a
// time cap and a tick, and keeping what the model wrote.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { REPO } from '../lib.mjs';

// On Ctrl-C or a kill: stop every model turn (each runs in its own process group) and remove every worktree.
const LIVE = { turns: new Set(), trees: new Set() };
let trapped = false;
function trap() {
  if (trapped) return; trapped = true;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
    for (const pid of LIVE.turns) try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ }
    for (const cleanup of LIVE.trees) cleanup();
    process.exit(130);
  });
}

/** A detached worktree with benchmark records and model instructions removed, and a private temporary folder (scratch). */
export function makeWorktree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-'));
  const ws = path.join(tmp, 'ws');
  const git = (...a) => execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('worktree', 'add', '--detach', '-q', ws, 'HEAD');
  for (const p of ['.claude', '.agents', 'AGENTS.md', 'CLAUDE.md', 'bench', 'work', 'examples/targets', 'docs/reviews']) fs.rmSync(path.join(ws, p), { recursive: true, force: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
  fs.mkdirSync(path.join(ws, 'bench'), { recursive: true });
  // the model's own temporary folder: nothing of another session's, and removed with this worktree
  const scratch = path.join(tmp, 'scratch');
  fs.mkdirSync(scratch);
  let gone = false;
  const cleanup = () => {
    if (gone) return; gone = true; LIVE.trees.delete(cleanup);
    try { git('worktree', 'remove', '--force', ws); } catch { /* already gone */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  trap(); LIVE.trees.add(cleanup);
  return { ws, tmp, scratch, cleanup };
}

/** Copy the files the model left in the worktree (untracked, outside what the harness seeded) to dest. */
export function keepScripts(ws, dest, skip) {
  let files = [];
  try { files = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ws }).toString().split('\n').filter(f => f && !skip.test(f)); } catch { /* worktree gone */ }
  for (const f of files) {
    const src = path.join(ws, f);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile() || fs.statSync(src).size > 4e6) continue;
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(src, path.join(dest, f));
  }
  return files.length;
}

/**
 * Run one model turn. c: {cmd, args, stdinFile?, env?} (runners.turnCommand). capMs: wall-clock limit. tick(ctl) runs
 * every tickMs while the turn lasts; ctl.stop(reason) ends it. Resolves to {code, killed, reason, seconds}.
 * base: the environment the turn starts from (this process's; a closed turn gives its own whole environment and {}).
 * piped: see below; a closed turn is always piped.
 */
export function runTurn(c, { cwd, env = {}, base = process.env, piped = false, events, stderr, capMs, tick = null, tickMs = 500, killGraceMs = 20000, cleanupGroup = false }) {
  return new Promise(resolve => {
    const out = fs.openSync(events, 'a'), err = fs.openSync(stderr, 'a');
    const stdin = c.stdinFile && !piped ? fs.openSync(c.stdinFile, 'r') : 'ignore';
    const t0 = Date.now();
    // piped: the turn's output comes to this process and is written to the files here, and its input is fed from
    // here. A closed turn cannot be handed the files themselves: they lie where its profile lets nothing be read, and
    // a program that checks its own output at start (node does) stops on a file it may not look at.
    const child = spawn(c.cmd, c.args, { cwd, env: { ...base, ...env, ...(c.env || {}) }, stdio: piped ? [c.stdinFile ? 'pipe' : 'ignore', 'pipe', 'pipe'] : [stdin, out, err], detached: true });
    if (piped) {
      const to = fd => d => { try { fs.writeSync(fd, d); } catch { /* the file was closed: the turn is over */ } };
      child.stdout.on('data', to(out)); child.stderr.on('data', to(err));
      if (c.stdinFile) { child.stdin.on('error', () => {}); fs.createReadStream(c.stdinFile).pipe(child.stdin); }
    }
    trap(); LIVE.turns.add(child.pid);
    let reason = null, done = false, exited = false, cleaning = false, cleaned = false, exitCode = null, exitAt = null;
    const finish = () => {
      if (done || !exited || (cleaning && !cleaned)) return;
      done = true; LIVE.turns.delete(child.pid);
      for (const fd of [out, err, ...(typeof stdin === 'number' ? [stdin] : [])]) try { fs.closeSync(fd); } catch { /* closed */ }
      resolve({ code: exitCode, killed: Boolean(reason), reason, seconds: (exitAt - t0) / 1000, cleanupSeconds: (Date.now() - exitAt) / 1000 });
    };
    const clean = () => {
      if (cleaning) return;
      cleaning = true;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { cleaned = true; finish(); return; }
      // Keep this timer referenced and do not resolve while local tool descendants can still be running.
      // A remote provider daemon is outside this process group; this is not a claim of provider-side cancellation.
      setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
        cleaned = true; finish();
      }, killGraceMs);
    };
    const stop = why => {
      if (reason || done) return; reason = why;
      clean();
    };
    const timer = setTimeout(() => stop('the wall-clock limit'), capMs);
    const ticker = tick ? setInterval(() => { try { tick({ stop }); } catch (e) { fs.appendFileSync(stderr, `harness tick: ${e.stack || e}\n`); } }, tickMs) : null;
    const end = code => {
      if (exited) return; exited = true; exitCode = code; exitAt = Date.now();
      clearTimeout(timer); if (ticker) clearInterval(ticker);
      if (cleanupGroup && child.pid) clean();
      finish();
    };
    // piped: what the turn wrote last is still on its way when it exits; wait for its output to close (a moment at most:
    // a process it left behind may hold the pipe open)
    child.on('exit', code => { if (!piped) { end(code); return; } const late = setTimeout(() => end(code), 3000); child.on('close', () => { clearTimeout(late); end(code); }); });
    child.on('error', e => { fs.appendFileSync(stderr, String(e) + '\n'); end(-1); });
  });
}

/** Seconds -> minutes, one decimal. */
export const minutes = s => Math.round(s / 6) / 10;
