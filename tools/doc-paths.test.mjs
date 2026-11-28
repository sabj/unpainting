// docs/how-it-paints.md is the pipeline contract. Every file or folder it names must exist, so the doc cannot go
// stale silently when a module is renamed or removed. A path is a code span or a link target that starts at a repo
// folder (src/, tools/, docs/, bench/, examples/) or names a file with a code extension.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = 'docs/how-it-paints.md';
const ROOTS = /^(src|tools|docs|bench|examples|\.agents|\.claude)\//;
const EXT = /\.(mjs|js|py|json|md|wgsl)$/;

function namedPaths(text, docDir = 'docs') {
  const found = new Map();
  const add = (raw, base, link = false) => {
    let p = raw.trim().replace(/[#:].*$/, '').replace(/[),.;]+$/, '');
    if (!p || /[\s<>*{}|]|^https?:|^--|^\.\.\.|\$/.test(p)) return;
    if (!link && !ROOTS.test(p) && !(p.includes('/') && EXT.test(p))) return;
    const abs = path.normalize(path.join(root, base, p));
    found.set(path.relative(root, abs), p);
  };
  for (const m of text.matchAll(/`([^`\n]+)`/g)) add(m[1], '');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1];
    if (/^(https?:|#|mailto:)/.test(t)) continue;
    add(t, docDir, true);
  }
  return found;
}

test('every file or folder named in docs/how-it-paints.md exists', () => {
  const text = fs.readFileSync(path.join(root, DOC), 'utf8');
  const paths = namedPaths(text);
  assert.ok(paths.size >= 15, `expected the doc to name many paths, found ${paths.size}`);
  const missing = [...paths.keys()].filter(p => !fs.existsSync(path.join(root, p)));
  assert.deepEqual(missing, [], `${DOC} names paths that do not exist:\n${missing.join('\n')}`);
});

test('the path finder reads code spans and link targets and skips flags and urls', () => {
  const t = 'See `src/media/sheet.mjs`, `--notargetlooks 1`, [x](../README.md), [y](https://a.b/c.md), `src/nope/` and `a b/c.mjs`.';
  const got = [...namedPaths(t).keys()].sort();
  assert.deepEqual(got, ['README.md', 'src/media/sheet.mjs', 'src/nope']);
});

test('the pipeline contract is the one doc: the merged docs are gone', () => {
  for (const gone of ['docs/pipelines.md', 'docs/plans.md']) assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} was merged into ${DOC}`);
});
