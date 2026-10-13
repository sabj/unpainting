// The code a painting was made with. Every run writes code-state.json beside the painting (the commit, the tracked
// files that differ from it, a sha256 of `git diff HEAD`, and each untracked source file under src/, tools/ and data/
// with its sha256) and logs one line. A dirty tree is refused unless --allowdirty 1 is given: bench runs once
// recorded a clean commit SHA while painting with uncommitted edits.
//
// A copy of the code without git metadata (a sweep archive) records commit null, says so loudly, and paints; the
// harness that unpacked it records which commit it was.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SOURCE_FILE = /\.(mjs|cjs|js|py|json|wgsl)$/;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const lines = b => b.toString().split('\n').filter(Boolean);

/** { commit, git, dirty, tracked: [file], untracked: [{ file, sha256 }], diffSha256 } for the checkout at root. */
export function codeState(root) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
  let commit;
  try { commit = git('rev-parse', 'HEAD').toString().trim(); } catch { return { commit: null, git: false, dirty: null, tracked: [], untracked: [], diffSha256: null }; }
  const tracked = lines(git('status', '--porcelain', '--untracked-files=no')).map(l => l.slice(3));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard', '--', 'src', 'tools', 'data')).filter(f => SOURCE_FILE.test(f))
    .map(file => ({ file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
  return { commit, git: true, dirty: tracked.length + untracked.length > 0, tracked, untracked, diffSha256: tracked.length ? sha256(git('diff', 'HEAD', '--binary')) : null };
}

/** Writes code-state.json in out, logs the state, and throws on a dirty tree unless allowDirty. */
export function checkCodeState({ root, out, allowDirty = false, log = console.log, state = codeState(root) }) {
  fs.writeFileSync(path.join(out, 'code-state.json'), JSON.stringify({ ...state, allowDirty }, null, 2));
  if (!state.git) { log(`!!! code: ${root} has no git metadata; this run records no commit`); return state; }
  const short = state.commit.slice(0, 8);
  if (!state.dirty) { log(`code: ${short}, clean`); return state; }
  const what = `${state.tracked.length} changed tracked files, ${state.untracked.length} untracked source files, diff sha256 ${state.diffSha256?.slice(0, 12) ?? 'none'}`;
  if (!allowDirty) throw new Error(`code: ${short} has uncommitted changes (${what}); commit them, or pass --allowdirty 1 to paint anyway`);
  log(`!!! code: ${short} plus uncommitted changes (${what}), painted under --allowdirty 1`);
  return state;
}
