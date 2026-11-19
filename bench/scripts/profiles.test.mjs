import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkProfile, profileForRound, profileSubject, selectModels, CORE_MODELS } from './profiles.mjs';
import { loadModels } from './lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaintSession } from './pipeline/session.mjs';
import { runTurn } from './pipeline/harness.mjs';

test('routine V4 is lite; other rounds keep full; lite cannot masquerade as a V5 learning run', () => {
  assert.equal(profileForRound('V4').id, 'lite-v2');
  assert.equal(profileForRound('V5').id, 'full-v2');
  assert.throws(() => profileForRound('V5', 'lite'), /V4 planning screen/);
  assert.throws(() => benchmarkProfile('cheap'), /unknown/);
});
test('both profiles paint a subject at its own width; lite changes recording and budgets, never the density', () => {
  const source = { width: 300, sheetmm: 77.7, taskStyle: 'ink and wash' };
  assert.deepEqual(profileSubject(source, benchmarkProfile('lite')), { ...source, benchmarkProfile: 'lite-v2', recordingMarks: 0, planOnly: true, renderTimeoutMs: 600000, checkTimeoutMs: 120000 });
  assert.equal(profileSubject(source, benchmarkProfile('full')).width, 300);
  assert.equal(benchmarkProfile('lite').width, null, 'lite-v1 capped at 540, over every crop: lite-v2 has no cap');
  assert.equal(source.width, 300);
});
test('a profile cap or a dry width lowers a subject width and never raises it', () => {
  const source = { width: 300, sheetmm: 77.7 }, lite = benchmarkProfile('lite');
  assert.equal(profileSubject(source, { ...lite, width: 160 }).width, 160);
  assert.equal(profileSubject(source, { ...lite, width: 540 }).width, 300);
  assert.equal(profileSubject(source, lite, 96).width, 96);
  assert.equal(profileSubject(source, lite, 1200).width, 300);
  assert.equal(profileSubject(source, { ...lite, width: 160 }, 96).width, 96);
});
test('core default retains the complete registry and optional Muse selection', () => {
  const models = loadModels(), before = models.length;
  assert.deepEqual(selectModels(models).map(m => m.key), CORE_MODELS);
  assert.equal(selectModels(models, 'all').length, before);
  assert.equal(selectModels(models, 'core,wonderfull,spark').length, 8);
  assert.throws(() => selectModels(models, 'core,missing'), /unknown model/);
});

test('lite start cannot create a renderer while the model is alive; the model clock freezes on exit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-session-'));
  try {
    const session = new PaintSession({ repo: root, ws: root, raw: path.join(root, 'raw'), spec: {}, target: '', modelMinutes: 5, planOnly: true });
    session.t0 -= 30;
    session.handle('1', { cmd: 'start', args: [] });
    assert.equal(session.started, false); assert.equal(session.painting, null); assert.equal(session.planReady, true);
    session.end('model exited');
    const used = session.modelS();
    session.t0 -= 120;
    assert.equal(session.modelS(), used, 'renderer time must not become model time');
    session.reopen();
    assert.ok(session.modelS() >= used, 'a repair cannot reset the total model budget');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('wall watchdog terminates a local model process that ignores SIGTERM', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-watchdog-'));
  try {
    const r = await runTurn({ cmd: process.execPath, args: ['-e', "process.on('SIGTERM',()=>{}); setInterval(()=>{},100);"] },
      { cwd: root, events: path.join(root, 'events'), stderr: path.join(root, 'stderr'), capMs: 150, killGraceMs: 50 });
    assert.equal(r.killed, true); assert.equal(r.reason, 'the wall-clock limit'); assert.ok(r.seconds < 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('lite waits for descendant cleanup even after a normal model CLI exit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-descendant-'));
  try {
    const descendant = "const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync('ready','1');setTimeout(()=>fs.writeFileSync('late','1'),500);setInterval(()=>{},100);";
    const parent = `const fs=require('fs');require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});const t=setInterval(()=>{if(fs.existsSync('ready')){clearInterval(t);process.exit(0)}},10);`;
    const r = await runTurn({ cmd: process.execPath, args: ['-e', parent] },
      { cwd: root, events: path.join(root, 'events'), stderr: path.join(root, 'stderr'), capMs: 3000, killGraceMs: 50, cleanupGroup: true });
    assert.equal(r.killed, false); assert.equal(r.code, 0); assert.ok(r.cleanupSeconds >= .04);
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(fs.existsSync(path.join(root, 'late')), false, 'a tool cannot continue during the renderer phase');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
