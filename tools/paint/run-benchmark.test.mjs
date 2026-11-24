import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planRuns, manifestOf, needsAutoPainting, sessionFolder, L4_MINUTES } from './run-benchmark.mjs';
import { picturesAt } from './run-sets.mjs';

test('the whole benchmark at once: models x core pictures x L1 to L4, each its own independent command; L1 to L3 rounds, L4 an open session', () => {
  const runs = planRuns({ models: ['neon-m', 'opus-m'], levels: ['L1', 'L2', 'L3', 'L4'], pictures: l => picturesAt('core', l).map(p => p.id) });
  assert.equal(runs.length, 2 * 5 * 4); assert.equal(new Set(runs.map(r => r.folder)).size, runs.length);
  for (const r of runs) {
    assert.ok(!r.args.includes('--previous') && !r.args.includes('--try'), `${r.folder}: handed no other level's result`);
    assert.deepEqual(r.args.slice(0, 7), [r.subject, 'paint', '--work', r.level === 'L4' ? 'session' : 'rounds', '--level', r.level, '--author']);
    assert.equal(r.args.includes('--wallminutes'), r.level === 'L4'); assert.ok(!r.args.includes('--looks'), 'the default look budget, 3 units');
    assert.equal(r.folder, sessionFolder(r));
  }
  const l4 = runs.find(r => r.level === 'L4' && r.author === 'opus-m'); assert.deepEqual(l4.args.slice(7), ['opus-m', '--wallminutes', String(L4_MINUTES), '--set', 'video=1', '--set', 'frames=240']);
  assert.deepEqual(needsAutoPainting(runs), picturesAt('core').map(p => p.id), 'L3 and L4 need Auto\'s painting prepared');
  assert.deepEqual(needsAutoPainting(runs.filter(r => r.level === 'L2')), [], 'L2 needs nothing of Auto');
  assert.throws(() => planRuns({ models: ['a'], levels: ['L4-retry'], pictures: () => ['x'] }), /not one of the benchmark's/);
});

test('the manifest lists each session that has ended and Auto\'s run of each picture; one still running is left out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-manifest-'));
  try {
    const launch = { started: 't', commit: 'abc', runs: [{ author: 'a', subject: 's', level: 'L1', folder: 'a-s-L1' }, { author: 'a', subject: 's', level: 'L4', folder: 'a-s-L4' }] };
    fs.mkdirSync(path.join(dir, 'a-s-L1')); fs.writeFileSync(path.join(dir, 'a-s-L1', 'run.json'), '{}'); fs.mkdirSync(path.join(dir, 'a-s-L4'));
    const auto = path.join(dir, 'prepared', 'painting'); fs.mkdirSync(auto, { recursive: true }); fs.writeFileSync(path.join(auto, 'run.json'), '{}');
    const m = manifestOf(dir, launch, [{ subject: 's', folder: auto }]);
    assert.deepEqual(m.runs, [{ folder: 'prepared/painting', subject: 's', author: 'auto', level: 'Auto' }, { folder: 'a-s-L1', subject: 's', author: 'a', level: 'L1' }]); assert.equal(m.commit, 'abc');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
