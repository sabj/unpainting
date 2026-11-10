// Rerender is resumable: a finished job at the same commit is skipped, and a crash loses at most one job.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runRerender,renderStamp,jobFingerprint,discoverStoredPlans,parseRerenderArgs } from './rerender.mjs';
import {execFileSync} from 'node:child_process';
import { fakePainter } from './rerender-fixtures.mjs';

const doctor = () => ({ ok: true, failures: [] });
const verify = () => {};
const fs_ = commit => () => ({ release: '0.3.1', painterVersion: 'V103', simVersion: '104', commit, dirtyHash: null });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rerender-resume-'));
const base = out => ['--models', 'opus', '--tries', '1', '--subjects', 'hills,mittens', '--out', out];
const go = (out, painter, stamp = 'aaaaaaa', extra = []) => runRerender([...base(out), ...extra], { run: painter.run, verify, doctor, stamp: fs_(stamp) });

test('a second run at the same commit skips finished jobs and keeps full-resolution finals and every stage frame', async () => {
  const out = tmp();
  try {
    const p = await fakePainter();
    const first = await go(out, p);
    assert.equal(first.ok, true);
    assert.equal(p.calls.length, 2);
    const raw = path.join(out, 'v4-pipeline', 'opus', '1', 'hills-raw');
    assert.ok(fs.existsSync(path.join(raw, 'painting.png')));
    for (const s of [10, 25, 50, 75, 100]) assert.ok(fs.existsSync(path.join(raw, 'frames', `stage-${s}.png`)), `frame ${s}`);
    assert.ok(fs.existsSync(path.join(raw, 'stages', 'stage-010.jpg')));
    assert.ok(fs.existsSync(path.join(out, 'v4-pipeline', 'opus', '1', 'hills-job.json')));
    const again = await go(out, p);
    assert.equal(p.calls.length, 2, 'no new render');
    assert.equal(again.ok, true);
    assert.deepEqual(again.results.map(r => r.skipped), [true, true]);
    assert.equal(again.results[0].ok, true);
    const summary = JSON.parse(fs.readFileSync(again.summaryPath, 'utf8'));
    assert.equal(summary.okCount, 2);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('a different commit, a failed job, a missing file, or --force renders again', async () => {
  const out = tmp();
  try {
    const p = await fakePainter();
    await go(out, p);
    await go(out, p, 'bbbbbbb');
    assert.equal(p.calls.length, 4, 'new commit re-renders');
    fs.rmSync(path.join(out, 'v4-pipeline', 'opus', '1', 'hills-raw', 'frames', 'stage-50.png'));
    await go(out, p, 'bbbbbbb');
    assert.equal(p.calls.length, 5, 'only the job with a missing frame re-renders');
    await go(out, p, 'bbbbbbb', ['--force']);
    assert.equal(p.calls.length, 7);
    const bad = await fakePainter({ failFor: 'mittens' });
    const fail = tmp();
    try {
      const r1 = await go(fail, bad);
      assert.equal(r1.ok, false);
      await go(fail, bad);
      assert.equal(bad.calls.filter(c => c.includes('mittens')).length, 2, 'failed job retried');
      assert.equal(bad.calls.filter(c => c.includes('hills')).length, 1, 'finished job not retried');
    } finally { fs.rmSync(fail, { recursive: true, force: true }); }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('a crash in one job loses only that job: the summary and the other record are on disk', async () => {
  const out = tmp();
  try {
    const crashy = await fakePainter({ throwFor: 'mittens' });
    const r1 = await go(out, crashy);
    assert.equal(r1.ok, false);
    const summary = JSON.parse(fs.readFileSync(r1.summaryPath, 'utf8'));
    assert.equal(summary.results.find(r => r.subject === 'hills').ok, true);
    assert.equal(summary.results.find(r => r.subject === 'mittens').ok, false);
    assert.match(summary.results.find(r => r.subject === 'mittens').problems.join(' '), /simulated crash/);
    const healthy = await fakePainter();
    const r2 = await go(out, healthy);
    assert.equal(r2.ok, true);
    assert.deepEqual(healthy.calls.map(c => path.basename(c)), ['mittens-raw']);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('the summary is written after every job, so a killed process still leaves the finished jobs', async () => {
  const out = tmp();
  try {
    const p = await fakePainter();
    let seenAfterFirst = null;
    const run = (exe, args) => {
      if (p.calls.length === 1) seenAfterFirst = JSON.parse(fs.readFileSync(path.join(out, 'rerender-summary.json'), 'utf8'));
      return p.run(exe, args);
    };
    await runRerender(base(out), { run, verify, doctor, stamp: fs_('aaaaaaa') });
    assert.equal(seenAfterFirst.okCount, 1);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('--dry-run reports which jobs are already done', async () => {
  const out = tmp();
  try {
    const p = await fakePainter();
    await go(out, p);
    const r = await runRerender([...base(out), '--dry-run'], { stamp: fs_('aaaaaaa') });
    assert.deepEqual(r.jobs.map(j => j.done), [true, true]);
    const r2 = await runRerender([...base(out), '--dry-run'], { stamp: fs_('ccccccc') });
    assert.deepEqual(r2.jobs.map(j => j.done), [false, false]);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('resume invalidates changed segmentation and rechecks the evidence gates',async()=>{
 const out=tmp();
 try{
  const p=await fakePainter();await go(out,p);
  await go(out,p,'aaaaaaa',['--segments','off']);
  assert.equal(p.calls.length,4,'a different segmentation route is a new render');
  const reject=()=>{throw Error('invalid current evidence');};
  await runRerender([...base(out),'--segments','off'],{run:p.run,verify:reject,doctor,stamp:fs_('aaaaaaa')});
  assert.equal(p.calls.length,6,'existing evidence is checked again before reuse');
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});

test('untracked source helpers change the render stamp when their contents change',()=>{
 const root=tmp();
 try{
  const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});
  git('init');fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.3.1'}));
  git('add','package.json');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
  fs.mkdirSync(path.join(root,'src'));const file=path.join(root,'src','helper.mjs');fs.writeFileSync(file,'export const value=1;');
  const first=renderStamp(root);fs.writeFileSync(file,'export const value=2;');const second=renderStamp(root);
  assert.notEqual(first.dirtyHash,second.dirtyHash);assert.match(first.commit,/-dirty$/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an input or code change during a job fails that job and the next job captures its own stamp',async()=>{
 const out=tmp();
 try{
  const p=await fakePainter();let commit='before',input='before';
  const run=(exe,args)=>{const result=p.run(exe,args);if(p.calls.length===1){commit='after';input='after';}return result;};
  const r=await runRerender(base(out),{run,verify,doctor,stamp:()=>fs_(commit)(),fingerprint:()=>input});
  assert.equal(r.results[0].ok,false);assert.match(r.results[0].problems.join(' '),/changed while/);
  assert.equal(r.results[1].ok,true);
  const record=subject=>JSON.parse(fs.readFileSync(path.join(out,'v4-pipeline','opus','1',`${subject}-job.json`)));
  assert.equal(record('hills').stamp.commit,'before');assert.equal(record('hills').inputFingerprint,'before');
  assert.equal(record('mittens').stamp.commit,'after');assert.equal(record('mittens').inputFingerprint,'after');
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});

test('plan fingerprints refuse symlink inputs rather than ignoring their contents',()=>{
 const out=tmp();
 try{
  const opts=parseRerenderArgs(base(out)),job=discoverStoredPlans(opts)[0],planDir=path.join(out,'plan');
  fs.cpSync(job.planDir,planDir,{recursive:true});
  const linked=path.join(out,'linked-lines.json');fs.writeFileSync(linked,'[]');fs.symlinkSync(linked,path.join(planDir,'linked-lines.json'));
  assert.throws(()=>jobFingerprint(opts,{...job,planDir}),/symlink plan input/);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
