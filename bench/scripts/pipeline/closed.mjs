// Level 1's model command, closed the way a level 2 to 4 session is (tools/paint/session.mjs, session-net.mjs): the
// whole process tree runs under this harness's seatbelt profile, out only through a gate on loopback that passes the
// model's own service, with the fixed toolbox first on PATH and a clean environment. What it keeps: its attempt's
// folder (the worktree with the kit, the tips and its outputs, the target picture to look at, its temporary folder),
// node and the node modules the kit needs (read only), and its own process to paint in. Nothing of the repository,
// the home folder, other users, other volumes or another session can be read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REPO } from '../lib.mjs';
import { seatbelt, cleanEnv, SIGN_IN_EXPOSURE } from '../../../tools/paint/session.mjs';
import { PROVIDER_HOSTS, startGate, makeToolbox, proxyEnv } from '../../../tools/paint/session-net.mjs';
import { mainCheckoutOf, segPythonFor } from '../../../tools/paint/run.mjs';

const real = d => { try { return fs.realpathSync(d); } catch { return d; } };
const above = d => { const out = []; for (let p = path.dirname(d); p !== path.dirname(p); p = path.dirname(p)) out.push(p); return out; };
const which = cli => { try { return real(execFileSync('/usr/bin/which', [cli], { encoding: 'utf8' }).trim()); } catch { return null; } };

/** The runners level 1 can close: the ones whose service the gate knows. Any other is refused before it starts. */
export function closable(runner) {
  if (runner === 'dry-run' || PROVIDER_HOSTS[runner]) return;
  throw new Error(`level 1 runs closed (no network but the model's own service, nothing readable outside its folder), and the ${runner} runner has no gate yet: its service's hosts are not in tools/paint/session-net.mjs PROVIDER_HOSTS (${Object.keys(PROVIDER_HOSTS).join(', ')} have them). It is not started open`);
}

/** What one runner's command reads and writes of the home folder to sign in and run (as session.mjs sessionCall). */
function ofRunner(runner, home) {
  if (runner === 'claude') {
    const bin = which('claude');
    return { readable: [...(bin ? [path.dirname(bin)] : []), path.join(home, 'Library', 'Keychains')], write: [], metadata: [path.join(home, '.local', 'bin'), path.join(home, '.local', 'bin', 'claude'), home], signIn: true,
      env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      // its own sandbox off inside ours (two do not nest), no user settings (the home folder is hidden), nothing kept of the session there
      args: a => [...a, ...(a.includes('--settings') ? [] : ['--settings', JSON.stringify({ sandbox: { enabled: false } })]), ...(a.includes('--setting-sources') ? [] : ['--setting-sources', 'project']), ...(a.includes('--no-session-persistence') ? [] : ['--no-session-persistence'])] };
  }
  if (runner === 'agy') {
    const bin = which('agy');
    return { readable: [...(bin ? [bin] : []), path.join(home, 'Library', 'Application Support', 'antigravity'), path.join(home, 'Library', 'Keychains')], write: [path.join(home, '.gemini')], metadata: [...(bin ? [path.dirname(bin)] : []), home], signIn: true, env: { DO_NOT_TRACK: '1' }, args: a => a };
  }
  return { readable: [], write: [], metadata: [], signIn: false, env: {}, args: a => a };
}

/**
 * The closed form of a turn's command `c` ({cmd, args, env?, stdinFile?}) for `runner`, in the attempt's folder `tmp`
 * (its worktree, its scratch and its pictures are inside it). Resolves {cmd, args, env (the whole environment the
 * command is started with), stdinFile, profile, closed (in words), can(file) (whether a file is readable under the
 * profile), done() -> {gated, passed, refused}}. Throws for a runner that cannot be closed, or when the toolbox's
 * Python is missing: nothing is started open.
 */
export async function closeTurn(c, { runner, tmp, extraEnv = {}, repo = REPO, home = os.homedir(), env = process.env, python = segPythonFor(repo, env) }) {
  closable(runner);
  const own = real(tmp), r = ofRunner(runner, home);
  const toolbox = makeToolbox(python, { pathNow: env.PATH ?? '/usr/bin:/bin' }), gate = await startGate(PROVIDER_HOSTS[runner] ?? []);
  // nothing of the repository (this checkout, the main one it is a worktree of, and so every worktree and raw run under them)
  const deny = [...new Set([repo, mainCheckoutOf(repo), ...(env.UNPAINT_SESSION_DENY ?? '').split(':').filter(Boolean).map(d => path.resolve(d))].filter(Boolean).flatMap(d => [d, real(d)]))];
  // read only: the node modules the kit imports (the worktree's link leads into the repository), node itself, the toolbox
  const node = real(process.execPath), modules = real(path.join(repo, 'node_modules'));
  const readable = [...new Set([path.join(repo, 'node_modules'), modules, path.dirname(path.dirname(node)), ...toolbox.readable, ...r.readable])];
  const profile = seatbelt({ deny, write: [...new Set([...r.write, real(os.tmpdir()), '/private/tmp', '/private/var/folders'])], cwd: own, local: true, gated: true, readable,
    hidden: [...new Set([home, real(home), '/Users', '/Volumes'])],
    // node resolves a module by looking at every folder above it: the folders above the node modules may be seen to exist (never listed or read)
    metadata: [...new Set([...r.metadata, ...above(path.join(repo, 'node_modules')), ...above(modules)])] });
  const can = file => { try { execFileSync('sandbox-exec', ['-p', profile, '/bin/cat', file], { stdio: 'pipe' }); return true; } catch { return false; } };
  const done = async () => { await gate.stop(); fs.rmSync(toolbox.dir, { recursive: true, force: true }); return { gated: true, passed: gate.passed, refused: gate.refused }; };
  return { cmd: 'sandbox-exec', args: ['-p', profile, c.cmd, ...r.args(c.args)], stdinFile: c.stdinFile, profile, can, done, gate,
    env: { ...cleanEnv(env), ...extraEnv, ...(c.env ?? {}), ...r.env, ...proxyEnv(gate.url), ...toolbox.env },
    closed: `the whole command runs under a seatbelt profile of this harness: it reads and writes its attempt's folder and temporary folders, reads node, its node modules and the toolbox, and nothing else of the repository, the home folder${r.signIn ? ` (but its program and its sign-in: ${SIGN_IN_EXPOSURE})` : ''}, other users, other volumes or other sessions; it reaches only this machine's loopback, where a gate ${PROVIDER_HOSTS[runner] ? 'passes its own service\'s hosts and refuses every other' : 'refuses every host'} (no downloads, no installs)` };
}

/** The profile tried before the model is started (as tools/paint/cli.mjs does): a file of the repository must not be readable, the brief must be. */
export function probe(turn, { repoFile = path.join(REPO, 'package.json'), ownFile }) {
  if (turn.can(repoFile)) throw new Error('level 1\'s sandbox does not hold: a file of the repository can be read under it; the model is not started');
  if (!turn.can(ownFile)) throw new Error(`level 1's sandbox cannot be started on this machine (${ownFile}, in the attempt's own folder, is not readable under it); the model is not started`);
}
