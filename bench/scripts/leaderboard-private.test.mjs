import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, readJson } from './lib.mjs';

test('the leaderboard ceiling names distributed targets only, never a private one', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-private-'));
  try {
    const results = readJson(path.join(BENCH, 'results', 'results.json'));
    results.crops.push({ key: 'secret-subject', name: 'Secret subject', selfScore: 9.99, w: 300, h: 300, style: 'x', distributed: false, file: null });
    const file = path.join(tmp, 'results.json');
    fs.writeFileSync(file, JSON.stringify(results));
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-leaderboard.mjs'), '--results', file], { stdio: 'ignore' });
    const board = fs.readFileSync(path.join(tmp, 'leaderboard.md'), 'utf8');
    assert.ok(!/9\.99|Secret/i.test(board), 'a private target leaked into the leaderboard');
    assert.match(board, /Mittens 8\.76/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
