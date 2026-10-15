// node --test bench/scripts/link-v4.test.mjs   (npm run bench:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RUNS, readJson, writeJson } from './lib.mjs';
import { linkV4Try1, LINK_NOTE } from './pipeline/link-v4.mjs';

/** An outRoot holding a copy of a published V4 try 1, with its score status set. */
function fixture(status) {
  const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'link-v4-'));
  const src = path.join(outRoot, 'v4-pipeline', 'opus', '1');
  fs.cpSync(path.join(RUNS, 'v4-pipeline', 'opus', '1'), src, { recursive: true });
  const run = readJson(path.join(src, 'run.json'));
  writeJson(path.join(src, 'run.json'), { ...run, score: { ...run.score, status } });
  return outRoot;
}

test('--link-v4-try1 copies a scored V4 try 1 as V5 try 1, marked as the same session', () => {
  const outRoot = fixture('scored');
  linkV4Try1({ outRoot, modelKey: 'opus' });
  const v5 = readJson(path.join(outRoot, 'v5-self-study', 'opus', '1', 'run.json'));
  assert.equal(v5.round, 'V5');
  assert.equal(v5.settings.learnsBetweenTries, true);
  for (const e of Object.values(v5.crops)) assert.equal(e.pipeline.linkedFrom, LINK_NOTE);
  const v4 = readJson(path.join(outRoot, 'v4-pipeline', 'opus', '1', 'run.json'));
  assert.equal(v4.round, 'V4');
});

test('--link-v4-try1 refuses an unscored V4 try 1', () => {
  assert.throws(() => linkV4Try1({ outRoot: fixture('unscored'), modelKey: 'opus' }), /score it first/);
});
