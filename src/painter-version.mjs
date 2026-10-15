// What made a painting: the release, the painter and sim versions, and the git commit it runs from.
// Every painting records them (tools/paint-plate.mjs writes them into frames.json and backend.json), and every
// benchmark run.json records them, so a result can always be traced to what made it. docs/versions.md explains the scheme.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The painter version: planning, recipe, methods and techniques (src/paint). The internal V number. Bump it when they change. */
export const PAINTER_VERSION = 'V099-dev';
/** Simulation version for paper, water, pigment, brush and pen. Bump when src/media behavior changes.
 * The initial value is documented in docs/versions.md. */
export const SIM_VERSION = '102';
/** Benchmark panel, rubric and image protocol. Bump for any change to judging. */
export const JUDGE_VERSION = 'J1';
export const JUDGE_RE = /^J[1-9]\d*$/;

export const PAINTER_RE = /^V\d{3,}(?:-dev)?$/;
export const SIM_RE = /^\d+$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** The release: the semver in package.json, such as "0.1.0". */
export function release(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !SEMVER_RE.test(pkg.version)) {
    throw Error(`package.json version must be semver, got ${JSON.stringify(pkg.version)}`);
  }
  return pkg.version;
}

/** The commit this checkout runs from, with "-dirty" when tracked files differ from it; null outside a git checkout. */
export function commit(root = ROOT) {
  try {
    const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const sha = git(['rev-parse', 'HEAD']);
    const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

/** All four, as the fields a painting or run.json records. */
export const versionStamp = (root = ROOT) => ({
  release: release(root), painterVersion: PAINTER_VERSION, simVersion: SIM_VERSION, commit: commit(root),
});

/** Format painter, simulator and release versions for logs and result pages. */
export const versionLine = ({ painterVersion, simVersion, release: rel }) => `painter ${painterVersion} · sim ${simVersion} · release ${rel}`;
