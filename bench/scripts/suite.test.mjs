import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { BENCH, loadRuns, readJson, writeJson } from './lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import sharp from 'sharp';
import { suitePlan } from './suite.mjs';
import { benchmarkProfile } from './profiles.mjs';

test('offline lite completes one plan/check/render with no self-view or repair, keeping stages and compact stroke counts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-e2e-'));
  let raw;
  try {
    const result = spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'run.mjs'), '--dry-run', '--round', 'V4', '--crops', 'hills', '--out', root],
      { encoding: 'utf8', timeout: 120000 });
    assert.equal(result.status, 0, result.stderr);
    const r = readJson(path.join(root, 'v4-pipeline', 'dry-run', '1', 'run.json'));
    raw = path.join(BENCH, r.raw);
    assert.equal(r.settings.benchmarkProfile, 'lite-v1'); assert.equal(r.complete, true);
    assert.equal(r.session.tokens, null); assert.equal(r.session.usageComplete, false);
    const c = r.crops.hills, p = c.pipeline;
    assert.equal(p.paintedBy.startsWith('harness'), true); assert.equal(p.looks, 0); assert.equal(p.revisions, 0);
    assert.deepEqual(p.repairTurns, []); assert.equal(p.renderBackend, 'cpu'); assert.ok(c.strokes > 0);
    for (const n of [10, 25, 50, 75, 100]) assert.ok(fs.existsSync(path.join(raw, 'out', 'hills', 'frames', `stage-${n}.png`)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); if (raw) fs.rmSync(raw, { recursive: true, force: true }); }
});

test('a model launch failure is saved as an unpainted target and returns failure without a retry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-failure-'));
  let raw;
  try {
    const source = `import {runPipeline} from ${JSON.stringify(new URL('./pipeline/round45.mjs', import.meta.url).href)};
import {ROUNDS} from ${JSON.stringify(new URL('./lib.mjs', import.meta.url).href)};
import {benchmarkProfile} from ${JSON.stringify(new URL('./profiles.mjs', import.meta.url).href)};
await runPipeline({round:ROUNDS.find(r=>r.id==='V4'),model:{key:'fixture',name:'Fixture',id:'offline',effort:'n/a',runner:'invalid'},tries:1,crops:['hills'],dry:false,outRoot:process.argv[1],force:false,gpu:'off',profile:benchmarkProfile('lite')});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, root], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1, result.stderr);
    const r = readJson(path.join(root, 'v4-pipeline', 'fixture', '1', 'run.json')); raw = path.join(BENCH, r.raw);
    assert.equal(r.complete, false); assert.deepEqual(Object.keys(r.crops), []);
    assert.equal(r.unpainted.hills.pipeline.outcome, 'harness-error'); assert.equal(r.session.tokens, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); if (raw) fs.rmSync(raw, { recursive: true, force: true }); }
});

test('the routine suite fixes five targets and six models; all remains opt-in', () => {
  const plan = suitePlan();
  assert.equal(plan.targets.length, 5); assert.equal(plan.models.length, 6);
  assert.equal(plan.profile.id, 'lite-v1');
  assert.ok(suitePlan({ selection: 'all' }).models.length > 6);
});

test('the run CLI preserves failure status after a model exits without delivering a plan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-no-plan-'));
  let raw;
  try {
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    const cli = path.join(bin, 'claude'); fs.writeFileSync(cli, `#!${process.execPath}\nprocess.exit(0);\n`); fs.chmodSync(cli, 0o755);
    const result = spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'run.mjs'), '--round', 'V4', '--model', 'opus', '--crops', 'hills', '--out', root, '--gpu', 'off'],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } });
    assert.equal(result.status, 1, result.stderr);
    const r = readJson(path.join(root, 'v4-pipeline', 'opus', '1', 'run.json')); raw = path.join(BENCH, r.raw);
    assert.equal(r.complete, false); assert.equal(r.unpainted.hills.pipeline.outcome, 'no-plan');
  } finally { fs.rmSync(root, { recursive: true, force: true }); if (raw) fs.rmSync(raw, { recursive: true, force: true }); }
});

test('scoring caches exact inputs, but missing progression stages and failed judges cannot complete a lite try', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-score-'));
  try {
    const source = structuredClone(loadRuns().find(e => e.run.round === 'V4' && e.run.crops.hills).run);
    const crop = source.crops.hills;
    Object.assign(source, { judgeVersion: 'J2', judgeProfile: 'J2-lite', judgeRoute: 'together', complete: true,
      crops: { hills: { ...crop, score: null, progression: null } }, unpainted: {},
      settings: { ...source.settings, crops: ['hills'], benchmarkProfile: 'lite-v1', budget: benchmarkProfile('lite'), judgeProfile: 'J2-lite', judgeRoute: 'together' } });
    const dir = path.join(root, 'try'), raw = path.join(root, 'raw'), frames = path.join(raw, 'out', 'hills', 'frames');
    fs.mkdirSync(frames, { recursive: true });
    fs.copyFileSync(path.join(BENCH, 'v2', 'targets', 'hills.png'), path.join(raw, 'out', 'hills', 'final.png'));
    for (const p of [10, 25, 50, 75, 100]) await sharp(path.join(BENCH, 'v2', 'targets', 'hills.png')).png().toFile(path.join(frames, `stage-${p}.png`));
    writeJson(path.join(dir, 'run.json'), source);
    const python = path.join(root, 'python'), calls = path.join(root, 'calls');
    fs.writeFileSync(python, `#!${process.execPath}
const fs=require('fs'),path=require('path'),a=process.argv.slice(2),s=path.basename(a[0]);
if(s==='-c')process.exit(0);
fs.appendFileSync(process.env.TEST_CALLS,s+'\\n');
if(s==='score_painting.py'){
const n={lite:1,standard:3,full:5}[a[a.indexOf('--profile')+1]]||5,j=['moonshotai/Kimi-K3','zai-org/GLM-5.3-Flash','Qwen/Qwen3.5-9B'];
console.log(JSON.stringify({complete:!process.env.TEST_FINAL_FAIL,composite:process.env.TEST_FINAL_FAIL?null:7,judgeVersion:'J2',judgeProfile:'J2-'+({1:'lite',3:'standard',5:'full'}[n]),judgeRoute:process.env.JUDGE_ROUTE,judgeScores:Object.fromEntries(j.map(m=>[m,7])),callCounts:Object.fromEntries(j.map(m=>[m,n])),callsPerModel:n,sampling:{judges:j,requiredValidCallsPerJudge:n,requestedCallsPerJudge:n}}));
}else if(s==='progression.py'){
const j=process.env.BENCH_PROG_JUDGES,p={judgesN:1,judges:[j],stages:{10:4,25:4,50:4,75:4,100:4},earlyMean:4,mean:4,humanOrderVotes:1,judgeNotes:{[j]:'fixture'}};
if(process.env.TEST_STAGE_FAIL&&j.startsWith('Qwen'))delete p.stages[50];
console.log(JSON.stringify(p));
}else console.log(JSON.stringify({copyHF:0}));
`);
    fs.chmodSync(python, 0o755);
    const run = (args = [], env = {}) => spawnSync(process.execPath, [path.join(BENCH, 'scripts', 'score.mjs'), dir, '--raw', raw, '--python', python, ...args],
      { encoding: 'utf8', env: { ...process.env, TOGETHER_API_KEY: 'offline-fixture', JUDGE_ROUTE: 'together', TEST_CALLS: calls, ...env } });
    let r = run(); assert.equal(r.status, 0, r.stderr); assert.equal(readJson(path.join(dir, 'run.json')).score.complete, true);
    r = run(); assert.equal(r.status, 0, r.stderr);
    let log = fs.readFileSync(calls, 'utf8');
    assert.equal(log.split('score_painting.py').length - 1, 1, 'cached finals do not call judges again');
    assert.equal(log.split('progression.py').length - 1, 2, 'both progression responses are cached');
    r = run(['--force'], { TEST_STAGE_FAIL: '1' }); assert.equal(r.status, 1, r.stderr);
    let saved = readJson(path.join(dir, 'run.json'));
    assert.equal(saved.score.complete, false); assert.equal(saved.score.composite, null); assert.equal(saved.crops.hills.progression.earlyMean, null);
    r = run(['--composite-only']); assert.equal(r.status, 1, r.stderr);
    r = run(['--force'], { TEST_FINAL_FAIL: '1' }); assert.equal(r.status, 1, r.stderr);
    saved = readJson(path.join(dir, 'run.json')); assert.equal(saved.score.complete, false);
    fs.rmSync(path.join(raw, 'out', 'hills', 'final.png'));
    r = run(); assert.equal(r.status, 1, r.stderr);
    assert.equal(readJson(path.join(dir, 'run.json')).crops.hills.score, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('lite results retain the planned denominator and do not rank a partial success', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-results-'));
  try {
    const r = structuredClone(loadRuns().find(e => e.run.round === 'V4' && e.run.crops.hills).run);
    const targets = suitePlan().targets;
    Object.assign(r, { try: 1, judgeVersion: 'J2', judgeProfile: 'J2-lite', judgeRoute: 'together', complete: false,
      crops: { hills: r.crops.hills }, unpainted: Object.fromEntries(targets.filter(c => c !== 'hills').map(c => [c, { pipeline: { outcome: 'no-plan' } }])),
      settings: { ...r.settings, crops: targets, benchmarkProfile: 'lite-v1', budget: benchmarkProfile('lite') }, score: { ...r.score, complete: false } });
    writeJson(path.join(root, 'runs', 'run.json'), r);
    const out = path.join(root, 'results.json');
    execFileSync(process.execPath, [path.join(BENCH, 'scripts', 'build-results.mjs'), '--runs', path.join(root, 'runs'), '--out', out], { stdio: 'pipe' });
    const v4 = readJson(out).rounds.find(r => r.id === 'V4'), m = v4.models[0];
    assert.equal(v4.plannedTries, 1); assert.equal(m.completion.plannedPaintings, 5); assert.equal(m.completion.scoredPaintings, 1);
    assert.equal(m.mean, null); assert.equal(m.indexed.mean, null); assert.equal(m.best, null); assert.equal(m.scoredTries, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('--plan is offline and describes the exact job allocation; invalid options fail before model use', () => {
  const script = path.join(BENCH, 'scripts', 'suite.mjs');
  const plan = JSON.parse(execFileSync(process.execPath, [script, '--plan'], { encoding: 'utf8' }));
  assert.equal(plan.estimate.lite.paintings, 30);
  for (const args of [['--unknown'], ['--models'], ['--models', 'missing', '--plan']]) {
    assert.notEqual(spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status, 0);
  }
});
