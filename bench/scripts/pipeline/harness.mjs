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

/** A detached worktree with benchmark records and model instructions removed. */
export function makeWorktree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-bench-'));
  const ws = path.join(tmp, 'ws');
  const git = (...a) => execFileSync('git', a, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  git('worktree', 'add', '--detach', '-q', ws, 'HEAD');
  for (const p of ['.claude', '.agents', 'AGENTS.md', 'CLAUDE.md', 'bench', 'work', 'examples/targets', 'docs/reviews']) fs.rmSync(path.join(ws, p), { recursive: true, force: true });
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'node_modules'));
  fs.mkdirSync(path.join(ws, 'bench'), { recursive: true });
  let gone = false;
  const cleanup = () => {
    if (gone) return; gone = true; LIVE.trees.delete(cleanup);
    try { git('worktree', 'remove', '--force', ws); } catch { /* already gone */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  trap(); LIVE.trees.add(cleanup);
  return { ws, tmp, cleanup };
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
 */
export function runTurn(c, { cwd, env = {}, events, stderr, capMs, tick = null, tickMs = 500 }) {
  return new Promise(resolve => {
    const out = fs.openSync(events, 'a'), err = fs.openSync(stderr, 'a');
    const stdin = c.stdinFile ? fs.openSync(c.stdinFile, 'r') : 'ignore';
    const t0 = Date.now();
    const child = spawn(c.cmd, c.args, { cwd, env: { ...process.env, ...env, ...(c.env || {}) }, stdio: [stdin, out, err], detached: true });
    trap(); LIVE.turns.add(child.pid);
    let reason = null, done = false;
    const stop = why => {
      if (reason || done) return; reason = why;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
      setTimeout(() => { if (!done) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 20000).unref();
    };
    const timer = setTimeout(() => stop('the wall-clock limit'), capMs);
    const ticker = tick ? setInterval(() => { try { tick({ stop }); } catch (e) { fs.appendFileSync(stderr, `harness tick: ${e.stack || e}\n`); } }, tickMs) : null;
    const end = code => {
      if (done) return; done = true; LIVE.turns.delete(child.pid);
      clearTimeout(timer); if (ticker) clearInterval(ticker);
      for (const fd of [out, err, ...(typeof stdin === 'number' ? [stdin] : [])]) try { fs.closeSync(fd); } catch { /* closed */ }
      resolve({ code, killed: Boolean(reason), reason, seconds: (Date.now() - t0) / 1000 });
    };
    child.on('exit', code => end(code));
    child.on('error', e => { fs.appendFileSync(stderr, String(e) + '\n'); end(-1); });
  });
}

/** Seconds -> minutes, one decimal. */
export const minutes = s => Math.round(s / 6) / 10;
