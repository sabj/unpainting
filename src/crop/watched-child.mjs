// Runs a child process and kills it when it stops using CPU. A SAM job waiting in a Metal command buffer sits at 0% CPU
// for ever; wall time alone cannot tell that from a slow CPU run, so the child's CPU time is sampled and only a child
// whose CPU time has not moved for `idleMs` is killed. No retry, no other device: the caller fails the run.
import { spawn, execFileSync } from 'node:child_process';

export const IDLE_MS = 10 * 60 * 1000;
const POLL_MS = 5000;
// A child counts as busy when its CPU time grew by more than this share of the wall time since the last sample.
const BUSY_SHARE = 0.01;

/** CPU seconds (user + system) the process has used so far, from `ps -o cputime=` ([[dd-]hh:]mm:ss[.ff]); null if gone. */
export function psCpuSeconds(pid) {
  let text;
  try { text = execFileSync('ps', ['-o', 'cputime=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text);
  if (!m) return null;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+m[3]) * 60 + (+m[4]);
}

/**
 * Resolves { stdout, stderr } when the child exits 0. Rejects with Error carrying `.stdout`, `.stderr` and `.code` when
 * it exits non-zero, and with `.idle = true` when it was killed for using no CPU for idleMs, or `.timedOut = true` after
 * maxMs of wall time. `sampleCpu(pid)` and the clocks are parameters so a test can use short times.
 */
export function runWatched(command, args, { cwd, env, idleMs = IDLE_MS, pollMs = POLL_MS, maxMs = Infinity, sampleCpu = psCpuSeconds } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const started = Date.now();
    let lastCpu = 0, lastAt = started, busyAt = started;
    const finish = (fn, value) => { if (settled) return; settled = true; clearInterval(timer); fn(value); };
    const kill = extra => { child.kill('SIGKILL'); finish(reject, Object.assign(new Error(extra.message), { stdout, stderr, code: null, ...extra })); };
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - started >= maxMs) return kill({ timedOut: true, message: `no exit after ${((now - started) / 60000).toFixed(1)} min` });
      const cpu = sampleCpu(child.pid);
      if (cpu === null) return; // gone, or not readable: the exit event decides
      if (cpu - lastCpu > BUSY_SHARE * ((now - lastAt) / 1000)) busyAt = now;
      lastCpu = cpu; lastAt = now;
      if (now - busyAt >= idleMs) kill({ idle: true, idleMinutes: (now - busyAt) / 60000, waitedMinutes: (now - started) / 60000, message: `no CPU used for ${((now - busyAt) / 60000).toFixed(1)} min` });
    }, pollMs);
    child.on('error', e => finish(reject, Object.assign(e, { stdout, stderr })));
    child.on('close', code => {
      if (code === 0) finish(resolve, { stdout, stderr });
      else finish(reject, Object.assign(new Error(`exit ${code}`), { stdout, stderr, code }));
    });
  });
}
