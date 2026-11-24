import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveSubjects, planPrepare, poolSummary, runSummary } from './unpaint.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const CLI = path.join(HERE, 'unpaint.mjs');
const ROOT = path.resolve(HERE, '..');

test('unpaint --help lists all subcommands cleanly', () => {
  const out = execFileSync(process.execPath, [CLI, '--help'], { cwd: ROOT, encoding: 'utf8' });
  for (const cmd of ['paint', 'prepare', 'benchmark', 'pods', 'score', 'status']) {
    assert.match(out, new RegExp(`\\b${cmd}\\b`), `help lists ${cmd}`);
  }
});

test('resolveSubjects expands core/extended sets and explicit lists', () => {
  const core = resolveSubjects('core');
  assert.equal(core.length, 5);
  assert.ok(core.includes('mittens-closeup-qs') && core.includes('turner-esseillon-qs'));
  const ext = resolveSubjects('extended');
  assert.equal(ext.length, 15);
  assert.deepEqual(resolveSubjects('mittens-closeup-qs,turner-esseillon-qs'), ['mittens-closeup-qs', 'turner-esseillon-qs']);
});

test('planPrepare builds local and pool commands accurately', () => {
  const local = planPrepare(['core', '--jobs', '3', '--dry-run']);
  assert.equal(local.pool, 'local');
  assert.equal(local.subjects.length, 5);
  assert.deepEqual(local.env, {});
  assert.ok(local.args.includes('prepare') && local.args.includes('--level') && local.args.includes('L3') && local.args.includes('--jobs') && local.args.includes('3') && local.args.includes('--dry-run'));

  const pooled = planPrepare(['mittens-closeup-qs', '--pool', 'mini,pod', '--level', 'L2']);
  assert.equal(pooled.env.UNPAINT_RENDER, 'pool');
  assert.equal(pooled.env.UNPAINT_POOL_ONLY, 'mini,pod');
  assert.ok(!pooled.args.includes('--jobs'));
});

test('poolSummary and runSummary report state accurately on temp folders', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unpaint-cli-test-'));
  try {
    const pDir = path.join(tmp, 'pool');
    fs.mkdirSync(path.join(pDir, 'claims'), { recursive: true });
    fs.mkdirSync(path.join(pDir, 'waiting'), { recursive: true });
    fs.writeFileSync(path.join(pDir, 'mini.json'), JSON.stringify({ host: 'mini', slots: 2 }));
    fs.writeFileSync(path.join(pDir, 'pods.json'), JSON.stringify({ updated: Math.floor(Date.now() / 1000) - 9999, pods: [], adding: 0, target: 0, live: 0, spentUSD: 1.5 }));
    const p = poolSummary(pDir);
    assert.deepEqual(p.mini, { host: 'mini', slots: 2 });
    assert.equal(p.daemonState, 'gone');
    assert.equal(p.podsLive, 0);
    assert.equal(p.waitingCount, 0);

    const rDir = path.join(tmp, 'run');
    fs.mkdirSync(path.join(rDir, 'a'), { recursive: true });
    fs.mkdirSync(path.join(rDir, 'b'), { recursive: true });
    fs.writeFileSync(path.join(rDir, 'launch.json'), JSON.stringify({ commit: 'abcdef123456', runs: [{ folder: 'a' }, { folder: 'b' }, { folder: 'c' }] }));
    fs.writeFileSync(path.join(rDir, 'a', 'run.json'), JSON.stringify({ failure: null }));
    fs.writeFileSync(path.join(rDir, 'b', 'run.json'), JSON.stringify({ failure: 'failed' }));
    const r = runSummary(rDir);
    assert.deepEqual(r, { dir: path.resolve(rDir), commit: 'abcdef12', total: 3, finished: 1, failed: 1, pending: 1 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('unpaint benchmark dry-run prints the 160-session plan and starts nothing', () => {
  const out = execFileSync(process.execPath, [CLI, 'benchmark', '--out', '/tmp/unpaint-dry-check', '--set', 'core', '--models', 'neon-m,sonnet-m,wonderfull-m,sol-m'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /80 sessions at once \(4 models; L1, L2, L3, L4; set core\)/);
  assert.match(out, /nothing started \(add --start\)/);
});

test('unpaint pods status runs cleanly without mutating state', () => {
  const out = execFileSync(process.execPath, [CLI, 'pods', 'status'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /Render pool:/);
  assert.match(out, /Pod renter:/);
});
