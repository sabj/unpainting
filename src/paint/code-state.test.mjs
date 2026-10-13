import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { codeState, checkCodeState } from './code-state.mjs';

const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { stdio: 'ignore' });

test('a run records its commit and refuses uncommitted edits unless --allowdirty', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-state-')), out = path.join(dir, 'out');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(out);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n');
  fs.writeFileSync(path.join(dir, 'src/a.mjs'), 'export const a = 1;\n');
  git(dir, 'init', '-q'); git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'a');
  const logs = [];
  const clean = checkCodeState({ root: dir, out, log: s => logs.push(s) });
  assert.equal(clean.dirty, false);
  assert.match(clean.commit, /^[0-9a-f]{40}$/);
  assert.match(logs[0], /clean/);
  fs.writeFileSync(path.join(dir, 'src/a.mjs'), 'export const a = 2;\n');
  assert.throws(() => checkCodeState({ root: dir, out, log: () => {} }), /uncommitted changes \(1 changed tracked files.*--allowdirty 1/);
  const dirty = checkCodeState({ root: dir, out, allowDirty: true, log: s => logs.push(s) });
  assert.deepEqual(dirty.tracked, ['src/a.mjs']);
  assert.match(dirty.diffSha256, /^[0-9a-f]{64}$/);
  assert.match(logs.at(-1), /^!!! code: .*--allowdirty 1/);
  const saved = JSON.parse(fs.readFileSync(path.join(out, 'code-state.json'), 'utf8'));
  assert.equal(saved.dirty, true); assert.equal(saved.allowDirty, true);
  git(dir, 'checkout', '-q', '--', 'src/a.mjs');
  fs.writeFileSync(path.join(dir, 'src/new.mjs'), 'export const b = 1;\n');
  assert.throws(() => checkCodeState({ root: dir, out, log: () => {} }), /1 untracked source files/);
  assert.equal(codeState(dir).untracked[0].file, 'src/new.mjs');
});

test('a copy without git metadata records no commit and still paints', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-state-nogit-'));
  try {
    const logs = [], s = checkCodeState({ root: dir, out: dir, log: m => logs.push(m) });
    assert.equal(s.commit, null); assert.equal(s.git, false);
    assert.match(logs[0], /no git metadata/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
