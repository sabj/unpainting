// V3, V4 and V5: the plan checks, the brief, the model commands, and a dry run of each round end to end (a scripted
// stand-in instead of a model, a small painting on the CPU, no keys).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, ROUNDS, validateRun, readJson } from './lib.mjs';
import { argsBuilder, layerBase, checkExtraArgs, unknownTokens, checkPlanLimits, renderVerdict, optionMap } from './pipeline/plan-args.mjs';
import { tokensMarkdown } from './pipeline/tokens.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';
import { turnCommand } from './runners.mjs';

const build = argsBuilder({ planDir: '/p', target: '/t.png', width: 600, sheetmm: 140, targetPixels: [300, 240] });

test('a model token replaces the base token in its slot; architecture and palette tokens stay off elsewhere', () => {
  const l = layerBase({ variant: 'region_w13_lay2', build });
  assert.equal(optionMap(l.args).get('midlayers'), '2');
  assert.equal(l.skipped.lay4, 'plan chose lay2');
  assert.equal(l.skipped.blk60, 'architecture only');
  assert.equal(l.skipped.pgreen, 'Trumbull only');
  assert.ok(l.applied.includes('dk13') && optionMap(l.args).get('darkgain') === '1.3');
  const t = layerBase({ variant: 'region_w13', build: argsBuilder({ planDir: '/p', target: '/t.png', width: 600, sheetmm: 140, trumbull: true }), architecture: true, trumbull: true });
  assert.ok(t.applied.includes('blk60') && t.applied.includes('pgreen'));
  assert.match(optionMap(t.args).get('paints'), /sapgreen/);
});

test('refusals before painting: unknown tokens, locked options, paths out of the plan folder, plan limits', () => {
  assert.deepEqual(unknownTokens('region_w13_lay2_bogus', build), ['bogus']);
  assert.deepEqual(unknownTokens('region_w13_pwarm', build), ['pwarm']);
  assert.match(unknownTokens('region_w9_lay2', build)[0], /prefix/);
  assert.equal(checkExtraArgs(['--darkgain', '1.1'], '/p').length, 0);
  assert.match(checkExtraArgs(['--targetguard', 'off'], '/p')[0], /may not set --targetguard/);
  assert.match(checkExtraArgs(['--focusmap', '../x.json'], '/p')[0], /leaves the plan folder/);
  const bad = checkPlanLimits({ families: [{ id: 'f', bounds: [0, 0, 0.001, 1] }], reserves: [{ bounds: [0, 0, 0.5, 0.5] }] }, 140, {}, [300, 240]);
  assert.equal(bad.length, 2);
});

test('strict verdict: a setting the plan chose that nothing read fails the painting; an unread base setting does not', () => {
  assert.equal(renderVerdict({ paintExit: 3, unused: ['--foliagerefit'], baseOptions: ['foliagerefit'], strict: true }).exit, 0);
  const v = renderVerdict({ paintExit: 3, unused: ['--stonewarm'], extraOptions: ['stonewarm'], strict: true });
  assert.equal(v.exit, 4);
  assert.match(v.failures[0].reason, /read by nothing: --stonewarm/);
  assert.equal(renderVerdict({ paintExit: 0, dropped: 2, droppedPct: 1.5, strict: true }).exit, 5);
});

test('TOKENS.md is generated from plan-args.mjs', () => {
  assert.equal(fs.readFileSync(path.join(BENCH, 'v4v5', 'TOKENS.md'), 'utf8'), tokensMarkdown());
});

test('the V4 and V5 briefs fill every field and name nothing private', () => {
  const subjects = loadSubjects();
  for (const round of ROUNDS.filter(r => ['V4', 'V5'].includes(r.id))) for (const n of [1, 2]) for (const crop of Object.keys(subjects)) for (const strictVerdict of [false, true]) {
    const t = renderTask({ round, n, tries: 3, spec: subjects[crop], strictVerdict });
    assert.doesNotMatch(t, /\{[A-Z_]+\}/, `${round.id} try ${n} ${crop}`);
    assert.match(t, strictVerdict ? /An option nothing reads\s+fails the painting/ : /the painting still counts/);
    assert.doesNotMatch(t, /\/Users\/|cloud GPU|V096|owner/i);
  }
  for (const dir of ['v3', 'v4v5']) for (const f of fs.readdirSync(path.join(BENCH, dir), { recursive: true })) {
    const p = path.join(BENCH, dir, f);
    if (fs.statSync(p).isFile() && /\.(md|json|sh|mjs)$/.test(f)) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /\/Users\/|\/private\/tmp/i, p);
  }
});

test('later turns resume the same session', () => {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-'));
  const claude = { key: 'opus', id: 'claude-opus-5-5', effort: 'xhigh', runner: 'claude' }, codex = { key: 'sol', id: 'gpt-6.1-sol', effort: 'xhigh', runner: 'codex' };
  const c1 = turnCommand(claude, { ws: '/ws', raw, text: 'go', sessionId: 'S' });
  assert.ok(c1.args.includes('--session-id') && c1.stdinFile);
  const c2 = turnCommand(claude, { ws: '/ws', raw, text: 'again', sessionId: 'S', resume: true });
  assert.deepEqual(c2.args.slice(c2.args.indexOf('--resume'), c2.args.indexOf('--resume') + 2), ['--resume', 'S']);
  const x2 = turnCommand(codex, { ws: '/ws', raw, text: 'again', sessionId: 'T', resume: true, images: ['/a.png'] });
  assert.deepEqual(x2.args.slice(x2.args.indexOf('resume'), x2.args.indexOf('resume') + 3), ['resume', 'T', 'again']);
  fs.rmSync(raw, { recursive: true, force: true });
});

const dryRun = (round, extra) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `dry-${round}-`));
  execFileSync(process.execPath, [path.join(BENCH, 'scripts', 'run.mjs'), '--dry-run', '--round', round, '--crops', 'hills', '--out', out, ...extra], { stdio: ['ignore', 'ignore', 'pipe'] });
  return out;
};
const runOf = (out, dir, n) => readJson(path.join(out, dir, 'dry-run', String(n), 'run.json'));

test('dry run: V3 paints two attempts in one session; the second carries its change note', () => {
  const out = dryRun('V3', ['--tries', '2']);
  for (const n of [1, 2]) { const r = runOf(out, 'v3-informed', n); assert.deepEqual(validateRun(r), []); assert.ok(r.complete); }
  assert.match(runOf(out, 'v3-informed', 2).crops.hills.painterNote, /attempt 2/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('dry run: V4 plans, is refused once, paints with stops, looks, revises and finishes', () => {
  const out = dryRun('V4', ['--tries', '1']);
  const r = runOf(out, 'v4-pipeline', 1), p = r.crops.hills.pipeline;
  assert.deepEqual(validateRun(r), []);
  assert.equal(p.outcome, 'painted');
  assert.equal(p.paintedBy, 'the model');
  assert.ok(p.looks >= 2 && p.revisions === 1 && p.segments === 2);
  assert.deepEqual(p.optionCheck.model, []);
  const ck = fs.readFileSync(path.join(out, 'v4-pipeline', 'dry-run', '1', 'hills-plan', 'CHECKPOINTS.jsonl'), 'utf8');
  assert.match(ck, /start-refused/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('dry run: V5 try 2 gets feedback on try 1 and writes its self-review', () => {
  const out = dryRun('V5', ['--tries', '2']);
  const r = runOf(out, 'v5-self-study', 2), p = r.crops.hills.pipeline;
  assert.deepEqual(validateRun(r), []);
  assert.equal(p.feedback, 'hills-plan/FEEDBACK.md');
  assert.equal(p.selfReview, 'hills-plan/SELF-REVIEW.md');
  const dir = path.join(out, 'v5-self-study', 'dry-run', '2', 'hills-plan');
  assert.match(fs.readFileSync(path.join(dir, 'FEEDBACK.md'), 'utf8'), /previous try \(try 1\)/);
  assert.equal(runOf(out, 'v5-self-study', 1).score.status, 'dry-run');
  fs.rmSync(out, { recursive: true, force: true });
});
