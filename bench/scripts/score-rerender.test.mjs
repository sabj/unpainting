// The adapter turns rerender output into try folders that score.mjs reads unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runRerender } from './rerender.mjs';
import { fakePainter } from './rerender-fixtures.mjs';
import { buildTryFolders } from './score-rerender.mjs';
import { validateRun, readJson, BENCH } from './lib.mjs';

const doctor = () => ({ ok: true, failures: [] });
const verify = () => {};
const stampOf = commit => () => ({ release: '0.3.1', painterVersion: 'V103', simVersion: '104', commit, dirtyHash: null });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'score-rerender-'));
const render = (out, painter, commit = 'abc1234') => runRerender(['--models', 'opus', '--tries', '1', '--subjects', 'hills,mittens', '--out', out], { run: painter.run, verify, doctor, stamp: stampOf(commit) });

test('builds a valid J1 try folder on the Together route, with full-size finals and stage frames linked, not copied', async () => {
  const from = tmp(), to = tmp();
  try {
    await render(from, await fakePainter());
    const res = buildTryFolders({ from, out: to });
    assert.equal(res.tries.length, 1);
    const tryDir = path.join(to, 'v4-pipeline', 'opus', '1');
    const run = readJson(path.join(tryDir, 'run.json'));
    assert.deepEqual(validateRun(run), []);
    assert.equal(run.round, 'V4');
    assert.equal(run.judgeVersion, 'J1');
    assert.equal(run.settings.judgeRoute, 'together');
    assert.equal(run.release, '0.3.1');
    assert.equal(run.commit, 'abc1234');
    assert.deepEqual(run.settings.crops, ['hills', 'mittens']);
    assert.equal(run.painter.key, 'opus');
    assert.equal(run.crops.hills.pipeline.outcome, 'painted');
    assert.equal(run.crops.hills.pipeline.rerender, true);
    assert.equal(run.crops.hills.strokes, 123);
    assert.equal(run.guard.blockedImageReads, 0);
    const raw = path.join(BENCH, run.raw);
    assert.ok(fs.existsSync(path.join(raw, 'out', 'hills', 'final.png')));
    for (const s of [10, 25, 50, 75, 100]) assert.ok(fs.existsSync(path.join(raw, 'out', 'hills', 'frames', `stage-${s}.png`)));
    const src = path.join(from, 'v4-pipeline', 'opus', '1', 'hills-raw', 'painting.png');
    assert.equal(fs.statSync(path.join(raw, 'out', 'hills', 'final.png')).ino, fs.statSync(src).ino, 'hard link, no second copy');
    assert.ok(fs.existsSync(path.join(raw, 'hills', 'painting', 'out', 'cheat-risk.json')));
    assert.ok(fs.existsSync(path.join(tryDir, 'hills.webp')));
    assert.ok(fs.existsSync(path.join(tryDir, 'hills-stages.webp')));
  } finally { fs.rmSync(from, { recursive: true, force: true }); fs.rmSync(to, { recursive: true, force: true }); }
});

test('score.mjs --dry-run accepts the folder unchanged and reads the painter cheat-risk record', async () => {
  const from = tmp(), to = tmp();
  try {
    await render(from, await fakePainter());
    buildTryFolders({ from, out: to });
    const tryDir = path.join(to, 'v4-pipeline', 'opus', '1');
    const r = spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'score.mjs'), tryDir, '--dry-run'], { encoding: 'utf8', env: { ...process.env, TOGETHER_API_KEY: '', OPENROUTER_API_KEY: '' } });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /no stage frames|no .*final\.png/);
    const run = readJson(path.join(tryDir, 'run.json'));
    assert.equal(run.score.status, 'dry-run');
    assert.equal(run.cheat.risk.score, 0.2);
    assert.equal(run.cheat.progressionRisk.score, 0.1);
    assert.deepEqual(validateRun(run), []);
  } finally { fs.rmSync(from, { recursive: true, force: true }); fs.rmSync(to, { recursive: true, force: true }); }
});

test('a failed job is listed as unpainted and the try is not complete; unfinished jobs are not scored as paintings', async () => {
  const from = tmp(), to = tmp();
  try {
    await render(from, await fakePainter({ failFor: 'mittens' }));
    buildTryFolders({ from, out: to });
    const run = readJson(path.join(to, 'v4-pipeline', 'opus', '1', 'run.json'));
    assert.deepEqual(Object.keys(run.crops), ['hills']);
    assert.equal(run.unpainted.mittens.pipeline.outcome, 'render-failed');
    assert.equal(run.complete, false);
    assert.deepEqual(validateRun(run), []);
  } finally { fs.rmSync(from, { recursive: true, force: true }); fs.rmSync(to, { recursive: true, force: true }); }
});

test('refuses a try whose jobs ran at different commits', async () => {
  const from = tmp(), to = tmp();
  try {
    const p = await fakePainter();
    await render(from, p, 'abc1234');
    await runRerender(['--models', 'opus', '--tries', '1', '--subjects', 'mittens', '--out', from, '--force'], { run: p.run, verify, doctor, stamp: stampOf('def5678') });
    assert.throws(() => buildTryFolders({ from, out: to }), /different commits/);
  } finally { fs.rmSync(from, { recursive: true, force: true }); fs.rmSync(to, { recursive: true, force: true }); }
});

test('an absent or error cheat-risk record is left out so score.mjs does not read a missing risk', async () => {
  const from = tmp(), to = tmp();
  try {
    await render(from, await fakePainter({ risk: { error: 'x', level: null, review: true } }));
    const res = buildTryFolders({ from, out: to });
    const run = readJson(path.join(to, 'v4-pipeline', 'opus', '1', 'run.json'));
    assert.ok(!fs.existsSync(path.join(BENCH, run.raw, 'hills', 'painting', 'out', 'cheat-risk.json')));
    assert.match(res.tries[0].warnings.join(' '), /cheat-risk/);
  } finally { fs.rmSync(from, { recursive: true, force: true }); fs.rmSync(to, { recursive: true, force: true }); }
});
